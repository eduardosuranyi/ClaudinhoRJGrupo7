"""
Loader dos tweets coletados pelo `valente_scraper` — lê os JSONL de
`valente/data/raw/*.jsonl` (output do scraper irmão).

Cada tweet vira **um** RawSource. Aplica-se um filtro mínimo de relevância
(palavras-chave de crime patrimonial + filtros estruturais), mas **não**
faz extração ontológica — isso fica para o extractor LLM, que recebe o
texto bruto.

O filtro de relevância é intencionalmente permissivo: o LLM extractor
descarta o que não for evento criminal (devolvendo `crime_type=DESCONHECIDO`
+ `confidence=0`); o pré-filtro só serve para economizar tokens nos casos
óbvios (ex.: tweet promocional, propaganda política).
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

from valente_ontology.enums import SourceKind
from valente_ontology.loaders.base import RawSource


# Palavras-chave de pré-filtro. Não pretende ser exaustivo — é só um
# coador grosso para evitar gastar tokens em tweets obviamente irrelevantes.
_KW_RE = re.compile(
    r"\b(roubo|roubad[ao]|assalt|furto|furtad|arrast[aã]o|sequestr|"
    r"levaram|atira|tiroteio|invad|esfaqu)",
    re.IGNORECASE,
)


class TweetLoader:
    """Lê todos os *.jsonl de uma pasta `raw/`. Skipa retweets puros
    quando solicitado (RTs costumam duplicar a informação)."""

    kind = SourceKind.TWEET
    reliability = 0.5  # postagem pública não verificada

    def __init__(
        self,
        raw_dir: Path,
        skip_retweets: bool = True,
        only_keyword_match: bool = True,
    ):
        self.raw_dir = Path(raw_dir)
        self.skip_retweets = skip_retweets
        self.only_keyword_match = only_keyword_match

    def iter_sources(self) -> Iterator[RawSource]:
        if not self.raw_dir.exists():
            return
        for path in sorted(self.raw_dir.glob("*.jsonl")):
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if self.skip_retweets and row.get("is_retweet"):
                        continue
                    text = (row.get("text") or "").strip()
                    if not text:
                        continue
                    if self.only_keyword_match and not _KW_RE.search(text):
                        continue
                    yield RawSource(
                        kind=self.kind,
                        source_id=str(row.get("tweet_id")),
                        source_file=str(path),
                        captured_at=_parse_iso(row.get("created_at")) or datetime.utcnow(),
                        reliability=self.reliability,
                        raw_text=text,
                        structured_fields={
                            "author_username": row.get("author_username"),
                            "account": row.get("account"),
                            "hashtags": row.get("hashtags") or [],
                            "mentioned_users": row.get("mentioned_users") or [],
                            "urls": row.get("urls") or [],
                            "retweet_count": row.get("retweet_count"),
                            "favorite_count": row.get("favorite_count"),
                            "source_url": row.get("source_url"),
                        },
                    )


def _parse_iso(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
