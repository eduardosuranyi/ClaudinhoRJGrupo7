"""Persistência em JSONL — um arquivo por conta, append-only com dedupe.

Layout em disco:
    data/raw/{username}.jsonl       # 1 tweet por linha (RawTweet)
    data/state/{username}.json      # checkpoint: último tweet visto

A dedupe é em memória, carregando os ids do JSONL existente. Para o volume
esperado (centenas/milhares por conta) é trivial; se crescer, troca por um
índice sqlite.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from loguru import logger

from .models import RawTweet


class TweetStore:
    """Append-only JSONL writer com dedupe por tweet_id."""

    def __init__(self, raw_dir: Path, state_dir: Path):
        self.raw_dir = raw_dir
        self.state_dir = state_dir
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------
    # paths
    # ---------------------------------------------------------------

    def raw_path(self, username: str) -> Path:
        return self.raw_dir / f"{username.lower()}.jsonl"

    def state_path(self, username: str) -> Path:
        return self.state_dir / f"{username.lower()}.json"

    # ---------------------------------------------------------------
    # dedupe
    # ---------------------------------------------------------------

    def existing_ids(self, username: str) -> set[str]:
        path = self.raw_path(username)
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

    # ---------------------------------------------------------------
    # write
    # ---------------------------------------------------------------

    def append(self, username: str, tweets: list[RawTweet]) -> int:
        """Anexa tweets ignorando os já presentes. Retorna o número escrito."""
        if not tweets:
            return 0
        known = self.existing_ids(username)
        path = self.raw_path(username)
        written = 0
        with path.open("a", encoding="utf-8") as fh:
            for tw in tweets:
                if tw.tweet_id in known:
                    continue
                fh.write(tw.to_jsonl_line())
                fh.write("\n")
                known.add(tw.tweet_id)
                written += 1
        if written:
            logger.info("[{}] {} novos tweets gravados em {}", username, written, path.name)
        else:
            logger.info("[{}] Nada novo (todos já estavam no JSONL).", username)
        return written

    # ---------------------------------------------------------------
    # checkpoint
    # ---------------------------------------------------------------

    def load_checkpoint(self, username: str) -> dict:
        path = self.state_path(username)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def save_checkpoint(self, username: str, last_tweet_id: str | None, count_total: int) -> None:
        path = self.state_path(username)
        payload = {
            "username": username,
            "last_tweet_id": last_tweet_id,
            "count_total": count_total,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
