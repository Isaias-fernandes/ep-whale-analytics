do $$
declare
  existing_key text;
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'ep_24x7_monitor_key'
  ) then
    select substring(command from 'x-ep-internal-key[^0-9a-f]+([0-9a-f]{64})')
      into existing_key
    from cron.job
    where jobid = 1 and jobname = 'ep-24x7-monitor-every-minute';
    if existing_key is null then
      raise exception 'Could not migrate EP monitor key from the existing cron job';
    end if;
    perform vault.create_secret(
      existing_key,
      'ep_24x7_monitor_key',
      'Key used only by the hourly EP monitor cron and edge authentication'
    );
  end if;
end $$;

create or replace function public.ep_validate_24x7_key(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select candidate is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'ep_24x7_monitor_key'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.ep_validate_24x7_key(text) from public, anon, authenticated;
grant execute on function public.ep_validate_24x7_key(text) to service_role;

select cron.alter_job(
  job_id := 1,
  schedule := '0 * * * *',
  active := true,
  command := $job$
select net.http_post(
  url := 'https://qhgclnkctpzumtybailv.supabase.co/functions/v1/ep-24x7-monitor',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-ep-internal-key',
    (select decrypted_secret from vault.decrypted_secrets where name='ep_24x7_monitor_key')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);
$job$
);
