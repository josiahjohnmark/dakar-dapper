-- ==========================================================================
-- DAKAR DAPPER — HARDENED DATABASE SETUP
-- --------------------------------------------------------------------------
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- It is idempotent: safe to run again. It REPLACES the old open policies.
--
-- SECURITY MODEL
--   * anon (every website visitor) may ONLY read the catalogue.
--   * anon may NEVER read orders, subscribers or admins.
--   * anon may NEVER write anything directly. Orders and newsletter
--     signups go through SECURITY DEFINER functions that validate input
--     and compute money server-side.
--   * Only a signed-in user listed in dd_admins may manage the store.
-- ==========================================================================

-- ── 0. EXTENSIONS ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================================
-- 1. TABLES
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.dd_categories (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dd_products (
  id              BIGINT PRIMARY KEY,
  name            TEXT NOT NULL,
  subtitle        TEXT,
  category        TEXT NOT NULL,
  badge           TEXT,
  badge_type      TEXT DEFAULT 'tag-gold',
  price           NUMERIC NOT NULL CHECK (price >= 0),
  original_price  NUMERIC CHECK (original_price IS NULL OR original_price >= 0),
  show_discount   BOOLEAN DEFAULT TRUE,
  stock           INTEGER DEFAULT 10 CHECK (stock >= 0),
  is_out_of_stock BOOLEAN DEFAULT FALSE,
  image           TEXT,
  images          JSONB DEFAULT '[]'::jsonb,
  sizes           JSONB DEFAULT '["S","M","L","XL"]'::jsonb,
  colors          JSONB DEFAULT '["#1A1A1A","#E5E5E5"]'::jsonb,
  color_names     JSONB DEFAULT '["Noir","Bone"]'::jsonb,
  rating          NUMERIC DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5),
  reviews         INTEGER DEFAULT 0,
  description     TEXT,
  details         JSONB DEFAULT '[]'::jsonb,
  care            TEXT,
  is_new          BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  slug            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Columns added after the first release (safe on existing installs)
ALTER TABLE public.dd_products ADD COLUMN IF NOT EXISTS images    JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.dd_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.dd_products ADD COLUMN IF NOT EXISTS slug      TEXT;

CREATE TABLE IF NOT EXISTS public.dd_content (
  id              TEXT PRIMARY KEY DEFAULT 'main',
  hero_badge      TEXT,
  hero_title      TEXT,
  hero_desc       TEXT,
  hero_btn1_text  TEXT,
  hero_btn2_text  TEXT,
  banner_notice   TEXT,
  story_kicker    TEXT,
  story_title     TEXT,
  story_desc      TEXT,
  phone           TEXT,
  phone_display   TEXT,
  instagram_url   TEXT,
  twitter_url     TEXT,
  email_address   TEXT,
  free_ship_min   NUMERIC DEFAULT 150000,
  popup_delay_sec INTEGER DEFAULT 30,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dd_content ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE public.dd_content ADD COLUMN IF NOT EXISTS twitter_url   TEXT;
ALTER TABLE public.dd_content ADD COLUMN IF NOT EXISTS email_address TEXT;
ALTER TABLE public.dd_content ADD COLUMN IF NOT EXISTS free_ship_min NUMERIC DEFAULT 150000;

CREATE TABLE IF NOT EXISTS public.dd_orders (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number     TEXT UNIQUE,
  customer_name    TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_city    TEXT,
  customer_state   TEXT,
  note             TEXT,
  items            JSONB NOT NULL,
  subtotal         NUMERIC NOT NULL,
  shipping         NUMERIC DEFAULT 0,
  total            NUMERIC NOT NULL,
  status           TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','packed','shipped','delivered','cancelled')),
  payment_status   TEXT DEFAULT 'unpaid'
                     CHECK (payment_status IN ('unpaid','paid','refunded','failed')),
  payment_ref      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS order_number   TEXT;
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS note           TEXT;
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS payment_ref    TEXT;
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.dd_subscribers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  source     TEXT DEFAULT 'popup',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-state delivery pricing
CREATE TABLE IF NOT EXISTS public.dd_shipping_rates (
  state TEXT PRIMARY KEY,
  fee   NUMERIC NOT NULL DEFAULT 5000 CHECK (fee >= 0)
);

-- Who is allowed to run the store
CREATE TABLE IF NOT EXISTS public.dd_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  role       TEXT DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tamper-evident trail of every admin action
CREATE TABLE IF NOT EXISTS public.dd_audit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor      UUID,
  actor_email TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dd_products_category_idx ON public.dd_products(category);
CREATE INDEX IF NOT EXISTS dd_products_active_idx   ON public.dd_products(is_active);
CREATE INDEX IF NOT EXISTS dd_orders_created_idx    ON public.dd_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS dd_orders_status_idx     ON public.dd_orders(status);
CREATE INDEX IF NOT EXISTS dd_audit_created_idx     ON public.dd_audit_log(created_at DESC);

-- ==========================================================================
-- 2. HELPER FUNCTIONS
-- ==========================================================================

-- Is the caller a registered admin? SECURITY DEFINER so the policy can read
-- dd_admins even though anon cannot.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dd_admins WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Keep updated_at honest
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS dd_products_touch ON public.dd_products;
CREATE TRIGGER dd_products_touch BEFORE UPDATE ON public.dd_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS dd_orders_touch ON public.dd_orders;
CREATE TRIGGER dd_orders_touch BEFORE UPDATE ON public.dd_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ==========================================================================
-- 3. ROW LEVEL SECURITY
-- ==========================================================================

ALTER TABLE public.dd_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_content        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_subscribers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_admins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_audit_log      ENABLE ROW LEVEL SECURITY;

-- NOTE: deliberately NOT using FORCE ROW LEVEL SECURITY here.
-- FORCE would apply RLS to the table owner too, and the owner is exactly who
-- our SECURITY DEFINER functions run as. It would stop place_order() from
-- inserting, and it would make the dd_admins policy call is_admin(), which
-- reads dd_admins, which re-evaluates the policy — infinite recursion.
-- RLS already applies to anon and authenticated, which is where the risk is.

-- Remove EVERY previously defined policy on these tables ------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('dd_categories','dd_products','dd_content','dd_orders',
                        'dd_subscribers','dd_shipping_rates','dd_admins','dd_audit_log')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── Catalogue: the world may read, only admins may write ────────────────
CREATE POLICY cat_public_read  ON public.dd_categories
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY cat_admin_write  ON public.dd_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY prod_public_read ON public.dd_products
  FOR SELECT TO anon, authenticated USING (is_active IS NOT FALSE);
CREATE POLICY prod_admin_read  ON public.dd_products
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY prod_admin_write ON public.dd_products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY content_public_read ON public.dd_content
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY content_admin_write ON public.dd_content
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ship_public_read ON public.dd_shipping_rates
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ship_admin_write ON public.dd_shipping_rates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Orders: NO anon access at all. Placed via place_order() only. ───────
CREATE POLICY orders_admin_read  ON public.dd_orders
  FOR SELECT TO authenticated USING (public.is_admin());
-- A signed-in customer may see their OWN orders and nothing else.
CREATE POLICY orders_owner_read  ON public.dd_orders
  FOR SELECT TO authenticated USING (user_id IS NOT NULL AND user_id = auth.uid());
CREATE POLICY orders_admin_write ON public.dd_orders
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY orders_admin_del   ON public.dd_orders
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── Subscribers: NO anon access. Added via subscribe_email() only. ─────
CREATE POLICY subs_admin_read ON public.dd_subscribers
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY subs_admin_del  ON public.dd_subscribers
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── Admins list: an admin may see the roster; nobody may self-promote ──
CREATE POLICY admins_self_read ON public.dd_admins
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── Audit log: admins read, nobody writes from the client ──────────────
CREATE POLICY audit_admin_read ON public.dd_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- ==========================================================================
-- 4. SERVER-SIDE ORDER PLACEMENT
--    Money is NEVER trusted from the browser. Prices, shipping and totals
--    are all recomputed here from the database.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.place_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name    TEXT := btrim(COALESCE(payload->>'name', ''));
  v_email   TEXT := lower(btrim(COALESCE(payload->>'email', '')));
  v_phone   TEXT := btrim(COALESCE(payload->>'phone', ''));
  v_address TEXT := btrim(COALESCE(payload->>'address', ''));
  v_city    TEXT := btrim(COALESCE(payload->>'city', ''));
  v_state   TEXT := btrim(COALESCE(payload->>'state', ''));
  v_note    TEXT := left(btrim(COALESCE(payload->>'note', '')), 500);
  v_items   JSONB := COALESCE(payload->'items', '[]'::jsonb);
  v_item    JSONB;
  v_prod    RECORD;
  v_qty     INT;
  v_line    JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  v_shipping NUMERIC := 0;
  v_free_min NUMERIC;
  v_total    NUMERIC;
  v_order    RECORD;
  v_number   TEXT;
  v_count    INT;
BEGIN
  -- ---- validate customer ------------------------------------------------
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Please enter your full name.' USING ERRCODE = '22000';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.' USING ERRCODE = '22000';
  END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'Please enter a valid phone number.' USING ERRCODE = '22000';
  END IF;
  IF length(v_address) < 6 THEN
    RAISE EXCEPTION 'Please enter your delivery address.' USING ERRCODE = '22000';
  END IF;

  -- ---- validate basket --------------------------------------------------
  v_count := jsonb_array_length(v_items);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Your bag is empty.' USING ERRCODE = '22000';
  END IF;
  IF v_count > 50 THEN
    RAISE EXCEPTION 'Too many items in one order.' USING ERRCODE = '22000';
  END IF;

  -- ---- throttle ---------------------------------------------------------
  -- Without this, a script could place orders in a loop and drive every
  -- product to zero stock purely to take the shop offline.
  SELECT COUNT(*) INTO v_count
    FROM public.dd_orders
   WHERE created_at > NOW() - INTERVAL '1 hour'
     AND (customer_email = v_email OR customer_phone = v_phone);
  IF v_count >= 6 THEN
    RAISE EXCEPTION 'Too many orders from this account in the last hour. Please contact us on WhatsApp.'
      USING ERRCODE = '22000';
  END IF;

  v_count := jsonb_array_length(v_items);

  -- ---- price each line from the DB, reserving stock atomically ---------
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    -- Non-numeric input falls back to 1 rather than raising a cast error.
    v_qty := GREATEST(1, LEAST(20,
      COALESCE(NULLIF(regexp_replace(COALESCE(v_item->>'qty', '1'), '\D', '', 'g'), '')::INT, 1)));

    -- Atomic guarded decrement: fails to match if stock is insufficient,
    -- so two simultaneous orders can never oversell the same unit.
    UPDATE public.dd_products
       SET stock = stock - v_qty,
           is_out_of_stock = (stock - v_qty) <= 0
     WHERE id = COALESCE(NULLIF(regexp_replace(COALESCE(v_item->>'id', ''), '\D', '', 'g'), '')::BIGINT, -1)
       AND is_active IS NOT FALSE
       AND stock >= v_qty
    RETURNING id, name, price, image INTO v_prod;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sorry, one of your items just sold out. Please review your bag.'
        USING ERRCODE = '22000';
    END IF;

    v_subtotal := v_subtotal + (v_prod.price * v_qty);
    v_line := v_line || jsonb_build_object(
      'id',    v_prod.id,
      'name',  v_prod.name,
      'image', v_prod.image,
      'price', v_prod.price,
      'qty',   v_qty,
      'size',  left(COALESCE(v_item->>'size', ''), 40),
      'color', left(COALESCE(v_item->>'color', ''), 40)
    );
  END LOOP;

  -- ---- shipping, from our table, not the browser ------------------------
  SELECT COALESCE(free_ship_min, 150000) INTO v_free_min
    FROM public.dd_content WHERE id = 'main';
  v_free_min := COALESCE(v_free_min, 150000);

  IF v_subtotal >= v_free_min THEN
    v_shipping := 0;
  ELSE
    SELECT fee INTO v_shipping FROM public.dd_shipping_rates WHERE state = v_state;
    v_shipping := COALESCE(v_shipping, 5000);
  END IF;

  v_total := v_subtotal + v_shipping;

  -- ---- human readable reference ----------------------------------------
  v_number := 'DD-' || to_char(NOW(), 'YYMMDD') || '-' ||
              upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 5));

  INSERT INTO public.dd_orders (
    order_number, user_id, customer_name, customer_email, customer_phone,
    customer_address, customer_city, customer_state, note,
    items, subtotal, shipping, total, status, payment_status
  ) VALUES (
    v_number, auth.uid(), left(v_name,120), left(v_email,160), left(v_phone,40),
    left(v_address,300), left(v_city,80), left(v_state,80), v_note,
    v_line, v_subtotal, v_shipping, v_total, 'pending', 'unpaid'
  )
  RETURNING * INTO v_order;

  -- Only non-sensitive fields go back to the browser.
  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'subtotal',     v_order.subtotal,
    'shipping',     v_order.shipping,
    'total',        v_order.total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(JSONB) TO anon, authenticated;

-- ==========================================================================
-- 5. NEWSLETTER SIGNUP (write-only for the public)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.subscribe_email(p_email TEXT, p_source TEXT DEFAULT 'popup')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email TEXT := lower(btrim(COALESCE(p_email,'')));
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 160 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.dd_subscribers (email, source)
  VALUES (v_email, left(COALESCE(p_source,'popup'), 40))
  ON CONFLICT (email) DO NOTHING;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_email(TEXT, TEXT) TO anon, authenticated;

-- ==========================================================================
-- 6. ADMIN DASHBOARD STATS (one round trip instead of five)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.admin_stats()
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

  SELECT jsonb_build_object(
    'revenue_total',  COALESCE((SELECT SUM(total) FROM dd_orders WHERE status <> 'cancelled'), 0),
    'revenue_month',  COALESCE((SELECT SUM(total) FROM dd_orders
                                 WHERE status <> 'cancelled'
                                   AND created_at >= date_trunc('month', NOW())), 0),
    'orders_total',   (SELECT COUNT(*) FROM dd_orders),
    'orders_pending', (SELECT COUNT(*) FROM dd_orders WHERE status = 'pending'),
    'orders_today',   (SELECT COUNT(*) FROM dd_orders WHERE created_at >= CURRENT_DATE),
    'products_total', (SELECT COUNT(*) FROM dd_products),
    'low_stock',      (SELECT COUNT(*) FROM dd_products WHERE stock > 0 AND stock <= 3),
    'out_of_stock',   (SELECT COUNT(*) FROM dd_products WHERE stock <= 0),
    'subscribers',    (SELECT COUNT(*) FROM dd_subscribers),
    'stock_value',    COALESCE((SELECT SUM(price * stock) FROM dd_products), 0),
    'sales_14d',      COALESCE((
        SELECT jsonb_agg(row_to_json(d) ORDER BY d.day)
        FROM (
          SELECT (CURRENT_DATE - i) AS day,
                 COALESCE((SELECT SUM(total) FROM dd_orders
                            WHERE status <> 'cancelled'
                              AND created_at::date = CURRENT_DATE - i), 0) AS amount
          FROM generate_series(13, 0, -1) AS i
        ) d), '[]'::jsonb),
    'top_products',   COALESCE((
        SELECT jsonb_agg(t) FROM (
          SELECT it->>'name' AS name,
                 SUM((it->>'qty')::INT) AS units,
                 SUM((it->>'price')::NUMERIC * (it->>'qty')::INT) AS revenue
          FROM dd_orders o, jsonb_array_elements(o.items) it
          WHERE o.status <> 'cancelled'
          GROUP BY it->>'name'
          ORDER BY units DESC
          LIMIT 5
        ) t), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

-- ==========================================================================
-- 7. AUDIT LOGGING (admins only, append-only from the server)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT, p_entity TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL, p_detail JSONB DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  INSERT INTO public.dd_audit_log (actor, actor_email, action, entity, entity_id, detail)
  VALUES (auth.uid(),
          (SELECT email FROM public.dd_admins WHERE user_id = auth.uid()),
          left(p_action, 80), left(p_entity, 40), left(p_entity_id, 64), p_detail);
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT,TEXT,TEXT,JSONB) TO authenticated;

-- ==========================================================================
-- 8. SEED REFERENCE DATA
-- ==========================================================================

INSERT INTO public.dd_categories (id, name, display_order) VALUES
  ('wears','Wears',1), ('accessories','Accessories',2), ('footwear','Footwear',3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dd_content (id, hero_badge, hero_title, hero_desc,
  hero_btn1_text, hero_btn2_text, banner_notice, story_kicker, story_title,
  story_desc, phone, phone_display, free_ship_min, popup_delay_sec)
VALUES ('main',
  'Old Money. Premium Quality. Timeless Quality',
  'The Art of Dressing Well',
  'We let you have the best pieces—our quality is uncompromised and universally admired. At Dakar Dapper. Located in the Mainland Lagos and serving beyond Borders.',
  'Shop Collection','Our Story',
  'Free Express Shipping Nationwide On Orders Over ₦150,000',
  'The Dakar Dapper Story','Curated for the Modern Gentleman',
  'We believe great style isn''t about following trends — it''s about defining them.',
  '2349019603621','09019603621',150000,30)
ON CONFLICT (id) DO NOTHING;

-- Delivery fees for all 36 states + FCT
INSERT INTO public.dd_shipping_rates (state, fee) VALUES
  ('Lagos',2500),('Ogun',3000),('Oyo',3500),('Osun',3500),('Ondo',3500),
  ('Ekiti',3500),('Edo',4000),('Delta',4000),('Rivers',4500),('Bayelsa',5000),
  ('Akwa Ibom',5000),('Cross River',5000),('Abia',4500),('Imo',4500),
  ('Anambra',4500),('Enugu',4500),('Ebonyi',5000),('FCT - Abuja',4000),
  ('Kaduna',5000),('Kano',5500),('Katsina',5500),('Kebbi',6000),('Sokoto',6000),
  ('Zamfara',6000),('Jigawa',5500),('Bauchi',5500),('Gombe',5500),
  ('Yobe',6000),('Borno',6000),('Adamawa',6000),('Taraba',6000),
  ('Plateau',5000),('Nasarawa',4500),('Benue',5000),('Niger',4500),
  ('Kwara',4000),('Kogi',4000)
ON CONFLICT (state) DO NOTHING;

-- Give every existing product a URL slug
UPDATE public.dd_products
   SET slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
 WHERE slug IS NULL;

-- Fix the broken cargo image path shipped in the first release
UPDATE public.dd_products
   SET image = 'assets/cargo-pants.jpg'
 WHERE image = 'assets/cargos.jpg';

-- ==========================================================================
-- 9. FINAL STEP — MAKE YOURSELF THE ADMIN
-- --------------------------------------------------------------------------
-- 1) Supabase Dashboard -> Authentication -> Users -> "Add user"
--    Create yourself a user with a STRONG password. Tick "Auto Confirm".
-- 2) Replace the email below with that address and run this block.
-- ==========================================================================

INSERT INTO public.dd_admins (user_id, email, role)
SELECT id, email, 'owner' FROM auth.users
WHERE email = 'CHANGE-ME@dakardapper.com'
ON CONFLICT (user_id) DO NOTHING;

-- Verify (should list your admin):  SELECT * FROM public.dd_admins;
