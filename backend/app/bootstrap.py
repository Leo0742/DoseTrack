from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db import SessionLocal
from app.models import User, UserPreference


def bootstrap() -> None:
    settings = get_settings()
    if not settings.bootstrap_owner_email or not settings.bootstrap_owner_password:
        raise SystemExit("Owner bootstrap values are missing from environment")
    with SessionLocal() as db:
        existing = db.scalar(
            select(User).where(User.email == settings.bootstrap_owner_email.lower())
        )
        if existing:
            print("Owner already exists")
            return
        user = User(
            email=settings.bootstrap_owner_email.lower(),
            username=settings.bootstrap_owner_username,
            role="OWNER",
            timezone=settings.default_timezone,
            password_hash=hash_password(settings.bootstrap_owner_password),
        )
        db.add(user)
        db.flush()
        db.add(UserPreference(user_id=user.id))
        db.commit()
        print("Owner created")


if __name__ == "__main__":
    bootstrap()
