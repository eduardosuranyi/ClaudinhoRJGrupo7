"""
CompStat Rio — Data Pipeline v2
Integra TODAS as fontes: ocorrências, disque denúncia, fatores urbanos,
câmeras, domínio territorial, censo PSR, RELINTs, polígonos FM.

Output: areas_data.json (consumido por frontend e gerador de relatório)
"""

import argparse
import json
import re
import unicodedata
import warnings
from collections import Counter
from pathlib import Path

import geopandas as gpd
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
    if not path.is_file():
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


def match_trechos_to_lines(top_trechos, logradouros, bairro_names):
    """For each top_trecho, find matching LineString geometries from the gazetteer."""
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

    enriched = []
    for t in top_trechos:
        raw_name = t["locf_norm"]
        norm = _normalize_street(raw_name)
        norm_clean = re.sub(r"^(praia|praca)\s+\1\s+", r"\1 ", norm)
        geoms = name_index.get(norm) or name_index.get(norm_clean)
        tc = dict(t)
        if geoms:
            merged = linemerge(ShapelyMLS(geoms)) if len(geoms) > 1 else geoms[0]
            simplified = merged.simplify(0.0002, preserve_topology=True)
            tc["line_geometry"] = simplified.__geo_interface__
        enriched.append(tc)
    return enriched


# ───────────────────────────────────────────────────────────────────────────
# 1c. BAIRRO CONTEXT BUILDER
# ───────────────────────────────────────────────────────────────────────────


def build_bairro_context(polys, bairros, censo):
    """Precompute bairro→FM area mapping with population data + geometries."""
    if bairros.empty:
        return {}

    fm_bairros = gpd.sjoin(bairros, polys[["nome_area", "geometry"]], how="inner", predicate="intersects")

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

CAMERA_COVERAGE_RADIUS_M = 50


def compute_camera_gaps(crimes_df, cam_df, max_gaps=15):
    """Detect blind spots: crime clusters not covered by any camera buffer."""
    if cam_df.empty:
        return {"n_cameras": 0, "coverage_radius_m": CAMERA_COVERAGE_RADIUS_M,
                "cameras": [], "gaps": []}

    cam_points = [{"lat": float(r.lat), "lng": float(r.lng)} for r in cam_df.itertuples()]

    if crimes_df.empty:
        return {"n_cameras": len(cam_points),
                "coverage_radius_m": CAMERA_COVERAGE_RADIUS_M,
                "cameras": cam_points, "gaps": []}

    metric_crs = "EPSG:31983"
    cam_gdf = gpd.GeoDataFrame(
        cam_df, geometry=gpd.points_from_xy(cam_df["lng"], cam_df["lat"]), crs=4326
    ).to_crs(metric_crs)
    coverage_union = cam_gdf.buffer(CAMERA_COVERAGE_RADIUS_M).union_all()

    valid = crimes_df[crimes_df["latitude"].notna() & crimes_df["longitude"].notna()]
    if valid.empty:
        return {"n_cameras": len(cam_points),
                "coverage_radius_m": CAMERA_COVERAGE_RADIUS_M,
                "cameras": cam_points, "gaps": []}

    crime_gdf = gpd.GeoDataFrame(
        valid, geometry=gpd.points_from_xy(valid["longitude"], valid["latitude"]), crs=4326
    ).to_crs(metric_crs)

    uncovered_mask = ~crime_gdf.geometry.within(coverage_union)
    uncovered = crime_gdf[uncovered_mask]

    if uncovered.empty:
        return {"n_cameras": len(cam_points),
                "coverage_radius_m": CAMERA_COVERAGE_RADIUS_M,
                "cameras": cam_points, "gaps": []}

    cluster_gdf = uncovered.copy()
    cluster_gdf["cluster"] = (
        cluster_gdf.geometry.apply(lambda g: f"{round(g.x, -1)}_{round(g.y, -1)}")
    )
    clusters = (
        cluster_gdf.groupby("cluster")
        .agg(count=("cluster", "size"),
             x=("geometry", lambda gs: gs.iloc[0].x),
             y=("geometry", lambda gs: gs.iloc[0].y))
        .sort_values("count", ascending=False)
        .head(max_gaps)
    )

    gaps = []
    for i, (_, row) in enumerate(clusters.iterrows(), 1):
        pt = gpd.GeoSeries([Point(row["x"], row["y"])], crs=metric_crs)
        nearest_d = float(cam_gdf.distance(pt.iloc[0]).min())
        pt_wgs = pt.to_crs(4326).iloc[0]
        recommendation = "remanejar" if nearest_d <= 2 * CAMERA_COVERAGE_RADIUS_M else "instalar"
        gaps.append({
            "rank": i,
            "lat": round(pt_wgs.y, 6),
            "lng": round(pt_wgs.x, 6),
            "uncovered_crimes": int(row["count"]),
            "nearest_camera_m": round(nearest_d, 1),
            "recommendation": recommendation,
            "justification": (
                f"{int(row['count'])} ocorrências sem cobertura; "
                f"câmera mais próxima a {nearest_d:.0f} m"
            ),
        })

    return {
        "n_cameras": len(cam_points),
        "coverage_radius_m": CAMERA_COVERAGE_RADIUS_M,
        "cameras": cam_points,
        "gaps": gaps,
    }


# ───────────────────────────────────────────────────────────────────────────
# 5b. BINGO / COINCIDENCE SCORING
# ───────────────────────────────────────────────────────────────────────────


def compute_bingo(top_trechos, fu_area, dd_area, oc_area):
    """Detect coincidence of crime + factors + signals on each trecho."""
    if not top_trechos:
        return top_trechos, 0, 0

    fu_logradouros = set()
    if not fu_area.empty and "logradouro" in fu_area.columns:
        fu_logradouros = set(fu_area["logradouro"].dropna().str.lower().str.strip())

    dd_logradouros = set()
    if not dd_area.empty and "logradouro" in dd_area.columns:
        dd_logradouros = set(dd_area["logradouro"].dropna().str.lower().str.strip())

    n_bingo = 0
    n_triple = 0
    for t in top_trechos:
        name = t.get("locf_norm", "").lower().strip()
        has_crime = t.get("total", 0) > 0
        has_factor = any(name in fl or fl in name for fl in fu_logradouros) if name else False
        has_signal = any(name in dl or dl in name for dl in dd_logradouros) if name else False

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

        # Top trechos + bingo coincidence scoring
        top_trechos = get_top_trechos(oc_area)
        top_trechos, n_bingo, n_triple_bingo = compute_bingo(
            top_trechos, fu_area, dd_area, oc_area)
        _bairro_names = bairro_context.get(nome, {}).get("bairros", [])
        top_trechos = match_trechos_to_lines(top_trechos, logradouros, _bairro_names)

        # Camera gap analysis
        camera_gaps = compute_camera_gaps(oc_area, cam_area)

        # Fatores por órgão
        fatores_orgao = get_fatores_por_orgao(fu_area)

        # Relatos sample
        relatos = get_relatos_sample(dd_area)

        # Evolução mensal
        evolucao = evolution_mensal(oc_area)

        # --- Enrichment: bairro context, population, per-capita ---
        ctx = bairro_context.get(nome, {})
        pop = ctx.get("populacao_bairros_2022", 0)
        crimes_total = int(len(oc_area))
        crimes_per_1000 = round((crimes_total / pop) * 1000, 1) if pop > 0 else None

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
            stats["populacao_estimada"] = pop
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-dir",
        default="../../data",
        help="Pasta de dados: (1) repositório com data/clean/*.parquet ou (2) pacote legacy compstat/",
    )
    parser.add_argument("--output", default="areas_data.json")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    result = build_areas_data(data_dir)
    out = Path(args.output)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nJSON: {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
