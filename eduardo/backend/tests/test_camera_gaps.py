import pandas as pd

from data_pipeline import compute_camera_gaps


def test_compute_camera_gaps_no_cameras(sample_crimes_df):
    result = compute_camera_gaps(sample_crimes_df, pd.DataFrame())
    assert result["n_cameras"] == 0
    assert result["gaps"] == []


def test_compute_camera_gaps_empty_crimes(sample_cameras_df):
    result = compute_camera_gaps(pd.DataFrame(), sample_cameras_df)
    assert result["n_cameras"] == 2
    assert result["gaps"] == []


def test_compute_camera_gaps_returns_ranked():
    cam_df = pd.DataFrame({"lat": [-22.9], "lng": [-43.18]})
    crimes_df = pd.DataFrame({
        "latitude": [-22.92, -22.92, -22.92, -22.95],
        "longitude": [-43.18, -43.18, -43.18, -43.18],
    })
    result = compute_camera_gaps(crimes_df, cam_df)
    if len(result["gaps"]) >= 2:
        counts = [g["uncovered_crimes"] for g in result["gaps"]]
        assert counts == sorted(counts, reverse=True)


def test_compute_camera_gaps_recommendation():
    cam_df = pd.DataFrame({"lat": [-22.9], "lng": [-43.18]})
    far_crimes = pd.DataFrame({
        "latitude": [-22.95, -22.95],
        "longitude": [-43.18, -43.18],
    })
    far_result = compute_camera_gaps(far_crimes, cam_df)
    assert len(far_result["gaps"]) >= 1
    assert far_result["gaps"][0]["recommendation"] == "instalar"

    near_crimes = pd.DataFrame({
        "latitude": [-22.9004, -22.9004],
        "longitude": [-43.18, -43.18],
    })
    near_result = compute_camera_gaps(near_crimes, cam_df)
    if near_result["gaps"]:
        assert near_result["gaps"][0]["recommendation"] == "remanejar"
