"""
Persistência dos CrimeEvent — JSONL append-only com dedupe por event_id.

Motivações:
  - JSONL é simples, streaming-friendly e tolerável até centenas de milhares
    de linhas. Quando o volume crescer, migrar para Parquet/SQLite é um
    upgrade isolado (event.model_dump → polars → write_parquet).
  - Dedupe por `event_id` (determinístico, derivado de source) torna o
    pipeline idempotente: re-rodar não duplica. Re-extrair com ontologia
    nova produz o mesmo event_id e SOBRESCREVE a versão antiga (modo "upsert").
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator, Optional

from valente_ontology.ontology import CrimeEvent


class EventStore:
    """Storage append-only para CrimeEvent."""

    def __init__(self, jsonl_path: Path):
        self.path = Path(jsonl_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._known_ids: Optional[set[str]] = None

    # ── leitura ────────────────────────────────────────────────────────

    def iter_events(self) -> Iterator[CrimeEvent]:
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield CrimeEvent.model_validate_json(line)
                except Exception:
                    continue   # linha corrompida — ignora silenciosamente

    def known_event_ids(self) -> set[str]:
        """Lê o arquivo uma vez e cacheia a lista de event_ids já gravados.
        Usado pelo pipeline para skipar extração quando já existe."""
        if self._known_ids is None:
            ids: set[str] = set()
            if self.path.exists():
                with self.path.open("r", encoding="utf-8") as fh:
                    for line in fh:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                            ids.add(obj.get("event_id"))
                        except json.JSONDecodeError:
                            continue
            self._known_ids = ids
        return self._known_ids

    # ── escrita ────────────────────────────────────────────────────────

    def append(self, event: CrimeEvent) -> bool:
        """Acrescenta o evento se ainda não existe. Devolve True se gravou."""
        known = self.known_event_ids()
        if event.event_id in known:
            return False
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(event.to_jsonl_line() + "\n")
        known.add(event.event_id)
        return True

    def upsert(self, event: CrimeEvent) -> None:
        """Sobrescreve a versão anterior do mesmo event_id (caso ontologia mude).

        Implementação simples: reescreve o arquivo. Para volumes grandes,
        migrar para SQLite/Parquet."""
        path = self.path
        if not path.exists():
            self.append(event)
            return
        tmp = path.with_suffix(path.suffix + ".tmp")
        replaced = False
        with path.open("r", encoding="utf-8") as fin, tmp.open("w", encoding="utf-8") as fout:
            for line in fin:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("event_id") == event.event_id:
                    fout.write(event.to_jsonl_line() + "\n")
                    replaced = True
                else:
                    fout.write(line + "\n")
            if not replaced:
                fout.write(event.to_jsonl_line() + "\n")
        tmp.replace(path)
        # invalida cache
        self._known_ids = None

    # ── estatísticas ──────────────────────────────────────────────────

    def stats(self) -> dict:
        """Conta eventos por kind/crime_type/extraction.method. Útil pra CLI."""
        from collections import Counter

        by_kind = Counter()
        by_crime = Counter()
        by_method = Counter()
        total = 0
        for ev in self.iter_events():
            total += 1
            by_kind[ev.source.kind.value] += 1
            by_crime[ev.crime_type.value] += 1
            by_method[ev.extraction.method.value] += 1
        return {
            "total": total,
            "by_source_kind": dict(by_kind),
            "by_crime_type": dict(by_crime),
            "by_extraction_method": dict(by_method),
        }
