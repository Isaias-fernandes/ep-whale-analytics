-- Reject late momentum entries so the observer focuses on potential continuation before a 10% run.
create or replace function public.ep_altcoin_momentum_state_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if coalesce(new.asset_return_72h,0)>=10 or coalesce(new.asset_return_24h,0)>=6 then
    new.phase:='NO_SIGNAL';
  elsif new.phase='CONFIRMED' and coalesce(new.volume_ratio_6h,0)<1.2 then
    new.phase:='WATCH';
  end if;
  return new;
end;
$$;
drop trigger if exists ep_altcoin_momentum_state_guard_trg on public.ep_altcoin_momentum_state;
create trigger ep_altcoin_momentum_state_guard_trg
before insert or update on public.ep_altcoin_momentum_state
for each row execute function public.ep_altcoin_momentum_state_guard();

create or replace function public.ep_altcoin_momentum_event_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_ret72 numeric; v_ret24 numeric; v_vol numeric;
begin
  v_ret72:=nullif(new.metrics->>'asset_return_72h_pct','')::numeric;
  v_ret24:=nullif(new.metrics->>'asset_return_24h_pct','')::numeric;
  v_vol:=nullif(new.metrics->>'volume_ratio_6h_vs_18h','')::numeric;
  if coalesce(v_ret72,0)>=10 or coalesce(v_ret24,0)>=6 then return null; end if;
  if new.phase='CONFIRMED' and coalesce(v_vol,0)<1.2 then new.phase:='WATCH'; end if;
  new.metrics:=new.metrics||jsonb_build_object('model_version','altcoin-momentum-v1.1-anti-chase');
  return new;
end;
$$;
drop trigger if exists ep_altcoin_momentum_event_guard_trg on public.ep_altcoin_momentum_events;
create trigger ep_altcoin_momentum_event_guard_trg
before insert on public.ep_altcoin_momentum_events
for each row execute function public.ep_altcoin_momentum_event_guard();

update public.ep_altcoin_momentum_events
set metrics=metrics||jsonb_build_object('baseline_snapshot',true,'baseline_note','Initial state snapshot; excluded from claims about forecasting the already observed 72h move.')
where created_at>=now()-interval '20 minutes';

-- Refresh current states under the anti-chase rules.
select public.ep_altcoin_momentum_tick();
