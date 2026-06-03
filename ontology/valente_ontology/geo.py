"""
Lookup espacial — point-in-polygon contra os polígonos das áreas FM.

Usado pelos loaders/extractors para preencher `spatial.area_fm` a partir
de (latitude, longitude). Sem essa enrichment, eventos extraídos
puramente das tabelas (ocorrências oficiais, disque denúncia) caem em
`area_fm = None` e o agregador do score colapsa tudo em "DESCONHECIDA".

Fonte do GeoJSON, em ordem de preferência:
  1. `eduardo/data/clean/fm_areas.geojson`   ← derivação já no repo
  2. `<compstat_data_dir>/sh_area_forca/areas_forca_municipal.shp` (TODO)

A primeira é parseável com stdlib (json) + shapely; a segunda exigiria
pyshp. Por ora, só a primeira é necessária — o pipeline assume que o
bundle do eduardo está disponível.

Cache: o resultado de `load_fm_polygons()` é memoizado por path. Os
polígonos passam por `shapely.prepared.prep()` para tornar o
`contains()` rápido em loops de >100k chamadas.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.prepared import PreparedGeometry, prep


log = logging.getLogger("valente_ontology.geo")


# Caminho default — repo-local, alinhado ao bundle do eduardo.
_THIS = Path(__file__).resolve()
_REPO_ROOT = _THIS.parent.parent.parent      # …/ClaudinhoRJGrupo7
DEFAULT_FM_GEOJSON = _REPO_ROOT / "eduardo" / "data" / "clean" / "fm_areas.geojson"


class FMAreaIndex:
    """Índice geo-espacial das 8 áreas FM. Imutável após `__init__`."""

    def __init__(self, geometries: dict[str, BaseGeometry]):
        self._raw = geometries
        self._prepared: dict[str, PreparedGeometry] = {
            name: prep(geom) for name, geom in geometries.items()
        }

    @property
    def names(self) -> list[str]:
        return sorted(self._raw.keys())

    def find(self, lat: Optional[float], lon: Optional[float]) -> Optional[str]:
        """Devolve o nome da área que contém o ponto, ou None.

        Aceita coordenadas None ou fora do bounding box da cidade
        (retorna None silenciosamente — não é erro).
        """
        if lat is None or lon is None:
            return None
        # bbox grosseiro do RJ (descarta ruído rápido)
        if not (-23.2 <= lat <= -22.6 and -43.9 <= lon <= -43.0):
            return None
        pt = Point(lon, lat)
        for name, geom in self._prepared.items():
            if geom.contains(pt):
                return name
        return None


@lru_cache(maxsize=4)
def load_fm_polygons(geojson_path: Optional[Path] = None) -> Optional[FMAreaIndex]:
    """Carrega os polígonos do GeoJSON. Cache por path.

    Returns:
        FMAreaIndex pronto pra consulta, ou None se o GeoJSON não existir.
        Callers DEVEM tratar None — pipeline ainda funciona (apenas sem
        enrichment de area_fm).
    """
    path = Path(geojson_path) if geojson_path else DEFAULT_FM_GEOJSON
    if not path.exists():
        log.warning("GeoJSON de áreas FM não encontrado: %s", path)
        return None

    try:
        gj = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        log.error("Falha ao ler GeoJSON: %s — %s", path, e)
        return None

    geoms: dict[str, BaseGeometry] = {}
    for feat in gj.get("features", []):
        props = feat.get("properties") or {}
        name = props.get("nome_subar") or props.get("nome") or props.get("name")
        if not name:
            continue
        try:
            geoms[str(name)] = shape(feat["geometry"])
        except Exception as e:
            log.warning("Polígono inválido para %r: %s", name, e)
            continue

    if not geoms:
        log.warning("GeoJSON sem polígonos válidos: %s", path)
        return None
    log.info("FM polygons carregados: %d áreas", len(geoms))
    return FMAreaIndex(geoms)


def find_area_fm(
    lat: Optional[float],
    lon: Optional[float],
    *,
    geojson_path: Optional[Path] = None,
) -> Optional[str]:
    """Helper de conveniência — equivale a `load_fm_polygons().find(...)`
    com fallback gracioso se o índice não existir."""
    idx = load_fm_polygons(geojson_path)
    if idx is None:
        return None
    return idx.find(lat, lon)
