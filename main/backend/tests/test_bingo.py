"""Tests for compute_bingo — spatial-proximity coincidence detection.

These replace the previous tests, which asserted the buggy *substring name-match* behavior
(`name in fl or fl in name`). The fixed implementation matches a factor / denúncia to a crime
trecho when it lies within BINGO_PROXIMITY_M metres of the trecho's crime points, with an
exact normalized-name fallback only for records that have no coordinates.

Coordinate helpers below place points at known metre offsets so proximity is unambiguous.
At Rio's latitude (~-22.9) one degree of longitude ≈ 102 km, so ~0.0009° ≈ 92 m.
"""
import pandas as pd

from data_pipeline import compute_bingo, BINGO_PROXIMITY_M

# A reference location and offsets relative to the proximity radius.
BASE_LAT, BASE_LNG = -22.9000, -43.1800
NEAR_LNG = -43.17970   # ~30 m east of base  (< BINGO_PROXIMITY_M)
FAR_LNG = -43.17000    # ~820 m east of base (>> BINGO_PROXIMITY_M)


def _crimes(locf_norm, lat=BASE_LAT, lng=BASE_LNG, n=3):
    return pd.DataFrame({
        "latitude": [lat] * n,
        "longitude": [lng] * n,
        "locf_norm": [locf_norm] * n,
    })


def _trecho(locf_norm, total=5, lat=BASE_LAT, lng=BASE_LNG):
    return {"locf_norm": locf_norm, "total": total, "lat": lat, "lng": lng}


def test_triple_bingo_when_factor_and_signal_are_near_the_crimes():
    trechos = [_trecho("avenida presidente vargas")]
    oc = _crimes("avenida presidente vargas")
    fu = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [NEAR_LNG], "logradouro": ["x"]})
    dd = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [NEAR_LNG], "logradouro": ["y"]})
    result, n_bingo, n_triple = compute_bingo(trechos, fu, dd, oc)
    assert result[0]["bingo_count"] == 3
    assert result[0]["bingo_layers"] == {"crime": True, "fatores": True, "sinais": True}
    assert n_triple == 1


def test_partial_bingo_when_only_factor_is_near():
    trechos = [_trecho("rua uruguaiana")]
    oc = _crimes("rua uruguaiana")
    fu = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [NEAR_LNG], "logradouro": ["x"]})
    dd = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [FAR_LNG], "logradouro": ["y"]})
    result, n_bingo, n_triple = compute_bingo(trechos, fu, dd, oc)
    assert result[0]["bingo_count"] == 2
    assert result[0]["bingo_layers"]["fatores"] is True
    assert result[0]["bingo_layers"]["sinais"] is False
    assert n_bingo == 1 and n_triple == 0


def test_crime_only_when_factor_and_signal_are_far_away():
    trechos = [_trecho("praca floriano")]
    oc = _crimes("praca floriano")
    fu = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [FAR_LNG], "logradouro": ["x"]})
    dd = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [FAR_LNG], "logradouro": ["y"]})
    result, n_bingo, n_triple = compute_bingo(trechos, fu, dd, oc)
    assert result[0]["bingo_count"] == 1
    assert n_bingo == 0


def test_no_false_positive_from_shared_token_far_away():
    """Regression: 'rua da paz' must NOT coincide with a factor on 'praça da paz' 800 m away.

    The old substring match (`fl in name`) flagged this as a coincidence; spatial proximity
    does not, and the coordless-name fallback requires *exact* equality, not substrings.
    """
    trechos = [_trecho("rua da paz")]
    oc = _crimes("rua da paz")
    # Factor far away AND with a different (but token-sharing) name -> must not match.
    fu = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [FAR_LNG], "logradouro": ["praca da paz"]})
    dd = pd.DataFrame({"latitude": [], "longitude": [], "logradouro": []})
    result, _, _ = compute_bingo(trechos, fu, dd, oc)
    assert result[0]["bingo_layers"]["fatores"] is False
    assert result[0]["bingo_count"] == 1


def test_coordless_denuncia_matches_by_exact_normalized_name():
    """DD without coordinates still contributes when its street name exactly matches."""
    trechos = [_trecho("avenida presidente vargas")]
    oc = _crimes("avenida presidente vargas")
    fu = pd.DataFrame({"latitude": [], "longitude": [], "logradouro": []})
    # No lat/lon -> exact normalized-name fallback ("Avenida Presidente Vargas" -> match).
    dd = pd.DataFrame({"latitude": [None], "longitude": [None], "logradouro": ["Avenida Presidente Vargas"]})
    result, _, _ = compute_bingo(trechos, fu, dd, oc)
    assert result[0]["bingo_layers"]["sinais"] is True


def test_coordless_denuncia_does_not_match_on_partial_name():
    """The coordless fallback is exact, not substring: 'presidente vargas' != 'avenida presidente vargas'."""
    trechos = [_trecho("avenida presidente vargas")]
    oc = _crimes("avenida presidente vargas")
    fu = pd.DataFrame({"latitude": [], "longitude": [], "logradouro": []})
    dd = pd.DataFrame({"latitude": [None], "longitude": [None], "logradouro": ["PRESIDENTE VARGAS"]})
    result, _, _ = compute_bingo(trechos, fu, dd, oc)
    assert result[0]["bingo_layers"]["sinais"] is False


def test_empty_trechos_returns_zeroes():
    result, n_bingo, n_triple = compute_bingo([], pd.DataFrame(), pd.DataFrame(), pd.DataFrame())
    assert result == []
    assert n_bingo == 0
    assert n_triple == 0


def test_counts_aggregate_across_trechos():
    trechos = [
        _trecho("avenida presidente vargas"),
        _trecho("rua uruguaiana", lat=-22.9100, lng=-43.1700),
    ]
    oc = pd.concat([
        _crimes("avenida presidente vargas"),
        _crimes("rua uruguaiana", lat=-22.9100, lng=-43.1700),
    ], ignore_index=True)
    # A factor near each trecho, a signal near only the first.
    fu = pd.DataFrame({
        "latitude": [BASE_LAT, -22.9100],
        "longitude": [NEAR_LNG, -43.16970],
        "logradouro": ["a", "b"],
    })
    dd = pd.DataFrame({"latitude": [BASE_LAT], "longitude": [NEAR_LNG], "logradouro": ["c"]})
    _, n_bingo, n_triple = compute_bingo(trechos, fu, dd, oc)
    assert n_bingo == 2   # both trechos have crime+factor (≥2 layers)
    assert n_triple == 1  # only the first also has a nearby signal
