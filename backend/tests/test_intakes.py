from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import event

from app.models import Treatment, TreatmentPause
from app.services.forecast import estimate_completion
from app.services.intakes import (
    create_regimen,
    cumulative_taken,
    ensure_intakes_for_date,
    resolve_intake,
)


def make_treatment(db, owner):
    treatment = Treatment(
        patient_id=owner.id,
        name="Course",
        medication_name="Isotretinoin",
        start_date=date(2026, 9, 22),
        status="ACTIVE",
        target_mg=Decimal("96"),
        timezone="Europe/Moscow",
    )
    db.add(treatment)
    db.commit()
    db.refresh(treatment)
    return treatment


def make_regimen(db, treatment, owner, day, morning="16", evening="16"):
    return create_regimen(
        db,
        treatment,
        owner,
        day,
        [
            {"slot_key": "morning", "label": "Morning", "planned_time": "08:00", "dose_mg": morning},
            {"slot_key": "evening", "label": "Evening", "planned_time": "20:00", "dose_mg": evening},
        ],
    )


def test_taken_skip_duplicate_and_forecast(db, owner):
    treatment = make_treatment(db, owner)
    start = treatment.start_date
    make_regimen(db, treatment, owner, start)
    rows = ensure_intakes_for_date(db, treatment, start)

    first = resolve_intake(db, rows[0], owner, "TAKEN")
    duplicate = resolve_intake(db, first, owner, "TAKEN")
    assert duplicate.id == first.id
    resolve_intake(db, rows[1], owner, "SKIPPED")
    assert cumulative_taken(db, treatment.id) == Decimal("16.000")

    forecast = estimate_completion(db, treatment, start)
    assert forecast["remaining_mg"] == Decimal("80.000")
    assert forecast["estimated_date"] == start + timedelta(days=3)


def test_forecast_without_regimen_uses_bounded_queries(db, owner):
    treatment = make_treatment(db, owner)
    statements = 0

    def count_statement(*_args):
        nonlocal statements
        statements += 1

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", count_statement)
    try:
        forecast = estimate_completion(db, treatment, treatment.start_date)
    finally:
        event.remove(engine, "before_cursor_execute", count_statement)

    assert forecast["remaining_mg"] == Decimal("96.000")
    assert forecast["estimated_date"] is None
    assert forecast["estimated_days"] is None
    assert statements <= 4


def test_regimen_change_preserves_resolved_history(db, owner):
    treatment = make_treatment(db, owner)
    start = treatment.start_date
    original = make_regimen(db, treatment, owner, start)
    rows = ensure_intakes_for_date(db, treatment, start)
    resolve_intake(db, rows[0], owner, "TAKEN")

    next_day = start + timedelta(days=1)
    newer = make_regimen(db, treatment, owner, next_day, "32", "32")
    historical = db.get(type(rows[0]), rows[0].id)
    assert historical.regimen_id == original.id
    assert historical.actual_dose_mg == Decimal("16.000")

    future = ensure_intakes_for_date(db, treatment, next_day)
    assert {x.regimen_id for x in future} == {newer.id}
    assert [x.planned_dose_mg for x in future] == [Decimal("32.000"), Decimal("32.000")]


def test_forecast_reacts_to_regimen_target_partial_day_and_pause(db, owner):
    treatment = make_treatment(db, owner)
    start = treatment.start_date
    treatment.target_mg = Decimal("320")
    db.commit()

    make_regimen(db, treatment, owner, start, "16", "16")
    baseline = estimate_completion(db, treatment, start)
    assert baseline["estimated_date"] == start + timedelta(days=9)

    make_regimen(db, treatment, owner, start, "32", "32")
    faster = estimate_completion(db, treatment, start)
    assert faster["estimated_date"] == start + timedelta(days=4)
    assert faster["estimated_date"] < baseline["estimated_date"]

    make_regimen(db, treatment, owner, start, "8", "8")
    slower = estimate_completion(db, treatment, start)
    assert slower["estimated_date"] == start + timedelta(days=19)
    assert slower["estimated_date"] > baseline["estimated_date"]

    make_regimen(db, treatment, owner, start, "16", "16")
    rows = ensure_intakes_for_date(db, treatment, start)
    resolve_intake(db, rows[0], owner, "TAKEN")
    partial = estimate_completion(db, treatment, start)
    assert partial["remaining_mg"] == Decimal("304.000")
    assert partial["estimated_date"] == start + timedelta(days=9)

    treatment.target_mg = Decimal("640")
    db.commit()
    larger_target = estimate_completion(db, treatment, start)
    assert larger_target["remaining_mg"] == Decimal("624.000")
    assert larger_target["estimated_date"] > partial["estimated_date"]

    treatment.status = "PAUSED"
    db.add(TreatmentPause(treatment_id=treatment.id, start_date=start, created_by=owner.id))
    db.commit()
    paused = estimate_completion(db, treatment, start)
    assert paused["estimated_date"] is None
    assert paused["estimated_days"] is None
