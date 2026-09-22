#!/usr/bin/env sh
set -eu
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="${BACKUP_ROOT:-backups}"
OUT="${1:-$ROOT/$STAMP}"
TMP="${OUT}.partial.$$"
trap 'rm -rf "$TMP"' EXIT INT TERM
mkdir -p "$TMP"

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP/database.dump"
docker compose exec -T backend sh -c 'tar -C /data -czf - uploads thumbnails 2>/dev/null || tar -C /data -czf - .' > "$TMP/private-files.tar.gz"
(cd "$TMP" && sha256sum database.dump private-files.tar.gz > SHA256SUMS)
docker compose exec -T postgres pg_restore -l < "$TMP/database.dump" >/dev/null
tar -tzf "$TMP/private-files.tar.gz" >/dev/null
(cd "$TMP" && sha256sum -c SHA256SUMS >/dev/null)
mkdir -p "$(dirname "$OUT")"
mv "$TMP" "$OUT"
trap - EXIT INT TERM

if [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ]; then
  restic backup "$OUT"
fi

# Local retention is deliberately bounded so backups cannot fill the server.
# Off-server restic backups, when configured, are not affected by this cleanup.
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime +45 -exec rm -rf -- {} + 2>/dev/null || true

echo "Backup created: $OUT"
