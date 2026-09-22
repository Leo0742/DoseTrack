from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="PATIENT", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Moscow")
    first_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), nullable=True)
    avatar_storage_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    avatar_thumbnail_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    avatar_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sessions: Mapped[list[SessionModel]] = relationship(back_populates="user")


class SessionModel(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    user: Mapped[User] = relationship(back_populates="sessions")


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    identity: Mapped[str] = mapped_column(String(320), index=True)
    ip_address: Mapped[str] = mapped_column(String(64), index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class Treatment(Base, TimestampMixin):
    __tablename__ = "treatments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    medication_name: Mapped[str] = mapped_column(String(160))
    start_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE")
    target_mg: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    timezone: Mapped[str] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class TreatmentPause(Base, TimestampMixin):
    __tablename__ = "treatment_pauses"
    __table_args__ = (
        UniqueConstraint("treatment_id", "start_date", name="uq_treatment_pause_start"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    treatment_id: Mapped[str] = mapped_column(
        ForeignKey("treatments.id", ondelete="CASCADE"), index=True
    )
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))


class DoseRegimen(Base, TimestampMixin):
    __tablename__ = "dose_regimens"
    __table_args__ = (
        UniqueConstraint("treatment_id", "effective_from", name="uq_regimen_effective"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    treatment_id: Mapped[str] = mapped_column(
        ForeignKey("treatments.id", ondelete="CASCADE"), index=True
    )
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    slots: Mapped[list[DoseRegimenSlot]] = relationship(
        back_populates="regimen",
        cascade="all, delete-orphan",
        order_by="DoseRegimenSlot.sort_order",
    )


class DoseRegimenSlot(Base):
    __tablename__ = "dose_regimen_slots"
    __table_args__ = (UniqueConstraint("regimen_id", "slot_key", name="uq_regimen_slot_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    regimen_id: Mapped[str] = mapped_column(ForeignKey("dose_regimens.id", ondelete="CASCADE"))
    slot_key: Mapped[str] = mapped_column(String(60))
    label: Mapped[str] = mapped_column(String(80))
    planned_time: Mapped[time] = mapped_column(Time)
    dose_mg: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    regimen: Mapped[DoseRegimen] = relationship(back_populates="slots")


class ScheduledIntake(Base, TimestampMixin):
    __tablename__ = "scheduled_intakes"
    __table_args__ = (
        UniqueConstraint("treatment_id", "scheduled_date", "slot_key", name="uq_intake_slot_day"),
        Index("ix_intake_treatment_date", "treatment_id", "scheduled_date"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    treatment_id: Mapped[str] = mapped_column(ForeignKey("treatments.id", ondelete="CASCADE"))
    regimen_id: Mapped[str] = mapped_column(ForeignKey("dose_regimens.id"))
    regimen_slot_id: Mapped[str] = mapped_column(ForeignKey("dose_regimen_slots.id"))
    scheduled_date: Mapped[date] = mapped_column(Date, index=True)
    slot_key: Mapped[str] = mapped_column(String(60))
    label: Mapped[str] = mapped_column(String(80))
    planned_time: Mapped[time] = mapped_column(Time)
    planned_dose_mg: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    actual_dose_mg: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    skipped_reason: Mapped[str | None] = mapped_column(String(250), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class WeightRecord(Base, TimestampMixin):
    __tablename__ = "weight_records"
    __table_args__ = (UniqueConstraint("patient_id", "recorded_date", name="uq_weight_day"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    recorded_date: Mapped[date] = mapped_column(Date, index=True)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))


class DiaryEntry(Base, TimestampMixin):
    __tablename__ = "diary_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), default="other", index=True)
    severity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))


class DiaryComment(Base, TimestampMixin):
    __tablename__ = "diary_comments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    entry_id: Mapped[str] = mapped_column(ForeignKey("diary_entries.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)


class DocumentCategory(Base, TimestampMixin):
    __tablename__ = "document_categories"
    __table_args__ = (UniqueConstraint("patient_id", "name", name="uq_document_category"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))


class DocumentFolder(Base, TimestampMixin):
    __tablename__ = "document_folders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("document_folders.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120))


class Document(Base, TimestampMixin):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    category_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_categories.id"), nullable=True
    )
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_id: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(180))
    document_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64), index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PhotoFolder(Base, TimestampMixin):
    __tablename__ = "photo_folders"
    __table_args__ = (UniqueConstraint("patient_id", "name", name="uq_photo_folder"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("photo_folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120))


class ProgressPhoto(Base, TimestampMixin):
    __tablename__ = "progress_photos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("photo_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    photo_date: Mapped[date] = mapped_column(Date, index=True)
    angle: Mapped[str] = mapped_column(String(30), default="other")
    title: Mapped[str | None] = mapped_column(String(180), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_id: Mapped[str] = mapped_column(String(80), unique=True)
    thumbnail_id: Mapped[str] = mapped_column(String(80), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DoctorAccess(Base, TimestampMixin):
    __tablename__ = "doctor_access"
    __table_args__ = (UniqueConstraint("patient_id", "doctor_id", name="uq_doctor_access"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    can_write: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Invite(Base, TimestampMixin):
    __tablename__ = "invites"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    email: Mapped[str] = mapped_column(String(320), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TelegramConnection(Base, TimestampMixin):
    __tablename__ = "telegram_connections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    telegram_user_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    telegram_chat_id: Mapped[str] = mapped_column(String(32))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class TelegramLinkCode(Base):
    __tablename__ = "telegram_link_codes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("user_id", "event_type", name="uq_notification_pref"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(60))
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    direct_files: Mapped[bool] = mapped_column(Boolean, default=False)


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    channel: Mapped[str] = mapped_column(String(30), default="telegram")
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    dedupe_key: Mapped[str] = mapped_column(String(255), unique=True)
    related_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    related_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class TemporaryLink(Base):
    __tablename__ = "temporary_links"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_count: Mapped[int] = mapped_column(Integer, default=0)


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    morning_reminder: Mapped[time] = mapped_column(Time, default=time(11, 0))
    evening_reminder: Mapped[time] = mapped_column(Time, default=time(23, 0))
    direct_telegram_files: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String(5), default="ru")
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
