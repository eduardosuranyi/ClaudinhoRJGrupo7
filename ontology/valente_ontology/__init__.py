"""
valente_ontology — Pipeline ontológica de incidências criminais.

Transforma dados não-estruturados de múltiplas fontes (CSV de ocorrências,
Disque Denúncia, RELINTs, tweets, histórico de ações da FM e — futuramente —
portais de notícia) em eventos criminais estruturados (`CrimeEvent`) seguindo
a ontologia definida em `entities.py` + `ontology.py`.

O `CrimeEvent` é o artefato canônico do sistema. Um score downstream
(`score.py`, ainda não implementado) consumirá esses eventos para orientar
a ação da Força Municipal.

Pipeline:

    loaders/*  ──►  RawSource (texto livre + metadados)
                       │
                       ▼
                  extractors/*  ──►  CrimeEvent (estruturado)
                       │
                       ▼
                   storage  ──►  data/ontology/crime_events.jsonl
                       │
                       ▼
                   score.py  ──►  prioridade operacional  (TODO)
"""

from valente_ontology.ontology import CrimeEvent, SourceMetadata, ExtractionMetadata
from valente_ontology.entities import (
    Victim,
    Agent,
    Vehicle,
    Weapon,
    StolenItem,
    ApproachMode,
    EscapeMode,
    TemporalContext,
    SpatialContext,
    EnvironmentalContext,
    Outcome,
)

__all__ = [
    "CrimeEvent",
    "SourceMetadata",
    "ExtractionMetadata",
    "Victim",
    "Agent",
    "Vehicle",
    "Weapon",
    "StolenItem",
    "ApproachMode",
    "EscapeMode",
    "TemporalContext",
    "SpatialContext",
    "EnvironmentalContext",
    "Outcome",
]
