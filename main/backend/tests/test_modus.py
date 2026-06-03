import pandas as pd

from data_pipeline import analyze_relatos, extract_modus


def test_extract_modus_a_pe():
    assert extract_modus("caminhando pela rua") == ["a_pe"]


def test_extract_modus_motocicleta():
    result = extract_modus("dois individuos de moto")
    assert "motocicleta" in result
    assert "em_grupo" in result


def test_extract_modus_armado():
    assert extract_modus("armados com pistola") == ["armado"]


def test_extract_modus_arma_branca():
    assert extract_modus("com faca") == ["arma_branca"]


def test_extract_modus_empty_string():
    assert extract_modus("") == []


def test_extract_modus_none():
    assert extract_modus(None) == []


def test_extract_modus_multiple():
    result = extract_modus("dois individuos de moto armados com pistola caminhando")
    assert "motocicleta" in result
    assert "em_grupo" in result
    assert "armado" in result
    assert "a_pe" in result


def test_analyze_relatos_counts():
    relatos = pd.Series([
        "dois individuos de moto",
        "grupo de menores caminhando a pe",
        "dois individuos de moto",
    ])
    result = analyze_relatos(relatos)
    assert result["motocicleta"] == 2
    assert result["em_grupo"] == 3
    assert result["menores"] == 1
    assert result["a_pe"] == 1
