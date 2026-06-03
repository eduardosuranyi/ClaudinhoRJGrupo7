from data_pipeline import classify_displacement


def test_displacement_area_down_ring_up():
    # area -20%, ring +30% over 2023->2024, solid counts
    out = classify_displacement(
        {2023: 100, 2024: 80},
        {2023: 100, 2024: 130},
    )
    assert out["label"] == "deslocamento_provavel"
    assert out["area_yoy_pct"] == -20.0
    assert out["ring_yoy_pct"] == 30.0
    assert out["anos_comparados"] == [2023, 2024]


def test_displacement_both_down():
    out = classify_displacement({2023: 100, 2024: 70}, {2023: 50, 2024: 30})
    assert out["label"] == "reducao_genuina"


def test_displacement_both_up():
    out = classify_displacement({2023: 100, 2024: 140}, {2023: 50, 2024: 80})
    assert out["label"] == "intensificacao"


def test_displacement_insufficient_years():
    out = classify_displacement({2024: 80}, {2024: 130})
    assert out["label"] == "inconclusivo"
    assert out["area_yoy_pct"] is None


def test_displacement_zero_baseline():
    # prior year 0 -> no ZeroDivision, inconclusivo
    out = classify_displacement({2023: 0, 2024: 50}, {2023: 10, 2024: 5})
    assert out["label"] == "inconclusivo"
    assert out["area_yoy_pct"] is None


def test_displacement_low_counts_low_confidence():
    # tiny baselines -> confidence baixa even if direction diverges
    out = classify_displacement({2023: 3, 2024: 2}, {2023: 1, 2024: 2})
    assert out["confidence"] == "baixa"


def test_displacement_high_confidence():
    # large divergence + solid baselines
    out = classify_displacement({2023: 200, 2024: 100}, {2023: 100, 2024: 200})
    assert out["label"] == "deslocamento_provavel"
    assert out["confidence"] == "alta"


def test_displacement_dead_band():
    # area -5% (within ±10% dead-band) -> not displacement
    out = classify_displacement({2023: 100, 2024: 95}, {2023: 100, 2024: 130})
    assert out["label"] == "inconclusivo"


def test_displacement_string_year_keys():
    # year keys may arrive as strings from JSON
    out = classify_displacement({"2023": 100, "2024": 80}, {"2023": 100, "2024": 130})
    assert out["label"] == "deslocamento_provavel"
