import pandas as pd

from data_pipeline import (
    evolution_mensal,
    get_dia_distribution,
    get_hora_distribution,
    get_pct_noturno,
    get_pico_hora,
    get_top_trechos,
)


def test_get_hora_distribution(sample_crimes_df):
    result = get_hora_distribution(sample_crimes_df)
    assert isinstance(result, dict)
    assert all(isinstance(k, str) and k.isdigit() for k in result)
    assert all(isinstance(v, int) for v in result.values())
    assert result["14"] == 1
    assert result["2"] == 1


def test_get_hora_distribution_empty():
    assert get_hora_distribution(pd.DataFrame()) == {}


def test_get_dia_distribution(sample_crimes_df):
    result = get_dia_distribution(sample_crimes_df)
    assert isinstance(result, dict)
    assert "Segunda" in result
    assert "Quarta" in result
    assert all(isinstance(v, int) for v in result.values())


def test_get_pico_hora():
    hora_dist = {"14": 5, "2": 3, "20": 1}
    assert get_pico_hora(hora_dist) == "14h"


def test_get_pico_hora_empty():
    assert get_pico_hora({}) == "N/D"


def test_get_pct_noturno(sample_crimes_df):
    result = get_pct_noturno(sample_crimes_df)
    assert result == 60.0


def test_get_pct_noturno_all_night():
    df = pd.DataFrame({"hora_num": [0, 1, 2, 3, 4, 5]})
    assert get_pct_noturno(df) == 100.0


def test_get_pct_noturno_empty():
    assert get_pct_noturno(pd.DataFrame()) == 0.0


def test_get_top_trechos(sample_crimes_df):
    result = get_top_trechos(sample_crimes_df)
    assert isinstance(result, list)
    assert len(result) > 0
    assert result[0]["locf_norm"] == "avenida presidente vargas"
    assert result[0]["total"] == 2
    totals = [r["total"] for r in result]
    assert totals == sorted(totals, reverse=True)


def test_get_top_trechos_empty():
    assert get_top_trechos(pd.DataFrame()) == []


def test_evolution_mensal(sample_crimes_df):
    result = evolution_mensal(sample_crimes_df)
    assert isinstance(result, list)
    assert all("mes" in item and "total" in item for item in result)
    assert all(isinstance(item["total"], int) for item in result)
    assert len(result) == 5
