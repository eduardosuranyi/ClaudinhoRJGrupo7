"""
Orquestrador da pipeline ontológica.

Cada `run_*` recebe um loader e roteia para o extractor adequado:

  - Fontes tabulares (ocorrência oficial)  → structured_mapper
  - Disque Denúncia                        → structured + LLM enrichment (HYBRID)
  - Tweets / RELINT chunks / Notícias      → LLM
  - FM Actions                             → trilha paralela (não vira CrimeEvent)

`run_all` executa tudo na ordem de menor → maior custo (LLM por último),
respeitando dedupe via EventStore.
"""

from __future__ import annotations

import logging
from typing import Iterable, Optional

import json
from pathlib import Path

from valente_ontology.classified_store import ClassifiedTweetStore
from valente_ontology.config import OntologySettings, settings as default_settings
from valente_ontology.enums import ExtractionMethod, SourceKind
from valente_ontology.extractors import llm as llm_extractor
from valente_ontology.extractors import relevance as relevance_module
from valente_ontology.extractors import structured
from valente_ontology.loaders.base import RawSource
from valente_ontology.loaders.compstat import (
    DisqueDenunciaLoader,
    OcorrenciasLoader,
)
from valente_ontology.loaders.fm_actions import FMActionLoader
from valente_ontology.loaders.news import NewsLoader
from valente_ontology.loaders.relints import RelintLoader
from valente_ontology.loaders.tweets import TweetLoader
from valente_ontology.loaders.tweets_classified import ClassifiedTweetLoader
from valente_ontology.ontology import CrimeEvent
from valente_ontology.storage import EventStore


log = logging.getLogger("valente_ontology.pipeline")


# ─────────────────────────────────────────────────────────────────────────
# API principal
# ─────────────────────────────────────────────────────────────────────────


def build_llm_extractor(cfg: OntologySettings) -> object:
    """Constrói o LLMExtractor real ou um stub offline (sem API key)."""
    if not cfg.anthropic_api_key:
        log.warning("ANTHROPIC_API_KEY não configurada — usando extractor offline (stub).")
        return llm_extractor.build_offline_stub_extractor()
    return llm_extractor.LLMExtractor(
        api_key=cfg.anthropic_api_key,
        model=cfg.anthropic_model,
        max_tokens=cfg.llm_max_tokens,
        temperature=cfg.llm_temperature,
    )


def build_relevance_classifier(cfg: OntologySettings) -> object:
    """Constrói o RelevanceClassifier real ou um stub offline."""
    if not cfg.anthropic_api_key:
        log.warning("ANTHROPIC_API_KEY ausente — relevance classifier em modo stub (descarta tudo).")
        return relevance_module.build_offline_stub_classifier()
    return relevance_module.RelevanceClassifier(
        api_key=cfg.anthropic_api_key,
        model=cfg.anthropic_model,
        temperature=cfg.llm_temperature,
    )


def run_ocorrencias(
    store: EventStore,
    cfg: OntologySettings = default_settings,
    limit: Optional[int] = None,
) -> int:
    """Extração determinística do CSV de ocorrências. Sem LLM."""
    if not cfg.ocorrencias_csv.exists():
        log.warning("Ocorrências CSV não encontrado: %s", cfg.ocorrencias_csv)
        return 0
    loader = OcorrenciasLoader(cfg.ocorrencias_csv)
    return _drain_structured(loader.iter_sources(), store, limit=limit)


def run_disque_denuncia(
    store: EventStore,
    cfg: OntologySettings = default_settings,
    limit: Optional[int] = None,
    llm=None,
) -> int:
    """Extração HYBRID: campos estruturados (envolvidos.*) + LLM enriquece o
    `relato_redacted` quando habilitado em config."""
    if not cfg.disque_denuncia_csv.exists():
        log.warning("Disque Denúncia CSV não encontrado: %s", cfg.disque_denuncia_csv)
        return 0
    loader = DisqueDenunciaLoader(cfg.disque_denuncia_csv)
    if cfg.enable_hybrid_disque and llm is None:
        llm = build_llm_extractor(cfg)
    return _drain_hybrid(loader.iter_sources(), store, llm=llm if cfg.enable_hybrid_disque else None, limit=limit)


def run_relints(
    store: EventStore,
    cfg: OntologySettings = default_settings,
    limit: Optional[int] = None,
    llm=None,
) -> int:
    """LLM por chunk de RELINT."""
    if not cfg.relints_dir.exists():
        log.warning("Pasta de RELINTs não encontrada: %s", cfg.relints_dir)
        return 0
    loader = RelintLoader(cfg.relints_dir)
    llm = llm or build_llm_extractor(cfg)
    return _drain_llm(loader.iter_sources(), store, llm=llm, limit=limit)


def run_tweets(
    store: EventStore,
    cfg: OntologySettings = default_settings,
    limit: Optional[int] = None,
    llm=None,
    use_classified: bool = True,
    min_confidence: float = 0.5,
) -> int:
    """Extrai CrimeEvent dos tweets via LLM.

    `use_classified` (default True): só processa tweets que a etapa de
    classificação marcou como relevantes (lê `data/classified/tweets/`).
    Isso evita gastar tokens caros do extractor ontológico em conteúdo
    descartado. Requer rodar `classify-tweets` antes — se a pasta não
    existir, processa zero tweets.

    `use_classified=False` cai no comportamento antigo (TweetLoader com
    keyword pre-filter). Útil pra debugging ou quando o classifier não
    pode ser usado (sem API key).
    """
    if use_classified:
        loader = ClassifiedTweetLoader(
            cfg.classified_tweets_dir,
            min_confidence=min_confidence,
        )
        if not cfg.classified_tweets_dir.exists():
            log.warning(
                "data/classified/tweets/ não existe — rode "
                "`valente-ontology classify-tweets` primeiro, ou passe "
                "use_classified=False para usar o keyword pre-filter."
            )
            return 0
    else:
        loader = TweetLoader(cfg.tweet_raw_dir)
    llm = llm or build_llm_extractor(cfg)
    return _drain_llm(loader.iter_sources(), store, llm=llm, limit=limit)


def run_classify_tweets(
    cfg: OntologySettings = default_settings,
    limit_per_account: Optional[int] = None,
    classifier=None,
) -> dict[str, dict[str, int]]:
    """Aplica RelevanceClassifier nos tweets brutos e grava em
    `data/classified/tweets/{user}.jsonl`.

    - Lê diretamente os JSONL de `data/raw/` (não passa pelo TweetLoader,
      que faz keyword filtering — aqui queremos veredicto para TODO tweet
      bruto, inclusive os que o keyword cortaria, para auditoria).
    - Pula tweets já classificados (idempotente).

    Returns:
        {username: {"classified": N_novos, "relevantes": M, "descartados": K}}
    """
    cfg.ensure_dirs()
    cstore = ClassifiedTweetStore(cfg.classified_tweets_dir)
    classifier = classifier or build_relevance_classifier(cfg)

    raw_dir = Path(cfg.tweet_raw_dir)
    if not raw_dir.exists():
        log.warning("Pasta de tweets brutos não existe: %s", raw_dir)
        return {}

    summary: dict[str, dict[str, int]] = {}
    for raw_path in sorted(raw_dir.glob("*.jsonl")):
        username = raw_path.stem
        known = cstore.classified_ids(username)
        n_classified = 0
        n_rel = 0
        n_disc = 0

        with raw_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                if limit_per_account is not None and n_classified >= limit_per_account:
                    break
                try:
                    tweet = json.loads(line)
                except json.JSONDecodeError:
                    continue

                tid = tweet.get("tweet_id")
                if not tid or tid in known:
                    continue

                verdict = classifier.classify(tweet)
                if verdict is None:
                    log.debug("Tweet %s sem veredicto (None) — pulando.", tid)
                    continue

                record = dict(tweet)
                record["relevance"] = json.loads(verdict.to_jsonl_line())
                if cstore.append(username, record):
                    n_classified += 1
                    known.add(tid)
                    if verdict.is_relevant:
                        n_rel += 1
                    else:
                        n_disc += 1

        if n_classified:
            log.info(
                "[%s] classificados=%d relevantes=%d descartados=%d",
                username, n_classified, n_rel, n_disc,
            )
        summary[username] = {
            "classified": n_classified,
            "relevantes": n_rel,
            "descartados": n_disc,
        }
    return summary


def run_news(
    store: EventStore,
    cfg: OntologySettings = default_settings,
    limit: Optional[int] = None,
    llm=None,
) -> int:
    """LLM por artigo de notícia. Inerte se não houver pasta news_raw/."""
    loader = NewsLoader(cfg.news_raw_dir)
    llm = llm or build_llm_extractor(cfg)
    return _drain_llm(loader.iter_sources(), store, llm=llm, limit=limit)


def run_fm_actions(cfg: OntologySettings = default_settings) -> int:
    """Lê as ações da FM. Não gera CrimeEvent — só conta quantas existem
    para que o CLI exiba diagnóstico."""
    loader = FMActionLoader(cfg.fm_actions_path)
    return sum(1 for _ in loader.iter_actions())


def run_all(
    cfg: OntologySettings = default_settings,
    sources: Optional[list[str]] = None,
    limit_per_source: Optional[int] = None,
) -> dict[str, int]:
    """Executa todas as fontes (ou um subset) e devolve {fonte: n_eventos_novos}."""
    cfg.ensure_dirs()
    store = EventStore(cfg.crime_events_path)
    sources = sources or ["ocorrencias", "disque", "relints", "tweets", "news"]
    llm = None
    if any(s in sources for s in ("disque", "relints", "tweets", "news")):
        llm = build_llm_extractor(cfg)

    counts: dict[str, int] = {}
    if "ocorrencias" in sources:
        counts["ocorrencias"] = run_ocorrencias(store, cfg, limit=limit_per_source)
    if "disque" in sources:
        counts["disque_denuncia"] = run_disque_denuncia(store, cfg, limit=limit_per_source, llm=llm)
    if "relints" in sources:
        counts["relints"] = run_relints(store, cfg, limit=limit_per_source, llm=llm)
    if "tweets" in sources:
        counts["tweets"] = run_tweets(store, cfg, limit=limit_per_source, llm=llm)
    if "news" in sources:
        counts["news"] = run_news(store, cfg, limit=limit_per_source, llm=llm)
    if "fm_actions" in sources:
        counts["fm_actions"] = run_fm_actions(cfg)
    return counts


# ─────────────────────────────────────────────────────────────────────────
# Internals — três modos de drenagem
# ─────────────────────────────────────────────────────────────────────────


def _drain_structured(
    sources: Iterable[RawSource],
    store: EventStore,
    limit: Optional[int] = None,
) -> int:
    written = 0
    known = store.known_event_ids()
    for i, src in enumerate(sources):
        if limit is not None and i >= limit:
            break
        eid = CrimeEvent.make_event_id(src.kind, src.source_id)
        if eid in known:
            continue
        event = structured.extract(src)
        if event is None:
            continue
        if store.append(event):
            written += 1
    return written


def _drain_llm(
    sources: Iterable[RawSource],
    store: EventStore,
    llm,
    limit: Optional[int] = None,
) -> int:
    written = 0
    known = store.known_event_ids()
    for i, src in enumerate(sources):
        if limit is not None and i >= limit:
            break
        eid = CrimeEvent.make_event_id(src.kind, src.source_id)
        if eid in known:
            continue
        event = llm.extract(src)
        if event is None:
            continue
        if store.append(event):
            written += 1
    return written


def _drain_hybrid(
    sources: Iterable[RawSource],
    store: EventStore,
    llm,
    limit: Optional[int] = None,
) -> int:
    """Modo HYBRID: extrai estruturado primeiro; se tem relato e LLM
    disponível, chama LLM e merge — campos LLM preenchem onde o estruturado
    deixou em DESCONHECIDO."""
    written = 0
    known = store.known_event_ids()
    for i, src in enumerate(sources):
        if limit is not None and i >= limit:
            break
        eid = CrimeEvent.make_event_id(src.kind, src.source_id)
        if eid in known:
            continue
        base = structured.extract(src)
        if base is None:
            continue
        if llm is not None and src.raw_text:
            enriched = llm.extract(src)
            if enriched is not None:
                base = _merge_events(structured_base=base, llm_overlay=enriched)
        if store.append(base):
            written += 1
    return written


def _merge_events(structured_base: CrimeEvent, llm_overlay: CrimeEvent) -> CrimeEvent:
    """Merge não-destrutivo: campos do `structured_base` ganham, EXCETO
    quando o base está em DESCONHECIDO/None — aí o overlay LLM preenche.

    Implementação minimalista: usa o dump dos dois e faz preferência por
    valores não-"desconhecido". Suficiente para o nível atual; um merge
    mais sofisticado (campo a campo, com regras por entidade) entra
    quando começarmos a medir conflitos."""
    base_dump = structured_base.model_dump(mode="json")
    over_dump = llm_overlay.model_dump(mode="json")

    merged = _merge_dicts(base_dump, over_dump)

    # marca a extração como HYBRID e mantém a melhor confiança
    merged["extraction"] = {
        "method": ExtractionMethod.HYBRID.value,
        "model_id": llm_overlay.extraction.model_id,
        "ontology_version": structured_base.extraction.ontology_version,
        "extracted_at": llm_overlay.extraction.extracted_at.isoformat(),
        "confidence": max(
            structured_base.extraction.confidence,
            llm_overlay.extraction.confidence,
        ),
        "notes": "Merge estruturado (Disque Denúncia campos tabulares) + LLM "
                 "(relato_redacted).",
    }
    # source é o tabular (mantém raw_text e reliability originais)
    merged["source"] = base_dump["source"]
    merged["event_id"] = base_dump["event_id"]
    return CrimeEvent.model_validate(merged)


_UNKNOWN_TOKENS = {"desconhecido", "desconhecida", None}


def _merge_dicts(base: dict, overlay: dict) -> dict:
    """Para cada chave, base vence se valor "concreto"; overlay preenche caso
    contrário. Listas vazias no base aceitam overlay se overlay tem itens."""
    out = dict(base)
    for k, v_over in overlay.items():
        if k not in out:
            out[k] = v_over
            continue
        v_base = out[k]
        if isinstance(v_base, dict) and isinstance(v_over, dict):
            out[k] = _merge_dicts(v_base, v_over)
        elif isinstance(v_base, list) and isinstance(v_over, list):
            out[k] = v_base if v_base else v_over
        else:
            if v_base in _UNKNOWN_TOKENS or v_base == "" or v_base == []:
                out[k] = v_over
    return out
