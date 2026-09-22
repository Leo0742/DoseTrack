from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    DoctorAccess,
    Notification,
    NotificationPreference,
    TelegramConnection,
)


def queue_notification(
    db: Session,
    recipient_id: str,
    event_type: str,
    dedupe_key: str,
    payload: dict,
    related_type: str | None = None,
    related_id: str | None = None,
    scheduled_for: datetime | None = None,
) -> Notification:
    existing = db.scalar(select(Notification).where(Notification.dedupe_key == dedupe_key))
    if existing:
        return existing
    row = Notification(
        recipient_id=recipient_id,
        event_type=event_type,
        dedupe_key=dedupe_key,
        payload=payload,
        related_type=related_type,
        related_id=related_id,
        scheduled_for=scheduled_for,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def due_notifications(db: Session) -> list[Notification]:
    now = datetime.now(UTC)
    return list(
        db.scalars(
            select(Notification)
            .where(
                Notification.status == "PENDING",
                (Notification.scheduled_for.is_(None)) | (Notification.scheduled_for <= now),
            )
            .order_by(Notification.created_at)
            .limit(100)
        )
    )


def telegram_connection(db: Session, user_id: str) -> TelegramConnection | None:
    return db.scalar(
        select(TelegramConnection).where(
            TelegramConnection.user_id == user_id,
            TelegramConnection.enabled.is_(True),
        )
    )


def queue_doctor_event(
    db: Session,
    patient_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    version_key: str,
    payload: dict,
) -> None:
    event_payload = {**payload, "patient_id": patient_id}
    accesses = db.scalars(
        select(DoctorAccess).where(
            DoctorAccess.patient_id == patient_id,
            DoctorAccess.revoked_at.is_(None),
        )
    )
    for access in accesses:
        preference = db.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == access.doctor_id,
                NotificationPreference.event_type == event_type,
            )
        )
        if preference and not preference.telegram_enabled:
            continue
        dedupe_key = f"{event_type}:{access.doctor_id}:{entity_id}:{version_key}"
        existing = db.scalar(select(Notification).where(Notification.dedupe_key == dedupe_key))
        if existing:
            continue
        db.add(
            Notification(
                recipient_id=access.doctor_id,
                event_type=event_type,
                dedupe_key=dedupe_key,
                related_type=entity_type,
                related_id=entity_id,
                payload=event_payload,
            )
        )
