from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from pypdf import PdfReader


SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".pdf"}


@dataclass(frozen=True)
class DocumentChunk:
    id: str
    source: str
    chunk_index: int
    text: str


def iter_document_files(documents_dir: Path) -> Iterable[Path]:
    if not documents_dir.exists():
        return []

    return sorted(
        path
        for path in documents_dir.rglob("*")
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
        and path.name.lower() != "readme.md"
    )


def read_document_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(path))
        pages = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text)
        return "\n".join(pages)

    return path.read_text(encoding="utf-8", errors="ignore")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def chunk_text(text: str, chunk_words: int, overlap_words: int) -> List[str]:
    words = normalize_text(text).split()
    if not words:
        return []

    chunk_words = max(1, chunk_words)
    overlap_words = max(0, min(overlap_words, chunk_words - 1))

    if len(words) <= chunk_words:
        return [" ".join(words)]

    chunks: List[str] = []
    start = 0
    step = chunk_words - overlap_words

    while start < len(words):
        end = min(len(words), start + chunk_words)
        chunk = " ".join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(words):
            break
        start += step

    return chunks


def build_document_chunks(
    documents_dir: Path, chunk_words: int, overlap_words: int
) -> List[DocumentChunk]:
    chunks: List[DocumentChunk] = []
    documents_dir = documents_dir.resolve()

    for path in iter_document_files(documents_dir):
        text = read_document_text(path)
        if not text.strip():
            continue

        relative_source = str(path.resolve().relative_to(documents_dir))
        for chunk_index, chunk_text_value in enumerate(
            chunk_text(text, chunk_words=chunk_words, overlap_words=overlap_words)
        ):
            digest = hashlib.sha1(
                f"{relative_source}:{chunk_index}:{chunk_text_value}".encode("utf-8")
            ).hexdigest()
            chunks.append(
                DocumentChunk(
                    id=digest,
                    source=relative_source,
                    chunk_index=chunk_index,
                    text=chunk_text_value,
                )
            )

    return chunks


def compute_documents_fingerprint(documents_dir: Path) -> str:
    documents_dir = documents_dir.resolve()
    hasher = hashlib.sha1()
    if not documents_dir.exists():
        hasher.update(b"missing")
        return hasher.hexdigest()

    for path in iter_document_files(documents_dir):
        rel = str(path.resolve().relative_to(documents_dir))
        hasher.update(rel.encode("utf-8"))
        hasher.update(str(path.stat().st_size).encode("utf-8"))
        hasher.update(str(int(path.stat().st_mtime)).encode("utf-8"))
        hasher.update(hashlib.sha1(path.read_bytes()).digest())

    return hasher.hexdigest()
