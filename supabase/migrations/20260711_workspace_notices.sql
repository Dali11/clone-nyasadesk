-- ── workspace_notices ──────────────────────────────────────────────────────
-- Internal noticeboard: admins/sales managers post notices visible to all
-- team members of a workspace.

create table if not exists public.workspace_notices (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,              -- = workspace owner's user id
  author_id      uuid references auth.users(id) on delete set null,
  author_name    text not null default 'Admin',
  tag            text not null default 'general'
                 check (tag in ('general','rule','update','urgent','info')),
  body           text not null,
  pinned         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Index for fast workspace-scoped queries (pinned first, newest first)
create index if not exists workspace_notices_workspace_id_idx
  on public.workspace_notices (workspace_id, pinned desc, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.workspace_notices enable row level security;

-- Drop old policies before recreating (idempotent)
drop policy if exists "notices_read"  on public.workspace_notices;
drop policy if exists "notices_write" on public.workspace_notices;

-- All authenticated users can read notices for their workspace
create policy "notices_read" on public.workspace_notices
  for select using (
    auth.role() = 'authenticated'
  );

-- Write policy: workspace owner OR teammate with admin/sales_manager role.
-- Fix 1: WITH CHECK added so INSERT is also covered (not just UPDATE/DELETE).
-- Fix 2: workspace owner check uses auth.uid() = workspace_id (both uuid).
-- Fix 3: teammate check correctly compares p.workspace_id = workspace_notices.workspace_id.
create policy "notices_write" on public.workspace_notices
  for all
  using (
    -- Workspace owner: profile has no workspace_id (they ARE the workspace)
    (auth.uid() = workspace_id)
    or
    -- Elevated teammate: their profile's workspace_id matches this notice's workspace_id
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.workspace_id = workspace_id
        and p.role in ('admin', 'sales_manager')
    )
  )
  with check (
    -- Same logic for INSERT/UPDATE row validation
    (auth.uid() = workspace_id)
    or
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.workspace_id = workspace_id
        and p.role in ('admin', 'sales_manager')
    )
  );

-- ── Updated_at trigger ─────────────────────────────────────────────────────
create or replace function public.set_notices_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notices_updated_at on public.workspace_notices;
create trigger notices_updated_at
  before update on public.workspace_notices
  for each row execute procedure public.set_notices_updated_at();
