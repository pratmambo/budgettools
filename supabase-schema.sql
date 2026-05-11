-- ============================================================
-- BudgetTools — Supabase Database Schema
-- Paste this entire file into the Supabase SQL Editor and run.
-- Uses Cashfree for payments (replaces Stripe).
-- ============================================================


-- ============================================================
-- SECTION 1: PROFILES
-- One row per user, created automatically on sign-up via trigger.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 2: HANDLE NEW USER TRIGGER
-- Runs on auth.users INSERT — creates a matching profiles row
-- so every signed-up user always has a profile.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SECTION 3: SUBSCRIPTIONS
-- One row per Cashfree subscription (sub_xxx).
-- Written only by the payment-webhook Netlify function.
-- template_key matches the keys used in PLAN_MAP:
--   'wedding' | 'event' | 'travel' | 'cafe' | 'inventory' | 'all'
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    TEXT PRIMARY KEY,     -- Cashfree order ID (order_xxx)
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_key          TEXT NOT NULL,        -- which template this subscription covers
  status                TEXT NOT NULL,        -- active | trialing | past_due | canceled | paused
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the subscription-status function's query pattern
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions (user_id);

CREATE INDEX IF NOT EXISTS subscriptions_user_template_status_idx
  ON public.subscriptions (user_id, template_key, status);

-- Auto-update updated_at
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 4: TEMPLATE DATA
-- Stores each user's saved spreadsheet/calculator state as JSONB.
-- One row per (user, template) pair — upserted by user-data function.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.template_data (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,
  data          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce one saved state per user per template
  CONSTRAINT template_data_user_template_unique UNIQUE (user_id, template_key)
);

-- Index for the GET query in user-data function
CREATE INDEX IF NOT EXISTS template_data_user_template_idx
  ON public.template_data (user_id, template_key);

-- Auto-update updated_at
CREATE TRIGGER template_data_set_updated_at
  BEFORE UPDATE ON public.template_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS)
-- All tables use RLS. The Netlify functions use the service role
-- key which bypasses RLS. These policies protect direct client
-- access from the browser.
-- ============================================================

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_data ENABLE ROW LEVEL SECURITY;


-- ---- profiles policies ----

CREATE POLICY "profiles: users can read own row"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: users can update own row"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ---- subscriptions policies ----

-- Users can read their own subscriptions (for account.html dashboard)
CREATE POLICY "subscriptions: users can read own rows"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role (webhook function) writes to this table.


-- ---- template_data policies ----

CREATE POLICY "template_data: users can read own rows"
  ON public.template_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "template_data: users can insert own rows"
  ON public.template_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "template_data: users can update own rows"
  ON public.template_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "template_data: users can delete own rows"
  ON public.template_data FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================
-- DONE
-- Tables: profiles, subscriptions, template_data
-- Trigger: on_auth_user_created (auto-creates profile on signup)
-- RLS: enabled with least-privilege policies on all tables
-- ============================================================
