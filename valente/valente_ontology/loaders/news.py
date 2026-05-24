"""
Loader de notícias web — **ESQUELETO**, não usado ainda.

Quando ativarmos, o fluxo será:

    1. Crawler periódico (Playwright + parser) baixa artigos de portais
       configurados em `news_sources.toml`, salva em `data/news_raw/{slug}.jsonl`
       (um artigo por linha).
    2. Este loader lê esses JSONLs e devolve RawSource(kind=NEWS_ARTICLE).
    3. Extractor LLM processa normalmente (notícia é texto livre como tweet).

Schema do JSONL esperado (estabilizado já agora para o crawler poder ser
escrito independentemente):

    {
      "article_id": "<sha1 do url canônico>",
      "url": "https://...",
      "domain": "g1.globo.com",
      "published_at": "2026-05-12T08:31:00-03:00",
      "fetched_at": "2026-05-12T09:00:14Z",
      "title": "Assalto em frente à Central do Brasil...",
      "subtitle": "Vítima conseguiu escapar...",
      "body_text": "Texto puro do artigo (HTML removido)",
      "author": "...",
      "section": "rio",
      "tags": ["seguranca", "central-do-brasil"]
    }
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

from valente_ontology.enums import SourceKind
from valente_ontology.loaders.base import RawSource


class NewsLoader:
    """Lê JSONLs de notícia. Inerte (vazio) se a pasta não existir."""

    kind = SourceKind.NEWS_ARTICLE
    reliability = 0.6  # mais confiável que tweet, menos que ocorrência oficial

    def __init__(self, news_raw_dir: Path):
        self.news_raw_dir = Path(news_raw_dir)

    def iter_sources(self) -> Iterator[RawSource]:
        if not self.news_raw_dir.exists():
            return
        for path in sorted(self.news_raw_dir.glob("*.jsonl")):
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    body = (row.get("body_text") or "").strip()
                    if not body:
                        continue
                    title = (row.get("title") or "").strip()
                    subtitle = (row.get("subtitle") or "").strip()
                    combined = "\n\n".join(p for p in (title, subtitle, body) if p)
                    yield RawSource(
                        kind=self.kind,
                        source_id=str(row.get("article_id") or row.get("url")),
                        source_file=str(path),
                        captured_at=_parse_iso(row.get("fetched_at")) or datetime.utcnow(),
                        reliability=self.reliability,
                        raw_text=combined[:6000],   # cap conservador
                        structured_fields={
                            "url": row.get("url"),
                            "domain": row.get("domain"),
                            "published_at": row.get("published_at"),
                            "section": row.get("section"),
                            "tags": row.get("tags") or [],
                            "author": row.get("author"),
                        },
                    )


def _parse_iso(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


# ─── Esqueleto do crawler ──────────────────────────────────────────────
# A intenção é deixar pré-definida a forma do config. O código real do
# crawler (Playwright + parsers por domínio) entra depois.

NEWS_SOURCES_CONFIG_SCHEMA: dict = {
    "version": 1,
    "sources": [
        # Exemplo (placeholder — não é portal real):
        # {
        #     "slug": "g1-rio",
        #     "domain": "g1.globo.com",
        #     "list_url": "https://g1.globo.com/rj/rio-de-janeiro/",
        #     "article_link_selector": "a.feed-post-link",
        #     "title_selector": "h1.content-head__title",
        #     "body_selector": "article p",
        #     "published_meta": 'meta[property="article:published_time"]',
        #     "rate_limit_sec": 3.0,
        # },
    ],
}


def write_default_config(target: Path) -> None:
    """Materializa um config exemplo. Útil quando o crawler for plugado."""
    import json as _json
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(_json.dumps(NEWS_SOURCES_CONFIG_SCHEMA, indent=2), encoding="utf-8")
