import pandas as pd

from data_pipeline import (
    _mann_kendall,
    _poisson_ci_rows,
    evolution_mensal,
    evolution_mensal_stats,
    monthly_counts_full,
)


# ── monthly_counts_full ──────────────────────────────────────────────

def test_monthly_counts_full_gapfill():
    # Jan and Mar present, Feb missing -> Feb filled with 0
    df = pd.DataFrame({"data": ["01/01/2023", "02/01/2023", "10/03/2023"]})
    s = monthly_counts_full(df)
    assert list(s.index.astype(str)) == ["2023-01", "2023-02", "2023-03"]
    assert s.loc[pd.Period("2023-02", "M")] == 0
    assert s.loc[pd.Period("2023-01", "M")] == 2


def test_monthly_counts_full_empty():
    assert monthly_counts_full(pd.DataFrame()).empty


# ── evolution_mensal regression guard ────────────────────────────────

def test_evolution_mensal_unchanged(sample_long_crimes_df):
    out = evolution_mensal(sample_long_crimes_df)
    assert len(out) <= 24
    assert all(set(r.keys()) == {"mes", "total"} for r in out)


# ── Mann-Kendall ─────────────────────────────────────────────────────

def test_mann_kendall_decreasing():
    mk = _mann_kendall(list(range(40, 4, -1)))  # strictly decreasing
    assert mk["available"] is True
    assert mk["direction"] == "decrescente"
    assert mk["significant"] is True
    assert mk["tau"] < 0


def test_mann_kendall_increasing():
    mk = _mann_kendall(list(range(4, 40)))
    assert mk["direction"] == "crescente"
    assert mk["significant"] is True
    assert mk["tau"] > 0


def test_mann_kendall_constant():
    mk = _mann_kendall([7] * 30)
    assert mk["available"] is False
    assert mk["significant"] is False  # no divide-by-zero


def test_mann_kendall_short_series():
    mk = _mann_kendall([1, 2, 3])
    assert mk["available"] is False


# ── Poisson CI ───────────────────────────────────────────────────────

def test_poisson_ci_contains_count():
    rows = [{"mes": "2024-01", "total": k} for k in (0, 1, 5, 50)]
    ci = _poisson_ci_rows(rows)
    for r in ci:
        assert r["ci_lo"] <= r["total"] <= r["ci_hi"]


def test_poisson_ci_zero_count():
    ci = _poisson_ci_rows([{"mes": "2024-01", "total": 0}])
    assert ci[0]["ci_lo"] == 0.0
    assert ci[0]["ci_hi"] > 0


def test_poisson_ci_aligned_to_display(sample_long_crimes_df):
    display = evolution_mensal(sample_long_crimes_df)
    stats = evolution_mensal_stats(sample_long_crimes_df)
    ci = stats["poisson_ci"]
    assert len(ci) == len(display)
    assert [r["mes"] for r in ci] == [r["mes"] for r in display]


# ── evolution_mensal_stats orchestration ─────────────────────────────

def test_stats_empty_df():
    assert evolution_mensal_stats(pd.DataFrame()) == {"available": False, "reason": "serie_curta", "n_meses": 0}


def test_stats_short_series_skips_seasonal(sample_short_crimes_df):
    stats = evolution_mensal_stats(sample_short_crimes_df)
    # 3 months -> below the n<4 floor -> not available at all
    assert stats["available"] is False


def test_stats_long_series_full(sample_long_crimes_df):
    stats = evolution_mensal_stats(sample_long_crimes_df)
    assert stats["available"] is True
    assert stats["n_meses"] >= 24
    assert stats["mann_kendall"]["direction"] == "decrescente"
    assert stats["seasonal"]["available"] is True
    assert "trend_delta_pct" in stats["seasonal"]


def test_stats_medium_series_no_seasonal():
    # 12 months: enough for MK, not enough (need 24) for seasonal
    rows = []
    for m in range(1, 13):
        for d in range(1, 11):
            rows.append({"data": f"{d:02d}/{m:02d}/2023"})
    stats = evolution_mensal_stats(pd.DataFrame(rows))
    assert stats["available"] is True
    assert stats["seasonal"]["available"] is False
