import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:////tmp/dosetrack-pytest.db"
os.environ["UPLOAD_DIR"] = "/tmp/dosetrack-pytest-uploads"
os.environ["THUMBNAIL_DIR"] = "/tmp/dosetrack-pytest-thumbs"
os.environ["SECURE_COOKIES"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import User, UserPreference


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    for folder in (Path(os.environ["UPLOAD_DIR"]), Path(os.environ["THUMBNAIL_DIR"])):
        folder.mkdir(parents=True, exist_ok=True)
        for item in folder.iterdir():
            if item.is_file():
                item.unlink()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def owner(db):
    user = User(
        email="owner@example.test",
        username="owner",
        password_hash=hash_password("correct-horse-battery"),
        role="OWNER",
        timezone="Europe/Moscow",
    )
    db.add(user)
    db.flush()
    db.add(UserPreference(user_id=user.id))
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def client():
    return TestClient(app)


def login(client: TestClient, identity: str, password: str) -> str:
    response = client.post("/api/auth/login", json={"identity": identity, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["csrf_token"]


@pytest.fixture
def owner_client(client, owner):
    csrf = login(client, owner.username, "correct-horse-battery")
    client.headers.update({"x-csrf-token": csrf})
    return client
