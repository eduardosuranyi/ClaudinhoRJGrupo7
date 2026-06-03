"""
Configuração do módulo ontológico — lê do mesmo `.env` da raiz `valente/`.

Mantém separação do `valente_scraper.config`: o scraper só precisa de
caminhos do JSONL bruto; o módulo ontológico precisa do diretório CompStat
e da chave Anthropic. Cada módulo carrega o que usa.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent           # …/ClaudinhoRJGrupo7/valente
HACKATHON_ROOT = PROJECT_ROOT.parent.parent                      # …/dev/hackathon
DEFAULT_COMPSTAT_DIR = HACKATHON_ROOT / "claude_impact_lab_compstat_rio"


class OntologySettings(BaseSettings):
    """Settings do pipeline ontológico."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Caminhos ──────────────────────────────────────────────────────
    valente_data_dir: Path = Field(default=PROJECT_ROOT / "data")
    compstat_data_dir: Path = Field(
        default=DEFAULT_COMPSTAT_DIR,
        description="Pasta `claude_impact_lab_compstat_rio/` (CSVs + RELINTs + shapefile).",
    )

    # ── LLM ───────────────────────────────────────────────────────────
    anthropic_api_key: str | None = Field(default=None)
    anthropic_model: str = Field(default="claude-opus-4-7")
    llm_max_tokens: int = 2048
    llm_temperature: float = 0.0

    # ── Pipeline ──────────────────────────────────────────────────────
    enable_hybrid_disque: bool = Field(
        default=True,
        description="Quando Disque Denúncia tem relato_redacted, faz extração "
                    "estruturada + enriquece via LLM (modo HYBRID). Desligue para "
                    "rodar offline.",
    )

    # ── Derivados ─────────────────────────────────────────────────────

    @property
    def ontology_dir(self) -> Path:
        return self.valente_data_dir / "ontology"

    @property
    def crime_events_path(self) -> Path:
        return self.ontology_dir / "crime_events.jsonl"

    @property
    def fm_actions_path(self) -> Path:
        return self.valente_data_dir / "fm_actions" / "actions.jsonl"

    @property
    def news_raw_dir(self) -> Path:
        return self.valente_data_dir / "news_raw"

    @property
    def tweet_raw_dir(self) -> Path:
        return self.valente_data_dir / "raw"   # mesma pasta usada pelo scraper

    @property
    def classified_tweets_dir(self) -> Path:
        """Veredictos de relevância (1 arquivo/conta) — ver classified_store.py."""
        return self.valente_data_dir / "classified" / "tweets"

    # ── Paths CompStat ────────────────────────────────────────────────

    @property
    def ocorrencias_csv(self) -> Path:
        return self.compstat_data_dir / "dados" / "df_ocorrencias_tratado - Extração 1 .csv"

    @property
    def disque_denuncia_csv(self) -> Path:
        return self.compstat_data_dir / "dados" / "disk_denuncia.csv"

    @property
    def fatores_urbanos_csv(self) -> Path:
        return self.compstat_data_dir / "dados" / "fatores_urbanos.csv"

    @property
    def cameras_csv(self) -> Path:
        return self.compstat_data_dir / "dados" / "cameras_areas_fm.csv"

    @property
    def dominio_territorial_csv(self) -> Path:
        return self.compstat_data_dir / "dados" / "outros dados" / "dominio_territorial - Extração 1.csv"

    @property
    def relints_dir(self) -> Path:
        return self.compstat_data_dir / "relints"

    def ensure_dirs(self) -> None:
        self.ontology_dir.mkdir(parents=True, exist_ok=True)
        self.fm_actions_path.parent.mkdir(parents=True, exist_ok=True)


settings = OntologySettings()
