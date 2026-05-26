"""
CompStat Rio — Data Pipeline v2
Integra TODAS as fontes: ocorrências, disque denúncia, fatores urbanos,
câmeras, domínio territorial, censo PSR, RELINTs, polígonos FM.

Output: areas_data.json (consumido por frontend e gerador de relatório)
"""

import argparse
import json
import re
import shutil
import unicodedata
import warnings
from collections import Counter
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point, shape

warnings.filterwarnings("ignore")


def _repo_clean_bundle(data_dir: Path) -> bool:
    """True quando `data_dir` aponta para a pasta `data/` do repositório (subpasta clean/)."""
    return (data_dir / "clean" / "ocorrencias.parquet").is_file()


# ───────────────────────────────────────────────────────────────────────────
# 1. LOADERS
# ───────────────────────────────────────────────────────────────────────────

def load_ocorrencias(data_dir: Path) -> pd.DataFrame:
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "ocorrencias.parquet")
        df = df[df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)].copy()
        df = df.rename(columns={"delito_descricao": "desc_delito"})
        hr = df.get("hora_original")
        df["hora"] = hr.fillna("") if hr is not None else ""
        dp = pd.to_datetime(df["data_parsed"], errors="coerce")
        df["data"] = dp.dt.strftime("%d/%m/%Y")
        df["aisp"] = pd.to_numeric(df.get("aisp"), errors="coerce")
        df["risp"] = pd.to_numeric(df.get("risp"), errors="coerce")
        def parse_hora(h):
            try:
                return int(str(h).split(":")[0])
            except Exception:
                return None
        df["hora_num"] = df["hora"].apply(parse_hora)

        df["locf_norm"] = (
            df["locf"].fillna("").str.lower()
            .str.replace(r"\b(avenida|rua|praca|praça|vila|travessa|alameda|estrada)\s+\1\b", r"\1", regex=True)
            .str.strip()
        )
        return df

    path = data_dir / "dados" / "df_ocorrencias_tratado - Extração 1 .csv"
    df = pd.read_csv(path, low_memory=False)
    df = df[df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)].copy()

    def parse_hora(h):
        try:
            return int(str(h).split(":")[0])
        except Exception:
            return None
    df["hora_num"] = df["hora"].apply(parse_hora)

    df["locf_norm"] = (
        df["locf"].fillna("").str.lower()
        .str.replace(r"\b(avenida|rua|praca|praça|vila|travessa|alameda|estrada)\s+\1\b", r"\1", regex=True)
        .str.strip()
    )
    return df


def _rename_dd_dot_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Rename envolvidos.X columns to envolvidos_X for itertuples() compatibility."""
    renames = {c: c.replace(".", "_") for c in df.columns if "." in c}
    return df.rename(columns=renames) if renames else df


def load_disk_denuncia(data_dir: Path) -> tuple:
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "disque_denuncia.parquet")
        df = _rename_dd_dot_cols(df)
        mask = df["tipo"].str.contains("ROUBO|FURTO", case=False, na=False)
        df = df[mask].copy()
        df["bairro_norm"] = df["bairro_logradouro"].fillna("").str.upper().str.strip()
        df["data_parsed"] = pd.to_datetime(df["data_denuncia"], errors="coerce", format="mixed")
        valid_geo = df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)
        return df[valid_geo].copy(), df[~valid_geo].copy()

    path = data_dir / "dados" / "disk_denuncia.csv"
    df = pd.read_csv(path, encoding="latin-1", sep=";", low_memory=False, decimal=",")
    # Só roubo/furto
    mask = df["tipo"].str.contains("ROUBO|FURTO", case=False, na=False)
    df = df[mask].copy()
    df["bairro_norm"] = df["bairro_logradouro"].fillna("").str.upper().str.strip()
    df["data_parsed"] = pd.to_datetime(df["data_denuncia"], errors="coerce", format="mixed")
    valid_geo = df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)
    return df[valid_geo].copy(), df[~valid_geo].copy()


def load_fatores_urbanos(data_dir: Path) -> pd.DataFrame:
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "fatores_urbanos.parquet")
        df = df[df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)].copy()
        return df

    path = data_dir / "dados" / "fatores_urbanos.csv"
    df = pd.read_csv(path, low_memory=False)
    df = df.rename(columns={"coordenada_x": "latitude", "coordenada_y": "longitude"})
    df = df[df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)].copy()
    return df


def load_cameras(data_dir: Path) -> pd.DataFrame:
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "cameras.parquet")
        df["lat"] = pd.to_numeric(df["latitude"], errors="coerce")
        df["lng"] = pd.to_numeric(df["longitude"], errors="coerce")
        df = df[df["lat"].between(-23.2, -22.7) & df["lng"].between(-43.9, -43.0)].copy()
        df["geometry"] = df.apply(lambda r: f"POINT ({r['lng']} {r['lat']})", axis=1)
        return df

    path = data_dir / "dados" / "cameras_areas_fm.csv"
    df = pd.read_csv(path, low_memory=False)

    def parse_wkt(wkt):
        m = re.search(r"POINT \(([^\s]+) ([^\s]+)\)", str(wkt))
        if m:
            return float(m.group(2)), float(m.group(1))
        return None, None
    df[["lat", "lng"]] = df["geometry"].apply(lambda x: pd.Series(parse_wkt(x)))
    df = df[df["lat"].between(-23.2, -22.7) & df["lng"].between(-43.9, -43.0)].copy()
    return df


def load_polygons(data_dir: Path) -> gpd.GeoDataFrame:
    gj = data_dir / "clean" / "fm_areas.geojson"
    if gj.is_file():
        gdf = gpd.read_file(gj).to_crs(4326)
        gdf = gdf.rename(columns={"nome_subar": "nome_area"})
        gdf["fid"] = pd.to_numeric(gdf["fid"], errors="coerce").fillna(0).astype(int)
        return gdf

    path = data_dir / "sh_area_forca" / "areas_forca_municipal.shp"
    gdf = gpd.read_file(path).to_crs(4326)
    gdf = gdf.rename(columns={"nome_subar": "nome_area"})
    return gdf


def load_dominio(data_dir: Path) -> gpd.GeoDataFrame:
    """Carrega domínio territorial (facções) e converte WKT para geometria."""
    gj = data_dir / "clean" / "dominio_territorial.geojson"
    if gj.is_file():
        gdf = gpd.read_file(gj).to_crs(4326)
        gdf = gdf[gdf.geometry.notna()].copy()
        b = gdf.geometry.bounds
        gdf = gdf[b["minx"].between(-44, -43) & b["miny"].between(-23.2, -22.7)].copy()
        return gdf

    path = data_dir / "dados" / "outros dados" / "dominio_territorial - Extração 1.csv"
    df = pd.read_csv(path, low_memory=False)
    from shapely import wkt as shapely_wkt
    geoms = []
    for g in df["geometria"]:
        try:
            geoms.append(shapely_wkt.loads(str(g)))
        except Exception:
            geoms.append(None)
    gdf = gpd.GeoDataFrame(df, geometry=geoms, crs=4326)
    gdf = gdf[gdf.geometry.notna()].copy()
    # Filtrar pra bounds do Rio
    gdf = gdf[gdf.geometry.bounds["minx"].between(-44, -43) & gdf.geometry.bounds["miny"].between(-23.2, -22.7)]
    return gdf


def load_psr(data_dir: Path) -> pd.DataFrame:
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "cpsr.parquet")
        df = df.rename(columns={
            "latitude": "lat",
            "longitude": "lng",
            "classificacao_idade": "idade_classe",
        })
        df = df[df["lat"].between(-23.2, -22.7) & df["lng"].between(-43.9, -43.0)].copy()
        return df

    path = data_dir / "dados" / "outros dados" / "CPSR_2020_2022_2024.xlsx"
    df = pd.read_excel(path, sheet_name=0,
                       usecols=["Chave_única", "Latitude", "Longitude",
                                "Classificação idade", "Sexo"])
    df = df.rename(columns={"Latitude": "lat", "Longitude": "lng",
                            "Classificação idade": "idade_classe"})
    df = df[df["lat"].between(-23.2, -22.7) & df["lng"].between(-43.9, -43.0)].copy()
    return df


def load_relints(data_dir: Path) -> dict:
    reljson = data_dir / "clean" / "relints.json"
    if reljson.is_file():
        codigo_para_area = {
            "RI_010": "Rodoviária - Terminal Gentileza - Estação Leopoldina",
            "RI_011": "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria",
            "RI_012": "Jardim de Alah",
            "RI_013": "Campo Grande: Estação de Trem - Calçadão",
            "RI_014": "Rio Sul",
            "RI_015": "Praia de Botafogo - Rua Marquês de Abrantes",
            "RI_016": "Estações São Francisco Xavier - Afonso Pena",
            "RI_017": "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
        }
        result = {}
        with open(reljson, encoding="utf-8") as f:
            items = json.load(f)
        for entry in items:
            fn = str(entry.get("filename", ""))
            m = re.search(r"RI_(\d{3})", fn, flags=re.I)
            if not m:
                continue
            cod = "RI_" + m.group(1)
            nome = codigo_para_area.get(cod)
            if not nome:
                continue
            full_text = str(entry.get("full_text", "") or "")
            secs_raw = entry.get("sections") or []
            sections = []
            if isinstance(secs_raw, list):
                for i in range(0, len(secs_raw) - 1, 2):
                    sections.append({"titulo": str(secs_raw[i]), "texto": str(secs_raw[i + 1])})
                if len(secs_raw) % 2 == 1:
                    sections.append({"titulo": str(secs_raw[-1]), "texto": ""})
            if not full_text.strip() and sections:
                full_text = "\n\n".join(f"## {s['titulo']}\n{s['texto']}" for s in sections)
            result[nome] = {"full_text": full_text, "sections": sections}
        return result

    relints_dir = data_dir / "relints"
    result = {}
    try:
        from docx import Document
    except ImportError:
        return result
    mapping = {
        "Rodoviária - Terminal Gentileza - Estação Leopoldina": "RI_010",
        "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria": "RI_011",
        "Jardim de Alah": "RI_012",
        "Campo Grande: Estação de Trem - Calçadão": "RI_013",
        "Rio Sul": "RI_014",
        "Praia de Botafogo - Rua Marquês de Abrantes": "RI_015",
        "Estações São Francisco Xavier - Afonso Pena": "RI_016",
        "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia": "RI_017",
    }
    for nome_area, cod in mapping.items():
        matches = list(relints_dir.glob(f"*{cod}*.docx"))
        if not matches:
            continue
        try:
            doc = Document(matches[0])
            sections = []
            current_title = None
            current_body = []
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        text = cell.text.strip()
                        if not text:
                            continue
                        # Heuristic: title is short uppercase, body is long
                        is_title = (
                            len(text) < 80
                            and text == text.upper()
                            and not text.startswith("A ")
                            and not text.startswith("O ")
                        )
                        if is_title:
                            if current_title and current_body:
                                sections.append({"titulo": current_title, "texto": "\n".join(current_body)})
                            current_title = text
                            current_body = []
                        else:
                            current_body.append(text)
            if current_title and current_body:
                sections.append({"titulo": current_title, "texto": "\n".join(current_body)})
            full_text = "\n\n".join(f"## {s['titulo']}\n{s['texto']}" for s in sections)
            result[nome_area] = {"full_text": full_text, "sections": sections}
        except Exception as e:
            result[nome_area] = {"full_text": f"[ERRO: {e}]", "sections": []}
    return result


# ───────────────────────────────────────────────────────────────────────────
# 1b. EXTERNAL DATA LOADERS (bairros, censo, 1746, DD drogas)
# ───────────────────────────────────────────────────────────────────────────


def load_bairros(data_dir: Path) -> gpd.GeoDataFrame:
    path = data_dir / "external" / "bairros_rio.geojson"
    if not path.is_file():
        return gpd.GeoDataFrame()
    return gpd.read_file(path).to_crs(4326)


def load_censo(data_dir: Path) -> gpd.GeoDataFrame:
    path = data_dir / "external" / "censo_2022_bairros.geojson"
    if not path.is_file():
        return gpd.GeoDataFrame()
    return gpd.read_file(path).to_crs(4326)


def load_chamados_1746(data_dir: Path) -> pd.DataFrame:
    path = data_dir / "external" / "chamados_1746_fm.csv"
    gz_path = path.with_suffix(".csv.gz")
    if gz_path.is_file():
        path = gz_path
    elif not path.is_file():
        return pd.DataFrame()
    usecols = [
        "id_chamado", "data_inicio", "data_fim", "id_bairro",
        "nome_unidade_organizacional", "tipo", "subtipo",
        "tipo_situacao", "dentro_prazo",
        "latitude", "longitude", "data_particao",
    ]
    df = pd.read_csv(path, usecols=usecols, low_memory=False)
    df["data_particao"] = pd.to_datetime(df["data_particao"], errors="coerce")
    df["data_inicio"] = pd.to_datetime(df["data_inicio"], errors="coerce")
    df["data_fim"] = pd.to_datetime(df["data_fim"], errors="coerce")
    return df


def load_dd_drogas(data_dir: Path) -> pd.DataFrame:
    """Load DD records for CONSUMO DE DROGAS (SMAS factor signal)."""
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "disque_denuncia.parquet")
    else:
        path = data_dir / "dados" / "disk_denuncia.csv"
        if not path.is_file():
            return pd.DataFrame()
        df = pd.read_csv(path, encoding="latin-1", sep=";", low_memory=False, decimal=",")
    mask = df["tipo"].str.contains("CONSUMO DE DROGAS", case=False, na=False)
    df = df[mask].copy()
    valid_geo = df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)
    return df[valid_geo].copy()


def load_dd_all_geo(data_dir: Path) -> pd.DataFrame:
    """Load ALL geocoded DD records (for bairro-level aggregation)."""
    if _repo_clean_bundle(data_dir):
        df = pd.read_parquet(data_dir / "clean" / "disque_denuncia.parquet")
    else:
        path = data_dir / "dados" / "disk_denuncia.csv"
        if not path.is_file():
            return pd.DataFrame()
        df = pd.read_csv(path, encoding="latin-1", sep=";", low_memory=False, decimal=",")
    valid_geo = df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)
    return df[valid_geo].copy()


def load_logradouros(data_dir: Path) -> gpd.GeoDataFrame:
    path = data_dir / "external" / "logradouros_rio.geojson"
    if not path.is_file():
        return gpd.GeoDataFrame()
    gdf = gpd.read_file(path).to_crs(4326)
    if "completo" in gdf.columns:
        gdf["_name_norm"] = gdf["completo"].apply(_normalize_street)
    return gdf


def _normalize_street(s):
    """Strip accents and lowercase for fuzzy matching."""
    if not isinstance(s, str):
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


def match_trechos_to_lines(top_trechos, logradouros, bairro_names, clip_polygon=None):
    """For each top_trecho, find matching LineString geometries from the gazetteer,
    clipped to the FM area polygon so lines don't overflow."""
    if logradouros.empty or "_name_norm" not in logradouros.columns:
        return top_trechos

    bairro_set = set(b.lower() for b in bairro_names) if bairro_names else set()
    log_in_bairros = logradouros
    if bairro_set and "bairro" in logradouros.columns:
        log_in_bairros = logradouros[logradouros["bairro"].str.lower().isin(bairro_set)]

    name_index = {}
    for idx, row in log_in_bairros.iterrows():
        nn = row["_name_norm"]
        if nn not in name_index:
            name_index[nn] = []
        name_index[nn].append(row.geometry)

    from shapely.ops import linemerge
    from shapely.geometry import MultiLineString as ShapelyMLS

    clip = clip_polygon.buffer(0.001) if clip_polygon else None

    enriched = []
    for t in top_trechos:
        raw_name = t["locf_norm"]
        norm = _normalize_street(raw_name)
        norm_clean = re.sub(r"^(praia|praca)\s+\1\s+", r"\1 ", norm)
        geoms = name_index.get(norm) or name_index.get(norm_clean)
        tc = dict(t)
        if geoms:
            merged = linemerge(ShapelyMLS(geoms)) if len(geoms) > 1 else geoms[0]
            if clip and not merged.is_empty:
                merged = merged.intersection(clip)
            if not merged.is_empty:
                simplified = merged.simplify(0.0002, preserve_topology=True)
                tc["line_geometry"] = simplified.__geo_interface__
        enriched.append(tc)
    return enriched


# ───────────────────────────────────────────────────────────────────────────
# 1c. BAIRRO CONTEXT BUILDER
# ───────────────────────────────────────────────────────────────────────────


# Metric CRS used for any area-based computation (SIRGAS 2000 / UTM 23S — Rio).
# In this CRS .area / .length are in metres², metres — required for areal weighting.
METRIC_CRS = "EPSG:31983"


def weighted_population_for_area(area_geom, bairros_gdf, pop_by_name, name_col="nome"):
    """Estimate the resident population *inside* an FM polygon via areal interpolation.

    For each bairro that intersects the polygon, the bairro's census population is
    weighted by the fraction of the bairro's area that actually falls inside the
    polygon::

        contribution = bairro_pop * ( area(bairro ∩ polygon) / area(bairro) )

    Summing the contributions estimates how many residents live within the patrol
    polygon itself.

    WHY this exists: the previous denominator summed the *entire* population of every
    bairro that merely touched the polygon (``predicate="intersects"`` + full sum). A
    polygon grazing the corner of a 200k-resident bairro inherited all 200k, deflating
    ``crimes_per_1000_hab``. Areal weighting makes a corner-touch contribute ~0
    automatically, so the rate reflects the patrolled area rather than whole bairros.

    CAVEAT (documented in DATA_LOGIC_FIXES.md): areal interpolation assumes population
    is uniform within a bairro (it is not), and FM polygons are mostly commercial/transit
    corridors with few residents — so the resulting rate measures *exposure relative to
    residents*, which is large where the floating (daytime) population dominates. That is
    the correct direction and is already flagged to the agent in app/api/agent/route.ts.

    Geometries in ``area_geom`` and ``bairros_gdf`` MUST share the same planar/metric CRS
    (e.g. EPSG:31983) so ``.area`` is meaningful. Returns a float (0.0 when no overlap).
    """
    if (
        bairros_gdf is None or bairros_gdf.empty
        or area_geom is None or area_geom.is_empty
        or not pop_by_name
    ):
        return 0.0
    total = 0.0
    for _, row in bairros_gdf.iterrows():
        bgeom = row.geometry
        if bgeom is None or bgeom.is_empty or not bgeom.intersects(area_geom):
            continue
        bairro_area = bgeom.area
        if bairro_area <= 0:
            continue
        pop = pop_by_name.get(row.get(name_col))
        if pop is None:
            continue
        frac = bgeom.intersection(area_geom).area / bairro_area
        if frac <= 0:
            continue
        total += float(pop) * frac
    return total


def build_bairro_context(polys, bairros, censo):
    """Precompute bairro→FM area mapping with population data + geometries.

    Two distinct population figures are produced per area:

    * ``populacao_bairros_2022`` — sum of the *whole* residential population of every
      surrounding bairro that intersects the polygon. This is the human-readable
      "Pop. Residente (Censo 2022)" context number shown in the UI and is intentionally
      left unchanged so displayed values stay stable.
    * ``populacao_ponderada`` — areal-interpolated estimate of residents *inside* the
      polygon (see :func:`weighted_population_for_area`). This is the denominator used
      for ``crimes_per_1000_hab`` so the per-capita rate is not deflated by bairros that
      only graze the polygon.
    """
    if bairros.empty:
        return {}

    fm_bairros = gpd.sjoin(bairros, polys[["nome_area", "geometry"]], how="inner", predicate="intersects")

    # Pre-project geometries once (metric CRS) for areal weighting, and build a
    # name→population lookup from the census (matched to bairros by name, exactly as the
    # whole-bairro sum below does, so both figures use a consistent source pairing).
    polys_m = polys.to_crs(METRIC_CRS)
    bairros_m = bairros.to_crs(METRIC_CRS) if "nome" in bairros.columns else bairros.iloc[0:0]
    pop_by_name = {}
    if not censo.empty and "nome" in censo.columns and "Total_de_pessoas_2022" in censo.columns:
        pop_by_name = dict(zip(censo["nome"], censo["Total_de_pessoas_2022"]))

    context = {}
    for nome_area in polys["nome_area"].unique():
        subset = fm_bairros[fm_bairros["nome_area"] == nome_area]
        bairro_names = sorted(subset["nome"].unique().tolist()) if "nome" in subset.columns else []

        pop = 0
        subpref = "—"
        bairro_features = []
        if not censo.empty and bairro_names:
            censo_match = censo[censo["nome"].isin(bairro_names)]
            pop_col = "Total_de_pessoas_2022"
            if pop_col in censo_match.columns:
                pop = int(censo_match[pop_col].sum())
            if "regiao_adm" in censo_match.columns and not censo_match["regiao_adm"].dropna().empty:
                subpref = censo_match["regiao_adm"].mode().iloc[0]

        # Area-weighted resident estimate inside the polygon (per-capita denominator).
        pop_ponderada = 0
        if bairro_names and pop_by_name and not bairros_m.empty:
            area_rows_m = polys_m[polys_m["nome_area"] == nome_area]
            if not area_rows_m.empty:
                area_geom_m = area_rows_m.geometry.union_all()
                bsub_m = bairros_m[bairros_m["nome"].isin(bairro_names)]
                pop_ponderada = int(round(weighted_population_for_area(area_geom_m, bsub_m, pop_by_name)))

        bairro_rows = bairros[bairros["nome"].isin(bairro_names)] if "nome" in bairros.columns else bairros.iloc[0:0]
        for _, row in bairro_rows.iterrows():
            bpop = 0
            if not censo.empty and "nome" in censo.columns:
                cm = censo[censo["nome"] == row["nome"]]
                if not cm.empty and "Total_de_pessoas_2022" in cm.columns:
                    bpop = int(cm["Total_de_pessoas_2022"].iloc[0])
            geom = row.geometry.simplify(0.0005, preserve_topology=True)
            bairro_features.append({
                "nome": row["nome"],
                "populacao": bpop,
                "geometry": geom.__geo_interface__,
            })

        context[nome_area] = {
            "bairros": bairro_names,
            "populacao_bairros_2022": pop,
            "populacao_ponderada": pop_ponderada,
            "subprefeitura": subpref,
            "bairro_features": bairro_features,
        }
    return context


# ───────────────────────────────────────────────────────────────────────────
# 2. MODUS OPERANDI EXTRACTION (das denúncias)
# ───────────────────────────────────────────────────────────────────────────

MODUS_PATTERNS = {
    "a_pe": [r"\ba p[eé]\b", r"\bcaminhando\b", r"\btranseunte"],
    "motocicleta": [r"\bmoto\b", r"\bmotocicleta", r"\bduas rodas"],
    "bicicleta": [r"\bbicicleta", r"\bciclista"],
    "armado": [r"\barma de fogo", r"\bpistola", r"\brevolver", r"\barmados?\b"],
    "arma_branca": [r"\bfaca\b", r"\bcanivete", r"\barma branca"],
    "em_grupo": [r"\bgrupo\b", r"\bdois indiv", r"\btr[ée]s indiv", r"\bquatro indiv", r"\bbando"],
    "menores": [r"\bmenores?\b", r"\badolescentes?\b"],
    "veiculo": [r"\bve[ií]culos?\b", r"\bcarros?\b"],
}


def extract_modus(text: str) -> list:
    if not isinstance(text, str):
        return []
    t = text.lower()
    found = []
    for k, patterns in MODUS_PATTERNS.items():
        for p in patterns:
            if re.search(p, t):
                found.append(k)
                break
    return found


def analyze_relatos(relatos: pd.Series) -> dict:
    all_modus = []
    for r in relatos.dropna():
        all_modus.extend(extract_modus(r))
    return dict(Counter(all_modus).most_common())


# ───────────────────────────────────────────────────────────────────────────
# 3. SPATIAL JOINS
# ───────────────────────────────────────────────────────────────────────────

def join_points_to_areas(df, polygons, lat_col="latitude", lng_col="longitude"):
    gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lng_col], df[lat_col]), crs=4326)
    return gpd.sjoin(gdf, polygons[["fid", "nome_area", "geometry"]], how="left", predicate="within")


# ───────────────────────────────────────────────────────────────────────────
# 4. METRICS PER AREA
# ───────────────────────────────────────────────────────────────────────────

def evolution_mensal(crimes_df):
    if crimes_df.empty or "data" not in crimes_df.columns:
        return []
    df = crimes_df.copy()
    df["data_parsed"] = pd.to_datetime(df["data"], format="%d/%m/%Y", errors="coerce")
    df["ym"] = df["data_parsed"].dt.to_period("M").astype(str)
    grouped = df.groupby("ym").size()
    # Pegar últimos 24 meses não nulos
    grouped = grouped[grouped.index != "NaT"].tail(24)
    return [{"mes": str(k), "total": int(v)} for k, v in grouped.items()]


def monthly_counts_full(crimes_df, max_months=60):
    """Recent monthly crime series, gap-filled with 0 over a continuous month range.

    Returns a pandas Series indexed by a continuous monthly PeriodIndex (most recent
    `max_months` ending at the last month with data). Unlike `evolution_mensal`
    (which keeps only the last 24 EXISTING months), this fills internal gaps with 0 —
    a month with no recorded crime is a real 0, and the Mann-Kendall test / seasonal
    decomposition need a regular series with no holes. Empty on empty/missing-`data`.

    WHY the window (not the whole history): the source occasionally carries a few very
    old records (1900s), so an unbounded series would gap-fill ~1200 mostly-zero months
    and make the trend read as "near-zero historic recording → modern recording" rather
    than a real change. 60 months = the platform's stated período (2020-2024) and gives
    5 seasonal periods. CAVEAT: trends are therefore measured over this fixed window;
    `n_meses` reflects it, not the raw record count.
    """
    if crimes_df.empty or "data" not in crimes_df.columns:
        return pd.Series(dtype="int64")
    dts = pd.to_datetime(crimes_df["data"], format="%d/%m/%Y", errors="coerce").dropna()
    if dts.empty:
        return pd.Series(dtype="int64")
    per = dts.dt.to_period("M")
    counts = per.value_counts().sort_index()
    last = counts.index.max()
    first = max(counts.index.min(), last - (max_months - 1))
    full_idx = pd.period_range(first, last, freq="M")
    return counts.reindex(full_idx, fill_value=0).astype("int64")


def _mann_kendall(values):
    """Non-parametric Mann-Kendall trend test (no extra deps beyond scipy.stats.norm).

    Returns {available, direction, significant, tau, p_value}. Guards a constant
    series (zero variance → no division) and is only meaningful for n>=4 (the caller
    enforces the length floor). `direction` ∈ crescente|decrescente|estavel;
    `significant` is p<0.05.

    CAVEAT: MK ignores autocorrelation, so p-values are optimistic on serially
    correlated crime counts; and run over 3 combined crime types it can mask
    divergent sub-trends. Enhancement: per-type tests + Hamed-Rao modified MK.
    """
    from scipy.stats import norm
    import numpy as np

    x = np.asarray(values, dtype=float)
    n = len(x)
    if n < 4:
        return {"available": False, "reason": "serie_curta", "direction": "estavel",
                "significant": False, "tau": None, "p_value": None}
    # S statistic
    s = 0
    for i in range(n - 1):
        s += np.sign(x[i + 1:] - x[i]).sum()
    s = float(s)
    # Variance with tie correction
    _, counts = np.unique(x, return_counts=True)
    tie_term = sum(c * (c - 1) * (2 * c + 5) for c in counts)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if var_s <= 0:
        return {"available": False, "reason": "serie_constante", "direction": "estavel",
                "significant": False, "tau": 0.0, "p_value": 1.0}
    if s > 0:
        z = (s - 1) / (var_s ** 0.5)
    elif s < 0:
        z = (s + 1) / (var_s ** 0.5)
    else:
        z = 0.0
    p_value = float(2 * (1 - norm.cdf(abs(z))))
    tau = float(s / (0.5 * n * (n - 1)))
    direction = "crescente" if s > 0 else "decrescente" if s < 0 else "estavel"
    return {"available": True, "direction": direction, "significant": bool(p_value < 0.05),
            "tau": round(tau, 4), "p_value": round(p_value, 4)}


def _poisson_ci_rows(display_rows):
    """Exact Poisson 95% CI per month, aligned 1:1 to the display rows (evolution_mensal).

    Uses chi-square quantiles (lo = chi2.ppf(.025, 2k)/2, hi = chi2.ppf(.975, 2(k+1))/2),
    NOT the normal approximation k±1.96√k, because monthly counts are small and some are
    0 (the normal approx gives negative / zero-width bands). lo = 0 when k = 0.

    CAVEAT: assumes counts are Poisson (mean = variance). Crime tends to be
    over-dispersed (clustering), so the TRUE band is wider than shown. Enhancement:
    negative-binomial CI.
    """
    from scipy.stats import chi2

    out = []
    for r in display_rows:
        k = int(r["total"])
        lo = 0.0 if k == 0 else float(chi2.ppf(0.025, 2 * k) / 2)
        hi = float(chi2.ppf(0.975, 2 * (k + 1)) / 2)
        out.append({"mes": r["mes"], "total": k, "ci_lo": round(lo, 1), "ci_hi": round(hi, 1)})
    return out


def evolution_mensal_stats(crimes_df):
    """Trend SIGNIFICANCE for the monthly series — so 11 vs 10 isn't read as a trend.

    Combines: Mann-Kendall (real trend vs noise), exact Poisson 95% bands per month
    (overlaid on the existing chart), and seasonal decomposition (statsmodels).
    Strictly additive: emitted as `evolucao_mensal_stats`; `evolucao_mensal` is left
    untouched. Returns {available: False} when there isn't enough data, so the
    frontend can fall back to the plain line with zero behavioral change.
    """
    full = monthly_counts_full(crimes_df)
    n = len(full)
    if n < 4:
        return {"available": False, "reason": "serie_curta", "n_meses": int(n)}

    result = {
        "available": True,
        "n_meses": int(n),
        "mann_kendall": _mann_kendall(full.values),
        "poisson_ci": _poisson_ci_rows(evolution_mensal(crimes_df)),
        "seasonal": {"available": False, "reason": "historico_insuficiente"},
    }

    # Seasonal decomposition needs >= 2 full periods (24 monthly obs) and no gaps.
    if n >= 24:
        try:
            from statsmodels.tsa.seasonal import seasonal_decompose
            dec = seasonal_decompose(full.values, model="additive", period=12, extrapolate_trend="freq")
            trend = pd.Series(dec.trend).dropna()
            seas = pd.Series(dec.seasonal, index=full.index)
            trend_delta_pct = None
            if len(trend) >= 2 and trend.iloc[0] != 0:
                trend_delta_pct = round(float((trend.iloc[-1] - trend.iloc[0]) / abs(trend.iloc[0]) * 100), 1)
            # Month-of-year (1-12) with the highest average seasonal component.
            seas_by_month = seas.groupby(full.index.month).mean()
            peak_month = int(seas_by_month.idxmax()) if not seas_by_month.empty else None
            result["seasonal"] = {
                "available": True,
                "trend_delta_pct": trend_delta_pct,
                "seasonal_peak_month": peak_month,
            }
        except Exception as exc:  # degrade gracefully — never break the pipeline
            result["seasonal"] = {"available": False, "reason": f"erro: {type(exc).__name__}"}

    return result


def get_top_trechos(crimes_df, n=10):
    if crimes_df.empty:
        return []
    grouped = (
        crimes_df.groupby("locf_norm")
        .agg(
            total=("locf_norm", "count"),
            lat=("latitude", "mean"),
            lng=("longitude", "mean"),
            roubo_transeunte=("desc_delito", lambda x: int((x == "Roubo a transeunte").sum())),
            roubo_celular=("desc_delito", lambda x: int((x == "Roubo de aparelho celular").sum())),
            roubo_coletivo=("desc_delito", lambda x: int((x == "Roubo em coletivo").sum())),
            pico_hora=("hora_num", lambda x: int(x.mode().iloc[0]) if not x.mode().empty else 0),
        )
        .sort_values("total", ascending=False)
        .head(n)
        .reset_index()
    )
    grouped = grouped[grouped["locf_norm"].str.len() > 3]
    return grouped.to_dict(orient="records")


def get_hora_distribution(crimes_df):
    if crimes_df.empty:
        return {}
    counts = crimes_df["hora_num"].dropna().astype(int).value_counts().sort_index()
    return {str(k): int(v) for k, v in counts.items()}


def get_dia_distribution(crimes_df):
    if crimes_df.empty:
        return {}
    return {str(k): int(v) for k, v in crimes_df["dia_semana"].dropna().value_counts().items()}


def get_pico_hora(hora_dist):
    if not hora_dist:
        return "N/D"
    return f"{max(hora_dist, key=hora_dist.get)}h"


def get_pct_noturno(crimes_df):
    if crimes_df.empty or "hora_num" not in crimes_df.columns:
        return 0.0
    h = crimes_df["hora_num"].dropna()
    if len(h) == 0:
        return 0.0
    return round((h.between(18, 23) | h.between(0, 5)).sum() / len(h) * 100, 1)


def sample_crime_points(crimes_df, max_points=600):
    if crimes_df.empty:
        return []
    # Sample balanceado por tipo
    parts = []
    for tipo, grp in crimes_df.groupby("desc_delito"):
        n = min(len(grp), max_points // 3)
        parts.append(grp.sample(n=n, random_state=42))
    if not parts:
        return []
    s = pd.concat(parts)
    return [
        {
            "lat": float(r.latitude),
            "lng": float(r.longitude),
            "tipo": str(r.desc_delito),
            "h": int(r.hora_num) if pd.notna(r.hora_num) else None,
            "data": str(r.data) if ("data" in s.columns and pd.notna(r.data)) else None,
        }
        for r in s.itertuples()
    ]


def get_relatos_sample(dd_df, n=8):
    if dd_df.empty:
        return []
    if "relato_redacted" not in dd_df.columns:
        return []
    sample = dd_df[dd_df["relato_redacted"].notna()].head(n)
    out = []
    for r in sample.itertuples():
        relato = str(r.relato_redacted)[:400]
        perfil = _build_perfil_suspeito(r)
        entry = {
            "tipo": str(getattr(r, "tipo", "")),
            "data": str(getattr(r, "data_denuncia", "")),
            "bairro": str(getattr(r, "bairro_logradouro", "")),
            "logradouro": str(getattr(r, "logradouro", "")),
            "relato": relato,
            "modus": extract_modus(relato),
        }
        if perfil:
            entry["perfil_suspeito"] = perfil
        out.append(entry)
    return out


def _parse_json_array(val) -> list:
    """Parse a JSON-serialized array string like '["M", "F"]' into a list."""
    s = str(val or "").strip()
    if not s or s in ("nan", "[]", ""):
        return []
    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
        return [str(parsed).strip()] if str(parsed).strip() else []
    except (json.JSONDecodeError, ValueError):
        return [s] if s else []


def _build_perfil_suspeito(row) -> str:
    parts = []
    sexo_vals = _parse_json_array(getattr(row, "envolvidos_sexo", ""))
    if sexo_vals:
        sexo_map = {"M": "Homem", "F": "Mulher"}
        parts.append(sexo_map.get(sexo_vals[0], sexo_vals[0]))
    idade_vals = _parse_json_array(getattr(row, "envolvidos_idade", ""))
    if idade_vals:
        try:
            parts.append(f"{int(float(idade_vals[0]))} anos")
        except (ValueError, TypeError):
            pass
    pele_vals = _parse_json_array(getattr(row, "envolvidos_pele", ""))
    if pele_vals:
        parts.append(f"pele {pele_vals[0].lower()}")
    return ", ".join(parts) if parts else ""


def get_disque_denuncia_pontos(dd_df, max_points=400):
    """Geolocated Disque Denúncia points carrying the NARRATIVE for a map layer.

    Unlike `get_relatos_sample` (a short text list with no coordinates), this emits
    map-ready points so the operator can SEE where each denúncia is and click it to
    read the modus operandi. The narrative — not the count — is the asset.

    Each point: lat/lng + tipo + data + bairro + logradouro + relato (≤300 chars)
    + modus (regex tags via extract_modus) + perfil_suspeito (omitted if empty).

    Rows with a non-null `relato_redacted` come first (markers should carry text),
    then the list is capped at `max_points` to keep the artifact lean.

    CAVEAT (documented): modus is regex keyword matching — it misses paraphrase,
    negation ("não estava armado") and spelling variants; a denúncia is an
    allegation, not a confirmed crime; and only geocoded rows appear here, so this
    count is < `stats.denuncias_total`. See eduardo/CHANGELOG.md "Limitações".
    """
    if dd_df.empty or "relato_redacted" not in dd_df.columns:
        return []
    # Prefer rows that actually carry a narrative, then cap.
    with_relato = dd_df[dd_df["relato_redacted"].notna()]
    without_relato = dd_df[dd_df["relato_redacted"].isna()]
    df = pd.concat([with_relato, without_relato]).head(max_points)
    out = []
    for r in df.itertuples():
        if pd.isna(getattr(r, "latitude", None)) or pd.isna(getattr(r, "longitude", None)):
            continue
        relato = str(getattr(r, "relato_redacted", "") or "")[:300]
        entry = {
            "lat": float(r.latitude),
            "lng": float(r.longitude),
            "tipo": str(getattr(r, "tipo", "")),
            "data": str(getattr(r, "data_denuncia", "")),
            "bairro": str(getattr(r, "bairro_logradouro", "")),
            "logradouro": str(getattr(r, "logradouro", "")),
            "relato": relato,
            "modus": extract_modus(relato),
        }
        perfil = _build_perfil_suspeito(r)
        if perfil:
            entry["perfil_suspeito"] = perfil
        out.append(entry)
    return out


def get_denuncias_por_bairro(dd_all_geo, bairros_gdf, area_geom):
    """Aggregate DD by bairro for the bairros intersecting an FM area."""
    if dd_all_geo.empty or bairros_gdf.empty:
        return []
    area_bairros = bairros_gdf[bairros_gdf.intersects(area_geom)]
    if area_bairros.empty:
        return []

    dd_gdf = gpd.GeoDataFrame(
        dd_all_geo,
        geometry=gpd.points_from_xy(dd_all_geo["longitude"], dd_all_geo["latitude"]),
        crs=4326,
    )
    dd_in_bairros = gpd.sjoin(dd_gdf, area_bairros[["nome", "geometry"]], how="inner", predicate="within")
    if dd_in_bairros.empty:
        return []

    result = []
    for bairro_name, grp in dd_in_bairros.groupby("nome"):
        tipos = {str(k): int(v) for k, v in grp["tipo"].value_counts().head(5).items()}
        result.append({"bairro": bairro_name, "total": int(len(grp)), "tipos": tipos})
    return sorted(result, key=lambda x: x["total"], reverse=True)


def get_fatores_por_orgao(fu_df):
    if fu_df.empty:
        return []
    out = []
    for orgao, grp in fu_df.groupby("orgao_responsavel"):
        tipos = grp["tipo_ocorrencia_descricao"].value_counts().head(5).to_dict()
        out.append({
            "orgao": orgao,
            "total": int(len(grp)),
            "tipos": [{"tipo": t, "count": int(c)} for t, c in tipos.items()],
        })
    return sorted(out, key=lambda x: x["total"], reverse=True)


def get_fatores_pontos(fu_df, max_points=300):
    if fu_df.empty:
        return []
    df = fu_df.head(max_points)
    return [
        {
            "lat": float(r.latitude),
            "lng": float(r.longitude),
            "tipo": str(getattr(r, "tipo_ocorrencia_descricao", "")),
            "orgao": str(getattr(r, "orgao_responsavel", "")),
            "logradouro": str(getattr(r, "logradouro", "")),
        }
        for r in df.itertuples()
    ]


def get_cameras_pontos(cam_df):
    if cam_df.empty:
        return []
    return [{"lat": float(r.lat), "lng": float(r.lng)} for r in cam_df.itertuples()]


def get_psr_points(psr_df, max_points=400):
    if psr_df.empty:
        return []
    df = psr_df.head(max_points)
    return [{"lat": float(r.lat), "lng": float(r.lng)} for r in df.itertuples()]


def get_chamados_points(ch_df, max_points=500):
    if ch_df.empty:
        return []
    valid = ch_df.dropna(subset=["latitude", "longitude"]).head(max_points)
    return [
        {
            "lat": float(r.latitude),
            "lng": float(r.longitude),
            "tipo": str(r.tipo),
            "orgao": str(r.nome_unidade_organizacional),
        }
        for r in valid.itertuples()
    ]


def chamados_evolucao_mensal(ch_df):
    if ch_df.empty or "data_particao" not in ch_df.columns:
        return []
    df = ch_df.copy()
    df["ym"] = df["data_particao"].dt.to_period("M").astype(str)
    grouped = df.groupby("ym").size()
    grouped = grouped[grouped.index != "NaT"].tail(60)
    return [{"mes": str(k), "total": int(v)} for k, v in grouped.items()]


ORGAO_NORMALIZE = {
    "Rio Luz": "RioLuz",
    "RIOLUZ": "RioLuz",
    "RIOLUZ - Companhia Municipal de Energia e Iluminação": "RioLuz",
    "Ouvidoria RIOLUZ": "RioLuz",
    "COMLURB": "COMLURB",
    "COMLURB - Companhia Municipal de Limpeza Urbana": "COMLURB",
    "Ouvidoria COMLURB": "COMLURB",
    "SECONSERVA": "SECONSERVA",
    "CGC - Coordenadoria Geral de Conservação": "SECONSERVA",
    "Ouvidoria SECONSERVA": "SECONSERVA",
    "SEOP": "SEOP",
    "GM-Rio": "GM-Rio",
    "GM-RIO - Guarda Municipal do Rio de Janeiro": "GM-Rio",
    "Ouvidoria GM-RIO": "GM-Rio",
    "CET-Rio": "CET-Rio",
    "CET-RIO": "CET-Rio",
    "SMAS": "SMAS",
    "SMTR": "SMTR",
}


def _norm_orgao(name: str) -> str:
    if name in ORGAO_NORMALIZE:
        return ORGAO_NORMALIZE[name]
    low = name.upper()
    if "RIOLUZ" in low:
        return "RioLuz"
    if "COMLURB" in low:
        return "COMLURB"
    if "GM-RIO" in low or "GUARDA" in low:
        return "GM-Rio"
    if "CET" in low:
        return "CET-Rio"
    if "SMAS" in low or "CAS" in low:
        return "SMAS"
    if "SMTR" in low or low.startswith("TR/"):
        return "SMTR"
    for gc in ("01A", "02A", "03A", "04A", "05A", "21A", "CGC", "SECONSERVA"):
        if gc in low:
            return "SECONSERVA"
    if "SEOP" in low:
        return "SEOP"
    return name


def build_validacao_cruzada(fu_area, ch_area):
    """Cross-references fatores (field observations) with chamados (citizen complaints)."""
    if fu_area.empty:
        return []
    orgao_col = "orgao_responsavel"
    fu_by_orgao = fu_area.groupby(orgao_col).size().to_dict()

    ch_by_orgao = {}
    ch_atd_by_orgao = {}
    ch_venc_by_orgao = {}
    if not ch_area.empty:
        for _, row in ch_area.iterrows():
            org = _norm_orgao(str(row.get("nome_unidade_organizacional", "")))
            ch_by_orgao[org] = ch_by_orgao.get(org, 0) + 1
            if str(row.get("tipo_situacao", "")).startswith("Atendido"):
                ch_atd_by_orgao[org] = ch_atd_by_orgao.get(org, 0) + 1
            if row.get("dentro_prazo") == "Vencido":
                ch_venc_by_orgao[org] = ch_venc_by_orgao.get(org, 0) + 1

    result = []
    for orgao_raw, fu_count in fu_by_orgao.items():
        orgao_norm = _norm_orgao(orgao_raw)
        ch_count = ch_by_orgao.get(orgao_norm, 0)
        ch_atd = ch_atd_by_orgao.get(orgao_norm, 0)
        ch_venc = ch_venc_by_orgao.get(orgao_norm, 0)
        result.append({
            "orgao": orgao_norm,
            "fatores_campo": int(fu_count),
            "chamados_1746": int(ch_count),
            "chamados_atendidos": int(ch_atd),
            "chamados_vencidos": int(ch_venc),
            "validado": ch_count > 0,
        })
    return sorted(result, key=lambda x: x["chamados_1746"], reverse=True)


def get_dominio_features(dominio_gdf, area_geom):
    """Retorna polígonos de facções que intersectam a área."""
    if dominio_gdf.empty:
        return []
    intersecting = dominio_gdf[dominio_gdf.intersects(area_geom)]
    out = []
    for r in intersecting.itertuples():
        try:
            out.append({
                "nome": str(r.nome_territorio),
                "faccao": str(r.dominio_orcrim),
                "geometry": r.geometry.__geo_interface__,
            })
        except Exception:
            continue
    return out


# ───────────────────────────────────────────────────────────────────────────
# 5. CAMERA GAP ANALYSIS
# ───────────────────────────────────────────────────────────────────────────

CAMERA_COVERAGE_RADIUS_M = 50          # camera effective coverage radius (metres)
CAMERA_CLUSTER_EPS_M = 60              # DBSCAN-style join radius for uncovered crimes (metres)
CAMERA_SNAP_TOL_M = 120               # max crime→street snap distance to trust network coverage
STREET_NETWORK_FILE = "street_network.routing.geojson.gz"

# Severity weights for prioritising blind spots. All occurrences are robbery; "em coletivo"
# is weighted slightly higher because a single event victimises many passengers. Tunable.
CRIME_SEVERITY_WEIGHTS = {
    "Roubo a transeunte": 1.0,
    "Roubo de aparelho celular": 1.0,
    "Roubo em coletivo": 1.3,
}
CRIME_SEVERITY_DEFAULT = 1.0

# Cache for the (expensive-to-build) street graph, keyed by resolved path.
_STREET_NETWORK_CACHE = {}


def load_street_network(path=STREET_NETWORK_FILE):
    """Load the street routing graph used for network-distance camera coverage.

    Returns a dict ``{"graph", "kdtree", "nodes"}`` where:
      * ``graph``  — undirected ``networkx.Graph``; nodes are rounded metric (EPSG:31983)
        ``(x, y)`` tuples; each edge weight is the segment length in metres.
      * ``kdtree`` — ``scipy.spatial.cKDTree`` over the node coordinates (nearest-node snap).
      * ``nodes``  — list of node tuples aligned with the kdtree index order.

    Returns ``None`` if the file is missing/empty so callers transparently fall back to the
    straight-line (Euclidean) test. The graph is built once per process (cached per path).
    The endpoints of the source GeoJSON are already snapped to identical coordinates by
    build_routing_graph.py, so rounding to 0.1 m and keying nodes by coordinate is safe.
    """
    p = Path(path)
    key = str(p.resolve()) if p.exists() else str(p)
    if key in _STREET_NETWORK_CACHE:
        return _STREET_NETWORK_CACHE[key]
    if not p.is_file():
        _STREET_NETWORK_CACHE[key] = None
        return None

    import gzip
    import networkx as nx
    from scipy.spatial import cKDTree

    # The artifact is gzipped GeoJSON (LineStrings, EPSG:4326); pyogrio can't read .gz
    # directly, so decompress + parse, build shapely geometries, then reproject to metres.
    opener = gzip.open if p.suffix == ".gz" else open
    with opener(p, "rt", encoding="utf-8") as fh:
        fc = json.load(fh)
    geoms = [shape(f["geometry"]) for f in fc.get("features", []) if f.get("geometry")]
    if not geoms:
        _STREET_NETWORK_CACHE[key] = None
        return None
    gdf = gpd.GeoDataFrame(geometry=geoms, crs=4326).to_crs(METRIC_CRS)
    graph = nx.Graph()
    for geom in gdf.geometry:
        if geom is None or geom.is_empty:
            continue
        lines = geom.geoms if geom.geom_type == "MultiLineString" else [geom]
        for ln in lines:
            coords = [(round(x, 1), round(y, 1)) for x, y in ln.coords]
            for a, b in zip(coords[:-1], coords[1:]):
                if a == b:
                    continue
                d = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
                if graph.has_edge(a, b):
                    if d < graph[a][b]["weight"]:
                        graph[a][b]["weight"] = d
                else:
                    graph.add_edge(a, b, weight=d)
    if graph.number_of_nodes() == 0:
        _STREET_NETWORK_CACHE[key] = None
        return None
    nodes = list(graph.nodes())
    net = {"graph": graph, "kdtree": cKDTree(nodes), "nodes": nodes}
    _STREET_NETWORK_CACHE[key] = net
    return net


def _snap_nodes(network, xs, ys):
    """Snap arrays of metric x/y coordinates to nearest graph nodes.

    Returns ``(node_keys, snap_dists)`` where snap_dists are straight-line metres from each
    input point to the node it snapped to (used to decide whether to trust network distance).
    """
    pts = np.column_stack([np.asarray(xs, dtype=float), np.asarray(ys, dtype=float)])
    dists, idx = network["kdtree"].query(pts)
    idx = np.atleast_1d(idx)
    return [network["nodes"][i] for i in idx], np.atleast_1d(dists)


def _cluster_points_metric(xs, ys, eps):
    """Cluster 2-D metric points: points within ``eps`` metres of each other join a cluster.

    DBSCAN-with-min_samples=1 semantics via ``cKDTree.query_pairs`` + union-find (no sklearn
    dependency; same pattern build_routing_graph.py uses to snap endpoints). Replaces the old
    10 m grid-rounding, which split adjacent crimes across cell boundaries. Returns one
    contiguous integer label per input point.
    """
    from scipy.spatial import cKDTree
    n = len(xs)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    if n > 1:
        tree = cKDTree(np.column_stack([xs, ys]))
        for i, j in tree.query_pairs(eps):
            ri, rj = find(i), find(j)
            if ri != rj:
                parent[ri] = rj

    roots, labels = {}, np.empty(n, dtype=int)
    for i in range(n):
        r = find(i)
        labels[i] = roots.setdefault(r, len(roots))
    return labels


def compute_camera_gaps(crimes_df, cam_df, max_gaps=15, network=None,
                        coverage_radius_m=CAMERA_COVERAGE_RADIUS_M):
    """Detect camera blind spots: clusters of crimes not covered by any camera.

    Coverage model:
      * ``network`` provided (from :func:`load_street_network`) → a crime is "covered" only
        when a camera lies within ``coverage_radius_m`` *along the street network*, so a
        camera 50 m away behind a block no longer counts. Crimes that cannot be reliably
        snapped to the network (snap > ``CAMERA_SNAP_TOL_M``) or whose node is unreachable
        fall back to the straight-line test for that crime.
      * ``network`` is ``None`` → original straight-line (Euclidean) buffer test, unchanged.
        This keeps the function usable without the graph and keeps the unit tests valid.

    Uncovered crimes are grouped with DBSCAN-style spatial clustering (cKDTree + union-find,
    radius ``CAMERA_CLUSTER_EPS_M``) rather than grid-rounding. Each gap gets a
    ``priority_score`` = severity-weighted uncovered-crime count × distance factor, and gaps
    are ranked by it. The recommendation (``instalar``/``remanejar``) uses network distance
    when available.

    Additive output (vs the previous version): every gap also carries ``network_camera_m``
    and ``priority_score``; the result carries ``coverage_method`` ("network"|"euclidean").
    All previously emitted keys are preserved with the same meaning.
    """
    method = "network" if network is not None else "euclidean"
    base = {"n_cameras": 0, "coverage_radius_m": coverage_radius_m,
            "cameras": [], "gaps": [], "coverage_method": method}
    if cam_df is None or cam_df.empty:
        return base

    cam_points = [{"lat": float(r.lat), "lng": float(r.lng)} for r in cam_df.itertuples()]
    base = {**base, "n_cameras": len(cam_points), "cameras": cam_points}
    if crimes_df is None or crimes_df.empty:
        return base

    cam_gdf = gpd.GeoDataFrame(
        cam_df, geometry=gpd.points_from_xy(cam_df["lng"], cam_df["lat"]), crs=4326
    ).to_crs(METRIC_CRS)

    valid = crimes_df[crimes_df["latitude"].notna() & crimes_df["longitude"].notna()]
    if valid.empty:
        return base
    crime_gdf = gpd.GeoDataFrame(
        valid, geometry=gpd.points_from_xy(valid["longitude"], valid["latitude"]), crs=4326
    ).to_crs(METRIC_CRS)
    cx = crime_gdf.geometry.x.to_numpy()
    cy = crime_gdf.geometry.y.to_numpy()

    # Straight-line coverage (always computed; used directly in euclidean mode and as the
    # per-crime fallback when a crime cannot be reliably snapped to the network).
    coverage_union = cam_gdf.buffer(coverage_radius_m).union_all()
    euclid_covered = crime_gdf.geometry.within(coverage_union).to_numpy()

    dist_map = None  # node -> network distance to nearest camera (computed once per area)
    if network is not None:
        cam_nodes, _ = _snap_nodes(network, cam_gdf.geometry.x.to_numpy(), cam_gdf.geometry.y.to_numpy())
        cam_nodes = [n for n in set(cam_nodes) if n in network["graph"]]
        if cam_nodes:
            import networkx as nx
            dist_map = nx.multi_source_dijkstra_path_length(network["graph"], cam_nodes)
            crime_nodes, snap_d = _snap_nodes(network, cx, cy)
            net_cov = np.array([
                dist_map.get(crime_nodes[i], float("inf")) <= coverage_radius_m
                for i in range(len(crime_nodes))
            ])
            reliable = snap_d <= CAMERA_SNAP_TOL_M
            covered = np.where(reliable, net_cov, euclid_covered)
        else:
            method = "euclidean"  # cameras could not be placed on the graph
            covered = euclid_covered
    else:
        covered = euclid_covered

    uncovered = crime_gdf[~covered]
    if uncovered.empty:
        return {**base, "coverage_method": method}

    ux = uncovered.geometry.x.to_numpy()
    uy = uncovered.geometry.y.to_numpy()
    labels = _cluster_points_metric(ux, uy, eps=CAMERA_CLUSTER_EPS_M)
    if "desc_delito" in uncovered.columns:
        sev = uncovered["desc_delito"].map(CRIME_SEVERITY_WEIGHTS).fillna(CRIME_SEVERITY_DEFAULT).to_numpy()
    else:
        sev = np.ones(len(uncovered))

    clusters = []
    for lbl in np.unique(labels):
        mask = labels == lbl
        clusters.append({
            "count": int(mask.sum()),
            "sev": float(sev[mask].sum()),
            "x": float(ux[mask].mean()),
            "y": float(uy[mask].mean()),
        })

    # Distance to nearest camera per cluster centroid: network distance when available
    # (and reachable), else straight-line. The distance factor saturates at 4×radius (200 m).
    for c in clusters:
        euclid_d = float(cam_gdf.distance(Point(c["x"], c["y"])).min())
        net_d = None
        if dist_map is not None:
            (cnode,), (csnap,) = _snap_nodes(network, [c["x"]], [c["y"]])
            if csnap <= CAMERA_SNAP_TOL_M:
                d = dist_map.get(cnode)
                if d is not None and d != float("inf"):
                    net_d = float(d)
        chosen_d = net_d if net_d is not None else euclid_d
        c["euclid_d"] = euclid_d
        c["net_d"] = net_d
        c["chosen_d"] = chosen_d
        dist_factor = min(chosen_d / (4 * coverage_radius_m), 1.0)
        c["priority"] = round(c["sev"] * (1.0 + dist_factor), 2)

    clusters.sort(key=lambda c: c["priority"], reverse=True)
    clusters = clusters[:max_gaps]

    gaps = []
    for i, c in enumerate(clusters, 1):
        pt_wgs = gpd.GeoSeries([Point(c["x"], c["y"])], crs=METRIC_CRS).to_crs(4326).iloc[0]
        chosen_d = c["chosen_d"]
        recommendation = "remanejar" if chosen_d <= 2 * coverage_radius_m else "instalar"
        dist_label = "rede viária" if c["net_d"] is not None else "linha reta"
        gaps.append({
            "rank": i,
            "lat": round(pt_wgs.y, 6),
            "lng": round(pt_wgs.x, 6),
            "uncovered_crimes": c["count"],
            "nearest_camera_m": round(c["euclid_d"], 1),
            "network_camera_m": round(c["net_d"], 1) if c["net_d"] is not None else None,
            "priority_score": c["priority"],
            "recommendation": recommendation,
            "justification": (
                f"{c['count']} ocorrências sem cobertura; "
                f"câmera mais próxima a {chosen_d:.0f} m ({dist_label})"
            ),
        })

    return {
        "n_cameras": len(cam_points),
        "coverage_radius_m": coverage_radius_m,
        "cameras": cam_points,
        "gaps": gaps,
        "coverage_method": method,
    }


# ───────────────────────────────────────────────────────────────────────────
# 5b. BINGO / COINCIDENCE SCORING
# ───────────────────────────────────────────────────────────────────────────


# A crime trecho "coincides" with an urban factor / denúncia when that record lies within
# this many metres of the trecho's crime points. Replaces the previous street-name substring
# match, which had no distance check and produced both false positives (unrelated streets
# sharing a token, e.g. "rua da paz" ⊂ "praça da paz") and false negatives (abbreviation
# differences, e.g. "Av. Brasil" vs "Avenida Brasil"). See docs/DATA_LOGIC_FIXES.md.
BINGO_PROXIMITY_M = 100


def _points_metric(df, lat_col="latitude", lng_col="longitude"):
    """Split a DataFrame into (metric GeoDataFrame of geocoded rows, DataFrame of coordless rows).

    Rows with missing lat/lon are returned separately so the caller can still match them by
    exact street name instead of silently discarding their signal (Disque Denúncia is only
    ~60% geocoded). The geocoded rows are reprojected to METRIC_CRS so distances are in metres.
    """
    if df is None or df.empty or lat_col not in df.columns or lng_col not in df.columns:
        return None, df
    has_coord = df[lat_col].notna() & df[lng_col].notna()
    valid, coordless = df[has_coord], df[~has_coord]
    if valid.empty:
        return None, coordless
    gdf = gpd.GeoDataFrame(
        valid.copy(),
        geometry=gpd.points_from_xy(valid[lng_col], valid[lat_col]),
        crs=4326,
    ).to_crs(METRIC_CRS)
    return gdf, coordless


def _coordless_norm_names(coordless_df, col="logradouro"):
    """Exact normalized street names of coordless rows (for the no-coordinate fallback)."""
    if coordless_df is None or coordless_df.empty or col not in coordless_df.columns:
        return set()
    return {_normalize_street(v) for v in coordless_df[col].dropna() if _normalize_street(v)}


def compute_bingo(top_trechos, fu_area, dd_area, oc_area):
    """Detect coincidence of crime + urban factors + crime denúncias on each top trecho.

    Each trecho gets three boolean layers:
      * crime   — the trecho exists because it has crimes (total > 0).
      * fatores — a field-observed urban factor lies within ``BINGO_PROXIMITY_M`` of the
                  trecho's crime points (spatial test), OR — for factor records lacking
                  coordinates — its normalized street name exactly equals the trecho's.
      * sinais  — the same proximity / exact-name test against Disque Denúncia records.

    This replaces the old substring name match with a real spatial join (with an exact-name
    fallback only for coordless records). Output keys are unchanged: each trecho gets
    ``bingo_count`` (0–3) and ``bingo_layers``; the function returns
    ``(top_trechos, n_bingo, n_triple)`` where n_bingo counts trechos with ≥2 layers and
    n_triple those with all 3. See docs/DATA_LOGIC_FIXES.md.
    """
    if not top_trechos:
        return top_trechos, 0, 0

    # Build metric point layers once; keep coordless rows for the exact-name fallback.
    fu_pts, fu_coordless = _points_metric(fu_area)
    dd_pts, dd_coordless = _points_metric(dd_area)
    oc_pts, _ = _points_metric(oc_area)
    fu_names = _coordless_norm_names(fu_coordless)
    dd_names = _coordless_norm_names(dd_coordless)
    if oc_pts is not None and "locf_norm" in oc_pts.columns:
        oc_pts = oc_pts.assign(_locf_n=oc_pts["locf_norm"].map(_normalize_street))

    def _near(pts, anchor):
        return bool(
            anchor is not None and pts is not None and not pts.empty
            and pts.geometry.intersects(anchor).any()
        )

    n_bingo = 0
    n_triple = 0
    for t in top_trechos:
        name = _normalize_street(t.get("locf_norm", ""))
        has_crime = t.get("total", 0) > 0

        # Anchor = buffer around this trecho's own crime points (preferred), else a buffer
        # around its aggregated centroid (lat/lng). None when no spatial anchor exists.
        anchor = None
        if oc_pts is not None and "_locf_n" in oc_pts.columns and name:
            tp = oc_pts[oc_pts["_locf_n"] == name]
            if not tp.empty:
                anchor = tp.geometry.buffer(BINGO_PROXIMITY_M).union_all()
        if anchor is None and t.get("lat") is not None and t.get("lng") is not None:
            try:
                centroid = gpd.GeoSeries(
                    [Point(float(t["lng"]), float(t["lat"]))], crs=4326
                ).to_crs(METRIC_CRS).iloc[0]
                anchor = centroid.buffer(BINGO_PROXIMITY_M)
            except (TypeError, ValueError):
                anchor = None

        has_factor = _near(fu_pts, anchor) or (bool(name) and name in fu_names)
        has_signal = _near(dd_pts, anchor) or (bool(name) and name in dd_names)

        layers = sum([has_crime, has_factor, has_signal])
        t["bingo_count"] = layers
        t["bingo_layers"] = {
            "crime": has_crime,
            "fatores": has_factor,
            "sinais": has_signal,
        }
        if layers >= 2:
            n_bingo += 1
        if layers >= 3:
            n_triple += 1

    return top_trechos, n_bingo, n_triple


# ───────────────────────────────────────────────────────────────────────────
# 6. SCORING
# ───────────────────────────────────────────────────────────────────────────

def normalize_scores(areas_raw):
    max_crime = max(a["_raw"]["crime"] for a in areas_raw) or 1
    max_fatores = max(a["_raw"]["fatores"] for a in areas_raw) or 1
    max_denuncias = max(a["_raw"]["denuncias"] for a in areas_raw) or 1

    for a in areas_raw:
        raw = a["_raw"]
        crime_norm = (raw["crime"] / max_crime) * 40
        peak_norm = raw["peak_ratio"] * 15
        urban_norm = (raw["fatores"] / max_fatores) * 25
        denounce_norm = (raw["denuncias"] / max_denuncias) * 15
        relint_bonus = 5 if raw["has_relint"] else 0
        total = round(crime_norm + peak_norm + urban_norm + denounce_norm + relint_bonus, 1)
        a["score"] = {
            "total": total,
            "breakdown": {
                "mancha_criminal": round(crime_norm, 1),
                "pico_horario": round(peak_norm, 1),
                "fatores_urbanos": round(urban_norm, 1),
                "dinamica": round(denounce_norm, 1),
                "relint_bonus": relint_bonus,
            },
        }
        del a["_raw"]
    return areas_raw


# ───────────────────────────────────────────────────────────────────────────
# 6. MAIN PIPELINE
# ───────────────────────────────────────────────────────────────────────────

def build_areas_data(data_dir: Path) -> dict:
    print("Carregando fontes...")
    oc = load_ocorrencias(data_dir)
    dd_geo, dd_no_geo = load_disk_denuncia(data_dir)
    fu = load_fatores_urbanos(data_dir)
    cam = load_cameras(data_dir)
    polys = load_polygons(data_dir)
    relints = load_relints(data_dir)
    dominio = load_dominio(data_dir)
    psr = load_psr(data_dir)

    # External enrichment sources (all optional — return empty if missing)
    bairros = load_bairros(data_dir)
    censo = load_censo(data_dir)
    chamados_1746 = load_chamados_1746(data_dir)
    logradouros = load_logradouros(data_dir)
    dd_drogas = load_dd_drogas(data_dir)
    dd_all_geo = load_dd_all_geo(data_dir)

    print(f"  Ocorrências: {len(oc):,}")
    print(f"  Disque Denúncia geo: {len(dd_geo):,} | sem geo: {len(dd_no_geo):,}")
    print(f"  DD drogas (SMAS signal): {len(dd_drogas):,}")
    print(f"  Fatores: {len(fu):,}")
    print(f"  Câmeras: {len(cam):,}")
    print(f"  Polígonos FM: {len(polys)}")
    print(f"  RELINTs: {len(relints)}")
    print(f"  Domínio territorial: {len(dominio):,}")
    print(f"  Censo PSR: {len(psr):,}")
    print(f"  Bairros: {len(bairros)} | Censo 2022: {len(censo)} | 1746: {len(chamados_1746):,}")
    print(f"  Logradouros: {len(logradouros):,}")

    print("\nFazendo joins espaciais...")
    oc_joined = join_points_to_areas(oc, polys)
    dd_joined = join_points_to_areas(dd_geo, polys)
    fu_joined = join_points_to_areas(fu, polys)
    psr_joined = join_points_to_areas(psr, polys, lat_col="lat", lng_col="lng")

    dd_drogas_joined = pd.DataFrame()
    if not dd_drogas.empty:
        dd_drogas_joined = join_points_to_areas(dd_drogas, polys)

    chamados_joined = pd.DataFrame()
    has_1746 = not chamados_1746.empty
    if has_1746 and "latitude" in chamados_1746.columns:
        valid = chamados_1746.dropna(subset=["latitude", "longitude"])
        valid = valid[valid["latitude"].between(-23.2, -22.7) & valid["longitude"].between(-43.9, -43.0)]
        if not valid.empty:
            chamados_joined = join_points_to_areas(valid, polys)

    bairro_context = build_bairro_context(polys, bairros, censo)
    has_censo = bool(bairro_context and any(v["populacao_bairros_2022"] > 0 for v in bairro_context.values()))

    # Street routing graph for network-distance camera coverage (None -> Euclidean fallback).
    street_network = load_street_network()
    if street_network is None:
        print("  [aviso] grafo de ruas ausente — cobertura de câmeras usará distância em linha reta")

    # Pre-build bairros GeoDataFrame for DD bairro aggregation
    bairros_gdf = bairros if not bairros.empty else gpd.GeoDataFrame()

    areas_raw = []
    for _, poly_row in polys.iterrows():
        nome = poly_row["nome_area"]
        fid = int(poly_row["fid"])
        geom = poly_row["geometry"]

        oc_area = oc_joined[oc_joined["nome_area"] == nome]
        dd_area = dd_joined[dd_joined["nome_area"] == nome]
        fu_area = fu_joined[fu_joined["nome_area"] == nome]
        psr_area = psr_joined[psr_joined["nome_area"] == nome]
        cam_area = cam[cam["nome_area_fm"] == nome] if "nome_area_fm" in cam.columns else pd.DataFrame()

        # Distribuições
        hora_dist = get_hora_distribution(oc_area)
        dia_dist = get_dia_distribution(oc_area)
        peak_ratio = 0.0
        if hora_dist:
            top3 = sorted(hora_dist.values(), reverse=True)[:3]
            peak_ratio = sum(top3) / sum(hora_dist.values())

        # Modus operandi extraído das denúncias
        modus_dist = analyze_relatos(dd_area["relato_redacted"] if "relato_redacted" in dd_area.columns else pd.Series([]))

        # AISP / RISP / DP da área (do dado mais frequente nas ocorrências)
        aisp = int(oc_area["aisp"].mode().iloc[0]) if not oc_area.empty and not oc_area["aisp"].mode().empty else None
        risp = int(oc_area["risp"].mode().iloc[0]) if not oc_area.empty and not oc_area["risp"].mode().empty else None

        # Domínio territorial intersectando esta área
        dominio_feats = get_dominio_features(dominio, geom)
        faccoes_count = Counter(d["faccao"] for d in dominio_feats)

        # Tipos de crime
        crime_por_tipo = {}
        if not oc_area.empty:
            crime_por_tipo = {str(k): int(v) for k, v in oc_area["desc_delito"].value_counts().items()}

        # Pontos sampleados pro mapa
        crime_points = sample_crime_points(oc_area)
        fatores_points = get_fatores_pontos(fu_area)
        cameras_points = get_cameras_pontos(cam_area)
        psr_points = get_psr_points(psr_area)
        disque_denuncia_points = get_disque_denuncia_pontos(dd_area)

        # Top trechos + bingo coincidence scoring
        top_trechos = get_top_trechos(oc_area)
        top_trechos, n_bingo, n_triple_bingo = compute_bingo(
            top_trechos, fu_area, dd_area, oc_area)
        _bairro_names = bairro_context.get(nome, {}).get("bairros", [])
        top_trechos = match_trechos_to_lines(top_trechos, logradouros, _bairro_names, clip_polygon=geom)

        # Camera gap analysis
        camera_gaps = compute_camera_gaps(oc_area, cam_area, network=street_network)

        # Fatores por órgão
        fatores_orgao = get_fatores_por_orgao(fu_area)

        # Relatos sample
        relatos = get_relatos_sample(dd_area)

        # Evolução mensal (série bruta + significância estatística)
        evolucao = evolution_mensal(oc_area)
        evolucao_stats = evolution_mensal_stats(oc_area)

        # --- Enrichment: bairro context, population, per-capita ---
        # `pop` is the whole-bairro residential sum (human-readable context, unchanged).
        # `pop_ponderada` is the areal-interpolated estimate of residents *inside* the
        # polygon and is the correct denominator for the per-capita rate (see
        # weighted_population_for_area / DATA_LOGIC_FIXES.md). Falling back to None when
        # the weighted denominator is unavailable keeps the field null-safe for the UI.
        ctx = bairro_context.get(nome, {})
        pop = ctx.get("populacao_bairros_2022", 0)
        pop_ponderada = ctx.get("populacao_ponderada", 0)
        crimes_total = int(len(oc_area))
        crimes_per_1000 = round((crimes_total / pop_ponderada) * 1000, 1) if pop_ponderada > 0 else None

        # --- Enrichment: DD drogas (SMAS factor signal) ---
        drogas_area = dd_drogas_joined[dd_drogas_joined["nome_area"] == nome] if not dd_drogas_joined.empty else pd.DataFrame()
        denuncias_drogas = int(len(drogas_area))

        # --- Enrichment: bairro-level DD aggregation ---
        dd_bairro_agg = get_denuncias_por_bairro(dd_all_geo, bairros_gdf, geom)

        # --- Enrichment: 1746 chamados ---
        chamados_area_data = None
        ch_area_points = []
        if not chamados_joined.empty:
            ch_area = chamados_joined[chamados_joined["nome_area"] == nome]
            if not ch_area.empty:
                ch_by_tipo = []
                for (tipo, orgao), grp in ch_area.groupby(["tipo", "nome_unidade_organizacional"]):
                    atendidos = int(grp["tipo_situacao"].str.contains("Atendido", case=False, na=False).sum()) if "tipo_situacao" in grp.columns else 0
                    vencidos = int((grp.get("dentro_prazo", pd.Series()) == "Vencido").sum())
                    ch_by_tipo.append({"tipo": str(tipo), "orgao": str(orgao), "total": int(len(grp)), "atendidos": atendidos, "vencidos": vencidos})
                ch_by_tipo.sort(key=lambda x: x["total"], reverse=True)
                ch_evol = chamados_evolucao_mensal(ch_area)
                ch_area_points = get_chamados_points(ch_area)
                chamados_area_data = {
                    "total": int(len(ch_area)),
                    "com_coordenadas": int(ch_area["latitude"].notna().sum()),
                    "pct_atendido": round(100 * (ch_area["tipo_situacao"] == "Atendido").mean(), 1) if "tipo_situacao" in ch_area.columns else None,
                    "pct_vencido": round(100 * (ch_area.get("dentro_prazo", pd.Series()) == "Vencido").mean(), 1),
                    "por_tipo": ch_by_tipo[:20],
                    "evolucao_mensal": ch_evol,
                }

        # --- Enrichment: cross-reference fatores × chamados ---
        ch_area_for_val = chamados_joined[chamados_joined["nome_area"] == nome] if not chamados_joined.empty else pd.DataFrame()
        validacao = build_validacao_cruzada(fu_area, ch_area_for_val)

        identificacao = {
            "aisp": aisp,
            "risp": risp,
            "base_fm": "Litorânea" if "Botafogo" in nome or "Copacabana" in nome else "Central",
            "subprefeitura": ctx.get("subprefeitura", "—"),
            "dominio_principal": faccoes_count.most_common(1)[0][0] if faccoes_count else "—",
        }
        if ctx.get("bairros"):
            identificacao["bairros"] = ctx["bairros"]
        if pop > 0:
            identificacao["populacao_bairros_2022"] = pop

        stats = {
            "crimes_total": crimes_total,
            "crimes_por_tipo": crime_por_tipo,
            "pico_horario": get_pico_hora(hora_dist),
            "pct_noturno": get_pct_noturno(oc_area),
            "hora_distribution": hora_dist,
            "dia_distribution": dia_dist,
            "denuncias_total": int(len(dd_area)),
            "fatores_urbanos_total": int(len(fu_area)),
            "cameras_total": int(len(cam_area)),
            "psr_total": int(len(psr_area)),
            "modus_operandi": modus_dist,
        }
        if pop > 0:
            # Whole-bairro residential population — "Pop. Residente (Censo 2022)" (unchanged).
            stats["populacao_estimada"] = pop
        if pop_ponderada > 0:
            # Area-weighted residents inside the polygon = denominator of crimes_per_1000_hab.
            # Exposed so the rate is auditable (rate = crimes_total / populacao_ponderada * 1000).
            stats["populacao_ponderada"] = pop_ponderada
            stats["crimes_per_1000_hab"] = crimes_per_1000
        if denuncias_drogas > 0:
            stats["denuncias_drogas"] = denuncias_drogas

        area_obj = {
            "id": fid,
            "nome": nome,
            "geometry": geom.__geo_interface__,
            "identificacao": identificacao,
            "stats": stats,
            "top_trechos": top_trechos,
            "n_bingo_trechos": n_bingo,
            "n_triple_bingo": n_triple_bingo,
            "camera_gaps": camera_gaps,
            "fatores_por_orgao": fatores_orgao,
            "relatos_sample": relatos,
            "relint_disponivel": nome in relints,
            "relint": relints.get(nome, {"full_text": "", "sections": []}),
            "dominio_territorial": dominio_feats,
            "evolucao_mensal": evolucao,
            "map_layers": {
                "crime_points": crime_points,
                "fatores_points": fatores_points,
                "cameras_points": cameras_points,
                "psr_points": psr_points,
                "chamados_points": ch_area_points,
                "disque_denuncia_points": disque_denuncia_points,
            },
            "_raw": {
                "crime": len(oc_area),
                "peak_ratio": peak_ratio,
                "fatores": len(fu_area),
                "denuncias": len(dd_area),
                "has_relint": nome in relints,
            },
        }
        if dd_bairro_agg:
            area_obj["denuncias_por_bairro"] = dd_bairro_agg
        if chamados_area_data:
            area_obj["chamados_1746"] = chamados_area_data
        if validacao:
            area_obj["validacao_cruzada"] = validacao
        if evolucao_stats.get("available"):
            area_obj["evolucao_mensal_stats"] = evolucao_stats

        bairro_feats = ctx.get("bairro_features", [])
        if bairro_feats:
            dd_bairro_map = {b["bairro"]: b for b in dd_bairro_agg} if dd_bairro_agg else {}
            bairro_to_id = {}
            if not bairros.empty and "codbnum" in bairros.columns:
                bairro_to_id = dict(zip(bairros["nome"], bairros["codbnum"].astype(int)))
            ch_by_bairro_id = {}
            if not chamados_1746.empty and "id_bairro" in chamados_1746.columns:
                ch_by_bairro_id = chamados_1746.groupby(chamados_1746["id_bairro"].astype(int)).size().to_dict()
            for bf in bairro_feats:
                dd_info = dd_bairro_map.get(bf["nome"], {})
                bf["denuncias"] = dd_info.get("total", 0)
                bid = bairro_to_id.get(bf["nome"], -1)
                bf["chamados_1746"] = int(ch_by_bairro_id.get(bid, 0))
            area_obj["bairros_entorno"] = bairro_feats

        areas_raw.append(area_obj)

    areas_raw = normalize_scores(areas_raw)
    areas_raw.sort(key=lambda x: x["score"]["total"], reverse=True)

    print("\nScores por área:")
    for a in areas_raw:
        print(f"  [{a['score']['total']:5.1f}] {a['nome'][:60]}")

    pop_total = sum(v["populacao_bairros_2022"] for v in bairro_context.values()) if bairro_context else 0

    meta = {
        "total_ocorrencias": int(len(oc)),
        "total_ocorrencias_em_areas": int(len(oc_joined[oc_joined["nome_area"].notna()])),
        "total_denuncias": int(len(dd_geo) + len(dd_no_geo)),
        "total_fatores_urbanos": int(len(fu)),
        "total_cameras": int(len(cam)),
        "total_areas": len(areas_raw),
        "total_psr": int(len(psr)),
        "periodo_criminal": "2020-2024",
        "periodo_fatores": "2026",
        "periodo_denuncias": "2025",
        "has_censo": has_censo,
        "has_1746": has_1746,
        "total_chamados_1746": int(len(chamados_1746)) if has_1746 else 0,
        "periodo_1746": "2020-2024" if has_1746 else None,
    }
    if pop_total > 0:
        meta["populacao_total_bairros_fm"] = pop_total

    return {"areas": areas_raw, "meta": meta}


# ───────────────────────────────────────────────────────────────────────────
# 7. RIO CONTEXT (ADDITIVE) — city-wide layers + adjacency rings
# ───────────────────────────────────────────────────────────────────────────
# This block produces a SEPARATE artifact (rio_context.json). It never touches
# areas_data.json. The frontend loads it lazily, only when the operator switches
# to "Rio inteiro" mode or enables an entorno layer — so if this file is absent
# the app behaves exactly as before.

def classify_displacement(area_year_counts: dict, ring_year_counts: dict) -> dict:
    """Classify whether an FM area's crime drop is genuine or pushed to its ring.

    Desafio 2: an intensive operation inside a polygon can push occurrences to the
    adjacent streets. Comparing the last two full years INSIDE the area vs INSIDE its
    500m ring tells genuine reduction from displacement.

    Inputs are {year:int -> count:int} dicts. Compares the two most recent years the
    AREA has data for (ring defaults to 0 for those years). Returns:
      label ∈ deslocamento_provavel | reducao_genuina | intensificacao | inconclusivo
      confidence ∈ baixa | media | alta   (heuristic, see below)
      area_yoy_pct, ring_yoy_pct          (None when prior year is 0 → no baseline)
      anos_comparados = [prev, curr]

    Decision (±10% dead-band so small wiggles aren't called a trend):
      area ↓ & ring ↑  → deslocamento_provavel
      area ↓ & ring ↓  → reducao_genuina
      area ↑ & ring ↑  → intensificacao
      otherwise         → inconclusivo

    CAVEATS (documented): ocorrências only (DD is single-year, can't drive YoY); the
    label is a HYPOTHESIS — it can reflect a reporting/recording artifact, the ring
    overlapping a neighbouring hotspot, or police-effort relocation rather than true
    criminal displacement. Ring counts are RAW, not normalized by area (a bigger ring
    naturally holds more crime). Enhancements: significance test on the difference,
    longer baseline, per-type displacement, normalize by km².
    """
    def _last_two(d):
        yrs = sorted(int(y) for y in d.keys())
        return yrs[-2:] if len(yrs) >= 2 else yrs

    years = _last_two(area_year_counts)
    if len(years) < 2:
        return {"label": "inconclusivo", "confidence": "baixa",
                "area_yoy_pct": None, "ring_yoy_pct": None, "anos_comparados": years}

    y_prev, y_curr = years
    a_prev = int(area_year_counts.get(y_prev, area_year_counts.get(str(y_prev), 0)) or 0)
    a_curr = int(area_year_counts.get(y_curr, area_year_counts.get(str(y_curr), 0)) or 0)
    r_prev = int(ring_year_counts.get(y_prev, ring_year_counts.get(str(y_prev), 0)) or 0)
    r_curr = int(ring_year_counts.get(y_curr, ring_year_counts.get(str(y_curr), 0)) or 0)

    area_yoy = round((a_curr - a_prev) / a_prev * 100, 1) if a_prev > 0 else None
    ring_yoy = round((r_curr - r_prev) / r_prev * 100, 1) if r_prev > 0 else None

    base = {"area_yoy_pct": area_yoy, "ring_yoy_pct": ring_yoy, "anos_comparados": [y_prev, y_curr]}

    # No baseline in either series → can't classify.
    if area_yoy is None or ring_yoy is None:
        return {**base, "label": "inconclusivo", "confidence": "baixa"}

    DEAD = 10.0  # ±10% dead-band
    if area_yoy <= -DEAD and ring_yoy >= DEAD:
        label = "deslocamento_provavel"
    elif area_yoy <= -DEAD and ring_yoy <= -DEAD:
        label = "reducao_genuina"
    elif area_yoy >= DEAD and ring_yoy >= DEAD:
        label = "intensificacao"
    else:
        label = "inconclusivo"

    # Confidence: low baselines are noisy; big divergence + solid counts is convincing.
    baseline_min = min(a_prev, r_prev)
    divergence = abs(area_yoy - ring_yoy)
    if baseline_min < 10:
        confidence = "baixa"
    elif divergence >= 50 and baseline_min >= 30:
        confidence = "alta"
    else:
        confidence = "media"

    return {**base, "label": label, "confidence": confidence}


def load_isp_series(data_dir: Path) -> pd.DataFrame:
    """ISP historical series (broad violence spectrum, aggregated by CISP/AISP).

    No point coordinates — can only be attached at AISP-district granularity.
    """
    path = data_dir / "external" / "isp_rj_crimes_rio.csv"
    if not path.is_file():
        return pd.DataFrame()
    return pd.read_csv(path, low_memory=False)


def build_rio_context(data_dir: Path, buffer_m: float = 500.0,
                      max_crime_points: int | None = None) -> dict:
    """Build the additive city-wide context artifact.

    Contents:
      - rings: <buffer_m> ring around each FM polygon (surroundings only — the
        union of all FM polygons is subtracted, so rings never overlap an area)
      - crime_points / dd_points: ALL geolocated city-wide points (compact)
      - dominio: city-wide OrCrim polygons (simplified)
      - aisp_violence: ISP broad-violence series aggregated by AISP (data only —
        no choropleth geometry available in the repo)
    """
    from shapely.ops import unary_union
    from shapely.geometry import mapping

    polys = load_polygons(data_dir)
    oc = load_ocorrencias(data_dir)
    dd = load_dd_all_geo(data_dir)
    dominio = load_dominio(data_dir)
    isp = load_isp_series(data_dir)

    print(f"  Rio context — ocorrências: {len(oc):,} | DD geo: {len(dd):,} | "
          f"domínio: {len(dominio):,} | ISP rows: {len(isp):,}")

    # ── Adjacency rings: buffer in a metric CRS, subtract ALL FM polygons ──
    polys_m = polys.to_crs(31983)  # SIRGAS 2000 / UTM 23S — meters
    fm_union_m = unary_union(list(polys_m.geometry))
    rings_m = [r.geometry.buffer(buffer_m).difference(fm_union_m)
               for _, r in polys_m.iterrows()]
    rings_gdf = gpd.GeoDataFrame(
        {"fid": polys["fid"].values, "nome": polys["nome_area"].values},
        geometry=rings_m, crs=31983,
    ).to_crs(4326)

    # Spillover counts: crimes / DD that fall inside each ring
    oc_gdf = gpd.GeoDataFrame(oc, geometry=gpd.points_from_xy(oc.longitude, oc.latitude), crs=4326)
    dd_gdf = gpd.GeoDataFrame(dd, geometry=gpd.points_from_xy(dd.longitude, dd.latitude), crs=4326)
    oc_ring = gpd.sjoin(oc_gdf, rings_gdf[["fid", "geometry"]], how="inner", predicate="within")
    dd_ring = gpd.sjoin(dd_gdf, rings_gdf[["fid", "geometry"]], how="inner", predicate="within")
    oc_ring_counts = oc_ring.groupby("fid").size().to_dict()
    dd_ring_counts = dd_ring.groupby("fid").size().to_dict()

    # ── Displacement detection (Desafio 2): per-year crime counts INSIDE the FM
    # polygon vs INSIDE its ring, so we can tell a genuine drop from one pushed to
    # the adjacent streets. Ocorrências only (DD is single-year → can't drive YoY).
    polys_4326 = polys.to_crs(4326) if polys.crs and polys.crs.to_epsg() != 4326 else polys
    oc_in_area = gpd.sjoin(oc_gdf, polys_4326[["fid", "geometry"]], how="inner", predicate="within")

    def _year_counts_by_fid(joined):
        """{fid -> {year:int -> count}} from a sjoin result carrying `data` dd/mm/YYYY."""
        if joined.empty or "data" not in joined.columns:
            return {}
        yr = pd.to_datetime(joined["data"], format="%d/%m/%Y", errors="coerce").dt.year
        tmp = joined.assign(_ano=yr).dropna(subset=["_ano"])
        out = {}
        for (fid, ano), n in tmp.groupby(["fid", "_ano"]).size().items():
            out.setdefault(int(fid), {})[int(ano)] = int(n)
        return out

    area_year_by_fid = _year_counts_by_fid(oc_in_area)
    ring_year_by_fid = _year_counts_by_fid(oc_ring)

    rings_out = []
    for _, r in rings_gdf.iterrows():
        if r.geometry is None or r.geometry.is_empty:
            continue
        fid = int(r["fid"])
        area_yc = area_year_by_fid.get(fid, {})
        ring_yc = ring_year_by_fid.get(fid, {})
        # Emit only the recent 5-year window for display: the source carries a few
        # stray ancient records (e.g. 1972) that would clutter a year chart. The
        # classifier itself only looks at the last two years, so trimming is safe.
        all_years = set(area_yc) | set(ring_yc)
        recent_cut = (max(all_years) - 4) if all_years else 0
        rings_out.append({
            "fid": fid,
            "nome": r["nome"],
            "crimes_in_ring": int(oc_ring_counts.get(r["fid"], 0)),
            "dd_in_ring": int(dd_ring_counts.get(r["fid"], 0)),
            "area_year_counts": {str(y): c for y, c in sorted(area_yc.items()) if y >= recent_cut},
            "ring_year_counts": {str(y): c for y, c in sorted(ring_yc.items()) if y >= recent_cut},
            "displacement": classify_displacement(area_yc, ring_yc),
            "geometry": mapping(r.geometry),
        })

    # ── City-wide crime points (ALL by default, compact + rounded) ──
    oc_pts = oc
    if max_crime_points and len(oc_pts) > max_crime_points:
        oc_pts = oc_pts.sample(n=max_crime_points, random_state=42)
    crime_points = [
        {"lat": round(float(la), 5), "lng": round(float(lo), 5),
         "tipo": str(t), "h": int(h) if pd.notna(h) else None}
        for la, lo, t, h in zip(oc_pts["latitude"], oc_pts["longitude"],
                                oc_pts["desc_delito"], oc_pts["hora_num"])
    ]

    # ── City-wide Disque Denúncia points ──
    dd_tipos = dd["tipo"] if "tipo" in dd.columns else pd.Series([""] * len(dd), index=dd.index)
    dd_points = [
        {"lat": round(float(la), 5), "lng": round(float(lo), 5), "tipo": str(t)}
        for la, lo, t in zip(dd["latitude"], dd["longitude"], dd_tipos)
    ]

    # ── City-wide OrCrim domination polygons (simplified) ──
    dom_feats = []
    for _, r in dominio.iterrows():
        g = r.geometry
        if g is None or g.is_empty:
            continue
        gs = g.simplify(0.0002, preserve_topology=True)
        fac = str(r.get("dominio_orcrim") or r.get("faccao") or "—")
        dom_feats.append({
            "type": "Feature",
            "properties": {"faccao": fac, "nome": str(r.get("nome_territorio") or "")},
            "geometry": mapping(gs),
        })
    dominio_fc = {"type": "FeatureCollection", "features": dom_feats}

    # ── ISP broad-violence series aggregated by AISP (no geometry) ──
    aisp_violence: dict = {}
    isp_period = None
    if not isp.empty and "aisp" in isp.columns and "ano" in isp.columns:
        years = sorted(int(y) for y in isp["ano"].dropna().unique())
        recent = years[-3:] if len(years) >= 3 else years
        sub = isp[isp["ano"].isin(recent)]
        isp_period = f"{min(recent)}-{max(recent)}" if recent else None
        cols = ["hom_doloso", "letalidade_violenta", "total_roubos", "roubo_transeunte",
                "roubo_celular", "roubo_em_coletivo", "trafico_drogas", "total_furtos"]
        present = [c for c in cols if c in sub.columns]
        for aisp_val, grp in sub.groupby("aisp"):
            try:
                key = str(int(aisp_val))
            except (ValueError, TypeError):
                continue
            aisp_violence[key] = {
                c: int(pd.to_numeric(grp[c], errors="coerce").fillna(0).sum()) for c in present
            }

    return {
        "meta": {
            "generated_at": datetime.now().strftime("%Y-%m-%d"),
            "buffer_m": buffer_m,
            "crime_total": len(crime_points),
            "crime_total_disponivel": int(len(oc)),
            "dd_total": len(dd_points),
            "dominio_total": len(dom_feats),
            "isp_period": isp_period,
            "isp_aisp_count": len(aisp_violence),
            "note_isp": ("Série ISP agregada por AISP (homicídio, letalidade, tráfico). "
                         "Sem coordenadas — não há choropleth por AISP sem os polígonos "
                         "de AISP, que não estão no repositório."),
        },
        "rings": rings_out,
        "crime_points": crime_points,
        "dd_points": dd_points,
        "dominio": dominio_fc,
        "aisp_violence": aisp_violence,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-dir",
        default="../../data",
        help="Pasta de dados: (1) repositório com data/clean/*.parquet ou (2) pacote legacy compstat/",
    )
    parser.add_argument("--output", default="areas_data.json")
    parser.add_argument(
        "--with-rio-context", action="store_true",
        help="Gera ADICIONALMENTE rio_context.json (camadas Rio-inteiro + anéis de entorno). "
             "Não altera areas_data.json.",
    )
    parser.add_argument("--ring-buffer-m", type=float, default=500.0,
                        help="Raio do anel de entorno em metros (padrão 500).")
    parser.add_argument("--rio-max-points", type=int, default=0,
                        help="Limite de pontos de crime no rio_context (0 = todos).")
    parser.add_argument("--rio-output", default="rio_context.json",
                        help="Caminho do artefato de contexto Rio.")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    result = build_areas_data(data_dir)
    out = Path(args.output)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nJSON: {out} ({out.stat().st_size // 1024} KB)")

    if args.with_rio_context:
        print("\nGerando rio_context.json (camadas adicionais — Rio inteiro + entorno)...")
        ctx = build_rio_context(
            data_dir,
            buffer_m=args.ring_buffer_m,
            max_crime_points=(args.rio_max_points or None),
        )
        rio_out = Path(args.rio_output)
        with open(rio_out, "w", encoding="utf-8") as f:
            json.dump(ctx, f, ensure_ascii=False, separators=(",", ":"))
        print(f"Rio context: {rio_out} ({rio_out.stat().st_size // 1024} KB) — "
              f"{ctx['meta']['crime_total']:,} crimes, {ctx['meta']['dd_total']:,} DD, "
              f"{ctx['meta']['dominio_total']:,} domínios, {len(ctx['rings'])} anéis")
        # Mirror into the frontend public/ dir if it exists (matches areas_data.json convention)
        pub = Path("../frontend/public")
        if pub.is_dir():
            shutil.copy(rio_out, pub / "rio_context.json")
            print(f"Copiado → {pub / 'rio_context.json'}")

        # Compact displacement summary (NO geometry) so the per-area panel can show the
        # "Alerta de Deslocamento" card without downloading the ~10MB rio_context.json.
        disp = {
            "meta": {"buffer_m": ctx["meta"]["buffer_m"], "periodo": "ocorrências 2020-2024 (DD não entra no YoY)"},
            "areas": {
                str(r["fid"]): {
                    "nome": r["nome"],
                    "displacement": r["displacement"],
                    "area_year_counts": r["area_year_counts"],
                    "ring_year_counts": r["ring_year_counts"],
                }
                for r in ctx["rings"]
            },
        }
        disp_out = Path("displacement.json")
        with open(disp_out, "w", encoding="utf-8") as f:
            json.dump(disp, f, ensure_ascii=False, separators=(",", ":"))
        print(f"Displacement: {disp_out} ({disp_out.stat().st_size} B) — {len(disp['areas'])} áreas")
        if pub.is_dir():
            shutil.copy(disp_out, pub / "displacement.json")
            print(f"Copiado → {pub / 'displacement.json'}")


if __name__ == "__main__":
    main()
