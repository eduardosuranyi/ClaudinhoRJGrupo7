"""
Loader das bases oficiais do CompStat Rio (pasta `claude_impact_lab_compstat_rio/`).

Cobre as fontes tabulares:

  - `dados/df_ocorrencias_tratado - Extração 1 .csv` → SourceKind.OCORRENCIA_OFICIAL
  - `dados/disk_denuncia.csv`                        → SourceKind.DISQUE_DENUNCIA
  - `dados/fatores_urbanos.csv`     ── via FactorLoader (não é evento criminal
    por si, mas serve como contexto cruzado para enriquecer EnvironmentalContext)
  - `dados/cameras_areas_fm.csv`    ── idem, usado só como contexto
  - `dados/outros dados/dominio_territorial - Extração 1.csv` ── contexto ORCRIM

Note que **apenas ocorrências e denúncias viram CrimeEvent**. Fatores urbanos
e câmeras viram tabelas de lookup carregadas separadamente pelo pipeline
para enriquecer o `EnvironmentalContext` dos eventos via cross-reference
(rua/área).
"""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

from valente_ontology.enums import SourceKind
from valente_ontology.loaders.base import RawSource


# ─────────────────────────────────────────────────────────────────────────
# Ocorrências oficiais (df_ocorrencias_tratado)
# ─────────────────────────────────────────────────────────────────────────


class OcorrenciasLoader:
    """Lê o CSV bruto de ocorrências e gera RawSource por linha.

    A extração ontológica do CSV é puramente estruturada (sem LLM): cada
    linha já traz lat/lon, hora, ano, descrição do delito, logradouro.
    O extractor estruturado (`extractors/structured.py`) consome esses
    campos diretamente.
    """

    kind = SourceKind.OCORRENCIA_OFICIAL
    reliability = 1.0

    def __init__(self, csv_path: Path):
        self.csv_path = Path(csv_path)

    def iter_sources(self) -> Iterator[RawSource]:
        with self.csv_path.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                src_id = row.get("id_criptografado") or _row_hash(row)
                yield RawSource(
                    kind=self.kind,
                    source_id=src_id,
                    source_file=str(self.csv_path),
                    reliability=self.reliability,
                    raw_text=None,
                    structured_fields={k: (v or None) for k, v in row.items()},
                    hint_date_iso=_compose_date_iso(row.get("ano"), row.get("mes"), row.get("data")),
                    hint_hour_24=_safe_int(row.get("hora")),
                    hint_latitude=_safe_float(row.get("latitude")),
                    hint_longitude=_safe_float(row.get("longitude")),
                    hint_logradouro=row.get("locf") or None,
                )


# ─────────────────────────────────────────────────────────────────────────
# Disque Denúncia
# ─────────────────────────────────────────────────────────────────────────


class DisqueDenunciaLoader:
    """Lê `disk_denuncia.csv` (separador `;`) e gera RawSource por linha.

    Diferentemente das ocorrências, esta fonte tem `relato_redacted` — texto
    livre que **vale a pena passar pelo LLM extractor**, porque traz modus
    operandi, vestimenta, abordagem, etc. Por isso preenchemos tanto
    `raw_text` (para o LLM) quanto `structured_fields` (para o mapper
    aproveitar `envolvidos.sexo/idade/pele/...` direto).
    """

    kind = SourceKind.DISQUE_DENUNCIA
    reliability = 0.7  # denúncia anônima é menos confiável que registro oficial

    def __init__(self, csv_path: Path):
        self.csv_path = Path(csv_path)

    def iter_sources(self) -> Iterator[RawSource]:
        with self.csv_path.open("r", encoding="utf-8", newline="", errors="replace") as fh:
            reader = csv.DictReader(fh, delimiter=";")
            for row in reader:
                src_id = row.get("id_denuncia") or row.get("numero_denuncia") or _row_hash(row)
                relato = (row.get("relato_redacted") or "").strip() or None
                yield RawSource(
                    kind=self.kind,
                    source_id=str(src_id),
                    source_file=str(self.csv_path),
                    reliability=self.reliability,
                    raw_text=relato,
                    structured_fields={k: (v or None) for k, v in row.items()},
                    hint_date_iso=_parse_br_date_to_iso(row.get("data_denuncia")),
                    hint_latitude=_safe_float(_normalize_comma_decimal(row.get("latitude"))),
                    hint_longitude=_safe_float(_normalize_comma_decimal(row.get("longitude"))),
                    hint_logradouro=row.get("logradouro") or None,
                    hint_bairro=row.get("bairro_logradouro") or None,
                )


# ─────────────────────────────────────────────────────────────────────────
# Tabelas de contexto (não geram CrimeEvent)
# ─────────────────────────────────────────────────────────────────────────


def load_fatores_urbanos(csv_path: Path) -> list[dict]:
    """Lê fatores_urbanos.csv como lista de dicts. Usado como lookup
    para enriquecer `EnvironmentalContext` no pipeline de fusão."""
    rows: list[dict] = []
    with Path(csv_path).open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            if (row.get("tipo_ocorrencia_ativo") or "").lower() != "true":
                continue
            rows.append(row)
    return rows


def load_cameras(csv_path: Path) -> list[dict]:
    """Lê cameras_areas_fm.csv. Usado para preencher
    `EnvironmentalContext.camera_present` por área."""
    with Path(csv_path).open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def load_dominio_territorial(csv_path: Path) -> list[dict]:
    """Lê dominio_territorial.csv. Usado para anotar área de ORCRIM
    no `EnvironmentalContext.extra_notes_text`."""
    with Path(csv_path).open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────


def _safe_int(v) -> Optional[int]:
    try:
        return int(float(v)) if v not in (None, "", " ") else None
    except (TypeError, ValueError):
        return None


def _safe_float(v) -> Optional[float]:
    try:
        return float(v) if v not in (None, "", " ") else None
    except (TypeError, ValueError):
        return None


def _normalize_comma_decimal(v: Optional[str]) -> Optional[str]:
    """Disque Denúncia salva lat/lon com vírgula decimal ('-22,899555')."""
    if v is None:
        return None
    return v.replace(",", ".")


def _compose_date_iso(ano, mes, data) -> Optional[str]:
    """O CSV de ocorrências às vezes tem `data` em branco mas ano+mes preenchidos."""
    if data:
        try:
            # tenta vários formatos comuns
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
                try:
                    return datetime.strptime(data, fmt).date().isoformat()
                except ValueError:
                    continue
        except Exception:
            pass
    if ano and mes:
        try:
            return f"{int(float(ano)):04d}-{int(float(mes)):02d}-01"
        except (TypeError, ValueError):
            return None
    return None


def _parse_br_date_to_iso(v: Optional[str]) -> Optional[str]:
    """Disque Denúncia salva data como '6/4/2020 8:16:00' — mês/dia ambíguo,
    mas o dataset usa mm/dd/yyyy (formato US apesar do dado brasileiro)."""
    if not v:
        return None
    head = v.split(" ", 1)[0]
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(head, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _row_hash(row: dict) -> str:
    """Fallback ID quando a linha não traz identificador estável."""
    import hashlib
    material = "|".join(f"{k}={row[k]}" for k in sorted(row.keys())).encode("utf-8")
    return hashlib.sha1(material).hexdigest()[:16]
