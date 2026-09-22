#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

check() {
  docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null &&
  docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read()" >/dev/null &&
  docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readiness', timeout=5).read()" >/dev/null &&
  docker compose exec -T frontend wget -q --spider http://127.0.0.1:3000/login &&
  test -n "$(docker compose ps --status running -q caddy)" &&
  { [ -z "${PUBLIC_BASE_URL:-}" ] || curl -fsSL --max-time 10 "${PUBLIC_BASE_URL%/}/login" >/dev/null; }
}

for _ in 1 2 3; do
  if check; then
    echo "DoseTrack healthcheck OK"
    exit 0
  fi
  sleep 5
done

echo "DoseTrack healthcheck failed after 3 attempts; restarting stateless app services" >&2
docker compose restart backend worker frontend caddy
sleep 12
check
echo "DoseTrack healthcheck recovered after restart"
