"""
Pesos do score ontológico — todas as constantes calibráveis em um lugar.

Importante: estes valores são uma **calibragem v0**. A intenção é que sejam
ajustados a partir de:
  1. Feedback empírico do CompStat (qual área pontuou alto e gerou ação efetiva?).
  2. Aprendizado supervisionado leve usando o histórico de `FMAction`.

Cada bloco abaixo tem comentários explicando a intuição. Mude valores aqui
*sem* tocar em `score.py` — a fórmula é estável; a calibragem evolui.
"""

from __future__ import annotations

from valente_ontology.enums import (
    AgeBracket,
    ApproachType,
    CrimeOutcomeStatus,
    CrimeType,
    DayPart,
    EscapeType,
    MOTactic,
    StolenItemType,
    UrbanFactorTag,
    WeaponType,
)


# ─────────────────────────────────────────────────────────────────────────
# CAMADA A — Severidade por evento (S_event)
# ─────────────────────────────────────────────────────────────────────────

# Crime type base (0–25). Reflete impacto social + complexidade investigativa.
CRIME_TYPE_WEIGHT: dict[CrimeType, float] = {
    CrimeType.SEQUESTRO_RELAMPAGO: 25,
    CrimeType.ROUBO_RESIDENCIA: 22,
    CrimeType.ROUBO_CARGA: 20,
    CrimeType.ROUBO_TRANSPORTE_COLETIVO: 18,
    CrimeType.ROUBO_VEICULO: 16,
    CrimeType.ROUBO_INTERIOR_VEICULO: 14,
    CrimeType.ROUBO_ESTABELECIMENTO: 14,
    CrimeType.ROUBO_TRANSEUNTE: 12,
    CrimeType.FURTO_VEICULO: 10,
    CrimeType.GOLPE_FRAUDE: 8,
    CrimeType.FURTO: 6,
    CrimeType.OUTRO: 5,
    CrimeType.DESCONHECIDO: 4,
}

# Arma — pontuação maior quando a arma foi *usada*, não só exibida.
# Tupla (peso_apenas_exibida, peso_usada).
WEAPON_WEIGHT: dict[WeaponType, tuple[float, float]] = {
    WeaponType.ARMA_FOGO: (14, 20),
    WeaponType.ARMA_BRANCA: (8, 12),
    WeaponType.OBJETO_CONTUNDENTE: (4, 8),
    WeaponType.SIMULACRO: (6, 6),     # impacto idêntico — a vítima não distingue
    WeaponType.QUIMICO: (5, 10),
    WeaponType.FORCA_FISICA: (0, 4),
    WeaponType.OUTRA: (3, 5),
    WeaponType.NENHUMA: (0, 0),
    WeaponType.DESCONHECIDA: (0, 0),
}
WEAPON_CAP = 20.0

# Modus operandi — soma com cap. Reflete violência efetiva (não só ameaça).
MO_WEIGHT: dict[MOTactic, float] = {
    MOTactic.DISPARO_ARMA_FOGO: 15,
    MOTactic.FACADA: 12,
    MOTactic.CORONHADA: 8,
    MOTactic.FERIMENTO_GRAVE: 12,
    MOTactic.FERIMENTO_LEVE: 5,
    MOTactic.AGRESSAO_FISICA: 6,
    MOTactic.COMBATE_FISICO: 5,
    MOTactic.ARRASTAO: 5,
    MOTactic.PERSEGUICAO: 3,
    MOTactic.AMEACA_ARMA_FOGO: 4,
    MOTactic.AMEACA_ARMA_BRANCA: 3,
    MOTactic.AMEACA_VERBAL: 2,
    MOTactic.GOLPE_BANCARIO: 4,
    MOTactic.GOLPE_ENGENHARIA_SOCIAL: 3,
    MOTactic.FURTO_DISCRETO: 1,
    MOTactic.RECEPTACAO: 1,
    MOTactic.OUTRO: 1,
}
MO_CAP = 15.0

# Vulnerabilidade da vítima — soma com cap.
VICTIM_AGE_WEIGHT: dict[AgeBracket, float] = {
    AgeBracket.CRIANCA: 5,
    AgeBracket.IDOSO: 5,
    AgeBracket.ADOLESCENTE: 2,
    AgeBracket.JOVEM: 0,
    AgeBracket.ADULTO: 0,
    AgeBracket.DESCONHECIDO: 0,
}
EXPOSED_ITEM_WEIGHT = 2.0       # por vítima que estava com item à mostra
INJURED_WEIGHT = 5.0            # por vítima ferida
KILLED_FLOOR = 10.0             # se houve vítima morta, mínimo 10 pts nesta camada
VICTIM_CAP = 10.0

# Desfecho — incentiva sinalizar tentativa fracassada vs. consumada.
OUTCOME_WEIGHT: dict[CrimeOutcomeStatus, float] = {
    CrimeOutcomeStatus.CONSUMADO: 10,
    CrimeOutcomeStatus.TENTATIVA_FRACASSADA: 4,
    CrimeOutcomeStatus.INTERROMPIDO_POR_TERCEIROS: 3,
    CrimeOutcomeStatus.AGENTE_PRESO_EM_FLAGRANTE: 0,
    CrimeOutcomeStatus.AGENTE_NEUTRALIZADO: 0,
    CrimeOutcomeStatus.DESCONHECIDO: 5,
}
OUTCOME_CAP = 10.0

# Organização do agente — multi-agente / fuga estruturada amplifica.
ORG_MULTI_AGENT_WEIGHT = 4.0           # se agent_count_total ≥ 2
ORG_ESCAPE_STRUCTURED: dict[EscapeType, float] = {
    EscapeType.VEICULO_ALTA_VELOCIDADE: 3,
    EscapeType.ENTROU_EM_COMUNIDADE: 3,
    EscapeType.PULOU_MURO: 2,
    EscapeType.ENTROU_NA_MATA: 2,
    EscapeType.TRANSPORTE_COLETIVO: 1,
    EscapeType.VEICULO_DISCRETO: 1,
}
ORG_APPROACH_STRUCTURED: dict[ApproachType, float] = {
    ApproachType.CERCO: 3,
    ApproachType.SEQUESTRO_RELAMPAGO: 3,
    ApproachType.ARRASTAO: 2,
}
ORG_CAP = 10.0

# Item de alto impacto.
ITEM_WEIGHT: dict[StolenItemType, float] = {
    StolenItemType.CONTA_BANCARIA_ACESSADA: 10,
    StolenItemType.CELULAR_DESBLOQUEADO: 6,
    StolenItemType.CARRO: 5,
    StolenItemType.MOTO: 5,
    StolenItemType.MERCADORIA_COMERCIAL: 4,
    StolenItemType.NOTEBOOK: 3,
    StolenItemType.DOCUMENTOS: 3,
    StolenItemType.RELOGIO: 2,
    StolenItemType.CORDAO_JOIA: 2,
    StolenItemType.CARTAO_BANCARIO: 2,
    StolenItemType.BOLSA_MOCHILA: 1,
    StolenItemType.CELULAR: 1,
    StolenItemType.DINHEIRO_ESPECIE: 1,
    StolenItemType.OUTRO: 1,
    StolenItemType.DESCONHECIDO: 0,
    StolenItemType.CHAVES: 0,
    StolenItemType.BICICLETA: 1,
    StolenItemType.ROUPAS_TENIS: 1,
}
ITEM_CAP = 10.0

# Floor mínimo do S_event — todo evento existente vale pelo menos isso,
# evitando que falta de detalhes vire score zero.
EVENT_FLOOR = 5.0
EVENT_CEIL = 100.0


# ─────────────────────────────────────────────────────────────────────────
# CAMADA B — Agregação espacial (S_loc)
# ─────────────────────────────────────────────────────────────────────────

# S_loc = α·log10(1 + Σ S_event)·10 + β·(top3_médio/100)·30 + γ·(1 - Gini horário)
AGG_ALPHA = 3.5      # peso da soma logarítmica (volume)
AGG_BETA = 1.0       # peso do top-3 (gravidade extrema)
AGG_GAMMA = 10.0     # peso da concentração temporal (padrão = grupo organizado)
AGG_CEIL = 100.0


# ─────────────────────────────────────────────────────────────────────────
# CAMADA C — Multiplicador ambiental (M_env)
# ─────────────────────────────────────────────────────────────────────────

# Combos de fatores urbanos que se amplificam.
# Cada tupla = (frozenset de fatores, multiplicador).
ENV_COMBOS: list[tuple[frozenset[UrbanFactorTag], float]] = [
    (
        frozenset({
            UrbanFactorTag.ILUMINACAO_DEFICIENTE,
            UrbanFactorTag.VEGETACAO_COBRINDO_ILUMINACAO,
        }),
        1.15,
    ),
    (
        frozenset({
            UrbanFactorTag.MOBILIARIO_ABANDONADO,
            UrbanFactorTag.PESSOAS_EM_SITUACAO_RUA,
        }),
        1.10,
    ),
    (
        frozenset({
            UrbanFactorTag.COMERCIO_IRREGULAR,
            UrbanFactorTag.PONTO_RETENCAO_TRAFEGO,
        }),
        1.10,
    ),
    (
        frozenset({
            UrbanFactorTag.TAPUME_VAO_ESCONDERIJO,
            UrbanFactorTag.CALCADA_ESTREITA,
        }),
        1.08,
    ),
]

# Multiplicadores pontuais (não combo).
ENV_CAMERA_BLIND_SPOT = 1.20            # camera_present=False E score já alto
ENV_CAMERA_BLIND_THRESHOLD = 30.0       # só dispara se S_loc ≥ 30
ENV_PATROL_GAP_FRACTION = 0.30          # ≥30% eventos com recem_retirada
ENV_PATROL_GAP_MULT = 1.25
ENV_GOOD_COVERAGE_MULT = 0.85           # câmera + iluminação adequada

ENV_MULT_FLOOR = 0.80
ENV_MULT_CEIL = 1.50


# ─────────────────────────────────────────────────────────────────────────
# CAMADA D — Peso da fonte (W_src)
# ─────────────────────────────────────────────────────────────────────────

# Multiplicador da diversidade de fontes corroborando o local.
# n_kinds = número distinto de SourceKind cobrindo o logradouro/área.
SRC_DIVERSITY_MULT: dict[int, float] = {
    1: 0.85,    # 1 fonte só (sobretudo se for só tweet/notícia) → rebaixa
    2: 1.00,
    3: 1.10,
    4: 1.20,
    5: 1.20,
}
SRC_MULT_FLOOR = 0.70
SRC_MULT_CEIL = 1.20


# ─────────────────────────────────────────────────────────────────────────
# CAMADA E — Ajuste de feedback (Δ_fb)
# ─────────────────────────────────────────────────────────────────────────

FB_SUCCESS_DROP_THRESHOLD = 0.30     # queda ≥30% do score pós-ação
FB_SUCCESS_DELTA = -15.0             # alívio do score quando ação funcionou
FB_DISPLACEMENT_THRESHOLD = 0.10     # queda <10% E vizinho subiu
FB_DISPLACEMENT_DELTA = +8.0         # penaliza migração (atenção redobrada)
FB_INEFFECTIVE_DELTA = 0.0           # ação sem efeito mensurável — mantém

FB_FLOOR = -20.0
FB_CEIL = +10.0


# ─────────────────────────────────────────────────────────────────────────
# Cortes finais de prioridade
# ─────────────────────────────────────────────────────────────────────────

PRIORITY_CUTS = [
    (80, "CRITICA"),
    (60, "ALTA"),
    (35, "MEDIA"),
    (0, "BAIXA"),
]


def priority_for(score: float) -> str:
    for cut, label in PRIORITY_CUTS:
        if score >= cut:
            return label
    return "BAIXA"
