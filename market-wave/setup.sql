begin;
create role ep_wave_writer nologin noinherit;
create role ep_wave_reader nologin noinherit;
grant ep_wave_writer, ep_wave_reader to postgres;
create schema ep_market_history;
revoke all on schema ep_market_history from public, anon, authenticated;
grant usage on schema ep_market_history to ep_wave_writer, ep_wave_reader;
create table ep_market_history.samples (
 observed_at timestamptz primary key,
 prices jsonb not null check(jsonb_typeof(prices)='object')
);
create table ep_market_history.control (
 id boolean primary key default true check(id),
 request_id bigint, requested_at timestamptz,
 last_ok timestamptz, status text not null default 'INICIANDO',
 enabled boolean not null default true,
 symbols jsonb not null
);
insert into ep_market_history.control(symbols) values ('["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "TRXUSDT", "UNIUSDT", "AAVEUSDT", "SUIUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "XLMUSDT", "HBARUSDT", "PEPEUSDT", "ETCUSDT", "ATOMUSDT", "TIAUSDT", "XTZUSDT", "LDOUSDT", "SEIUSDT", "FILUSDT", "INJUSDT", "RUNEUSDT", "ALGOUSDT", "FETUSDT", "GALAUSDT", "SANDUSDT", "MANAUSDT", "CRVUSDT", "DYDXUSDT", "JUPUSDT", "WIFUSDT", "BONKUSDT", "SHIBUSDT", "TONUSDT", "STXUSDT", "IMXUSDT", "RENDERUSDT", "THETAUSDT", "VETUSDT", "ZECUSDT"]'::jsonb);
alter table ep_market_history.samples enable row level security;
alter table ep_market_history.control enable row level security;
revoke all on all tables in schema ep_market_history from public, anon, authenticated;
grant select,insert,delete on ep_market_history.samples to ep_wave_writer;
grant select,update on ep_market_history.control to ep_wave_writer;
grant select on all tables in schema ep_market_history to ep_wave_reader;
create policy writer_samples on ep_market_history.samples to ep_wave_writer using(true) with check(true);
create policy writer_control on ep_market_history.control to ep_wave_writer using(true) with check(true);
create policy reader_samples on ep_market_history.samples for select to ep_wave_reader using(true);
create policy reader_control on ep_market_history.control for select to ep_wave_reader using(true);
grant usage on schema net to ep_wave_writer;
grant select on net._http_response to ep_wave_writer;
grant execute on function net.http_get(text,jsonb,jsonb,integer) to ep_wave_writer;
create function ep_market_history.collect() returns void language plpgsql security invoker
set search_path=pg_catalog set statement_timeout='15s' as $$
declare s ep_market_history.control%rowtype; r record; payload jsonb; prices jsonb; rid bigint;
begin
 if not pg_try_advisory_xact_lock(1929292901) then return; end if;
 select * into s from ep_market_history.control where id=true for update;
 if not s.enabled then return; end if;
 delete from ep_market_history.samples where observed_at < now()-interval '8 days';
 if pg_total_relation_size('ep_market_history.samples')>67108864 or pg_database_size(current_database())>440401920 then
  update ep_market_history.control set status='PAUSADO_LIMITE_ARMAZENAMENTO' where id=true; return;
 end if;
 if s.request_id is not null then
  select * into r from net._http_response where id=s.request_id;
  if found then
   if r.status_code=200 and not coalesce(r.timed_out,false) then
    begin
     payload:=r.content::jsonb;
     if jsonb_typeof(payload)<>'array' then raise exception 'Formato inválido'; end if;
     select jsonb_object_agg(e->>'symbol',(e->>'price')::numeric) into prices
     from jsonb_array_elements(payload) e
     where s.symbols ? (e->>'symbol') and (e->>'price')::numeric>0;
     if prices is null then raise exception 'Sem preços'; end if;
     insert into ep_market_history.samples values(date_trunc('minute',r.created),prices) on conflict do nothing;
     update ep_market_history.control set last_ok=r.created,status=case when (select count(*) from jsonb_object_keys(prices))=jsonb_array_length(s.symbols) then 'COLETANDO' else 'COLETA_PARCIAL' end where id=true;
    exception when others then
     update ep_market_history.control set status='FALHA_RESPOSTA' where id=true;
    end;
   else
    update ep_market_history.control set status='FALHA_FONTE_'||coalesce(r.status_code::text,'TIMEOUT') where id=true;
   end if;
  elsif s.requested_at>now()-interval '2 minutes' then return;
  end if;
 end if;
 select net.http_get(url:='https://data-api.binance.vision/api/v3/ticker/price',params:=jsonb_build_object('symbols',replace(s.symbols::text,' ','')),timeout_milliseconds:=10000) into rid;
 update ep_market_history.control set request_id=rid,requested_at=now() where id=true;
end $$;
revoke all on function ep_market_history.collect() from public,anon,authenticated;
grant execute on function ep_market_history.collect() to ep_wave_writer;
-- The public function can only read the new market schema, under a nonlogin reader.
create function public.ep_wave_read(p_symbol text default 'BTCUSDT') returns jsonb
language plpgsql security definer stable set search_path=pg_catalog set statement_timeout='5s' as $$
declare result jsonb;
begin
 if not exists(select 1 from ep_market_history.control where symbols ? p_symbol) then raise exception 'Ativo não permitido'; end if;
 with points as materialized (
  select observed_at,(prices->>p_symbol)::numeric price from ep_market_history.samples
  where observed_at>=now()-interval '8 days' and prices ? p_symbol
 ), latest as (select * from points order by observed_at desc limit 1),
 horizons(label,minutes) as (values('M1',1),('M5',5),('M15',15),('M30',30),('H1',60),('H2',120),('H3',180),('H5',300),('H6',360),('H24',1440),('2D',2880),('3D',4320),('7D',10080)),
 windows as (
 select h.label,h.minutes,l.observed_at,l.price,
 (select min(price) from points where observed_at between l.observed_at-make_interval(mins=>h.minutes) and l.observed_at) low,
 (select max(price) from points where observed_at between l.observed_at-make_interval(mins=>h.minutes) and l.observed_at) high,
 (select price from points where observed_at<=l.observed_at-make_interval(mins=>h.minutes) and observed_at>=l.observed_at-make_interval(mins=>h.minutes)-interval '90 seconds' order by observed_at desc limit 1) opening,
 (select count(*) from points where observed_at between l.observed_at-make_interval(mins=>h.minutes) and l.observed_at) samples
 from horizons h cross join latest l
 )
 select jsonb_build_object('symbol',p_symbol,'status',(select status from ep_market_history.control),'last_ok',(select last_ok from ep_market_history.control),'bytes',pg_total_relation_size('ep_market_history.samples'),'first_at',(select min(observed_at) from points),'windows',coalesce((select jsonb_agg(to_jsonb(w) order by minutes) from windows w),'[]'::jsonb),'history',coalesce((select jsonb_agg(to_jsonb(p) order by observed_at) from (select * from points order by observed_at desc limit 120) p),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.ep_wave_read(text) from public;
grant create on schema public to ep_wave_reader;
alter function public.ep_wave_read(text) owner to ep_wave_reader;
revoke create on schema public from ep_wave_reader;
grant execute on function public.ep_wave_read(text) to anon,authenticated;
select cron.schedule('ep-wave-isolated-minute','* * * * *','set role ep_wave_writer; select ep_market_history.collect();');
commit;
