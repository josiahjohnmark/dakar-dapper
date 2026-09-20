-- ==========================================================================
-- ADMIN LOGIN DIAGNOSTIC
-- Paste into: Supabase Dashboard -> SQL Editor -> Run.
-- It changes nothing. It tells you which step is missing.
-- ==========================================================================

SELECT
  u.email,
  CASE WHEN u.email_confirmed_at IS NULL
       THEN 'NO  <-- not confirmed, sign-in will fail'
       ELSE 'yes' END                         AS email_confirmed,
  CASE WHEN a.user_id IS NULL
       THEN 'NO  <-- not an admin, sign-in is rejected'
       ELSE 'yes' END                         AS is_admin,
  u.created_at::date                          AS account_created,
  u.last_sign_in_at                           AS last_sign_in
FROM auth.users u
LEFT JOIN public.dd_admins a ON a.user_id = u.id
ORDER BY u.created_at DESC;

-- ==========================================================================
-- HOW TO READ IT
--
-- No rows at all
--     You have no account yet. Authentication -> Users -> Add user.
--     Enter an email and a strong password, and TICK "Auto Confirm User".
--     Then run the fix below.
--
-- Your email is listed but is_admin says NO
--     The account exists but is not authorised. Run the fix below.
--
-- email_confirmed says NO
--     Authentication -> Users -> click your user -> confirm it,
--     or delete it and re-add with "Auto Confirm User" ticked.
--
-- Both say yes but sign-in still fails
--     It is the password. Authentication -> Users -> your user ->
--     "Send password recovery" or set a new password directly.
-- ==========================================================================


-- ==========================================================================
-- THE FIX — makes every confirmed account an owner.
-- Safe to run more than once. Delete the ones you do not want afterwards.
-- ==========================================================================

-- INSERT INTO public.dd_admins (user_id, email, role)
-- SELECT id, email, 'owner'
--   FROM auth.users
--  WHERE email_confirmed_at IS NOT NULL
-- ON CONFLICT (user_id) DO NOTHING;


-- Or name one address explicitly (replace the email):

-- INSERT INTO public.dd_admins (user_id, email, role)
-- SELECT id, email, 'owner' FROM auth.users
--  WHERE email = 'you@example.com'
-- ON CONFLICT (user_id) DO NOTHING;


-- Then confirm it took:
-- SELECT * FROM public.dd_admins;
