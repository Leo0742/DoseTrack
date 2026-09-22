from datetime import date

from app.core.security import hash_password
from app.models import DoctorAccess, User
from tests.conftest import login


def create_course_and_regimen(client):
    response = client.post(
        "/api/treatments",
        json={
            "name": "Course",
            "medication_name": "Isotretinoin",
            "start_date": str(date.today()),
            "target_mg": 9750,
            "timezone": "Europe/Moscow",
        },
    )
    assert response.status_code == 200, response.text
    response = client.post(
        "/api/treatment/regimens",
        json={
            "effective_from": str(date.today()),
            "slots": [
                {"slot_key": "morning", "label": "Morning", "planned_time": "08:00", "dose_mg": 16},
                {"slot_key": "evening", "label": "Evening", "planned_time": "20:00", "dose_mg": 16},
            ],
        },
    )
    assert response.status_code == 200, response.text
    today = client.get("/api/today")
    assert today.status_code == 200
    return today.json()


def test_duplicate_api_does_not_double_count(owner_client):
    today = create_course_and_regimen(owner_client)
    intake_id = today["intakes"][0]["id"]
    first = owner_client.put(f"/api/intakes/{intake_id}", json={"status": "TAKEN"})
    second = owner_client.put(f"/api/intakes/{intake_id}", json={"status": "TAKEN"})
    assert first.status_code == 200
    assert second.status_code == 200
    progress = owner_client.get("/api/progress").json()["summary"]
    assert progress["cumulative_mg"] == 16.0


def test_doctor_can_read_but_cannot_edit(client, owner_client, db, owner):
    today = create_course_and_regimen(owner_client)
    doctor = User(
        email="doctor@example.test",
        username="doctor",
        password_hash=hash_password("doctor-secure-pass"),
        role="DOCTOR",
        timezone="Europe/Moscow",
    )
    db.add(doctor)
    db.flush()
    db.add(DoctorAccess(patient_id=owner.id, doctor_id=doctor.id, can_write=False))
    db.commit()

    doctor_client = type(client)(client.app)
    csrf = login(doctor_client, "doctor", "doctor-secure-pass")
    doctor_client.headers.update({"x-csrf-token": csrf})
    assert doctor_client.get("/api/progress").status_code == 200
    patient_profile = doctor_client.get("/api/patient/profile")
    assert patient_profile.status_code == 200
    assert patient_profile.json()["username"] == owner.username
    intake_id = today["intakes"][0]["id"]
    denied = doctor_client.put(f"/api/intakes/{intake_id}", json={"status": "TAKEN"})
    assert denied.status_code == 403


def test_owner_can_update_profile_without_changing_treatment(owner_client):
    before = create_course_and_regimen(owner_client)["treatment"]
    response = owner_client.put(
        "/api/auth/profile",
        json={
            "first_name": "Demo",
            "last_name": "Patient",
            "birth_date": "2000-04-12",
            "height_cm": 181,
        },
    )
    assert response.status_code == 200, response.text
    profile = response.json()
    assert profile["first_name"] == "Demo"
    assert profile["height_cm"] == 181.0
    after = owner_client.get("/api/treatment").json()
    assert after["target_mg"] == before["target_mg"]
    assert after["daily_planned_mg"] == before["daily_planned_mg"]


def test_legacy_placeholder_email_does_not_block_profile_update(owner_client):
    response = owner_client.put(
        "/api/auth/profile",
        json={
            "email": "owner@example.test",
            "first_name": "Leonid",
            "last_name": "Patient",
            "birth_date": "2000-04-12",
            "height_cm": 181,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["first_name"] == "Leonid"

    invalid = owner_client.put(
        "/api/auth/profile",
        json={"email": "not-an-email", "first_name": "Leonid"},
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"] == "Enter a valid email address"


def test_private_document_owner_and_authorized_doctor(client, owner_client, db, owner):
    create_course_and_regimen(owner_client)
    uploaded = owner_client.post(
        "/api/documents",
        data={"title": "Blood test"},
        files={"file": ("labs.pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "application/pdf")},
    )
    assert uploaded.status_code == 200, uploaded.text
    doc_id = uploaded.json()["id"]
    assert owner_client.get(f"/api/documents/{doc_id}/content").status_code == 200

    stranger = User(
        email="stranger@example.test",
        username="stranger",
        password_hash=hash_password("stranger-secure-pass"),
        role="OWNER",
        timezone="Europe/Moscow",
    )
    db.add(stranger)
    db.commit()
    stranger_client = type(client)(client.app)
    csrf = login(stranger_client, "stranger", "stranger-secure-pass")
    stranger_client.headers.update({"x-csrf-token": csrf})
    assert stranger_client.get(f"/api/documents/{doc_id}/content").status_code == 404


def test_pause_preserves_resolved_history_and_resume_recreates_pending(owner_client):
    today = create_course_and_regimen(owner_client)
    morning_id = today["intakes"][0]["id"]
    taken = owner_client.put(f"/api/intakes/{morning_id}", json={"status": "TAKEN"})
    assert taken.status_code == 200

    paused = owner_client.patch(
        "/api/treatment/status",
        json={"status": "PAUSED", "effective_date": str(date.today()), "confirmed": True},
    )
    assert paused.status_code == 200
    paused_today = owner_client.get("/api/today").json()
    assert [(row["slot_key"], row["status"]) for row in paused_today["intakes"]] == [
        ("morning", "TAKEN")
    ]

    resumed = owner_client.patch(
        "/api/treatment/status",
        json={"status": "ACTIVE", "effective_date": str(date.today()), "confirmed": True},
    )
    assert resumed.status_code == 200
    resumed_today = owner_client.get("/api/today").json()
    assert [(row["slot_key"], row["status"]) for row in resumed_today["intakes"]] == [
        ("morning", "TAKEN"),
        ("evening", "PENDING"),
    ]


def test_doctor_invite_can_be_accepted_and_is_read_only(client, owner_client):
    create_course_and_regimen(owner_client)
    created = owner_client.post("/api/doctor/invites", json={"email": "invite-doctor@example.com"})
    assert created.status_code == 200
    token = created.json()["invite_token"]

    accepted = client.post(
        "/api/doctor/invites/accept",
        json={"token": token, "username": "invite-doctor", "password": "doctor-secure-pass"},
    )
    assert accepted.status_code == 200

    doctor_client = type(client)(client.app)
    csrf = login(doctor_client, "invite-doctor", "doctor-secure-pass")
    doctor_client.headers.update({"x-csrf-token": csrf})
    assert doctor_client.get("/api/progress").status_code == 200

    access = owner_client.get("/api/doctor/access")
    assert access.status_code == 200
    assert access.json()[0]["email"] == "invite-doctor@example.com"
    assert access.json()[0]["can_write"] is False
