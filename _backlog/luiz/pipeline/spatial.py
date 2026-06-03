"""
Operações espaciais: filtragem por polígono FM, join com domínio territorial,
geração de GeoDataFrames para análise e mapeamento.
"""

from __future__ import annotations

import polars as pl


def _get_polygon_for_area(gdf_fm, area_name: str):
    """Retorna o polígono shapely da área FM pelo nome."""
    matches = gdf_fm[gdf_fm["nome_subar"] == area_name]
    if len(matches) == 0:
        return None
    return matches.geometry.iloc[0]


def filter_points_by_polygon(
    df: pl.DataFrame,
    polygon,
    lat_col: str = "latitude",
    lon_col: str = "longitude",
    batch_size: int = 5000,
) -> pl.DataFrame:
    """
    Filtra DataFrame Polars mantendo apenas linhas cujo ponto (lon, lat)
    está dentro do polígono shapely. Usa prepared geometry para performance.
    """
    from shapely.geometry import Point
    from shapely.prepared import prep

    prepared = prep(polygon)

    lats = df[lat_col].to_list()
    lons = df[lon_col].to_list()

    mask = [prepared.contains(Point(lon, lat)) for lon, lat in zip(lons, lats)]
    return df.filter(pl.Series("_mask", mask))


def get_area_data(
    area_name: str,
    gdf_fm,
    df_ocorrencias: pl.DataFrame,
    df_fatores: pl.DataFrame,
    df_denuncias: pl.DataFrame,
    df_cameras: pl.DataFrame,
) -> dict:
    """
    Retorna todos os dados filtrados para a área FM selecionada.

    Para ocorrências e denúncias: filtro espacial dentro do polígono.
    Para fatores e câmeras: filtro por nome de área (mais preciso, pois são dados
    levantados diretamente pelos agentes nas áreas definidas).
    """
    polygon = _get_polygon_for_area(gdf_fm, area_name)

    # Crimes: filtro espacial
    if polygon is not None:
        crimes = filter_points_by_polygon(df_ocorrencias, polygon)
    else:
        crimes = pl.DataFrame(schema=df_ocorrencias.schema)

    # Denúncias: filtro espacial + bbox expandida 20% para capturar redondezas
    if polygon is not None:
        denuncias = filter_points_by_polygon(df_denuncias, polygon)
    else:
        denuncias = pl.DataFrame(schema=df_denuncias.schema)

    # Fatores: filtro por subarea_nome
    fatores = df_fatores.filter(pl.col("subarea_nome") == area_name)

    # Câmeras: filtro por nome_area_fm
    cameras = df_cameras.filter(pl.col("nome_area_fm") == area_name)

    return {
        "area_name": area_name,
        "polygon": polygon,
        "crimes": crimes,
        "denuncias": denuncias,
        "fatores": fatores,
        "cameras": cameras,
    }


def get_orcrim_for_area(gdf_dominio, polygon) -> list[str]:
    """
    Retorna lista de ORCRIMs cujo território se sobrepõe ao polígono da área FM.
    """
    if polygon is None or gdf_dominio is None:
        return []
    try:
        intersects = gdf_dominio[gdf_dominio.geometry.intersects(polygon)]
        return intersects["dominio_orcrim"].unique().tolist()
    except Exception:
        return []


def crimes_por_logradouro(df_crimes: pl.DataFrame) -> pl.DataFrame:
    """
    Agrupa ocorrências por logradouro normalizado.
    Retorna DataFrame com: locf_norm, count, hora_pico, dias_pico, tipos
    """
    if df_crimes.is_empty():
        return pl.DataFrame(
            {
                "locf_norm": pl.Series([], dtype=pl.Utf8),
                "locf": pl.Series([], dtype=pl.Utf8),
                "total_crimes": pl.Series([], dtype=pl.Int32),
                "hora_pico": pl.Series([], dtype=pl.Int32),
                "pct_noturno": pl.Series([], dtype=pl.Float64),
            }
        )

    # Total por logradouro
    base = (
        df_crimes.filter(
            pl.col("locf_norm").is_not_null() & (pl.col("locf_norm") != "")
        )
        .group_by("locf_norm")
        .agg(
            [
                pl.col("locf").first().alias("locf"),
                pl.len().alias("total_crimes"),
                pl.col("hora").drop_nulls().mean().alias("hora_media"),
            ]
        )
        .sort("total_crimes", descending=True)
    )

    # Hora de pico por logradouro
    hora_pico = (
        df_crimes.filter(
            pl.col("hora").is_not_null() & pl.col("locf_norm").is_not_null()
        )
        .group_by(["locf_norm", "hora"])
        .agg(pl.len().alias("n"))
        .sort("n", descending=True)
        .group_by("locf_norm")
        .agg(pl.col("hora").first().alias("hora_pico"))
    )

    # % noturno (18h-05h)
    noturno = (
        df_crimes.filter(pl.col("locf_norm").is_not_null())
        .with_columns(
            pl.when((pl.col("hora") >= 18) | (pl.col("hora") <= 5))
            .then(1)
            .otherwise(0)
            .alias("noturno")
        )
        .group_by("locf_norm")
        .agg((pl.col("noturno").sum() / pl.len() * 100).alias("pct_noturno"))
    )

    result = base.join(hora_pico, on="locf_norm", how="left").join(
        noturno, on="locf_norm", how="left"
    )
    return result


def fatores_por_logradouro(df_fatores: pl.DataFrame) -> pl.DataFrame:
    """
    Agrupa fatores urbanos por logradouro normalizado.
    Retorna: logradouro_norm, lista de tipos, órgãos responsáveis, count
    """
    if df_fatores.is_empty():
        return pl.DataFrame()

    return (
        df_fatores.filter(
            pl.col("logradouro_norm").is_not_null() & (pl.col("logradouro_norm") != "")
        )
        .group_by("logradouro_norm")
        .agg(
            [
                pl.col("logradouro").first(),
                pl.col("tipo_ocorrencia_descricao").unique().alias("tipos_fatores"),
                pl.col("orgao_responsavel").unique().alias("orgaos"),
                pl.len().alias("n_fatores"),
                pl.col("bairro_nome").first().alias("bairro"),
            ]
        )
        .sort("n_fatores", descending=True)
    )


def denuncias_por_logradouro(df_denuncias: pl.DataFrame) -> pl.DataFrame:
    """
    Agrupa denúncias de patrimônio por logradouro normalizado.
    """
    if df_denuncias.is_empty():
        return pl.DataFrame()

    col = (
        "logradouro_norm" if "logradouro_norm" in df_denuncias.columns else "logradouro"
    )
    return (
        df_denuncias.filter(pl.col("patrimonio") == True)
        .filter(pl.col(col).is_not_null() & (pl.col(col) != ""))
        .group_by(col)
        .agg(
            [
                pl.col("tipo").alias("tipos_denuncias"),
                pl.col("relato_redacted").alias("relatos"),
                pl.len().alias("n_denuncias"),
            ]
        )
        .rename({col: "logradouro_norm"})
        .sort("n_denuncias", descending=True)
    )


def heatmap_hora_dia(df_crimes: pl.DataFrame) -> pl.DataFrame:
    """
    Retorna matriz (dia_semana × hora) com contagem de crimes.
    dia_semana: 0=Dom, 1=Seg, ..., 6=Sab
    """
    if df_crimes.is_empty():
        return pl.DataFrame()

    return (
        df_crimes.filter(pl.col("hora").is_not_null())
        .with_columns(pl.col("dia_semana").cast(pl.Int32, strict=False))
        .group_by(["dia_semana", "hora"])
        .agg(pl.len().alias("count"))
        .sort(["dia_semana", "hora"])
    )


def ranking_tipos_crime(df_crimes: pl.DataFrame) -> pl.DataFrame:
    """Ranking de modalidades criminais com total e % do período."""
    if df_crimes.is_empty():
        return pl.DataFrame()

    total = len(df_crimes)
    return (
        df_crimes.group_by("desc_delito")
        .agg(pl.len().alias("qtd"))
        .sort("qtd", descending=True)
        .with_columns((pl.col("qtd") / total * 100).round(1).alias("pct"))
        .with_row_index("ranking", offset=1)
    )
