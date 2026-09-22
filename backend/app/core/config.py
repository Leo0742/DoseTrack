from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    environment: str = "development"
    app_name: str = "DoseTrack"
    database_url: str = "sqlite:///./dosetrack.db"
    frontend_url: str = "http://localhost:3000"
    public_base_url: str = "http://localhost:8000"
    session_cookie_name: str = "dosetrack_session"
    session_days: int = 30
    secure_cookies: bool = False
    upload_dir: Path = Path("./data/uploads")
    thumbnail_dir: Path = Path("./data/thumbnails")
    max_upload_mb: int = 25
    telegram_bot_token: str | None = None
    bootstrap_owner_email: str | None = None
    bootstrap_owner_username: str = "owner"
    bootstrap_owner_password: str | None = None
    worker_poll_seconds: int = 30
    default_timezone: str = "Europe/Moscow"
    login_window_seconds: int = 900
    login_max_attempts: int = 8
    temp_link_minutes: int = 10
    app_secret_key: str = "development-change-me"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.thumbnail_dir.mkdir(parents=True, exist_ok=True)
    return settings
