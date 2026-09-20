-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 002: product pages & image galleries
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires setup.sql to have been run first.
-- ==========================================================================

-- A small thumbnail generated at upload time, used by grids and cart rows.
ALTER TABLE public.dd_products ADD COLUMN IF NOT EXISTS thumb TEXT;

-- Unique, stable URL slug for each product: /product/<slug>
ALTER TABLE public.dd_products ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill any missing slugs from the product name.
UPDATE public.dd_products
   SET slug = regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '-', 'g')
 WHERE slug IS NULL OR btrim(slug) = '';

-- Strip stray leading/trailing hyphens left by punctuation.
UPDATE public.dd_products
   SET slug = btrim(slug, '-')
 WHERE slug LIKE '-%' OR slug LIKE '%-';

-- Two products can share a name; the id keeps the URL unambiguous.
WITH dupes AS (
  SELECT id, slug,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
    FROM public.dd_products
   WHERE slug IS NOT NULL
)
UPDATE public.dd_products p
   SET slug = d.slug || '-' || p.id
  FROM dupes d
 WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS dd_products_slug_idx
  ON public.dd_products(slug) WHERE slug IS NOT NULL;

-- Keep a slug on every future product without relying on the client.
CREATE OR REPLACE FUNCTION public.ensure_product_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE base TEXT;
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    base := btrim(regexp_replace(lower(btrim(NEW.name)), '[^a-z0-9]+', '-', 'g'), '-');
    IF base = '' THEN base := 'product'; END IF;
    NEW.slug := base;
  END IF;

  -- Append the id if that slug is taken by a different product.
  IF EXISTS (SELECT 1 FROM public.dd_products
              WHERE slug = NEW.slug AND id IS DISTINCT FROM NEW.id) THEN
    NEW.slug := NEW.slug || '-' || NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dd_products_slug ON public.dd_products;
CREATE TRIGGER dd_products_slug
  BEFORE INSERT OR UPDATE OF name, slug ON public.dd_products
  FOR EACH ROW EXECUTE FUNCTION public.ensure_product_slug();

-- ==========================================================================
-- Look up one product by slug for the product page. A dedicated function
-- keeps the page to a single request and returns only what it needs.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.product_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(t) FROM (
    SELECT id, name, subtitle, category, badge, badge_type, price, original_price,
           show_discount, stock, is_out_of_stock, image, thumb, images, sizes,
           colors, color_names, rating, reviews, description, details, care,
           is_new, slug
      FROM public.dd_products
     WHERE slug = p_slug AND is_active IS NOT FALSE
     LIMIT 1
  ) t;
$$;

REVOKE ALL ON FUNCTION public.product_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_by_slug(TEXT) TO anon, authenticated;

-- Verify:  SELECT id, name, slug, thumb FROM public.dd_products ORDER BY id;
