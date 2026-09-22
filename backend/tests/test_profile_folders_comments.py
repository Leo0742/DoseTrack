import io
from datetime import UTC, datetime

from PIL import Image

from app.core.security import hash_password
from app.models import DoctorAccess, User
from tests.conftest import login


def _jpeg() -> bytes:
    payload = io.BytesIO()
    Image.new("RGB", (48, 48), "white").save(payload, format="JPEG")
    return payload.getvalue()


def test_profile_email_uniqueness_and_avatar(owner_client, db):
    other = User(
        email="other@example.com",
        username="other",
        password_hash=hash_password("other-secure-pass"),
        role="OWNER",
        timezone="Europe/Moscow",
    )
    db.add(other)
    db.commit()

    updated = owner_client.put(
        "/api/auth/profile",
        json={"email": "new-owner@example.com", "first_name": "Demo"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["email"] == "new-owner@example.com"

    duplicate = owner_client.put(
        "/api/auth/profile",
        json={"email": "other@example.com", "first_name": "Demo"},
    )
    assert duplicate.status_code == 409

    avatar = owner_client.post(
        "/api/auth/avatar",
        files={"file": ("avatar.jpg", _jpeg(), "image/jpeg")},
    )
    assert avatar.status_code == 200, avatar.text
    profile = owner_client.get("/api/auth/profile").json()
    assert profile["has_avatar"] is True
    content = owner_client.get("/api/auth/avatar")
    assert content.status_code == 200
    assert content.headers["content-type"].startswith("image/jpeg")

    assert owner_client.delete("/api/auth/avatar").status_code == 200
    assert owner_client.get("/api/auth/avatar").status_code == 404


def test_nested_document_folders_and_move(owner_client):
    parent = owner_client.post("/api/document-folders", data={"name": "Анализы"}).json()
    child = owner_client.post(
        "/api/document-folders",
        data={"name": "Сентябрь", "parent_id": parent["id"]},
    ).json()
    uploaded = owner_client.post(
        "/api/documents",
        data={"title": "ОАК", "folder_id": child["id"]},
        files={"file": ("labs.pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "application/pdf")},
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["folder_id"] == child["id"]

    moved = owner_client.put(f"/api/documents/{uploaded.json()['id']}/folder", data={})
    assert moved.status_code == 200
    assert moved.json()["folder_id"] is None

    assert owner_client.delete(f"/api/document-folders/{parent['id']}").status_code == 200
    folders = owner_client.get("/api/document-folders").json()
    assert next(row for row in folders if row["id"] == child["id"])["parent_id"] is None


def test_patient_and_doctor_comments_are_author_owned(client, owner_client, db, owner):
    entry = owner_client.post(
        "/api/diary",
        json={
            "occurred_at": datetime(2026, 9, 22, 8, 0, tzinfo=UTC).isoformat(),
            "title": "Dry skin",
            "body": "Today skin is dry",
            "category": "skin",
            "severity": 2,
        },
    )
    assert entry.status_code == 200, entry.text
    entry_id = entry.json()["id"]
    patient_comment = owner_client.post(
        f"/api/diary/{entry_id}/comments", json={"body": "Added moisturizer"}
    )
    assert patient_comment.status_code == 200

    edited_entry = owner_client.put(
        f"/api/diary/{entry_id}",
        json={
            "occurred_at": datetime(2026, 9, 22, 9, 30, tzinfo=UTC).isoformat(),
            "title": "Dry skin edited",
            "body": "Skin is better after moisturizer",
            "category": "skin",
            "severity": 1,
        },
    )
    assert edited_entry.status_code == 200
    assert edited_entry.json()["title"] == "Dry skin edited"
    assert edited_entry.json()["body"] == "Skin is better after moisturizer"
    assert edited_entry.json()["severity"] == 1

    doctor = User(
        email="doctor-comments@example.test",
        username="doctor-comments",
        password_hash=hash_password("doctor-secure-pass"),
        role="DOCTOR",
        timezone="Europe/Moscow",
    )
    db.add(doctor)
    db.flush()
    db.add(DoctorAccess(patient_id=owner.id, doctor_id=doctor.id, can_write=False))
    db.commit()

    doctor_client = type(client)(client.app)
    csrf = login(doctor_client, doctor.username, "doctor-secure-pass")
    doctor_client.headers.update({"x-csrf-token": csrf})
    diary = doctor_client.get("/api/diary")
    assert diary.status_code == 200
    assert diary.json()[0]["comments"][0]["body"] == "Added moisturizer"

    denied = doctor_client.put(
        f"/api/diary/comments/{patient_comment.json()['id']}", json={"body": "Changed"}
    )
    assert denied.status_code == 403

    doctor_comment = doctor_client.post(
        f"/api/diary/{entry_id}/comments", json={"body": "Please monitor this"}
    )
    assert doctor_comment.status_code == 200
    edited = doctor_client.put(
        f"/api/diary/comments/{doctor_comment.json()['id']}",
        json={"body": "Please monitor for three days"},
    )
    assert edited.status_code == 200
    assert edited.json()["body"] == "Please monitor for three days"

    doctor_cannot_edit_entry = doctor_client.put(
        f"/api/diary/{entry_id}",
        json={
            "occurred_at": datetime(2026, 9, 22, 8, 0, tzinfo=UTC).isoformat(),
            "title": "Changed",
            "body": "Changed",
            "category": "skin",
            "severity": 1,
        },
    )
    assert doctor_cannot_edit_entry.status_code == 403

    owner_view = owner_client.get("/api/diary").json()[0]
    assert {comment["body"] for comment in owner_view["comments"]} == {
        "Added moisturizer",
        "Please monitor for three days",
    }
def test_diary_date_filter_uses_selected_day(owner_client):
    owner_client.post("/api/diary", json={"occurred_at":"2026-09-22T08:00:00+03:00","title":"A","body":"A","category":"other","severity":1})
    owner_client.post("/api/diary", json={"occurred_at":"2026-09-23T08:00:00+03:00","title":"B","body":"B","category":"other","severity":1})
    response = owner_client.get("/api/diary?date=2026-09-22")
    assert response.status_code == 200
    assert [entry["title"] for entry in response.json()] == ["A"]
