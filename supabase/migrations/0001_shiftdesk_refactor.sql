-- ============================================================================
-- ShiftDesk refactor migration  (idempotent — safe to re-run)
-- Run this in the Supabase SQL Editor (or `supabase db push`).
--
-- It is ADDITIVE: it does not drop existing tables or data. It adds the
-- columns/tables/policies the refactored app needs and migrates legacy values.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: store email + avatar for richer member lists
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists avatar_url text;

-- ---------------------------------------------------------------------------
-- services: allow soft-disabling a service
-- ---------------------------------------------------------------------------
alter table public.services add column if not exists is_active boolean not null default true;
alter table public.services add column if not exists description text;

-- ---------------------------------------------------------------------------
-- tickets: title, priority, assignee, timestamps
-- ---------------------------------------------------------------------------
alter table public.tickets add column if not exists title text;
alter table public.tickets add column if not exists priority text not null default 'MEDIUM';
alter table public.tickets add column if not exists assignee_id uuid references auth.users (id) on delete set null;
alter table public.tickets add column if not exists updated_at timestamptz not null default now();
alter table public.tickets add column if not exists resolved_at timestamptz;

-- Migrate legacy status value COMPLETED -> RESOLVED
update public.tickets set status = 'RESOLVED' where status = 'COMPLETED';

-- Constrain to the known status/priority sets (drop first so re-runs succeed).
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets
  add constraint tickets_status_check
  check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'));

alter table public.tickets drop constraint if exists tickets_priority_check;
alter table public.tickets
  add constraint tickets_priority_check
  check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT'));

-- Backfill a sensible title from the description for older rows.
update public.tickets
   set title = left(coalesce(nullif(trim(description), ''), 'Ticket'), 80)
 where title is null;

create index if not exists tickets_org_status_idx on public.tickets (org_id, status);
create index if not exists tickets_assignee_idx on public.tickets (assignee_id);
create index if not exists tickets_created_idx on public.tickets (created_at desc);

-- keep updated_at fresh + stamp resolved_at on resolve
create or replace function public.tg_tickets_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'RESOLVED' and (old.status is distinct from 'RESOLVED') then
    new.resolved_at := now();
  end if;
  if new.status <> 'RESOLVED' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch
  before update on public.tickets
  for each row execute function public.tg_tickets_touch();

-- ---------------------------------------------------------------------------
-- ticket_comments: conversation thread on a ticket
-- ---------------------------------------------------------------------------
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists ticket_comments_ticket_idx
  on public.ticket_comments (ticket_id, created_at);

alter table public.ticket_comments enable row level security;

-- A user can see comments on a ticket if they belong to that ticket's org.
drop policy if exists ticket_comments_select on public.ticket_comments;
create policy ticket_comments_select on public.ticket_comments
  for select using (
    exists (
      select 1
        from public.tickets t
        join public.memberships m on m.org_id = t.org_id
       where t.id = ticket_comments.ticket_id
         and m.user_id = auth.uid()
    )
  );

-- A member of the org can add a comment as themselves.
drop policy if exists ticket_comments_insert on public.ticket_comments;
create policy ticket_comments_insert on public.ticket_comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1
        from public.tickets t
        join public.memberships m on m.org_id = t.org_id
       where t.id = ticket_comments.ticket_id
         and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RPC: org_ticket_stats(p_org_id) — dashboard KPIs in one round-trip
-- ---------------------------------------------------------------------------
create or replace function public.org_ticket_stats(p_org_id uuid)
returns table (
  open_count bigint,
  in_progress_count bigint,
  resolved_count bigint,
  closed_count bigint,
  urgent_open_count bigint,
  created_today bigint,
  avg_resolution_seconds double precision
)
language sql
security invoker
stable
as $$
  select
    count(*) filter (where status = 'OPEN'),
    count(*) filter (where status = 'IN_PROGRESS'),
    count(*) filter (where status = 'RESOLVED'),
    count(*) filter (where status = 'CLOSED'),
    count(*) filter (where status = 'OPEN' and priority = 'URGENT'),
    count(*) filter (where created_at >= date_trunc('day', now())),
    avg(extract(epoch from (resolved_at - created_at))) filter (where resolved_at is not null)
  from public.tickets
  where org_id = p_org_id;
$$;
