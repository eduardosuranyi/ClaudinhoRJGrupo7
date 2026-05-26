import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def sample_crimes_df():
    """Synthetic crime DataFrame matching pipeline expected schema."""
    return pd.DataFrame({
        "latitude": [-22.9, -22.91, -22.92, -22.905, -22.91],
        "longitude": [-43.18, -43.17, -43.19, -43.18, -43.175],
        "data": ["01/01/2023", "15/03/2023", "22/06/2024", "10/10/2024", "05/12/2024"],
        "hora": ["14:30", "02:15", "20:00", "23:45", "06:00"],
        "hora_num": [14, 2, 20, 23, 6],
        "dia_semana": ["Segunda", "Quarta", "Sabado", "Quinta", "Terca"],
        "desc_delito": ["Roubo a transeunte", "Roubo de aparelho celular", "Roubo a transeunte", "Roubo em coletivo", "Roubo a transeunte"],
        "locf_norm": ["avenida presidente vargas", "rua uruguaiana", "avenida presidente vargas", "praca floriano", "rua uruguaiana"],
        "aisp": [5, 5, 5, 5, 5],
        "risp": [1, 1, 1, 1, 1],
        "locf": ["Avenida Presidente Vargas", "Rua Uruguaiana", "Avenida Presidente Vargas", "Praca Floriano", "Rua Uruguaiana"],
    })


@pytest.fixture
def sample_cameras_df():
    """Synthetic camera DataFrame."""
    return pd.DataFrame({
        "lat": [-22.9, -22.905],
        "lng": [-43.18, -43.175],
        "nome_area_fm": ["Test Area", "Test Area"],
    })


@pytest.fixture
def sample_fatores_df():
    """Synthetic urban factors DataFrame."""
    return pd.DataFrame({
        "latitude": [-22.9, -22.91],
        "longitude": [-43.18, -43.17],
        "tipo_ocorrencia_descricao": ["Vegetação encobrindo iluminação", "Calçada estreita"],
        "orgao_responsavel": ["Comlurb", "Seconserva"],
        "logradouro": ["Avenida Presidente Vargas", "Rua Uruguaiana"],
    })


@pytest.fixture
def sample_long_crimes_df():
    """36 months of crimes with a clear DOWNWARD trend (declining counts/month)."""
    rows = []
    start = pd.Timestamp("2022-01-01")
    for i in range(36):
        month = start + pd.DateOffset(months=i)
        n = max(1, 40 - i)  # 40, 39, ... declining
        for d in range(n):
            day = (d % 28) + 1
            rows.append({
                "data": f"{day:02d}/{month.month:02d}/{month.year}",
                "desc_delito": "Roubo a transeunte",
            })
    return pd.DataFrame(rows)


@pytest.fixture
def sample_short_crimes_df():
    """Only 3 months of data — too short for trend/seasonal."""
    return pd.DataFrame({
        "data": ["01/01/2024", "15/02/2024", "10/03/2024"],
        "desc_delito": ["Roubo a transeunte"] * 3,
    })


@pytest.fixture
def sample_dd_df():
    """Synthetic Disque Denuncia DataFrame."""
    return pd.DataFrame({
        "latitude": [-22.9, -22.91],
        "longitude": [-43.18, -43.17],
        "relato_redacted": [
            "Dois individuos de moto armados roubaram celular",
            "Grupo de menores caminhando a pe furtando",
        ],
        "tipo": ["ROUBO/FURTO A TRANSEUNTES", "FURTO"],
        "data_denuncia": ["2025-01-15", "2025-02-20"],
        "bairro_logradouro": ["CENTRO", "CENTRO"],
        "logradouro": ["PRESIDENTE VARGAS", "URUGUAIANA"],
    })
