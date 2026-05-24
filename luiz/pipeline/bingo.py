"""
Motor de Bingo Score do CompStat Rio.

Calcula, para cada logradouro dentro de uma área FM, um score de prioridade
de 0 a 10 composto por 4 camadas:

  Layer 1 — Mancha Criminal      (0–4 pts)
  Layer 2 — Fatores Urbanos      (0–3 pts)
  Layer 3 — Disque Denúncia      (0–2 pts)
  Layer 4 — Ponto Cego de Câmera (0–1 pt)
  ─────────────────────────────────────────
  Total máximo                   10 pts

Cada resultado inclui EXPLICAÇÃO NARRATIVA com as justificativas específicas
que compõem o score (logradouro, contagem, tipos de fator, relatos relevantes).
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

import polars as pl

from config import (
    BINGO_CRIME_THRESHOLDS,
    BINGO_CRIME_SCORES,
    BINGO_FATOR_THRESHOLDS,
    BINGO_FATOR_SCORES,
    BINGO_DENUNCIA_THRESHOLDS,
    BINGO_DENUNCIA_SCORES,
    COMBOS_ALTO_RISCO,
    FATOR_ORGAO,
)


@dataclass
class BingoSegmento:
    """Resultado do Bingo Score para um logradouro."""

    logradouro: str
    logradouro_norm: str
    score_total: int  # 0–10
    score_mancha: int  # 0–4
    score_fatores: int  # 0–3
    score_dinamica: int  # 0–2
    score_camera: int  # 0–1
    explicacao: list[str]  # bullets narrativos em ordem de peso
    prioridade: str  # "CRITICA" / "ALTA" / "MEDIA" / "BAIXA"
    crimes_count: int
    hora_pico: Optional[int]
    pct_noturno: float
    tipos_fatores: list[str]
    orgaos_responsaveis: list[str]
    combos_risco: list[str]  # descrição de combos amplificadores
    denuncias_count: int
    tem_camera: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None


def _score_layer(value: int, thresholds: list[int], scores: list[int]) -> int:
    score = 0
    for threshold, pts in zip(thresholds, scores):
        if value >= threshold:
            score = pts
    return score


def _prioridade(score: int) -> str:
    if score >= 8:
        return "CRITICA"
    if score >= 6:
        return "ALTA"
    if score >= 3:
        return "MEDIA"
    return "BAIXA"


def _hora_label(hora: Optional[int]) -> str:
    if hora is None:
        return "horário não identificado"
    return f"{hora:02d}h–{(hora + 1) % 24:02d}h"


def calcular_bingo_por_logradouro(
    logradouro_norm: str,
    logradouro_display: str,
    crimes_count: int,
    hora_pico: Optional[int],
    pct_noturno: float,
    tipos_fatores: list[str],
    n_fatores_unicos: int,
    denuncias_count: int,
    relatos_sample: list[str],
    tem_camera: bool,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> BingoSegmento:
    """
    Calcula o Bingo Score para um único logradouro e gera explicação narrativa.
    """
    explicacao: list[str] = []
    combos_risco: list[str] = []

    # ------------------------------------------------------------------
    # LAYER 1 — Mancha Criminal (0–4)
    # ------------------------------------------------------------------
    s_mancha = _score_layer(crimes_count, BINGO_CRIME_THRESHOLDS, BINGO_CRIME_SCORES)

    if crimes_count == 0:
        pass  # sem contribuição
    elif s_mancha == 1:
        explicacao.append(
            f"[MANCHA +{s_mancha}] {crimes_count} ocorrência(s) registrada(s) no período."
        )
    else:
        pico_str = (
            f", pico às {_hora_label(hora_pico)}" if hora_pico is not None else ""
        )
        noturno_str = (
            f" — {pct_noturno:.0f}% noturnas (18h–05h)" if pct_noturno >= 40 else ""
        )
        explicacao.append(
            f"[MANCHA +{s_mancha}] {crimes_count} ocorrência(s){pico_str}{noturno_str}."
        )

    # ------------------------------------------------------------------
    # LAYER 2 — Fatores Urbanos (0–3)
    # ------------------------------------------------------------------
    s_fatores = _score_layer(
        n_fatores_unicos, BINGO_FATOR_THRESHOLDS, BINGO_FATOR_SCORES
    )
    orgaos = sorted(set(FATOR_ORGAO.get(t, "Outro") for t in tipos_fatores))

    if s_fatores > 0:
        tipos_str = ", ".join(tipos_fatores[:4])
        if len(tipos_fatores) > 4:
            tipos_str += f" (+{len(tipos_fatores) - 4} outros)"
        explicacao.append(
            f"[FATORES +{s_fatores}] {n_fatores_unicos} tipo(s) de fator urbano: {tipos_str}. "
            f"Responsáveis: {', '.join(orgaos)}."
        )

    # Detecta combos amplificadores (narrativa, sem pts extras)
    tipos_set = set(tipos_fatores)
    for combo in COMBOS_ALTO_RISCO:
        if combo.issubset(tipos_set):
            combo_desc = " + ".join(sorted(combo))
            combos_risco.append(f"Combo de alto risco: {combo_desc}")
            explicacao.append(
                f"[COMBO] {combo_desc} — combinação que amplifica visibilidade reduzida e risco de abordagem."
            )

    # ------------------------------------------------------------------
    # LAYER 3 — Disque Denúncia patrimônio (0–2)
    # ------------------------------------------------------------------
    s_dinamica = _score_layer(
        denuncias_count, BINGO_DENUNCIA_THRESHOLDS, BINGO_DENUNCIA_SCORES
    )

    if s_dinamica > 0:
        relato_ex = ""
        if relatos_sample:
            # Pega primeiro relato, trunca
            r = str(relatos_sample[0])[:120].rstrip()
            relato_ex = f' Ex: "{r}…"'
        explicacao.append(
            f"[DISQUE DENÚNCIA +{s_dinamica}] {denuncias_count} denúncia(s) de crime contra patrimônio.{relato_ex}"
        )

    # ------------------------------------------------------------------
    # LAYER 4 — Ponto cego de câmera (0–1)
    # ------------------------------------------------------------------
    s_camera = 0
    if crimes_count >= 5 and not tem_camera:
        s_camera = 1
        explicacao.append(
            "[CÂMERA +1] Hotspot sem cobertura de câmera identificada — vulnerabilidade operacional."
        )
    elif tem_camera:
        explicacao.append("[CÂMERA 0] Câmera presente na área — cobertura confirmada.")

    # ------------------------------------------------------------------
    # Total
    # ------------------------------------------------------------------
    score_total = s_mancha + s_fatores + s_dinamica + s_camera
    score_total = min(score_total, 10)

    return BingoSegmento(
        logradouro=logradouro_display,
        logradouro_norm=logradouro_norm,
        score_total=score_total,
        score_mancha=s_mancha,
        score_fatores=s_fatores,
        score_dinamica=s_dinamica,
        score_camera=s_camera,
        explicacao=explicacao,
        prioridade=_prioridade(score_total),
        crimes_count=crimes_count,
        hora_pico=hora_pico,
        pct_noturno=pct_noturno or 0.0,
        tipos_fatores=tipos_fatores,
        orgaos_responsaveis=orgaos,
        combos_risco=combos_risco,
        denuncias_count=denuncias_count,
        tem_camera=tem_camera,
        latitude=lat,
        longitude=lon,
    )


def calcular_bingos_area(
    df_crimes_area: pl.DataFrame,
    df_fatores_area: pl.DataFrame,
    df_denuncias_area: pl.DataFrame,
    df_cameras_area: pl.DataFrame,
    crimes_por_rua: pl.DataFrame,
    fatores_por_rua: pl.DataFrame,
    denuncias_por_rua: pl.DataFrame,
    top_n: int = 20,
) -> list[BingoSegmento]:
    """
    Calcula Bingo Score para todos os logradouros da área, retorna os top_n
    ordenados por score decrescente.

    Os DataFrames *_por_rua já foram calculados por spatial.py.
    """
    if crimes_por_rua.is_empty():
        return []

    # Câmeras presentes na área (por nome)
    camera_area_names = (
        set(df_cameras_area["nome_area_fm"].to_list())
        if not df_cameras_area.is_empty()
        else set()
    )
    area_tem_camera = len(camera_area_names) > 0

    # Constrói lookup de fatores por logradouro
    fat_lookup: dict[str, dict] = {}
    if not fatores_por_rua.is_empty():
        for row in fatores_por_rua.iter_rows(named=True):
            fat_lookup[row["logradouro_norm"]] = row

    # Constrói lookup de denúncias por logradouro
    den_lookup: dict[str, dict] = {}
    if not denuncias_por_rua.is_empty():
        for row in denuncias_por_rua.iter_rows(named=True):
            den_lookup[row["logradouro_norm"]] = row

    # Câmeras por logradouro: aqui simplificamos — se a área tem câmera,
    # todos os logradouros com câmera próxima ganham a flag.
    # Como cameras_fm não tem logradouro, usamos presença na área como proxy.
    # (refinamento futuro: distância ponto-a-ponto)

    results: list[BingoSegmento] = []
    for row in crimes_por_rua.iter_rows(named=True):
        ln = row["locf_norm"]
        ld = row.get("locf") or ln

        fat = fat_lookup.get(ln, {})
        den = den_lookup.get(ln, {})

        tipos_fatores = list(fat.get("tipos_fatores") or [])
        n_unicos = len(set(tipos_fatores))
        denuncias_count = int(den.get("n_denuncias") or 0)
        relatos = list(den.get("relatos") or [])

        seg = calcular_bingo_por_logradouro(
            logradouro_norm=ln,
            logradouro_display=ld,
            crimes_count=int(row["total_crimes"]),
            hora_pico=row.get("hora_pico"),
            pct_noturno=float(row.get("pct_noturno") or 0.0),
            tipos_fatores=tipos_fatores,
            n_fatores_unicos=n_unicos,
            denuncias_count=denuncias_count,
            relatos_sample=relatos[:2],
            tem_camera=area_tem_camera,
        )
        results.append(seg)

    results.sort(key=lambda x: x.score_total, reverse=True)
    return results[:top_n]


def bingos_to_dataframe(bingos: list[BingoSegmento]) -> pl.DataFrame:
    """Converte lista de BingoSegmento para DataFrame Polars (para exibição no Streamlit)."""
    if not bingos:
        return pl.DataFrame()

    return pl.DataFrame(
        {
            "Logradouro": [b.logradouro for b in bingos],
            "Score": [b.score_total for b in bingos],
            "Prioridade": [b.prioridade for b in bingos],
            "Mancha": [b.score_mancha for b in bingos],
            "Fatores": [b.score_fatores for b in bingos],
            "Denúncias": [b.score_dinamica for b in bingos],
            "Câmera": [b.score_camera for b in bingos],
            "Crimes": [b.crimes_count for b in bingos],
            "Hora Pico": [b.hora_pico for b in bingos],
            "Tem Câmera": [b.tem_camera for b in bingos],
            "Órgãos": [", ".join(b.orgaos_responsaveis) for b in bingos],
        }
    )


def gerar_resumo_bingo(bingos: list[BingoSegmento], area_name: str) -> str:
    """Gera parágrafo de resumo dos bingos para o relatório."""
    if not bingos:
        return "Sem dados suficientes para geração do Painel de Coincidências."

    criticos = [b for b in bingos if b.prioridade == "CRITICA"]
    altos = [b for b in bingos if b.prioridade == "ALTA"]
    top3 = bingos[:3]

    linhas = [
        f"A análise de coincidências de camadas identificou {len(bingos)} logradouros "
        f"com sobreposição de fatores de risco na área {area_name}.",
    ]

    if criticos:
        nomes = ", ".join(b.logradouro for b in criticos[:3])
        linhas.append(
            f"Foram identificados {len(criticos)} segmento(s) com PRIORIDADE CRÍTICA (score ≥ 8): {nomes}."
        )
    if altos:
        nomes = ", ".join(b.logradouro for b in altos[:3])
        linhas.append(
            f"{len(altos)} segmento(s) com prioridade ALTA (score 6–7): {nomes}."
        )

    linhas.append("")
    linhas.append("Trechos de maior pontuação e respectivas justificativas:")
    for b in top3:
        linhas.append(f"\n  [{b.score_total}/10 — {b.prioridade}] {b.logradouro}")
        for ex in b.explicacao:
            linhas.append(f"    • {ex}")

    return "\n".join(linhas)
