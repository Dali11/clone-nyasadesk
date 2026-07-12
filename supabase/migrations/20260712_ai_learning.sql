-- AI Learning: stores extracted patterns from real conversations
CREATE TABLE IF NOT EXISTS ai_conversation_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  question_pattern TEXT NOT NULL,        -- The customer question/intent
  answer_pattern TEXT NOT NULL,          -- The agent's best answer
  frequency INTEGER DEFAULT 1,           -- How often this Q&A appears
  confidence FLOAT DEFAULT 0.5,          -- 0-1 confidence score
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI agent profiles with learned instructions
CREATE TABLE IF NOT EXISTS ai_agent_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'AI Assistant',
  learned_instructions TEXT,             -- Auto-generated from patterns
  custom_instructions TEXT,              -- Manual override
  tone TEXT DEFAULT 'professional',      -- professional/friendly/casual
  auto_reply_enabled BOOLEAN DEFAULT FALSE,
  auto_reply_threshold FLOAT DEFAULT 0.85, -- Confidence needed to auto-reply
  learning_enabled BOOLEAN DEFAULT TRUE,
  last_trained_at TIMESTAMPTZ,
  training_message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log of AI auto-replies sent
CREATE TABLE IF NOT EXISTS ai_auto_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  pattern_id UUID REFERENCES ai_conversation_patterns(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  reply TEXT NOT NULL,
  confidence FLOAT,
  was_helpful BOOLEAN,                   -- Agent can mark good/bad
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_patterns_workspace ON ai_conversation_patterns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_patterns_frequency ON ai_conversation_patterns(workspace_id, frequency DESC);
CREATE INDEX IF NOT EXISTS idx_ai_auto_replies_conv ON ai_auto_replies(conversation_id);
