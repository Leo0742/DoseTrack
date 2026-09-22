import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import access, auth, content, treatment
from app.core.config import get_settings
from app.db import SessionLocal

settings = get_settings()
logging.basicConfig(level=logging.INFO)
app = FastAPI(
    title="DoseTrack API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api")
app.include_router(treatment.router, prefix="/api")
app.include_router(content.router, prefix="/api")
app.include_router(access.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/readiness")
def readiness():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
