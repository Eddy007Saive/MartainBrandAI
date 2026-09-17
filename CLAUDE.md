# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Postorico** (repo name MartainBrandAI) is an AI content studio for executives, a [GoodTime BNB](https://gt-bnb.com) product. Experts calibrate a content studio on each client's voice; the client then generates, validates, and publishes posts, visuals, carousels, stories, and reels across 6 networks (LinkedIn, Instagram, Facebook, TikTok, YouTube, Google Business) in ~2h/month.

A user signs up via the public marketing site (`/register` or the brand-audit funnel `/audit-marque`), awaits admin approval, then works from a dashboard covering: an AI content studio (`contenus`/`brouillons`), image/carousel generation, animated Remotion reels, a video studio (Submagic subtitling), scheduling/publishing, unified comment inbox, performance analytics, a HeyGen AI avatar, billing/quotas, and affiliation.

**Architecture has shifted away from n8n.** Older code and some memory/docs still reference n8n webhooks, but social publishing is now direct: **Late/Zernio** (`late_service.py`, `zernio-sdk`) via API + inbound webhooks (`post.scheduled` etc. are the source of truth for status). `N8N_WEBHOOK_BASE` still exists in config for legacy paths — check whether a given feature has been migrated before assuming n8n involvement.

## Commands

### Frontend (in `frontend/`)
```bash
yarn start        # Dev server → http://localhost:3000 (CRACO). Runs scripts/blog.mjs first (builds blog data)
yarn build        # Production build. Runs scripts/verifier-env.js + scripts/blog.mjs before, scripts/prerendu.js after (static prerender for SEO)
yarn test         # Jest tests (CRACO, watch mode)
```

### Backend (in `backend/`)
```bash
# Activate the venv first (Windows): .\venv\Scripts\Activate.ps1
uvicorn server:app                                    # Dev — WITHOUT --reload (carousel/reel rendering spawns subprocesses that --reload kills)
uvicorn server:app --host 0.0.0.0 --port 8000        # Production-style
python ../backend_test.py                            # End-to-end API test suite (hits a live deployment)
pytest                                               # Unit tests (pytest is installed; no test files committed yet)
```

> `backend/.env` is loaded relative to `backend/config.py`; a root-level `.env` is also loaded (holds `api_claude` etc.). Never re-read env vars outside `config.py`.

## Architecture

### Backend — `backend/` (modular FastAPI)
`server.py` is a thin entrypoint: builds an `APIRouter(prefix="/api")`, includes every domain router, wires CORS, and starts three background asyncio loops on startup (see below).

- **`config.py`** — loads `.env` (root + backend), constructs the singleton `supabase` client, exports all secrets/config constants. Import config from here, never re-read env vars elsewhere.
- **`dependencies.py`** — `verify_token` / `verify_admin_token` FastAPI dependencies (HTTPBearer + PyJWT). Admin is distinguished by an `is_admin` claim.
- **`routes/<domain>.py`** — thin HTTP layer: validate input, call a service, map service errors to `HTTPException`. Domains (20): `auth`, `users`, `admin`, `contenus`, `commentaires`, `analytics`, `brouillons`, `heygen`, `agent`, `late`, `notifications`, `billing`, `inbox`, `accounts`, `onboarding`, `video`, `reels`, `newsletter`, `affiliation`.
- **`services/<domain>_service.py`** — business logic and all Supabase/external calls (38 files). Notably large ones: `carrousel_service.py` (Playwright carousel rendering), `reel_service.py` (Remotion reels), `agent_service.py` (Claude content generation), `newsletter_service.py`, `billing_service.py`, `late_service.py`, `mail_service.py`, `gabarit_service.py` (post templates / brand asset bank).
- **`models/<domain>.py`** — Pydantic request/response models.

**The data layering rule:** routes → services → (Supabase / httpx / Playwright / Claude / Late). Keep DB access and external calls inside services; keep routes free of business logic. Some short read-only routes hit `supabase` directly — acceptable for trivial reads, but new write logic belongs in a service.

- **Auth**: bcrypt (rounds=12). User tokens 7 days; admin tokens 8 hours. Admin is per-account (`users.is_admin=true`, email+password via `/auth/admin-login`). Login is rate-limited (`services/rate_limit.py`: 5 fails/15min per ip+email, 20/15min per ip → 429). Supabase Python client used directly — **not** Supabase Auth.
- **Identity key**: `telegram_id` is a **legacy name for a UUID** — a holdover from the v1 Telegram-invite flow. It carries no relation to Telegram today; signup is via the public form. It remains the PK for `users` and the FK threaded through every domain table, carried in the JWT and read as `payload.get("telegram_id")`.
- **Social publishing (Late/Zernio)**: `late_service.py` + `zernio-sdk`, direct API + inbound webhooks. The `post.scheduled` webhook event is the *source of truth* for a content's "Planifié" status — never set it locally without Zernio confirming. Social platforms map to `late_account_<platform>` columns; valid platforms gated by `VALID_PLATFORMS` in `social_service.py`. OAuth connect flow: `routes/late.py` `/late/oauth-callback` finalizes via `social_service.finalize_connection`.
- **Background cron loops** (started in `server.py` `startup`, all soft-failing/logging on error): analytics cache refresh (`ANALYTICS_CRON_HOURS`, default hourly), a publish-sweep safety net every 10 min (`late_service.sweep_planifies` — catches "Planifié" content whose Zernio schedule call never landed), and a weekly newsletter prep cron (Tuesday mornings Europe/Paris by default, configurable via `NEWSLETTER_JOUR`/`NEWSLETTER_HEURE`/`NEWSLETTER_TZ` — always requires Martin's manual send click, nothing auto-sends to subscribers).
- **AI generation**: Claude (`CLAUDE_API_KEY` from `api_claude` env var) for content/script generation via `agent_service.py`; OpenRouter nano-banana (`google/gemini-2.5-flash-image`) for images.
- **Carousels & reels**: carousels rendered pixel-perfect via Playwright (`carrousel_service.py`) with live retouch before validation; reels are animated MP4s via Remotion (`backend/remotion/`, Node subproject — `POST /api/reels/generer`). The Docker image installs Node 20 + ffmpeg specifically for this.
- **Video studio**: Submagic API (`submagic_service.py`) for subtitles/b-roll/zooms/music on uploaded video.
- **Billing/quotas**: Stripe subscriptions (`billing_service.py`, webhook `/api/billing/webhook`, 5 subscription events) — 14-day trial, Pro/Business plans, one-time "Pack Fondations" (EUR/USD). Quotas are **per action type** (not flat credits), with rollover of unused quota across periods (`quota_service.py`, `sql.md`/`migrations/quota_system.sql`, `quota_rollover.sql`).
- **HeyGen avatars**: video uploaded to Cloudinary, request row saved to `heygen_avatars` with `pending` status for admin review; one active/pending avatar per user.
- **Public onboarding**: `/audit-marque` funnel — Cloudflare Turnstile anti-bot (test keys by default, must be swapped before real launch), Cloudinary uploads, capacity limits (`onboarding_service.py`).
- **Emails**: Resend (`mail_service.py`) — forgot-password, admin notifications (new brand audits), lead replies. Resend test mode requires a verified sending domain before real sends work.

### Frontend — `frontend/src/`
React 19 SPA (CRA + CRACO), React Router DOM 7. Also wrapped in Capacitor (`@capacitor/*` deps) for an Android app build.

- **`App.js`** — router. Public marketing routes are declared **once** in `routesPubliques()` and mounted three times: French at `/`, then English/Spanish prefixed under `/en`, `/es` (`PREFIXEES` from `lib/langues`) — adding a public page there adds it in all three languages automatically. `/dashboard` is guarded by `<ProtectedRoute>` and renders `DashboardLayout` with nested routes (`studio`, `video`, `reel`, `plan`, `contenus`, `commentaires`, `performance`, `planification`, `carrousels`, `affiliation`, `parametres`); `/admin` is guarded by `<AdminRoute>`.
- **`pages/marketing/`** — the public marketing site (home, features, pricing, FAQ, blog + article, legal pages) sharing `MarketingLayout`. The blog is server-data-driven via `scripts/blog.mjs` at build/dev time and static-prerendered via `scripts/prerendu.js` for SEO.
- **`lib/api.js`** — Axios instance, baseURL `${REACT_APP_BACKEND_URL}/api`. Request interceptor injects `Authorization: Bearer <token>`; response interceptor clears tokens and redirects to `/` on 401.
- **`lib/auth.js`** — localStorage token helpers. **Two separate keys**: `token` (user) and `adminToken` (admin).
- **`lib/langues.js`** / **`components/LangueParUrl.jsx`** — URL is the source of truth for language (path-prefix based); sets canonical + hreflang tags.
- **`services/<domain>Service.js`** — one service object per backend domain, wrapping `api` calls. **Page components call services, not `api` directly.**
- **`context/UserContext.jsx`** — `UserProvider` / `useUser()`: current user, `loading`, `updateUser`/`refetchUser`/`logout`. Fetches `/users/me` on mount when a token exists.
- **`locales/{fr,es,en}.json`** — i18next translation catalogs (i18next + react-i18next + browser-language-detector). French is the default/reference language; keep new UI copy French-first and add translations to all three files.
- **`components/`** — shared building blocks (`Sidebar`, `ProtectedRoute`, `QuotaGauge`, `NotificationsBell`, `PerformanceCurve`, `PostManuelDialog`, `AccountSwitcher`, auth pieces) plus `ui/` (shadcn/ui primitives) and `admin/`.
- **Path alias**: `@/` → `src/` (configured in `craco.config.js` and `jsconfig.json`).

### UI / Design System
Dark-mode-first. Design tokens live in `tailwind.config.js` (CSS variables); full spec in `design_guidelines.json`. Toasts via `sonner`.

- Background `#020617`, Cards `#0f172a`
- Primary gradient `#5B6CFF → #8A6CFF`, Accent `#3AFFA3`
- Default per-user brand palette seeded on registration: `couleur_principale #003D2E`, `couleur_secondaire #0077FF`, `couleur_accent #3AFFA3`.

## Environment Variables

Never re-read env vars outside `backend/config.py` — it is the canonical list. Key groups: Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — currently falls back to anon key, see comment in `config.py`), auth (`JWT_SECRET`), CORS (`CORS_ORIGINS`, comma-separated, whitespace-trimmed), Claude (`api_claude`/`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`), OpenRouter (`OPENROUTER_API_KEY`/`api_openrouter`), HeyGen (`HEYGEN_API_KEY`), Cloudinary (`CLOUDINARY_*`), Submagic (`SUBMAGIC_API_KEY`, `SUBMAGIC_DEFAULT_THEME_ID`), Turnstile (`TURNSTILE_SECRET_KEY`), Resend (`RESEND_API_KEY`/`api_resend`, `RESEND_FROM`, `ADMIN_NOTIF_EMAIL`), Late/Zernio (`LATE_API_KEY`/`api_late`, `LATE_API_BASE`, `LATE_WEBHOOK_SECRET`), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_PACK_EUR`, `STRIPE_PRICE_PACK_USD`), plus `FRONTEND_URL`, `BACKEND_URL`, `ANALYTICS_CRON_HOURS`, `NEWSLETTER_*`.

**Frontend** (`.env` or hosting platform): `REACT_APP_BACKEND_URL` (base URL; `/api` is appended in `lib/api.js`).

## Database

Supabase PostgreSQL, accessed via the Python client directly (no Supabase Auth, RLS bypassed server-side by the service-role key). Reference schema lives in `sql.md`; one-off schema changes are tracked as individual files in `migrations/` (apply manually — there's no migration runner). Key tables: `users` (PK `telegram_id`, a UUID despite the name), `contenus`, `brouillons`, `commentaires`, `heygen_avatars`, plus analytics/schedule/quota/billing tables. New user-profile fields must be added in three places: the Supabase table, the relevant `models/` Pydantic model, and the corresponding section of `ParametresPage`.

## Deployment

- **Backend**: Railway, Docker build (`backend/Dockerfile`) from the official Playwright Python image, plus ffmpeg (video compression) and Node 20 (Remotion reel rendering) installed on top. Entrypoint `python server.py` (reads `$PORT`).
- **Frontend**: Vercel, deployed from `main`.
- **Branch flow**: work happens on `dev`; merging `dev` → `main` (fast-forward) is a production deploy. **Never merge to `main` without an explicit request from the user** — treat it as a deploy action requiring confirmation.
- **Keep `main` a strict ancestor of `dev` — never cherry-pick or commit directly on `main`.** Before touching `main`, run `git fetch && git cherry -v origin/dev origin/main` (lines marked `+` are commits that exist only on `main`; `-` are copies of `dev` commits) and report the gap to the user. If a hotfix must land on `main` directly, merge `main` back into `dev` immediately. After each deploy, fast-forward `dev` onto `main` and check that `git rev-list --count origin/dev..origin/main` is 0. (On 2026-09-03 a `dev` → `main` merge needed 14 conflicts resolved because 27 `dev` commits had been re-applied on `main` by hand under other hashes.)
- **Stripe**: Live webhook → `https://<backend>/api/billing/webhook`.

## Testing Protocol

`test_result.md` at the repo root tracks task status via a YAML-based protocol used by a separate testing agent (`done` / `in_progress` / `failed`). `backend_test.py` runs end-to-end API validation against a live deployment.

## Key Conventions

- Interactive elements carry `data-testid` attributes for the test suite.
- Adding a new domain: create `routes/<d>.py` + `services/<d>_service.py` + `models/<d>.py`, register the router in `server.py`, then add a matching `services/<d>Service.js` and page on the frontend.
- Import UI primitives from `@/components/ui/` (shadcn/ui), never from Radix directly in page code.
- No global state library — `useState`/`useEffect`, `UserContext` for the current user, props otherwise.
- User-facing strings are French-first; add English/Spanish to `locales/{en,es}.json` for anything user-visible on the public site.
- Never commit `backend/.env`, `stripe-site/`, or personal files.
