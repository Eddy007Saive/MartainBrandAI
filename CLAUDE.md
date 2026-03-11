# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MartainBrandAI** is a fullstack user management and admin dashboard. Users register via a Telegram invite link (which supplies `telegram_id`), await admin approval, then manage their brand profile (identity, social accounts, GPT URLs, API keys, color palette). The backend is a single-file FastAPI app; the frontend is a React SPA using shadcn/ui and Tailwind.

## Commands

### Frontend (in `frontend/`)
```bash
yarn start        # Dev server → http://localhost:3000
yarn build        # Production build
yarn test         # Jest tests (watch mode)
```

### Backend (in `backend/`)
```bash
uvicorn server:app --reload                          # Dev with auto-reload
uvicorn server:app --host 0.0.0.0 --port 8000       # Production
python ../backend_test.py                            # Integration test suite
pytest                                               # Unit tests
```

## Architecture

### Backend — `backend/server.py`
Single-file FastAPI app. All routes, Pydantic models, JWT auth logic, and Supabase client live here.

- **Auth**: HTTPBearer JWT tokens. Users get 7-day tokens; admin gets 8-hour tokens. Passwords hashed with bcrypt (rounds=12).
- **Database**: Supabase PostgreSQL. The app uses the Supabase Python client directly — it does NOT use Supabase Auth (JWT is handled by FastAPI).
- **Key routes**:
  - `POST /api/auth/register` — requires `telegram_id` (bigint)
  - `POST /api/auth/login` / `POST /api/auth/admin-login`
  - `GET|PATCH /api/users/me`
  - `GET /api/admin/users?filter=all|pending|active`
  - `PATCH /api/admin/users/{telegram_id}/activate|deactivate`
  - `DELETE /api/admin/users/{telegram_id}`

### Frontend — `frontend/src/`
React 19 SPA with React Router DOM 7.

- **`lib/api.js`** — Axios instance; request interceptor injects `Authorization: Bearer <token>`; response interceptor redirects to `/login` on 401.
- **`lib/auth.js`** — Token read/write to `localStorage`. Two separate token keys: one for users, one for admin.
- **`App.js`** — Router with `<ProtectedRoute>` guards for `/dashboard` (user) and `/admin` (admin).
- **`pages/Dashboard.jsx`** — Profile management split into 5 sidebar sections: Identity, Social, GPT URLs, API Keys, Colors.
- **`pages/Admin.jsx`** — User list with search, status filter, activate/deactivate/delete actions.
- **Path alias**: `@/` → `src/` (configured in `craco.config.js` and `jsconfig.json`).

### UI / Design System
Dark-mode-first. Design tokens live in `tailwind.config.js` (CSS variables) and the full spec is in `design_guidelines.json`.

- Background: `#020617`, Cards: `#0f172a`
- Primary gradient: `#5B6CFF → #8A6CFF`
- Accent: `#3AFFA3`
- Components from **shadcn/ui** — sources in `frontend/src/components/ui/`.

## Environment Variables

**Backend** (`backend/.env`):
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
JWT_SECRET=
ADMIN_PASSWORD=
CORS_ORIGINS=           # comma-separated allowed origins
```

**Frontend** (`.env` or hosting platform):
```
REACT_APP_BACKEND_URL=  # defaults to /api if unset
```

## Testing Protocol

`test_result.md` at the repo root tracks task status using a YAML-based protocol used by a separate testing agent. When implementing features, update this file's task status (use `done` / `in_progress` / `failed`). Run `python backend_test.py` for end-to-end API validation against a live deployment.

## Key Conventions

- All interactive elements carry `data-testid` attributes for the test suite.
- New profile fields go in the Supabase `users` table, the `UserUpdate` Pydantic model, and the relevant `Dashboard.jsx` section.
- Import UI primitives from `@/components/ui/` (shadcn/ui), never from Radix directly in page code.
- No global state library — use React `useState`/`useEffect` and pass props.
