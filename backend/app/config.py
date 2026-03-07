from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

# Find root .env (one level up from backend/)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-native-audio-preview-12-2025"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8080
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Google Cloud
    gcp_project_id: str = ""
    gcp_region: str = "us-central1"
    firestore_collection: str = "sessions"
    enable_firestore: bool = False

    # Session
    max_sessions: int = 50
    session_timeout_seconds: int = 3600

    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"  


@lru_cache
def get_settings() -> Settings:
    return Settings()