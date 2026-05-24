"""
Contrato comum dos loaders.

Cada loader varre uma fonte (CSV, .docx, JSONL, futura API de notícias…)
e gera `RawSource`s. O `RawSource` carrega TODO o material útil para a
extração — incluindo `structured_fields` quando a fonte já é tabular.

Decisões:

  - O loader NÃO faz extração ontológica. Ele só normaliza acesso à fonte.
  - O loader emite via gerador para não estourar memória com fontes grandes
    (df_ocorrencias_tratado tem ~115 k linhas).
  - Quando o registro de origem traz texto livre relevante (relato do
    Disque Denúncia, corpo do RELINT, texto do tweet), ele vai em
    `raw_text`. Quando é tabular puro (linha de CSV de ocorrência),
    `structured_fields` traz os campos já tipados e `raw_text` pode ser
    None ou um stringify resumido.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterator, Optional, Protocol

from pydantic import BaseModel, ConfigDict, Field

from valente_ontology.enums import SourceKind


class RawSource(BaseModel):
    """Pacote bruto entregue pelo loader ao extractor."""

    model_config = ConfigDict(extra="forbid")

    kind: SourceKind
    source_id: str
    source_file: Optional[str] = None
    captured_at: datetime = Field(default_factory=datetime.utcnow)
    reliability: float = 1.0

    raw_text: Optional[str] = Field(
        default=None,
        description="Texto livre (relato, body do tweet, body do .docx). None se a "
                    "fonte é puramente tabular.",
    )
    structured_fields: dict[str, Any] = Field(
        default_factory=dict,
        description="Campos já estruturados da fonte (linha do CSV, etc.). O extractor "
                    "estruturado consome daqui; o LLM extractor usa como contexto.",
    )

    # Pistas espaciais/temporais opcionais (alguns loaders já sabem antes
    # da extração). Quando preenchidas, viram default no CrimeEvent —
    # o extractor LLM pode sobrescrever se o texto livre for mais específico.
    hint_date_iso: Optional[str] = None
    hint_hour_24: Optional[int] = None
    hint_latitude: Optional[float] = None
    hint_longitude: Optional[float] = None
    hint_logradouro: Optional[str] = None
    hint_bairro: Optional[str] = None


class Loader(Protocol):
    """Interface estrutural dos loaders."""

    kind: SourceKind

    def iter_sources(self) -> Iterator[RawSource]: ...
