"""
Entidades subordinadas da ontologia criminal.

Um `CrimeEvent` (definido em `ontology.py`) é a composição destas entidades.
Cada uma representa uma faceta independente do evento:

    Quem foi alvo?      → Victim
    Quem agiu?          → Agent
    Como chegou/fugiu?  → Vehicle (com VehicleRole)
    Com o quê?          → Weapon
    O que foi levado?   → StolenItem
    Quando?             → TemporalContext
    Onde?               → SpatialContext
    Sob que condições?  → EnvironmentalContext
    Como começou?       → ApproachMode
    Como terminou?      → EscapeMode + Outcome

Regras de modelagem:

  - Todo campo "inferido pelo LLM" tem contraparte em enum fechado
    (vide `enums.py`). Texto livre só sobrevive em campos `*_text`
    explicitamente marcados — para que a comparação entre eventos
    se faça pelos enums, não pelo texto.
  - Listas vazias representam "ausência confirmada".
    `None` representa "desconhecido / não consta no relato".
    Este contrato é importante para o score downstream.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from valente_ontology.enums import (
    AgeBracket,
    ApproachType,
    Build,
    CrimeOutcomeStatus,
    DayPart,
    EscapeType,
    Gender,
    HeightBracket,
    LightingLevel,
    MOTactic,
    PatrolPresence,
    SkinTone,
    StolenItemType,
    TrafficLevel,
    UrbanFactorTag,
    VehicleRole,
    VehicleType,
    VenueType,
    VictimReaction,
    WeaponType,
    WeekdayBracket,
)


class _Base(BaseModel):
    """Base config — Pydantic v2 strict-ish; aceita enum por valor string."""

    model_config = ConfigDict(
        extra="forbid",
        use_enum_values=False,
        validate_assignment=True,
    )


# ─────────────────────────────────────────────────────────────────────────
# Vítimas
# ─────────────────────────────────────────────────────────────────────────


class Victim(_Base):
    """Uma vítima. Vários eventos terão `victims=[]` quando o relato não
    individualiza (ex.: arrastão em ônibus com 30 pessoas) — nesse caso
    use `victim_count_total` no CrimeEvent."""

    gender: Gender = Gender.DESCONHECIDO
    age_bracket: AgeBracket = AgeBracket.DESCONHECIDO
    age_estimated: Optional[int] = Field(
        default=None,
        description="Idade estimada em anos, quando o texto traz número específico.",
    )
    exposed_item_before: Optional[bool] = Field(
        default=None,
        description="Vítima estava com item à mostra (celular na mão, joia visível, "
                    "bolsa aberta) imediatamente antes da abordagem?",
    )
    item_exposed_text: Optional[str] = Field(
        default=None,
        description="Texto curto sobre o item exposto (ex.: 'celular na mão usando GPS').",
    )
    reaction: VictimReaction = VictimReaction.DESCONHECIDA
    injured: Optional[bool] = None
    killed: Optional[bool] = None
    occupation_text: Optional[str] = Field(
        default=None,
        description="Profissão/ocupação se mencionada (entregador, motorista de app, "
                    "turista, etc.). Útil para perfilamento de vitimização.",
    )


# ─────────────────────────────────────────────────────────────────────────
# Agentes (autores)
# ─────────────────────────────────────────────────────────────────────────


class Agent(_Base):
    """Um agente (autor). Quando o relato traz 'dois bandidos numa moto'
    sem distinguir, registre dois `Agent` com os campos compartilhados
    repetidos (idade aprox., vestimenta de moto) e os distintos em branco."""

    estimated_age: AgeBracket = AgeBracket.DESCONHECIDO
    height: HeightBracket = HeightBracket.DESCONHECIDA
    build: Build = Build.DESCONHECIDO
    skin_tone: SkinTone = SkinTone.DESCONHECIDA
    clothing_text: Optional[str] = Field(
        default=None,
        description="Descrição livre da vestimenta (ex.: 'bermuda preta, regata branca, "
                    "boné da Lacoste'). Texto-fonte preservado para investigação.",
    )
    accessories: list[str] = Field(
        default_factory=list,
        description="Lista curta de acessórios marcantes: capacete, máscara, boné, "
                    "óculos, mochila, luvas, etc.",
    )
    distinctive_marks_text: Optional[str] = Field(
        default=None,
        description="Tatuagem, cicatriz, deficiência visível, vulgo, sinais únicos.",
    )
    role_text: Optional[str] = Field(
        default=None,
        description="Papel no evento (executor, motorista, batedor, receptador). "
                    "Texto livre pq nem sempre o relato cabe nos enums de MO.",
    )


# ─────────────────────────────────────────────────────────────────────────
# Veículos
# ─────────────────────────────────────────────────────────────────────────


class Vehicle(_Base):
    """Veículo usado pelo agente. `VehicleRole=ALVO` indica que o próprio
    veículo foi roubado/furtado (ex.: roubo de moto) — nesse caso a moto
    pertencia à vítima, não ao agente."""

    type: VehicleType = VehicleType.DESCONHECIDO
    role: VehicleRole = VehicleRole.DESCONHECIDO
    plate_visible: Optional[bool] = None
    plate_text: Optional[str] = Field(
        default=None,
        description="Placa total ou parcial se mencionada.",
    )
    color: Optional[str] = None
    brand_model_text: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────
# Armas
# ─────────────────────────────────────────────────────────────────────────


class Weapon(_Base):
    type: WeaponType = WeaponType.DESCONHECIDA
    brandished: bool = Field(
        default=False,
        description="Foi apenas mostrada/empunhada (sem disparo/golpe efetivo)?",
    )
    used: bool = Field(
        default=False,
        description="Foi efetivamente usada (disparou, golpeou, atingiu)?",
    )
    description_text: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────
# Itens roubados/furtados
# ─────────────────────────────────────────────────────────────────────────


class StolenItem(_Base):
    type: StolenItemType = StolenItemType.DESCONHECIDO
    quantity: int = 1
    description_text: Optional[str] = Field(
        default=None,
        description="Detalhe livre (marca, modelo, valor estimado).",
    )
    recovered: Optional[bool] = None


# ─────────────────────────────────────────────────────────────────────────
# Tempo
# ─────────────────────────────────────────────────────────────────────────


class TemporalContext(_Base):
    """Quando o evento aconteceu. Sempre que possível preencha tanto
    `date_iso`/`hour_24` quanto `daypart`/`weekday_bracket` — eles permitem
    queries diferentes a jusante."""

    date_iso: Optional[str] = Field(
        default=None,
        description="Data ISO 8601 (YYYY-MM-DD) se conhecida.",
    )
    hour_24: Optional[int] = Field(
        default=None,
        ge=0,
        le=23,
        description="Hora exata (0–23) se conhecida.",
    )
    daypart: DayPart = DayPart.DESCONHECIDO
    weekday_bracket: WeekdayBracket = WeekdayBracket.DESCONHECIDO
    is_peak_hour: Optional[bool] = Field(
        default=None,
        description="Coincidiu com horário de pico de movimentação da via?",
    )
    coincides_with_patrol_change: Optional[bool] = Field(
        default=None,
        description="Coincidiu com troca/saída de patrulha (janela operacional)?",
    )


# ─────────────────────────────────────────────────────────────────────────
# Local
# ─────────────────────────────────────────────────────────────────────────


class SpatialContext(_Base):
    """Onde o evento ocorreu. `address_text` é o texto-fonte; os demais
    campos são extraídos/geocodificados a jusante (ainda que parcialmente)."""

    address_text: Optional[str] = Field(
        default=None,
        description="Endereço como aparece no texto-fonte (sem normalização).",
    )
    logradouro: Optional[str] = Field(
        default=None,
        description="Nome do logradouro normalizado (compatível com a normalização "
                    "do luiz/pipeline para fazer cross-join).",
    )
    altura: Optional[str] = Field(
        default=None,
        description="Número/altura do logradouro (string para preservar '500-A', 's/n').",
    )
    bairro: Optional[str] = None
    area_fm: Optional[str] = Field(
        default=None,
        description="Nome da subárea da Força Municipal (igual ao `nome_subar` do "
                    "shapefile) quando aplicável.",
    )
    aisp: Optional[str] = Field(default=None, description="Área Integrada da PMERJ.")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    venue: VenueType = VenueType.DESCONHECIDO
    transport_line_text: Optional[str] = Field(
        default=None,
        description="Linha/estação específica quando venue é transporte coletivo "
                    "(ex.: 'Estação Central', 'BRT TransBrasil', 'linha 485').",
    )


# ─────────────────────────────────────────────────────────────────────────
# Ambiente
# ─────────────────────────────────────────────────────────────────────────


class EnvironmentalContext(_Base):
    """Condições urbanas no momento do evento. Estes campos são o que liga
    a ontologia ao catálogo de fatores urbanos da FM (`fatores_urbanos.csv`)."""

    urban_factors: list[UrbanFactorTag] = Field(
        default_factory=list,
        description="Fatores estruturais presentes (lista vazia = "
                    "nenhum identificado / texto não informa).",
    )
    foot_traffic: TrafficLevel = TrafficLevel.DESCONHECIDO
    vehicle_traffic: TrafficLevel = TrafficLevel.DESCONHECIDO
    lighting: LightingLevel = LightingLevel.DESCONHECIDA
    patrol_presence: PatrolPresence = PatrolPresence.DESCONHECIDA
    camera_present: Optional[bool] = None
    extra_notes_text: Optional[str] = Field(
        default=None,
        description="Observações ambientais não-catalogadas (chuva, queda de energia "
                    "no bairro, evento esportivo, manifestação).",
    )


# ─────────────────────────────────────────────────────────────────────────
# Abordagem / Fuga
# ─────────────────────────────────────────────────────────────────────────


class ApproachMode(_Base):
    type: ApproachType = ApproachType.DESCONHECIDA
    description_text: Optional[str] = Field(
        default=None,
        description="Como exatamente o agente iniciou a ação (texto-fonte sintetizado).",
    )


class EscapeMode(_Base):
    type: EscapeType = EscapeType.DESCONHECIDA
    direction_text: Optional[str] = Field(
        default=None,
        description="Direção/sentido da fuga ('sentido centro', 'em direção à favela X').",
    )
    description_text: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────
# Desfecho
# ─────────────────────────────────────────────────────────────────────────


class Outcome(_Base):
    status: CrimeOutcomeStatus = CrimeOutcomeStatus.DESCONHECIDO
    victim_escaped: Optional[bool] = None
    victim_reacted: Optional[bool] = None
    agent_neutralized: Optional[bool] = None
    third_party_intervention: Optional[bool] = Field(
        default=None,
        description="Houve intervenção de terceiros (transeunte, segurança, "
                    "policial fora de serviço)?",
    )
    injuries_text: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────
# MO — tags soltas que se aplicam ao evento como um todo
# ─────────────────────────────────────────────────────────────────────────


class ModusOperandi(_Base):
    """Conjunto de táticas observadas no evento. Multi-tag: um arrastão
    em ônibus pode ter [AMEACA_VERBAL, AMEACA_ARMA_FOGO, ARRASTAO, FURTO_DISCRETO]
    simultaneamente."""

    tactics: list[MOTactic] = Field(default_factory=list)
    summary_text: Optional[str] = Field(
        default=None,
        description="Resumo de 1–2 linhas do modus em linguagem natural — útil para "
                    "humanos lerem listas de eventos.",
    )
