-- ==========================================================================
-- 009_paystack_payments.sql — Dakar Dapper Paystack Integration & Fix
-- ==========================================================================
-- Run this in Supabase -> SQL Editor.
-- 1. Adds tracking columns to dd_orders
-- 2. Fixes place_order() reference generation (removes gen_random_bytes dependency)
-- 3. Adds secure confirm_paystack_payment() procedure
-- ==========================================================================

-- 1. Ensure dd_orders has payment gateway and paid_at tracking
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'paystack';
ALTER TABLE public.dd_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 2. FIX: place_order() reference generation
-- Replaces gen_random_bytes() with built-in md5() so it NEVER fails on any Supabase project
CREATE OR REPLACE FUNCTION public.place_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_name    TEXT := btrim(COALESCE(payload->>'name', ''));
  v_email   TEXT := lower(btrim(COALESCE(payload->>'email', '')));
  v_phone   TEXT := btrim(COALESCE(payload->>'phone', ''));
  v_address TEXT := btrim(COALESCE(payload->>'address', ''));
  v_city    TEXT := btrim(COALESCE(payload->>'city', ''));
  v_state   TEXT := btrim(COALESCE(payload->>'state', ''));
  v_note    TEXT := left(btrim(COALESCE(payload->>'note', '')), 500);
  v_marketing BOOLEAN := lower(COALESCE(payload->>'marketing', 'false')) IN ('true','1','yes');
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

  -- Delivery option: check if customer selected to add delivery fee online
  IF COALESCE((payload->>'add_delivery')::BOOLEAN, false) IS TRUE
     OR (payload->>'delivery_choice') = 'paid_online' THEN
    SELECT fee INTO v_shipping FROM public.dd_shipping_rates WHERE state = v_state;
    v_shipping := COALESCE(v_shipping, 5000);
    v_note := TRIM(COALESCE(v_note, '') || ' [Delivery: Paid online]');
  ELSE
    v_shipping := 0;
    v_note := TRIM(COALESCE(v_note, '') || ' [Delivery: Pay upon delivery]');
  END IF;

  v_total := v_subtotal + v_shipping;

  -- Reliable random reference using standard Postgres MD5 (built-in, no extension needed)
  v_number := 'DD-' || to_char(NOW(), 'YYMMDD') || '-' ||
              upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

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

  -- marketing opt-in
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

-- 3. Confirm payment function
CREATE OR REPLACE FUNCTION public.confirm_paystack_payment(
  p_order_number TEXT,
  p_reference    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.dd_orders%ROWTYPE;
BEGIN
  UPDATE public.dd_orders
     SET payment_status  = 'paid',
         payment_ref     = p_reference,
         payment_gateway = 'paystack',
         paid_at         = COALESCE(paid_at, NOW()),
         status          = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
         updated_at      = NOW()
   WHERE order_number = p_order_number
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Order not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_number',   v_order.order_number,
    'payment_status', v_order.payment_status,
    'status',         v_order.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_paystack_payment(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_paystack_payment(TEXT, TEXT) TO anon, authenticated;
