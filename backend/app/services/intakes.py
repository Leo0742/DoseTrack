from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    DoseRegimen,
    DoseRegimenSlot,
    ScheduledIntake,
    Treatment,
    TreatmentPause,
    User,
)
from app.services.audit import audit
from app.services.notifications import queue_doctor_event


def active_treatment(db: Session, patient_id: str) -> Treatment | None:
    return db.scalar(
        select(Treatment)
        .where(
            Treatment.patient_id == patient_id,
            Treatment.status.in_(["ACTIVE", "PAUSED", "PLANNED"]),
        )
        .order_by(Treatment.start_date.desc())
    )


def regimen_for_date(db: Session, treatment_id: str, day: date) -> DoseRegimen | None:
    return db.scalar(
        select(DoseRegimen)
        .where(
            DoseRegimen.treatment_id == treatment_id,
            DoseRegimen.effective_from <= day,
            (DoseRegimen.effective_to.is_(None)) | (DoseRegimen.effective_to >= day),
        )
        .order_by(DoseRegimen.effective_from.desc())
    )


def is_paused_on(db: Session, treatment_id: str, day: date) -> bool:
    return (
        db.scalar(
            select(func.count(TreatmentPause.id)).where(
                TreatmentPause.treatment_id == treatment_id,
                TreatmentPause.start_date <= day,
                (TreatmentPause.end_date.is_(None)) | (TreatmentPause.end_date >= day),
            )
        )
        or 0
    ) > 0


def ensure_intakes_for_date(db: Session, treatment: Treatment, day: date) -> list[ScheduledIntake]:
    rows = list(
        db.scalars(
            select(ScheduledIntake)
            .where(
                ScheduledIntake.treatment_id == treatment.id,
                ScheduledIntake.scheduled_date == day,
            )
            .order_by(ScheduledIntake.planned_time)
        )
    )
    if is_paused_on(db, treatment.id, day):
        return rows
    regimen = regimen_for_date(db, treatment.id, day)
    if not regimen:
        return rows
    existing_keys = {row.slot_key for row in rows}
    for slot in regimen.slots:
        if slot.slot_key in existing_keys:
            continue
        db.add(
            ScheduledIntake(
                treatment_id=treatment.id,
                regimen_id=regimen.id,
                regimen_slot_id=slot.id,
                scheduled_date=day,
                slot_key=slot.slot_key,
                label=slot.label,
                planned_time=slot.planned_time,
                planned_dose_mg=slot.dose_mg,
            )
        )
    db.commit()
    return list(
        db.scalars(
            select(ScheduledIntake)
            .where(
                ScheduledIntake.treatment_id == treatment.id,
                ScheduledIntake.scheduled_date == day,
            )
            .order_by(ScheduledIntake.planned_time)
        )
    )


def ensure_intakes_range(
    db: Session, treatment: Treatment, start_date: date, end_date: date
) -> None:
    if end_date < start_date:
        return
    current = start_date
    while current <= end_date:
        ensure_intakes_for_date(db, treatment, current)
        current = current.fromordinal(current.toordinal() + 1)


def cumulative_taken(db: Session, treatment_id: str) -> Decimal:
    value = db.scalar(
        select(func.coalesce(func.sum(ScheduledIntake.actual_dose_mg), 0)).where(
            ScheduledIntake.treatment_id == treatment_id,
            ScheduledIntake.status == "TAKEN",
        )
    )
    return Decimal(str(value or 0))


def create_regimen(
    db: Session,
    treatment: Treatment,
    actor: User,
    effective_from: date,
    slots: list[dict],
    notes: str | None = None,
) -> DoseRegimen:
    if not slots:
        raise HTTPException(status_code=422, detail="At least one dose slot is required")
    if any(Decimal(str(slot["dose_mg"])) < 0 for slot in slots):
        raise HTTPException(status_code=422, detail="Dose cannot be negative")

    previous = db.scalar(
        select(DoseRegimen)
        .where(
            DoseRegimen.treatment_id == treatment.id,
            DoseRegimen.effective_from < effective_from,
        )
        .order_by(DoseRegimen.effective_from.desc())
    )
    if previous and (previous.effective_to is None or previous.effective_to >= effective_from):
        previous.effective_to = effective_from.fromordinal(effective_from.toordinal() - 1)

    db.execute(
        delete(ScheduledIntake).where(
            ScheduledIntake.treatment_id == treatment.id,
            ScheduledIntake.scheduled_date >= effective_from,
            ScheduledIntake.status == "PENDING",
        )
    )
    existing = db.scalar(
        select(DoseRegimen).where(
            DoseRegimen.treatment_id == treatment.id,
            DoseRegimen.effective_from == effective_from,
        )
    )
    if existing:
        if db.scalar(
            select(func.count(ScheduledIntake.id)).where(
                ScheduledIntake.regimen_id == existing.id,
                ScheduledIntake.status != "PENDING",
            )
        ):
            raise HTTPException(
                status_code=409, detail="This regimen has resolved historical doses"
            )
        db.delete(existing)
        db.flush()

    following = db.scalar(
        select(DoseRegimen)
        .where(
            DoseRegimen.treatment_id == treatment.id,
            DoseRegimen.effective_from > effective_from,
        )
        .order_by(DoseRegimen.effective_from.asc())
    )

    regimen = DoseRegimen(
        treatment_id=treatment.id,
        effective_from=effective_from,
        effective_to=(following.effective_from - date.resolution) if following else None,
        notes=notes,
        created_by=actor.id,
    )
    db.add(regimen)
    db.flush()
    seen: set[str] = set()
    for index, data in enumerate(slots):
        key = str(data["slot_key"]).strip().lower()
        if not key or key in seen:
            raise HTTPException(status_code=422, detail="Dose slot keys must be unique")
        seen.add(key)
        planned = data["planned_time"]
        if isinstance(planned, str):
            planned = time.fromisoformat(planned)
        db.add(
            DoseRegimenSlot(
                regimen_id=regimen.id,
                slot_key=key,
                label=str(data["label"]).strip(),
                planned_time=planned,
                dose_mg=Decimal(str(data["dose_mg"])),
                sort_order=index,
                notes=data.get("notes"),
            )
        )
    audit(
        db,
        actor,
        "regimen_changed",
        "treatment",
        treatment.id,
        {"effective_from": effective_from.isoformat()},
    )
    queue_doctor_event(
        db,
        treatment.patient_id,
        "regimen_changed",
        "dose_regimen",
        regimen.id,
        effective_from.isoformat(),
        {
            "effective_from": effective_from.isoformat(),
            "slots": [
                {
                    "label": str(item["label"]),
                    "dose_mg": str(item["dose_mg"]),
                    "planned_time": str(item["planned_time"]),
                }
                for item in slots
            ],
        },
    )
    db.commit()
    db.refresh(regimen)
    return regimen


def resolve_intake(
    db: Session,
    intake: ScheduledIntake,
    actor: User,
    status: str,
    actual_dose_mg: Decimal | None = None,
    occurred_at: datetime | None = None,
    reason: str | None = None,
    deliberate_edit: bool = False,
) -> ScheduledIntake:
    if status not in {"TAKEN", "SKIPPED"}:
        raise HTTPException(status_code=422, detail="Unsupported intake status")
    if intake.status != "PENDING" and not deliberate_edit:
        if intake.status == status:
            return intake
        raise HTTPException(status_code=409, detail="Dose is already resolved")
    before = {
        "status": intake.status,
        "actual_dose_mg": str(intake.actual_dose_mg) if intake.actual_dose_mg is not None else None,
        "taken_at": intake.taken_at.isoformat() if intake.taken_at else None,
    }
    now = datetime.now(UTC)
    intake.status = status
    intake.resolved_at = now
    intake.resolved_by = actor.id
    if status == "TAKEN":
        actual = actual_dose_mg if actual_dose_mg is not None else intake.planned_dose_mg
        if actual < 0:
            raise HTTPException(status_code=422, detail="Dose cannot be negative")
        intake.actual_dose_mg = actual
        intake.taken_at = occurred_at or now
        intake.skipped_reason = None
    else:
        intake.actual_dose_mg = None
        intake.taken_at = None
        intake.skipped_reason = reason[:250] if reason else None
    db.flush()
    treatment = db.get(Treatment, intake.treatment_id)
    audit(
        db,
        actor,
        "dose_edited"
        if before["status"] != "PENDING"
        else ("dose_taken" if status == "TAKEN" else "dose_skipped"),
        "scheduled_intake",
        intake.id,
        {
            "before": before,
            "after": {
                "status": status,
                "actual_dose_mg": str(intake.actual_dose_mg) if intake.actual_dose_mg else None,
            },
        },
    )
    if treatment:
        queue_doctor_event(
            db,
            treatment.patient_id,
            "dose_taken" if status == "TAKEN" else "dose_skipped",
            "scheduled_intake",
            intake.id,
            intake.updated_at.isoformat(),
            {
                "label": intake.label,
                "dose_mg": str(intake.actual_dose_mg or intake.planned_dose_mg),
                "date": intake.scheduled_date.isoformat(),
            },
        )
    db.commit()
    db.refresh(intake)
    return intake
