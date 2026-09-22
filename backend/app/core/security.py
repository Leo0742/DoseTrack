import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import LoginAttempt, SessionModel, User

settings = get_settings()
hasher = PasswordHasher()


def hash_password(password: str) -> str:
    if len(password) < 10:
        raise ValueError("Password must contain at least 10 characters")
    return hasher.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return hasher.verify(encoded, password)
    except VerifyMismatchError:
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> tuple[str, str, SessionModel]:
    raw = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    row = SessionModel(
        user_id=user.id,
        token_hash=token_hash(raw),
        csrf_token=csrf,
        expires_at=datetime.now(UTC) + timedelta(days=settings.session_days),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return raw, csrf, row


def recent_login_failures(db: Session, identity: str, ip: str) -> int:
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.login_window_seconds)
    stmt = select(func.count(LoginAttempt.id)).where(
        LoginAttempt.created_at >= cutoff,
        LoginAttempt.success.is_(False),
        (LoginAttempt.identity == identity) | (LoginAttempt.ip_address == ip),
    )
    return int(db.scalar(stmt) or 0)


def record_login_attempt(db: Session, identity: str, ip: str, success: bool) -> None:
    db.add(LoginAttempt(identity=identity[:320], ip_address=ip[:64], success=success))
    db.commit()
