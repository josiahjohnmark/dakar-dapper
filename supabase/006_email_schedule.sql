-- ==========================================================================
-- DAKAR DAPPER — MIGRATION 006: run the email sender every minute
--
-- Run this ONLY AFTER the "send-emails" Edge Function is deployed and its
-- secrets are set (see SETUP.md, Step 6). Before that it would just call a
-- function that does not exist yet.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- The key below is the PUBLIC anon key the website already ships with.
-- It is enough to wake the function up; the function reads its own
-- service key from Supabase's secrets, so no secret is stored here.
-- Calling it only sends mail that is already waiting in the queue.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace any earlier version of this job.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'dd-send-emails';

SELECT cron.schedule(
  'dd-send-emails',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url     := 'https://cqcyxiqsxcuqikvbkcrs.supabase.co/functions/v1/send-emails',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxY3l4aXFzeGN1cWlrdmJrY3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NTY3NTIsImV4cCI6MjEwNTQzMjc1Mn0.pnnfzVRNvTAN_cvpEsSm5GhNhGMjNwudXlLPuJIyn54'
      ),
      body    := '{}'::jsonb
    );
  $job$
);

-- Check it is scheduled:
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'dd-send-emails';

-- A few minutes later, check it is actually running (look for "succeeded"):
-- SELECT status, return_message, start_time
--   FROM cron.job_run_details
--  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'dd-send-emails')
--  ORDER BY start_time DESC LIMIT 5;
