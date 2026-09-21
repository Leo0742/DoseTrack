# DoseTrack implementation plan

## Architecture
- **Frontend:** Next.js + TypeScript + Tailwind-style CSS tokens, TanStack Query, Recharts, Framer Motion, Lucide.
- **Backend:** FastAPI + SQLAlchemy 2 + PostgreSQL + Pydantic.
- **Auth:** opaque server-side sessions in HttpOnly cookies, CSRF header protection, Argon2id password hashing, login rate limiting.
- **Medication model:** versioned regimens materialize immutable scheduled intake rows; resolutions are idempotent and auditable.
- **Files:** private local storage behind authenticated endpoints, content sniffing, size/type allowlist, random object IDs, checksums, photo EXIF stripping + thumbnails.
- **Telegram:** aiogram 3 bot, one-time linking codes, backend-owned medication actions, deduplicated notifications/reminders.
- **Worker:** lightweight polling worker using PostgreSQL notification rows; no Redis/Celery.
- **Deployment:** Docker Compose, PostgreSQL 16, backend, frontend, worker/bot, Caddy; persistent DB and file volumes.
- **Backups:** pg_dump + file archive, restore scripts, optional restic.

## Delivery order
1. Repository + design system + environment contract.
2. Database schema and Alembic migration.
3. Authentication/session/authorization/audit.
4. Treatment, regimen, scheduled intake, forecasts, Today API.
5. Weight, diary, stats/calendar.
6. Private documents and progress photos.
7. Doctor access/invites.
8. Telegram linking, bot callbacks, reminders and notification history.
9. Exports, health/readiness, backups and deployment.
10. Frontend screens and responsive navigation.
11. Automated backend/frontend/E2E coverage.
12. Security, UX, visual and deployment verification passes.

## Design system
- Background: #F7F7F5; surface: #FFFFFF; text: #1B1D1F; muted: #6A6F73.
- Primary accent: #2F6B5B; success: #2E7D5B; warning: #B97825; skipped: #8B6C63; error: #B84C4C.
- Radius scale: 10 / 14 / 18 px. Shadows are restrained and only for elevated overlays.
- Type: system sans stack, dense numeric display with tabular numerals.
- Motion: 160–240 ms, reduced-motion respected.
- Mobile: 44 px minimum tap targets, bottom navigation for Today/Progress/Calendar/More.
- Desktop: 248 px sidebar, content max-width 1120 px.
- Charts: flat fills, subtle gridlines, no library-default colors, accessible text summaries.
