#!/usr/bin/env sh
set -eu

SRC="${1:?Usage: scripts/verify_backup.sh backups/TIMESTAMP}"
test -f "$SRC/database.dump"
test -f "$SRC/private-files.tar.gz"
test -f "$SRC/SHA256SUMS"
(cd "$SRC" && sha256sum -c SHA256SUMS)
docker compose exec -T postgres pg_restore -l < "$SRC/database.dump" >/dev/null
tar -tzf "$SRC/private-files.tar.gz" >/dev/null
echo "Backup verification passed: $SRC"
