-- Add error_reason column to messages table (used to surface send failure details in UI)
alter table public.messages add column if not exists error_reason text;

-- Add reactions column to messages table (for WhatsApp emoji reactions on messages)
alter table public.messages add column if not exists reactions jsonb default '{}'::jsonb;

-- Index reactions for faster lookup (optional but helpful at scale)
create index if not exists messages_reactions_idx on public.messages using gin(reactions);
