"""Configuração centralizada do scrapper.

Lê credenciais e parâmetros de execução de variáveis de ambiente (`.env` na raiz).
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Settings carregadas de `.env` na raiz do projeto valente/."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Caminhos ---
    valente_data_dir: Path = Field(default=PROJECT_ROOT / "data")
    valente_accounts_file: Path = Field(default=PROJECT_ROOT / "accounts.txt")

    # --- Limites de execução ---
    valente_max_tweets_per_account: int = 400
    valente_rate_limit_sleep: float = 2.0
    valente_page_size: int = 40

    # --- Backfill histórico ---
    valente_since_date: date | None = Field(
        default=None,
        description="Para o scraper quando atingir tweets anteriores a esta data. "
                    "ISO YYYY-MM-DD. None = sem limite temporal.",
    )
    valente_backfill: bool = Field(
        default=False,
        description="Modo backfill: ignora detecção de 'caught up' e força paginação "
                    "até esgotar o cursor (ou bater em --since). Útil quando o JSONL "
                    "já contém os tweets recentes e queremos histórico mais antigo.",
    )
    valente_log_every_n_pages: int = 5

    @property
    def raw_dir(self) -> Path:
        return self.valente_data_dir / "raw"

    @property
    def state_dir(self) -> Path:
        return self.valente_data_dir / "state"

    @property
    def news_raw_dir(self) -> Path:
        # Mesma pasta consumida por valente_ontology/loaders/news.py
        return self.valente_data_dir / "news_raw"

    def ensure_dirs(self) -> None:
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
