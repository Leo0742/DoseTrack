#!/usr/bin/env sh
set -eu

SRC="${1:?Usage: scripts/restore.sh backups/TIMESTAMP}"
test -f "$SRC/database.dump"
test -f "$SRC/private-files.tar.gz"
(cd "$SRC" && sha256sum -c SHA256SUMS)

docker compose up -d postgres
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$SRC/database.dump"
docker compose exec -T backend sh -c 'rm -rf /data/uploads /data/thumbnails; mkdir -p /data/uploads /data/thumbnails; tar -C /data -xzf -' < "$SRC/private-files.tar.gz"
docker compose restart backend worker
echo "Restore completed from: $SRC"
