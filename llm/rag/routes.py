from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from rbac import admin_required

from .service import (
    answer_question,
    build_or_refresh_index,
    get_index_status,
    get_usage_summary,
    get_model_catalog,
)


rag_api = Blueprint("rag_api", __name__)


@rag_api.route("/rag/status", methods=["GET"])
@jwt_required()
def rag_status():
    return jsonify(get_index_status())


@rag_api.route("/rag/reindex", methods=["POST"])
@jwt_required()
def rag_reindex():
    payload = request.get_json(silent=True) or {}
    force = bool(payload.get("force", False))
    return jsonify(build_or_refresh_index(force=force))


@rag_api.route("/rag/ask", methods=["POST"])
@jwt_required()
def rag_ask():
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    if not question:
        return jsonify({"error": "question is required"}), 400

    model = payload.get("model") or None
    top_k = payload.get("top_k")
    try:
        top_k = int(top_k) if top_k is not None else None
    except (TypeError, ValueError):
        top_k = None

    try:
        result = answer_question(question, model=model, top_k=top_k)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result)


@rag_api.route("/rag/models", methods=["GET"])
@jwt_required()
def rag_models():
    return jsonify(get_model_catalog())


@rag_api.route("/llm/usage", methods=["GET"])
@jwt_required()
@admin_required
def llm_usage():
    return jsonify(get_usage_summary())
