"""
Mapa interativo Folium para o CompStat Rio.

Camadas:
  1. Heatmap de crimes (vermelho)
  2. Polígono FM da área selecionada (azul)
  3. Fatores urbanos (ícones por tipo, cor por órgão)
  4. Câmeras (ícone de câmera)
  5. Marcadores de Bingo Score (círculos coloridos por prioridade)
  6. Domínio territorial ORCRIM (polígonos semitransparentes)

Retorna folium.Map que pode ser renderizado no Streamlit via st_folium ou
exportado como HTML estático.
"""

from __future__ import annotations

from typing import Optional
import polars as pl

try:
    import folium
    from folium.plugins import HeatMap, MarkerCluster

    FOLIUM_OK = True
except ImportError:
    FOLIUM_OK = False

from pipeline.bingo import BingoSegmento


# Cores por órgão (fatores urbanos)
ORGAO_COLORS = {
    "COMLURB": "#2ca02c",  # verde
    "Rio Luz": "#ff7f0e",  # laranja
    "SECONSERVA": "#9467bd",  # roxo
    "SEOP": "#8c564b",  # marrom
    "SMAS": "#e377c2",  # rosa
    "CET-Rio": "#17becf",  # ciano
    "GM-Rio": "#1f77b4",  # azul
    "SMTR": "#bcbd22",  # amarelo-esverdeado
}

# Cores por prioridade de bingo
BINGO_COLORS = {
    "CRITICA": "#d62728",
    "ALTA": "#ff7f0e",
    "MEDIA": "#bcbd22",
    "BAIXA": "#2ca02c",
}

# Ícone Font Awesome por tipo de fator
FATOR_ICONS = {
    "Vegetação": ("leaf", "green"),
    "Iluminação": ("lightbulb", "orange"),
    "Obstrução": ("road", "gray"),
    "Pessoas": ("person", "pink"),
    "Drogas": ("capsules", "red"),
    "Lixo": ("trash", "brown"),
    "Esconderijo": ("eye-slash", "darkred"),
    "Trânsito": ("car", "blue"),
    "Comércio": ("store", "purple"),
}


def _fator_icon(tipo: str):
    """Retorna (icon_name, color) baseado no tipo de fator."""
    tipo_lower = tipo.lower()
    if "vegeta" in tipo_lower:
        return "leaf", "green"
    if "ilumina" in tipo_lower or "mal ilumina" in tipo_lower:
        return "lightbulb-o", "orange"
    if "lixo" in tipo_lower or "entulho" in tipo_lower:
        return "trash", "darkred"
    if "pessoa" in tipo_lower or "situa" in tipo_lower:
        return "user", "pink"
    if "droga" in tipo_lower:
        return "warning-sign", "red"
    if "esconderijo" in tipo_lower or "vão" in tipo_lower or "tapume" in tipo_lower:
        return "eye-close", "darkred"
    if "tráfego" in tipo_lower or "retenção" in tipo_lower:
        return "road", "cadetblue"
    if "comércio" in tipo_lower or "ambulante" in tipo_lower:
        return "shopping-cart", "purple"
    if "calçada" in tipo_lower or "obstrução" in tipo_lower:
        return "ban-circle", "gray"
    return "info-sign", "blue"


def criar_mapa_area(
    area_name: str,
    polygon=None,
    df_crimes: Optional[pl.DataFrame] = None,
    df_fatores: Optional[pl.DataFrame] = None,
    df_cameras: Optional[pl.DataFrame] = None,
    gdf_dominio=None,
    bingos: Optional[list[BingoSegmento]] = None,
    zoom_start: int = 15,
) -> "folium.Map":
    """
    Cria mapa Folium completo com todas as camadas para a área FM.
    Retorna objeto folium.Map.
    """
    if not FOLIUM_OK:
        raise ImportError("folium não instalado. Execute: pip install folium")

    # Centro do mapa: centroide do polígono ou média dos crimes
    center_lat, center_lon = -22.9, -43.18
    if polygon is not None:
        try:
            c = polygon.centroid
            center_lat, center_lon = c.y, c.x
        except Exception:
            pass
    elif df_crimes is not None and not df_crimes.is_empty():
        center_lat = float(df_crimes["latitude"].mean())
        center_lon = float(df_crimes["longitude"].mean())

    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=zoom_start,
        tiles="CartoDB positron",
    )

    # -----------------------------------------------------------------------
    # Camada 1: Polígono FM
    # -----------------------------------------------------------------------
    if polygon is not None:
        try:
            import json as _json
            from shapely.geometry import mapping

            geojson_data = _json.dumps(
                {
                    "type": "Feature",
                    "properties": {"name": area_name},
                    "geometry": mapping(polygon),
                }
            )
            folium.GeoJson(
                geojson_data,
                name="Área FM",
                style_function=lambda _: {
                    "fillColor": "#1B3A6B",
                    "color": "#1B3A6B",
                    "weight": 2,
                    "fillOpacity": 0.08,
                },
                tooltip=area_name,
            ).add_to(m)
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Camada 2: Domínio Territorial ORCRIM
    # -----------------------------------------------------------------------
    if gdf_dominio is not None and polygon is not None:
        try:
            from shapely.prepared import prep

            prepared = prep(polygon)
            orcrim_colors = {
                "CV": "#CC0000",
                "ADA": "#0000CC",
                "TCP": "#006600",
                "Milícia": "#FF8800",
                "Milicia": "#FF8800",
            }
            for _, row_gdf in gdf_dominio.iterrows():
                geom = row_gdf.geometry
                if geom is None or not geom.is_valid:
                    continue
                if not (prepared.contains(geom) or geom.intersects(polygon)):
                    continue
                orcrim = str(row_gdf.get("dominio_orcrim", ""))
                color = orcrim_colors.get(orcrim, "#888888")
                folium.GeoJson(
                    geom.__geo_interface__,
                    name=f"ORCRIM: {orcrim}",
                    style_function=lambda _, c=color: {
                        "fillColor": c,
                        "color": c,
                        "weight": 1,
                        "fillOpacity": 0.15,
                    },
                    tooltip=f"Território: {row_gdf.get('nome_territorio', '')} ({orcrim})",
                ).add_to(m)
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Camada 3: Heatmap de crimes
    # -----------------------------------------------------------------------
    if df_crimes is not None and not df_crimes.is_empty():
        heat_data = (
            df_crimes.select(["latitude", "longitude"]).drop_nulls().to_numpy().tolist()
        )
        if heat_data:
            HeatMap(
                heat_data,
                name="Mancha Criminal",
                radius=15,
                blur=10,
                min_opacity=0.3,
                gradient={"0.4": "blue", "0.65": "yellow", "1": "red"},
            ).add_to(m)

    # -----------------------------------------------------------------------
    # Camada 4: Fatores Urbanos
    # -----------------------------------------------------------------------
    if df_fatores is not None and not df_fatores.is_empty():
        fator_cluster = MarkerCluster(name="Fatores Urbanos").add_to(m)
        for row in df_fatores.iter_rows(named=True):
            lat = row.get("latitude") or row.get("coordenada_x")
            lon = row.get("longitude") or row.get("coordenada_y")
            if lat is None or lon is None:
                continue
            try:
                lat, lon = float(lat), float(lon)
            except (TypeError, ValueError):
                continue

            tipo = str(row.get("tipo_ocorrencia_descricao", ""))
            orgao = str(row.get("orgao_responsavel", ""))
            logr = str(row.get("logradouro", ""))
            obs = str(row.get("observacao", ""))[:200]
            icon_name, icon_color = _fator_icon(tipo)
            orgao_color = ORGAO_COLORS.get(orgao, "gray")

            popup_html = f"""
            <b>{tipo}</b><br>
            <b>Logradouro:</b> {logr}<br>
            <b>Órgão responsável:</b> <span style="color:{orgao_color}">{orgao}</span><br>
            <small>{obs}</small>
            """
            folium.Marker(
                location=[lat, lon],
                popup=folium.Popup(popup_html, max_width=280),
                tooltip=f"{tipo} — {orgao}",
                icon=folium.Icon(
                    color="white",
                    icon_color=orgao_color,
                    icon=icon_name,
                    prefix="fa",
                ),
            ).add_to(fator_cluster)

    # -----------------------------------------------------------------------
    # Camada 5: Câmeras
    # -----------------------------------------------------------------------
    if df_cameras is not None and not df_cameras.is_empty():
        camera_group = folium.FeatureGroup(name="Câmeras").add_to(m)
        for row in df_cameras.iter_rows(named=True):
            lat = row.get("latitude")
            lon = row.get("longitude")
            if lat is None or lon is None:
                continue
            try:
                lat, lon = float(lat), float(lon)
            except (TypeError, ValueError):
                continue
            folium.Marker(
                location=[lat, lon],
                tooltip="Câmera CIVITAS/COR",
                icon=folium.Icon(color="darkblue", icon="camera", prefix="fa"),
            ).add_to(camera_group)

    # -----------------------------------------------------------------------
    # Camada 6: Bingo Score (círculos por prioridade)
    # -----------------------------------------------------------------------
    if bingos:
        bingo_group = folium.FeatureGroup(name="Bingo Score").add_to(m)
        # Buscamos coords aproximadas dos logradouros a partir dos crimes
        logr_coords: dict[str, tuple[float, float]] = {}
        if df_crimes is not None and not df_crimes.is_empty():
            for row in (
                df_crimes.filter(pl.col("locf_norm").is_not_null())
                .group_by("locf_norm")
                .agg([pl.col("latitude").mean(), pl.col("longitude").mean()])
                .iter_rows(named=True)
            ):
                logr_coords[row["locf_norm"]] = (
                    float(row["latitude"]),
                    float(row["longitude"]),
                )

        for b in bingos:
            coords = logr_coords.get(b.logradouro_norm)
            if b.latitude and b.longitude:
                coords = (b.latitude, b.longitude)
            if coords is None:
                continue

            color = BINGO_COLORS.get(b.prioridade, "#888888")
            radius = 8 + b.score_total * 3  # maior raio = maior score

            explicacao_html = "<br>".join(f"• {ex}" for ex in b.explicacao)
            popup_html = f"""
            <b style="font-size:14px">{b.logradouro}</b><br>
            <b style="color:{color}">Score: {b.score_total}/10 — {b.prioridade}</b><br>
            <hr style="margin:4px 0">
            <table style="font-size:11px">
              <tr><td>Mancha Criminal:</td><td><b>{b.score_mancha}/4</b></td></tr>
              <tr><td>Fatores Urbanos:</td><td><b>{b.score_fatores}/3</b></td></tr>
              <tr><td>Disque Denúncia:</td><td><b>{b.score_dinamica}/2</b></td></tr>
              <tr><td>Câmera (ponto cego):</td><td><b>{b.score_camera}/1</b></td></tr>
            </table>
            <hr style="margin:4px 0">
            <b>Justificativas:</b><br>
            <small>{explicacao_html}</small>
            """
            folium.CircleMarker(
                location=list(coords),
                radius=radius,
                color=color,
                fill=True,
                fill_color=color,
                fill_opacity=0.6,
                popup=folium.Popup(popup_html, max_width=320),
                tooltip=f"[{b.score_total}/10] {b.logradouro} — {b.prioridade}",
            ).add_to(bingo_group)

    # Controle de camadas
    folium.LayerControl(collapsed=False).add_to(m)
    return m


def map_to_html(m: "folium.Map") -> str:
    """Retorna o mapa como HTML completo (para st.components.v1.html)."""
    return m.get_root().render()
