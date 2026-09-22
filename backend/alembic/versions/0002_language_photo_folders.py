"""language preference and photo folders

Revision ID: 0002_language_photo_folders
Revises: 0001_initial
Create Date: 2026-09-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_language_photo_folders"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, name: str) -> bool:
    return any(column["name"] == name for column in _inspector().get_columns(table))


def _has_index(table: str, name: str) -> bool:
    return any(index["name"] == name for index in _inspector().get_indexes(table))


def _has_folder_fk() -> bool:
    return any(
        fk.get("referred_table") == "photo_folders"
        and fk.get("constrained_columns") == ["folder_id"]
        for fk in _inspector().get_foreign_keys("progress_photos")
    )


def upgrade() -> None:
    if not _has_column("user_preferences", "language"):
        op.add_column(
            "user_preferences",
            sa.Column("language", sa.String(length=5), nullable=False, server_default="ru"),
        )

    if not _has_table("photo_folders"):
        op.create_table(
            "photo_folders",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("patient_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("patient_id", "name", name="uq_photo_folder"),
        )
    if not _has_index("photo_folders", "ix_photo_folders_patient_id"):
        op.create_index(op.f("ix_photo_folders_patient_id"), "photo_folders", ["patient_id"])

    if not _has_column("progress_photos", "folder_id"):
        with op.batch_alter_table("progress_photos") as batch_op:
            batch_op.add_column(sa.Column("folder_id", sa.String(length=36), nullable=True))
            batch_op.create_foreign_key(
                "fk_progress_photos_folder_id_photo_folders",
                "photo_folders",
                ["folder_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_index("ix_progress_photos_folder_id", ["folder_id"])
    else:
        if not _has_folder_fk():
            with op.batch_alter_table("progress_photos") as batch_op:
                batch_op.create_foreign_key(
                    "fk_progress_photos_folder_id_photo_folders",
                    "photo_folders",
                    ["folder_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
        if not _has_index("progress_photos", "ix_progress_photos_folder_id"):
            op.create_index(
                op.f("ix_progress_photos_folder_id"), "progress_photos", ["folder_id"]
            )


def downgrade() -> None:
    if _has_column("progress_photos", "folder_id"):
        with op.batch_alter_table("progress_photos") as batch_op:
            if _has_index("progress_photos", "ix_progress_photos_folder_id"):
                batch_op.drop_index("ix_progress_photos_folder_id")
            batch_op.drop_column("folder_id")
    if _has_table("photo_folders"):
        op.drop_table("photo_folders")
    if _has_column("user_preferences", "language"):
        with op.batch_alter_table("user_preferences") as batch_op:
            batch_op.drop_column("language")
