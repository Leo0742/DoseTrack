"""profile avatar, nested folders and diary comments

Revision ID: 0004_profile_folders_comments
Revises: 0003_profile_fields
Create Date: 2026-09-22
"""

import sqlalchemy as sa

from alembic import op

revision = "0004_profile_folders_comments"
down_revision = "0003_profile_fields"
branch_labels = None
depends_on = None


def _has_column(table: str, name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == name for column in inspector.get_columns(table))


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    for name, column_type in (
        ("avatar_storage_id", sa.String(length=80)),
        ("avatar_thumbnail_id", sa.String(length=80)),
        ("avatar_mime_type", sa.String(length=100)),
    ):
        if not _has_column("users", name):
            op.add_column("users", sa.Column(name, column_type, nullable=True))

    if not _has_column("photo_folders", "parent_id"):
        with op.batch_alter_table("photo_folders") as batch_op:
            batch_op.add_column(sa.Column("parent_id", sa.String(length=36), nullable=True))
            batch_op.create_foreign_key(
                "fk_photo_folders_parent_id",
                "photo_folders",
                ["parent_id"],
                ["id"],
                ondelete="CASCADE",
            )
            batch_op.create_index("ix_photo_folders_parent_id", ["parent_id"])

    if not _has_table("document_folders"):
        op.create_table(
            "document_folders",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("patient_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column(
                "parent_id",
                sa.String(length=36),
                sa.ForeignKey("document_folders.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_document_folders_patient_id", "document_folders", ["patient_id"])
        op.create_index("ix_document_folders_parent_id", "document_folders", ["parent_id"])

    if not _has_column("documents", "folder_id"):
        with op.batch_alter_table("documents") as batch_op:
            batch_op.add_column(sa.Column("folder_id", sa.String(length=36), nullable=True))
            batch_op.create_foreign_key(
                "fk_documents_folder_id",
                "document_folders",
                ["folder_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_index("ix_documents_folder_id", ["folder_id"])

    if not _has_table("diary_comments"):
        op.create_table(
            "diary_comments",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "entry_id",
                sa.String(length=36),
                sa.ForeignKey("diary_entries.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("patient_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("author_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_diary_comments_entry_id", "diary_comments", ["entry_id"])
        op.create_index("ix_diary_comments_patient_id", "diary_comments", ["patient_id"])
        op.create_index("ix_diary_comments_author_id", "diary_comments", ["author_id"])


def downgrade() -> None:
    if _has_table("diary_comments"):
        op.drop_table("diary_comments")
    if _has_column("documents", "folder_id"):
        with op.batch_alter_table("documents") as batch_op:
            batch_op.drop_column("folder_id")
    if _has_table("document_folders"):
        op.drop_table("document_folders")
    if _has_column("photo_folders", "parent_id"):
        with op.batch_alter_table("photo_folders") as batch_op:
            batch_op.drop_column("parent_id")
    for name in ("avatar_mime_type", "avatar_thumbnail_id", "avatar_storage_id"):
        if _has_column("users", name):
            with op.batch_alter_table("users") as batch_op:
                batch_op.drop_column(name)
