"""
Loader que lê os tweets **já classificados como relevantes** em
`data/classified/tweets/*.jsonl` e os entrega como `RawSource` para o
extractor ontológico.

Por que existir em vez de filtrar dentro do TweetLoader original:
    - Separação de fontes: o classificador é uma etapa explícita do pipeline.
      Manter loaders dedicados (raw vs classified) torna o gráfico de
      dependências legível e permite re-rodar só a parte que mudou.
    - O extractor ontológico recebe categoria + reasoning como contexto
      extra (em structured_fields), economizando inferência sobre o que
      o classificador já decidiu.

Pré-requisito: `valente-ontology classify-tweets` precisa ter rodado antes.
Se não rodou, este loader emite zero `RawSource`s (não falha).
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

from valente_ontology.enums import SourceKind
from valente_ontology.loaders.base import RawSource


class ClassifiedTweetLoader:
    """Lê JSONL classificado e emite RawSource APENAS para os relevantes.

    Mesma semântica do TweetLoader original (skip retweets, kind=TWEET),
    mas a decisão de incluir/excluir já está materializada no JSONL
    classificado — não chama o classificador novamente.
    """

    kind = SourceKind.TWEET
    reliability = 0.5

    def __init__(
        self,
        classified_dir: Path,
        skip_retweets: bool = True,
        min_confidence: float = 0.0,
    ):
        self.classified_dir = Path(classified_dir)
        self.skip_retweets = skip_retweets
        self.min_confidence = min_confidence

    def iter_sources(self) -> Iterator[RawSource]:
        if not self.classified_dir.exists():
            return
        for path in sorted(self.classified_dir.glob("*.jsonl")):
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    rel = row.get("relevance") or {}
                    if not rel.get("is_relevant"):
                        continue
                    if (rel.get("confidence") or 0.0) < self.min_confidence:
                        continue
                    if self.skip_retweets and row.get("is_retweet"):
                        continue
                    text = (row.get("text") or "").strip()
                    if not text:
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
                            # Contexto da etapa anterior — o LLM extractor pode usar:
                            "relevance_category": rel.get("category"),
                            "relevance_reasoning": rel.get("reasoning"),
                            "relevance_confidence": rel.get("confidence"),
                        },
                    )


def _parse_iso(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
