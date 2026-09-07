"""
Central configuration for the trading engine, loaded from environment
variables (see .env.example). Never hard-code secrets here.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    engine_api_key: str = ""
    engine_host: str = "0.0.0.0"
    engine_port: int = 8088

    poll_interval_seconds: float = 5.0

    market_data_provider: str = "simulated"

    log_level: str = "INFO"


settings = Settings()
