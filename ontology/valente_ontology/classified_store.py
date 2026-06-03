"""
Persistência da camada de classificação de relevância dos tweets.

Arquivo por conta: `data/classified/tweets/{username}.jsonl`. Cada linha
contém o tweet bruto + um objeto `relevance` com o veredicto. Manter
TODOS os tweets (relevantes e irrelevantes) é importante para:
  - Auditoria do que foi descartado
  - Cache: não reclassificar o mesmo tweet 2x
  - Permitir mudar prompt/critério e reclassificar offline

Formato:
    {
      "tweet_id": "...",
      "account": "...",
      "text": "...",
      ...                                # campos originais do RawTweet
      "relevance": {                     # objeto TweetRelevance (sempre presente)
        "is_rio_de_janeiro": ...,
        "category": "...",
        "is_relevant": ...,
        "confidence": ...,
        "reasoning": "...",
        "classified_at": "...",
        "model_id": "..."
      }
    }
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Iterator, Optional


class ClassifiedTweetStore:
    """JSONL append-only por conta, com dedupe por tweet_id."""

    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    # ── paths ──────────────────────────────────────────────────────────

    def path_for(self, username: str) -> Path:
        return self.base_dir / f"{username.lower()}.jsonl"

    # ── leitura ────────────────────────────────────────────────────────

    def classified_ids(self, username: str) -> set[str]:
        """Set de tweet_ids já classificados (para skipar na próxima rodada)."""
        path = self.path_for(username)
        if not path.exists():
            return set()
        ids: set[str] = set()
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    ids.add(json.loads(line)["tweet_id"])
                except (json.JSONDecodeError, KeyError):
                    continue
        return ids

    def iter_records(self, username: Optional[str] = None) -> Iterator[dict]:
        """Itera os JSONL classificados, opcionalmente de uma conta só."""
        paths = (
            [self.path_for(username)] if username
            else sorted(self.base_dir.glob("*.jsonl"))
        )
        for path in paths:
            if not path.exists():
                continue
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue

    # ── escrita ────────────────────────────────────────────────────────

    def append(self, username: str, tweet_with_relevance: dict) -> bool:
        """Anexa um registro classificado. Devolve True se gravou (False se já existia)."""
        known = self.classified_ids(username)
        tid = tweet_with_relevance.get("tweet_id")
        if not tid or tid in known:
            return False
        with self.path_for(username).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(tweet_with_relevance, ensure_ascii=False) + "\n")
        return True

    # ── estatísticas ───────────────────────────────────────────────────

    def stats(self, username: Optional[str] = None) -> dict:
        """Agrega contagens — total, por categoria, por relevância, por conta."""
        total = 0
        by_category: Counter = Counter()
        by_relevance: Counter = Counter()
        by_rj: Counter = Counter()
        by_account: Counter = Counter()
        for r in self.iter_records(username):
            total += 1
            rel = r.get("relevance") or {}
            by_category[rel.get("category", "?")] += 1
            by_relevance["relevante" if rel.get("is_relevant") else "descartado"] += 1
            by_rj["rj" if rel.get("is_rio_de_janeiro") else "fora_rj"] += 1
            by_account[r.get("account", "?")] += 1
        return {
            "total": total,
            "by_category": dict(by_category),
            "by_relevance": dict(by_relevance),
            "by_region": dict(by_rj),
            "by_account": dict(by_account),
        }
