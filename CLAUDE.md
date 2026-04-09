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
├── login/                  # Public auth page
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
    └── users/               # Admin user management
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
| `src/components/layout/AdminContext.tsx` | Role + cityId context provider |
| `src/components/layout/Sidebar.tsx` | Nav with role-based link filtering |
| `tailwind.config.js` | Custom brand colors, animations, shadows |
| `src/app/globals.css` | Component layer classes: `.btn-*`, `.input`, `.card`, `.table`, `.badge`, `.skeleton` |

### Supabase Patterns

- **Real-time:** Active orders page subscribes to `postgres_changes` for live order updates
- **Server vs Client:** Import from `lib/supabase/server.ts` in Server Components and `lib/supabase/client.ts` in Client Components (`'use client'`)
- **Auth:** Email/password via Supabase Auth; session managed via cookies in middleware

### Design System

Custom Tailwind classes defined in `globals.css` `@layer components`:
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` + sizes `.btn-sm`, `.btn-lg`
- Forms: `.input`, `.textarea`, `.select`, `.label`, `.input-error`
- Layout: `.card`, `.table-wrapper`, `.table`
- Status: `.badge` (status indicator pill)
- Loading: `.skeleton`

Brand colors: orange `#F57300` (primary), sun yellow `#FFE32B`, leaf green `#3E8719`. Typography: Inter (body) + Yanone Kaffeesatz (headings/display).

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
