import asyncio
import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from aiogram import Bot, Dispatcher
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import (
    Document,
    NotificationPreference,
    ProgressPhoto,
    Treatment,
    User,
    UserPreference,
)
from app.services.intakes import ensure_intakes_for_date
from app.services.notifications import due_notifications, queue_notification, telegram_connection
from app.services.storage import private_path
from app.telegram_bot import router as telegram_router

settings = get_settings()
log = logging.getLogger("dosetrack.worker")


def queue_reminders() -> None:
    now_utc = datetime.now(UTC)
    with SessionLocal() as db:
        treatments = db.scalars(select(Treatment).where(Treatment.status == "ACTIVE"))
        for treatment in treatments:
            user = db.get(User, treatment.patient_id)
            if not user:
                continue
            pref = db.get(UserPreference, user.id)
            if not pref:
                pref = UserPreference(user_id=user.id)
                db.add(pref)
                db.commit()
            local_now = now_utc.astimezone(ZoneInfo(treatment.timezone))
            rows = ensure_intakes_for_date(db, treatment, local_now.date())
            for index, intake in enumerate(rows):
                if intake.status != "PENDING":
                    continue
                key = intake.slot_key.lower()
                if "morning" in key or index == 0:
                    due_time = pref.morning_reminder
                    event_type = "dose_reminder_morning"
                elif "evening" in key or index == len(rows) - 1:
                    due_time = pref.evening_reminder
                    event_type = "dose_reminder_evening"
                else:
                    due_time = intake.planned_time
                    event_type = "dose_reminder_morning"
                notification_pref = db.scalar(
                    select(NotificationPreference).where(
                        NotificationPreference.user_id == user.id,
                        NotificationPreference.event_type == event_type,
                    )
                )
                if notification_pref and not notification_pref.telegram_enabled:
                    continue
                if local_now.time().replace(tzinfo=None) < due_time:
                    continue
                queue_notification(
                    db,
                    user.id,
                    event_type,
                    f"reminder:{user.id}:{intake.id}",
                    {
                        "intake_id": intake.id,
                        "label": intake.label,
                        "dose_mg": str(intake.planned_dose_mg),
                        "date": intake.scheduled_date.isoformat(),
                    },
                    "scheduled_intake",
                    intake.id,
                )


async def send_pending(bot: Bot) -> None:
    with SessionLocal() as db:
        for notification in due_notifications(db):
            connection = telegram_connection(db, notification.recipient_id)
            if not connection:
                notification.status = "FAILED"
                notification.delivery_error = "Telegram is not connected"
                db.commit()
                continue
            payload = notification.payload
            keyboard = None
            direct_file: tuple[str, str] | None = None
            if notification.event_type in {
                "dose_reminder",
                "dose_reminder_morning",
                "dose_reminder_evening",
            }:
                text = (
                    f"{payload.get('label', 'Dose')} has not been recorded yet.\n"
                    f"{payload.get('dose_mg', '')} mg"
                )
                intake_id = payload.get("intake_id")
                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="Taken", callback_data=f"intake:take:{intake_id}"
                            ),
                            InlineKeyboardButton(
                                text="Skip", callback_data=f"intake:skip:{intake_id}"
                            ),
                        ],
                        [InlineKeyboardButton(text="Open website", url=settings.frontend_url)],
                    ]
                )
            elif notification.event_type == "document_uploaded":
                document_id = payload.get("document_id")
                text = f"New document\n{payload.get('title', 'Document')}"
                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="View document",
                                url=f"{settings.frontend_url}/documents?open={document_id}",
                            )
                        ]
                    ]
                )
                patient_pref = db.get(UserPreference, payload.get("patient_id"))
                doctor_pref = db.scalar(
                    select(NotificationPreference).where(
                        NotificationPreference.user_id == notification.recipient_id,
                        NotificationPreference.event_type == notification.event_type,
                    )
                )
                if (
                    patient_pref
                    and patient_pref.direct_telegram_files
                    and doctor_pref
                    and doctor_pref.direct_files
                    and document_id
                ):
                    document = db.get(Document, document_id)
                    if document and not document.deleted_at:
                        direct_file = (str(private_path(document.storage_id)), "document")
            elif notification.event_type == "photo_uploaded":
                photo_id = payload.get("photo_id")
                text = f"New progress photo\n{payload.get('title', 'Photo')}"
                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="View photo",
                                url=f"{settings.frontend_url}/photos?open={photo_id}",
                            )
                        ]
                    ]
                )
                patient_pref = db.get(UserPreference, payload.get("patient_id"))
                doctor_pref = db.scalar(
                    select(NotificationPreference).where(
                        NotificationPreference.user_id == notification.recipient_id,
                        NotificationPreference.event_type == notification.event_type,
                    )
                )
                if (
                    patient_pref
                    and patient_pref.direct_telegram_files
                    and doctor_pref
                    and doctor_pref.direct_files
                    and photo_id
                ):
                    photo = db.get(ProgressPhoto, photo_id)
                    if photo and not photo.deleted_at:
                        direct_file = (str(private_path(photo.storage_id)), "photo")
            else:
                event = notification.event_type.replace("_", " ").title()
                text = (
                    f"{event}\n{payload.get('label', '')} {payload.get('dose_mg', '')} mg".strip()
                )
            try:
                notification.status = "SENDING"
                db.commit()
                await bot.send_message(
                    int(connection.telegram_chat_id), text, reply_markup=keyboard
                )
                if direct_file:
                    path, kind = direct_file
                    if kind == "photo":
                        await bot.send_photo(int(connection.telegram_chat_id), FSInputFile(path))
                    else:
                        await bot.send_document(int(connection.telegram_chat_id), FSInputFile(path))
                notification.status = "SENT"
                notification.sent_at = datetime.now(UTC)
                notification.delivery_error = None
            except Exception as exc:
                notification.status = "FAILED"
                notification.delivery_error = str(exc)[:1000]
                log.exception("Telegram delivery failed")
            db.commit()


async def scheduler_loop(bot: Bot) -> None:
    while True:
        queue_reminders()
        await send_pending(bot)
        await asyncio.sleep(settings.worker_poll_seconds)


async def main() -> None:
    if not settings.telegram_bot_token:
        log.warning("Telegram token is not configured; reminder scheduling remains enabled")
        while True:
            queue_reminders()
            await asyncio.sleep(settings.worker_poll_seconds)
    bot = Bot(settings.telegram_bot_token)
    dispatcher = Dispatcher()
    dispatcher.include_router(telegram_router)
    await asyncio.gather(dispatcher.start_polling(bot), scheduler_loop(bot))


if __name__ == "__main__":
    asyncio.run(main())
