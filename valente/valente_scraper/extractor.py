"""Extração de tweets por conta via NitterClient.

Estratégia:
    1. Carrega checkpoint (último tweet_id visto) e ids já gravados no JSONL.
    2. Busca a 1ª página da timeline em uma instância Nitter (Playwright passa
       pelo Anubis).
    3. Pagina via `cursor` retornado em `show-more` até bater UMA destas:
        - `max_tweets` configurado, OU
        - cursor ausente (fim da timeline), OU
        - toda página é anterior a `since_date` (atingiu janela mínima), OU
        - toda página já estava no JSONL E backfill=False (caught up).
    4. Grava lote a lote (resiliente).

Modo `backfill=True`:
    Não dispara o caught-up. Útil quando o JSONL já tem os recentes e quero
    descer no histórico até `since_date` (ou até o cursor esgotar).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date, datetime

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
    oldest_date: datetime | None = None
    newest_date: datetime | None = None
    pages_fetched: int = 0
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
        since_date: date | None = self.settings.valente_since_date
        backfill: bool = self.settings.valente_backfill
        log_every: int = max(1, self.settings.valente_log_every_n_pages)

        logger.info(
            "[{}] Iniciando extração — checkpoint={} já_no_jsonl={} max={} since={} backfill={}",
            username, prev_last_id, len(known_ids),
            self.settings.valente_max_tweets_per_account,
            since_date, backfill,
        )

        fetched_new = 0
        newest_id_this_run: str | None = None
        oldest_date_seen: datetime | None = None
        newest_date_seen: datetime | None = None
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
                if newest_date_seen is None and tweets:
                    newest_date_seen = tweets[0].created_at

                # Triagem da página
                fresh: list[RawTweet] = []
                page_known = 0
                page_too_old = 0
                for tw in tweets:
                    # Atualiza tracking do tweet mais antigo visto
                    if oldest_date_seen is None or tw.created_at < oldest_date_seen:
                        oldest_date_seen = tw.created_at

                    # Janela temporal (since_date)
                    if since_date and tw.created_at.date() < since_date:
                        page_too_old += 1
                        continue

                    if tw.tweet_id in known_ids:
                        page_known += 1
                        continue

                    fresh.append(tw)
                    known_ids.add(tw.tweet_id)
                    if len(fresh) + fetched_new >= self.settings.valente_max_tweets_per_account:
                        break

                written = self.store.append(username, fresh)
                fetched_new += written

                # Log de progresso (sempre na 1ª página; depois a cada N)
                if page_n == 1 or page_n % log_every == 0:
                    logger.info(
                        "[{}] página {} | novos={} já_conhecidos={} fora_janela={} cursor_próximo={} total_novos={} mais_antigo={}",
                        username, page_n, written, page_known, page_too_old,
                        bool(next_cursor), fetched_new,
                        oldest_date_seen.date() if oldest_date_seen else None,
                    )

                # Janela temporal atingida: toda página é antes do since.
                if since_date and page_too_old > 0 and not fresh and page_known == 0:
                    logger.info(
                        "[{}] Janela temporal atingida ({} tweets <{}). Encerrando.",
                        username, page_too_old, since_date,
                    )
                    break

                # Caught up: página inteira já era conhecida.
                # No modo backfill, ignoramos isso e continuamos descendo.
                if not backfill and page_known > 0 and not fresh and page_too_old == 0:
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
            return ExtractionResult(
                username, fetched_new, fetched_new, newest_id_this_run,
                oldest_date=oldest_date_seen, newest_date=newest_date_seen,
                pages_fetched=page_n, error=str(exc),
            )

        self.store.save_checkpoint(username, newest_id_this_run or prev_last_id, len(known_ids))
        logger.success(
            "[{}] Concluído: páginas={} novos={} range=[{} → {}]",
            username, page_n, fetched_new,
            oldest_date_seen.date() if oldest_date_seen else None,
            newest_date_seen.date() if newest_date_seen else None,
        )
        return ExtractionResult(
            username, fetched_new, fetched_new, newest_id_this_run,
            oldest_date=oldest_date_seen, newest_date=newest_date_seen,
            pages_fetched=page_n,
        )
