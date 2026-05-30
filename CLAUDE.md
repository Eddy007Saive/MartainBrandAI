# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MartainBrandAI** is a fullstack personal-brand content platform. A user registers via a Telegram invite link (which supplies `telegram_id`), awaits admin approval, then manages their brand profile and an AI-assisted content pipeline: generated content (`contenus`) and drafts (`brouillons`), comment management (`commentaires`), publishing schedules, social-account connections, performance analytics, and a HeyGen AI video avatar.

Much of the heavy lifting (social OAuth, content generation, publishing) is delegated to **n8n webhooks**; the FastAPI backend is largely an auth + Supabase-CRUD + webhook-proxy layer. The frontend is a React 19 SPA (CRA + CRACO) using shadcn/ui and Tailwind.

## Commands

### Frontend (in `frontend/`)
```bash
yarn start        # Dev server → http://localhost:3000 (CRACO)
yarn build        # Production build
yarn test         # Jest tests (CRACO, watch mode)
```

### Backend (in `backend/`)
```bash
# Activate the venv first (Windows): .\venv\Scripts\Activate.ps1
uvicorn server:app --reload                          # Dev with auto-reload (port 8000)
uvicorn server:app --host 0.0.0.0 --port 8000        # Production
python ../backend_test.py                            # End-to-end API test suite (hits a live deployment)
pytest                                               # Unit tests (pytest is installed; no test files committed yet)
```

> The backend `.env` lives at `backend/.env` and is loaded relative to `backend/config.py`.

## Architecture

### Backend — `backend/` (modular FastAPI)
`server.py` is a thin entrypoint: it builds an `APIRouter(prefix="/api")`, includes every domain router, and wires CORS. Everything else is split by layer:

- **`config.py`** — loads `.env`, constructs the singleton `supabase` client, and exports all secrets/config constants (`JWT_SECRET`, `ADMIN_PASSWORD`, `N8N_WEBHOOK_BASE`, HeyGen + Cloudinary keys, `CORS_ORIGINS`, `logger`). Import config from here, never re-read env vars elsewhere.
- **`dependencies.py`** — `verify_token` / `verify_admin_token` FastAPI dependencies (HTTPBearer + PyJWT). Admin is distinguished by an `is_admin` claim in the JWT.
- **`routes/<domain>.py`** — thin HTTP layer: validate input, call a service, map service errors to `HTTPException`. Each defines `router = APIRouter(prefix="/<domain>", tags=[...])`. Domains: `auth`, `users`, `admin`, `contenus`, `commentaires`, `analytics`, `brouillons`, `heygen`.
- **`services/<domain>_service.py`** — business logic and all Supabase / external calls live here. `social_service.py` and `heygen_service.py` call out to n8n webhooks, Cloudinary, and the HeyGen API.
- **`models/<domain>.py`** — Pydantic request/response models (`UserRegister`, `UserUpdate`, `ContenuUpdate`, `ScheduleUpdate`, etc.).

**The data layering rule:** routes → services → (Supabase / httpx). Keep DB access and webhook calls inside services; keep routes free of business logic. (Some short read-only routes like `brouillons.py` hit `supabase` directly — acceptable for trivial reads, but new write logic belongs in a service.)

- **Auth**: bcrypt password hashing (rounds=12). User tokens last 7 days; admin tokens 8 hours. Admin login is a single shared password (`ADMIN_PASSWORD`), not a user row. The app uses the Supabase Python client directly — it does **not** use Supabase Auth.
- **Identity key**: `telegram_id` (bigint) is the primary key for users and the foreign key threaded through every domain table; it is carried in the JWT and read as `payload.get("telegram_id")` in routes.
- **n8n integration**: `N8N_WEBHOOK_BASE` + a path (e.g. `/late-connect`, `/late-disconnect`, `/late-create-profile`). Social platforms map to `late_account_<platform>` columns; valid platforms are gated by `VALID_PLATFORMS` in `social_service.py`.
- **HeyGen avatars**: video uploaded to Cloudinary, request row saved to `heygen_avatars` with a `pending` status for admin review; one active/pending avatar per user.

### Frontend — `frontend/src/`
React 19 SPA with React Router DOM 7.

- **`App.js`** — router. Public routes (`/`, `/register`, `/pending`); `/dashboard` is guarded by `<ProtectedRoute>` and renders `<DashboardLayout>` with nested index/child routes (`contenus`, `commentaires`, `planification`, `parametres`); `/admin` is guarded by `<AdminRoute>`. Note `/` is the login page, not a landing page.
- **`lib/api.js`** — Axios instance, baseURL `${REACT_APP_BACKEND_URL}/api`. Request interceptor injects `Authorization: Bearer <token>`; response interceptor clears both tokens and redirects to `/` on 401.
- **`lib/auth.js`** — localStorage token helpers. **Two separate keys**: `token` (user) and `adminToken` (admin).
- **`services/<domain>Service.js`** — one service object per backend domain (`userService`, `contenuService`, `commentaireService`, `analyticsService`, `scheduleService`, `heygenService`, `adminService`, `authService`). These wrap `api` calls; **page components should call services, not `api` directly.** This mirrors the backend route layout.
- **`context/UserContext.jsx`** — `UserProvider` / `useUser()` holds the current user, `loading`, and `updateUser`/`refetchUser`/`logout`. Fetches `/users/me` on mount when a token exists.
- **`pages/`** — `Login`, `Register`, `Pending`, `Admin`, and the dashboard pages (`AccueilPage`, `ContenusPage`, `CommentairesPage`, `PlanificationPage`, `ParametresPage`, plus `AvatarPage`, `Dashboard`).
- **`components/`** — shared building blocks (`Sidebar`, `ProtectedRoute`, `Field`, `ColorField`, `SectionBlock`) and `ui/` (shadcn/ui primitives).
- **`constants/`** — `platforms.js`, `schedules.js` (shared enums/config for social platforms and scheduling).
- **Path alias**: `@/` → `src/` (configured in `craco.config.js` and `jsconfig.json`).

### UI / Design System
Dark-mode-first. Design tokens live in `tailwind.config.js` (CSS variables); the full spec is in `design_guidelines.json`. Toasts via `sonner`.

- Background `#020617`, Cards `#0f172a`
- Primary gradient `#5B6CFF → #8A6CFF`, Accent `#3AFFA3`
- Default per-user brand palette seeded on registration: `couleur_principale #003D2E`, `couleur_secondaire #0077FF`, `couleur_accent #3AFFA3`.

## Environment Variables

**Backend** (`backend/.env`):
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
JWT_SECRET=
ADMIN_PASSWORD=
CORS_ORIGINS=               # comma-separated; defaults to *
N8N_WEBHOOK_BASE=           # base URL for n8n webhooks (Late social, content)
HEYGEN_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

**Frontend** (`.env` or hosting platform):
```
REACT_APP_BACKEND_URL=      # base URL; /api is appended in lib/api.js
```

## Database

Supabase PostgreSQL. The canonical schema for the `users` table is in `README.md`; broader SQL (other tables) is in `sql.md`. Key tables: `users` (PK `telegram_id`), `contenus`, `brouillons`, `commentaires`, `heygen_avatars`, plus analytics/schedule tables. New user-profile fields must be added in three places: the Supabase table, the relevant `models/` Pydantic model (`UserUpdate`), and the corresponding `ParametresPage`/section in the frontend.

## Testing Protocol

`test_result.md` at the repo root tracks task status via a YAML-based protocol used by a separate testing agent (use `done` / `in_progress` / `failed`). `backend_test.py` runs end-to-end API validation against a live deployment.

## Key Conventions

- Interactive elements carry `data-testid` attributes for the test suite.
- Adding a new domain: create `routes/<d>.py` + `services/<d>_service.py` + `models/<d>.py`, register the router in `server.py`, then add a matching `services/<d>Service.js` and page on the frontend.
- Import UI primitives from `@/components/ui/` (shadcn/ui), never from Radix directly in page code.
- No global state library — use React `useState`/`useEffect`, `UserContext` for the current user, and pass props.
- User-facing strings are in French; keep new copy consistent.
