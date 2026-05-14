from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Mapping, Optional

from config import Config


@dataclass(frozen=True)
class TokenRates:
    input_per_1m: float = 0.0
    output_per_1m: float = 0.0
    cached_input_per_1m: float = 0.0


DEFAULT_MODEL_RATES: Dict[str, TokenRates] = {
    "gpt-5.5": TokenRates(input_per_1m=5.0, output_per_1m=30.0),
    "gpt-5.4": TokenRates(input_per_1m=2.5, output_per_1m=15.0, cached_input_per_1m=0.25),
    "gpt-5.4-mini": TokenRates(
        input_per_1m=0.75, output_per_1m=4.5, cached_input_per_1m=0.08
    ),
    "gpt-5.4-nano": TokenRates(
        input_per_1m=0.20, output_per_1m=1.25, cached_input_per_1m=0.02
    ),
}

DEFAULT_EMBEDDING_RATES: Dict[str, float] = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
}


def _load_json_mapping(raw_json: str) -> Mapping[str, object]:
    if not raw_json:
        return {}
    try:
        parsed = json.loads(raw_json)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def load_model_rates() -> Dict[str, TokenRates]:
    rates = dict(DEFAULT_MODEL_RATES)
    overrides = _load_json_mapping(Config.RAG_MODEL_PRICING_JSON)

    for model_name, payload in overrides.items():
        if not isinstance(payload, dict):
            continue
        rates[model_name] = TokenRates(
            input_per_1m=float(payload.get("input_per_1m", payload.get("input", 0.0))),
            output_per_1m=float(
                payload.get("output_per_1m", payload.get("output", 0.0))
            ),
            cached_input_per_1m=float(
                payload.get(
                    "cached_input_per_1m", payload.get("cached_input", 0.0)
                )
            ),
        )

    return rates


def load_embedding_rates() -> Dict[str, float]:
    rates = dict(DEFAULT_EMBEDDING_RATES)
    overrides = _load_json_mapping(Config.RAG_EMBEDDING_PRICING_JSON)
    for model_name, value in overrides.items():
        try:
            rates[model_name] = float(value)
        except (TypeError, ValueError):
            continue
    return rates


def get_rates_for_model(model_name: str) -> TokenRates:
    rates = load_model_rates()
    if model_name in rates:
        return rates[model_name]

    for known_model, known_rates in rates.items():
        if model_name.startswith(known_model):
            return known_rates

    return TokenRates()


def get_embedding_rate(embedding_model: str) -> float:
    rates = load_embedding_rates()
    if embedding_model in rates:
        return rates[embedding_model]
    for known_model, known_rate in rates.items():
        if embedding_model.startswith(known_model):
            return known_rate
    return 0.0


def estimate_cost(
    *,
    model_name: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_input_tokens: int = 0,
    embedding_model: str | None = None,
    embedding_tokens: int = 0,
) -> Dict[str, float]:
    model_rates = get_rates_for_model(model_name)
    embedding_rate = get_embedding_rate(embedding_model or "")

    llm_input_cost = input_tokens * model_rates.input_per_1m / 1_000_000
    llm_output_cost = output_tokens * model_rates.output_per_1m / 1_000_000
    llm_cached_input_cost = (
        cached_input_tokens * model_rates.cached_input_per_1m / 1_000_000
    )
    embedding_cost = embedding_tokens * embedding_rate / 1_000_000

    total_cost = llm_input_cost + llm_output_cost + llm_cached_input_cost + embedding_cost

    return {
        "llm_input_cost": round(llm_input_cost, 8),
        "llm_output_cost": round(llm_output_cost, 8),
        "llm_cached_input_cost": round(llm_cached_input_cost, 8),
        "embedding_cost": round(embedding_cost, 8),
        "total_cost": round(total_cost, 8),
    }
