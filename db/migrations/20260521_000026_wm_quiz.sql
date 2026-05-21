BEGIN;

CREATE TABLE IF NOT EXISTS public.wm_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_template_id UUID NOT NULL REFERENCES public.wm_quest_templates(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_key TEXT NOT NULL,
  explanation TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wm_quiz_questions_template
  ON public.wm_quiz_questions (quest_template_id, active, display_order, created_at);

CREATE TABLE IF NOT EXISTS public.wm_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.wm_users(id) ON DELETE CASCADE,
  quest_template_id UUID NOT NULL REFERENCES public.wm_quest_templates(id) ON DELETE CASCADE,
  quest_completion_id UUID REFERENCES public.wm_quest_completions(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  cooldown_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wm_quiz_attempts_user_template
  ON public.wm_quiz_attempts (user_id, quest_template_id, created_at DESC);

COMMIT;
