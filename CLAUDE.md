# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
```

No lint or test scripts are configured.

## Architecture

**Next.js 14 App Router** admin dashboard for a food delivery service (Солнечный день). TypeScript + Tailwind CSS + Supabase.

### Route Structure

```
app/
├── page.tsx                # Redirects to /active-orders
├── login/                  # Public auth page (with MFA step)
└── (admin)/                # Route group — all protected admin pages
    ├── layout.tsx           # Wraps all admin pages with Sidebar + AuthGuard + AdminProvider
    ├── active-orders/       # Real-time order board (new → preparing → on_the_way → ready_for_pickup)
    ├── completed-orders/    # Order history
    ├── menu-editor/         # Menu item CRUD with drag-and-drop (@dnd-kit)
    ├── menu/availability/   # Menu availability by city
    ├── menu/schedule/       # Menu schedule by day
    ├── cities/              # City management
    ├── clients/             # Guest management
    ├── restaurants/         # Restaurant management
    ├── promos/              # Promo codes
    ├── users/               # Admin user management
    └── settings/            # MFA (TOTP) management — available to all roles
```

### Auth & RBAC Flow

`middleware.ts` → server-side Supabase session check → `AuthGuard.tsx` (client spinner) → `AdminContext.tsx` (role detection)

Two roles stored in Supabase DB:
- **Superadmin** (`admins` table) — full access to all routes and all cities
- **Operator** (`operators` table) — city-scoped; `cityId` is used to filter all data queries

`AdminContext` exposes `{ isAdmin, cityId, loaded }` — use this context in any component that needs role-based filtering.

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase/client.ts` | Browser Supabase client (for client components) |
| `src/lib/supabase/server.ts` | Server Supabase client with cookies (for server components / middleware) |
| `src/lib/utils.ts` | `cn()`, `formatPrice()`, `OrderStatus` type, status label/color mappings |
| `src/lib/validateImageFile.ts` | Magic-byte MIME validation for uploads (JPEG/PNG/WebP, max 5 MB) |
| `src/middleware.ts` | Auth check, nonce-based CSP (`strict-dynamic`), superadmin-only route enforcement |
| `src/components/layout/AdminContext.tsx` | Role + cityId context provider |
| `src/components/layout/Sidebar.tsx` | Nav with role-based link filtering |
| `tailwind.config.js` | Custom brand colors, animations, shadows |
| `src/app/globals.css` | Component layer classes: `.btn-*`, `.input`, `.card`, `.table`, `.badge`, `.skeleton` |
| `rls_policies.sql` | All Supabase RLS policies (apply in Supabase SQL Editor) |

### Supabase Patterns

- **Real-time:** Active orders page subscribes to `postgres_changes` for live order updates
- **Server vs Client:** Import from `lib/supabase/server.ts` in Server Components and `lib/supabase/client.ts` in Client Components (`'use client'`)
- **Auth:** Email/password via Supabase Auth; session managed via cookies in middleware
- **Self-hosted:** Supabase runs on VPS `VPS_IP_REDACTED`; public URL is `https://supabase.shilmeyster.ru`
- **RLS:** Row Level Security is enabled on all tables. Helper functions `is_admin()` and `operator_city_id()` (SECURITY DEFINER) are used in all policies. Full policy definitions are in `rls_policies.sql`.

### MFA (TOTP)

All users can enroll/unenroll TOTP via `/settings`. Login page shows a 6-digit code step when AAL2 is required.

**Critical: Supabase JS client session lock deadlock**

`AdminContext` subscribes to `onAuthStateChange` and does PostgREST queries inside the callback. PostgREST internally calls `getSession()`, which waits for the session lock. Any Supabase SDK auth method that acquires the session lock (`mfa.verify()`, `mfa.challengeAndVerify()`, `mfa.unenroll()`) will deadlock because:

1. SDK method acquires session lock → makes HTTP request → fires `onAuthStateChange`
2. Callback tries PostgREST → internally calls `getSession()` → waits for lock
3. SDK method waits for callback to finish → **deadlock** (HTTP response received, JS never resolves)

**Rule:** Never use `supabase.auth.mfa.verify()`, `challengeAndVerify()`, or `unenroll()` on pages that use `AdminContext`. Use raw `fetch()` to the Supabase REST API instead:
- Enrollment verify: `POST /auth/v1/factors/{id}/challenge` then `POST /auth/v1/factors/{id}/verify`
- Unenroll: `POST /auth/v1/factors/{id}/challenge` then `POST /auth/v1/factors/{id}/verify` then `DELETE /auth/v1/factors/{id}`
- Get the current `access_token` from `supabase.auth.getSession()` **before** any verify call (at that point no lock is held)
- Use the `access_token` from the verify response for the DELETE (it has AAL2)
- After success: `globalThis.location.reload()` to avoid stale session state

Also: do NOT pass `friendlyName` to `mfa.enroll()` — Supabase rejects with 422 if a factor with the same name already exists. Before enrolling, delete any pending (unverified) factors via raw `fetch DELETE /auth/v1/factors/{id}` using the current session token.

### Design System

Custom Tailwind classes defined in `globals.css` `@layer components`:
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` + sizes `.btn-sm`, `.btn-lg`
- Forms: `.input`, `.textarea`, `.select`, `.label`, `.input-error`
- Layout: `.card`, `.table-wrapper`, `.table`
- Status: `.badge` (status indicator pill)
- Loading: `.skeleton`

Brand colors: orange `#F57300` (primary), sun yellow `#FFE32B`, leaf green `#3E8719`. Typography: Inter (body) + Yanone Kaffeesatz (headings/display).

For heading elements (`<h1>`, `<h2>`, etc.) always set `font-normal` explicitly — browsers apply bold by default and Tailwind's reset may not override it in all cases. Prefer `<p>` over `<h2>` for section labels that should look like body text.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Security Model

### Middleware (`src/middleware.ts`)
- Sets **nonce-based CSP** with `'strict-dynamic'` — no `unsafe-inline` for scripts. Nonce is generated per-request via `crypto.randomUUID()`, base64-encoded, forwarded to Next.js via `x-nonce` request header.
- `src/app/layout.tsx` calls `headers()` to force dynamic rendering on all routes — required so Next.js applies the nonce to its own inline scripts. Without this, prerendered pages would have no nonce and scripts would be blocked.
- Redirects unauthenticated users to `/login`
- Enforces superadmin-only routes by querying the `admins` table in DB:
  ```
  ADMIN_ONLY_ROUTES = ["/menu-editor", "/menu/schedule", "/carousel", "/cities", "/promos", "/users"]
  ```
  Operators hitting these routes are redirected to `/active-orders`.

### Input Validation Rules
- **Image uploads** (`carousel`, `menu-editor`): validated via magic bytes using `src/lib/validateImageFile.ts`; accept only `image/jpeg,image/png,image/webp`, max 5 MB
- **PostgREST search** (`clients`): escape `%`, `_`, `*`, `\` before passing to `.ilike()` to prevent wildcard injection
- **Operator credentials** (`cities`): email format regex + password must contain ≥1 uppercase letter and ≥1 digit

### Supabase RLS
All tables have RLS enabled. Two DB roles:
- `is_admin()` — checks `admins` table for current `auth.uid()`
- `operator_city_id()` — returns `city_id` from `operators` table for current `auth.uid()`

All write operations on key tables are logged via `audit_trigger_fn()` (SECURITY DEFINER) into `audit_log`. Covered tables: `orders`, `menu_items`, `categories`, `city_menu_items`, `carousel_cards`, `promocodes`, `cities`, `operators`, `admins`, `restaurants`.

`service_role` PostgreSQL role must have GRANT on all tables it touches (including `carousel_cards` and `audit_log`). If you add a new table accessed by server-side code using the service key, run: `GRANT ALL ON TABLE <table> TO service_role;`

### GoTrue Rate Limiting
Configured in `VPS_DEPLOY_PATH/supabase/docker/docker-compose.yml` under the `auth` service:
- `GOTRUE_RATE_LIMIT_EMAIL_SENT: "10"` — max 10 emails/hour
- `GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "150"` — max 150 token refreshes/hour
- `GOTRUE_RATE_LIMIT_VERIFY: "30"` — max 30 verify attempts/hour

To apply changes: `cd VPS_DEPLOY_PATH/supabase/docker && docker compose restart auth`

### Images
All menu item and carousel images are stored in self-hosted Supabase Storage at `https://supabase.shilmeyster.ru`. Do not reference external image domains — CSP `img-src` only allows `self`, `data:`, `blob:`, and `https://supabase.shilmeyster.ru`.

### Deployment
- App runs in a **Docker container** (`admin-panel`) managed by Docker Compose at `VPS_DEPLOY_PATH/docker-compose.yml`
- Build context is `VPS_APP_PATH` on the VPS
- **Caddy** proxies `https://admin.shilmeyster.ru` → Docker container (NOT to PM2)
- PM2 is present on the VPS but is NOT used for this app — changes via PM2 have no effect on the live site
- Deploy workflow:
  ```bash
  cd VPS_DEPLOY_PATH
  git -C VPS_APP_PATH pull
  docker compose build admin-panel
  docker compose up -d admin-panel
  ```
- Admin panel URL: `https://admin.shilmeyster.ru`
