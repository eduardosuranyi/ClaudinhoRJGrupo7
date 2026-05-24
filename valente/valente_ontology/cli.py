"""
CLI da pipeline ontológica — typer.

Comandos:

    extract <source>   — roda extração de uma fonte (ocorrencias|disque|relints|tweets|news|all)
    stats              — sumariza o JSONL de eventos (totais por fonte/crime_type)
    schema             — imprime o JSON Schema da ontologia
    score              — calcula score ontológico por área/logradouro, gera JSON
    fleet              — distribui efetivo (600 agentes default) a partir do score
    reindex-areas      — preenche spatial.area_fm via point-in-polygon
    init-fm-actions    — cria um exemplo de actions.jsonl
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import typer

from valente_ontology import pipeline as ppl
from valente_ontology.classified_store import ClassifiedTweetStore
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
def score(
    window_days: int = typer.Option(
        30, "--window-days", "-w",
        help="Janela temporal em dias (padrão: 30 dias rolantes).",
    ),
):
    """Calcula score ontológico por área FM + top logradouros.

    Lê `data/ontology/crime_events.jsonl`, computa as 5 camadas
    (severidade do evento, agregação, ambiente, fonte, feedback FM) e
    grava `data/scores/score_report.json` — consumível pelo frontend.
    """
    from valente_ontology import score as score_mod
    settings.ensure_dirs()
    out = score_mod.run_score(settings, window_days=window_days)
    typer.echo(f"Score report gerado em: {out}")


@app.command()
def fleet(
    size: int = typer.Option(600, "--size", "-n", help="Efetivo total a distribuir."),
    min_per_area: int = typer.Option(25, "--min", help="Piso de agentes por área."),
    max_share: float = typer.Option(0.35, "--max-share", help="Teto de share por área (0..1)."),
    window_days: int = typer.Option(30, "--window-days", "-w"),
):
    """Distribui efetivo entre as áreas FM com base no score ontológico.

    Gera `data/scores/fleet_plan.json` com efetivo total, divisão por
    turno (daypart) e justificativa por área.
    """
    from valente_ontology import score as score_mod
    from valente_ontology import fleet_allocation as fleet_mod

    settings.ensure_dirs()
    report = score_mod.build_score_report(settings, window_days=window_days)
    plan = fleet_mod.allocate_fleet(
        report,
        fleet_size=size,
        min_agents_per_area=min_per_area,
        max_share=max_share,
    )
    out_path = settings.valente_data_dir / "scores" / "fleet_plan.json"
    fleet_mod.write_fleet_plan(plan, out_path)
    typer.echo(f"Fleet plan gerado em: {out_path}")
    typer.echo(json.dumps(
        {
            "fleet_size": plan.fleet_size,
            "areas": [
                {"area": a.area_fm, "agents": a.agents_total, "score": a.score, "priority": a.priority}
                for a in plan.allocations
            ],
        },
        indent=2, ensure_ascii=False,
    ))


@app.command("init-fm-actions")
def init_fm_actions():
    """Cria/anexa um exemplo de ação FM em data/fm_actions/actions.jsonl."""
    settings.ensure_dirs()
    write_example_actions(settings.fm_actions_path)
    typer.echo(f"Exemplo escrito em {settings.fm_actions_path}")


@app.command("reindex-areas")
def reindex_areas(
    force: bool = typer.Option(
        False, "--force",
        help="Sobrescreve area_fm mesmo em eventos que já têm valor — útil "
             "quando o GeoJSON foi atualizado. Default: só preenche os que "
             "estão null.",
    ),
):
    """Re-mapeia spatial.area_fm via point-in-polygon nos eventos existentes.

    Lê crime_events.jsonl, faz lookup nos eventos com lat/lon válidos, e
    regrava o arquivo de uma vez (operação batch — não usa upsert linha
    a linha). Idempotente: rodar duas vezes não muda nada.
    """
    from valente_ontology.geo import load_fm_polygons

    path = settings.crime_events_path
    if not path.exists():
        typer.echo(f"Nada para fazer — {path} não existe.")
        raise typer.Exit(code=0)

    fm_idx = load_fm_polygons()
    if fm_idx is None:
        typer.echo("GeoJSON de áreas FM não encontrado — abortando.")
        raise typer.Exit(code=1)

    n_total = 0
    n_updated = 0
    n_already = 0
    n_no_coords = 0
    tmp = path.with_suffix(path.suffix + ".tmp")

    with path.open("r", encoding="utf-8") as fin, tmp.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            n_total += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                fout.write(line + "\n")
                continue

            spatial = obj.get("spatial") or {}
            current = spatial.get("area_fm")
            lat = spatial.get("latitude")
            lon = spatial.get("longitude")

            if current and not force:
                n_already += 1
                fout.write(line + "\n")
                continue
            if lat is None or lon is None:
                n_no_coords += 1
                fout.write(line + "\n")
                continue

            new_area = fm_idx.find(lat, lon)
            if new_area is None or new_area == current:
                fout.write(line + "\n")
                continue

            spatial["area_fm"] = new_area
            obj["spatial"] = spatial
            fout.write(json.dumps(obj, ensure_ascii=False) + "\n")
            n_updated += 1

    tmp.replace(path)
    typer.echo(json.dumps({
        "total_events": n_total,
        "updated": n_updated,
        "already_had_area": n_already,
        "skipped_no_coords": n_no_coords,
    }, indent=2, ensure_ascii=False))


@app.command("classify-tweets")
def classify_tweets(
    limit: Optional[int] = typer.Option(
        None, "--limit", "-l",
        help="Máximo de tweets por conta nesta rodada (debug/teste).",
    ),
):
    """Aplica o classificador de relevância nos tweets brutos.

    Lê `data/raw/*.jsonl` (output do valente-scraper) e grava o veredicto
    em `data/classified/tweets/{user}.jsonl`. Idempotente: pula tweets
    já classificados.
    """
    settings.ensure_dirs()
    summary = ppl.run_classify_tweets(settings, limit_per_account=limit)
    typer.echo(json.dumps(summary, indent=2, ensure_ascii=False))


@app.command("classified-stats")
def classified_stats(
    user: Optional[str] = typer.Option(None, "--user", "-u", help="Filtra por conta."),
):
    """Resumo do JSONL de tweets classificados (por categoria/relevância/conta)."""
    cstore = ClassifiedTweetStore(settings.classified_tweets_dir)
    typer.echo(json.dumps(cstore.stats(user), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    app()
