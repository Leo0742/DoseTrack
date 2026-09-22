from datetime import UTC, datetime

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message
from sqlalchemy import select

from app.core.deps import require_patient_write, resolve_patient_id
from app.core.security import token_hash
from app.db import SessionLocal
from app.models import ScheduledIntake, TelegramConnection, TelegramLinkCode, Treatment, User
from app.services.audit import audit
from app.services.intakes import resolve_intake

router = Router()


@router.message(CommandStart(deep_link=True))
async def start_with_code(message: Message) -> None:
    if message.from_user is None:
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) != 2:
        await message.answer("Open Settings in DoseTrack and generate a fresh Telegram link code.")
        return
    code = parts[1].strip()
    now = datetime.now(UTC)
    with SessionLocal() as db:
        row = db.scalar(
            select(TelegramLinkCode).where(
                TelegramLinkCode.code_hash == token_hash(code),
                TelegramLinkCode.used_at.is_(None),
                TelegramLinkCode.expires_at > now,
            )
        )
        if not row:
            await message.answer(
                "This link code is invalid or expired. Generate a new one in DoseTrack."
            )
            return
        telegram_id = str(message.from_user.id)
        existing_tg = db.scalar(
            select(TelegramConnection).where(TelegramConnection.telegram_user_id == telegram_id)
        )
        if existing_tg and existing_tg.user_id != row.user_id:
            await message.answer(
                "This Telegram account is already linked to another DoseTrack account."
            )
            return
        connection = db.scalar(
            select(TelegramConnection).where(TelegramConnection.user_id == row.user_id)
        )
        if not connection:
            connection = TelegramConnection(
                user_id=row.user_id,
                telegram_user_id=telegram_id,
                telegram_chat_id=str(message.chat.id),
            )
            db.add(connection)
        else:
            connection.telegram_user_id = telegram_id
            connection.telegram_chat_id = str(message.chat.id)
            connection.enabled = True
        row.used_at = now
        user = db.get(User, row.user_id)
        audit(db, user, "telegram_connected", "telegram_connection", connection.id)
        db.commit()
    await message.answer("Telegram is connected to DoseTrack.")


@router.message(CommandStart())
async def start_plain(message: Message) -> None:
    await message.answer("DoseTrack bot. Connect it from Settings in the web application.")


@router.callback_query(F.data.startswith("intake:"))
async def intake_callback(callback: CallbackQuery) -> None:
    if not callback.data:
        return
    _, action, intake_id = callback.data.split(":", 2)
    with SessionLocal() as db:
        connection = db.scalar(
            select(TelegramConnection).where(
                TelegramConnection.telegram_user_id == str(callback.from_user.id),
                TelegramConnection.enabled.is_(True),
            )
        )
        if not connection:
            await callback.answer("Telegram is not linked.", show_alert=True)
            return
        user = db.get(User, connection.user_id)
        intake = db.get(ScheduledIntake, intake_id)
        if not user or not intake:
            await callback.answer("Dose was not found.", show_alert=True)
            return
        treatment = db.get(Treatment, intake.treatment_id)
        if not treatment:
            await callback.answer("Treatment was not found.", show_alert=True)
            return
        patient_id = resolve_patient_id(db, user)
        if treatment.patient_id != patient_id:
            await callback.answer("Access denied.", show_alert=True)
            return
        require_patient_write(db, user, patient_id)
        status = "TAKEN" if action == "take" else "SKIPPED"
        result = resolve_intake(db, intake, user, status)
    await callback.answer("Saved")
    if isinstance(callback.message, Message):
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer(f"{result.label}: {status.title()}")
