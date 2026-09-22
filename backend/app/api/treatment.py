from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    IntakeResolve,
    RegimenCreate,
    TargetUpdate,
    TreatmentCreate,
    TreatmentStatusUpdate,
)
from app.core.deps import current_user, require_patient_write, resolve_patient_id
from app.db import get_db
from app.models import DoseRegimen, ScheduledIntake, Treatment, TreatmentPause, User
from app.services.audit import audit
from app.services.forecast import current_daily_planned, estimate_completion
from app.services.intakes import (
    active_treatment,
    create_regimen,
    cumulative_taken,
    ensure_intakes_for_date,
    ensure_intakes_range,
    resolve_intake,
)
from app.services.notifications import queue_doctor_event

router = APIRouter(tags=["treatment"])


def local_today(treatment: Treatment) -> date:
    return datetime.now(ZoneInfo(treatment.timezone)).date()


def intake_dict(row: ScheduledIntake) -> dict:
    return {
        "id": row.id,
        "date": row.scheduled_date,
        "slot_key": row.slot_key,
        "label": row.label,
        "planned_time": row.planned_time,
        "planned_dose_mg": float(row.planned_dose_mg),
        "status": row.status,
        "actual_dose_mg": float(row.actual_dose_mg) if row.actual_dose_mg is not None else None,
        "taken_at": row.taken_at,
        "skipped_reason": row.skipped_reason,
    }


def treatment_dict(db: Session, treatment: Treatment, as_of: date) -> dict:
    cumulative = cumulative_taken(db, treatment.id)
    forecast = estimate_completion(db, treatment, as_of)
    return {
        "id": treatment.id,
        "name": treatment.name,
        "medication_name": treatment.medication_name,
        "start_date": treatment.start_date,
        "status": treatment.status,
        "target_mg": float(treatment.target_mg),
        "timezone": treatment.timezone,
        "notes": treatment.notes,
        "cumulative_mg": float(cumulative),
        "remaining_mg": float(max(Decimal(treatment.target_mg) - cumulative, Decimal("0"))),
        "percent": min(float(cumulative / Decimal(treatment.target_mg) * 100), 100.0)
        if treatment.target_mg
        else 0,
        "daily_planned_mg": float(current_daily_planned(db, treatment, as_of)),
        "estimated_completion_date": forecast["estimated_date"],
        "estimated_days": forecast["estimated_days"],
        "estimate_label": "Estimated based on current regimen",
    }


@router.post("/treatments")
def create_treatment(
    payload: TreatmentCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {"OWNER", "PATIENT"}:
        raise HTTPException(status_code=403, detail="Patient access required")
    if active_treatment(db, user.id):
        raise HTTPException(status_code=409, detail="An active treatment already exists")
    try:
        ZoneInfo(payload.timezone)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid IANA timezone") from exc
    treatment = Treatment(
        patient_id=user.id,
        name=payload.name,
        medication_name=payload.medication_name,
        start_date=payload.start_date,
        target_mg=payload.target_mg,
        timezone=payload.timezone,
        notes=payload.notes,
        status="ACTIVE",
    )
    db.add(treatment)
    db.flush()
    audit(db, user, "treatment_created", "treatment", treatment.id)
    db.commit()
    return treatment_dict(db, treatment, payload.start_date)


@router.get("/treatment")
def get_treatment(user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient_id = resolve_patient_id(db, user)
    treatment = active_treatment(db, patient_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="No active treatment")
    today = local_today(treatment)
    return treatment_dict(db, treatment, today)


@router.patch("/treatment/target")
def update_target(
    payload: TargetUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    patient_id = resolve_patient_id(db, user)
    require_patient_write(db, user, patient_id)
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="Explicit confirmation is required")
    treatment = active_treatment(db, patient_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="No active treatment")
    before = str(treatment.target_mg)
    treatment.target_mg = payload.target_mg
    audit(
        db,
        user,
        "target_changed",
        "treatment",
        treatment.id,
        {"before_mg": before, "after_mg": str(payload.target_mg)},
    )
    queue_doctor_event(
        db,
        patient_id,
        "target_changed",
        "treatment",
        treatment.id,
        str(payload.target_mg),
        {"before_mg": before, "after_mg": str(payload.target_mg)},
    )
    db.commit()
    return treatment_dict(db, treatment, local_today(treatment))


@router.patch("/treatment/status")
def update_treatment_status(
    payload: TreatmentStatusUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    patient_id = resolve_patient_id(db, user)
    require_patient_write(db, user, patient_id)
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="Explicit confirmation is required")
    if payload.status not in {"ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"}:
        raise HTTPException(status_code=422, detail="Unsupported treatment status")
    treatment = active_treatment(db, patient_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="No active treatment")
    before = treatment.status
    if payload.status == "PAUSED" and before != "PAUSED":
        db.add(
            TreatmentPause(
                treatment_id=treatment.id,
                start_date=payload.effective_date,
                created_by=user.id,
            )
        )
        db.execute(
            delete(ScheduledIntake).where(
                ScheduledIntake.treatment_id == treatment.id,
                ScheduledIntake.scheduled_date >= payload.effective_date,
                ScheduledIntake.status == "PENDING",
            )
        )
    elif payload.status == "ACTIVE" and before == "PAUSED":
        pause = db.scalar(
            select(TreatmentPause)
            .where(TreatmentPause.treatment_id == treatment.id, TreatmentPause.end_date.is_(None))
            .order_by(TreatmentPause.start_date.desc())
        )
        if pause:
            pause.end_date = payload.effective_date - timedelta(days=1)
    treatment.status = payload.status
    audit(
        db,
        user,
        "treatment_status_changed",
        "treatment",
        treatment.id,
        {"before": before, "after": payload.status, "effective_date": str(payload.effective_date)},
    )
    db.commit()
    return treatment_dict(db, treatment, payload.effective_date)


@router.post("/treatment/regimens")
def add_regimen(
    payload: RegimenCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    patient_id = resolve_patient_id(db, user)
    require_patient_write(db, user, patient_id)
    treatment = active_treatment(db, patient_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="No active treatment")
    regimen = create_regimen(
        db,
        treatment,
        user,
        payload.effective_from,
        [slot.model_dump() for slot in payload.slots],
        payload.notes,
    )
    return {
        "id": regimen.id,
        "effective_from": regimen.effective_from,
        "slots": [
            {
                "slot_key": slot.slot_key,
                "label": slot.label,
                "planned_time": slot.planned_time,
                "dose_mg": float(slot.dose_mg),
            }
            for slot in regimen.slots
        ],
    }


@router.get("/treatment/regimens")
def list_regimens(user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient_id = resolve_patient_id(db, user)
    treatment = active_treatment(db, patient_id)
    if not treatment:
        return []
    rows = db.scalars(
        select(DoseRegimen)
        .where(DoseRegimen.treatment_id == treatment.id)
        .order_by(DoseRegimen.effective_from.desc())
    )
    return [
        {
            "id": row.id,
            "effective_from": row.effective_from,
            "effective_to": row.effective_to,
            "notes": row.notes,
            "slots": [
                {
                    "slot_key": slot.slot_key,
                    "label": slot.label,
                    "planned_time": slot.planned_time,
                    "dose_mg": float(slot.dose_mg),
                }
                for slot in row.slots
            ],
        }
        for row in rows
    ]


@router.get("/today")
def today(user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient_id = resolve_patient_id(db, user)
    treatment = active_treatment(db, patient_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="No active treatment")
    local_day = local_today(treatment)
    rows = ensure_intakes_for_date(db, treatment, local_day)
    return {
        "date": local_day,
        "treatment": treatment_dict(db, treatment, local_day),
        "intakes": [intake_dict(row) for row in rows],
    }


@router.put("/intakes/{intake_id}")
def update_intake(
    intake_id: str,
    payload: IntakeResolve,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    row = db.get(ScheduledIntake, intake_id)
    if not row:
        raise HTTPException(status_code=404, detail="Dose not found")
    treatment = db.get(Treatment, row.treatment_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="Treatment not found")
    patient_id = resolve_patient_id(db, user)
    if treatment.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    require_patient_write(db, user, patient_id)
    row = resolve_intake(
        db,
        row,
        user,
        payload.status,
        payload.actual_dose_mg,
        payload.occurred_at,
        payload.reason,
        payload.deliberate_edit,
    )
    return intake_dict(row)


@router.get("/history")
def history(
    start: date | None = None,
    end: date | None = None,
    status: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    patient_id = resolve_patient_id(db, user)
    treatment = active_treatment(db, patient_id)
    if not treatment:
        return []
    today_local = local_today(treatment)
    materialize_start = max(start or treatment.start_date, treatment.start_date)
    materialize_end = min(end or today_local, today_local)
    ensure_intakes_range(db, treatment, materialize_start, materialize_end)
    stmt = select(ScheduledIntake).where(ScheduledIntake.treatment_id == treatment.id)
    if start:
        stmt = stmt.where(ScheduledIntake.scheduled_date >= start)
    if end:
        stmt = stmt.where(ScheduledIntake.scheduled_date <= end)
    if status:
        stmt = stmt.where(ScheduledIntake.status == status.upper())
    rows = db.scalars(
        stmt.order_by(ScheduledIntake.scheduled_date.desc(), ScheduledIntake.planned_time)
    )
    return [intake_dict(row) for row in rows]


@router.get("/progress")
def progress(user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient_id = resolve_patient_id(db, user)
    treatment = active_treatment(db, patient_id)
    if not treatment:
        raise HTTPException(status_code=404, detail="No active treatment")
    today_local = local_today(treatment)
    ensure_intakes_range(db, treatment, treatment.start_date, today_local)
    rows = list(
        db.scalars(
            select(ScheduledIntake)
            .where(ScheduledIntake.treatment_id == treatment.id)
            .order_by(ScheduledIntake.scheduled_date, ScheduledIntake.planned_time)
        )
    )
    running = Decimal("0")
    cumulative: list[dict] = []
    monthly: dict[str, Decimal] = {}
    by_day: dict[str, dict] = {}
    taken = skipped = 0
    for row in rows:
        key = row.scheduled_date.isoformat()
        day = by_day.setdefault(key, {"taken": 0, "skipped": 0, "pending": 0, "mg": Decimal("0")})
        if row.status == "TAKEN":
            dose = Decimal(row.actual_dose_mg or 0)
            running += dose
            taken += 1
            day["taken"] += 1
            day["mg"] += dose
            month = row.scheduled_date.strftime("%Y-%m")
            monthly[month] = monthly.get(month, Decimal("0")) + dose
            cumulative.append({"date": row.scheduled_date, "mg": float(running)})
        elif row.status == "SKIPPED":
            skipped += 1
            day["skipped"] += 1
        else:
            day["pending"] += 1
    resolved = taken + skipped
    return {
        "summary": {
            **treatment_dict(db, treatment, today_local),
            "taken_doses": taken,
            "skipped_doses": skipped,
            "adherence_percent": round(taken / resolved * 100, 1) if resolved else None,
        },
        "cumulative": cumulative,
        "monthly": [
            {"month": month, "mg": float(value)} for month, value in sorted(monthly.items())
        ],
        "calendar": [
            {
                "date": key,
                **{k: float(v) if isinstance(v, Decimal) else v for k, v in value.items()},
            }
            for key, value in sorted(by_day.items())
        ],
    }
