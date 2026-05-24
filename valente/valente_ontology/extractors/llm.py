"""
Extractor LLM — Claude para texto livre.

Usado em:
  - tweets (kind=TWEET)
  - notícias (kind=NEWS_ARTICLE, esqueleto)
  - chunks de RELINT (kind=RELINT)
  - relato_redacted do Disque Denúncia (modo HYBRID, ver pipeline.py)
  - rationale de FM actions (não gera CrimeEvent — vai pra trilha paralela)

Uso de prompt caching: o system prompt (que carrega a ontologia inteira)
é marcado como cache_control=ephemeral. O custo cai de ~1500 tokens por
chamada para ~75 tokens depois do primeiro hit. Em batches de 1k+ eventos
isso paga sozinho a feature.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from valente_ontology.enums import ExtractionMethod, SourceKind
from valente_ontology.extractors.prompts import build_system_prompt, build_user_prompt
from valente_ontology.loaders.base import RawSource
from valente_ontology.ontology import (
    CrimeEvent,
    ExtractionMetadata,
    SourceMetadata,
)


log = logging.getLogger("valente_ontology.extractors.llm")
name = "llm_free_text"


DEFAULT_MODEL = "claude-opus-4-7"


class LLMExtractor:
    """Extrai CrimeEvent via Claude. Re-utiliza um único `Anthropic` client
    para que prompt caching funcione entre chamadas."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 2048,
        temperature: float = 0.0,
    ):
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise RuntimeError(
                "Pacote `anthropic` não instalado. Rode `uv add anthropic` "
                "(ou pip install anthropic) na pasta valente/."
            ) from e
        self._client = Anthropic(api_key=api_key) if api_key else Anthropic()
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self._system_prompt = build_system_prompt()

    def extract(self, source: RawSource) -> Optional[CrimeEvent]:
        if not source.raw_text:
            return None

        hints = {
            "kind": source.kind.value,
            "captured_at": source.captured_at.isoformat() if source.captured_at else None,
            "hint_date_iso": source.hint_date_iso,
            "hint_hour_24": source.hint_hour_24,
            "hint_latitude": source.hint_latitude,
            "hint_longitude": source.hint_longitude,
            "hint_logradouro": source.hint_logradouro,
            "hint_bairro": source.hint_bairro,
            "area_fm": source.structured_fields.get("area_fm"),
        }
        user_prompt = build_user_prompt(source.raw_text, hints)

        try:
            resp = self._client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                system=[
                    {
                        "type": "text",
                        "text": self._system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": user_prompt}],
            )
        except Exception as e:
            log.warning("LLM call failed for %s:%s — %s", source.kind, source.source_id, e)
            return None

        raw = _join_text(resp)
        payload = _parse_json_loose(raw)
        if payload is None:
            log.warning("LLM returned unparseable JSON for %s:%s", source.kind, source.source_id)
            return None

        # O LLM não sabe o event_id determinístico — sobrescrevemos.
        # Também forçamos source e extraction metadata (auditoria).
        payload["event_id"] = CrimeEvent.make_event_id(source.kind, source.source_id)
        payload["source"] = SourceMetadata(
            kind=source.kind,
            source_id=source.source_id,
            source_file=source.source_file,
            raw_text=_truncate(source.raw_text, 4000),
            reliability=source.reliability,
        ).model_dump(mode="json")
        ext_in = payload.get("extraction") or {}
        payload["extraction"] = ExtractionMetadata(
            method=ExtractionMethod.LLM_FREE_TEXT,
            model_id=self.model,
            confidence=float(ext_in.get("confidence", 0.6)),
            notes=ext_in.get("notes"),
        ).model_dump(mode="json")

        try:
            return CrimeEvent.model_validate(payload)
        except Exception as e:
            log.warning(
                "Validação Pydantic falhou para %s:%s — %s",
                source.kind, source.source_id, e,
            )
            return None


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────


def _join_text(resp) -> str:
    """Concatena blocos de texto da resposta do SDK Anthropic."""
    parts = []
    for block in getattr(resp, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "".join(parts).strip()


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _parse_json_loose(text: str) -> Optional[dict]:
    """Tenta parsear JSON. Aceita o modelo ter devolvido com cerca ```json```
    apesar de pedirmos sem (modelo pode escorregar)."""
    if not text:
        return None
    cleaned = _FENCE_RE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # último recurso: extrair o primeiro objeto JSON balanceado
        start = cleaned.find("{")
        if start < 0:
            return None
        depth = 0
        for i in range(start, len(cleaned)):
            if cleaned[i] == "{":
                depth += 1
            elif cleaned[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(cleaned[start : i + 1])
                    except json.JSONDecodeError:
                        return None
        return None


def _truncate(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


# ─────────────────────────────────────────────────────────────────────────
# Fallback offline (sem API key)
# ─────────────────────────────────────────────────────────────────────────


def build_offline_stub_extractor():
    """Versão sem API que devolve um CrimeEvent vazio (apenas metadados +
    crime_type desconhecido). Útil em testes/CI."""

    class _Stub:
        name = "llm_offline_stub"

        def extract(self, source: RawSource) -> Optional[CrimeEvent]:
            if not source.raw_text:
                return None
            return CrimeEvent(
                event_id=CrimeEvent.make_event_id(source.kind, source.source_id),
                source=SourceMetadata(
                    kind=source.kind,
                    source_id=source.source_id,
                    source_file=source.source_file,
                    raw_text=_truncate(source.raw_text or "", 1000),
                    reliability=source.reliability,
                ),
                extraction=ExtractionMetadata(
                    method=ExtractionMethod.LLM_FREE_TEXT,
                    model_id="offline-stub",
                    confidence=0.0,
                    notes="Sem ANTHROPIC_API_KEY — extractor stub.",
                ),
            )

    return _Stub()
