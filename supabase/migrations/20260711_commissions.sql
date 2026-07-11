-- ── Sales Commissions Module ────────────────────────────────────────────────
-- commission_settings: one row per workspace, toggles the whole feature on/off
-- commission_policies: unlimited policies with fixed/percentage/tiered methods
-- commissions: one record per commission event, full audit trail

create table if not exists public.commission_settings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null unique,
  enabled      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.commission_policies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null,
  name          text not null,
  description   text,
  status        text not null default 'active'
                check (status in ('active','inactive','archived')),
  effective_date date not null default current_date,
  expiry_date   date,
  applies_to    text not null default 'workspace'
                check (applies_to in ('workspace','department','team','individual')),
  applies_to_id text,
  calc_method   text not null default 'fixed'
                check (calc_method in ('fixed','percentage','tiered','formula')),
  calc_value    numeric,
  tiers         jsonb,
  trigger_event text not null default 'deal_won'
                check (trigger_event in ('deal_won','invoice_paid','payment_received','manual')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists commission_policies_ws_idx
  on public.commission_policies(workspace_id, status);

create table if not exists public.commissions (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      text not null,
  policy_id         uuid references public.commission_policies(id) on delete set null,
  agent_id          uuid not null references auth.users(id) on delete cascade,
  agent_name        text not null,
  contact_id        uuid,
  contact_name      text,
  conversation_id   uuid,
  invoice_id        uuid,
  payment_id        uuid,
  sale_amount       numeric not null default 0,
  commission_amount numeric not null default 0,
  calc_breakdown    jsonb,
  trigger_event     text not null,
  status            text not null default 'pending'
                    check (status in ('pending','awaiting_approval','approved','paid','rejected','cancelled','reversed')),
  notes             text,
  reviewed_by       uuid references auth.users(id) on delete set null,
  reviewed_at       timestamptz,
  paid_at           timestamptz,
  reversed_at       timestamptz,
  reversal_reason   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists commissions_ws_idx
  on public.commissions(workspace_id, created_at desc);
create index if not exists commissions_agent_idx
  on public.commissions(agent_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.commission_settings enable row level security;
alter table public.commission_policies  enable row level security;
alter table public.commissions          enable row level security;

drop policy if exists "cs_read"  on public.commission_settings;
create policy "cs_read" on public.commission_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "cs_write" on public.commission_settings;
create policy "cs_write" on public.commission_settings
  for all using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid()
      and (
        (p.workspace_id is null and auth.uid()::text = workspace_id)
        or (p.workspace_id = workspace_id and p.role = 'admin')
      )
    )
  );

drop policy if exists "cp_read"  on public.commission_policies;
create policy "cp_read" on public.commission_policies
  for select using (auth.role() = 'authenticated');

drop policy if exists "cp_write" on public.commission_policies;
create policy "cp_write" on public.commission_policies
  for all using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid()
      and (
        (p.workspace_id is null and auth.uid()::text = workspace_id)
        or (p.workspace_id = workspace_id and p.role = 'admin')
      )
    )
  );

drop policy if exists "comm_read" on public.commissions;
create policy "comm_read" on public.commissions
  for select using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid()
      and (
        (p.workspace_id is null and auth.uid()::text = workspace_id)
        or (p.workspace_id = workspace_id and p.role in ('admin','sales_manager'))
        or agent_id = auth.uid()
      )
    )
  );

drop policy if exists "comm_write" on public.commissions;
create policy "comm_write" on public.commissions
  for all using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid()
      and (
        (p.workspace_id is null and auth.uid()::text = workspace_id)
        or (p.workspace_id = workspace_id and p.role = 'admin')
      )
    )
  );

-- ── updated_at triggers ──────────────────────────────────────────────────────
create or replace function public.set_updated_at_commissions()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_comm_settings_updated on public.commission_settings;
create trigger trg_comm_settings_updated
  before update on public.commission_settings
  for each row execute procedure public.set_updated_at_commissions();

drop trigger if exists trg_comm_policies_updated on public.commission_policies;
create trigger trg_comm_policies_updated
  before update on public.commission_policies
  for each row execute procedure public.set_updated_at_commissions();

drop trigger if exists trg_commissions_updated on public.commissions;
create trigger trg_commissions_updated
  before update on public.commissions
  for each row execute procedure public.set_updated_at_commissions();
