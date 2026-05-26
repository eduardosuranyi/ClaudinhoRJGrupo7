"""Tests for area-weighted (areal-interpolation) population — the per-capita denominator.

These exercise `weighted_population_for_area` directly with synthetic geometries so the
maths is verified without depending on the real census data. Geometries are plain planar
boxes (any consistent CRS works because the helper only uses ratios of `.area`).
"""
import geopandas as gpd
from shapely.geometry import box

from data_pipeline import weighted_population_for_area


def _bairros(specs):
    """specs: list of (nome, shapely_geom). Returns a GeoDataFrame with a `nome` column."""
    names = [s[0] for s in specs]
    geoms = [s[1] for s in specs]
    return gpd.GeoDataFrame({"nome": names}, geometry=geoms, crs="EPSG:31983")


def test_polygon_equal_to_bairro_gets_full_population():
    # Polygon coincides with the whole bairro -> fraction 1.0 -> full population.
    bairros = _bairros([("A", box(0, 0, 10, 10))])
    pop_by_name = {"A": 1000}
    area_geom = box(0, 0, 10, 10)
    assert weighted_population_for_area(area_geom, bairros, pop_by_name) == 1000.0


def test_partial_overlap_is_area_weighted():
    # Polygon covers a quarter of the bairro's area -> a quarter of its population.
    bairros = _bairros([("A", box(0, 0, 10, 10))])  # area 100
    pop_by_name = {"A": 1000}
    area_geom = box(0, 0, 5, 5)  # intersection area 25 -> frac 0.25
    assert weighted_population_for_area(area_geom, bairros, pop_by_name) == 250.0


def test_corner_touch_contributes_nothing():
    # The bug being fixed: a bairro merely touching the polygon must contribute ~0,
    # not its entire population.
    bairros = _bairros([("A", box(0, 0, 10, 10))])
    pop_by_name = {"A": 200000}
    area_geom = box(10, 10, 20, 20)  # touches bairro A only at the point (10, 10)
    assert weighted_population_for_area(area_geom, bairros, pop_by_name) == 0.0


def test_multiple_bairros_sum_their_weighted_contributions():
    bairros = _bairros([
        ("A", box(0, 0, 10, 10)),   # area 100, pop 1000
        ("B", box(10, 0, 20, 10)),  # area 100, pop 2000
    ])
    pop_by_name = {"A": 1000, "B": 2000}
    area_geom = box(5, 0, 15, 10)  # half of A (500) + half of B (1000)
    assert weighted_population_for_area(area_geom, bairros, pop_by_name) == 1500.0


def test_bairro_without_census_population_is_skipped():
    bairros = _bairros([("A", box(0, 0, 10, 10)), ("B", box(10, 0, 20, 10))])
    pop_by_name = {"A": 1000}  # B has no census entry
    area_geom = box(0, 0, 20, 10)  # fully covers both
    assert weighted_population_for_area(area_geom, bairros, pop_by_name) == 1000.0


def test_empty_or_missing_inputs_return_zero():
    bairros = _bairros([("A", box(0, 0, 10, 10))])
    assert weighted_population_for_area(box(0, 0, 1, 1), bairros, {}) == 0.0
    assert weighted_population_for_area(None, bairros, {"A": 1000}) == 0.0
    assert weighted_population_for_area(box(0, 0, 1, 1), gpd.GeoDataFrame(), {"A": 1000}) == 0.0


def test_zero_overlap_drives_null_per_capita():
    # When weighted population is 0 the pipeline emits crimes_per_1000_hab = None
    # (guarded by `if pop_ponderada > 0`). This asserts the precondition for that.
    bairros = _bairros([("A", box(0, 0, 10, 10))])
    weighted = weighted_population_for_area(box(50, 50, 60, 60), bairros, {"A": 1000})
    assert weighted == 0.0  # -> pipeline yields None, not a division error
