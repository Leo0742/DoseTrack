# Production deployment

1. Install Docker Engine with the Compose plugin.
2. Copy the repository to the server and create `.env` from `.env.example`.
3. Set long random values for `APP_SECRET_KEY` and `POSTGRES_PASSWORD`.
4. Set `CADDY_ADDRESS` to the real domain. Caddy then provisions HTTPS automatically. For an IP-only temporary deployment use `http://SERVER_IP` and set `SECURE_COOKIES=false` until HTTPS is available.
5. Set the Telegram bot token in `.env` if Telegram integration is enabled.
6. Start the stack: `docker compose up -d --build`.
7. Bootstrap the owner once: `docker compose exec backend python -m app.bootstrap`.
8. Remove `BOOTSTRAP_OWNER_PASSWORD` from `.env` after the owner exists and restart backend: `docker compose up -d --force-recreate backend`.

Database migrations run automatically when the backend container starts. `/health` checks the process and `/readiness` checks database connectivity.

## Telegram

The worker runs aiogram polling. In the website open Settings → Telegram, generate a one-time code, then send `/start CODE` to the bot. Telegram user IDs are discovered during that linking flow and are never hardcoded.

## Doctor onboarding

The owner creates an invite from Settings → Doctor access. The invite token is short-lived and should be sent over a trusted channel. Doctor accounts are read-only by default.

## Backups

Run `scripts/backup.sh`. Example daily cron entry:

```cron
15 3 * * * cd /opt/dosetrack && ./scripts/backup.sh >> /var/log/dosetrack-backup.log 2>&1
```

For off-server encrypted backups, configure a restic repository and credentials in the service environment. The local backup works without restic.

Restore into a maintenance window with `scripts/restore.sh backups/TIMESTAMP`, then run `scripts/verify_restore.sh`. Restore verification checks database row counts, private-file volume contents, and the health endpoint.
