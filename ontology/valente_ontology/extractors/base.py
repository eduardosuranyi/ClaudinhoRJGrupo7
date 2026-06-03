"""Interface comum dos extractors."""

from __future__ import annotations

from typing import Optional, Protocol

from valente_ontology.loaders.base import RawSource
from valente_ontology.ontology import CrimeEvent


class Extractor(Protocol):
    """Recebe um RawSource e devolve CrimeEvent (ou None se o registro
    não for um evento criminal — texto irrelevante, denúncia de outra
    natureza, etc.)."""

    name: str

    def extract(self, source: RawSource) -> Optional[CrimeEvent]: ...
