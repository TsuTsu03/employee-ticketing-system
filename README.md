# ShiftDesk

Shift tracking **and** ticketing for frontline teams — built with Next.js 16, Supabase, and Tailwind v4.

- **Employees** clock in/out with GPS and raise support tickets from a chat-style assistant.
- **Admins** manage their organization: triage, assign, comment on, and resolve tickets; review shifts; invite members.
- **Super admins** manage organizations, services, and tickets across the whole platform.

## Stack

- Next.js 16 (App Router) + React 19
- Supabase (auth, Postgres, row-level security)
- Tailwind CSS v4 + shadcn/ui, dark mode via `next-themes`
- `sonner` toasts, `zod` validation

## Getting started

```bash
pnpm install
pnpm dev
```

Create `.env` with your Supabase keys:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Database

Run the migration in **Supabase → SQL Editor** (idempotent, safe to re-run):

```
supabase/migrations/0001_shiftdesk_refactor.sql
```

It adds ticket `title`/`priority`/`assignee_id`/timestamps, a `ticket_comments`
table with RLS, an `org_ticket_stats` RPC, and migrates the legacy `COMPLETED`
status to `RESOLVED`.

## Roles & routes

| Role          | Lands on                |
| ------------- | ----------------------- |
| `SUPER_ADMIN` | `/superadmin/dashboard` |
| `ADMIN`       | `/admin/dashboard`      |
| `EMPLOYEE`    | `/app/dashboard`        |

`/portal` resolves the signed-in user's role and redirects accordingly.
Registration is invite-only — admins invite members by email.

## Scripts

```bash
pnpm dev            # dev server
pnpm build          # production build (type-checked)
npx tsc --noEmit    # type check
```
