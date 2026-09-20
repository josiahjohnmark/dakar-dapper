-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 003
--   * Real customer reviews (the seeded ratings were invented; they go)
--   * Back-in-stock alerts
--   * Per-category size charts
--   * Order confirmation email queue
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires setup.sql and 002 first.
-- ==========================================================================

-- ==========================================================================
-- 1. REVIEWS
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.dd_reviews (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES public.dd_products(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name  TEXT NOT NULL,
  author_email TEXT NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title        TEXT,
  body         TEXT NOT NULL,
  size_bought  TEXT,
  verified     BOOLEAN DEFAULT FALSE,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dd_reviews_product_idx ON public.dd_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS dd_reviews_status_idx  ON public.dd_reviews(status, created_at DESC);

-- One review per person per product.
CREATE UNIQUE INDEX IF NOT EXISTS dd_reviews_one_per_person
  ON public.dd_reviews(product_id, lower(author_email));

ALTER TABLE public.dd_reviews ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='dd_reviews'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.dd_reviews', r.policyname); END LOOP;
END $$;

-- The public sees approved reviews only; the email address is never exposed
-- through the view used by the storefront (see public_reviews below).
CREATE POLICY reviews_public_read ON public.dd_reviews
  FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY reviews_admin_all ON public.dd_reviews
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Clear the invented ratings that shipped with the first build ────────
UPDATE public.dd_products SET rating = NULL, reviews = 0;

ALTER TABLE public.dd_products ALTER COLUMN rating DROP DEFAULT;
ALTER TABLE public.dd_products ALTER COLUMN reviews SET DEFAULT 0;

-- ── Keep the product's rating derived from approved reviews only ────────
CREATE OR REPLACE FUNCTION public.refresh_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE pid BIGINT := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.dd_products p
     SET rating  = sub.avg_rating,
         reviews = sub.n
    FROM (
      SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS n
        FROM public.dd_reviews
       WHERE product_id = pid AND status = 'approved'
    ) sub
   WHERE p.id = pid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dd_reviews_rating ON public.dd_reviews;
CREATE TRIGGER dd_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.dd_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_rating();

-- ── Public read: approved reviews without the reviewer's email ──────────
CREATE OR REPLACE FUNCTION public.product_reviews(p_product_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'count',   COUNT(*),
        'average', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
        'breakdown', jsonb_build_object(
          '5', COUNT(*) FILTER (WHERE rating = 5),
          '4', COUNT(*) FILTER (WHERE rating = 4),
          '3', COUNT(*) FILTER (WHERE rating = 3),
          '2', COUNT(*) FILTER (WHERE rating = 2),
          '1', COUNT(*) FILTER (WHERE rating = 1)))
        FROM public.dd_reviews
       WHERE product_id = p_product_id AND status = 'approved'),
    'items', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC)
        FROM (
          SELECT id, author_name, rating, title, body, size_bought,
                 verified, created_at
            FROM public.dd_reviews
           WHERE product_id = p_product_id AND status = 'approved'
           ORDER BY created_at DESC
           LIMIT 50
        ) r), '[]'::jsonb)
  ), '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.product_reviews(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_reviews(BIGINT) TO anon, authenticated;

-- ── Submitting a review ─────────────────────────────────────────────────
-- Held for moderation. Marked "Verified purchase" when the email is attached
-- to a real order containing this product.
CREATE OR REPLACE FUNCTION public.submit_review(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pid    BIGINT := (payload->>'product_id')::BIGINT;
  v_name   TEXT   := btrim(COALESCE(payload->>'name', ''));
  v_email  TEXT   := lower(btrim(COALESCE(payload->>'email', '')));
  v_rating INT    := COALESCE((payload->>'rating')::INT, 0);
  v_title  TEXT   := left(btrim(COALESCE(payload->>'title', '')), 120);
  v_body   TEXT   := btrim(COALESCE(payload->>'body', ''));
  v_size   TEXT   := left(btrim(COALESCE(payload->>'size', '')), 40);
  v_verified BOOLEAN := FALSE;
  v_recent INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dd_products WHERE id = v_pid) THEN
    RAISE EXCEPTION 'That product does not exist.' USING ERRCODE = '22000';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Please enter your name.' USING ERRCODE = '22000';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.' USING ERRCODE = '22000';
  END IF;
  IF v_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Please choose a rating from 1 to 5 stars.' USING ERRCODE = '22000';
  END IF;
  IF length(v_body) < 10 THEN
    RAISE EXCEPTION 'Please write at least a sentence about the piece.' USING ERRCODE = '22000';
  END IF;
  IF length(v_body) > 2000 THEN
    RAISE EXCEPTION 'That review is too long.' USING ERRCODE = '22000';
  END IF;

  -- Light throttle so the form cannot be used to flood the moderation queue.
  SELECT COUNT(*) INTO v_recent FROM public.dd_reviews
   WHERE lower(author_email) = v_email AND created_at > NOW() - INTERVAL '1 hour';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Too many reviews submitted just now. Please try later.' USING ERRCODE = '22000';
  END IF;

  -- Verified purchase: this email ordered this product at some point.
  SELECT EXISTS (
    SELECT 1 FROM public.dd_orders o, jsonb_array_elements(o.items) it
     WHERE lower(o.customer_email) = v_email
       AND (it->>'id')::BIGINT = v_pid
       AND o.status <> 'cancelled'
  ) INTO v_verified;

  INSERT INTO public.dd_reviews (product_id, user_id, author_name, author_email,
                                 rating, title, body, size_bought, verified, status)
  VALUES (v_pid, auth.uid(), left(v_name,80), v_email, v_rating, NULLIF(v_title,''),
          left(v_body,2000), NULLIF(v_size,''), v_verified, 'pending')
  ON CONFLICT (product_id, lower(author_email)) DO UPDATE
    SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body,
        size_bought = EXCLUDED.size_bought, status = 'pending',
        created_at = NOW();

  RETURN jsonb_build_object('ok', true, 'verified', v_verified);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(JSONB) TO anon, authenticated;

-- ==========================================================================
-- 2. BACK-IN-STOCK ALERTS
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.dd_stock_alerts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES public.dd_products(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  size_wanted TEXT,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dd_stock_alerts_unique
  ON public.dd_stock_alerts(product_id, lower(email))
  WHERE notified_at IS NULL;

ALTER TABLE public.dd_stock_alerts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='dd_stock_alerts'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.dd_stock_alerts', r.policyname); END LOOP;
END $$;

-- No public reads at all: the waiting list is customer data.
CREATE POLICY stock_alerts_admin ON public.dd_stock_alerts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.request_stock_alert(
  p_product_id BIGINT, p_email TEXT, p_size TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email TEXT := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN FALSE; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dd_products WHERE id = p_product_id) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.dd_stock_alerts (product_id, email, size_wanted)
  VALUES (p_product_id, v_email, left(NULLIF(btrim(COALESCE(p_size,'')),''), 40))
  ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.request_stock_alert(BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_stock_alert(BIGINT, TEXT, TEXT) TO anon, authenticated;

-- Who is waiting, grouped per product, for the admin's restock view.
CREATE OR REPLACE FUNCTION public.pending_stock_alerts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.waiting DESC), '[]'::jsonb) INTO result
    FROM (
      SELECT a.product_id,
             p.name  AS product_name,
             p.image AS product_image,
             p.stock,
             COUNT(*) AS waiting,
             jsonb_agg(jsonb_build_object(
               'email', a.email, 'size', a.size_wanted, 'since', a.created_at)
               ORDER BY a.created_at) AS people
        FROM public.dd_stock_alerts a
        JOIN public.dd_products p ON p.id = a.product_id
       WHERE a.notified_at IS NULL
       GROUP BY a.product_id, p.name, p.image, p.stock
    ) t;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.pending_stock_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_stock_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_alerts_notified(p_product_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.dd_stock_alerts SET notified_at = NOW()
   WHERE product_id = p_product_id AND notified_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_alerts_notified(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_alerts_notified(BIGINT) TO authenticated;

-- ==========================================================================
-- 3. SIZE CHARTS, PER CATEGORY
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.dd_size_charts (
  category_id TEXT PRIMARY KEY REFERENCES public.dd_categories(id) ON DELETE CASCADE,
  unit        TEXT DEFAULT 'cm',
  columns     JSONB NOT NULL,
  rows        JSONB NOT NULL,
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dd_size_charts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='dd_size_charts'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.dd_size_charts', r.policyname); END LOOP;
END $$;

CREATE POLICY size_charts_public_read ON public.dd_size_charts
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY size_charts_admin_write ON public.dd_size_charts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- One chart showing chest/waist/hips for sneakers and chains was useless.
INSERT INTO public.dd_size_charts (category_id, unit, columns, rows, note) VALUES
  ('wears', 'cm',
   '["Size","Chest","Waist","Shoulder","Length"]'::jsonb,
   '[["S","88-92","73-77","43","68"],
     ["M","96-100","81-85","45","70"],
     ["L","104-108","89-93","47","72"],
     ["XL","112-116","97-101","49","74"],
     ["XXL","120-124","105-109","51","76"]]'::jsonb,
   'Garment measurements laid flat and doubled. If you are between sizes, size up for an oversized fit.'),

  ('footwear', 'cm',
   '["EU","UK","US","Foot length"]'::jsonb,
   '[["40","6.5","7.5","25.0"],
     ["41","7.5","8.5","25.7"],
     ["42","8","9","26.3"],
     ["43","9","10","27.0"],
     ["44","9.5","10.5","27.7"],
     ["45","10.5","11.5","28.3"]]'::jsonb,
   'Measure your foot from heel to longest toe in the evening, when feet are largest. If between sizes, take the larger.'),

  ('accessories', 'cm',
   '["Item","Size","Measurement"]'::jsonb,
   '[["Cuban chain","20 inch","51"],
     ["Cuban chain","22 inch","56"],
     ["Cuban chain","24 inch","61"],
     ["Sunglasses","One size","Lens 52 / Bridge 20 / Arm 145"],
     ["Watch","One size","Strap adjusts 16-21 wrist"],
     ["Bag","One size","See product details"]]'::jsonb,
   'Chain lengths are measured end to end including the clasp.')
ON CONFLICT (category_id) DO NOTHING;

-- ==========================================================================
-- 4. ORDER CONFIRMATION EMAIL QUEUE
--    place_order() drops a row here; an Edge Function sends it.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.dd_email_queue (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email    TEXT NOT NULL,
  template    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dd_email_queue_status_idx
  ON public.dd_email_queue(status, created_at);

ALTER TABLE public.dd_email_queue ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='dd_email_queue'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.dd_email_queue', r.policyname); END LOOP;
END $$;

-- Customer email addresses: admin eyes only. The Edge Function uses the
-- service role, which bypasses RLS.
CREATE POLICY email_queue_admin ON public.dd_email_queue
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Queue a confirmation whenever an order is created.
CREATE OR REPLACE FUNCTION public.queue_order_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_email IS NULL OR NEW.customer_email = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.dd_email_queue (to_email, template, payload)
  VALUES (NEW.customer_email, 'order_confirmation', jsonb_build_object(
    'order_number', NEW.order_number,
    'name',         NEW.customer_name,
    'email',        NEW.customer_email,
    'phone',        NEW.customer_phone,
    'address',      NEW.customer_address,
    'city',         NEW.customer_city,
    'state',        NEW.customer_state,
    'note',         NEW.note,
    'items',        NEW.items,
    'subtotal',     NEW.subtotal,
    'shipping',     NEW.shipping,
    'total',        NEW.total,
    'placed_at',    NEW.created_at
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dd_orders_email ON public.dd_orders;
CREATE TRIGGER dd_orders_email
  AFTER INSERT ON public.dd_orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_order_email();

-- Admin dashboard: how is the mail doing?
CREATE OR REPLACE FUNCTION public.email_queue_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN public.is_admin() THEN jsonb_build_object(
    'queued', (SELECT COUNT(*) FROM public.dd_email_queue WHERE status='queued'),
    'sent',   (SELECT COUNT(*) FROM public.dd_email_queue WHERE status='sent'),
    'failed', (SELECT COUNT(*) FROM public.dd_email_queue WHERE status='failed')
  ) ELSE '{}'::jsonb END;
$$;

REVOKE ALL ON FUNCTION public.email_queue_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_queue_summary() TO authenticated;

-- ==========================================================================
-- Verify:
--   SELECT id, name, rating, reviews FROM public.dd_products ORDER BY id;
--   SELECT category_id, columns FROM public.dd_size_charts;
--   SELECT * FROM public.dd_email_queue ORDER BY id DESC LIMIT 5;
-- ==========================================================================
