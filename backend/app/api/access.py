import secrets
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    InviteAccept,
    InviteCreate,
    LanguageSettings,
    NotificationPreferenceInput,
    ReminderSettings,
)
from app.core.config import get_settings
from app.core.deps import current_user, resolve_patient_id
from app.core.security import hash_password, token_hash
from app.db import get_db
from app.models import (
    DoctorAccess,
    Invite,
    Notification,
    NotificationPreference,
    TelegramConnection,
    TelegramLinkCode,
    User,
    UserPreference,
    WeightRecord,
)
from app.services.audit import audit

router = APIRouter(tags=["access"])
settings = get_settings()

DOCTOR_NOTIFICATION_EVENTS = (
    "dose_taken",
    "dose_skipped",
    "document_uploaded",
    "photo_uploaded",
    "regimen_changed",
    "target_changed",
)
PATIENT_NOTIFICATION_EVENTS = ("dose_reminder_morning", "dose_reminder_evening")


def _age(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = date.today()
    return today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )


@router.get("/patient/profile")
def patient_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient_id = resolve_patient_id(db, user)
    patient = db.get(User, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    latest_weight = db.scalar(
        select(WeightRecord)
        .where(WeightRecord.patient_id == patient_id)
        .order_by(WeightRecord.recorded_date.desc())
    )
    return {
        "id": patient.id,
        "username": patient.username,
        "email": patient.email,
        "first_name": patient.first_name,
        "last_name": patient.last_name,
        "birth_date": patient.birth_date,
        "age": _age(patient.birth_date),
        "height_cm": float(patient.height_cm) if patient.height_cm is not None else None,
        "latest_weight_kg": float(latest_weight.weight_kg) if latest_weight else None,
        "latest_weight_date": latest_weight.recorded_date if latest_weight else None,
    }


@router.post("/doctor/invites")
def create_invite(
    payload: InviteCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {"OWNER", "PATIENT"}:
        raise HTTPException(status_code=403, detail="Owner access required")
    raw = secrets.token_urlsafe(32)
    row = Invite(
        patient_id=user.id,
        email=str(payload.email).lower(),
        token_hash=token_hash(raw),
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(row)
    db.flush()
    audit(db, user, "doctor_invited", "invite", row.id, {"email": row.email})
    db.commit()
    return {
        "id": row.id,
        "email": row.email,
        "expires_at": row.expires_at,
        "invite_token": raw,
        "note": "Share this one-time token through a trusted channel.",
    }


@router.post("/doctor/invites/accept")
def accept_invite(payload: InviteAccept, db: Session = Depends(get_db)):
    row = db.scalar(select(Invite).where(Invite.token_hash == token_hash(payload.token)))
    now = datetime.now(UTC)
    expires_at = row.expires_at if row else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if not row or row.accepted_at or row.revoked_at or not expires_at or expires_at <= now:
        raise HTTPException(status_code=400, detail="Invite is invalid or expired")
    doctor = db.scalar(select(User).where(User.email == row.email))
    if doctor and doctor.role != "DOCTOR":
        raise HTTPException(status_code=409, detail="This email belongs to another account")
    if not doctor:
        doctor = User(
            email=row.email,
            username=payload.username,
            role="DOCTOR",
            password_hash=hash_password(payload.password),
            timezone=settings.default_timezone,
        )
        db.add(doctor)
        db.flush()
        db.add(UserPreference(user_id=doctor.id))
    access = db.scalar(
        select(DoctorAccess).where(
            DoctorAccess.patient_id == row.patient_id,
            DoctorAccess.doctor_id == doctor.id,
        )
    )
    if access:
        access.revoked_at = None
        access.can_write = False
    else:
        db.add(DoctorAccess(patient_id=row.patient_id, doctor_id=doctor.id, can_write=False))
    row.accepted_at = now
    audit(db, doctor, "doctor_access_accepted", "invite", row.id)
    db.commit()
    return {"ok": True}


@router.get("/doctor/access")
def doctor_access(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in {"OWNER", "PATIENT"}:
        raise HTTPException(status_code=403, detail="Owner access required")
    accesses = db.scalars(
        select(DoctorAccess).where(
            DoctorAccess.patient_id == user.id,
            DoctorAccess.revoked_at.is_(None),
        )
    )
    result = []
    for access in accesses:
        doctor = db.get(User, access.doctor_id)
        if doctor:
            result.append(
                {
                    "id": access.id,
                    "doctor_id": doctor.id,
                    "email": doctor.email,
                    "username": doctor.username,
                    "can_write": access.can_write,
                }
            )
    return result


@router.delete("/doctor/access/{access_id}")
def revoke_doctor(
    access_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {"OWNER", "PATIENT"}:
        raise HTTPException(status_code=403, detail="Owner access required")
    access = db.get(DoctorAccess, access_id)
    if not access or access.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Doctor access not found")
    access.revoked_at = datetime.now(UTC)
    audit(db, user, "doctor_access_revoked", "doctor_access", access.id)
    db.commit()
    return {"ok": True}


@router.post("/telegram/link-code")
def telegram_link_code(user: User = Depends(current_user), db: Session = Depends(get_db)):
    code = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    row = TelegramLinkCode(
        user_id=user.id,
        code_hash=token_hash(code),
        expires_at=datetime.now(UTC) + timedelta(minutes=10),
    )
    db.add(row)
    db.commit()
    return {"code": code, "expires_at": row.expires_at}


@router.get("/telegram/status")
def telegram_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(TelegramConnection).where(TelegramConnection.user_id == user.id))
    return {"connected": bool(row and row.enabled)}


@router.delete("/telegram")
def disconnect_telegram(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(TelegramConnection).where(TelegramConnection.user_id == user.id))
    if row:
        row.enabled = False
        audit(db, user, "telegram_disconnected", "telegram_connection", row.id)
        db.commit()
    return {"ok": True}


@router.get("/settings/reminders")
def get_reminders(user: User = Depends(current_user), db: Session = Depends(get_db)):
    pref = db.get(UserPreference, user.id)
    if not pref:
        pref = UserPreference(user_id=user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return {
        "morning_reminder": pref.morning_reminder,
        "evening_reminder": pref.evening_reminder,
        "timezone": user.timezone,
        "direct_telegram_files": pref.direct_telegram_files,
    }


@router.put("/settings/reminders")
def update_reminders(
    payload: ReminderSettings,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    try:
        ZoneInfo(payload.timezone)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid IANA timezone") from exc
    pref = db.get(UserPreference, user.id) or UserPreference(user_id=user.id)
    pref.morning_reminder = payload.morning_reminder
    pref.evening_reminder = payload.evening_reminder
    pref.direct_telegram_files = payload.direct_telegram_files
    user.timezone = payload.timezone
    db.add(pref)
    audit(db, user, "notification_settings_changed", "user", user.id)
    db.commit()
    return {"ok": True}


@router.get("/settings/language")
def get_language(user: User = Depends(current_user), db: Session = Depends(get_db)):
    pref = db.get(UserPreference, user.id)
    if not pref:
        pref = UserPreference(user_id=user.id, language="ru")
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return {"language": pref.language or "ru"}


@router.put("/settings/language")
def update_language(
    payload: LanguageSettings,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    pref = db.get(UserPreference, user.id) or UserPreference(user_id=user.id)
    pref.language = payload.language
    db.add(pref)
    audit(db, user, "language_changed", "user", user.id, {"language": payload.language})
    db.commit()
    return {"language": pref.language}


@router.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Notification)
        .where(Notification.recipient_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(200)
    )
    return [
        {
            "id": row.id,
            "event_type": row.event_type,
            "channel": row.channel,
            "status": row.status,
            "created_at": row.created_at,
            "sent_at": row.sent_at,
            "delivery_error": row.delivery_error,
            "payload": row.payload,
        }
        for row in rows
    ]


@router.get("/notification-preferences")
def get_notification_preferences(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    event_types = (
        DOCTOR_NOTIFICATION_EVENTS if user.role == "DOCTOR" else PATIENT_NOTIFICATION_EVENTS
    )
    rows = {
        row.event_type: row
        for row in db.scalars(
            select(NotificationPreference).where(NotificationPreference.user_id == user.id)
        )
    }
    return [
        {
            "event_type": event_type,
            "telegram_enabled": rows[event_type].telegram_enabled if event_type in rows else True,
            "direct_files": rows[event_type].direct_files if event_type in rows else False,
        }
        for event_type in event_types
    ]


@router.put("/notification-preferences")
def save_notification_preference(
    payload: NotificationPreferenceInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    allowed = DOCTOR_NOTIFICATION_EVENTS if user.role == "DOCTOR" else PATIENT_NOTIFICATION_EVENTS
    if payload.event_type not in allowed:
        raise HTTPException(status_code=422, detail="Unsupported notification event")
    row = db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user.id,
            NotificationPreference.event_type == payload.event_type,
        )
    )
    if not row:
        row = NotificationPreference(user_id=user.id, event_type=payload.event_type)
        db.add(row)
    row.telegram_enabled = payload.telegram_enabled
    row.direct_files = payload.direct_files
    db.commit()
    return {"ok": True}
