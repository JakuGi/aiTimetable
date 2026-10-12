-- Secrets for push live in Vault (created once by hand, never in git):
--   vapid_public_key, vapid_private_key, push_cron_secret, project_url

-- The Edge Function reads its push config through this; only the secret key (service_role) may call it.
create or replace function public.push_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(name, decrypted_secret)
  from vault.decrypted_secrets
  where name in ('vapid_public_key', 'vapid_private_key', 'push_cron_secret');
$$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- every minute: send whatever is due
select cron.schedule(
  'send-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{"tick": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
