from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import DoseRegimen, ScheduledIntake, Treatment, TreatmentPause
from app.services.intakes import cumulative_taken, is_paused_on, regimen_for_date


def estimate_completion(db: Session, treatment: Treatment, as_of: date) -> dict:
    cumulative = cumulative_taken(db, treatment.id)
    remaining = max(Decimal(treatment.target_mg) - cumulative, Decimal("0"))
    if remaining <= 0:
        return {"remaining_mg": remaining, "estimated_date": as_of, "estimated_days": 0}

    horizon_end = as_of + timedelta(days=3649)
    regimens = list(
        db.scalars(
            select(DoseRegimen)
            .options(selectinload(DoseRegimen.slots))
            .where(
                DoseRegimen.treatment_id == treatment.id,
                DoseRegimen.effective_from <= horizon_end,
                (DoseRegimen.effective_to.is_(None)) | (DoseRegimen.effective_to >= as_of),
            )
            .order_by(DoseRegimen.effective_from.desc())
        )
    )
    if not regimens:
        return {"remaining_mg": remaining, "estimated_date": None, "estimated_days": None}

    pauses = list(
        db.scalars(
            select(TreatmentPause).where(
                TreatmentPause.treatment_id == treatment.id,
                TreatmentPause.start_date <= horizon_end,
                (TreatmentPause.end_date.is_(None)) | (TreatmentPause.end_date >= as_of),
            )
        )
    )
    resolved_slots = set(
        db.execute(
            select(ScheduledIntake.scheduled_date, ScheduledIntake.slot_key).where(
                ScheduledIntake.treatment_id == treatment.id,
                ScheduledIntake.scheduled_date >= as_of,
                ScheduledIntake.scheduled_date <= horizon_end,
                ScheduledIntake.status.in_(["TAKEN", "SKIPPED"]),
            )
        ).all()
    )

    def paused_on(day: date) -> bool:
        return any(
            pause.start_date <= day and (pause.end_date is None or pause.end_date >= day)
            for pause in pauses
        )

    def regimen_on(day: date) -> DoseRegimen | None:
        return next(
            (
                regimen
                for regimen in regimens
                if regimen.effective_from <= day
                and (regimen.effective_to is None or regimen.effective_to >= day)
            ),
            None,
        )

    simulated = Decimal("0")
    for offset in range(0, 3650):
        day = as_of + timedelta(days=offset)
        if paused_on(day):
            if treatment.status == "PAUSED" and offset == 0:
                return {"remaining_mg": remaining, "estimated_date": None, "estimated_days": None}
            continue
        regimen = regimen_on(day)
        if not regimen:
            continue
        for slot in regimen.slots:
            if (day, slot.slot_key) in resolved_slots:
                continue
            simulated += Decimal(slot.dose_mg)
            if simulated >= remaining:
                return {
                    "remaining_mg": remaining,
                    "estimated_date": day,
                    "estimated_days": offset,
                }
    return {"remaining_mg": remaining, "estimated_date": None, "estimated_days": None}


def current_daily_planned(db: Session, treatment: Treatment, day: date) -> Decimal:
    if is_paused_on(db, treatment.id, day):
        return Decimal("0")
    regimen = regimen_for_date(db, treatment.id, day)
    if not regimen:
        return Decimal("0")
    return sum((Decimal(slot.dose_mg) for slot in regimen.slots), Decimal("0"))
