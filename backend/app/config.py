from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash-live-001"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8080
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    gcp_project_id: str = ""
    firestore_collection: str = "sessions"
    enable_firestore: bool = False

    max_sessions: int = 50
    session_timeout_seconds: int = 3600

    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()