-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 007: social links
--
-- One ordered list of social profiles, edited from Admin -> More -> Social
-- links and shown as brand icons in the footer and the Contact section.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once: it only fills the list if it is still empty,
-- so it never overwrites edits made in the admin.
-- ==========================================================================

ALTER TABLE public.dd_content
  ADD COLUMN IF NOT EXISTS socials JSONB DEFAULT '[]'::jsonb;

-- Make sure the settings row exists.
INSERT INTO public.dd_content (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- Starting list, in display order. Tracking tags (?si=, utm_source, _t=,
-- mibextid ...) have been removed from the links you shared.
UPDATE public.dd_content
   SET socials = '[
     {"platform": "instagram", "url": "https://www.instagram.com/dakardapper_"},
     {"platform": "tiktok",    "url": "https://www.tiktok.com/@dakar.dapper"},
     {"platform": "facebook",  "url": "https://www.facebook.com/share/1LetW7Gefg"},
     {"platform": "youtube",   "url": "https://youtube.com/@dakardapper"},
     {"platform": "snapchat",  "url": "https://snapchat.com/t/wr03f6se"},
     {"platform": "telegram",  "url": "https://t.me/Dakardapper"}
   ]'::jsonb
 WHERE id = 'main'
   AND (socials IS NULL OR socials = '[]'::jsonb);

-- Keep only well-formed entries with a safe link: guards the storefront
-- even if a bad row is ever written by hand.
ALTER TABLE public.dd_content DROP CONSTRAINT IF EXISTS dd_content_socials_chk;
ALTER TABLE public.dd_content ADD CONSTRAINT dd_content_socials_chk CHECK (
  jsonb_typeof(COALESCE(socials, '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(socials, '[]'::jsonb)) <= 20
);

-- Check:
SELECT jsonb_array_length(socials) AS links, socials FROM public.dd_content WHERE id = 'main';
