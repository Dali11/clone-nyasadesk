-- Add external webhook tool fields to ai_agents
-- Enables AI agents to call external APIs (e.g. student registration at Chibondo Academy)
-- when the AI model decides to use the register_student tool.

alter table public.ai_agents
  add column if not exists webhook_tool_url    text,
  add column if not exists webhook_tool_secret text;

comment on column public.ai_agents.webhook_tool_url    is 'External webhook endpoint for custom AI tool calls (e.g. student registration). Bearer auth via webhook_tool_secret.';
comment on column public.ai_agents.webhook_tool_secret is 'Shared secret sent as a Bearer token to authenticate calls to webhook_tool_url.';
