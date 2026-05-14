import os
from datetime import timedelta
from pathlib import Path


class Config:
    BACKEND_DIR = Path(__file__).resolve().parent
    PROJECT_ROOT = BACKEND_DIR.parent
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{(BACKEND_DIR / 'hackathon.db').as_posix()}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY", "dev - secret - key - CHANGE - IN - PRODUCTION"
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    RAG_DOCUMENTS_DIR = os.getenv(
        "RAG_DOCUMENTS_DIR", str(PROJECT_ROOT / "llm" / "documents")
    )
    RAG_CHROMA_DIR = os.getenv(
        "RAG_CHROMA_DIR", str(PROJECT_ROOT / "llm" / "chroma_db")
    )
    RAG_COLLECTION_NAME = os.getenv("RAG_COLLECTION_NAME", "knowledge_base")
    RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))
    RAG_CHUNK_WORDS = int(os.getenv("RAG_CHUNK_WORDS", "220"))
    RAG_CHUNK_OVERLAP_WORDS = int(os.getenv("RAG_CHUNK_OVERLAP_WORDS", "40"))

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")
    OPENAI_EMBEDDING_MODEL = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )

    # Azure-style cost metrics are token-based, but exact rates vary by deployment
    # and region. Override these defaults with RAG_MODEL_PRICING_JSON if needed.
    RAG_MODEL_PRICING_JSON = os.getenv("RAG_MODEL_PRICING_JSON", "{}")
    RAG_EMBEDDING_PRICING_JSON = os.getenv("RAG_EMBEDDING_PRICING_JSON", "{}")
