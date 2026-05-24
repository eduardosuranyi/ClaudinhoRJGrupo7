"""
CLI da pipeline ontológica — typer.

Comandos:

    extract <source>   — roda extração de uma fonte (ocorrencias|disque|relints|tweets|news|all)
    stats              — sumariza o JSONL de eventos (totais por fonte/crime_type)
    schema             — imprime o JSON Schema da ontologia
    score              — placeholder; calcula score a partir dos eventos (TODO)
    init-fm-actions    — cria um exemplo de actions.jsonl
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import typer

from valente_ontology import pipeline as ppl
from valente_ontology.config import settings
from valente_ontology.loaders.fm_actions import write_example_actions
from valente_ontology.ontology import CrimeEvent
from valente_ontology.storage import EventStore


app = typer.Typer(
    name="valente-ontology",
    help="Pipeline ontológica de incidências criminais (input → CrimeEvent JSONL).",
    no_args_is_help=True,
)


@app.callback()
def _root(verbose: bool = typer.Option(False, "-v", help="Log DEBUG.")):
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )


@app.command()
def extract(
    source: str = typer.Argument(
        ...,
        help="Fonte: ocorrencias | disque | relints | tweets | news | fm_actions | all",
    ),
    limit: Optional[int] = typer.Option(None, help="Limite por fonte (debug)."),
):
    """Extrai CrimeEvents da fonte indicada e grava no JSONL canônico."""
    settings.ensure_dirs()
    sources_map = {
        "ocorrencias": ["ocorrencias"],
        "disque": ["disque"],
        "relints": ["relints"],
        "tweets": ["tweets"],
        "news": ["news"],
        "fm_actions": ["fm_actions"],
        "all": ["ocorrencias", "disque", "relints", "tweets", "news", "fm_actions"],
    }
    if source not in sources_map:
        raise typer.BadParameter(f"Fonte desconhecida: {source}")
    counts = ppl.run_all(settings, sources=sources_map[source], limit_per_source=limit)
    typer.echo(json.dumps(counts, indent=2, ensure_ascii=False))


@app.command()
def stats():
    """Sumariza o JSONL de eventos."""
    store = EventStore(settings.crime_events_path)
    typer.echo(json.dumps(store.stats(), indent=2, ensure_ascii=False))


@app.command()
def schema():
    """Imprime o JSON Schema completo do CrimeEvent."""
    typer.echo(json.dumps(CrimeEvent.model_json_schema(), indent=2, ensure_ascii=False))


@app.command()
def score():
    """Placeholder — score ainda não implementado."""
    from valente_ontology import score as score_mod
    score_mod.run_score(settings)   # vai levantar NotImplementedError com mensagem útil


@app.command("init-fm-actions")
def init_fm_actions():
    """Cria/anexa um exemplo de ação FM em data/fm_actions/actions.jsonl."""
    settings.ensure_dirs()
    write_example_actions(settings.fm_actions_path)
    typer.echo(f"Exemplo escrito em {settings.fm_actions_path}")


if __name__ == "__main__":
    app()
