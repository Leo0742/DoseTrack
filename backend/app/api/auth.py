from datetime import UTC, date, datetime

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import ChangePasswordRequest, LoginRequest, ProfileUpdate
from app.core.config import get_settings
from app.core.deps import current_user
from app.core.security import (
    create_session,
    hash_password,
    recent_login_failures,
    record_login_attempt,
    token_hash,
    verify_password,
)
from app.db import get_db
from app.models import SessionModel, User, WeightRecord
from app.services.audit import audit
from app.services.storage import (
    delete_storage,
    read_validated_upload,
    store_progress_photo,
    thumbnail_path,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "role": user.role,
        "timezone": user.timezone,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "has_avatar": bool(user.avatar_thumbnail_id),
    }


def profile_payload(db: Session, user: User) -> dict:
    latest_weight = db.scalar(
        select(WeightRecord)
        .where(WeightRecord.patient_id == user.id)
        .order_by(WeightRecord.recorded_date.desc())
    )
    age = None
    if user.birth_date:
        today = date.today()
        age = today.year - user.birth_date.year - (
            (today.month, today.day) < (user.birth_date.month, user.birth_date.day)
        )
    return {
        **public_user(user),
        "birth_date": user.birth_date,
        "age": age,
        "height_cm": float(user.height_cm) if user.height_cm is not None else None,
        "latest_weight_kg": float(latest_weight.weight_kg) if latest_weight else None,
        "latest_weight_date": latest_weight.recorded_date if latest_weight else None,
    }


@router.post("/login")
def login(
    payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)
):
    identity = payload.identity.strip().lower()
    ip = request.client.host if request.client else "unknown"
    if recent_login_failures(db, identity, ip) >= settings.login_max_attempts:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    user = db.scalar(
        select(User).where(
            (func.lower(User.email) == identity) | (func.lower(User.username) == identity)
        )
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        record_login_attempt(db, identity, ip, False)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    record_login_attempt(db, identity, ip, True)
    raw, csrf, _ = create_session(db, user)
    response.set_cookie(
        settings.session_cookie_name,
        raw,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_days * 86400,
        path="/",
    )
    audit(db, user, "login", "user", user.id)
    db.commit()
    return {"user": public_user(user), "csrf_token": csrf}


@router.get("/me")
def me(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    raw = request.cookies.get(settings.session_cookie_name)
    session = db.scalar(
        select(SessionModel).where(SessionModel.token_hash == token_hash(raw or ""))
    )
    return {"user": public_user(user), "csrf_token": session.csrf_token if session else None}


@router.get("/profile")
def profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return profile_payload(db, user)


@router.put("/profile")
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if payload.email is not None:
        clean_email = str(payload.email).strip().lower()
        if clean_email != user.email.strip().lower():
            try:
                clean_email = validate_email(clean_email, check_deliverability=False).normalized.lower()
            except EmailNotValidError as exc:
                raise HTTPException(status_code=422, detail="Enter a valid email address") from exc
        duplicate = db.scalar(
            select(User).where(func.lower(User.email) == clean_email, User.id != user.id)
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="Email is already in use")
        user.email = clean_email
    user.first_name = payload.first_name.strip() if payload.first_name else None
    user.last_name = payload.last_name.strip() if payload.last_name else None
    user.birth_date = payload.birth_date
    user.height_cm = payload.height_cm
    audit(db, user, "profile_changed", "user", user.id)
    db.commit()
    db.refresh(user)
    return profile_payload(db, user)


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    data, mime = await read_validated_upload(file, image_only=True)
    storage_id, thumbnail_id, _, _, stored_mime = store_progress_photo(data, mime)
    old_storage = user.avatar_storage_id
    old_thumbnail = user.avatar_thumbnail_id
    user.avatar_storage_id = storage_id
    user.avatar_thumbnail_id = thumbnail_id
    user.avatar_mime_type = stored_mime
    audit(db, user, "avatar_changed", "user", user.id)
    db.commit()
    if old_storage:
        delete_storage(old_storage, old_thumbnail)
    return {"ok": True, "has_avatar": True}


@router.get("/avatar")
def avatar(user: User = Depends(current_user)):
    if not user.avatar_thumbnail_id:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(thumbnail_path(user.avatar_thumbnail_id), media_type="image/jpeg")


@router.delete("/avatar")
def remove_avatar(user: User = Depends(current_user), db: Session = Depends(get_db)):
    storage_id = user.avatar_storage_id
    thumbnail_id = user.avatar_thumbnail_id
    user.avatar_storage_id = None
    user.avatar_thumbnail_id = None
    user.avatar_mime_type = None
    audit(db, user, "avatar_removed", "user", user.id)
    db.commit()
    if storage_id:
        delete_storage(storage_id, thumbnail_id)
    return {"ok": True, "has_avatar": False}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    raw = request.cookies.get(settings.session_cookie_name)
    if raw:
        session = db.scalar(select(SessionModel).where(SessionModel.token_hash == token_hash(raw)))
        if session:
            session.revoked_at = datetime.now(UTC)
            audit(db, user, "logout", "session", session.id)
            db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"ok": True}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    for session in db.scalars(
        select(SessionModel).where(
            SessionModel.user_id == user.id, SessionModel.revoked_at.is_(None)
        )
    ):
        session.revoked_at = datetime.now(UTC)
    audit(db, user, "password_changed", "user", user.id)
    db.commit()
    return {"ok": True, "reauthenticate": True}
