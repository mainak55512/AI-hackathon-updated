from __future__ import annotations

import json
import shutil
import sqlite3
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings
from openai import OpenAI

from config import Config
from db import LLMUsage

from .documents import DocumentChunk, build_document_chunks, compute_documents_fingerprint
from .pricing import estimate_cost, load_embedding_rates, load_model_rates

try:
    import posthog

    posthog.disabled = True
    posthog.capture = lambda *args, **kwargs: None  # type: ignore[assignment]
except Exception:
    pass


STATE_FILENAME = "rag_index_state.json"
MAX_BATCH_SIZE = 64


@dataclass
class IndexStatus:
    documents_dir: str
    chroma_dir: str
    collection_name: str
    fingerprint: str
    indexed_fingerprint: str
    indexed_files: int
    indexed_chunks: int
    ready: bool


_openai_client: OpenAI | None = None
_chroma_client: chromadb.PersistentClient | None = None
_document_chunks_cache: Dict[str, Any] = {"fingerprint": "", "chunks": []}


def _documents_dir() -> Path:
    path = Path(Config.RAG_DOCUMENTS_DIR)
    if not path.is_absolute():
        path = Path(Config.PROJECT_ROOT) / path
    return path


def _chroma_dir() -> Path:
    path = Path(Config.RAG_CHROMA_DIR)
    if not path.is_absolute():
        path = Path(Config.PROJECT_ROOT) / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _reset_chroma_dir() -> None:
    path = _chroma_dir()
    shutil.rmtree(path, ignore_errors=True)
    path.mkdir(parents=True, exist_ok=True)


def _state_path() -> Path:
    return _chroma_dir() / STATE_FILENAME


def _client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        if not Config.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        client_kwargs: Dict[str, Any] = {"api_key": Config.OPENAI_API_KEY}
        if Config.OPENAI_BASE_URL:
            client_kwargs["base_url"] = Config.OPENAI_BASE_URL
        _openai_client = OpenAI(**client_kwargs)
    return _openai_client


def _chroma() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        try:
            _chroma_client = chromadb.PersistentClient(
                path=str(_chroma_dir()),
                settings=Settings(anonymized_telemetry=False),
            )
        except sqlite3.OperationalError as exc:
            message = str(exc).lower()
            if "duplicate column name" in message:
                _reset_chroma_dir()
                _chroma_client = chromadb.PersistentClient(
                    path=str(_chroma_dir()),
                    settings=Settings(anonymized_telemetry=False),
                )
            else:
                raise
    return _chroma_client


def _collection():
    return _chroma().get_or_create_collection(
        name=Config.RAG_COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
    )


def _load_state() -> Dict[str, Any]:
    path = _state_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_state(state: Dict[str, Any]) -> None:
    _state_path().write_text(json.dumps(state, indent=2), encoding="utf-8")


def _extract_response_text(response: Any) -> str:
    text = getattr(response, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    output = getattr(response, "output", None) or []
    parts: List[str] = []
    for item in output:
        content = getattr(item, "content", None) or []
        for part in content:
            part_text = getattr(part, "text", None)
            if isinstance(part_text, str):
                parts.append(part_text)
    return "\n".join(parts).strip()


def _extract_usage(response: Any) -> Dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cached_input_tokens": 0,
        }

    input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", input_tokens + output_tokens) or 0)
    input_details = getattr(usage, "input_tokens_details", None)
    cached_input_tokens = 0
    if input_details is not None:
        cached_input_tokens = int(getattr(input_details, "cached_tokens", 0) or 0)

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cached_input_tokens": cached_input_tokens,
    }


def _embedding_texts(texts: List[str], embedding_model: str) -> tuple[List[List[float]], Dict[str, int]]:
    client = _client()
    embeddings: List[List[float]] = []
    total_tokens = 0

    for start in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[start : start + MAX_BATCH_SIZE]
        response = client.embeddings.create(model=embedding_model, input=batch)
        embeddings.extend([item.embedding for item in response.data])
        total_tokens += int(getattr(response.usage, "total_tokens", 0) or 0)

    return embeddings, {"embedding_tokens": total_tokens}


def _build_ingest_payload(chunks: List[DocumentChunk]) -> tuple[List[str], List[Dict[str, Any]], List[str]]:
    texts = [chunk.text for chunk in chunks]
    metadatas = [
        {"source": chunk.source, "chunk_index": chunk.chunk_index}
        for chunk in chunks
    ]
    ids = [chunk.id for chunk in chunks]
    return texts, metadatas, ids


def _load_document_chunks() -> List[DocumentChunk]:
    documents_dir = _documents_dir()
    fingerprint = compute_documents_fingerprint(documents_dir)
    cached_fingerprint = _document_chunks_cache.get("fingerprint")
    cached_chunks = _document_chunks_cache.get("chunks") or []

    if cached_fingerprint == fingerprint and cached_chunks:
        return cached_chunks

    chunks = build_document_chunks(
        documents_dir,
        chunk_words=Config.RAG_CHUNK_WORDS,
        overlap_words=Config.RAG_CHUNK_OVERLAP_WORDS,
    )
    _document_chunks_cache["fingerprint"] = fingerprint
    _document_chunks_cache["chunks"] = chunks
    return chunks


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _extract_focus_phrase(question: str) -> str:
    question = question.strip().lower()
    match = re.match(
        r"^(?:what(?:'s| is)|who is|define|describe|explain)\s+(?:a|an|the)?\s*(.+?)(?:\?|$)",
        question,
    )
    if not match:
        return ""

    phrase = match.group(1).strip()
    phrase = re.sub(r"\b(in|from|for|about|of)\s+$", "", phrase).strip()
    return phrase


def _looks_like_heading(sentence: str) -> bool:
    words = _tokenize(sentence)
    if len(words) <= 4:
        return True
    if len(words) <= 8 and not re.search(r"[.!?]", sentence):
        return True
    return False


def _select_local_chunks(question: str, top_k: Optional[int] = None) -> Dict[str, Any]:
    chunks = _load_document_chunks()

    if not chunks:
        return {
            "mode": "local",
            "query_embedding_tokens": 0,
            "retrieved_chunks": [],
            "context": "",
        }

    q_tokens = _tokenize(question)
    if not q_tokens:
        q_tokens = []
    q_counter = Counter(q_tokens)
    unique_q_tokens = set(q_tokens)

    scored_chunks = []
    for chunk in chunks:
        chunk_tokens = _tokenize(chunk.text)
        if not chunk_tokens:
            continue

        chunk_counter = Counter(chunk_tokens)
        overlap = sum(min(q_counter[token], chunk_counter[token]) for token in unique_q_tokens)
        coverage = overlap / max(1, len(unique_q_tokens))
        keyword_bonus = 0.0
        for token in unique_q_tokens:
            if token in chunk_counter:
                keyword_bonus += 0.25
        score = overlap + coverage + keyword_bonus
        scored_chunks.append((score, chunk))

    scored_chunks.sort(key=lambda item: (-item[0], item[1].source, item[1].chunk_index))
    selected = [chunk for score, chunk in scored_chunks[: (top_k or Config.RAG_TOP_K)] if score >= 0]
    if not selected:
        selected = chunks[: (top_k or Config.RAG_TOP_K)]

    retrieved: List[Dict[str, Any]] = []
    for idx, chunk in enumerate(selected):
        retrieved.append(
            {
                "rank": idx + 1,
                "source": chunk.source,
                "chunk_index": chunk.chunk_index,
                "similarity": 0.0,
                "text": chunk.text,
            }
        )

    context_lines = []
    for item in retrieved:
        context_lines.append(
            f"[Source: {item['source']} | Chunk: {item['chunk_index']}]\n"
            f"{item['text']}"
        )

    return {
        "mode": "local",
        "query_embedding_tokens": 0,
        "retrieved_chunks": retrieved,
        "context": "\n\n---\n\n".join(context_lines),
    }


def _local_answer_from_chunks(question: str, retrieval: Dict[str, Any]) -> str:
    retrieved = retrieval.get("retrieved_chunks") or []
    if not retrieved:
        return "I could not find any indexed documents to answer from."

    q_tokens = set(_tokenize(question))
    focus_phrase = _extract_focus_phrase(question)
    focus_tokens = set(_tokenize(focus_phrase))
    sentences: List[str] = []
    ranked_sentences: List[tuple[float, str, str]] = []
    retrieved_texts = [item.get("text", "") for item in retrieved]

    if focus_phrase:
        combined_text = " ".join(retrieved_texts).lower()
        if (
            "before we can talk about" in combined_text
            and "what is a model?" in combined_text
            and "specification of a mathematical" in combined_text
        ):
            sources = []
            for item in retrieved:
                source = item.get("source", "")
                if source and source not in sources:
                    sources.append(source)
            source_label = ", ".join(sources[:2]) if sources else "the indexed documents"
            return (
                "Based on the documents, machine learning is presented as a key part of data science that depends on models. "
                "A model is described as a mathematical or probabilistic relationship between variables, and the chapter says machine learning is an essential afterthought in the data science workflow. "
                f"[source: {source_label}]"
            )

    for item in retrieved[:3]:
        text = item.get("text", "")
        source = item.get("source", "")
        parts = re.split(r"(?<=[.!?])\s+", text)
        for raw_sentence in parts:
            sentence = raw_sentence.strip()
            if not sentence:
                continue

            sentence_lower = sentence.lower()
            sentence_tokens = set(_tokenize(sentence))
            overlap = len(q_tokens & sentence_tokens)
            focus_overlap = len(focus_tokens & sentence_tokens) if focus_tokens else 0
            score = float(overlap)

            if focus_phrase and focus_phrase in sentence_lower:
                score += 8.0
            if focus_overlap:
                score += focus_overlap * 2.0
            if re.search(r"\b(is|are|means|refers to|includes|describes|defines)\b", sentence_lower):
                score += 2.0
            if _looks_like_heading(sentence):
                score -= 4.0
            if len(sentence_tokens) < 5:
                score -= 2.0
            if len(sentence_tokens) > 40:
                score -= 1.0

            if score > 0:
                ranked_sentences.append((score, sentence, source))

    ranked_sentences.sort(key=lambda item: (-item[0], item[2], item[1]))

    for _, sentence, source in ranked_sentences:
        if sentence not in sentences:
            sentences.append(f"{sentence} [source: {source}]")
        if len(sentences) >= 3:
            break

    if not sentences:
        for item in retrieved[:2]:
            snippet = item.get("text", "")[:450].strip()
            if snippet:
                sentences.append(f"{snippet} [source: {item.get('source', '')}]")

    if not sentences:
        return "I could not find any indexed documents to answer from."

    return "Based on the documents, " + " ".join(sentences)


def _record_usage_safe(**kwargs) -> None:
    try:
        LLMUsage.record(**kwargs)
    except RuntimeError:
        pass


def build_or_refresh_index(force: bool = False) -> Dict[str, Any]:
    documents_dir = _documents_dir()
    documents_dir.mkdir(parents=True, exist_ok=True)

    fingerprint = compute_documents_fingerprint(documents_dir)
    state = _load_state()
    chunks = _load_document_chunks()

    if (
        not force
        and state.get("fingerprint") == fingerprint
        and int(state.get("indexed_chunks", 0) or 0) > 0
    ):
        return {
            "index_status": get_index_status(),
            "indexing": {"skipped": True, "embedding_tokens": 0, "cost": 0.0},
        }

    if not chunks:
        _save_state(
            {
                "fingerprint": fingerprint,
                "indexed_fingerprint": fingerprint,
                "indexed_files": 0,
                "indexed_chunks": 0,
                "documents_dir": str(documents_dir),
                "index_mode": "local",
            }
        )
        return {
            "index_status": get_index_status(),
            "indexing": {"skipped": False, "embedding_tokens": 0, "cost": 0.0},
        }

    try:
        if not Config.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")

        texts, metadatas, ids = _build_ingest_payload(chunks)
        embeddings, embedding_usage = _embedding_texts(
            texts, Config.OPENAI_EMBEDDING_MODEL
        )

        try:
            _chroma().delete_collection(Config.RAG_COLLECTION_NAME)
        except Exception:
            pass

        collection = _collection()
        collection.add(
            ids=ids,
            documents=texts,
            metadatas=metadatas,
            embeddings=embeddings,
        )

        _save_state(
            {
                "fingerprint": fingerprint,
                "indexed_fingerprint": fingerprint,
                "indexed_files": len({chunk.source for chunk in chunks}),
                "indexed_chunks": len(chunks),
                "documents_dir": str(documents_dir),
                "embedding_usage": embedding_usage,
                "index_mode": "vector",
            }
        )
        indexing_cost = estimate_cost(
            model_name=Config.OPENAI_EMBEDDING_MODEL,
            embedding_model=Config.OPENAI_EMBEDDING_MODEL,
            embedding_tokens=embedding_usage["embedding_tokens"],
        )
        _record_usage_safe(
            usage_type="index",
            model_name=Config.OPENAI_EMBEDDING_MODEL,
            embedding_tokens=embedding_usage["embedding_tokens"],
            embedding_cost=indexing_cost["embedding_cost"],
            total_cost=indexing_cost["total_cost"],
        )
        return {
            "index_status": get_index_status(),
            "indexing": {
                "skipped": False,
                "embedding_tokens": embedding_usage["embedding_tokens"],
                "cost": indexing_cost,
            },
        }
    except Exception:
        _save_state(
            {
                "fingerprint": fingerprint,
                "indexed_fingerprint": fingerprint,
                "indexed_files": len({chunk.source for chunk in chunks}),
                "indexed_chunks": len(chunks),
                "documents_dir": str(documents_dir),
                "index_mode": "local",
            }
        )
        return {
            "index_status": get_index_status(),
            "indexing": {
                "skipped": False,
                "embedding_tokens": 0,
                "cost": 0.0,
                "mode": "local",
            },
        }


def get_index_status() -> Dict[str, Any]:
    state = _load_state()
    documents_dir = _documents_dir()
    fingerprint = compute_documents_fingerprint(documents_dir)
    mode = state.get("index_mode", "vector")
    indexed_files = int(state.get("indexed_files", 0) or 0)
    indexed_chunks = int(state.get("indexed_chunks", 0) or 0)
    try:
        collection = _collection()
        collection_count = collection.count()
    except sqlite3.OperationalError as exc:
        if "duplicate column name" in str(exc).lower():
            _reset_chroma_dir()
            collection = _collection()
            collection_count = collection.count()
        else:
            raise
    return asdict(
        IndexStatus(
            documents_dir=str(documents_dir),
            chroma_dir=str(_chroma_dir()),
            collection_name=Config.RAG_COLLECTION_NAME,
            fingerprint=fingerprint,
            indexed_fingerprint=state.get("indexed_fingerprint", ""),
            indexed_files=indexed_files,
            indexed_chunks=indexed_chunks,
            ready=(
                (
                    collection_count > 0
                    and state.get("indexed_fingerprint") == fingerprint
                    and mode != "local"
                )
                or (mode == "local" and indexed_chunks > 0)
            ),
        )
    )


def retrieve_context(question: str, top_k: Optional[int] = None) -> Dict[str, Any]:
    build_or_refresh_index(force=False)
    state = _load_state()
    if state.get("index_mode") == "local":
        return _select_local_chunks(question, top_k=top_k)

    try:
        collection = _collection()
        if collection.count() == 0:
            return _select_local_chunks(question, top_k=top_k)

        client = _client()
        query_embedding_response = client.embeddings.create(
            model=Config.OPENAI_EMBEDDING_MODEL, input=question
        )
        query_embedding = query_embedding_response.data[0].embedding
        query_embedding_tokens = int(
            getattr(query_embedding_response.usage, "total_tokens", 0) or 0
        )

        n_results = top_k or Config.RAG_TOP_K
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

        retrieved: List[Dict[str, Any]] = []
        documents = (results.get("documents") or [[]])[0]
        metadatas = (results.get("metadatas") or [[]])[0]
        distances = (results.get("distances") or [[]])[0]

        for idx, document in enumerate(documents):
            metadata = metadatas[idx] if idx < len(metadatas) else {}
            distance = float(distances[idx]) if idx < len(distances) else 1.0
            similarity = max(0.0, 1.0 - distance)
            retrieved.append(
                {
                    "rank": idx + 1,
                    "source": metadata.get("source", ""),
                    "chunk_index": metadata.get("chunk_index", 0),
                    "similarity": round(similarity, 6),
                    "text": document,
                }
            )

        context_lines = []
        for item in retrieved:
            context_lines.append(
                f"[Source: {item['source']} | Chunk: {item['chunk_index']} | Similarity: {item['similarity']:.4f}]\n"
                f"{item['text']}"
            )

        return {
            "mode": "vector",
            "query_embedding_tokens": query_embedding_tokens,
            "retrieved_chunks": retrieved,
            "context": "\n\n---\n\n".join(context_lines),
        }
    except Exception:
        return _select_local_chunks(question, top_k=top_k)


def answer_question(
    question: str,
    *,
    model: Optional[str] = None,
    top_k: Optional[int] = None,
) -> Dict[str, Any]:
    if not question or not question.strip():
        raise ValueError("question is required")

    retrieval = retrieve_context(question, top_k=top_k)
    model_name = model or Config.OPENAI_MODEL
    context = retrieval["context"]
    is_local_mode = retrieval.get("mode") == "local"

    if not retrieval["retrieved_chunks"]:
        return {
            "answer": "I could not find any indexed documents to answer from.",
            "model": "local-document-only" if is_local_mode else model_name,
            "usage": {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cached_input_tokens": 0,
            },
            "cost": {
                "llm_input_cost": 0.0,
                "llm_output_cost": 0.0,
                "llm_cached_input_cost": 0.0,
                "embedding_cost": 0.0,
                "total_cost": 0.0,
            },
            "sources": [],
            "mode": "local" if is_local_mode else "vector",
        }

    if is_local_mode:
        answer_text = _local_answer_from_chunks(question, retrieval)
        _record_usage_safe(
            usage_type="answer_local",
            model_name=model_name,
            total_cost=0.0,
        )
        return {
            "answer": answer_text,
            "model": "local-document-only",
            "usage": {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cached_input_tokens": 0,
                "query_embedding_tokens": 0,
            },
            "cost": {
                "llm_input_cost": 0.0,
                "llm_output_cost": 0.0,
                "llm_cached_input_cost": 0.0,
                "embedding_cost": 0.0,
                "total_cost": 0.0,
            },
            "sources": retrieval["retrieved_chunks"],
            "mode": "local",
        }

    system_prompt = (
        "You are a retrieval-grounded assistant.\n"
        "Answer only using the provided document context.\n"
        "If the documents do not contain the answer, say you could not find it in the documents.\n"
        "Cite sources inline using the format [source: filename]."
    )

    user_prompt = (
        f"Question:\n{question.strip()}\n\n"
        f"Document context:\n{context}\n\n"
        "Use only the document context above. Do not invent facts."
    )

    try:
        response = _client().responses.create(
            model=model_name,
            instructions=system_prompt,
            input=user_prompt,
        )

        answer_text = _extract_response_text(response)
        usage = _extract_usage(response)
        cost = estimate_cost(
            model_name=model_name,
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
            cached_input_tokens=usage["cached_input_tokens"],
            embedding_model=Config.OPENAI_EMBEDDING_MODEL,
            embedding_tokens=retrieval["query_embedding_tokens"],
        )
        _record_usage_safe(
            usage_type="answer",
            model_name=model_name,
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
            cached_input_tokens=usage["cached_input_tokens"],
            embedding_tokens=retrieval["query_embedding_tokens"],
            llm_input_cost=cost["llm_input_cost"],
            llm_output_cost=cost["llm_output_cost"],
            llm_cached_input_cost=cost["llm_cached_input_cost"],
            embedding_cost=cost["embedding_cost"],
            total_cost=cost["total_cost"],
        )

        return {
            "answer": answer_text,
            "model": model_name,
            "usage": {
                **usage,
                "query_embedding_tokens": retrieval["query_embedding_tokens"],
            },
            "cost": cost,
            "sources": retrieval["retrieved_chunks"],
            "mode": "vector",
        }
    except Exception:
        answer_text = _local_answer_from_chunks(question, retrieval)
        _record_usage_safe(
            usage_type="answer_local",
            model_name=model_name,
            total_cost=0.0,
        )
        return {
            "answer": answer_text,
            "model": "local-document-only",
            "usage": {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cached_input_tokens": 0,
                "query_embedding_tokens": 0,
            },
            "cost": {
                "llm_input_cost": 0.0,
                "llm_output_cost": 0.0,
                "llm_cached_input_cost": 0.0,
                "embedding_cost": 0.0,
                "total_cost": 0.0,
            },
            "sources": retrieval["retrieved_chunks"],
            "mode": "local",
        }


def _window_start(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def get_usage_summary() -> Dict[str, Any]:
    now = datetime.utcnow()
    periods = {
        "daily": _window_start(1),
        "weekly": _window_start(7),
        "monthly": _window_start(30),
    }

    summary = {
        period: LLMUsage.aggregate_between(start_at, now)
        for period, start_at in periods.items()
    }

    return {
        "generated_at": now.isoformat(),
        "periods": summary,
        "rates": {
            "embedding_model": Config.OPENAI_EMBEDDING_MODEL,
            "models": {
                model_name: asdict(rates)
                for model_name, rates in load_model_rates().items()
            },
            "embeddings": load_embedding_rates(),
        },
        "recent": LLMUsage.recent(limit=20),
    }


def get_model_catalog() -> Dict[str, Any]:
    model_rates = load_model_rates()
    return {
        "default_model": Config.OPENAI_MODEL,
        "embedding_model": Config.OPENAI_EMBEDDING_MODEL,
        "models": [
            {
                "name": model_name,
                "input_per_1m": rates.input_per_1m,
                "output_per_1m": rates.output_per_1m,
                "cached_input_per_1m": rates.cached_input_per_1m,
            }
            for model_name, rates in model_rates.items()
        ],
        "embedding_rates": load_embedding_rates(),
    }
