"""Configuration for the ingest service."""
from __future__ import annotations
import os
from pydantic import BaseModel, Field

class Settings(BaseModel):
    """Runtime settings sourced from environment variables."""
    tavily_api_key: str | None = Field(default=None, alias="TAVILY_API_KEY")
    log_level: str = Field(default=os.getenv("LOG_LEVEL", "INFO"))
    cron: str = Field(default=os.getenv("INGEST_CRON", "0 */6 * * *"))  # every 6 hours
    timeout_s: int = Field(default=int(os.getenv("HTTP_TIMEOUT_S", "20")))
    region: str = Field(default=os.getenv("INGEST_REGION", "dach"))  # dach | eu | all
    out_dir: str = Field(default=os.getenv("OUT_DIR", "/app/data"))

def load_settings() -> Settings:
    return Settings()
