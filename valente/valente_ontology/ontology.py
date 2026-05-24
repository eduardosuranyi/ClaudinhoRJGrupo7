"""
`CrimeEvent` — raiz da ontologia.

Representa **um evento criminal** como composição das entidades de
`entities.py`. Cada evento tem origem rastreável (`source`) e metadados
de extração (`extraction`) — duas hashes/IDs deterministicos permitem
deduplicação cross-source e auditoria do pipeline.

Convenção para o futuro `score.py`:

  - Campos `Optional[...] = None` significam **desconhecido** — o score
    NÃO deve penalizar ausência, deve marcá-la separadamente.
  - Campos com valor `DESCONHECIDO`/`DESCONHECIDA` no enum têm a mesma
    semântica de None mas garantem que o enum seja sempre preenchido
    (evita branching no consumidor).
  - Listas vazias são **ausência confirmada** — diferente de None.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from valente_ontology.enums import (
    CrimeType,
    ExtractionMethod,
    SourceKind,
)
from valente_ontology.entities import (
    Agent,
    ApproachMode,
    EnvironmentalContext,
    EscapeMode,
    ModusOperandi,
    Outcome,
    SpatialContext,
    StolenItem,
    TemporalContext,
    Vehicle,
    Victim,
    Weapon,
)


# ─────────────────────────────────────────────────────────────────────────
# Metadados
# ─────────────────────────────────────────────────────────────────────────


class SourceMetadata(BaseModel):
    """Origem rastreável do evento. Permite auditoria, dedupe cross-source
    e refeito da extração em caso de mudança da ontologia."""

    model_config = ConfigDict(extra="forbid")

    kind: SourceKind
    source_id: str = Field(
        description="ID estável da fonte (linha do CSV, tweet_id, URL da notícia, "
                    "arquivo+offset do RELINT). É a chave de dedupe.",
    )
    source_file: Optional[str] = Field(
        default=None,
        description="Caminho/URI relativo da fonte para auditoria.",
    )
    raw_text: Optional[str] = Field(
        default=None,
        description="Texto bruto que originou o evento (truncado a ~4 KB). "
                    "Preservado para re-extração caso a ontologia mude.",
    )
    raw_text_hash: Optional[str] = Field(
        default=None,
        description="SHA1 do raw_text íntegro (não-truncado) — para detectar "
                    "mudança da fonte sem armazenar o texto completo.",
    )
    captured_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Quando a fonte foi capturada (publicação do tweet, "
                    "data do CSV, mtime do .docx).",
    )
    reliability: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confiança a priori da fonte. Ex.: ocorrência oficial=1.0, "
                    "RELINT=0.95, disque denúncia=0.7, tweet=0.5, news=0.6.",
    )


class ExtractionMetadata(BaseModel):
    """Como o CrimeEvent foi materializado a partir do RawSource."""

    model_config = ConfigDict(extra="forbid")

    method: ExtractionMethod
    model_id: Optional[str] = Field(
        default=None,
        description="Modelo LLM usado (ex.: 'claude-opus-4-7'). None para "
                    "extração determinística.",
    )
    ontology_version: str = Field(
        default="0.1.0",
        description="Versão da ontologia em vigor no momento da extração.",
    )
    extracted_at: datetime = Field(default_factory=datetime.utcnow)
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confiança auto-reportada da extração. Para LLM, vem do "
                    "campo `confidence` no JSON estruturado.",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Notas livres do extrator: ambiguidades, escolhas, fallback usado.",
    )


# ─────────────────────────────────────────────────────────────────────────
# Raiz
# ─────────────────────────────────────────────────────────────────────────


class CrimeEvent(BaseModel):
    """Evento criminal estruturado. Artefato canônico da pipeline.

    Identidade:
        `event_id` é derivado deterministicamente de (source.kind, source.source_id)
        — então re-extrair a mesma fonte produz o **mesmo** event_id, e o storage
        faz upsert idempotente.

    Filosofia:
        Este objeto é o "instantâneo" do que o sistema sabe sobre o evento.
        Múltiplas fontes podem contribuir para o mesmo evento real
        (ex.: ocorrência oficial + tweet de testemunha + denúncia anônima);
        a fusão é responsabilidade de uma etapa downstream — não desta classe.
    """

    model_config = ConfigDict(extra="forbid")

    # --- Identidade ---
    event_id: str = Field(
        description="ID determinístico: sha1(source.kind + ':' + source.source_id)[:16].",
    )

    # --- Roteamento ---
    crime_type: CrimeType = CrimeType.DESCONHECIDO

    # --- Composição ontológica ---
    temporal: TemporalContext = Field(default_factory=TemporalContext)
    spatial: SpatialContext = Field(default_factory=SpatialContext)
    environment: EnvironmentalContext = Field(default_factory=EnvironmentalContext)

    victim_count_total: Optional[int] = Field(
        default=None,
        description="Total declarado de vítimas. Use `len(victims)` apenas quando "
                    "todas estão individualizadas; cenas de arrastão preenchem aqui.",
    )
    agent_count_total: Optional[int] = Field(
        default=None,
        description="Total declarado de agentes. Análogo a victim_count_total.",
    )
    victims: list[Victim] = Field(default_factory=list)
    agents: list[Agent] = Field(default_factory=list)
    vehicles: list[Vehicle] = Field(default_factory=list)
    weapons: list[Weapon] = Field(default_factory=list)
    stolen_items: list[StolenItem] = Field(default_factory=list)

    approach: ApproachMode = Field(default_factory=ApproachMode)
    escape: EscapeMode = Field(default_factory=EscapeMode)
    modus_operandi: ModusOperandi = Field(default_factory=ModusOperandi)
    outcome: Outcome = Field(default_factory=Outcome)

    # --- Rastreabilidade ---
    source: SourceMetadata
    extraction: ExtractionMetadata

    # --- Vínculos opcionais ---
    related_event_ids: list[str] = Field(
        default_factory=list,
        description="IDs de outros eventos suspeitos de descrever a mesma ocorrência "
                    "(mesmo evento, fontes diferentes). Populado por etapa de fusão.",
    )
    triggered_fm_action_ids: list[str] = Field(
        default_factory=list,
        description="IDs de ações da Força Municipal que este evento ajudou a motivar — "
                    "permite, no futuro, medir efeito das ações sobre eventos similares.",
    )

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def make_event_id(source_kind: SourceKind, source_id: str) -> str:
        """ID determinístico — re-extrair a mesma fonte produz o mesmo event_id."""
        material = f"{source_kind.value}:{source_id}".encode("utf-8")
        return hashlib.sha1(material).hexdigest()[:16]

    def to_jsonl_line(self) -> str:
        return self.model_dump_json(exclude_none=False)
