"""
Loader do histórico de ações da Força Municipal.

Diferentemente dos demais loaders, este NÃO gera `CrimeEvent` — ele gera
um artefato paralelo, `FMAction`, que descreve o que a FM fez (operação,
remoção de fator urbano, reforço de patrulha, etc.) e — quando disponível —
o efeito medido sobre a criminalidade.

Esse loop fechado é o que permite o sistema **aprender com as próprias
respostas**: depois que `score.py` existir, queremos correlacionar
queda/migração do crime com a ação tomada (eventos pré × pós) para
reforçar ou ajustar políticas.

Schema do CSV/JSONL esperado (`data/fm_actions/actions.jsonl`):

    {
      "action_id": "FM-2026-0042",
      "area_fm": "Presidente Vargas - Campo de Santana - ...",
      "logradouro": "AVENIDA PRESIDENTE VARGAS",
      "latitude": -22.9035, "longitude": -43.1949,
      "action_type": "patrulhamento_reforcado",   // ver enum FMActionType
      "decided_at": "2026-05-01",
      "executed_at_start": "2026-05-02",
      "executed_at_end": "2026-05-31",
      "decided_by": "Reunião CompStat 2026-04-29",
      "rationale_text": "Top Bingo da área (score 9/10) — combo iluminação+vegetação",
      "target_factor_ids": ["fat-123", "fat-456"],   // ids do fatores_urbanos.csv
      "target_crime_types": ["roubo_transeunte"],
      "expected_effect_text": "Reduzir roubo a transeunte em 30% até jul/2026",
      "observed_effect_text": "Queda 24% no período; migração observada para Rua X",
      "status": "concluida"   // planejada | em_andamento | concluida | cancelada
    }

Por ora os dados de ações reais ainda não existem no repositório — este
loader simplesmente lê o JSONL se ele existir, e expõe `FMAction` para
consumo pelo pipeline e (futuramente) pelo score.
"""

from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Iterator, Optional

from pydantic import BaseModel, ConfigDict, Field

from valente_ontology.enums import CrimeType, SourceKind, UrbanFactorTag
from valente_ontology.loaders.base import RawSource


# ─────────────────────────────────────────────────────────────────────────
# Tipos de ação
# ─────────────────────────────────────────────────────────────────────────


class FMActionType(str, Enum):
    PATRULHAMENTO_REFORCADO = "patrulhamento_reforcado"
    PATRULHAMENTO_OSTENSIVO_TEMPORARIO = "patrulhamento_ostensivo_temporario"
    REMOCAO_FATOR_URBANO = "remocao_fator_urbano"
    REPARO_ILUMINACAO = "reparo_iluminacao"
    PODA_VEGETACAO = "poda_vegetacao"
    LIMPEZA_LIXO_ENTULHO = "limpeza_lixo_entulho"
    DESOBSTRUCAO_CALCADA = "desobstrucao_calcada"
    REMOCAO_COMERCIO_IRREGULAR = "remocao_comercio_irregular"
    INSTALACAO_CAMERA = "instalacao_camera"
    REORDENAMENTO_TRAFEGO = "reordenamento_trafego"
    ACAO_SOCIAL = "acao_social"                # SMAS, abordagem a pessoas em situação de rua
    OPERACAO_CONJUNTA_PMERJ = "operacao_conjunta_pmerj"
    OUTRA = "outra"


class FMActionStatus(str, Enum):
    PLANEJADA = "planejada"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


# ─────────────────────────────────────────────────────────────────────────
# Modelo
# ─────────────────────────────────────────────────────────────────────────


class FMAction(BaseModel):
    """Uma ação da Força Municipal. Pareada com efeito observado (quando
    medido), forma a base de aprendizado por reforço-leve do sistema."""

    model_config = ConfigDict(extra="forbid")

    action_id: str
    area_fm: Optional[str] = None
    logradouro: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    action_type: FMActionType = FMActionType.OUTRA
    status: FMActionStatus = FMActionStatus.PLANEJADA

    decided_at: Optional[str] = Field(default=None, description="ISO 8601 date.")
    executed_at_start: Optional[str] = None
    executed_at_end: Optional[str] = None
    decided_by: Optional[str] = Field(
        default=None,
        description="Origem da decisão (reunião CompStat de DD/MM, ofício, ordem direta).",
    )

    rationale_text: Optional[str] = Field(
        default=None,
        description="Por que a ação foi escolhida — idealmente cita o score/evento "
                    "específico que motivou.",
    )
    target_factor_ids: list[str] = Field(default_factory=list)
    target_factor_tags: list[UrbanFactorTag] = Field(default_factory=list)
    target_crime_types: list[CrimeType] = Field(default_factory=list)

    expected_effect_text: Optional[str] = None
    observed_effect_text: Optional[str] = None
    observed_event_id_deltas: dict[str, int] = Field(
        default_factory=dict,
        description="Mapa CrimeType→delta_observado em janela pós-ação "
                    "(ex.: {'roubo_transeunte': -12}). Populado por etapa downstream "
                    "quando comparada a janela pré/pós.",
    )


# ─────────────────────────────────────────────────────────────────────────
# Loader
# ─────────────────────────────────────────────────────────────────────────


class FMActionLoader:
    """Lê `fm_actions.jsonl`. Inerte se o arquivo não existir.

    Também expõe `iter_sources()` para o pipeline tratar cada ação como um
    `RawSource` rastreável (não vira CrimeEvent — vai para a tabela paralela
    de ações)."""

    kind = SourceKind.FM_ACTION_LOG
    reliability = 1.0

    def __init__(self, actions_path: Path):
        self.actions_path = Path(actions_path)

    def iter_actions(self) -> Iterator[FMAction]:
        if not self.actions_path.exists():
            return
        with self.actions_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield FMAction.model_validate_json(line)
                except Exception:
                    # mantém os malformados fora do pipeline sem matar o batch
                    continue

    def iter_sources(self) -> Iterator[RawSource]:
        """Variante que adapta cada ação para o protocolo de loader.
        Útil se quisermos auditar ações como `RawSource` na mesma trilha
        das demais fontes."""
        for action in self.iter_actions():
            yield RawSource(
                kind=self.kind,
                source_id=action.action_id,
                source_file=str(self.actions_path),
                captured_at=datetime.utcnow(),
                reliability=self.reliability,
                raw_text=action.rationale_text,
                structured_fields=action.model_dump(mode="json"),
                hint_date_iso=action.executed_at_start,
                hint_latitude=action.latitude,
                hint_longitude=action.longitude,
                hint_logradouro=action.logradouro,
            )


def write_example_actions(path: Path) -> None:
    """Materializa um arquivo de exemplo (1 ação fictícia) para servir
    de gabarito quando a FM começar a alimentar este loop."""
    example = FMAction(
        action_id="FM-2026-EXEMPLO-0001",
        area_fm="Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
        logradouro="AVENIDA PRESIDENTE VARGAS",
        latitude=-22.9035,
        longitude=-43.1949,
        action_type=FMActionType.REPARO_ILUMINACAO,
        status=FMActionStatus.PLANEJADA,
        decided_at="2026-05-20",
        decided_by="Reunião CompStat 2026-05-19",
        rationale_text="Top Bingo da área (score 9/10). Combo: iluminação deficiente + vegetação obstruindo postes.",
        target_factor_tags=[UrbanFactorTag.ILUMINACAO_DEFICIENTE, UrbanFactorTag.VEGETACAO_COBRINDO_ILUMINACAO],
        target_crime_types=[CrimeType.ROUBO_TRANSEUNTE],
        expected_effect_text="Reduzir roubo a transeunte em 30% no trecho.",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(example.model_dump_json() + "\n")
