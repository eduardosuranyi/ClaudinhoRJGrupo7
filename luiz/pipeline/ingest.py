"""
Ingestão e normalização de todas as fontes de dados.
Retorna DataFrames Polars (exceto geometrias, que retornam GeoDataFrame).

Notas sobre os dados:
- ocorrencias: UTF-8, vírgula, lat/lon direto
- disk_denuncia: latin-1, ponto-e-vírgula, decimais com VÍRGULA em lat/lon
- fatores_urbanos: UTF-8, vírgula; coordenada_x = latitude, coordenada_y = longitude
- cameras: UTF-8, vírgula; geometry = WKT "POINT (lon lat)"
- dominio_territorial: UTF-8, vírgula; geometria = WKT POLYGON
- FM shapefile: campo nome_subar = chave de área (igual a subarea_nome e nome_area_fm)
"""

import re
import zipfile
import unicodedata
from pathlib import Path

import polars as pl

from config import (
    OCORRENCIAS_PATH,
    DISK_DENUNCIA_PATH,
    FATORES_URBANOS_PATH,
    CAMERAS_PATH,
    DOMINIO_PATH,
    FM_SHAPEFILE_PATH,
    RELINTS_DIR,
    RELINT_AREA_MAP,
    CLASSES_PATRIMONIO,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def normalize_rua(name: str) -> str:
    """Normaliza nome de logradouro para matching: sem acento, maiúsculo, abreviaturas expandidas."""
    if not name:
        return ""
    name = unicodedata.normalize("NFD", str(name))
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    name = name.upper().strip()
    abrevs = {
        r"\bR\b\.?": "RUA",
        r"\bAV\b\.?": "AVENIDA",
        r"\bAVDA\b\.?": "AVENIDA",
        r"\bPCA\b\.?": "PRACA",
        r"\bPR\b\.?": "PRACA",
        r"\bTRV\b\.?": "TRAVESSA",
        r"\bEST\b\.?": "ESTRADA",
        r"\bALM\b\.?": "ALMIRANTE",
        r"\bGEN\b\.?": "GENERAL",
        r"\bPRES\b\.?": "PRESIDENTE",
    }
    for pat, repl in abrevs.items():
        name = re.sub(pat, repl, name)
    return re.sub(r"\s+", " ", name).strip()


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def load_ocorrencias() -> pl.DataFrame:
    """
    115K registros de furto e roubo georreferenciados.
    Colunas-chave: longitude, latitude, hora, mes, ano, desc_delito, aisp, locf, dia_semana
    """
    df = pl.read_csv(
        str(OCORRENCIAS_PATH),
        encoding="utf8",
        null_values=["", "N/A", "NA"],
        infer_schema_length=1000,
    )
    df = df.with_columns(
        [
            pl.col("latitude").cast(pl.Float64, strict=False),
            pl.col("longitude").cast(pl.Float64, strict=False),
            pl.col("hora").cast(pl.Int32, strict=False),
            pl.col("mes").cast(pl.Int32, strict=False),
            pl.col("ano").cast(pl.Int32, strict=False),
            pl.col("locf").str.strip_chars().alias("locf"),
        ]
    )
    # Filtra linhas com coordenadas válidas no Rio de Janeiro
    df = df.filter(
        pl.col("latitude").is_not_null()
        & pl.col("longitude").is_not_null()
        & pl.col("latitude").is_between(-23.1, -22.7)
        & pl.col("longitude").is_between(-43.8, -43.0)
    )
    # Normaliza logradouro para matching
    df = df.with_columns(
        pl.col("locf")
        .map_elements(normalize_rua, return_dtype=pl.Utf8)
        .alias("locf_norm")
    )
    return df


def load_disk_denuncia() -> pl.DataFrame:
    """
    83K denúncias anônimas. Encoding latin-1, separador ';'.
    ATENÇÃO: lat/lon usam vírgula como separador decimal → corrigido aqui.
    Colunas-chave: latitude, longitude, classe, tipo, relato_redacted, logradouro, bairro_logradouro
    """
    df = pl.read_csv(
        str(DISK_DENUNCIA_PATH),
        encoding="latin1",
        separator=";",
        null_values=["", "N/A", "NA"],
        infer_schema_length=500,
        ignore_errors=True,
    )
    # Corrige decimal com vírgula
    for col in ["latitude", "longitude"]:
        if col in df.columns:
            df = df.with_columns(
                pl.col(col)
                .cast(pl.Utf8, strict=False)
                .str.replace(",", ".", literal=True)
                .cast(pl.Float64, strict=False)
                .alias(col)
            )
    # Filtra patrimônio e coordenadas válidas
    df = df.filter(
        pl.col("latitude").is_not_null()
        & pl.col("longitude").is_not_null()
        & pl.col("latitude").is_between(-23.1, -22.7)
        & pl.col("longitude").is_between(-43.8, -43.0)
    )
    # Flag de crime contra patrimônio
    df = df.with_columns(
        pl.col("classe").is_in(list(CLASSES_PATRIMONIO)).alias("patrimonio")
    )
    # Normaliza logradouro
    if "logradouro" in df.columns:
        df = df.with_columns(
            pl.col("logradouro")
            .map_elements(normalize_rua, return_dtype=pl.Utf8)
            .alias("logradouro_norm")
        )
    return df


def load_fatores_urbanos() -> pl.DataFrame:
    """
    2085 fatores ambientais georreferenciados.
    ATENÇÃO: coordenada_x = latitude (~-22), coordenada_y = longitude (~-43).
    Filtrado para apenas fatores ativos e com tipo real.
    """
    df = pl.read_csv(
        str(FATORES_URBANOS_PATH),
        encoding="utf8",
        null_values=["", "N/A", "NA"],
    )
    # Renomeia para convenção padrão
    df = df.with_columns(
        [
            pl.col("coordenada_x").cast(pl.Float64, strict=False).alias("latitude"),
            pl.col("coordenada_y").cast(pl.Float64, strict=False).alias("longitude"),
        ]
    )
    # Filtra apenas ativos e com tipo real
    df = (
        df.filter(
            pl.col("tipo_ocorrencia_ativo")
            .cast(pl.Utf8)
            .str.to_lowercase()
            .str.strip_chars()
            == "true"
        )
        .filter(
            pl.col("tipo_ocorrencia_descricao").is_not_null()
            & ~pl.col("tipo_ocorrencia_descricao").str.contains("Sem ocorrência")
        )
        .filter(pl.col("latitude").is_not_null() & pl.col("longitude").is_not_null())
    )
    # Normaliza logradouro
    df = df.with_columns(
        pl.col("logradouro")
        .map_elements(normalize_rua, return_dtype=pl.Utf8)
        .alias("logradouro_norm")
    )
    return df


def load_cameras() -> pl.DataFrame:
    """
    985 câmeras nas áreas FM.
    geometry: WKT "POINT (longitude latitude)"
    """
    df = pl.read_csv(
        str(CAMERAS_PATH),
        encoding="utf8",
        null_values=["", "N/A"],
    )
    # Extrai lon/lat do WKT: "POINT (-43.180 -22.909)"
    df = df.with_columns(
        [
            pl.col("geometry")
            .str.extract(r"POINT \((-?[\d.]+)\s+(-?[\d.]+)\)", 1)
            .cast(pl.Float64, strict=False)
            .alias("longitude"),
            pl.col("geometry")
            .str.extract(r"POINT \((-?[\d.]+)\s+(-?[\d.]+)\)", 2)
            .cast(pl.Float64, strict=False)
            .alias("latitude"),
        ]
    )
    return df.filter(pl.col("latitude").is_not_null())


def load_dominio_territorial():
    """Retorna GeoDataFrame com polígonos de domínio de ORCRIM."""
    import geopandas as gpd
    from shapely import wkt as shapely_wkt

    df = pl.read_csv(str(DOMINIO_PATH), encoding="utf8", null_values=["", "N/A"])
    df_pd = df.to_pandas()
    df_pd["geometry"] = df_pd["geometria"].apply(
        lambda x: shapely_wkt.loads(x) if isinstance(x, str) else None
    )
    return gpd.GeoDataFrame(df_pd, geometry="geometry", crs="EPSG:4326")


def load_fm_polygons():
    """
    Retorna GeoDataFrame com os 8 polígonos das áreas FM.
    Campo de área: nome_subar (igual a subarea_nome dos fatores e nome_area_fm das câmeras).
    """
    import geopandas as gpd

    gdf = gpd.read_file(str(FM_SHAPEFILE_PATH))
    gdf = gdf.to_crs("EPSG:4326")
    return gdf


def load_relints() -> dict[str, str]:
    """
    Lê todos os docx de RELINT e retorna {nome_area: texto_completo}.
    Usa extração de XML bruto (não requer python-docx instalado).
    """
    result: dict[str, str] = {}
    relints_path = Path(RELINTS_DIR)

    for fn in sorted(relints_path.glob("*.docx")):
        area_name = None
        for key, name in RELINT_AREA_MAP.items():
            if key in fn.name:
                area_name = name
                break
        if area_name is None:
            continue
        try:
            with zipfile.ZipFile(fn) as z:
                xml_bytes = z.read("word/document.xml")
            xml = xml_bytes.decode("utf-8", errors="replace")
            # Remove tags XML, colapsa espaços
            text = re.sub(r"<[^>]+>", " ", xml)
            text = re.sub(r"\s+", " ", text).strip()
            result[area_name] = text
        except Exception as e:
            print(f"[ingest] Erro ao ler {fn.name}: {e}")

    return result
