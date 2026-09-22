from __future__ import annotations

import hashlib
import io
import secrets
from contextlib import suppress
from pathlib import Path

import filetype  # type: ignore[import-untyped]
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from app.core.config import get_settings

settings = get_settings()
register_heif_opener()
ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _detect_mime(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    kind = filetype.guess(data)
    return kind.mime if kind else None


async def read_validated_upload(upload: UploadFile, image_only: bool = False) -> tuple[bytes, str]:
    limit = settings.max_upload_mb * 1024 * 1024
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb} MB")
    if not data:
        raise HTTPException(status_code=422, detail="Empty file")
    mime = _detect_mime(data)
    allowed = IMAGE_MIME if image_only else ALLOWED_MIME
    if mime not in allowed:
        raise HTTPException(status_code=415, detail="Unsupported or unsafe file type")
    if mime in IMAGE_MIME:
        try:
            with Image.open(io.BytesIO(data)) as img:
                img.verify()
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid image") from exc
    return data, mime


def store_private(data: bytes, suffix: str = "") -> tuple[str, int, str]:
    storage_id = secrets.token_hex(24) + suffix
    path = settings.upload_dir / storage_id
    path.write_bytes(data)
    return storage_id, len(data), hashlib.sha256(data).hexdigest()


def private_path(storage_id: str) -> Path:
    if "/" in storage_id or "\\" in storage_id or ".." in storage_id:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    path = settings.upload_dir / storage_id
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return path


def store_progress_photo(data: bytes, mime: str) -> tuple[str, str, int, str, str]:
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source)
        image.load()

        if mime in {"image/heic", "image/heif", "image/jpeg"}:
            stored_format = "JPEG"
            stored_mime = "image/jpeg"
            suffix = ".jpg"
            if image.mode != "RGB":
                image = image.convert("RGB")
            save_options = {"quality": 94, "optimize": True}
        elif mime == "image/png":
            stored_format = "PNG"
            stored_mime = "image/png"
            suffix = ".png"
            save_options = {"optimize": True}
        elif mime == "image/webp":
            stored_format = "WEBP"
            stored_mime = "image/webp"
            suffix = ".webp"
            save_options = {"quality": 94}
        else:
            raise HTTPException(status_code=415, detail="Unsupported image type")

        original_buffer = io.BytesIO()
        image.save(original_buffer, format=stored_format, **save_options)
        clean_original = original_buffer.getvalue()

        thumb = image.copy()
        thumb.thumbnail((720, 720), Image.Resampling.LANCZOS)
        if thumb.mode != "RGB":
            thumb = thumb.convert("RGB")
        thumb_buffer = io.BytesIO()
        thumb.save(thumb_buffer, format="JPEG", quality=86, optimize=True)
        thumbnail = thumb_buffer.getvalue()

    storage_id, size, checksum = store_private(clean_original, suffix)
    thumbnail_id = secrets.token_hex(24) + ".jpg"
    (settings.thumbnail_dir / thumbnail_id).write_bytes(thumbnail)
    return storage_id, thumbnail_id, size, checksum, stored_mime


def thumbnail_path(thumbnail_id: str) -> Path:
    if "/" in thumbnail_id or "\\" in thumbnail_id or ".." in thumbnail_id:
        raise HTTPException(status_code=400, detail="Invalid thumbnail key")
    path = settings.thumbnail_dir / thumbnail_id
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return path


def delete_storage(storage_id: str, thumbnail_id: str | None = None) -> None:
    with suppress(HTTPException):
        private_path(storage_id).unlink(missing_ok=True)
    if thumbnail_id:
        path = settings.thumbnail_dir / thumbnail_id
        path.unlink(missing_ok=True)
