from data_pipeline import normalize_scores


def _make_areas_raw():
    return [
        {
            "nome": "Area A",
            "_raw": {"crime": 100, "peak_ratio": 0.5, "fatores": 50, "denuncias": 20, "has_relint": False},
        },
        {
            "nome": "Area B",
            "_raw": {"crime": 50, "peak_ratio": 0.3, "fatores": 25, "denuncias": 10, "has_relint": True},
        },
        {
            "nome": "Area C",
            "_raw": {"crime": 10, "peak_ratio": 0.1, "fatores": 5, "denuncias": 2, "has_relint": False},
        },
    ]


def test_normalize_scores_max_area():
    areas = _make_areas_raw()
    result = normalize_scores(areas)
    max_area = next(a for a in result if a["nome"] == "Area A")
    assert max_area["score"]["breakdown"]["mancha_criminal"] == 40.0


def test_normalize_scores_relint_bonus():
    areas = _make_areas_raw()
    result = normalize_scores(areas)
    relint_area = next(a for a in result if a["nome"] == "Area B")
    assert relint_area["score"]["breakdown"]["relint_bonus"] == 5


def test_normalize_scores_range():
    areas = _make_areas_raw()
    result = normalize_scores(areas)
    for area in result:
        total = area["score"]["total"]
        assert 0 <= total <= 100


def test_score_breakdown_sums():
    areas = _make_areas_raw()
    result = normalize_scores(areas)
    for area in result:
        breakdown = area["score"]["breakdown"]
        component_sum = sum(breakdown.values())
        assert abs(component_sum - area["score"]["total"]) < 0.2
