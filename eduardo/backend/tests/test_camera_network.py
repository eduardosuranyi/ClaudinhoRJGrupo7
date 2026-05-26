"""Tests for the enhanced camera blind-spot analysis: network-distance coverage,
DBSCAN-style clustering, and priority scoring.

The straight-line (Euclidean) behaviour is covered by test_camera_gaps.py (network=None).
Here we build a *tiny synthetic* street network so we can assert that a camera which is
close in a straight line but far along the streets does NOT cover a crime.
"""
import networkx as nx
import numpy as np
import pandas as pd
import pytest
from scipy.spatial import cKDTree

from data_pipeline import (
    compute_camera_gaps,
    _cluster_points_metric,
    CAMERA_COVERAGE_RADIUS_M,
)


def _fake_network(graph):
    """Wrap a metric-coordinate networkx graph in the {graph,kdtree,nodes} struct."""
    nodes = list(graph.nodes())
    return {"graph": graph, "kdtree": cKDTree(nodes), "nodes": nodes}


def test_cluster_points_metric_separates_distant_groups():
    # Two tight groups ~1 km apart -> exactly two clusters.
    xs = np.array([0.0, 5.0, 10.0, 1000.0, 1005.0])
    ys = np.array([0.0, 0.0, 0.0, 0.0, 0.0])
    labels = _cluster_points_metric(xs, ys, eps=60)
    assert len(set(labels)) == 2
    # The first three share a label; the last two share a different label.
    assert labels[0] == labels[1] == labels[2]
    assert labels[3] == labels[4]
    assert labels[0] != labels[3]


def test_network_coverage_is_stricter_than_euclidean():
    """A camera 40 m away in a straight line but ~360 m along the streets must NOT cover.

    Graph is a long detour: camera node C and crime node X are 40 m apart as the crow flies
    but only connected via a 360 m path. Coordinates are in metres (any metric CRS works for
    the helper). We convert to lat/lon only loosely — the function reprojects from 4326, so
    we instead feed coordinates already near Rio and align the graph to those metres via a
    self-consistent synthetic setup using the public API.
    """
    # Build the graph directly in EPSG:31983-like metric space.
    # Camera at (0,0); crime at (40,0) — 40 m straight line.
    # Only path between their snapped nodes is 0->(0,180)->(40,180)->(40,0) = 180+40+180=400 m.
    G = nx.Graph()
    G.add_edge((0.0, 0.0), (0.0, 180.0), weight=180.0)
    G.add_edge((0.0, 180.0), (40.0, 180.0), weight=40.0)
    G.add_edge((40.0, 180.0), (40.0, 0.0), weight=180.0)
    net = _fake_network(G)

    # The function builds its own metric geometry from lat/lon; to keep the synthetic graph
    # aligned, we instead exercise the coverage logic via _snap_nodes + dijkstra directly,
    # mirroring compute_camera_gaps' network branch.
    from data_pipeline import _snap_nodes
    cam_nodes, _ = _snap_nodes(net, [0.0], [0.0])
    dist_map = nx.multi_source_dijkstra_path_length(G, cam_nodes)
    crime_node, snap_d = _snap_nodes(net, [40.0], [0.0])
    net_dist = dist_map.get(crime_node[0], float("inf"))

    # Straight line says 40 m (covered at radius 50); network says 400 m (NOT covered).
    assert net_dist == 400.0
    assert net_dist > CAMERA_COVERAGE_RADIUS_M


def test_compute_camera_gaps_reports_coverage_method_and_priority():
    # With network=None we still get the new additive fields; method is "euclidean".
    cam_df = pd.DataFrame({"lat": [-22.9], "lng": [-43.18]})
    crimes_df = pd.DataFrame({
        "latitude": [-22.95, -22.95, -22.95],
        "longitude": [-43.18, -43.18, -43.18],
        "desc_delito": ["Roubo em coletivo", "Roubo a transeunte", "Roubo a transeunte"],
    })
    result = compute_camera_gaps(crimes_df, cam_df, network=None)
    assert result["coverage_method"] == "euclidean"
    assert len(result["gaps"]) >= 1
    g = result["gaps"][0]
    assert "priority_score" in g and g["priority_score"] > 0
    assert "network_camera_m" in g and g["network_camera_m"] is None  # no network supplied
    assert g["recommendation"] in ("instalar", "remanejar")


def test_gaps_are_ranked_by_priority_descending():
    cam_df = pd.DataFrame({"lat": [-22.9], "lng": [-43.18]})
    # One large nearby-ish cluster and one small far cluster.
    crimes_df = pd.DataFrame({
        "latitude": [-22.92, -22.92, -22.92, -22.92, -22.98],
        "longitude": [-43.18, -43.18, -43.18, -43.18, -43.18],
        "desc_delito": ["Roubo a transeunte"] * 5,
    })
    result = compute_camera_gaps(crimes_df, cam_df, network=None)
    pris = [g["priority_score"] for g in result["gaps"]]
    assert pris == sorted(pris, reverse=True)
