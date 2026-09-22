from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    identity: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=256)


class ProfileUpdate(BaseModel):
    # Keep the raw value here so legacy accounts created with a historical
    # placeholder address can still update unrelated profile fields. New or
    # changed email values are validated in the endpoint before persistence.
    email: str | None = Field(default=None, min_length=3, max_length=320)
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    birth_date: date | None = None
    height_cm: Decimal | None = Field(default=None, gt=50, lt=260)


class TreatmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    medication_name: str = Field(min_length=1, max_length=160)
    start_date: date
    target_mg: Decimal = Field(gt=0)
    timezone: str
    notes: str | None = None


class TargetUpdate(BaseModel):
    target_mg: Decimal = Field(gt=0)
    confirmed: bool


class TreatmentStatusUpdate(BaseModel):
    status: str
    effective_date: date
    confirmed: bool


class RegimenSlotInput(BaseModel):
    slot_key: str = Field(min_length=1, max_length=60)
    label: str = Field(min_length=1, max_length=80)
    planned_time: time
    dose_mg: Decimal = Field(ge=0)
    notes: str | None = None


class RegimenCreate(BaseModel):
    effective_from: date
    notes: str | None = None
    slots: list[RegimenSlotInput] = Field(min_length=1, max_length=8)


class IntakeResolve(BaseModel):
    status: str
    actual_dose_mg: Decimal | None = Field(default=None, ge=0)
    occurred_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=250)
    deliberate_edit: bool = False


class WeightInput(BaseModel):
    recorded_date: date
    weight_kg: Decimal = Field(gt=0, lt=500)
    note: str | None = Field(default=None, max_length=2000)


class DiaryInput(BaseModel):
    occurred_at: datetime
    title: str | None = Field(default=None, max_length=160)
    body: str = Field(min_length=1, max_length=20000)
    category: str = Field(default="other", max_length=60)
    severity: int | None = Field(default=None, ge=1, le=5)


class DiaryCommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class InviteCreate(BaseModel):
    email: EmailStr


class InviteAccept(BaseModel):
    token: str
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=10, max_length=256)


class ReminderSettings(BaseModel):
    morning_reminder: time
    evening_reminder: time
    timezone: str
    direct_telegram_files: bool = False


class LanguageSettings(BaseModel):
    language: str = Field(pattern="^(ru|en)$")


class NotificationPreferenceInput(BaseModel):
    event_type: str = Field(min_length=1, max_length=60)
    telegram_enabled: bool = True
    direct_files: bool = False
