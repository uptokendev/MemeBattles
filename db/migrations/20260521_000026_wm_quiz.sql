BEGIN;

CREATE TABLE IF NOT EXISTS public.wm_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_template_id UUID NOT NULL REFERENCES public.wm_quest_templates(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  question TEXT,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_key TEXT NOT NULL,
  correct_answer TEXT,
  explanation TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repair columns when this migration is run after a partial/older import.
-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
ALTER TABLE IF EXISTS public.wm_quiz_questions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS quest_template_id UUID REFERENCES public.wm_quest_templates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS question TEXT,
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS correct_answer_key TEXT,
  ADD COLUMN IF NOT EXISTS correct_answer TEXT,
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.wm_quiz_questions
SET
  id = COALESCE(id, gen_random_uuid()),
  prompt = COALESCE(prompt, question, ''),
  question = COALESCE(question, prompt, ''),
  answers = COALESCE(answers, '[]'::jsonb),
  correct_answer_key = COALESCE(correct_answer_key, correct_answer, ''),
  correct_answer = COALESCE(correct_answer, correct_answer_key, ''),
  active = COALESCE(active, true),
  display_order = COALESCE(display_order, 0),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE IF EXISTS public.wm_quiz_questions
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN prompt SET NOT NULL,
  ALTER COLUMN answers SET DEFAULT '[]'::jsonb,
  ALTER COLUMN answers SET NOT NULL,
  ALTER COLUMN correct_answer_key SET NOT NULL,
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN display_order SET DEFAULT 0,
  ALTER COLUMN display_order SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wm_quiz_questions_pkey'
      AND conrelid = 'public.wm_quiz_questions'::regclass
  ) THEN
    ALTER TABLE public.wm_quiz_questions ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wm_quiz_questions
    WHERE quest_template_id IS NULL
  ) THEN
    ALTER TABLE public.wm_quiz_questions ALTER COLUMN quest_template_id SET NOT NULL;
  END IF;
END $$;

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

ALTER TABLE IF EXISTS public.wm_quiz_attempts
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.wm_users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quest_template_id UUID REFERENCES public.wm_quest_templates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quest_completion_id UUID REFERENCES public.wm_quest_completions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.wm_quiz_attempts
SET
  id = COALESCE(id, gen_random_uuid()),
  answers = COALESCE(answers, '{}'::jsonb),
  score = COALESCE(score, 0),
  total_questions = COALESCE(total_questions, 0),
  passed = COALESCE(passed, false),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now());

ALTER TABLE IF EXISTS public.wm_quiz_attempts
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN answers SET DEFAULT '{}'::jsonb,
  ALTER COLUMN answers SET NOT NULL,
  ALTER COLUMN score SET DEFAULT 0,
  ALTER COLUMN score SET NOT NULL,
  ALTER COLUMN total_questions SET DEFAULT 0,
  ALTER COLUMN total_questions SET NOT NULL,
  ALTER COLUMN passed SET DEFAULT false,
  ALTER COLUMN passed SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wm_quiz_attempts_pkey'
      AND conrelid = 'public.wm_quiz_attempts'::regclass
  ) THEN
    ALTER TABLE public.wm_quiz_attempts ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wm_quiz_attempts
    WHERE user_id IS NULL OR quest_template_id IS NULL
  ) THEN
    ALTER TABLE public.wm_quiz_attempts
      ALTER COLUMN user_id SET NOT NULL,
      ALTER COLUMN quest_template_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wm_quiz_attempts_user_template
  ON public.wm_quiz_attempts (user_id, quest_template_id, created_at DESC);

COMMIT;
