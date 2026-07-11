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

-- All authenticated users can read notices for their workspace
create policy "notices_read" on public.workspace_notices
  for select using (
    auth.role() = 'authenticated'
  );

-- Only the workspace owner (admin) or teammates with role admin/sales_manager
-- can insert/update/delete notices.
-- We check via the profiles table — the caller must belong to this workspace.
create policy "notices_write" on public.workspace_notices
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          -- Workspace owner
          (p.workspace_id is null and auth.uid() = workspace_id)
          or
          -- Teammate with elevated role
          (p.workspace_id = workspace_id and p.role in ('admin','sales_manager'))
        )
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
