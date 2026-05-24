import pandas as pd

from data_pipeline import compute_bingo


def test_compute_bingo_triple():
    top_trechos = [{"locf_norm": "avenida presidente vargas", "total": 5}]
    fu_area = pd.DataFrame({"logradouro": ["Avenida Presidente Vargas"]})
    dd_area = pd.DataFrame({"logradouro": ["PRESIDENTE VARGAS"]})
    oc_area = pd.DataFrame()
    result, n_bingo, n_triple = compute_bingo(top_trechos, fu_area, dd_area, oc_area)
    assert result[0]["bingo_count"] == 3


def test_compute_bingo_partial():
    top_trechos = [{"locf_norm": "rua uruguaiana", "total": 3}]
    fu_area = pd.DataFrame({"logradouro": ["Rua Uruguaiana"]})
    dd_area = pd.DataFrame({"logradouro": ["PRESIDENTE VARGAS"]})
    oc_area = pd.DataFrame()
    result, n_bingo, n_triple = compute_bingo(top_trechos, fu_area, dd_area, oc_area)
    assert result[0]["bingo_count"] == 2


def test_compute_bingo_none():
    top_trechos = [{"locf_norm": "praca floriano", "total": 2}]
    fu_area = pd.DataFrame({"logradouro": ["Rua Uruguaiana"]})
    dd_area = pd.DataFrame({"logradouro": ["PRESIDENTE VARGAS"]})
    oc_area = pd.DataFrame()
    result, n_bingo, n_triple = compute_bingo(top_trechos, fu_area, dd_area, oc_area)
    assert result[0]["bingo_count"] == 1


def test_compute_bingo_empty_trechos():
    result, n_bingo, n_triple = compute_bingo([], pd.DataFrame(), pd.DataFrame(), pd.DataFrame())
    assert result == []
    assert n_bingo == 0
    assert n_triple == 0


def test_compute_bingo_counts():
    top_trechos = [
        {"locf_norm": "avenida presidente vargas", "total": 5},
        {"locf_norm": "rua uruguaiana", "total": 3},
        {"locf_norm": "praca floriano", "total": 1},
    ]
    fu_area = pd.DataFrame({
        "logradouro": ["Avenida Presidente Vargas", "Rua Uruguaiana"],
    })
    dd_area = pd.DataFrame({
        "logradouro": ["PRESIDENTE VARGAS", "URUGUAIANA"],
    })
    oc_area = pd.DataFrame()
    _, n_bingo, n_triple = compute_bingo(top_trechos, fu_area, dd_area, oc_area)
    assert n_triple == 2
    assert n_bingo == 2
