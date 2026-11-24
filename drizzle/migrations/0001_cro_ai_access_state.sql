CREATE TABLE public.ai_access_state (scope text PRIMARY KEY, status integer NOT NULL, message text NOT NULL, error_type text NOT NULL, paused_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_access_state TO service_role;
ALTER TABLE public.ai_access_state ENABLE ROW LEVEL SECURITY;