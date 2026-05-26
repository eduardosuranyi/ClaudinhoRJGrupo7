import pandas as pd

from data_pipeline import get_disque_denuncia_pontos


def test_dd_points_empty():
    assert get_disque_denuncia_pontos(pd.DataFrame()) == []


def test_dd_points_missing_relato_col():
    df = pd.DataFrame({"latitude": [-22.9], "longitude": [-43.18]})
    assert get_disque_denuncia_pontos(df) == []


def test_dd_points_basic_shape(sample_dd_df):
    out = get_disque_denuncia_pontos(sample_dd_df)
    assert len(out) == 2
    p = out[0]
    for key in ("lat", "lng", "tipo", "data", "bairro", "logradouro", "relato", "modus"):
        assert key in p
    assert isinstance(p["lat"], float)
    assert isinstance(p["lng"], float)
    assert isinstance(p["modus"], list)


def test_dd_points_modus_extracted(sample_dd_df):
    out = get_disque_denuncia_pontos(sample_dd_df)
    # "Dois individuos de moto armados roubaram celular"
    modus = out[0]["modus"]
    assert "motocicleta" in modus
    assert "armado" in modus
    assert "em_grupo" in modus


def test_dd_points_relato_truncated():
    df = pd.DataFrame({
        "latitude": [-22.9],
        "longitude": [-43.18],
        "relato_redacted": ["x" * 500],
        "tipo": ["ROUBO"],
        "data_denuncia": ["2025-01-01"],
        "bairro_logradouro": ["CENTRO"],
        "logradouro": ["RUA A"],
    })
    out = get_disque_denuncia_pontos(df)
    assert len(out[0]["relato"]) <= 300


def test_dd_points_cap():
    n = 600
    df = pd.DataFrame({
        "latitude": [-22.9] * n,
        "longitude": [-43.18] * n,
        "relato_redacted": ["a pe"] * n,
        "tipo": ["ROUBO"] * n,
        "data_denuncia": ["2025-01-01"] * n,
        "bairro_logradouro": ["CENTRO"] * n,
        "logradouro": ["RUA A"] * n,
    })
    out = get_disque_denuncia_pontos(df, max_points=400)
    assert len(out) <= 400


def test_dd_points_perfil_optional(sample_dd_df):
    # sample_dd_df has no envolvidos_* columns -> perfil_suspeito omitted, no crash
    out = get_disque_denuncia_pontos(sample_dd_df)
    assert all("perfil_suspeito" not in p for p in out)


def test_dd_points_perfil_present():
    df = pd.DataFrame({
        "latitude": [-22.9],
        "longitude": [-43.18],
        "relato_redacted": ["roubo a pe"],
        "tipo": ["ROUBO"],
        "data_denuncia": ["2025-01-01"],
        "bairro_logradouro": ["CENTRO"],
        "logradouro": ["RUA A"],
        "envolvidos_sexo": ['["M"]'],
        "envolvidos_idade": ['["25"]'],
        "envolvidos_pele": ['["Parda"]'],
    })
    out = get_disque_denuncia_pontos(df)
    assert out[0]["perfil_suspeito"] == "Homem, 25 anos, pele parda"


def test_dd_points_skips_missing_coords():
    df = pd.DataFrame({
        "latitude": [-22.9, None],
        "longitude": [-43.18, -43.17],
        "relato_redacted": ["a pe", "moto"],
        "tipo": ["ROUBO", "ROUBO"],
        "data_denuncia": ["2025-01-01", "2025-01-02"],
        "bairro_logradouro": ["CENTRO", "CENTRO"],
        "logradouro": ["RUA A", "RUA B"],
    })
    out = get_disque_denuncia_pontos(df)
    assert len(out) == 1
