#!/usr/bin/env python3
"""Build a routable street-network artifact from the IBGE logradouros gazetteer.

The raw gazetteer (`data/external/logradouros_rio.geojson`) is a collection of
street segments that do NOT form a single connected graph out of the box: streets
cross without a shared node and many endpoints miss each other by a few meters. A
naive vertex graph leaves only ~55% of nodes in the largest connected component.

This script produces a clean, *noded* and *snapped* network whose touching
endpoints share EXACTLY equal coordinates, so a coordinate-keyed pathfinder
(`geojson-path-finder`, used at runtime in the Next.js app) can build a connected
topology and route along real streets instead of drawing straight lines through
buildings.

Pipeline (all geometry work happens in a metric CRS so the tolerance is in meters):
  1. load + reproject to EPSG:31983 (SIRGAS 2000 / UTM 23S — same CRS the data
     pipeline already uses for metric buffers)
  2. explode MultiLineStrings into LineStrings
  3. node the network at true crossings           (unary_union + linemerge)
  4. cluster near-coincident endpoints (cKDTree, within --tolerance-m) and rewrite
     each segment's endpoints to the cluster centroid, so endpoints that should
     meet share EXACTLY equal coordinates
  5. compute connected components (union-find over endpoint clusters)
  6. keep only routable components (>= --min-component-edges, always the largest)
  7. simplify, reproject back to EPSG:4326, round coords, write slim GeoJSON

Run:  python3 build_routing_graph.py --data-dir ../../data
Output: eduardo/backend/street_network.routing.geojson
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge, unary_union

METRIC_CRS = "EPSG:31983"  # SIRGAS 2000 / UTM 23S — meters, matches data_pipeline.py
OUTPUT_CRS = "EPSG:4326"
COORD_DECIMALS = 6  # ~0.1 m; small enough to keep snapped endpoints identical


def _explode_lines(gdf: gpd.GeoDataFrame) -> list[LineString]:
    """Flatten every (Multi)LineString into individual LineStrings."""
    out: list[LineString] = []
    for geom in gdf.geometry:
        if geom is None or geom.is_empty:
            continue
        if isinstance(geom, LineString):
            out.append(geom)
        elif isinstance(geom, MultiLineString):
            out.extend(g for g in geom.geoms if not g.is_empty)
    return out


def _round_coords(coords) -> list[tuple[float, float]]:
    return [(round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)) for x, y in coords]


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        # path compression
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def build(data_dir: Path, output: Path, tolerance_m: float,
          min_component_edges: int, simplify_m: float, gzip_out: bool) -> None:
    t0 = time.time()
    src = data_dir / "external" / "logradouros_rio.geojson"
    if not src.is_file():
        sys.exit(f"ERRO: arquivo de entrada não encontrado: {src}")

    print(f"→ Carregando {src} ...")
    gdf = gpd.read_file(src).to_crs(METRIC_CRS)
    raw_lines = _explode_lines(gdf)
    print(f"  features (raw): {len(gdf)}  |  linestrings após explode: {len(raw_lines)}")

    print("→ Nodeando cruzamentos (unary_union + linemerge) ...")
    noded = linemerge(unary_union(raw_lines))
    segments = list(noded.geoms) if noded.geom_type == "MultiLineString" else [noded]
    segments = [s for s in segments if isinstance(s, LineString) and not s.is_empty and s.length > 0]
    seg_coords = [list(s.coords) for s in segments]
    print(f"  segmentos nodeados: {len(segments)}")

    # ── cluster near-coincident endpoints (cKDTree within tolerance) ───────
    print(f"→ Agrupando pontas próximas (tolerância {tolerance_m} m) ...")
    # Two endpoint slots per segment: index 2i = start, 2i+1 = end.
    pts = np.empty((2 * len(seg_coords), 2))
    for i, c in enumerate(seg_coords):
        pts[2 * i] = c[0]
        pts[2 * i + 1] = c[-1]
    tree = cKDTree(pts)
    pt_uf = _UnionFind()
    for i in range(len(pts)):
        pt_uf.find(i)
    for i, j in tree.query_pairs(r=tolerance_m):
        pt_uf.union(i, j)
    # canonical centroid per endpoint cluster
    clusters: dict = {}
    for i in range(len(pts)):
        clusters.setdefault(pt_uf.find(i), []).append(i)
    canonical = np.empty_like(pts)
    for members in clusters.values():
        centroid = pts[members].mean(axis=0)
        for m in members:
            canonical[m] = centroid
    # rewrite each segment's endpoints to the canonical (snapped) coordinate
    for i, c in enumerate(seg_coords):
        c[0] = (float(canonical[2 * i][0]), float(canonical[2 * i][1]))
        c[-1] = (float(canonical[2 * i + 1][0]), float(canonical[2 * i + 1][1]))

    # ── connectivity: union-find over endpoint clusters ────────────────────
    seg_root = []  # component root key per segment
    comp_uf = _UnionFind()
    for i in range(len(seg_coords)):
        ra, rb = pt_uf.find(2 * i), pt_uf.find(2 * i + 1)
        comp_uf.union(ra, rb)
    for i in range(len(seg_coords)):
        seg_root.append(comp_uf.find(pt_uf.find(2 * i)))

    comp_edges: dict = {}
    comp_nodes: dict = {}
    for i, root in enumerate(seg_root):
        comp_edges[root] = comp_edges.get(root, 0) + 1
    for cluster_root, members in clusters.items():
        r = comp_uf.find(cluster_root)
        comp_nodes[r] = comp_nodes.get(r, 0) + 1

    total_nodes = sum(comp_nodes.values())
    sizes = sorted(comp_edges.values(), reverse=True)
    n_components = len(comp_edges)
    largest = sizes[0] if sizes else 0
    largest_node_cov = (max(comp_nodes.values()) / total_nodes * 100) if total_nodes else 0

    # ── keep routable components ───────────────────────────────────────────
    keep_roots = {r for r, n in comp_edges.items() if n >= min_component_edges}
    if comp_edges:  # always keep the largest, even if below threshold
        keep_roots.add(max(comp_edges, key=comp_edges.get))
    kept_edges = sum(comp_edges[r] for r in keep_roots)

    # ── emit slim GeoJSON in EPSG:4326 ─────────────────────────────────────
    kept_idx = [i for i, root in enumerate(seg_root) if root in keep_roots]
    kept_gdf = gpd.GeoSeries([LineString(seg_coords[i]) for i in kept_idx], crs=METRIC_CRS)
    if simplify_m > 0:
        kept_gdf = kept_gdf.simplify(simplify_m, preserve_topology=True)
    kept_4326 = kept_gdf.to_crs(OUTPUT_CRS)

    comp_ids = {r: k for k, r in enumerate(sorted(keep_roots, key=lambda r: -comp_edges[r]))}
    features = []
    for pos, i in enumerate(kept_idx):
        geom4326 = kept_4326.iloc[pos]
        if geom4326.is_empty:
            continue
        coords = _round_coords(geom4326.coords)
        features.append({
            "type": "Feature",
            "properties": {"component": comp_ids[seg_root[i]]},
            "geometry": {"type": "LineString", "coordinates": [[x, y] for x, y in coords]},
        })

    fc = {"type": "FeatureCollection", "features": features}
    payload = json.dumps(fc, separators=(",", ":")).encode("utf-8")
    if gzip_out:
        out_path = output if output.suffix == ".gz" else output.with_suffix(output.suffix + ".gz")
        out_path.write_bytes(gzip.compress(payload, compresslevel=9))
        # remove a stale uncompressed twin so the runtime loader doesn't pick it
        plain_twin = out_path.with_suffix("")
        if plain_twin != out_path and plain_twin.is_file():
            plain_twin.unlink()
    else:
        out_path = output
        out_path.write_bytes(payload)
    output = out_path
    size_mb = output.stat().st_size / (1024 * 1024)

    # ── diagnostics ────────────────────────────────────────────────────────
    print("\n── DIAGNÓSTICO DA MALHA DE ROTEAMENTO ──────────────────────────")
    print(f"  tolerância de snap        : {tolerance_m} m")
    print(f"  segmentos (raw → nodeados): {len(raw_lines)} → {len(segments)}")
    print(f"  nós únicos (endpoints)    : {total_nodes}")
    print(f"  componentes conectados    : {n_components}")
    print(f"  maior componente (arestas): {largest}  ({largest_node_cov:.1f}% dos nós)")
    print(f"  top-5 componentes         : {sizes[:5]}")
    print(f"  componentes mantidos      : {len(keep_roots)} (>= {min_component_edges} arestas)")
    print(f"  arestas mantidas          : {kept_edges} / {len(segments)} "
          f"({100*kept_edges/max(len(segments),1):.1f}%)")
    print(f"  features no artefato       : {len(features)}")
    print(f"  arquivo                   : {output}  ({size_mb:.1f} MB)")
    if size_mb > 10:
        print("  ⚠ artefato > 10 MB — considere aumentar --simplify ou gzipar.")
    if len(keep_roots) > 1:
        print("  ⚠ múltiplos componentes mantidos: rotas entre componentes distintos "
              "cairão no fallback ('rota aproximada — sem caminho na malha').")
    print(f"  tempo total               : {time.time()-t0:.1f}s")
    print("────────────────────────────────────────────────────────────────")


def main() -> None:
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=here / ".." / ".." / "data",
                    help="raiz dos dados (contém external/logradouros_rio.geojson)")
    ap.add_argument("--output", type=Path, default=here / "street_network.routing.geojson",
                    help="arquivo GeoJSON de saída")
    ap.add_argument("--tolerance-m", type=float, default=12.0,
                    help="distância máxima (m) para fundir vértices próximos")
    ap.add_argument("--min-component-edges", type=int, default=150,
                    help="mantém apenas componentes com >= este nº de arestas")
    ap.add_argument("--simplify", dest="simplify_m", type=float, default=3.0,
                    help="tolerância de simplificação Douglas-Peucker (m); 0 desativa")
    ap.add_argument("--no-gzip", dest="gzip_out", action="store_false",
                    help="grava .geojson sem compressão (padrão: grava .geojson.gz)")
    ap.set_defaults(gzip_out=True)
    args = ap.parse_args()
    build(args.data_dir.resolve(), args.output.resolve(),
          args.tolerance_m, args.min_component_edges, args.simplify_m, args.gzip_out)


if __name__ == "__main__":
    main()
