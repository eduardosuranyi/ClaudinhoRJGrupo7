"""
Configurações globais e constantes do CompStat Rio.
"""

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent / ".env",
        env_file_encoding="utf-8",
    )

    ANTHROPIC_API_KEY: SecretStr = Field(...)


settings = Settings()

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent

OCORRENCIAS_PATH = BASE_DIR / "dados" / "df_ocorrencias_tratado - Extração 1 .csv"
DISK_DENUNCIA_PATH = BASE_DIR / "dados" / "disk_denuncia.csv"
FATORES_URBANOS_PATH = BASE_DIR / "dados" / "fatores_urbanos.csv"
CAMERAS_PATH = BASE_DIR / "dados" / "cameras_areas_fm.csv"
DOMINIO_PATH = (
    BASE_DIR / "dados" / "outros dados" / "dominio_territorial - Extração 1.csv"
)
CPSR_PATH = BASE_DIR / "dados" / "outros dados" / "CPSR_2020_2022_2024.xlsx"
FM_SHAPEFILE_PATH = BASE_DIR / "sh_area_forca" / "areas_forca_municipal.shp"
RELINTS_DIR = BASE_DIR / "relints"

# ---------------------------------------------------------------------------
# Mapeamento RELINT filename → nome_subar (igual ao shapefile e fatores_urbanos)
# ---------------------------------------------------------------------------
RELINT_AREA_MAP: dict[str, str] = {
    "RI_010": "Rodoviária - Terminal Gentileza - Estação Leopoldina",
    "RI_011": "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria",
    "RI_012": "Jardim de Alah",
    "RI_013": "Campo Grande: Estação de Trem - Calçadão",
    "RI_014": "Rio Sul",
    "RI_015": "Praia de Botafogo - Rua Marquês de Abrantes",
    "RI_016": "Estações São Francisco Xavier - Afonso Pena",
    "RI_017": "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
}

# As 8 áreas com shapefile definido (e RELINT disponível)
AREAS_COM_SHAPEFILE = list(RELINT_AREA_MAP.values())

# ---------------------------------------------------------------------------
# Bingo Score — pesos e thresholds
# ---------------------------------------------------------------------------
# Layer 1 — Mancha Criminal (0-4 pts)
# Layer 2 — Fatores Urbanos (0-3 pts)
# Layer 3 — Disque Denúncia Patrimônio (0-2 pts)
# Layer 4 — Ponto cego de câmera (0-1 pt)
# Total max: 10

BINGO_CRIME_THRESHOLDS = [0, 1, 6, 16, 30]  # limites inferiores de cada nível
BINGO_CRIME_SCORES = [0, 1, 2, 3, 4]

BINGO_FATOR_THRESHOLDS = [0, 1, 3, 5]
BINGO_FATOR_SCORES = [0, 1, 2, 3]

BINGO_DENUNCIA_THRESHOLDS = [0, 1, 4]
BINGO_DENUNCIA_SCORES = [0, 1, 2]

# Combos de fatores que amplificam o risco (flag narrativa, não adiciona pts extras)
COMBOS_ALTO_RISCO = [
    {
        "Vegetação encobrindo iluminação pública",
        "Área mal iluminada com circulação de pedestres",
    },
    {"Mobiliário abandonado servindo de esconderijo", "Pessoas em situação de rua"},
    {
        "Comércio irregular obstruindo a visibilidade do passeio",
        "Ponto de retenção do tráfego",
    },
]

# Classes do Disque Denúncia consideradas crimes contra o patrimônio
CLASSES_PATRIMONIO = {
    "CRIMES CONTRA O PATRIMÔNIO",
}

TIPOS_PATRIMONIO = {
    "ROUBO/FURTO A TRANSEUNTES",
    "SUSPEITA DE ROUBO/FURTO",
    "ROUBO A MOTORISTAS",
    "ROUBO EM TRANSP COLETIVOS",
    "FURTO",
    "ROUBO",
}

# ---------------------------------------------------------------------------
# Modelagem FM — texto de apoio para recomendações
# ---------------------------------------------------------------------------
MODALIDADE_FM = {
    "moto": "motocicleta — adequada para cobertura de vias largas e rotas de fuga veicular",
    "pe": "a pé — adequada para calçadões, áreas de grande fluxo pedonal e locais com furto oportunista",
    "viatura": "viatura — adequada para patrulhamento de perimetral e resposta rápida",
}

# Mapeamento fator → órgão responsável (conforme briefing)
FATOR_ORGAO: dict[str, str] = {
    "Vegetação encobrindo iluminação pública": "COMLURB",
    "Vegetação obstruindo a visibilidade do passeio": "COMLURB",
    "Lixo/entulho obstruindo a visibilidade": "COMLURB",
    "Lixo/entulho forçando pedestres à pista": "COMLURB",
    "Área mal iluminada com circulação de pedestres": "Rio Luz",
    "Área mal iluminada com parada de veículos": "Rio Luz",
    "Mobiliário urbano desviando pedestres para a pista": "SECONSERVA",
    "Calçada estreita forçando pedestres à pista": "SECONSERVA",
    "Mobiliário abandonado servindo de esconderijo": "SECONSERVA",
    "Tapumes servindo de esconderijo": "SECONSERVA",
    "Mobiliário/estrutura servindo de esconderijo": "SECONSERVA",
    "Vãos ou cavidades usados como esconderijo": "SECONSERVA",
    "Comércio irregular obstruindo a visibilidade do passeio": "SEOP",
    "Estacionamento irregular forçando pedestres à pista": "SEOP",
    "Veículos de grande porte obstruindo a visibilidade": "SEOP",
    "Ponto de retenção do tráfego": "CET-Rio",
    "Motocicletas trafegando no passeio": "GM-Rio",
    "Ponto de ônibus com histórico de vandalismo": "SMTR",
    "Pessoas em situação de rua": "SMAS",
    "Cena de uso de drogas": "SMAS",
    "Praças e Parques": "SECONSERVA",
}

# ---------------------------------------------------------------------------
# Claude API
# ---------------------------------------------------------------------------
CLAUDE_MODEL = "claude-opus-4-6"
CLAUDE_MAX_TOKENS = 4096
