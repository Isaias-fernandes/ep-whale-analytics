-- Motor 8: isolated, hourly shadow experiment for market phase and early-leg candidates.
-- Reads the existing hourly Motor 6 price history; does not change other motors or place orders.

create table if not exists public.ep_motor8_state (
  asset text primary key check (asset ~ '^[A-Z0-9]{2,20}USDT$'),
  observed_at timestamptz not null,
  price numeric,
  score smallint check (score between 0 and 100),
  phase text not null check (phase in ('INSUFFICIENT_DATA','NO_SIGNAL','WATCH','CONFIRMED')),
  market_regime text not null check (market_regime in ('BULL','BEAR','NEUTRAL','NO_BTC')),
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ep_motor8_state enable row level security;
revoke all on public.ep_motor8_state from public, anon, authenticated;
grant select, insert, update, delete on public.ep_motor8_state to service_role;

create table if not exists public.ep_motor8_events (
  id bigint generated always as identity primary key,
  asset text not null check (asset ~ '^[A-Z0-9]{2,20}USDT$'),
  signal_at timestamptz not null,
  entry_price numeric not null check (entry_price > 0),
  score smallint not null check (score between 0 and 100),
  phase text not null check (phase in ('WATCH','CONFIRMED')),
  market_regime text not null check (market_regime in ('BULL','BEAR','NEUTRAL','NO_BTC')),
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'COLLECTING' check (status in ('COLLECTING','COMPLETED')),
  last_at timestamptz,
  last_price numeric,
  best_pct numeric not null default 0,
  worst_pct numeric not null default 0,
  outcome_24h jsonb,
  outcome_72h jsonb,
  outcome_7d jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (asset, signal_at)
);
alter table public.ep_motor8_events enable row level security;
revoke all on public.ep_motor8_events from public, anon, authenticated;
grant select, insert, update, delete on public.ep_motor8_events to service_role;
create index if not exists ep_motor8_events_recent_idx on public.ep_motor8_events(signal_at desc);
create index if not exists ep_motor8_events_asset_recent_idx on public.ep_motor8_events(asset, signal_at desc);

create or replace function public.ep_motor8_outcome(p_asset text,p_start timestamptz,p_hours integer,p_entry numeric,p_now timestamptz)
returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with c as (
    select candle_at,high_price,low_price,close_price
    from public.ep_motor6_price_history
    where asset=p_asset and candle_at>p_start
      and candle_at<=least(p_start+make_interval(hours=>p_hours),p_now)
  ), last_c as (
    select close_price,candle_at from c order by candle_at desc limit 1
  )
  select case when count(*)=0 then null else jsonb_build_object(
    'window_hours',p_hours,
    'return_pct',round((((select close_price from last_c)/p_entry-1)*100)::numeric,3),
    'mfe_pct',round(((max(high_price)/p_entry-1)*100)::numeric,3),
    'mae_pct',round(((min(low_price)/p_entry-1)*100)::numeric,3),
    'candles',count(*),
    'coverage',case when count(*)>=p_hours*0.90 then 'COMPLETE' else 'PARTIAL' end,
    'last_candle_at',(select candle_at from last_c)
  ) end
  from c;
$$;
revoke all on function public.ep_motor8_outcome(text,timestamptz,integer,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.ep_motor8_outcome(text,timestamptz,integer,numeric,timestamptz) to service_role;

create or replace function public.ep_motor8_tick()
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_now timestamptz;
  v_breadth numeric;
  v_btc numeric;
  v_btc_ma7 numeric;
  v_regime text;
  r record;
  v_n integer;
  v_latest timestamptz;
  v_price numeric;
  v_low14 numeric;
  v_low30 numeric;
  v_ma7 numeric;
  v_ma14 numeric;
  v_range24 numeric;
  v_range7 numeric;
  v_vol6 numeric;
  v_vol_prev numeric;
  v_close6 numeric;
  v_high6 numeric;
  v_d14 numeric;
  v_d30 numeric;
  v_range_ratio numeric;
  v_volume_ratio numeric;
  v_breakout boolean;
  v_score integer;
  v_phase text;
  v_metrics jsonb;
  v_updates integer:=0;
  e record;
begin
  select max(candle_at) into v_now from public.ep_motor6_price_history;
  if v_now is null then return 0; end if;

  with latest as (
    select distinct on (asset) asset,candle_at,close_price
    from public.ep_motor6_price_history
    where candle_at>v_now-interval '14 days' and candle_at<=v_now
    order by asset,candle_at desc
  ), averages as (
    select asset,
      avg(close_price) filter(where candle_at>v_now-interval '7 days') ma7,
      count(*) filter(where candle_at>v_now-interval '7 days') n7
    from public.ep_motor6_price_history
    where candle_at>v_now-interval '7 days' and candle_at<=v_now
    group by asset
  )
  select count(*) filter(where l.close_price>a.ma7)::numeric/nullif(count(*),0),
    max(l.close_price) filter(where l.asset='BTCUSDT'),
    max(a.ma7) filter(where l.asset='BTCUSDT')
  into v_breadth,v_btc,v_btc_ma7
  from latest l join averages a using(asset) where a.n7>=150;
  v_breadth:=coalesce(v_breadth,0);
  v_regime:=case when v_btc is null then 'NO_BTC'
    when v_btc>v_btc_ma7 and v_breadth>=0.55 then 'BULL'
    when v_btc<v_btc_ma7 and v_breadth<0.35 then 'BEAR'
    else 'NEUTRAL' end;

  for r in select asset from public.ep_early_leg_v2_state where asset<>'PAXGUSDT' order by asset loop
    select count(*),max(candle_at),
      (array_agg(close_price order by candle_at desc))[1],
      min(low_price) filter(where candle_at>v_now-interval '14 days'),
      min(low_price) filter(where candle_at>v_now-interval '30 days'),
      avg(close_price) filter(where candle_at>v_now-interval '7 days'),
      avg(close_price) filter(where candle_at>v_now-interval '14 days'),
      avg((high_price-low_price)/nullif(close_price,0)) filter(where candle_at>v_now-interval '24 hours'),
      avg((high_price-low_price)/nullif(close_price,0)) filter(where candle_at>v_now-interval '7 days'),
      avg(volume) filter(where candle_at>v_now-interval '6 hours'),
      avg(volume) filter(where candle_at>v_now-interval '24 hours' and candle_at<=v_now-interval '6 hours'),
      (array_agg(close_price order by candle_at desc))[7],
      max(high_price) filter(where candle_at>v_now-interval '7 hours' and candle_at<=v_now-interval '1 hour')
    into v_n,v_latest,v_price,v_low14,v_low30,v_ma7,v_ma14,v_range24,v_range7,v_vol6,v_vol_prev,v_close6,v_high6
    from public.ep_motor6_price_history
    where asset=r.asset and candle_at>v_now-interval '30 days' and candle_at<=v_now;

    if coalesce(v_n,0)<330 or v_latest<v_now-interval '2 hours' or v_price is null or v_low14 is null then
      insert into public.ep_motor8_state(asset,observed_at,price,score,phase,market_regime,metrics,updated_at)
      values(r.asset,v_now,v_price,null,'INSUFFICIENT_DATA',v_regime,jsonb_build_object('candles_30d_available',coalesce(v_n,0),'required_14d',330,'market_breadth',round(v_breadth*100,1)),now())
      on conflict(asset) do update set observed_at=excluded.observed_at,price=excluded.price,score=null,phase=excluded.phase,market_regime=excluded.market_regime,metrics=excluded.metrics,updated_at=now();
      v_updates:=v_updates+1; continue;
    end if;

    v_d14:=(v_price/v_low14-1)*100;
    v_d30:=case when v_n>=700 and v_low30>0 then (v_price/v_low30-1)*100 else null end;
    v_range_ratio:=case when v_range7>0 then v_range24/v_range7 else null end;
    v_volume_ratio:=case when v_vol_prev>0 then v_vol6/v_vol_prev else null end;
    v_breakout:=coalesce(v_price>v_close6 and v_price>v_high6,false);
    v_score:=0;
    if v_d30 is not null and v_d30<=2 then v_score:=v_score+20; elsif v_d14<=1 then v_score:=v_score+20; elsif v_d14<=2.5 then v_score:=v_score+12; elsif v_d14<=5 then v_score:=v_score+6; end if;
    if v_range_ratio is not null and v_range_ratio<=0.75 then v_score:=v_score+20; elsif v_range_ratio is not null and v_range_ratio<=0.90 then v_score:=v_score+10; end if;
    if v_volume_ratio is not null and v_volume_ratio>=1.50 then v_score:=v_score+20; elsif v_volume_ratio is not null and v_volume_ratio>=1.20 then v_score:=v_score+12; end if;
    if v_breakout then v_score:=v_score+25; elsif v_price>v_close6 then v_score:=v_score+12; end if;
    if v_regime='BULL' then v_score:=v_score+15; elsif v_regime='NEUTRAL' then v_score:=v_score+8; end if;
    v_score:=least(100,v_score);
    v_phase:=case when v_score>=75 and v_breakout and v_regime<>'BEAR' then 'CONFIRMED' when v_score>=60 then 'WATCH' else 'NO_SIGNAL' end;
    v_metrics:=jsonb_build_object(
      'distance_to_low_14d_pct',round(v_d14,3),'distance_to_low_30d_pct',case when v_d30 is null then null else round(v_d30,3) end,
      'low_14d',v_low14,'low_30d',v_low30,'range_24h_vs_7d',case when v_range_ratio is null then null else round(v_range_ratio,3) end,
      'volume_6h_vs_previous_18h',case when v_volume_ratio is null then null else round(v_volume_ratio,3) end,
      'breakout_6h',v_breakout,'market_breadth_pct',round(v_breadth*100,1),
      'btc_above_7d_mean',case when v_btc is null or v_btc_ma7 is null then null else v_btc>v_btc_ma7 end,
      'candles_available',v_n,'history_30d_complete',v_n>=700);
    insert into public.ep_motor8_state(asset,observed_at,price,score,phase,market_regime,metrics,updated_at)
    values(r.asset,v_latest,v_price,v_score,v_phase,v_regime,v_metrics,now())
    on conflict(asset) do update set observed_at=excluded.observed_at,price=excluded.price,score=excluded.score,phase=excluded.phase,market_regime=excluded.market_regime,metrics=excluded.metrics,updated_at=now();
    v_updates:=v_updates+1;

    if v_score>=60 and not exists(select 1 from public.ep_motor8_events where asset=r.asset and signal_at>v_latest-interval '7 days') then
      insert into public.ep_motor8_events(asset,signal_at,entry_price,score,phase,market_regime,metrics,last_at,last_price)
      values(r.asset,v_latest,v_price,v_score,v_phase,v_regime,v_metrics,v_latest,v_price)
      on conflict(asset,signal_at) do nothing;
    end if;
  end loop;

  for e in select * from public.ep_motor8_events where status='COLLECTING' loop
    update public.ep_motor8_events set
      last_at=v_now,
      last_price=(select close_price from public.ep_motor6_price_history where asset=e.asset and candle_at<=v_now order by candle_at desc limit 1),
      best_pct=greatest(best_pct,coalesce((select (max(high_price)/entry_price-1)*100 from public.ep_motor6_price_history where asset=e.asset and candle_at>e.signal_at and candle_at<=v_now),0)),
      worst_pct=least(worst_pct,coalesce((select (min(low_price)/entry_price-1)*100 from public.ep_motor6_price_history where asset=e.asset and candle_at>e.signal_at and candle_at<=v_now),0)),
      outcome_24h=coalesce(outcome_24h,case when v_now>=signal_at+interval '24 hours' then public.ep_motor8_outcome(asset,signal_at,24,entry_price,v_now) end),
      outcome_72h=coalesce(outcome_72h,case when v_now>=signal_at+interval '72 hours' then public.ep_motor8_outcome(asset,signal_at,72,entry_price,v_now) end),
      outcome_7d=coalesce(outcome_7d,case when v_now>=signal_at+interval '168 hours' then public.ep_motor8_outcome(asset,signal_at,168,entry_price,v_now) end),
      status=case when v_now>=signal_at+interval '168 hours' then 'COMPLETED' else 'COLLECTING' end,
      completed_at=case when v_now>=signal_at+interval '168 hours' then coalesce(completed_at,v_now) else completed_at end
    where id=e.id;
  end loop;
  return v_updates;
end;
$$;
revoke all on function public.ep_motor8_tick() from public,anon,authenticated;
grant execute on function public.ep_motor8_tick() to service_role;

create or replace function public.ep_motor8_read()
returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'ok',true,'generated_at',now(),
    'summary',jsonb_build_object(
      'tracked',count(*) filter(where phase<>'INSUFFICIENT_DATA'),
      'coverage',count(*),
      'watch',count(*) filter(where phase='WATCH'),
      'confirmed',count(*) filter(where phase='CONFIRMED'),
      'insufficient',count(*) filter(where phase='INSUFFICIENT_DATA'),
      'events', (select count(*) from public.ep_motor8_events),
      'matured_24h',(select count(*) from public.ep_motor8_events where outcome_24h is not null),
      'matured_72h',(select count(*) from public.ep_motor8_events where outcome_72h is not null),
      'matured_7d',(select count(*) from public.ep_motor8_events where outcome_7d is not null),
      'hit_5pct_24h',(select count(*) from public.ep_motor8_events where (outcome_24h->>'mfe_pct')::numeric>=5),
      'hit_5pct_7d',(select count(*) from public.ep_motor8_events where (outcome_7d->>'mfe_pct')::numeric>=5)
    ),
    'market',(select jsonb_build_object('regime',market_regime,'breadth_pct',metrics->'market_breadth_pct','btc_above_7d_mean',metrics->'btc_above_7d_mean','observed_at',observed_at) from public.ep_motor8_state where asset='BTCUSDT'),
    'states',(select coalesce(jsonb_agg(to_jsonb(s) order by score desc nulls last,asset),'[]'::jsonb) from public.ep_motor8_state s),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by signal_at desc),'[]'::jsonb) from (select * from public.ep_motor8_events order by signal_at desc limit 100) e)
  )
  from public.ep_motor8_state;
$$;
revoke all on function public.ep_motor8_read() from public;
grant execute on function public.ep_motor8_read() to anon,authenticated,service_role;

comment on table public.ep_motor8_state is 'Motor 8 independent shadow state: hourly market regime and early-leg scores from existing hourly spot candles.';
comment on table public.ep_motor8_events is 'Motor 8 prospective candidate episodes and 24h, 72h, 7d MFE/MAE outcomes; not executed trades.';

DO $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='ep-motor8-hourly-shadow' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('ep-motor8-hourly-shadow','35 * * * *','select public.ep_motor8_tick();');
end $$;
