#!/usr/bin/env sh
set -eu

docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from users; select count(*) from treatments; select count(*) from scheduled_intakes;"'
docker compose exec -T backend python -c 'from app.core.config import get_settings; s=get_settings(); print("uploads", len(list(s.upload_dir.glob("*")))); print("thumbnails", len(list(s.thumbnail_dir.glob("*"))))'
curl -fsS http://127.0.0.1/health
echo
echo "Restore verification checks completed."
