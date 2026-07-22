-- Push subscriptions table for web push notifications
-- Each row represents one browser/device that has opted in to push notifications.

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  owner_id     uuid not null,  -- workspace owner ID (used to fan out to all agents)
  endpoint     text not null,
  subscription jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- UNIQUE on endpoint ensures upsert works correctly.
-- One row per browser subscription endpoint per user.
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions(endpoint);
create index if not exists push_subscriptions_owner_id_idx on public.push_subscriptions(owner_id);

-- RLS: users can only see their own subscriptions.
-- Service role (used by the API) bypasses RLS entirely.
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
  on public.push_subscriptions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
