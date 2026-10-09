begin;
create function public.ep_wave_outcomes(p_symbol text,p_at timestamptz) returns jsonb
language plpgsql security definer stable set search_path=pg_catalog set statement_timeout='5s' as $$
declare answer jsonb;
begin
 if p_at is null or p_at<now()-interval '8 days' or p_at>now() or not exists(select 1 from ep_market_history.control where symbols ? p_symbol) then raise exception 'Ativo ou data inválidos'; end if;
 with points as materialized(select observed_at,(prices->>p_symbol)::numeric price from ep_market_history.samples where observed_at>=p_at-interval '90 seconds' and prices ? p_symbol),
 anchor as (select * from points where observed_at between p_at-interval '90 seconds' and p_at order by observed_at desc limit 1),
 horizons(label,minutes) as(values('M1',1),('M5',5),('M15',15),('M30',30),('H1',60),('H2',120),('H3',180),('H5',300),('H6',360),('H24',1440),('2D',2880),('3D',4320),('7D',10080)),
 outcomes as(select h.label,h.minutes,a.observed_at anchor_at,a.price entry_price,
 a.observed_at+make_interval(mins=>h.minutes) target_at,
 p.observed_at actual_at,p.price final_price,
 case when p.price is not null then 100*(p.price-a.price)/a.price end return_pct
 from horizons h cross join anchor a left join lateral(select * from points where observed_at between a.observed_at+make_interval(mins=>h.minutes) and a.observed_at+make_interval(mins=>h.minutes)+interval '90 seconds' order by observed_at limit 1) p on true)
 select coalesce(jsonb_agg(to_jsonb(o) order by minutes),'[]'::jsonb) into answer from outcomes o;
 return answer;
end $$;
revoke all on function public.ep_wave_outcomes(text,timestamptz) from public;
grant create on schema public to ep_wave_reader;
alter function public.ep_wave_outcomes(text,timestamptz) owner to ep_wave_reader;
revoke create on schema public from ep_wave_reader;
grant execute on function public.ep_wave_outcomes(text,timestamptz) to anon,authenticated;
commit;
