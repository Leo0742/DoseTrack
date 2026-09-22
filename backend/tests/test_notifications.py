from datetime import date

from app.core.security import hash_password
from app.models import (
    DoctorAccess,
    Notification,
    NotificationPreference,
    TelegramLinkCode,
    User,
)
from app.services.notifications import queue_doctor_event, queue_notification
from tests.conftest import login


def test_notification_deduplication(db, owner):
    first = queue_notification(db, owner.id, "dose_reminder", "same-key", {"dose_mg": "16"})
    second = queue_notification(db, owner.id, "dose_reminder", "same-key", {"dose_mg": "16"})
    assert first.id == second.id
    assert db.query(Notification).count() == 1


def test_doctor_event_is_routed_to_doctor_not_patient(db, owner):
    doctor = User(
        email="notify-doctor@example.test",
        username="notify-doctor",
        password_hash=hash_password("doctor-secure-pass"),
        role="DOCTOR",
        timezone="Europe/Moscow",
    )
    db.add(doctor)
    db.flush()
    db.add(DoctorAccess(patient_id=owner.id, doctor_id=doctor.id, can_write=False))
    db.commit()

    queue_doctor_event(
        db,
        owner.id,
        "dose_skipped",
        "scheduled_intake",
        "intake-1",
        "v1",
        {"dose_mg": "16"},
    )
    db.commit()

    row = db.query(Notification).one()
    assert row.recipient_id == doctor.id
    assert row.recipient_id != owner.id
    assert row.event_type == "dose_skipped"


def test_disabled_doctor_event_preference_suppresses_notification(db, owner):
    doctor = User(
        email="quiet-doctor@example.test",
        username="quiet-doctor",
        password_hash=hash_password("doctor-secure-pass"),
        role="DOCTOR",
        timezone="Europe/Moscow",
    )
    db.add(doctor)
    db.flush()
    db.add(DoctorAccess(patient_id=owner.id, doctor_id=doctor.id, can_write=False))
    db.add(
        NotificationPreference(
            user_id=doctor.id,
            event_type="document_uploaded",
            telegram_enabled=False,
        )
    )
    db.commit()

    queue_doctor_event(
        db,
        owner.id,
        "document_uploaded",
        "document",
        "document-1",
        "v1",
        {"title": "Analysis"},
    )
    db.commit()

    assert db.query(Notification).count() == 0


def test_notification_preferences_have_defaults_and_can_be_saved(client, db):
    doctor = User(
        email="prefs-doctor@example.test",
        username="prefs-doctor",
        password_hash=hash_password("doctor-secure-pass"),
        role="DOCTOR",
        timezone="Europe/Moscow",
    )
    db.add(doctor)
    db.commit()

    csrf = login(client, doctor.username, "doctor-secure-pass")
    client.headers.update({"x-csrf-token": csrf})

    response = client.get("/api/notification-preferences")
    assert response.status_code == 200
    defaults = {item["event_type"]: item for item in response.json()}
    assert defaults["dose_taken"]["telegram_enabled"] is True
    assert defaults["document_uploaded"]["direct_files"] is False

    response = client.put(
        "/api/notification-preferences",
        json={
            "event_type": "document_uploaded",
            "telegram_enabled": True,
            "direct_files": True,
        },
    )
    assert response.status_code == 200

    saved = {
        item["event_type"]: item
        for item in client.get("/api/notification-preferences").json()
    }
    assert saved["document_uploaded"]["telegram_enabled"] is True
    assert saved["document_uploaded"]["direct_files"] is True


def test_patient_notification_preferences_are_separate_from_doctor_events(owner_client):
    response = owner_client.get("/api/notification-preferences")
    assert response.status_code == 200
    prefs = {item["event_type"]: item for item in response.json()}
    assert set(prefs) == {"dose_reminder_morning", "dose_reminder_evening"}
    assert prefs["dose_reminder_morning"]["telegram_enabled"] is True

    saved = owner_client.put(
        "/api/notification-preferences",
        json={
            "event_type": "dose_reminder_evening",
            "telegram_enabled": False,
            "direct_files": False,
        },
    )
    assert saved.status_code == 200
    prefs = {
        item["event_type"]: item
        for item in owner_client.get("/api/notification-preferences").json()
    }
    assert prefs["dose_reminder_evening"]["telegram_enabled"] is False


def test_telegram_link_code_is_stored_as_hash(owner_client, db):
    response = owner_client.post("/api/telegram/link-code")
    assert response.status_code == 200
    code = response.json()["code"]
    row = db.query(TelegramLinkCode).one()
    assert row.code_hash != code
    assert len(row.code_hash) == 64


def test_weight_history_does_not_modify_treatment(owner_client):
    from tests.test_api_security import create_course_and_regimen

    before = create_course_and_regimen(owner_client)["treatment"]
    response = owner_client.post(
        "/api/weights",
        json={"recorded_date": str(date.today()), "weight_kg": 65.4, "note": "Morning"},
    )
    assert response.status_code == 200
    after = owner_client.get("/api/treatment").json()
    assert after["target_mg"] == before["target_mg"]
    assert after["daily_planned_mg"] == before["daily_planned_mg"]
