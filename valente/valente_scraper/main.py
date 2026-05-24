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
from typing import Annotated

import typer
from loguru import logger

from .accounts import load_accounts
from .config import settings
from .extractor import ExtractionResult, TweetExtractor
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
    verbose: Annotated[bool, typer.Option("--verbose", "-v")] = False,
) -> None:
    _setup_logger(verbose)
    settings.ensure_dirs()

    if max_tweets is not None:
        settings.valente_max_tweets_per_account = max_tweets

    usernames = [user] if user else load_accounts(settings.valente_accounts_file)
    if not usernames:
        logger.error("Nenhuma conta para processar.")
        raise typer.Exit(code=1)

    logger.info("Contas alvo: {}", ", ".join(usernames))
    results = asyncio.run(_run_all(usernames))
    _print_summary(results)


async def _run_all(usernames: list[str]) -> list[ExtractionResult]:
    store = TweetStore(settings.raw_dir, settings.state_dir)
    results: list[ExtractionResult] = []
    async with NitterClient() as client:
        extractor = TweetExtractor(client, store, settings)
        for username in usernames:
            result = await extractor.extract(username)
            results.append(result)
    return results


def _print_summary(results: list[ExtractionResult]) -> None:
    total_new = sum(r.new for r in results)
    failed = [r for r in results if r.error]

    typer.echo("")
    typer.echo("=" * 60)
    typer.echo(f"Resumo: {len(results)} contas | novos={total_new}")
    typer.echo("=" * 60)
    for r in results:
        status = "OK" if not r.error else f"ERRO ({r.error[:40]})"
        typer.echo(f"  {r.username:<25} new={r.new:<5} {status}")
    if failed:
        typer.echo("")
        typer.echo(f"{len(failed)} conta(s) com erro — verifique logs.")


if __name__ == "__main__":
    app()
