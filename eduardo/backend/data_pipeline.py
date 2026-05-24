"""
CompStat Rio — Data Pipeline v2
Integra TODAS as fontes: ocorrências, disque denúncia, fatores urbanos,
câmeras, domínio territorial, censo PSR, RELINTs, polígonos FM.

Output: areas_data.json (consumido por frontend e gerador de relatório)
"""

import argparse
import json
import re
import warnings
from collections import Counter
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

warnings.filterwarnings("ignore")


# ───────────────────────────────────────────────────────────────────────────
# 1. LOADERS
# ───────────────────────────────────────────────────────────────────────────

def load_ocorrencias(data_dir: Path) -> pd.DataFrame:
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


def load_disk_denuncia(data_dir: Path) -> tuple:
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
    path = data_dir / "dados" / "fatores_urbanos.csv"
    df = pd.read_csv(path, low_memory=False)
    df = df.rename(columns={"coordenada_x": "latitude", "coordenada_y": "longitude"})
    df = df[df["latitude"].between(-23.2, -22.7) & df["longitude"].between(-43.9, -43.0)].copy()
    return df


def load_cameras(data_dir: Path) -> pd.DataFrame:
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
    path = data_dir / "sh_area_forca" / "areas_forca_municipal.shp"
    gdf = gpd.read_file(path).to_crs(4326)
    gdf = gdf.rename(columns={"nome_subar": "nome_area"})
    return gdf


def load_dominio(data_dir: Path) -> gpd.GeoDataFrame:
    """Carrega domínio territorial (facções) e converte WKT para geometria."""
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
    path = data_dir / "dados" / "outros dados" / "CPSR_2020_2022_2024.xlsx"
    df = pd.read_excel(path, sheet_name=0,
                       usecols=["Chave_única", "Latitude", "Longitude",
                                "Classificação idade", "Sexo"])
    df = df.rename(columns={"Latitude": "lat", "Longitude": "lng",
                            "Classificação idade": "idade_classe"})
    df = df[df["lat"].between(-23.2, -22.7) & df["lng"].between(-43.9, -43.0)].copy()
    return df


def load_relints(data_dir: Path) -> dict:
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
        out.append({
            "tipo": str(getattr(r, "tipo", "")),
            "data": str(getattr(r, "data_denuncia", "")),
            "bairro": str(getattr(r, "bairro_logradouro", "")),
            "logradouro": str(getattr(r, "logradouro", "")),
            "relato": relato,
            "modus": extract_modus(relato),
        })
    return out


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
# 5. SCORING
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

    print(f"  Ocorrências: {len(oc):,}")
    print(f"  Disque Denúncia geo: {len(dd_geo):,} | sem geo: {len(dd_no_geo):,}")
    print(f"  Fatores: {len(fu):,}")
    print(f"  Câmeras: {len(cam):,}")
    print(f"  Polígonos FM: {len(polys)}")
    print(f"  RELINTs: {len(relints)}")
    print(f"  Domínio territorial: {len(dominio):,}")
    print(f"  Censo PSR: {len(psr):,}")

    print("\nFazendo joins espaciais...")
    oc_joined = join_points_to_areas(oc, polys)
    dd_joined = join_points_to_areas(dd_geo, polys)
    fu_joined = join_points_to_areas(fu, polys)
    psr_joined = join_points_to_areas(psr, polys, lat_col="lat", lng_col="lng")

    # Mapeamento bairro → áreas FM (pra usar com DD sem geo)
    bairros_by_area = {}
    for nome in polys["nome_area"].unique():
        # Aproximação: filtrar DD por bairro_logradouro contém palavras chave do nome da área
        bairros_by_area[nome] = []

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

        # Top trechos
        top_trechos = get_top_trechos(oc_area)

        # Fatores por órgão
        fatores_orgao = get_fatores_por_orgao(fu_area)

        # Relatos sample
        relatos = get_relatos_sample(dd_area)

        # Evolução mensal
        evolucao = evolution_mensal(oc_area)

        areas_raw.append({
            "id": fid,
            "nome": nome,
            "geometry": geom.__geo_interface__,
            "identificacao": {
                "aisp": aisp,
                "risp": risp,
                "base_fm": "Litorânea" if "Botafogo" in nome or "Copacabana" in nome else "Central",
                "subprefeitura": "—",
                "dominio_principal": faccoes_count.most_common(1)[0][0] if faccoes_count else "—",
            },
            "stats": {
                "crimes_total": int(len(oc_area)),
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
            },
            "top_trechos": top_trechos,
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
            },
            "_raw": {
                "crime": len(oc_area),
                "peak_ratio": peak_ratio,
                "fatores": len(fu_area),
                "denuncias": len(dd_area),
                "has_relint": nome in relints,
            },
        })

    areas_raw = normalize_scores(areas_raw)
    areas_raw.sort(key=lambda x: x["score"]["total"], reverse=True)

    print("\nScores por área:")
    for a in areas_raw:
        print(f"  [{a['score']['total']:5.1f}] {a['nome'][:60]}")

    return {
        "areas": areas_raw,
        "meta": {
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
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="../../compstat")
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
