from app.core.security import hash_password
from app.db import Base, SessionLocal, engine
from app.models import DoctorAccess, User, UserPreference


def seed() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        user = User(
            email="owner@example.test",
            username="owner",
            password_hash=hash_password("correct-horse-battery"),
            role="OWNER",
            timezone="Europe/Moscow",
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
        db.add_all([user, doctor])
        db.flush()
        db.add_all(
            [
                UserPreference(user_id=user.id),
                UserPreference(user_id=doctor.id),
                DoctorAccess(patient_id=user.id, doctor_id=doctor.id, can_write=False),
            ]
        )
        db.commit()


if __name__ == "__main__":
    seed()
