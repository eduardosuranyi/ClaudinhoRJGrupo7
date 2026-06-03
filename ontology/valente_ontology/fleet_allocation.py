"""
Alocação de frota da Força Municipal a partir do `ScoreReport`.

Estratégia em três passos:

  1. **Distribuição base por área** — alocação proporcional ao score, com
     piso mínimo (toda área tem patrulha) e teto (nenhuma área concentra
     mais que 35% do efetivo).
  2. **Distribuição por turno** — dentro de cada área, divide os agentes
     entre os 6 dayparts. Áreas com concentração temporal alta
     (`temporal_concentration` ≥ 0.5) recebem alocação fortemente enviesada
     para o turno-pico; áreas dispersas distribuem mais uniformemente.
  3. **Justificativa por área** — para cada `AreaAllocation`, lista as 3
     razões mais fortes do ScoreBreakdown que motivaram aquele efetivo.

Saída: `FleetPlan` (JSON) consumível pelo frontend.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from valente_ontology.enums import DayPart
from valente_ontology.score import AreaScore, ScoreReport


# ─────────────────────────────────────────────────────────────────────────
# Modelos de output
# ─────────────────────────────────────────────────────────────────────────


class ShiftAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daypart: str
    agents: int
    rationale: str = ""


class AreaAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    area_fm: str
    score: float
    priority: str
    agents_total: int
    share_of_fleet: float = Field(description="0..1 — fração do efetivo total.")
    shifts: list[ShiftAllocation] = Field(default_factory=list)
    top_reasons: list[str] = Field(
        default_factory=list,
        description="Top 3 motivos legíveis (vindos do ScoreBreakdown).",
    )
    suggested_actions: list[str] = Field(
        default_factory=list,
        description="Ações sugeridas com base nas razões. Texto livre, "
                    "consumido como bullets pelo frontend.",
    )


class FleetPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated_at: str
    fleet_size: int
    window_start_iso: str
    window_end_iso: str
    allocations: list[AreaAllocation]
    unallocated: int = Field(
        default=0,
        description="Resíduo de arredondamento (deve ser 0 no fim — só pra auditar).",
    )


# ─────────────────────────────────────────────────────────────────────────
# Núcleo da alocação
# ─────────────────────────────────────────────────────────────────────────


# Pesos turno por área "dispersa" (concentração < 0.3). Dia + entardecer + noite
# dominam — madrugada e amanhecer mantêm efetivo mínimo. Soma=1.0.
DEFAULT_SHIFT_WEIGHTS: dict[str, float] = {
    DayPart.MADRUGADA.value: 0.10,
    DayPart.AMANHECER.value: 0.08,
    DayPart.MANHA.value: 0.18,
    DayPart.TARDE.value: 0.22,
    DayPart.ENTARDECER.value: 0.20,
    DayPart.NOITE.value: 0.22,
}


def _shift_weights_for_area(area: AreaScore) -> dict[str, float]:
    """Calcula peso por turno usando a distribuição empírica de hora_24
    dos top_events. Concentração alta → enviesa pro turno-pico."""
    bd = area.breakdown
    counts: Counter[str] = Counter()
    for ev in bd.top_events:
        if ev.hour_24 is None:
            continue
        counts[_hour_to_daypart(ev.hour_24)] += 1

    if not counts:
        return DEFAULT_SHIFT_WEIGHTS.copy()

    total = sum(counts.values())
    empirical = {dp: counts.get(dp, 0) / total for dp in DEFAULT_SHIFT_WEIGHTS}

    # Mistura: peso da distribuição empírica = concentração temporal.
    # concentração=0 → 100% default; concentração=1 → 100% empírico.
    c = bd.temporal_concentration
    blended = {
        dp: (1 - c) * DEFAULT_SHIFT_WEIGHTS[dp] + c * empirical[dp]
        for dp in DEFAULT_SHIFT_WEIGHTS
    }
    # Renormaliza
    s = sum(blended.values())
    if s == 0:
        return DEFAULT_SHIFT_WEIGHTS.copy()
    return {k: v / s for k, v in blended.items()}


def _hour_to_daypart(h: int) -> str:
    if 0 <= h < 5:
        return DayPart.MADRUGADA.value
    if 5 <= h < 7:
        return DayPart.AMANHECER.value
    if 7 <= h < 12:
        return DayPart.MANHA.value
    if 12 <= h < 17:
        return DayPart.TARDE.value
    if 17 <= h < 19:
        return DayPart.ENTARDECER.value
    return DayPart.NOITE.value


def _suggested_actions_for_area(area: AreaScore) -> list[str]:
    """Mapeia códigos de razões em ações concretas."""
    bd = area.breakdown
    out: list[str] = []
    seen_codes = set()
    for r in bd.reasons[:8]:
        c = r.code
        if c in seen_codes:
            continue
        seen_codes.add(c)
        if c.startswith("combo.iluminacao_deficiente_vegetacao_cobrindo_iluminacao"):
            out.append("Solicitar Rio Luz (reparo de iluminação) + COMLURB (poda de vegetação).")
        elif c.startswith("combo.mobiliario_abandonado_pessoas_em_situacao_rua"):
            out.append("SECONSERVA (remoção de mobiliário) + SMAS (abordagem social).")
        elif c.startswith("combo.comercio_irregular"):
            out.append("SEOP — operação de remoção de comércio irregular.")
        elif c == "env.camera_blind":
            out.append("Avaliar instalação ou remanejamento de câmera CIVITAS no trecho.")
        elif c == "env.patrol_gap":
            out.append("Revisar a janela de troca de patrulha — agendar sobreposição.")
        elif c == "agg.pattern":
            out.append("Patrulhamento ostensivo concentrado no turno-pico identificado.")
        elif c.startswith("weapon.") and r.delta >= 14:
            out.append("Reforço com viatura armada — perfil de eventos com arma de fogo.")
        elif c == "victim.vulnerability":
            out.append("Ação preventiva orientada (cartilha + abordagem) em pontos de vulnerabilidade.")
        elif c == "agent.organization":
            out.append("Mapear rotas de fuga com o RELINT — operação conjunta PMERJ se houver indício de ORCRIM.")
        elif c == "fb.displacement_or_inert":
            out.append("Investigar migração: monitorar logradouros vizinhos no próximo ciclo.")
        if len(out) >= 4:
            break
    return out


def _top_reasons_text(area: AreaScore, n: int = 3) -> list[str]:
    """Pega os top-N reasons e formata como bullets curtos pra UI."""
    bd = area.breakdown
    out: list[str] = []
    for r in bd.reasons[:n * 2]:  # busca mais pra filtrar repetidos
        suffix = f" (×{r.delta:.2f})" if r.is_multiplier else f" (+{r.delta:.0f})"
        text = r.label + suffix
        if r.evidence:
            text += f" — {r.evidence}"
        out.append(text)
        if len(out) >= n:
            break
    return out


def allocate_fleet(
    report: ScoreReport,
    fleet_size: int = 600,
    min_agents_per_area: int = 25,
    max_share: float = 0.35,
) -> FleetPlan:
    """Alocação proporcional ao score, com piso por área e teto de share."""
    areas = report.areas
    if not areas:
        return FleetPlan(
            generated_at=report.generated_at.isoformat(),
            fleet_size=fleet_size,
            window_start_iso=report.window_start_iso,
            window_end_iso=report.window_end_iso,
            allocations=[],
            unallocated=fleet_size,
        )

    n_areas = len(areas)
    # Sanity: piso × n_areas não pode exceder fleet
    if min_agents_per_area * n_areas >= fleet_size:
        min_agents_per_area = max(1, fleet_size // (2 * n_areas))

    # Passo 1: pisos
    base_each = min_agents_per_area
    floor_total = base_each * n_areas
    discretionary = fleet_size - floor_total

    # Passo 2: distribui o restante proporcionalmente ao score, respeitando teto
    total_score = sum(max(a.breakdown.final_score, 0.1) for a in areas)
    cap = int(fleet_size * max_share)

    raw_alloc: list[float] = []
    for a in areas:
        share_of_extra = (max(a.breakdown.final_score, 0.1) / total_score) * discretionary
        raw_alloc.append(base_each + share_of_extra)

    # Aplica teto
    capped: list[float] = []
    overflow = 0.0
    for v in raw_alloc:
        if v > cap:
            overflow += v - cap
            capped.append(float(cap))
        else:
            capped.append(v)

    # Redistribui overflow proporcionalmente entre os não-tetados
    if overflow > 0:
        spare_pool_total = sum(c for c in capped if c < cap)
        if spare_pool_total > 0:
            capped = [
                (c + overflow * (c / spare_pool_total)) if c < cap else c
                for c in capped
            ]

    # Arredondamento — método largest-remainder pra somar exato
    int_part = [int(v) for v in capped]
    remainder = [(i, capped[i] - int_part[i]) for i in range(len(capped))]
    deficit = fleet_size - sum(int_part)
    remainder.sort(key=lambda t: t[1], reverse=True)
    for j in range(max(0, deficit)):
        int_part[remainder[j % len(remainder)][0]] += 1

    # Passo 3: por turno
    allocations: list[AreaAllocation] = []
    for area, agents in zip(areas, int_part):
        weights = _shift_weights_for_area(area)
        shift_int = {dp: int(agents * w) for dp, w in weights.items()}
        leftover = agents - sum(shift_int.values())
        if leftover > 0:
            # joga o resíduo no turno de maior peso
            top_dp = max(weights, key=weights.get)
            shift_int[top_dp] += leftover

        shifts = [
            ShiftAllocation(daypart=dp, agents=cnt, rationale=_shift_rationale(dp, area))
            for dp, cnt in shift_int.items()
            if cnt > 0
        ]
        # ordena por número de agentes desc
        shifts.sort(key=lambda s: s.agents, reverse=True)

        allocations.append(AreaAllocation(
            area_fm=area.area_fm,
            score=area.breakdown.final_score,
            priority=area.breakdown.priority,
            agents_total=agents,
            share_of_fleet=round(agents / fleet_size, 4),
            shifts=shifts,
            top_reasons=_top_reasons_text(area),
            suggested_actions=_suggested_actions_for_area(area),
        ))

    # ordena alocações por agentes desc
    allocations.sort(key=lambda a: a.agents_total, reverse=True)

    unallocated = fleet_size - sum(a.agents_total for a in allocations)

    return FleetPlan(
        generated_at=report.generated_at.isoformat(),
        fleet_size=fleet_size,
        window_start_iso=report.window_start_iso,
        window_end_iso=report.window_end_iso,
        allocations=allocations,
        unallocated=unallocated,
    )


def _shift_rationale(daypart: str, area: AreaScore) -> str:
    """Frase curta justificando o efetivo daquele turno na área."""
    c = area.breakdown.temporal_concentration
    if c >= 0.5:
        return f"Concentração temporal alta ({c*100:.0f}%) — efetivo enviesado para o turno-pico."
    if c >= 0.3:
        return f"Concentração temporal moderada ({c*100:.0f}%)."
    return "Distribuição padrão (concentração temporal baixa)."


def write_fleet_plan(plan: FleetPlan, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
