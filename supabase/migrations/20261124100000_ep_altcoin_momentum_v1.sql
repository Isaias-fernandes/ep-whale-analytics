-- Isolated observer for multi-day BTC-led and altcoin-relative strength surges.
-- Hourly shadow collection; no trading orders and no changes to the official motors.

create table if not exists public.ep_altcoin_momentum_state (
  asset text primary key check (asset ~ '^[A-Z0-9]{2,20}USDT$'),
  observed_at timestamptz not null,
  price numeric,
  score smallint check (score between 0 and 100),
  phase text not null check (phase in ('INSUFFICIENT_DATA','NO_SIGNAL','WATCH','CONFIRMED')),
  market_regime text not null check (market_regime in ('BULL','BEAR','NEUTRAL','NO_BTC')),
  btc_return_72h numeric,
  market_breadth_72h numeric,
  asset_return_24h numeric,
  asset_return_72h numeric,
  relative_strength_72h numeric,
  volume_ratio_6h numeric,
  breakout_24h boolean,
  candles_72h integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ep_altcoin_momentum_state enable row level security;
revoke all on public.ep_altcoin_momentum_state from public,anon,authenticated;
grant select,insert,update,delete on public.ep_altcoin_momentum_state to service_role;

create table if not exists public.ep_altcoin_momentum_events (
  id bigint generated always as identity primary key,
  asset text not null check (asset ~ '^[A-Z0-9]{2,20}USDT$'),
  signal_at timestamptz not null,
  entry_price numeric not null check (entry_price>0),
  score smallint not null check (score between 0 and 100),
  phase text not null check (phase in ('WATCH','CONFIRMED')),
  market_regime text not null check (market_regime in ('BULL','BEAR','NEUTRAL','NO_BTC')),
  metrics jsonb not null default '{}'::jsonb,
  last_at timestamptz,
  last_price numeric,
  best_pct numeric not null default 0,
  worst_pct numeric not null default 0,
  hit_10pct_at timestamptz,
  hours_to_10pct numeric,
  outcome_24h jsonb,
  outcome_72h jsonb,
  outcome_7d jsonb,
  status text not null default 'COLLECTING' check (status in ('COLLECTING','COMPLETED')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(asset,signal_at)
);
alter table public.ep_altcoin_momentum_events enable row level security;
revoke all on public.ep_altcoin_momentum_events from public,anon,authenticated;
grant select,insert,update,delete on public.ep_altcoin_momentum_events to service_role;
create index if not exists ep_altcoin_momentum_events_recent_idx on public.ep_altcoin_momentum_events(signal_at desc);

create or replace function public.ep_altcoin_momentum_outcome(p_asset text,p_start timestamptz,p_hours integer,p_entry numeric,p_now timestamptz)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with c as (
    select candle_at,high_price,low_price,close_price
    from public.ep_motor6_price_history
    where asset=p_asset and candle_at>p_start
      and candle_at<=least(p_start+make_interval(hours=>p_hours),p_now)
  ), last_c as (
    select candle_at,close_price from c order by candle_at desc limit 1
  ), target as (
    select min(candle_at) candle_at from c where high_price>=p_entry*1.10
  ), btc as (
    select b.close_price from public.ep_motor6_price_history b
    where b.asset='BTCUSDT' and b.candle_at=(select candle_at from last_c)
  )
  select case when count(*)=0 then null else jsonb_build_object(
    'window_hours',p_hours,
    'return_pct',round((((select close_price from last_c)/p_entry-1)*100)::numeric,3),
    'mfe_pct',round(((max(high_price)/p_entry-1)*100)::numeric,3),
    'mae_pct',round(((min(low_price)/p_entry-1)*100)::numeric,3),
    'hit_10pct',(select candle_at from target) is not null,
    'hours_to_10pct',case when (select candle_at from target) is null then null else round(extract(epoch from ((select candle_at from target)-p_start))/3600,2) end,
    'btc_return_pct',case when (select close_price from btc) is null then null else round((((select close_price from btc)/(select close_price from public.ep_motor6_price_history where asset='BTCUSDT' and candle_at<=p_start order by candle_at desc limit 1)-1)*100)::numeric,3) end,
    'excess_vs_btc_pct',case when (select close_price from btc) is null then null else round((((select close_price from last_c)/p_entry-1)*100 - ((select close_price from btc)/(select close_price from public.ep_motor6_price_history where asset='BTCUSDT' and candle_at<=p_start order by candle_at desc limit 1)-1)*100)::numeric,3) end,
    'candles',count(*),
    'coverage',case when count(*)>=p_hours*0.90 then 'COMPLETE' else 'PARTIAL' end,
    'last_candle_at',(select candle_at from last_c)
  ) end from c;
$$;
revoke all on function public.ep_altcoin_momentum_outcome(text,timestamptz,integer,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.ep_altcoin_momentum_outcome(text,timestamptz,integer,numeric,timestamptz) to service_role;

create or replace function public.ep_altcoin_momentum_tick()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_now timestamptz;
  v_btc numeric;
  v_btc_72 numeric;
  v_btc_ret numeric;
  v_breadth numeric;
  v_regime text;
  r record;
  v_price numeric;
  v_latest timestamptz;
  v_p24 numeric;
  v_p72 numeric;
  v_ret24 numeric;
  v_ret72 numeric;
  v_rs numeric;
  v_vol6 numeric;
  v_volprev numeric;
  v_volratio numeric;
  v_high24 numeric;
  v_breakout boolean;
  v_n72 integer;
  v_score integer;
  v_phase text;
  v_updated integer:=0;
  v_metrics jsonb;
  e record;
  v_target timestamptz;
begin
  select max(candle_at) into v_now from public.ep_motor6_price_history;
  if v_now is null then return 0; end if;
  select close_price into v_btc from public.ep_motor6_price_history where asset='BTCUSDT' and candle_at<=v_now order by candle_at desc limit 1;
  select close_price into v_btc_72 from public.ep_motor6_price_history where asset='BTCUSDT' and candle_at<=v_now-interval '72 hours' order by candle_at desc limit 1;
  if v_btc is not null and v_btc_72>0 then v_btc_ret:=(v_btc/v_btc_72-1)*100; end if;
  select count(*) filter(where cur.close_price>base.close_price)::numeric/nullif(count(*),0)
  into v_breadth
  from (select distinct on(asset) asset,close_price from public.ep_motor6_price_history where candle_at<=v_now order by asset,candle_at desc) cur
  join lateral (select close_price from public.ep_motor6_price_history x where x.asset=cur.asset and x.candle_at<=v_now-interval '72 hours' order by x.candle_at desc limit 1) base on true;
  v_regime:=case when v_btc_ret is null then 'NO_BTC'
    when v_btc_ret>0 and coalesce(v_breadth,0)>=0.55 then 'BULL'
    when v_btc_ret<0 and coalesce(v_breadth,1)<0.35 then 'BEAR'
    else 'NEUTRAL' end;

  for r in select distinct asset from public.ep_early_leg_v2_state where asset<>'PAXGUSDT' order by asset loop
    select count(*) filter(where candle_at>v_now-interval '72 hours'),max(candle_at)
    into v_n72,v_latest from public.ep_motor6_price_history
    where asset=r.asset and candle_at<=v_now and candle_at>v_now-interval '73 hours';
    select close_price into v_price from public.ep_motor6_price_history where asset=r.asset and candle_at<=v_now order by candle_at desc limit 1;
    select close_price into v_p24 from public.ep_motor6_price_history where asset=r.asset and candle_at<=v_now-interval '24 hours' order by candle_at desc limit 1;
    select close_price into v_p72 from public.ep_motor6_price_history where asset=r.asset and candle_at<=v_now-interval '72 hours' order by candle_at desc limit 1;
    select max(high_price) into v_high24 from public.ep_motor6_price_history where asset=r.asset and candle_at>v_now-interval '24 hours' and candle_at<v_latest;
    select avg(volume) filter(where candle_at>v_now-interval '6 hours'),
      avg(volume) filter(where candle_at>v_now-interval '24 hours' and candle_at<=v_now-interval '6 hours')
    into v_vol6,v_volprev from public.ep_motor6_price_history where asset=r.asset and candle_at<=v_now and candle_at>v_now-interval '24 hours';
    v_ret24:=case when v_p24>0 then (v_price/v_p24-1)*100 else null end;
    v_ret72:=case when v_p72>0 then (v_price/v_p72-1)*100 else null end;
    v_rs:=case when v_ret72 is not null and v_btc_ret is not null then v_ret72-v_btc_ret else null end;
    v_volratio:=case when v_volprev>0 then v_vol6/v_volprev else null end;
    v_breakout:=coalesce(v_price>v_high24,false);

    if coalesce(v_n72,0)<60 or v_latest<v_now-interval '2 hours' or v_p72 is null or v_btc_ret is null then
      insert into public.ep_altcoin_momentum_state(asset,observed_at,price,score,phase,market_regime,btc_return_72h,market_breadth_72h,asset_return_24h,asset_return_72h,relative_strength_72h,volume_ratio_6h,breakout_24h,candles_72h,updated_at)
      values(r.asset,v_now,v_price,null,'INSUFFICIENT_DATA',v_regime,v_btc_ret,round(coalesce(v_breadth,0)*100,2),v_ret24,v_ret72,v_rs,v_volratio,v_breakout,coalesce(v_n72,0),now())
      on conflict(asset) do update set observed_at=excluded.observed_at,price=excluded.price,score=null,phase=excluded.phase,market_regime=excluded.market_regime,btc_return_72h=excluded.btc_return_72h,market_breadth_72h=excluded.market_breadth_72h,asset_return_24h=excluded.asset_return_24h,asset_return_72h=excluded.asset_return_72h,relative_strength_72h=excluded.relative_strength_72h,volume_ratio_6h=excluded.volume_ratio_6h,breakout_24h=excluded.breakout_24h,candles_72h=excluded.candles_72h,updated_at=now();
      v_updated:=v_updated+1; continue;
    end if;

    v_score:=0;
    if v_btc_ret>0 then v_score:=v_score+10; if v_btc_ret>=3 then v_score:=v_score+5; end if; end if;
    if v_breadth>=0.70 then v_score:=v_score+15; elsif v_breadth>=0.55 then v_score:=v_score+10; end if;
    if v_ret24>=3 then v_score:=v_score+13; elsif v_ret24>=1 then v_score:=v_score+8; elsif v_ret24>0 then v_score:=v_score+4; end if;
    if v_ret72>=5 then v_score:=v_score+10; elsif v_ret72>=2 then v_score:=v_score+6; end if;
    if v_rs>=5 then v_score:=v_score+25; elsif v_rs>=2 then v_score:=v_score+15; elsif v_rs>0 then v_score:=v_score+8; end if;
    if v_volratio>=1.5 then v_score:=v_score+20; elsif v_volratio>=1.2 then v_score:=v_score+12; end if;
    if v_breakout then v_score:=v_score+15; end if;
    v_score:=least(100,v_score);
    v_phase:=case when v_score>=70 and v_breakout then 'CONFIRMED' when v_score>=50 then 'WATCH' else 'NO_SIGNAL' end;
    v_metrics:=jsonb_build_object('btc_return_72h_pct',round(v_btc_ret,3),'market_breadth_72h_pct',round(coalesce(v_breadth,0)*100,2),'asset_return_24h_pct',case when v_ret24 is null then null else round(v_ret24,3) end,'asset_return_72h_pct',case when v_ret72 is null then null else round(v_ret72,3) end,'relative_strength_72h_pct',case when v_rs is null then null else round(v_rs,3) end,'volume_ratio_6h_vs_18h',case when v_volratio is null then null else round(v_volratio,3) end,'breakout_24h',v_breakout,'candles_72h',v_n72,'target_pct',10,'target_horizons_hours',jsonb_build_array(24,72,168));
    insert into public.ep_altcoin_momentum_state(asset,observed_at,price,score,phase,market_regime,btc_return_72h,market_breadth_72h,asset_return_24h,asset_return_72h,relative_strength_72h,volume_ratio_6h,breakout_24h,candles_72h,updated_at)
    values(r.asset,v_latest,v_price,v_score,v_phase,v_regime,v_btc_ret,round(coalesce(v_breadth,0)*100,2),v_ret24,v_ret72,v_rs,v_volratio,v_breakout,v_n72,now())
    on conflict(asset) do update set observed_at=excluded.observed_at,price=excluded.price,score=excluded.score,phase=excluded.phase,market_regime=excluded.market_regime,btc_return_72h=excluded.btc_return_72h,market_breadth_72h=excluded.market_breadth_72h,asset_return_24h=excluded.asset_return_24h,asset_return_72h=excluded.asset_return_72h,relative_strength_72h=excluded.relative_strength_72h,volume_ratio_6h=excluded.volume_ratio_6h,breakout_24h=excluded.breakout_24h,candles_72h=excluded.candles_72h,updated_at=now();
    v_updated:=v_updated+1;

    if v_score>=50 and not exists(select 1 from public.ep_altcoin_momentum_events where asset=r.asset and signal_at>v_latest-interval '7 days') then
      insert into public.ep_altcoin_momentum_events(asset,signal_at,entry_price,score,phase,market_regime,metrics,last_at,last_price)
      values(r.asset,v_latest,v_price,v_score,v_phase,v_regime,v_metrics,v_latest,v_price)
      on conflict(asset,signal_at) do nothing;
    end if;
  end loop;

  for e in select * from public.ep_altcoin_momentum_events where status='COLLECTING' loop
    select min(candle_at) into v_target from public.ep_motor6_price_history where asset=e.asset and candle_at>e.signal_at and candle_at<=v_now and high_price>=e.entry_price*1.10;
    update public.ep_altcoin_momentum_events set
      last_at=v_now,
      last_price=(select close_price from public.ep_motor6_price_history where asset=e.asset and candle_at<=v_now order by candle_at desc limit 1),
      best_pct=greatest(best_pct,coalesce((select (max(high_price)/e.entry_price-1)*100 from public.ep_motor6_price_history where asset=e.asset and candle_at>e.signal_at and candle_at<=v_now),0)),
      worst_pct=least(worst_pct,coalesce((select (min(low_price)/e.entry_price-1)*100 from public.ep_motor6_price_history where asset=e.asset and candle_at>e.signal_at and candle_at<=v_now),0)),
      hit_10pct_at=coalesce(hit_10pct_at,v_target),
      hours_to_10pct=coalesce(hours_to_10pct,case when v_target is null then null else round(extract(epoch from (v_target-e.signal_at))/3600,2) end),
      outcome_24h=coalesce(outcome_24h,case when v_now>=e.signal_at+interval '24 hours' then public.ep_altcoin_momentum_outcome(e.asset,e.signal_at,24,e.entry_price,v_now) end),
      outcome_72h=coalesce(outcome_72h,case when v_now>=e.signal_at+interval '72 hours' then public.ep_altcoin_momentum_outcome(e.asset,e.signal_at,72,e.entry_price,v_now) end),
      outcome_7d=coalesce(outcome_7d,case when v_now>=e.signal_at+interval '168 hours' then public.ep_altcoin_momentum_outcome(e.asset,e.signal_at,168,e.entry_price,v_now) end),
      status=case when v_now>=e.signal_at+interval '168 hours' then 'COMPLETED' else 'COLLECTING' end,
      completed_at=case when v_now>=e.signal_at+interval '168 hours' then coalesce(completed_at,v_now) else completed_at end
    where id=e.id;
  end loop;
  return v_updated;
end;
$$;
revoke all on function public.ep_altcoin_momentum_tick() from public,anon,authenticated;
grant execute on function public.ep_altcoin_momentum_tick() to service_role;

create or replace function public.ep_altcoin_momentum_read()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'ok',true,'generated_at',now(),
    'summary',jsonb_build_object(
      'tracked',count(*) filter(where phase<>'INSUFFICIENT_DATA'),
      'coverage',count(*),
      'watch',count(*) filter(where phase='WATCH'),
      'confirmed',count(*) filter(where phase='CONFIRMED'),
      'insufficient',count(*) filter(where phase='INSUFFICIENT_DATA'),
      'events',(select count(*) from public.ep_altcoin_momentum_events),
      'hit_10pct_24h',(select count(*) from public.ep_altcoin_momentum_events where outcome_24h->>'hit_10pct'='true'),
      'hit_10pct_72h',(select count(*) from public.ep_altcoin_momentum_events where outcome_72h->>'hit_10pct'='true'),
      'hit_10pct_7d',(select count(*) from public.ep_altcoin_momentum_events where outcome_7d->>'hit_10pct'='true'),
      'matured_24h',(select count(*) from public.ep_altcoin_momentum_events where outcome_24h is not null),
      'matured_72h',(select count(*) from public.ep_altcoin_momentum_events where outcome_72h is not null),
      'matured_7d',(select count(*) from public.ep_altcoin_momentum_events where outcome_7d is not null)
    ),
    'market',(select jsonb_build_object('regime',market_regime,'btc_return_72h_pct',btc_return_72h,'breadth_72h_pct',market_breadth_72h,'observed_at',observed_at) from public.ep_altcoin_momentum_state where asset='BTCUSDT'),
    'states',(select coalesce(jsonb_agg(to_jsonb(s) order by score desc nulls last,asset),'[]'::jsonb) from public.ep_altcoin_momentum_state s),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by signal_at desc),'[]'::jsonb) from (select * from public.ep_altcoin_momentum_events order by signal_at desc limit 100) e)
  ) from public.ep_altcoin_momentum_state;
$$;
revoke all on function public.ep_altcoin_momentum_read() from public;
grant execute on function public.ep_altcoin_momentum_read() to anon,authenticated,service_role;

DO $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='ep-altcoin-momentum-hourly' loop perform cron.unschedule(j.jobid); end loop;
  perform cron.schedule('ep-altcoin-momentum-hourly','40 * * * *','select public.ep_altcoin_momentum_tick();');
end $$;
