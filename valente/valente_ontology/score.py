"""
Score ontológico — converte `CrimeEvent` em prioridade operacional.

Cinco camadas (ver `score_weights.py` para pesos numéricos):

  A. S_event  — severidade por evento (0–100)
  B. S_loc    — agregação por unidade (logradouro|área) × janela
  C. M_env    — multiplicador ambiental (0.80–1.50)
  D. W_src    — peso da fonte/corroboração (0.70–1.20)
  E. Δ_fb     — ajuste de feedback de FMAction (−20…+10)

  SCORE = clamp((S_loc · M_env · W_src) + Δ_fb, 0, 100)

Toda contribuição parcial é registrada em um `ScoreBreakdown` —
o frontend usa essa estrutura para mostrar AO USUÁRIO **por que** uma
área pontuou X, em vez de só exibir o número.
"""

from __future__ import annotations

import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional

from pydantic import BaseModel, ConfigDict, Field

from valente_ontology import score_weights as W
from valente_ontology.config import OntologySettings
from valente_ontology.enums import (
    AgeBracket,
    CrimeOutcomeStatus,
    SourceKind,
    WeaponType,
)
from valente_ontology.loaders.fm_actions import FMAction, FMActionLoader
from valente_ontology.ontology import CrimeEvent
from valente_ontology.storage import EventStore


# ─────────────────────────────────────────────────────────────────────────
# Modelos de output — JSON-friendly, consumidos pelo frontend
# ─────────────────────────────────────────────────────────────────────────


class Reason(BaseModel):
    """Uma razão atômica para o score. Frontend renderiza como bullet.

    Exemplos:
      kind='event'     code='weapon.arma_fogo.used'   delta=+20.0  label='Arma de fogo disparada'
      kind='env_combo' code='combo.ilum_vege'         delta=+1.15  label='Iluminação + vegetação'
      kind='feedback'  code='fb.success'              delta=-15.0  label='Reparo de iluminação reduziu 34%'
    """

    model_config = ConfigDict(extra="forbid")

    kind: str = Field(description="event | aggregate | env | source | feedback")
    code: str = Field(description="ID curto, machine-readable, para filtro/i18n.")
    label: str = Field(description="Texto humano, em PT, pra UI.")
    delta: float = Field(description="Valor numérico que esta razão contribuiu.")
    is_multiplier: bool = Field(
        default=False,
        description="True quando `delta` é um fator (×), não soma (+).",
    )
    weight: float = Field(
        default=1.0,
        description="Importância relativa pra ordenar razões na UI (0..1).",
    )
    evidence: Optional[str] = Field(
        default=None,
        description="Texto curto que justifica (ex.: 'em 14 dos 23 eventos').",
    )


class EventSummary(BaseModel):
    """Resumo de um evento que mais pesou no score. Top-N exibidos na UI."""

    model_config = ConfigDict(extra="forbid")

    event_id: str
    crime_type: str
    s_event: float
    date_iso: Optional[str] = None
    hour_24: Optional[int] = None
    logradouro: Optional[str] = None
    weapons: list[str] = Field(default_factory=list)
    tactics: list[str] = Field(default_factory=list)
    outcome: Optional[str] = None
    source_kind: str = ""


class ScoreBreakdown(BaseModel):
    """Decomposição completa — auditável e renderizável."""

    model_config = ConfigDict(extra="forbid")

    s_event_sum: float = Field(description="Soma de S_event dos eventos da unidade.")
    s_event_top3_mean: float = Field(description="Média dos top-3 S_event.")
    temporal_concentration: float = Field(
        description="1 − Gini do histograma de hora-do-dia (0=disperso, 1=concentrado).",
    )

    s_loc_raw: float = Field(description="Score agregado antes dos multiplicadores.")
    m_env: float = Field(description="Multiplicador ambiental.")
    w_src: float = Field(description="Multiplicador de fonte/corroboração.")
    delta_fb: float = Field(description="Ajuste de feedback de FMAction.")

    final_score: float = Field(description="SCORE final, 0–100.")
    priority: str = Field(description="CRITICA | ALTA | MEDIA | BAIXA.")

    events_considered: int
    distinct_source_kinds: int
    window_start_iso: str
    window_end_iso: str

    reasons: list[Reason] = Field(default_factory=list)
    top_events: list[EventSummary] = Field(default_factory=list)


class AreaScore(BaseModel):
    """Score por área FM."""

    model_config = ConfigDict(extra="forbid")

    area_fm: str
    breakdown: ScoreBreakdown


class LogradouroScore(BaseModel):
    """Score por logradouro normalizado."""

    model_config = ConfigDict(extra="forbid")

    logradouro: str
    area_fm: Optional[str] = None
    breakdown: ScoreBreakdown


class ScoreReport(BaseModel):
    """Artefato final exportado para JSON, consumido pelo frontend."""

    model_config = ConfigDict(extra="forbid")

    generated_at: datetime = Field(default_factory=datetime.utcnow)
    ontology_version: str = "0.1.0"
    window_days: int
    window_start_iso: str
    window_end_iso: str
    areas: list[AreaScore] = Field(default_factory=list)
    logradouros: list[LogradouroScore] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────
# Camada A — S_event
# ─────────────────────────────────────────────────────────────────────────


@dataclass
class _EventScored:
    event: CrimeEvent
    s_event: float
    contributions: list[Reason] = field(default_factory=list)


def score_event(ev: CrimeEvent) -> _EventScored:
    """Calcula S_event e registra as razões parciais.

    Cada subcamada é independente e zerada por valor `desconhecido`/`null`.
    """
    reasons: list[Reason] = []
    total = 0.0

    # — crime_type base —
    base = W.CRIME_TYPE_WEIGHT.get(ev.crime_type, 4)
    total += base
    if base > 0:
        reasons.append(Reason(
            kind="event", code=f"crime_type.{ev.crime_type.value}",
            label=f"Tipo do crime: {ev.crime_type.value.replace('_', ' ')}",
            delta=base, weight=base / 25,
        ))

    # — arma —
    weapon_pts = 0.0
    weapon_detail = []
    for w in ev.weapons:
        bandished, used = W.WEAPON_WEIGHT.get(w.type, (0, 0))
        pts = used if w.used else (bandished if w.brandished else 0)
        if pts > 0:
            weapon_pts += pts
            weapon_detail.append(f"{w.type.value}{'+usada' if w.used else '+exibida'}")
    weapon_pts = min(weapon_pts, W.WEAPON_CAP)
    if weapon_pts > 0:
        total += weapon_pts
        reasons.append(Reason(
            kind="event", code="weapon.total",
            label=f"Arma: {', '.join(weapon_detail)}",
            delta=weapon_pts, weight=weapon_pts / W.WEAPON_CAP,
        ))

    # — modus operandi —
    mo_pts = 0.0
    mo_seen = []
    for t in ev.modus_operandi.tactics:
        pts = W.MO_WEIGHT.get(t, 0)
        if pts > 0:
            mo_pts += pts
            mo_seen.append(t.value)
    mo_pts = min(mo_pts, W.MO_CAP)
    if mo_pts > 0:
        total += mo_pts
        reasons.append(Reason(
            kind="event", code="mo.total",
            label=f"Modus operandi: {', '.join(mo_seen[:3])}{' …' if len(mo_seen) > 3 else ''}",
            delta=mo_pts, weight=mo_pts / W.MO_CAP,
        ))

    # — vulnerabilidade da vítima —
    victim_pts = 0.0
    killed_seen = False
    for v in ev.victims:
        victim_pts += W.VICTIM_AGE_WEIGHT.get(v.age_bracket, 0)
        if v.exposed_item_before:
            victim_pts += W.EXPOSED_ITEM_WEIGHT
        if v.injured:
            victim_pts += W.INJURED_WEIGHT
        if v.killed:
            killed_seen = True
    if killed_seen:
        victim_pts = max(victim_pts, W.KILLED_FLOOR)
    victim_pts = min(victim_pts, W.VICTIM_CAP)
    if victim_pts > 0:
        total += victim_pts
        labels = []
        if killed_seen:
            labels.append("vítima fatal")
        if any(v.injured for v in ev.victims):
            labels.append("vítima ferida")
        if any(v.age_bracket in (AgeBracket.IDOSO, AgeBracket.CRIANCA) for v in ev.victims):
            labels.append("vítima vulnerável (idoso/criança)")
        if any(v.exposed_item_before for v in ev.victims):
            labels.append("item à mostra")
        reasons.append(Reason(
            kind="event", code="victim.vulnerability",
            label="Vítima: " + (", ".join(labels) if labels else "fator presente"),
            delta=victim_pts, weight=victim_pts / W.VICTIM_CAP,
        ))

    # — desfecho —
    out_pts = W.OUTCOME_WEIGHT.get(ev.outcome.status, 0)
    out_pts = min(out_pts, W.OUTCOME_CAP)
    if out_pts > 0:
        total += out_pts
        reasons.append(Reason(
            kind="event", code=f"outcome.{ev.outcome.status.value}",
            label=f"Desfecho: {ev.outcome.status.value.replace('_', ' ')}",
            delta=out_pts, weight=out_pts / W.OUTCOME_CAP,
        ))

    # — organização do agente —
    org_pts = 0.0
    if ev.agent_count_total and ev.agent_count_total >= 2:
        org_pts += W.ORG_MULTI_AGENT_WEIGHT
    org_pts += W.ORG_APPROACH_STRUCTURED.get(ev.approach.type, 0)
    org_pts += W.ORG_ESCAPE_STRUCTURED.get(ev.escape.type, 0)
    org_pts = min(org_pts, W.ORG_CAP)
    if org_pts > 0:
        total += org_pts
        bits = []
        if ev.agent_count_total and ev.agent_count_total >= 2:
            bits.append(f"{ev.agent_count_total} agentes")
        if ev.approach.type.value not in ("desconhecida", "outra"):
            bits.append(f"abordagem {ev.approach.type.value}")
        if ev.escape.type.value not in ("desconhecida", "outra", "nao_fugiu"):
            bits.append(f"fuga {ev.escape.type.value}")
        reasons.append(Reason(
            kind="event", code="agent.organization",
            label="Organização do agente: " + (", ".join(bits) if bits else "indícios"),
            delta=org_pts, weight=org_pts / W.ORG_CAP,
        ))

    # — itens —
    item_pts = 0.0
    item_kinds = []
    for it in ev.stolen_items:
        pts = W.ITEM_WEIGHT.get(it.type, 0) * max(it.quantity, 1)
        item_pts += pts
        if pts > 0:
            item_kinds.append(it.type.value)
    item_pts = min(item_pts, W.ITEM_CAP)
    if item_pts > 0:
        total += item_pts
        reasons.append(Reason(
            kind="event", code="items.total",
            label=f"Itens de alto impacto: {', '.join(item_kinds[:3])}",
            delta=item_pts, weight=item_pts / W.ITEM_CAP,
        ))

    # — floor mínimo —
    total = max(total, W.EVENT_FLOOR)
    total = min(total, W.EVENT_CEIL)

    return _EventScored(event=ev, s_event=total, contributions=reasons)


# ─────────────────────────────────────────────────────────────────────────
# Camada B — Agregação espacial
# ─────────────────────────────────────────────────────────────────────────


def _temporal_concentration(events: list[CrimeEvent]) -> float:
    """1 − Gini do histograma de hora-do-dia. 0 = totalmente disperso,
    1 = todos os eventos na mesma hora."""
    hours = [e.temporal.hour_24 for e in events if e.temporal.hour_24 is not None]
    if len(hours) < 3:
        return 0.0
    bins = [0] * 24
    for h in hours:
        bins[h] += 1
    n = sum(bins)
    if n == 0:
        return 0.0
    sorted_bins = sorted(bins)
    cum = 0.0
    for i, v in enumerate(sorted_bins, start=1):
        cum += i * v
    gini = (2 * cum) / (24 * n) - (24 + 1) / 24
    return max(0.0, min(1.0, gini))


def _aggregate(scored: list[_EventScored]) -> tuple[float, ScoreBreakdown, list[Reason]]:
    """Aplica a fórmula de agregação e devolve (s_loc_raw, breakdown_seed, reasons)."""
    reasons: list[Reason] = []

    if not scored:
        seed = ScoreBreakdown(
            s_event_sum=0.0, s_event_top3_mean=0.0, temporal_concentration=0.0,
            s_loc_raw=0.0, m_env=1.0, w_src=1.0, delta_fb=0.0,
            final_score=0.0, priority="BAIXA",
            events_considered=0, distinct_source_kinds=0,
            window_start_iso="", window_end_iso="",
        )
        return 0.0, seed, reasons

    s_sum = sum(s.s_event for s in scored)
    top3 = sorted((s.s_event for s in scored), reverse=True)[:3]
    top3_mean = statistics.mean(top3) if top3 else 0.0
    concentration = _temporal_concentration([s.event for s in scored])

    volume_pts = W.AGG_ALPHA * math.log10(1 + s_sum) * 10
    extreme_pts = W.AGG_BETA * (top3_mean / 100.0) * 30
    pattern_pts = W.AGG_GAMMA * concentration

    s_loc_raw = min(volume_pts + extreme_pts + pattern_pts, W.AGG_CEIL)

    reasons.append(Reason(
        kind="aggregate", code="agg.volume",
        label=f"Volume de gravidade: {len(scored)} eventos, soma S_event = {s_sum:.0f}",
        delta=volume_pts, weight=volume_pts / W.AGG_CEIL,
        evidence=f"{len(scored)} eventos com S_event médio {s_sum/len(scored):.1f}",
    ))
    if top3_mean > 0:
        reasons.append(Reason(
            kind="aggregate", code="agg.extreme",
            label=f"Eventos mais graves: top-3 média {top3_mean:.0f}/100",
            delta=extreme_pts, weight=extreme_pts / W.AGG_CEIL,
        ))
    if concentration > 0.3:
        reasons.append(Reason(
            kind="aggregate", code="agg.pattern",
            label=f"Concentração temporal: {concentration*100:.0f}% (padrão de turno)",
            delta=pattern_pts, weight=pattern_pts / W.AGG_CEIL,
            evidence="indício de grupo agindo em janela operacional fixa",
        ))

    seed = ScoreBreakdown(
        s_event_sum=s_sum,
        s_event_top3_mean=top3_mean,
        temporal_concentration=concentration,
        s_loc_raw=s_loc_raw,
        m_env=1.0, w_src=1.0, delta_fb=0.0,
        final_score=0.0, priority="BAIXA",
        events_considered=len(scored),
        distinct_source_kinds=0,
        window_start_iso="", window_end_iso="",
    )
    return s_loc_raw, seed, reasons


# ─────────────────────────────────────────────────────────────────────────
# Camada C — M_env
# ─────────────────────────────────────────────────────────────────────────


def _environmental_multiplier(
    events: list[CrimeEvent],
    s_loc_raw: float,
) -> tuple[float, list[Reason]]:
    reasons: list[Reason] = []
    mult = 1.0

    factors_present: set = set()
    camera_votes: list[bool] = []
    patrol_recent: list[bool] = []
    lighting_ok = 0
    n = len(events)

    for e in events:
        for f in e.environment.urban_factors:
            factors_present.add(f)
        if e.environment.camera_present is not None:
            camera_votes.append(e.environment.camera_present)
        if e.environment.patrol_presence.value == "recem_retirada":
            patrol_recent.append(True)
        else:
            patrol_recent.append(False)
        if e.environment.lighting.value == "adequada":
            lighting_ok += 1

    # combos
    for combo_set, combo_mult in W.ENV_COMBOS:
        if combo_set.issubset(factors_present):
            mult *= combo_mult
            reasons.append(Reason(
                kind="env", code="combo." + "_".join(sorted(t.value for t in combo_set)),
                label="Combo de fatores urbanos: " + " + ".join(t.value.replace("_", " ") for t in combo_set),
                delta=combo_mult, is_multiplier=True,
                weight=(combo_mult - 1) / 0.5,
            ))

    # ponto cego de câmera (só vale se score já alto)
    if camera_votes and not any(camera_votes) and s_loc_raw >= W.ENV_CAMERA_BLIND_THRESHOLD:
        mult *= W.ENV_CAMERA_BLIND_SPOT
        reasons.append(Reason(
            kind="env", code="env.camera_blind",
            label="Ponto cego de câmera em região de alto risco",
            delta=W.ENV_CAMERA_BLIND_SPOT, is_multiplier=True, weight=0.8,
            evidence=f"câmera ausente em {len(camera_votes)} eventos",
        ))

    # janela operacional — patrulha recém-saída
    if n > 0 and sum(patrol_recent) / n >= W.ENV_PATROL_GAP_FRACTION:
        mult *= W.ENV_PATROL_GAP_MULT
        reasons.append(Reason(
            kind="env", code="env.patrol_gap",
            label="Crimes coincidem com saída da patrulha (janela operacional)",
            delta=W.ENV_PATROL_GAP_MULT, is_multiplier=True, weight=0.9,
            evidence=f"{sum(patrol_recent)}/{n} eventos pós-retirada de patrulha",
        ))

    # boa cobertura (rebaixa)
    if (
        camera_votes and all(camera_votes)
        and n > 0 and lighting_ok / n >= 0.5
    ):
        mult *= W.ENV_GOOD_COVERAGE_MULT
        reasons.append(Reason(
            kind="env", code="env.good_coverage",
            label="Cobertura adequada (câmera + iluminação) reduz prioridade",
            delta=W.ENV_GOOD_COVERAGE_MULT, is_multiplier=True, weight=0.3,
        ))

    mult = max(W.ENV_MULT_FLOOR, min(W.ENV_MULT_CEIL, mult))
    return mult, reasons


# ─────────────────────────────────────────────────────────────────────────
# Camada D — W_src
# ─────────────────────────────────────────────────────────────────────────


def _source_weight(events: list[CrimeEvent]) -> tuple[float, int, list[Reason]]:
    kinds = {e.source.kind for e in events}
    n_kinds = len(kinds)
    raw = W.SRC_DIVERSITY_MULT.get(n_kinds, 1.20 if n_kinds >= 5 else 0.85)
    raw = max(W.SRC_MULT_FLOOR, min(W.SRC_MULT_CEIL, raw))
    reasons: list[Reason] = []
    if n_kinds == 1:
        only = next(iter(kinds))
        reasons.append(Reason(
            kind="source", code="src.single",
            label=f"Apenas 1 fonte ({only.value}) — sinal precisa de corroboração",
            delta=raw, is_multiplier=True, weight=0.5,
        ))
    elif n_kinds >= 3:
        reasons.append(Reason(
            kind="source", code="src.corroborated",
            label=f"Corroboração cross-source: {n_kinds} fontes distintas",
            delta=raw, is_multiplier=True, weight=0.7,
            evidence=", ".join(sorted(k.value for k in kinds)),
        ))
    return raw, n_kinds, reasons


# ─────────────────────────────────────────────────────────────────────────
# Camada E — Δ_fb
# ─────────────────────────────────────────────────────────────────────────


def _feedback_delta(
    area_or_logradouro: str,
    actions: list[FMAction],
    pre_score: float,
    post_score: Optional[float],
) -> tuple[float, list[Reason]]:
    """Calcula Δ_fb. Recebe `post_score` quando o pipeline já computou o
    score em janela posterior à ação (caso contrário, devolve 0 — falta sinal)."""
    reasons: list[Reason] = []
    delta = 0.0
    if not actions or post_score is None or pre_score <= 0:
        return 0.0, reasons

    drop = (pre_score - post_score) / pre_score
    if drop >= W.FB_SUCCESS_DROP_THRESHOLD:
        delta += W.FB_SUCCESS_DELTA
        types = ", ".join(sorted({a.action_type.value for a in actions}))
        reasons.append(Reason(
            kind="feedback", code="fb.success",
            label=f"Ação da FM reduziu o score em {drop*100:.0f}%",
            delta=W.FB_SUCCESS_DELTA, weight=1.0,
            evidence=f"ações: {types}",
        ))
    elif drop < W.FB_DISPLACEMENT_THRESHOLD:
        delta += W.FB_DISPLACEMENT_DELTA
        reasons.append(Reason(
            kind="feedback", code="fb.displacement_or_inert",
            label="Ação da FM não reduziu o crime (possível migração para vizinhos)",
            delta=W.FB_DISPLACEMENT_DELTA, weight=0.9,
        ))

    return max(W.FB_FLOOR, min(W.FB_CEIL, delta)), reasons


# ─────────────────────────────────────────────────────────────────────────
# Composição final
# ─────────────────────────────────────────────────────────────────────────


def compute_score_for_unit(
    events: list[CrimeEvent],
    actions: list[FMAction] | None = None,
    post_score_hint: Optional[float] = None,
    window_start: Optional[date] = None,
    window_end: Optional[date] = None,
) -> ScoreBreakdown:
    """Calcula score completo de UMA unidade (logradouro ou área).

    Args:
        events: eventos da unidade dentro da janela.
        actions: FMActions cuja área/logradouro intersecta a unidade.
        post_score_hint: score calculado em janela posterior — usado pra Δ_fb.
        window_start/end: janela temporal (só para documentação no breakdown).
    """
    scored = [score_event(e) for e in events]
    s_loc_raw, seed, agg_reasons = _aggregate(scored)
    m_env, env_reasons = _environmental_multiplier(events, s_loc_raw)
    w_src, n_kinds, src_reasons = _source_weight(events)
    delta_fb, fb_reasons = _feedback_delta(
        area_or_logradouro="",
        actions=actions or [],
        pre_score=s_loc_raw * m_env * w_src,
        post_score=post_score_hint,
    )

    final = max(0.0, min(100.0, s_loc_raw * m_env * w_src + delta_fb))

    # razões prevenientes dos eventos individuais — agrego por código para
    # não inundar a UI com 1 razão por evento.
    event_reason_agg: dict[str, Reason] = {}
    for s in scored:
        for r in s.contributions:
            existing = event_reason_agg.get(r.code)
            if existing is None:
                event_reason_agg[r.code] = Reason(
                    kind=r.kind, code=r.code, label=r.label,
                    delta=r.delta, is_multiplier=r.is_multiplier, weight=r.weight,
                    evidence="1 evento",
                )
            else:
                existing.delta += r.delta
                # mantém o label do primeiro; atualiza evidência com contagem
                count = int((existing.evidence or "0 evento").split()[0]) + 1
                existing.evidence = f"{count} eventos"

    all_reasons = list(event_reason_agg.values()) + agg_reasons + env_reasons + src_reasons + fb_reasons
    all_reasons.sort(key=lambda r: (abs(r.delta) * (5 if r.is_multiplier else 1)), reverse=True)

    # top events: maiores 5 por s_event
    top_n = sorted(scored, key=lambda s: s.s_event, reverse=True)[:5]
    top_events = [
        EventSummary(
            event_id=s.event.event_id,
            crime_type=s.event.crime_type.value,
            s_event=round(s.s_event, 1),
            date_iso=s.event.temporal.date_iso,
            hour_24=s.event.temporal.hour_24,
            logradouro=s.event.spatial.logradouro,
            weapons=[w.type.value for w in s.event.weapons if w.type.value != "desconhecida"],
            tactics=[t.value for t in s.event.modus_operandi.tactics],
            outcome=s.event.outcome.status.value,
            source_kind=s.event.source.kind.value,
        )
        for s in top_n
    ]

    return ScoreBreakdown(
        s_event_sum=seed.s_event_sum,
        s_event_top3_mean=seed.s_event_top3_mean,
        temporal_concentration=seed.temporal_concentration,
        s_loc_raw=s_loc_raw,
        m_env=m_env,
        w_src=w_src,
        delta_fb=delta_fb,
        final_score=round(final, 2),
        priority=W.priority_for(final),
        events_considered=len(events),
        distinct_source_kinds=n_kinds,
        window_start_iso=window_start.isoformat() if window_start else "",
        window_end_iso=window_end.isoformat() if window_end else "",
        reasons=all_reasons,
        top_events=top_events,
    )


# ─────────────────────────────────────────────────────────────────────────
# Pipeline principal — lê o JSONL, agrupa por unidade, computa score
# ─────────────────────────────────────────────────────────────────────────


def _event_date(e: CrimeEvent) -> Optional[date]:
    if not e.temporal.date_iso:
        return None
    try:
        return date.fromisoformat(e.temporal.date_iso[:10])
    except ValueError:
        return None


def build_score_report(
    cfg: OntologySettings,
    window_days: int = 30,
    window_end: Optional[date] = None,
    min_events_per_unit: int = 1,
) -> ScoreReport:
    """Calcula ScoreReport para todas as áreas FM + top logradouros."""
    store = EventStore(cfg.crime_events_path)
    actions_loader = FMActionLoader(cfg.fm_actions_path)
    actions = list(actions_loader.iter_actions())

    # janela
    if window_end is None:
        all_dates = [d for d in (_event_date(e) for e in store.iter_events()) if d]
        window_end = max(all_dates) if all_dates else date.today()
    window_start = window_end - timedelta(days=window_days)

    by_area: dict[str, list[CrimeEvent]] = defaultdict(list)
    by_logradouro: dict[tuple[str, str], list[CrimeEvent]] = defaultdict(list)

    for ev in store.iter_events():
        d = _event_date(ev)
        if d is None or d < window_start or d > window_end:
            continue
        area = ev.spatial.area_fm or "DESCONHECIDA"
        by_area[area].append(ev)
        if ev.spatial.logradouro:
            by_logradouro[(area, ev.spatial.logradouro)].append(ev)

    def actions_for_area(name: str) -> list[FMAction]:
        return [a for a in actions if (a.area_fm or "") == name]

    def actions_for_logr(area: str, logr: str) -> list[FMAction]:
        return [
            a for a in actions
            if (a.area_fm or "") == area and (a.logradouro or "").upper() == logr.upper()
        ]

    areas_out: list[AreaScore] = []
    for area, events in sorted(by_area.items()):
        if len(events) < min_events_per_unit:
            continue
        bd = compute_score_for_unit(
            events,
            actions=actions_for_area(area),
            window_start=window_start,
            window_end=window_end,
        )
        areas_out.append(AreaScore(area_fm=area, breakdown=bd))

    logr_out: list[LogradouroScore] = []
    for (area, logr), events in sorted(by_logradouro.items()):
        if len(events) < min_events_per_unit:
            continue
        bd = compute_score_for_unit(
            events,
            actions=actions_for_logr(area, logr),
            window_start=window_start,
            window_end=window_end,
        )
        logr_out.append(LogradouroScore(logradouro=logr, area_fm=area, breakdown=bd))

    logr_out.sort(key=lambda x: x.breakdown.final_score, reverse=True)
    areas_out.sort(key=lambda x: x.breakdown.final_score, reverse=True)

    return ScoreReport(
        window_days=window_days,
        window_start_iso=window_start.isoformat(),
        window_end_iso=window_end.isoformat(),
        areas=areas_out,
        logradouros=logr_out,
    )


def write_score_report(report: ScoreReport, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report.model_dump_json(indent=2), encoding="utf-8")


def run_score(cfg: OntologySettings, window_days: int = 30) -> Path:
    """Entrada pública. Gera o report e devolve o path do JSON."""
    report = build_score_report(cfg, window_days=window_days)
    out = cfg.valente_data_dir / "scores" / "score_report.json"
    write_score_report(report, out)
    return out
