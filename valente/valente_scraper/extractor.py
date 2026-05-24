"""Extração de tweets por conta via NitterClient.

Estratégia:
    1. Carrega checkpoint (último tweet_id visto) e ids já gravados no JSONL.
    2. Busca a 1ª página da timeline em uma instância Nitter (Playwright passa
       pelo Anubis).
    3. Pagina via `cursor` retornado em `show-more` até bater:
        - `max_tweets` configurado, OU
        - cursor ausente (fim da timeline), OU
        - todos os tweets da página já estavam no JSONL (caught up).
    4. Grava lote a lote (resiliente).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from loguru import logger

from .config import Settings
from .models import RawTweet
from .nitter_client import NitterClient
from .nitter_parser import parse_timeline
from .storage import TweetStore


@dataclass
class ExtractionResult:
    username: str
    fetched: int
    new: int
    last_tweet_id: str | None
    error: str | None = None


class TweetExtractor:
    def __init__(self, client: NitterClient, store: TweetStore, settings: Settings):
        self.client = client
        self.store = store
        self.settings = settings

    async def extract(self, username: str) -> ExtractionResult:
        known_ids = self.store.existing_ids(username)
        checkpoint = self.store.load_checkpoint(username)
        prev_last_id = checkpoint.get("last_tweet_id")

        logger.info(
            "[{}] Iniciando extração — checkpoint={} já_no_jsonl={} max={}",
            username, prev_last_id, len(known_ids),
            self.settings.valente_max_tweets_per_account,
        )

        fetched_new = 0
        newest_id_this_run: str | None = None
        cursor: str | None = None
        page_n = 0

        try:
            while fetched_new < self.settings.valente_max_tweets_per_account:
                page_n += 1
                fetch = await self.client.fetch_profile(username, cursor=cursor)
                tweets, next_cursor = parse_timeline(fetch.html, account=username)

                if not tweets:
                    logger.warning("[{}] página {} sem tweets — encerrando.", username, page_n)
                    break

                if newest_id_this_run is None:
                    newest_id_this_run = tweets[0].tweet_id

                # Filtra já conhecidos
                fresh: list[RawTweet] = []
                page_known = 0
                for tw in tweets:
                    if tw.tweet_id in known_ids:
                        page_known += 1
                        continue
                    fresh.append(tw)
                    known_ids.add(tw.tweet_id)
                    if len(fresh) + fetched_new >= self.settings.valente_max_tweets_per_account:
                        break

                written = self.store.append(username, fresh)
                fetched_new += written

                logger.info(
                    "[{}] página {} | novos={} já_conhecidos={} cursor_próximo={}",
                    username, page_n, written, page_known, bool(next_cursor),
                )

                # Caught up: página inteira já era conhecida
                if page_known > 0 and not fresh:
                    logger.info("[{}] Caught up — toda a página já estava no JSONL.", username)
                    break

                if not next_cursor:
                    logger.info("[{}] Sem cursor seguinte — fim da timeline.", username)
                    break

                cursor = next_cursor
                await asyncio.sleep(self.settings.valente_rate_limit_sleep)

        except Exception as exc:
            logger.exception("[{}] Erro inesperado: {}", username, exc)
            self.store.save_checkpoint(username, newest_id_this_run or prev_last_id, len(known_ids))
            return ExtractionResult(username, fetched_new, fetched_new, newest_id_this_run, error=str(exc))

        self.store.save_checkpoint(username, newest_id_this_run or prev_last_id, len(known_ids))
        logger.success("[{}] Concluído: new={}", username, fetched_new)
        return ExtractionResult(username, fetched_new, fetched_new, newest_id_this_run)
