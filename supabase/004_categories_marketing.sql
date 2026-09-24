-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 004: new categories + email marketing
--
--   * The client's ten categories, with a size chart for each
--   * Marketing consent: who has agreed to receive marketing email
--   * Audience: every contact, filterable by what they bought and spent
--   * Campaigns: compose, target, test, send
--   * One-click unsubscribe
--   * Mail priority: order confirmations always jump the campaign queue
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires setup.sql, 002 and 003 first.
-- ==========================================================================

-- ==========================================================================
-- 1. CATEGORIES
-- ==========================================================================
-- Existing ids are kept so products already filed under them stay linked:
-- "footwear" and "accessories" are renamed, not replaced.

INSERT INTO public.dd_categories (id, name, display_order) VALUES
  ('casual-shirts',    'Casual Shirts',     1),
  ('corporate-shirts', 'Corporate Shirts',  2),
  ('trousers',         'Trousers',          3),
  ('shorts',           'Shorts',            4),
  ('underwears',       'Underwears',        5),
  ('footwear',         'Footwears',         6),
  ('caps',             'Caps',              7),
  ('accessories',      'Accessories',       8),
  ('perfumes',         'Perfumes',          9),
  ('bags',             'Bags',             10)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;

-- "Wears" still holds products. It moves to the end rather than being
-- deleted; empty it from the admin, then delete it there.
UPDATE public.dd_categories SET display_order = 99 WHERE id = 'wears';

-- ── Size charts for the new categories ───────────────────────────────────
INSERT INTO public.dd_size_charts (category_id, unit, columns, rows, note) VALUES
  ('casual-shirts', 'cm',
   '["Size","Chest","Shoulder","Sleeve","Length"]'::jsonb,
   '[["S","96-100","44","62","72"],
     ["M","104-108","46","63","74"],
     ["L","112-116","48","64","76"],
     ["XL","120-124","50","65","78"],
     ["XXL","128-132","52","66","80"]]'::jsonb,
   'Garment measurements laid flat and doubled. Relaxed fit: size down for a closer look.'),

  ('corporate-shirts', 'cm',
   '["Size","Collar","Chest","Sleeve","Length"]'::jsonb,
   '[["S","37-38","98","84","76"],
     ["M","39-40","106","86","78"],
     ["L","41-42","114","88","80"],
     ["XL","43-44","122","90","82"],
     ["XXL","45-46","130","92","84"]]'::jsonb,
   'Choose by collar first: you should fit two fingers between collar and neck when buttoned.'),

  ('trousers', 'cm',
   '["Size","Waist","Hip","Inseam","Leg opening"]'::jsonb,
   '[["30","76","98","80","18"],
     ["32","81","102","81","18.5"],
     ["34","86","106","82","19"],
     ["36","91","110","82","19.5"],
     ["38","96","114","83","20"]]'::jsonb,
   'Size number is the waist in inches. Measure where you normally wear your trousers.'),

  ('shorts', 'cm',
   '["Size","Waist","Hip","Inseam"]'::jsonb,
   '[["S","74-78","96","18"],
     ["M","80-84","100","19"],
     ["L","86-90","104","20"],
     ["XL","92-96","108","21"],
     ["XXL","98-102","112","22"]]'::jsonb,
   'Elasticated waists stretch about 6 cm. Inseam measured from crotch to hem.'),

  ('underwears', 'cm',
   '["Size","Waist","Hip"]'::jsonb,
   '[["S","71-76","86-91"],
     ["M","79-84","94-99"],
     ["L","86-91","101-106"],
     ["XL","94-99","109-114"],
     ["XXL","102-107","117-122"]]'::jsonb,
   'For hygiene reasons underwear cannot be returned once opened, so check your size first.'),

  ('caps', 'cm',
   '["Size","Head circumference","Fit"]'::jsonb,
   '[["S/M","55-57","Snug"],
     ["L/XL","58-60","Relaxed"],
     ["One size","55-60","Adjustable strap"]]'::jsonb,
   'Measure around your head just above the ears and eyebrows.'),

  ('perfumes', 'ml',
   '["Bottle","Volume","Roughly lasts"]'::jsonb,
   '[["Travel","10 ml","2-3 weeks of daily wear"],
     ["Standard","50 ml","3-4 months"],
     ["Large","100 ml","6-8 months"]]'::jsonb,
   'Based on 3-4 sprays a day. Apply to pulse points; do not rub.'),

  ('bags', 'cm',
   '["Type","Width","Height","Depth"]'::jsonb,
   '[["Pouch / clutch","28","18","4"],
     ["Crossbody","24","20","8"],
     ["Tote","40","34","14"],
     ["Weekender","52","30","24"]]'::jsonb,
   'Exact dimensions for each bag are listed in its product details.')
ON CONFLICT (category_id) DO NOTHING;

-- ==========================================================================
-- 2. MARKETING CONSENT
-- ==========================================================================
-- Under the NDPA, marketing email needs consent. Newsletter signups have
-- given it. A customer who only placed an order has not, so they are not
-- emailed marketing unless they tick the box at checkout.

ALTER TABLE public.dd_subscribers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.dd_subscribers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'subscribed';
ALTER TABLE public.dd_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
ALTER TABLE public.dd_subscribers ADD COLUMN IF NOT EXISTS
  unsubscribe_token UUID DEFAULT gen_random_uuid();

UPDATE public.dd_subscribers SET status = 'subscribed' WHERE status IS NULL;
UPDATE public.dd_subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;
-- Normalise case, skipping any row whose lowercase twin already exists
-- (a clash would abort the whole migration).
UPDATE public.dd_subscribers s
   SET email = lower(btrim(s.email))
 WHERE s.email <> lower(btrim(s.email))
   AND NOT EXISTS (SELECT 1 FROM public.dd_subscribers t
                    WHERE t.email = lower(btrim(s.email)) AND t.id <> s.id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dd_subscribers_status_chk') THEN
    ALTER TABLE public.dd_subscribers
      ADD CONSTRAINT dd_subscribers_status_chk CHECK (status IN ('subscribed','unsubscribed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dd_subscribers_token_idx
  ON public.dd_subscribers(unsubscribe_token);

ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT FALSE;

-- Newsletter signup. An explicit signup also re-subscribes someone who
-- previously unsubscribed: that is them changing their mind.
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
  INSERT INTO public.dd_subscribers (email, source, status)
  VALUES (v_email, left(COALESCE(p_source,'popup'), 40), 'subscribed')
  ON CONFLICT (email) DO UPDATE
    SET status = 'subscribed', unsubscribed_at = NULL;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_email(TEXT, TEXT) TO anon, authenticated;

-- ── place_order: now records the checkout opt-in ─────────────────────────
-- Identical to the version in setup.sql apart from the marking lines.
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
  v_marketing BOOLEAN := lower(COALESCE(payload->>'marketing', 'false')) IN ('true','1','yes');  -- marking
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

  v_count := jsonb_array_length(v_items);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Your bag is empty.' USING ERRCODE = '22000';
  END IF;
  IF v_count > 50 THEN
    RAISE EXCEPTION 'Too many items in one order.' USING ERRCODE = '22000';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.dd_orders
   WHERE created_at > NOW() - INTERVAL '1 hour'
     AND (customer_email = v_email OR customer_phone = v_phone);
  IF v_count >= 6 THEN
    RAISE EXCEPTION 'Too many orders from this account in the last hour. Please contact us on WhatsApp.'
      USING ERRCODE = '22000';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_qty := GREATEST(1, LEAST(20,
      COALESCE(NULLIF(regexp_replace(COALESCE(v_item->>'qty', '1'), '\D', '', 'g'), '')::INT, 1)));

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
      'id', v_prod.id, 'name', v_prod.name, 'image', v_prod.image,
      'price', v_prod.price, 'qty', v_qty,
      'size',  left(COALESCE(v_item->>'size', ''), 40),
      'color', left(COALESCE(v_item->>'color', ''), 40)
    );
  END LOOP;

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

  v_number := 'DD-' || to_char(NOW(), 'YYMMDD') || '-' ||
              upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 5));

  INSERT INTO public.dd_orders (
    order_number, user_id, customer_name, customer_email, customer_phone,
    customer_address, customer_city, customer_state, note,
    items, subtotal, shipping, total, status, payment_status, marketing_opt_in
  ) VALUES (
    v_number, auth.uid(), left(v_name,120), left(v_email,160), left(v_phone,40),
    left(v_address,300), left(v_city,80), left(v_state,80), v_note,
    v_line, v_subtotal, v_shipping, v_total, 'pending', 'unpaid', v_marketing
  )
  RETURNING * INTO v_order;

  -- marking: the customer ticked "email me new arrivals and offers"
  IF v_marketing THEN
    INSERT INTO public.dd_subscribers AS sub (email, name, source, status)
    VALUES (v_email, left(v_name,120), 'checkout', 'subscribed')
    ON CONFLICT (email) DO UPDATE
      SET status = 'subscribed', unsubscribed_at = NULL,
          name = COALESCE(sub.name, EXCLUDED.name);
  END IF;

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
-- 3. AUDIENCE
--    One row per email address, from newsletter signups and orders alike,
--    with what they bought, how much, and whether they may be emailed.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public._audience_rows(p_filter JSONB)
RETURNS TABLE (
  email TEXT, name TEXT, subscribed BOOLEAN, source TEXT,
  orders INT, spent NUMERIC, last_order TIMESTAMPTZ,
  categories TEXT[], product_ids BIGINT[], state TEXT,
  joined TIMESTAMPTZ, token UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH f AS (
    SELECT
      COALESCE(lower(p_filter->>'subscribed_only') = 'true', FALSE)  AS subscribed_only,
      COALESCE(lower(p_filter->>'customers_only')  = 'true', FALSE)  AS customers_only,
      COALESCE(lower(p_filter->>'never_bought')    = 'true', FALSE)  AS never_bought,
      NULLIF(btrim(COALESCE(p_filter->>'category', '')), '')          AS category,
      NULLIF(regexp_replace(COALESCE(p_filter->>'product_id', ''), '\D', '', 'g'), '')::BIGINT AS product_id,
      NULLIF(regexp_replace(COALESCE(p_filter->>'min_spent', ''), '\D', '', 'g'), '')::NUMERIC AS min_spent,
      NULLIF(regexp_replace(COALESCE(p_filter->>'bought_within_days', ''), '\D', '', 'g'), '')::INT AS within_days,
      NULLIF(regexp_replace(COALESCE(p_filter->>'lapsed_days', ''), '\D', '', 'g'), '')::INT AS lapsed_days,
      NULLIF(btrim(COALESCE(p_filter->>'state', '')), '')             AS state,
      NULLIF(lower(btrim(COALESCE(p_filter->>'search', ''))), '')     AS search
  ),
  order_people AS (
    SELECT lower(o.customer_email) AS email,
           (array_agg(o.customer_name  ORDER BY o.created_at DESC))[1] AS name,
           (array_agg(o.customer_state ORDER BY o.created_at DESC))[1] AS state,
           COUNT(*)::INT     AS orders,
           SUM(o.total)      AS spent,
           MAX(o.created_at) AS last_order,
           MIN(o.created_at) AS first_order
      FROM public.dd_orders o
     WHERE o.status <> 'cancelled' AND COALESCE(o.customer_email, '') <> ''
     GROUP BY lower(o.customer_email)
  ),
  bought AS (
    SELECT lower(o.customer_email) AS email,
           array_remove(array_agg(DISTINCT p.category), NULL)                  AS categories,
           array_remove(array_agg(DISTINCT p.id), NULL)                        AS product_ids
      FROM public.dd_orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) it
      LEFT JOIN public.dd_products p
             ON p.id = NULLIF(regexp_replace(COALESCE(it->>'id', ''), '\D', '', 'g'), '')::BIGINT
     WHERE o.status <> 'cancelled'
     GROUP BY lower(o.customer_email)
  ),
  subs AS (
    SELECT lower(s.email) AS email, s.name, s.status, s.source,
           s.created_at, s.unsubscribe_token
      FROM public.dd_subscribers s
  ),
  everyone AS (
    SELECT email FROM order_people
    UNION
    SELECT email FROM subs
  )
  SELECT e.email,
         COALESCE(op.name, s.name),
         COALESCE(s.status = 'subscribed', FALSE),
         COALESCE(s.source, 'order'),
         COALESCE(op.orders, 0),
         COALESCE(op.spent, 0),
         op.last_order,
         COALESCE(b.categories, '{}'::TEXT[]),
         COALESCE(b.product_ids, '{}'::BIGINT[]),
         op.state,
         LEAST(s.created_at, op.first_order),
         s.unsubscribe_token
    FROM everyone e
    CROSS JOIN f
    LEFT JOIN order_people op ON op.email = e.email
    LEFT JOIN bought b       ON b.email  = e.email
    LEFT JOIN subs s         ON s.email  = e.email
   WHERE (NOT f.subscribed_only OR s.status = 'subscribed')
     AND (NOT f.customers_only  OR COALESCE(op.orders, 0) > 0)
     AND (NOT f.never_bought    OR COALESCE(op.orders, 0) = 0)
     AND (f.category    IS NULL OR f.category   = ANY (COALESCE(b.categories,  '{}'::TEXT[])))
     AND (f.product_id  IS NULL OR f.product_id = ANY (COALESCE(b.product_ids, '{}'::BIGINT[])))
     AND (f.min_spent   IS NULL OR COALESCE(op.spent, 0) >= f.min_spent)
     AND (f.within_days IS NULL OR op.last_order >= NOW() - make_interval(days => f.within_days))
     AND (f.lapsed_days IS NULL OR (op.orders > 0 AND op.last_order < NOW() - make_interval(days => f.lapsed_days)))
     AND (f.state       IS NULL OR op.state = f.state)
     AND (f.search      IS NULL OR e.email LIKE '%' || f.search || '%'
                                OR lower(COALESCE(op.name, s.name, '')) LIKE '%' || f.search || '%');
$$;

-- Internal only: exposes unsubscribe tokens, so nobody may call it directly.
REVOKE ALL ON FUNCTION public._audience_rows(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audience(p_filter JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;

  WITH r AS (SELECT * FROM public._audience_rows(COALESCE(p_filter, '{}'::jsonb)))
  SELECT jsonb_build_object(
    'total',      (SELECT COUNT(*) FROM r),
    'subscribed', (SELECT COUNT(*) FROM r WHERE subscribed),
    'customers',  (SELECT COUNT(*) FROM r WHERE orders > 0),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'email', email, 'name', name, 'subscribed', subscribed,
               'source', source, 'orders', orders, 'spent', spent,
               'last_order', last_order, 'categories', categories,
               'state', state, 'joined', joined)
             ORDER BY last_order DESC NULLS LAST, joined DESC NULLS LAST)
        FROM (SELECT * FROM r ORDER BY last_order DESC NULLS LAST, joined DESC NULLS LAST LIMIT 1000) x
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.audience(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audience(JSONB) TO authenticated;

-- ==========================================================================
-- 4. CAMPAIGNS
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.dd_campaigns (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  preheader   TEXT,
  headline    TEXT,
  body        TEXT,
  cta_text    TEXT DEFAULT 'Shop now',
  cta_url     TEXT,
  product_ids JSONB DEFAULT '[]'::jsonb,
  segment     JSONB DEFAULT '{}'::jsonb,
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  recipients  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  sent_at     TIMESTAMPTZ
);

ALTER TABLE public.dd_campaigns ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='dd_campaigns'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.dd_campaigns', r.policyname); END LOOP;
END $$;

CREATE POLICY campaigns_admin ON public.dd_campaigns
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS dd_campaigns_touch ON public.dd_campaigns;
CREATE TRIGGER dd_campaigns_touch BEFORE UPDATE ON public.dd_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Mail queue: priority and campaign link ───────────────────────────────
-- 1 = order confirmations, 3 = restock alerts, 5 = campaigns. A sale email
-- to 2,000 people must never delay someone's order receipt.
ALTER TABLE public.dd_email_queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;
ALTER TABLE public.dd_email_queue ADD COLUMN IF NOT EXISTS
  campaign_id BIGINT REFERENCES public.dd_campaigns(id) ON DELETE SET NULL;

UPDATE public.dd_email_queue SET priority = 1 WHERE template = 'order_confirmation' AND priority = 5;
UPDATE public.dd_email_queue SET priority = 3 WHERE template = 'back_in_stock'      AND priority = 5;

CREATE INDEX IF NOT EXISTS dd_email_queue_pick_idx
  ON public.dd_email_queue(status, priority, created_at);
CREATE INDEX IF NOT EXISTS dd_email_queue_campaign_idx
  ON public.dd_email_queue(campaign_id);

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

  INSERT INTO public.dd_email_queue (to_email, template, payload, priority)
  VALUES (NEW.customer_email, 'order_confirmation', jsonb_build_object(
    'order_number', NEW.order_number, 'name', NEW.customer_name,
    'email', NEW.customer_email, 'phone', NEW.customer_phone,
    'address', NEW.customer_address, 'city', NEW.customer_city,
    'state', NEW.customer_state, 'note', NEW.note, 'items', NEW.items,
    'subtotal', NEW.subtotal, 'shipping', NEW.shipping, 'total', NEW.total,
    'placed_at', NEW.created_at
  ), 1);
  RETURN NEW;
END;
$$;

-- Back-in-stock rows inserted from the admin get priority 3 automatically.
CREATE OR REPLACE FUNCTION public.set_email_priority()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.template = 'order_confirmation' THEN NEW.priority := 1;
  ELSIF NEW.template = 'back_in_stock'   THEN NEW.priority := 3;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dd_email_queue_priority ON public.dd_email_queue;
CREATE TRIGGER dd_email_queue_priority BEFORE INSERT ON public.dd_email_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_email_priority();

-- ── Send a campaign (or a test of it) ────────────────────────────────────
-- Marketing always goes only to people who are subscribed, whatever the
-- filter says. Each email carries that person's own unsubscribe link.
CREATE OR REPLACE FUNCTION public.send_campaign(p_id BIGINT, p_test_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c        RECORD;
  v_products JSONB;
  v_base   JSONB;
  v_filter JSONB;
  v_count  INT;
  v_test   TEXT := lower(btrim(COALESCE(p_test_email, '')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.dd_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = '22000';
  END IF;
  IF btrim(COALESCE(c.subject, '')) = '' THEN
    RAISE EXCEPTION 'Add a subject line first.' USING ERRCODE = '22000';
  END IF;

  -- Snapshot the featured products now, so the email shows what was on sale
  -- when it was sent even if the product is edited later.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', p.name, 'price', p.price, 'original_price', p.original_price,
           'image', COALESCE(p.thumb, p.image), 'slug', p.slug,
           'sold_out', (p.stock <= 0))
           ORDER BY x.ord), '[]'::jsonb)
    INTO v_products
    FROM jsonb_array_elements_text(COALESCE(c.product_ids, '[]'::jsonb)) WITH ORDINALITY AS x(pid, ord)
    JOIN public.dd_products p
      ON p.id = NULLIF(regexp_replace(x.pid, '\D', '', 'g'), '')::BIGINT
     AND p.is_active IS NOT FALSE;

  v_base := jsonb_build_object(
    'campaign_id', c.id, 'subject', c.subject, 'preheader', c.preheader,
    'headline', c.headline, 'body', c.body,
    'cta_text', COALESCE(NULLIF(c.cta_text, ''), 'Shop now'),
    'cta_url', c.cta_url, 'products', v_products
  );

  -- A test goes to one address and does not mark the campaign as sent.
  IF v_test <> '' THEN
    IF v_test !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'That test address is not valid.' USING ERRCODE = '22000';
    END IF;
    INSERT INTO public.dd_email_queue (to_email, template, payload, priority, campaign_id)
    VALUES (v_test, 'campaign',
            v_base || jsonb_build_object('first_name', 'there', 'is_test', true), 2, NULL);
    RETURN jsonb_build_object('ok', true, 'test', true, 'recipients', 1);
  END IF;

  IF c.status = 'sent' THEN
    RAISE EXCEPTION 'This campaign has already been sent.' USING ERRCODE = '22000';
  END IF;

  v_filter := COALESCE(c.segment, '{}'::jsonb) || '{"subscribed_only": true}'::jsonb;

  INSERT INTO public.dd_email_queue (to_email, template, payload, priority, campaign_id)
  SELECT a.email, 'campaign',
         v_base || jsonb_build_object(
           'first_name', COALESCE(NULLIF(split_part(btrim(COALESCE(a.name, '')), ' ', 1), ''), 'there'),
           'unsubscribe_token', a.token),
         5, c.id
    FROM public._audience_rows(v_filter) a
   WHERE a.token IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nobody who has agreed to marketing email matches this audience.'
      USING ERRCODE = '22000';
  END IF;

  UPDATE public.dd_campaigns
     SET status = 'sent', recipients = v_count, sent_at = NOW()
   WHERE id = c.id;

  PERFORM public.log_admin_action('campaign.send', 'campaign', c.id::TEXT,
                                  jsonb_build_object('recipients', v_count));

  RETURN jsonb_build_object('ok', true, 'test', false, 'recipients', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.send_campaign(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_campaign(BIGINT, TEXT) TO authenticated;

-- Delivery progress per campaign, for the admin list.
CREATE OR REPLACE FUNCTION public.campaign_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_object_agg(campaign_id::TEXT, jsonb_build_object(
           'sent',   sent, 'queued', queued, 'failed', failed)), '{}'::jsonb)
    INTO result
    FROM (
      SELECT campaign_id,
             COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
             COUNT(*) FILTER (WHERE status = 'queued') AS queued,
             COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM public.dd_email_queue
       WHERE campaign_id IS NOT NULL
       GROUP BY campaign_id
    ) t;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_stats() TO authenticated;

-- ==========================================================================
-- 5. UNSUBSCRIBE — one click, no login, from any campaign email
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.unsubscribe(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email TEXT;
BEGIN
  UPDATE public.dd_subscribers
     SET status = 'unsubscribed', unsubscribed_at = NOW()
   WHERE unsubscribe_token::TEXT = btrim(COALESCE(p_token, ''))
  RETURNING email INTO v_email;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Never echo the full address back to whoever holds the link.
  RETURN jsonb_build_object('ok', true,
    'email', left(v_email, 2) || '***' || substr(v_email, position('@' IN v_email)));
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe(TEXT) TO anon, authenticated;

-- Remove any unsent campaign mail to people who have since unsubscribed.
CREATE OR REPLACE FUNCTION public.drop_mail_for_unsubscribed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'unsubscribed' AND COALESCE(OLD.status, '') <> 'unsubscribed' THEN
    DELETE FROM public.dd_email_queue
     WHERE status = 'queued' AND template = 'campaign'
       AND lower(to_email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dd_subscribers_unsub ON public.dd_subscribers;
CREATE TRIGGER dd_subscribers_unsub AFTER UPDATE OF status ON public.dd_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.drop_mail_for_unsubscribed();

-- ==========================================================================
-- Verify:
--   SELECT id, name, display_order FROM public.dd_categories ORDER BY display_order;
--   SELECT public.audience('{}'::jsonb);   -- works when signed in as admin only
-- ==========================================================================
