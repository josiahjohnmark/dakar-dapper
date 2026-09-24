-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 008: go live
--
--   1. Retire the "Wears" category (its products move to real categories)
--   2. Remove the demo/test rows that were feeding the dashboard
--   3. Customer accounts: each shopper sees only their own orders,
--      payments, reviews, waitlist, wishlist, search and viewing history
--   4. Sales analytics for any timeframe
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires 001-007.
-- ==========================================================================

-- ==========================================================================
-- 1. RETIRE "WEARS"
-- ==========================================================================
-- Best-fit homes in the client's own category list. Change any of them later
-- in Admin -> Products -> edit -> Category.
-- Shorts first: "Short Denim Jeans" would otherwise match the jeans rule.
UPDATE public.dd_products SET category = 'shorts'
 WHERE name ILIKE '%short%'
   AND (category = 'wears'
        OR (category = 'accessories' AND (name ILIKE '%jean%' OR name ILIKE '%denim%')));

UPDATE public.dd_products SET category = 'trousers'
 WHERE category = 'wears' AND (name ILIKE '%trouser%' OR name ILIKE '%jean%' OR name ILIKE '%pant%' OR name ILIKE '%cargo%');

-- Tees, jackets and sets have no dedicated category in the client's list.
UPDATE public.dd_products SET category = 'casual-shirts' WHERE category = 'wears';

-- The original schema defaulted new products to 'wears' and re-pointed
-- products to that default when a category was deleted. Neither is wanted:
-- a product must always be filed deliberately, and a category that still
-- holds products cannot be deleted.
ALTER TABLE public.dd_products ALTER COLUMN category DROP DEFAULT;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.dd_products'::regclass AND contype = 'f'
       AND confrelid = 'public.dd_categories'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.dd_products DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.dd_products
  ADD CONSTRAINT dd_products_category_fkey FOREIGN KEY (category)
  REFERENCES public.dd_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;

DELETE FROM public.dd_categories WHERE id = 'wears';   -- its size chart goes with it

-- ==========================================================================
-- 2. REMOVE DEMO / TEST DATA
-- ==========================================================================
-- The first build seeded a fake "verification" order and test subscribers.
-- They were being counted in revenue, orders and best sellers.
DELETE FROM public.dd_email_queue
 WHERE lower(to_email) IN ('test@dakardapper.com', 'vip@dakardapper.com');

DELETE FROM public.dd_orders
 WHERE customer_name ILIKE '%verification test%'
    OR lower(customer_email) = 'test@dakardapper.com';

DELETE FROM public.dd_subscribers
 WHERE source ILIKE '%test%' OR lower(email) IN ('vip@dakardapper.com', 'test@dakardapper.com');

-- --------------------------------------------------------------------------
-- OPTIONAL — START COMPLETELY FRESH FOR LAUNCH
-- If every order placed so far was you testing, run this block on its own
-- afterwards (select it, then Run). It deletes ALL orders and queued mail.
-- It does not put stock back: set real stock counts in Admin -> Products.
--
--   SELECT order_number, customer_name, customer_email, total, created_at
--     FROM public.dd_orders ORDER BY created_at;          -- look first
--
--   DELETE FROM public.dd_email_queue WHERE template <> 'campaign';
--   DELETE FROM public.dd_orders;
-- --------------------------------------------------------------------------

-- ==========================================================================
-- 3. CUSTOMER ACCOUNTS
-- ==========================================================================

-- The signed-in shopper's email, but only once Supabase has confirmed they
-- own it. Without the confirmation check, anyone could sign up with someone
-- else's address and read their orders.
CREATE OR REPLACE FUNCTION public.my_verified_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT lower(email) FROM auth.users
   WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.my_verified_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_verified_email() TO authenticated;

-- Orders: a customer sees orders placed while signed in, and guest orders
-- placed with their confirmed email. Never anyone else's.
DROP POLICY IF EXISTS orders_owner_read ON public.dd_orders;
CREATE POLICY orders_owner_read ON public.dd_orders
  FOR SELECT TO authenticated
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (public.my_verified_email() IS NOT NULL
        AND lower(customer_email) = public.my_verified_email())
  );

-- ── Personal lists: private to their owner, enforced by the database ─────
CREATE TABLE IF NOT EXISTS public.dd_wishlist (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.dd_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.dd_recently_viewed (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.dd_products(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.dd_search_history (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query      TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dd_search_history_user_idx ON public.dd_search_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dd_recently_viewed_user_idx ON public.dd_recently_viewed(user_id, viewed_at DESC);

ALTER TABLE public.dd_wishlist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_recently_viewed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_search_history  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('dd_wishlist', 'dd_recently_viewed', 'dd_search_history')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

CREATE POLICY wishlist_owner ON public.dd_wishlist
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY viewed_owner ON public.dd_recently_viewed
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY search_owner ON public.dd_search_history
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Keep only the latest 50 searches and 40 viewed items per person.
CREATE OR REPLACE FUNCTION public.trim_personal_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'dd_search_history' THEN
    DELETE FROM public.dd_search_history
     WHERE user_id = NEW.user_id
       AND id NOT IN (SELECT id FROM public.dd_search_history
                       WHERE user_id = NEW.user_id ORDER BY created_at DESC LIMIT 50);
  ELSE
    DELETE FROM public.dd_recently_viewed
     WHERE user_id = NEW.user_id
       AND product_id NOT IN (SELECT product_id FROM public.dd_recently_viewed
                               WHERE user_id = NEW.user_id ORDER BY viewed_at DESC LIMIT 40);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dd_search_history_trim ON public.dd_search_history;
CREATE TRIGGER dd_search_history_trim AFTER INSERT ON public.dd_search_history
  FOR EACH ROW EXECUTE FUNCTION public.trim_personal_history();
DROP TRIGGER IF EXISTS dd_recently_viewed_trim ON public.dd_recently_viewed;
CREATE TRIGGER dd_recently_viewed_trim AFTER INSERT ON public.dd_recently_viewed
  FOR EACH ROW EXECUTE FUNCTION public.trim_personal_history();

-- ── Everything about me, in one call ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_account()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT := public.my_verified_email();
  result  JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'email', u.email,
        'name', u.raw_user_meta_data->>'full_name',
        'confirmed', u.email_confirmed_at IS NOT NULL,
        'joined', u.created_at)
        FROM auth.users u WHERE u.id = v_uid),

    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'order_number', o.order_number, 'created_at', o.created_at,
               'status', o.status, 'payment_status', o.payment_status,
               'payment_ref', o.payment_ref, 'items', o.items,
               'subtotal', o.subtotal, 'shipping', o.shipping, 'total', o.total,
               'city', o.customer_city, 'state', o.customer_state)
             ORDER BY o.created_at DESC)
        FROM public.dd_orders o
       WHERE o.user_id = v_uid
          OR (v_email IS NOT NULL AND lower(o.customer_email) = v_email)
    ), '[]'::jsonb),

    'reviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'product_id', r.product_id, 'product_name', p.name,
               'product_slug', p.slug, 'rating', r.rating, 'title', r.title,
               'body', r.body, 'status', r.status, 'created_at', r.created_at)
             ORDER BY r.created_at DESC)
        FROM public.dd_reviews r
        LEFT JOIN public.dd_products p ON p.id = r.product_id
       WHERE r.user_id = v_uid
          OR (v_email IS NOT NULL AND lower(r.author_email) = v_email)
    ), '[]'::jsonb),

    'waitlist', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'product_id', a.product_id, 'product_name', p.name,
               'product_slug', p.slug, 'product_image', COALESCE(p.thumb, p.image),
               'in_stock', p.stock > 0, 'size', a.size_wanted,
               'notified_at', a.notified_at, 'created_at', a.created_at)
             ORDER BY a.created_at DESC)
        FROM public.dd_stock_alerts a
        JOIN public.dd_products p ON p.id = a.product_id
       WHERE v_email IS NOT NULL AND lower(a.email) = v_email
    ), '[]'::jsonb),

    'newsletter', (
      SELECT jsonb_build_object('subscribed', COALESCE(bool_or(s.status = 'subscribed'), false))
        FROM public.dd_subscribers s
       WHERE v_email IS NOT NULL AND lower(s.email) = v_email)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_set_newsletter(p_on BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_email TEXT := public.my_verified_email();
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your email address first.' USING ERRCODE = '42501';
  END IF;
  IF p_on THEN
    INSERT INTO public.dd_subscribers AS sub (email, name, source, status)
    VALUES (v_email,
            (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()),
            'account', 'subscribed')
    ON CONFLICT (email) DO UPDATE SET status = 'subscribed', unsubscribed_at = NULL;
  ELSE
    UPDATE public.dd_subscribers
       SET status = 'unsubscribed', unsubscribed_at = NOW()
     WHERE lower(email) = v_email;
  END IF;
  RETURN p_on;
END;
$$;

REVOKE ALL ON FUNCTION public.my_set_newsletter(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_set_newsletter(BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_leave_waitlist(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_email TEXT := public.my_verified_email();
BEGIN
  IF v_email IS NULL THEN RETURN FALSE; END IF;
  DELETE FROM public.dd_stock_alerts WHERE id = p_id AND lower(email) = v_email;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.my_leave_waitlist(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_leave_waitlist(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_delete_review(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_email TEXT := public.my_verified_email();
BEGIN
  DELETE FROM public.dd_reviews
   WHERE id = p_id
     AND (user_id = auth.uid() OR (v_email IS NOT NULL AND lower(author_email) = v_email));
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.my_delete_review(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_delete_review(BIGINT) TO authenticated;

-- ==========================================================================
-- 4. SALES ANALYTICS
--    Any timeframe, compared with the period just before it. Bucketed in
--    Lagos time so "today" means today in Nigeria. Cancelled orders never
--    count as revenue.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.sales_analytics(
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_bucket TEXT DEFAULT 'day')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket TEXT := CASE WHEN p_bucket IN ('hour', 'day', 'week', 'month') THEN p_bucket ELSE 'day' END;
  v_step   INTERVAL := CASE v_bucket WHEN 'hour' THEN INTERVAL '1 hour' WHEN 'week' THEN INTERVAL '1 week'
                             WHEN 'month' THEN INTERVAL '1 month' ELSE INTERVAL '1 day' END;
  v_len    INTERVAL := p_to - p_from;
  v_pfrom  TIMESTAMPTZ := p_from - (p_to - p_from);
  result   JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from OR v_len > INTERVAL '1100 days' THEN
    RAISE EXCEPTION 'Choose a timeframe between one hour and three years.' USING ERRCODE = '22000';
  END IF;

  WITH cur AS (
    SELECT * FROM public.dd_orders WHERE created_at >= p_from AND created_at < p_to
  ),
  prev AS (
    SELECT * FROM public.dd_orders WHERE created_at >= v_pfrom AND created_at < p_from
  ),
  cur_ok  AS (SELECT * FROM cur  WHERE status <> 'cancelled'),
  prev_ok AS (SELECT * FROM prev WHERE status <> 'cancelled'),
  lines AS (
    SELECT o.created_at, o.customer_state,
           NULLIF(regexp_replace(COALESCE(it->>'id', ''), '\D', '', 'g'), '')::BIGINT AS product_id,
           it->>'name' AS name,
           COALESCE(NULLIF(regexp_replace(COALESCE(it->>'qty', '1'), '\D', '', 'g'), '')::INT, 1) AS qty,
           COALESCE((it->>'price')::NUMERIC, 0) AS price
      FROM cur_ok o, jsonb_array_elements(o.items) it
  ),
  first_order AS (
    SELECT lower(customer_email) AS email, MIN(created_at) AS first_at
      FROM public.dd_orders WHERE status <> 'cancelled'
     GROUP BY lower(customer_email)
  ),
  buckets AS (
    SELECT gs AS bucket_start
      FROM generate_series(
             date_trunc(v_bucket, p_from AT TIME ZONE 'Africa/Lagos'),
             date_trunc(v_bucket, (p_to - INTERVAL '1 second') AT TIME ZONE 'Africa/Lagos'),
             v_step) gs
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'bucket', v_bucket),

    'current', jsonb_build_object(
      'revenue',    COALESCE((SELECT SUM(total) FROM cur_ok), 0),
      'orders',     (SELECT COUNT(*) FROM cur_ok),
      'units',      COALESCE((SELECT SUM(qty) FROM lines), 0),
      'aov',        COALESCE((SELECT ROUND(AVG(total)) FROM cur_ok), 0),
      'customers',  (SELECT COUNT(DISTINCT lower(customer_email)) FROM cur_ok),
      'new_customers', (SELECT COUNT(*) FROM first_order WHERE first_at >= p_from AND first_at < p_to),
      'cancelled',  (SELECT COUNT(*) FROM cur WHERE status = 'cancelled'),
      'paid',       COALESCE((SELECT SUM(total) FROM cur_ok WHERE payment_status = 'paid'), 0),
      'unpaid',     COALESCE((SELECT SUM(total) FROM cur_ok WHERE payment_status <> 'paid'), 0),
      'shipping',   COALESCE((SELECT SUM(shipping) FROM cur_ok), 0)
    ),

    'previous', jsonb_build_object(
      'revenue',   COALESCE((SELECT SUM(total) FROM prev_ok), 0),
      'orders',    (SELECT COUNT(*) FROM prev_ok),
      'units',     COALESCE((SELECT SUM(COALESCE(NULLIF(regexp_replace(COALESCE(it->>'qty', '1'), '\D', '', 'g'), '')::INT, 1))
                               FROM prev_ok o, jsonb_array_elements(o.items) it), 0),
      'aov',       COALESCE((SELECT ROUND(AVG(total)) FROM prev_ok), 0),
      'customers', (SELECT COUNT(DISTINCT lower(customer_email)) FROM prev_ok)
    ),

    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'start', b.bucket_start,
               'revenue', COALESCE(s.revenue, 0),
               'orders', COALESCE(s.orders, 0)) ORDER BY b.bucket_start)
        FROM buckets b
        LEFT JOIN (
          SELECT date_trunc(v_bucket, created_at AT TIME ZONE 'Africa/Lagos') AS bucket_start,
                 SUM(total) AS revenue, COUNT(*) AS orders
            FROM cur_ok GROUP BY 1
        ) s ON s.bucket_start = b.bucket_start
    ), '[]'::jsonb),

    'top_products', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.revenue DESC) FROM (
        SELECT l.product_id AS id,
               COALESCE(p.name, MAX(l.name)) AS name,
               COALESCE(p.thumb, p.image) AS image,
               SUM(l.qty) AS units, SUM(l.qty * l.price) AS revenue
          FROM lines l LEFT JOIN public.dd_products p ON p.id = l.product_id
         GROUP BY l.product_id, p.name, p.thumb, p.image
         ORDER BY SUM(l.qty * l.price) DESC
         LIMIT 8) t
    ), '[]'::jsonb),

    'by_category', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.revenue DESC) FROM (
        SELECT COALESCE(c.name, 'Uncategorised') AS name, p.category AS id,
               SUM(l.qty) AS units, SUM(l.qty * l.price) AS revenue
          FROM lines l
          LEFT JOIN public.dd_products p ON p.id = l.product_id
          LEFT JOIN public.dd_categories c ON c.id = p.category
         GROUP BY c.name, p.category) t
    ), '[]'::jsonb),

    'by_state', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.revenue DESC) FROM (
        SELECT COALESCE(NULLIF(customer_state, ''), 'Unknown') AS name,
               COUNT(*) AS orders, SUM(total) AS revenue
          FROM cur_ok GROUP BY 1 ORDER BY SUM(total) DESC LIMIT 10) t
    ), '[]'::jsonb),

    'by_status', COALESCE((
      SELECT jsonb_object_agg(status, n) FROM (
        SELECT status, COUNT(*) AS n FROM cur GROUP BY status) t
    ), '{}'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- ==========================================================================
-- Check:
--   SELECT id, name FROM public.dd_categories ORDER BY display_order;   -- no Wears
--   SELECT id, name, category FROM public.dd_products ORDER BY id;
-- ==========================================================================
