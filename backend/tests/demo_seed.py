from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from io import BytesIO

from PIL import Image, ImageDraw

from app.core.config import get_settings
from app.core.security import hash_password
from app.db import Base, SessionLocal, engine
from app.models import (
    DiaryComment,
    DiaryEntry,
    DoctorAccess,
    Document,
    DocumentCategory,
    DocumentFolder,
    DoseRegimen,
    DoseRegimenSlot,
    PhotoFolder,
    ProgressPhoto,
    ScheduledIntake,
    Treatment,
    User,
    UserPreference,
    WeightRecord,
)


def _simple_pdf(text: str) -> bytes:
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 18 Tf 72 720 Td ({safe}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode())
        data.extend(obj)
        data.extend(b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    data.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(data)


def _demo_photo(index: int) -> bytes:
    image = Image.new("RGB", (1200, 900), (242, 244, 241))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((90, 90, 1110, 810), radius=42, fill=(226, 236, 231))
    draw.text((130, 130), f"DoseTrack demo photo {index + 1}", fill=(47, 107, 91))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def seed() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    settings = get_settings()
    today = date.today()
    start = today - timedelta(days=67)

    with SessionLocal() as db:
        owner = User(
            email="owner@example.test",
            username="owner",
            password_hash=hash_password("correct-horse-battery"),
            role="OWNER",
            timezone="Europe/Moscow",
            first_name="Demo",
            last_name="Patient",
            birth_date=date(2000, 4, 12),
            height_cm=Decimal("181"),
            avatar_storage_id="demo-avatar.jpg",
            avatar_thumbnail_id="demo-avatar-thumb.jpg",
            avatar_mime_type="image/jpeg",
        )
        doctor = User(
            email="doctor@example.test",
            username="doctor",
            password_hash=hash_password("doctor-demo-password"),
            role="DOCTOR",
            timezone="Europe/Moscow",
            first_name="Demo",
            last_name="Doctor",
        )
        db.add_all([owner, doctor])
        db.flush()
        db.add_all(
            [
                UserPreference(user_id=owner.id, language="ru"),
                UserPreference(user_id=doctor.id, language="ru"),
            ]
        )

        treatment = Treatment(
            patient_id=owner.id,
            name="Курс изотретиноина",
            medication_name="Акнекутан",
            start_date=start,
            status="ACTIVE",
            target_mg=Decimal("7200"),
            timezone="Europe/Moscow",
            notes="Локальные демонстрационные данные",
        )
        db.add(treatment)
        db.flush()
        regimen = DoseRegimen(
            treatment_id=treatment.id,
            effective_from=start,
            notes="16 мг утром и 16 мг вечером",
            created_by=owner.id,
        )
        db.add(regimen)
        db.flush()
        morning = DoseRegimenSlot(
            regimen_id=regimen.id,
            slot_key="morning",
            label="Morning",
            planned_time=time(8, 0),
            dose_mg=Decimal("16"),
            sort_order=0,
        )
        evening = DoseRegimenSlot(
            regimen_id=regimen.id,
            slot_key="evening",
            label="Evening",
            planned_time=time(20, 0),
            dose_mg=Decimal("16"),
            sort_order=1,
        )
        db.add_all([morning, evening])
        db.flush()

        for day_index in range((today - start).days + 1):
            current = start + timedelta(days=day_index)
            for slot, label, planned in [
                (morning, "Morning", time(8, 0)),
                (evening, "Evening", time(20, 0)),
            ]:
                status = "TAKEN"
                actual = Decimal("16")
                taken_at = datetime.combine(current, planned, tzinfo=UTC)
                skipped_reason = None
                if current == today and slot.slot_key == "evening":
                    status = "PENDING"
                    actual = None
                    taken_at = None
                elif current < today and (
                    (day_index % 13 == 0 and slot.slot_key == "evening")
                    or (day_index % 29 == 0 and slot.slot_key == "morning")
                ):
                    status = "SKIPPED"
                    actual = None
                    taken_at = None
                    skipped_reason = "Пропущено"
                db.add(
                    ScheduledIntake(
                        treatment_id=treatment.id,
                        regimen_id=regimen.id,
                        regimen_slot_id=slot.id,
                        scheduled_date=current,
                        slot_key=slot.slot_key,
                        label=label,
                        planned_time=planned,
                        planned_dose_mg=Decimal("16"),
                        status=status,
                        actual_dose_mg=actual,
                        taken_at=taken_at,
                        skipped_reason=skipped_reason,
                        resolved_at=(
                            taken_at
                            or (
                                datetime.combine(current, time(21, 0), tzinfo=UTC)
                                if status == "SKIPPED"
                                else None
                            )
                        ),
                        resolved_by=owner.id if status != "PENDING" else None,
                    )
                )

        for weeks_ago, kg in [(8, "72.4"), (6, "72.1"), (4, "71.8"), (2, "71.6"), (0, "71.5")]:
            db.add(
                WeightRecord(
                    patient_id=owner.id,
                    recorded_date=today - timedelta(days=weeks_ago * 7),
                    weight_kg=Decimal(kg),
                    note="Контрольный вес",
                    created_by=owner.id,
                )
            )

        diary_entries = []
        for days_ago, title, body, category, severity in [
            (18, "Сухость губ", "Сухость стала заметнее, использую бальзам.", "lips", 2),
            (11, "Самочувствие", "Самочувствие нормальное, без новых жалоб.", "general wellbeing", 1),
            (5, "Кожа", "Стало меньше воспалений на лице.", "skin", 1),
            (1, "Самочувствие", "Небольшая сухость кожи, в остальном всё нормально.", "general wellbeing", 1),
        ]:
            entry = DiaryEntry(
                    patient_id=owner.id,
                    occurred_at=datetime.combine(
                        today - timedelta(days=days_ago), time(19, 30), tzinfo=UTC
                    ),
                    title=title,
                    body=body,
                    category=category,
                    severity=severity,
                    created_by=owner.id,
                )
            db.add(entry)
            diary_entries.append(entry)

        db.flush()
        db.add_all(
            [
                DiaryComment(
                    entry_id=diary_entries[-1].id,
                    patient_id=owner.id,
                    author_id=owner.id,
                    body="Увлажняющий крем помогает, новых жалоб нет.",
                ),
                DiaryComment(
                    entry_id=diary_entries[-1].id,
                    patient_id=owner.id,
                    author_id=doctor.id,
                    body="Хорошо. Продолжайте отмечать изменения в дневнике.",
                ),
            ]
        )

        db.add(DoctorAccess(patient_id=owner.id, doctor_id=doctor.id, can_write=False))
        category = DocumentCategory(patient_id=owner.id, name="Анализы")
        doc_root = DocumentFolder(patient_id=owner.id, name="Анализы", parent_id=None)
        db.add_all([category, doc_root])
        db.flush()
        doc_month = DocumentFolder(patient_id=owner.id, name="Сентябрь 2026", parent_id=doc_root.id)
        db.add(doc_month)
        db.flush()
        for idx, (days_ago, title, filename) in enumerate(
            [
                (42, "Биохимия крови", "biochemistry.pdf"),
                (21, "Общий анализ крови", "cbc.pdf"),
                (3, "Контрольные анализы", "control.pdf"),
            ]
        ):
            db.add(
                Document(
                    patient_id=owner.id,
                    category_id=category.id,
                    folder_id=doc_month.id if idx >= 1 else doc_root.id,
                    original_filename=filename,
                    storage_id=f"demo-doc-{idx}",
                    title=title,
                    document_date=today - timedelta(days=days_ago),
                    note=None,
                    mime_type="application/pdf",
                    size_bytes=180000 + idx * 12000,
                    checksum_sha256=f"{idx + 1:064x}",
                    uploader_id=owner.id,
                )
            )

        folder = PhotoFolder(patient_id=owner.id, name="Прогресс курса")
        db.add(folder)
        db.flush()
        photo_month = PhotoFolder(patient_id=owner.id, name="Сентябрь 2026", parent_id=folder.id)
        db.add(photo_month)
        db.flush()
        for idx, days_ago in enumerate([56, 28, 7]):
            db.add(
                ProgressPhoto(
                    patient_id=owner.id,
                    folder_id=photo_month.id if idx == 2 else folder.id,
                    photo_date=today - timedelta(days=days_ago),
                    angle="other",
                    title=f"Фото прогресса {idx + 1}",
                    note="Демонстрационная запись",
                    storage_id=f"demo-photo-{idx}",
                    thumbnail_id=f"demo-thumb-{idx}",
                    mime_type="image/jpeg",
                    size_bytes=250000,
                    checksum_sha256=f"{idx + 101:064x}",
                    uploader_id=owner.id,
                )
            )
        db.commit()

    for idx in range(3):
        (settings.upload_dir / f"demo-doc-{idx}").write_bytes(
            _simple_pdf(f"DoseTrack demo document {idx + 1}")
        )
        photo = _demo_photo(idx)
        (settings.upload_dir / f"demo-photo-{idx}").write_bytes(photo)
        (settings.thumbnail_dir / f"demo-thumb-{idx}").write_bytes(photo)
    avatar = _demo_photo(9)
    (settings.upload_dir / "demo-avatar.jpg").write_bytes(avatar)
    (settings.thumbnail_dir / "demo-avatar-thumb.jpg").write_bytes(avatar)


if __name__ == "__main__":
    seed()
