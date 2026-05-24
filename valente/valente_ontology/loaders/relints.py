"""
Loader dos RELINTs (Relatórios de Inteligência de Área) — arquivos .docx
em `claude_impact_lab_compstat_rio/relints/`.

Cada RELINT descreve uma área FM inteira (não um evento isolado). Por isso
**um RELINT pode gerar múltiplos RawSource** — um por seção / parágrafo
analisável que descreva um evento ou padrão de eventos. A segmentação fina
fica para o LLM extractor; aqui só recortamos por seções razoavelmente
auto-contidas.

Estratégia de chunking:

  1. Lê o .docx via `python-docx` (lê arquivos .docx puros sem precisar de Word).
  2. Concatena parágrafos preservando títulos/headings.
  3. Quebra em chunks de ~2000 caracteres respeitando fronteiras de heading
     (chunks pequenos = LLM mais preciso; o trade-off é mais chamadas de API).
  4. Cada chunk vira um RawSource com `source_id = "<arquivo>:<chunk_idx>"`.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Iterator

from valente_ontology.enums import SourceKind
from valente_ontology.loaders.base import RawSource


# Heurística para encontrar a qual área FM o RELINT pertence (pelo nome do arquivo).
# Mantém o mesmo mapeamento usado em luiz/pipeline/ingest.py.
_RELINT_AREA_MAP = {
    "RI_010": "Rodoviária - Terminal Gentileza - Estação Leopoldina",
    "RI_011": "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria",
    "RI_012": "Jardim de Alah",
    "RI_013": "Campo Grande: Estação de Trem - Calçadão",
    "RI_014": "Rio Sul",
    "RI_015": "Praia de Botafogo - Rua Marquês de Abrantes",
    "RI_016": "Estações São Francisco Xavier - Afonso Pena",
    "RI_017": "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
}


CHUNK_TARGET = 2000   # caracteres
CHUNK_MAX = 3500


class RelintLoader:
    """Lê todos os .docx de uma pasta e gera chunks como RawSource."""

    kind = SourceKind.RELINT
    reliability = 0.95

    def __init__(self, relints_dir: Path):
        self.dir = Path(relints_dir)

    def iter_sources(self) -> Iterator[RawSource]:
        for path in sorted(self.dir.glob("*.docx")):
            area = _infer_area_from_filename(path.name)
            mtime = datetime.fromtimestamp(path.stat().st_mtime)
            full_text = _read_docx_text(path)
            for idx, chunk in enumerate(_chunk_text(full_text)):
                yield RawSource(
                    kind=self.kind,
                    source_id=f"{path.stem}:{idx:03d}",
                    source_file=str(path),
                    captured_at=mtime,
                    reliability=self.reliability,
                    raw_text=chunk,
                    structured_fields={"area_fm": area, "chunk_index": idx},
                    hint_logradouro=None,
                    hint_area_fm=area,
                )


def _infer_area_from_filename(name: str) -> str | None:
    m = re.search(r"RI_(\d{3})", name)
    if not m:
        return None
    return _RELINT_AREA_MAP.get(f"RI_{m.group(1)}")


def _read_docx_text(path: Path) -> str:
    """Lê o .docx parágrafo a parágrafo. Tolerante: se python-docx não
    estiver instalado, lê o XML cru do .docx via zipfile."""
    try:
        from docx import Document  # type: ignore
    except ImportError:
        return _read_docx_text_fallback(path)

    doc = Document(str(path))
    parts: list[str] = []
    for p in doc.paragraphs:
        txt = (p.text or "").strip()
        if not txt:
            continue
        # marca headings com prefixo para o chunker respeitar
        style = (getattr(p.style, "name", "") or "").lower()
        if "heading" in style:
            parts.append(f"\n\n## {txt}\n")
        else:
            parts.append(txt)
    return "\n".join(parts)


def _read_docx_text_fallback(path: Path) -> str:
    """Fallback sem python-docx: extrai texto do XML interno."""
    import zipfile
    import xml.etree.ElementTree as ET

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(path) as z:
        with z.open("word/document.xml") as fh:
            tree = ET.parse(fh)
    parts: list[str] = []
    for p in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        runs = [t.text or "" for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
        txt = "".join(runs).strip()
        if txt:
            parts.append(txt)
    return "\n".join(parts)


def _chunk_text(text: str) -> Iterator[str]:
    """Quebra texto em chunks ~CHUNK_TARGET caracteres respeitando parágrafos
    e fronteiras de heading (linhas iniciando com '## ')."""
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    buf: list[str] = []
    buf_len = 0

    def flush():
        nonlocal buf, buf_len
        if buf:
            yield_text = "\n".join(buf).strip()
            buf = []
            buf_len = 0
            return yield_text
        return None

    for para in paragraphs:
        is_heading = para.startswith("##")
        if is_heading and buf_len > 0:
            out = flush()
            if out:
                yield out
        plen = len(para) + 1
        if buf_len + plen > CHUNK_MAX:
            out = flush()
            if out:
                yield out
        buf.append(para)
        buf_len += plen
        if buf_len >= CHUNK_TARGET and not is_heading:
            out = flush()
            if out:
                yield out
    out = flush()
    if out:
        yield out
