"""
Extractor estruturado — sem LLM.

Aplica-se a fontes onde os campos da ontologia já podem ser preenchidos por
mapeamento direto:

  - Ocorrências oficiais: lat/lon, hora, ano, mes, desc_delito, logradouro.
  - Disque Denúncia: lat/lon, classe/tipo (vira crime_type), data,
    `envolvidos.sexo/idade/pele/estatura/porte/cabelos/olhos` → Agent.

Quando a fonte traz `raw_text` (relato), o pipeline pode (e deve) chamar o
LLM extractor depois para enriquecer os campos não preenchidos —
implementado em `pipeline.py` como modo HYBRID.
"""

from __future__ import annotations

from typing import Optional

from valente_ontology.enums import (
    AgeBracket,
    Build,
    CrimeType,
    DayPart,
    ExtractionMethod,
    Gender,
    HeightBracket,
    SkinTone,
    SourceKind,
)
from valente_ontology.entities import (
    Agent,
    EnvironmentalContext,
    SpatialContext,
    TemporalContext,
)
from valente_ontology.loaders.base import RawSource
from valente_ontology.ontology import (
    CrimeEvent,
    ExtractionMetadata,
    SourceMetadata,
)


name = "structured"


# Mapeamento desc_delito (ocorrências oficiais) → CrimeType.
# Lista derivada das categorias observadas em df_ocorrencias_tratado e disk_denuncia.
_DELITO_MAP: dict[str, CrimeType] = {
    "roubo a transeunte": CrimeType.ROUBO_TRANSEUNTE,
    "roubo de veiculo": CrimeType.ROUBO_VEICULO,
    "roubo de veículo": CrimeType.ROUBO_VEICULO,
    "roubo em coletivo": CrimeType.ROUBO_TRANSPORTE_COLETIVO,
    "roubo em transp coletivos": CrimeType.ROUBO_TRANSPORTE_COLETIVO,
    "roubo a estabelecimento": CrimeType.ROUBO_ESTABELECIMENTO,
    "roubo a residencia": CrimeType.ROUBO_RESIDENCIA,
    "roubo a residência": CrimeType.ROUBO_RESIDENCIA,
    "roubo de carga": CrimeType.ROUBO_CARGA,
    "furto a transeunte": CrimeType.FURTO,
    "furto de veiculo": CrimeType.FURTO_VEICULO,
    "furto de veículo": CrimeType.FURTO_VEICULO,
    "furto": CrimeType.FURTO,
    "sequestro relampago": CrimeType.SEQUESTRO_RELAMPAGO,
    "sequestro relâmpago": CrimeType.SEQUESTRO_RELAMPAGO,
}


def extract(source: RawSource) -> Optional[CrimeEvent]:
    """Materializa um CrimeEvent a partir dos campos tabulares.

    Pré-condição: `source.structured_fields` está populado.
    Pós-condição: campos não-determináveis ficam em DESCONHECIDO/None — a
    extração não inventa nada.
    """
    if source.kind == SourceKind.OCORRENCIA_OFICIAL:
        return _from_ocorrencia(source)
    if source.kind == SourceKind.DISQUE_DENUNCIA:
        return _from_disque_denuncia(source)
    # Outras fontes (tweet, RELINT, news, FM action) não são tabulares
    # canonicamente — usar o LLM extractor.
    return None


# ─────────────────────────────────────────────────────────────────────────
# Ocorrência oficial
# ─────────────────────────────────────────────────────────────────────────


def _from_ocorrencia(source: RawSource) -> CrimeEvent:
    f = source.structured_fields
    crime_type = _delito_to_crime_type(f.get("desc_delito"))

    temporal = TemporalContext(
        date_iso=source.hint_date_iso,
        hour_24=source.hint_hour_24,
        daypart=_hour_to_daypart(source.hint_hour_24),
    )
    spatial = SpatialContext(
        address_text=f.get("locf"),
        logradouro=f.get("locf"),
        latitude=source.hint_latitude,
        longitude=source.hint_longitude,
        aisp=f.get("aisp"),
    )

    return _wrap(
        source=source,
        crime_type=crime_type,
        temporal=temporal,
        spatial=spatial,
        environment=EnvironmentalContext(),
        agents=[],
        confidence=0.9,   # campos tabulares confiáveis, mas faltam muitos detalhes
        notes="Extração determinística de df_ocorrencias_tratado.",
    )


# ─────────────────────────────────────────────────────────────────────────
# Disque Denúncia
# ─────────────────────────────────────────────────────────────────────────


def _from_disque_denuncia(source: RawSource) -> CrimeEvent:
    f = source.structured_fields
    crime_type = _denuncia_to_crime_type(f.get("classe"), f.get("tipo"))

    temporal = TemporalContext(date_iso=source.hint_date_iso)
    spatial = SpatialContext(
        address_text=f"{f.get('logradouro') or ''} {f.get('numero_logradouro') or ''}".strip() or None,
        logradouro=f.get("logradouro"),
        altura=f.get("numero_logradouro"),
        bairro=f.get("bairro_logradouro"),
        latitude=source.hint_latitude,
        longitude=source.hint_longitude,
    )

    agents = []
    agent = _agent_from_envolvidos(f)
    if agent is not None:
        agents.append(agent)

    return _wrap(
        source=source,
        crime_type=crime_type,
        temporal=temporal,
        spatial=spatial,
        environment=EnvironmentalContext(),
        agents=agents,
        confidence=0.7,
        notes="Extração determinística do Disque Denúncia. Texto livre (relato) "
              "ainda pode ser enriquecido pelo LLM extractor em modo HYBRID.",
    )


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────


def _delito_to_crime_type(desc: Optional[str]) -> CrimeType:
    if not desc:
        return CrimeType.DESCONHECIDO
    key = desc.strip().lower()
    return _DELITO_MAP.get(key, CrimeType.OUTRO)


def _denuncia_to_crime_type(classe: Optional[str], tipo: Optional[str]) -> CrimeType:
    if not classe and not tipo:
        return CrimeType.DESCONHECIDO
    blob = f"{(classe or '').lower()} {(tipo or '').lower()}"
    if "patrim" in blob or "roubo" in blob or "furto" in blob:
        if "transeunte" in blob:
            return CrimeType.ROUBO_TRANSEUNTE
        if "motoris" in blob or "veicul" in blob:
            return CrimeType.ROUBO_VEICULO
        if "coletiv" in blob or "transp" in blob:
            return CrimeType.ROUBO_TRANSPORTE_COLETIVO
        return CrimeType.OUTRO
    if "entorpec" in blob or "drog" in blob:
        return CrimeType.OUTRO   # ontologia foca em patrimônio — droga é outro escopo
    return CrimeType.DESCONHECIDO


def _hour_to_daypart(hour: Optional[int]) -> DayPart:
    if hour is None:
        return DayPart.DESCONHECIDO
    if 0 <= hour < 5:
        return DayPart.MADRUGADA
    if 5 <= hour < 7:
        return DayPart.AMANHECER
    if 7 <= hour < 12:
        return DayPart.MANHA
    if 12 <= hour < 17:
        return DayPart.TARDE
    if 17 <= hour < 19:
        return DayPart.ENTARDECER
    return DayPart.NOITE


def _agent_from_envolvidos(f: dict) -> Optional[Agent]:
    """Disque Denúncia tem campos `envolvidos.*` que mapeiam direto pra Agent."""
    sexo = f.get("envolvidos.sexo")
    idade = f.get("envolvidos.idade")
    pele = f.get("envolvidos.pele")
    estatura = f.get("envolvidos.estatura")
    porte = f.get("envolvidos.porte")
    outras = f.get("envolvidos.outras_caracteristicas")
    if not any([sexo, idade, pele, estatura, porte, outras]):
        return None
    return Agent(
        estimated_age=_age_to_bracket(idade),
        height=_estatura_to_height(estatura),
        build=_porte_to_build(porte),
        skin_tone=_pele_to_skin(pele),
        distinctive_marks_text=outras or None,
    )


def _age_to_bracket(s: Optional[str]) -> AgeBracket:
    if not s:
        return AgeBracket.DESCONHECIDO
    s = str(s).strip().lower()
    if any(t in s for t in ("crianc", "menor")):
        return AgeBracket.CRIANCA
    if any(t in s for t in ("adolesc", "jovem")):
        return AgeBracket.ADOLESCENTE if "adolesc" in s else AgeBracket.JOVEM
    if "idos" in s:
        return AgeBracket.IDOSO
    try:
        n = int(float(s))
        if n < 12:
            return AgeBracket.CRIANCA
        if n < 18:
            return AgeBracket.ADOLESCENTE
        if n < 30:
            return AgeBracket.JOVEM
        if n < 60:
            return AgeBracket.ADULTO
        return AgeBracket.IDOSO
    except (TypeError, ValueError):
        return AgeBracket.DESCONHECIDO


def _estatura_to_height(s: Optional[str]) -> HeightBracket:
    if not s:
        return HeightBracket.DESCONHECIDA
    s = s.lower()
    if "baix" in s:
        return HeightBracket.BAIXA
    if "alt" in s:
        return HeightBracket.ALTA
    if "media" in s or "média" in s or "med" in s:
        return HeightBracket.MEDIA
    return HeightBracket.DESCONHECIDA


def _porte_to_build(s: Optional[str]) -> Build:
    if not s:
        return Build.DESCONHECIDO
    s = s.lower()
    if "magr" in s:
        return Build.MAGRO
    if "fort" in s or "atlet" in s:
        return Build.FORTE
    if "obes" in s or "gord" in s:
        return Build.OBESO
    if "medi" in s or "média" in s:
        return Build.MEDIO
    return Build.DESCONHECIDO


def _pele_to_skin(s: Optional[str]) -> SkinTone:
    if not s:
        return SkinTone.DESCONHECIDA
    s = s.lower()
    if "branc" in s:
        return SkinTone.BRANCA
    if "pard" in s or "morena" in s:
        return SkinTone.PARDA
    if "pret" in s or "negr" in s:
        return SkinTone.PRETA
    if "amarel" in s:
        return SkinTone.AMARELA
    if "indig" in s:
        return SkinTone.INDIGENA
    return SkinTone.DESCONHECIDA


def _wrap(
    *,
    source: RawSource,
    crime_type: CrimeType,
    temporal: TemporalContext,
    spatial: SpatialContext,
    environment: EnvironmentalContext,
    agents: list,
    confidence: float,
    notes: str,
) -> CrimeEvent:
    return CrimeEvent(
        event_id=CrimeEvent.make_event_id(source.kind, source.source_id),
        crime_type=crime_type,
        temporal=temporal,
        spatial=spatial,
        environment=environment,
        agents=agents,
        source=SourceMetadata(
            kind=source.kind,
            source_id=source.source_id,
            source_file=source.source_file,
            raw_text=source.raw_text,
            reliability=source.reliability,
        ),
        extraction=ExtractionMetadata(
            method=ExtractionMethod.STRUCTURED_MAPPER,
            confidence=confidence,
            notes=notes,
        ),
    )
