-- Set enzo_PROJECT_URL and enzo_CRON_SECRET in Vault before running this file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('enzo-bot-every-minute', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='enzo_PROJECT_URL') || '/functions/v1/enzo-bot/cron',
    headers := jsonb_build_object('Content-Type','application/json','x-enzo-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='enzo_CRON_SECRET')),
    body := '{}'::jsonb, timeout_milliseconds := 10000
  );
$$);
select cron.schedule('enzo-cleanup', '17 3 * * *', $$
  delete from public.enzo_documents_store where data ? 'expires_at'
    and data->>'expires_at' < to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  delete from public.enzo_documents_store where collection='bot_job_logs'
    and data->>'updatedAt' < to_char((now()-interval '60 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  delete from public.enzo_updates where (state='done' and updated_at<now()-interval '7 days')
    or (state='failed' and updated_at<now()-interval '30 days');
  delete from cron.job_run_details where start_time<now()-interval '7 days'
    and jobid in (select jobid from cron.job where jobname in ('enzo-bot-every-minute','enzo-cleanup'));
$$);
