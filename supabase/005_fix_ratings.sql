-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 005: clear ratings nobody gave
--
-- Products saved from the admin before 24 Sept 2026 were stored with a
-- made-up rating of 5. This recalculates every product's rating and review
-- count from approved reviews only (no reviews = no rating).
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
-- ==========================================================================

UPDATE public.dd_products p
   SET rating  = r.avg_rating,
       reviews = r.n
  FROM (
    SELECT pr.id,
           (SELECT ROUND(AVG(v.rating)::numeric, 1)
              FROM public.dd_reviews v
             WHERE v.product_id = pr.id AND v.status = 'approved') AS avg_rating,
           (SELECT COUNT(*)
              FROM public.dd_reviews v
             WHERE v.product_id = pr.id AND v.status = 'approved') AS n
      FROM public.dd_products pr
  ) r
 WHERE p.id = r.id;

-- Check: every product with 0 reviews should now show rating = NULL
SELECT id, name, rating, reviews FROM public.dd_products ORDER BY id;
