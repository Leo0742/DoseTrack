from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import token_hash
from app.db import get_db
from app.models import DoctorAccess, SessionModel, User

settings = get_settings()
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw = request.cookies.get(settings.session_cookie_name)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    session = db.scalar(
        select(SessionModel).where(
            SessionModel.token_hash == token_hash(raw),
            SessionModel.revoked_at.is_(None),
            SessionModel.expires_at > datetime.now(UTC),
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    if request.method not in SAFE_METHODS:
        csrf = request.headers.get("x-csrf-token")
        if not csrf or not secrets_compare(csrf, session.csrf_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed"
            )
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    session.last_seen_at = datetime.now(UTC)
    db.commit()
    return user


def secrets_compare(left: str, right: str) -> bool:
    import hmac

    return hmac.compare_digest(left, right)


def owner_user(user: User = Depends(current_user)) -> User:
    if user.role not in {"OWNER", "PATIENT"}:
        raise HTTPException(status_code=403, detail="Owner access required")
    return user


def resolve_patient_id(db: Session, user: User) -> str:
    if user.role in {"OWNER", "PATIENT"}:
        return user.id
    access = db.scalar(
        select(DoctorAccess).where(
            DoctorAccess.doctor_id == user.id,
            DoctorAccess.revoked_at.is_(None),
        )
    )
    if not access:
        raise HTTPException(status_code=403, detail="No active patient access")
    return access.patient_id


def require_patient_write(db: Session, user: User, patient_id: str) -> None:
    if user.id == patient_id and user.role in {"OWNER", "PATIENT"}:
        return
    access = db.scalar(
        select(DoctorAccess).where(
            DoctorAccess.doctor_id == user.id,
            DoctorAccess.patient_id == patient_id,
            DoctorAccess.revoked_at.is_(None),
            DoctorAccess.can_write.is_(True),
        )
    )
    if not access:
        raise HTTPException(status_code=403, detail="Read-only access")
