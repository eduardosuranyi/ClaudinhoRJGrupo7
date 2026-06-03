"""CLI de extração — entry point do scrapper.

Uso:
    uv run python -m valente_scraper.main run                   # todas as contas do accounts.txt
    uv run python -m valente_scraper.main run --user PMERJ      # apenas uma
    uv run python -m valente_scraper.main run --max 100         # limita volume por conta
    uv run python -m valente_scraper.main accounts              # lista as contas configuradas
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date
from typing import Annotated

import typer
from loguru import logger

from .accounts import load_accounts
from .config import settings
from .extractor import ExtractionResult, TweetExtractor
from .news import PORTALS, NewsCrawler, NewsStore
from .nitter_client import NitterClient
from .storage import TweetStore


app = typer.Typer(add_completion=False, no_args_is_help=True, help=__doc__)


def _setup_logger(verbose: bool) -> None:
    logger.remove()
    logger.add(
        sys.stderr,
        level="DEBUG" if verbose else "INFO",
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <7}</level> | {message}",
    )


@app.command(help="Lista as contas configuradas em accounts.txt.")
def accounts() -> None:
    users = load_accounts(settings.valente_accounts_file)
    typer.echo(f"{len(users)} contas em {settings.valente_accounts_file}:")
    for u in users:
        typer.echo(f"  - {u}")


@app.command(help="Extrai tweets das contas configuradas (via Nitter + Playwright).")
def run(
    user: Annotated[
        str | None,
        typer.Option("--user", "-u", help="Username único (ignora accounts.txt)."),
    ] = None,
    max_tweets: Annotated[
        int | None,
        typer.Option("--max", "-m", help="Sobrescreve VALENTE_MAX_TWEETS_PER_ACCOUNT."),
    ] = None,
    since: Annotated[
        str | None,
        typer.Option(
            "--since", "-s",
            help="Data ISO YYYY-MM-DD; para quando atingir tweets anteriores.",
        ),
    ] = None,
    backfill: Annotated[
        bool,
        typer.Option(
            "--backfill", "-b",
            help="Modo histórico: ignora 'caught up' e desce até esgotar cursor ou --since.",
        ),
    ] = False,
    nitter_host: Annotated[
        str | None,
        typer.Option(
            "--nitter-host",
            help="Força uma instância Nitter específica (ex.: https://lightbrd.com). "
                 "Por default usa o pool com failover.",
        ),
    ] = None,
    verbose: Annotated[bool, typer.Option("--verbose", "-v")] = False,
) -> None:
    _setup_logger(verbose)
    settings.ensure_dirs()

    if max_tweets is not None:
        settings.valente_max_tweets_per_account = max_tweets

    if since:
        try:
            settings.valente_since_date = date.fromisoformat(since)
        except ValueError as exc:
            logger.error("--since inválido: {} ({})", since, exc)
            raise typer.Exit(code=2)

    if backfill:
        settings.valente_backfill = True

    usernames = [user] if user else load_accounts(settings.valente_accounts_file)
    if not usernames:
        logger.error("Nenhuma conta para processar.")
        raise typer.Exit(code=1)

    logger.info("Contas alvo: {}", ", ".join(usernames))
    results = asyncio.run(_run_all(usernames, nitter_host=nitter_host))
    _print_summary(results)


async def _run_all(
    usernames: list[str], nitter_host: str | None = None,
) -> list[ExtractionResult]:
    store = TweetStore(settings.raw_dir, settings.state_dir)
    results: list[ExtractionResult] = []
    hosts = [nitter_host] if nitter_host else None
    async with NitterClient(hosts=hosts) as client:
        extractor = TweetExtractor(client, store, settings)
        for username in usernames:
            result = await extractor.extract(username)
            results.append(result)
    return results


def _print_summary(results: list[ExtractionResult]) -> None:
    total_new = sum(r.new for r in results)
    failed = [r for r in results if r.error]

    typer.echo("")
    typer.echo("=" * 78)
    typer.echo(f"Resumo: {len(results)} contas | novos={total_new}")
    typer.echo("=" * 78)
    for r in results:
        status = "OK" if not r.error else f"ERRO ({r.error[:40]})"
        rng = ""
        if r.oldest_date and r.newest_date:
            rng = f"  range=[{r.oldest_date.date()} → {r.newest_date.date()}]"
        typer.echo(f"  {r.username:<22} new={r.new:<5} pgs={r.pages_fetched:<3}{rng}  {status}")
    if failed:
        typer.echo("")
        typer.echo(f"{len(failed)} conta(s) com erro — verifique logs.")


@app.command("scrape-news", help="Crawler de portais de notícia RJ (Extra, etc).")
def scrape_news(
    portal: Annotated[
        str,
        typer.Option(
            "--portal", "-p",
            help=f"Portal alvo. Conhecidos: {', '.join(PORTALS)}.",
        ),
    ] = "extra",
    max_articles: Annotated[
        int,
        typer.Option("--max", "-m", help="Limite de novos artigos por execução."),
    ] = 50,
    verbose: Annotated[bool, typer.Option("--verbose", "-v")] = False,
) -> None:
    _setup_logger(verbose)
    settings.valente_data_dir.mkdir(parents=True, exist_ok=True)
    settings.news_raw_dir.mkdir(parents=True, exist_ok=True)

    store = NewsStore(settings.news_raw_dir)
    crawler = NewsCrawler(store, settings, portal=portal)
    result = asyncio.run(crawler.crawl(max_articles=max_articles))

    typer.echo("")
    typer.echo("=" * 60)
    typer.echo(
        f"news/{portal} | fetched={result['fetched']} novos={result['new']} erros={result['errors']}"
    )
    typer.echo(f"output: {store.path_for(PORTALS[portal]['slug'])}")
    typer.echo("=" * 60)


if __name__ == "__main__":
    app()
