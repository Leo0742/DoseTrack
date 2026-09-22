"""patient profile fields

Revision ID: 0003_profile_fields
Revises: 0002_language_photo_folders
Create Date: 2026-09-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0003_profile_fields"
down_revision = "0002_language_photo_folders"
branch_labels = None
depends_on = None


def _has_column(table: str, name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == name for column in inspector.get_columns(table))


def upgrade() -> None:
    columns = (
        ("first_name", sa.String(length=80)),
        ("last_name", sa.String(length=80)),
        ("birth_date", sa.Date()),
        ("height_cm", sa.Numeric(precision=5, scale=1)),
    )
    for name, column_type in columns:
        if not _has_column("users", name):
            op.add_column("users", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    for name in ("height_cm", "birth_date", "last_name", "first_name"):
        if _has_column("users", name):
            with op.batch_alter_table("users") as batch_op:
                batch_op.drop_column(name)
