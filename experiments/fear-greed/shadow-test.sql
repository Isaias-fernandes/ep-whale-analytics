-- Fear & Greed exploratory shadow test
-- Read-only query for EP Whale Analytics. Uses the prior UTC day's published FGI
-- to avoid assigning a same-day value that may not yet have been available.
-- Source: https://api.alternative.me/fng/?limit=0
-- Snapshot values cover 2026-10-24 through 2026-11-17.
with fgi(day, value) as (
  values
    ('2026-10-24'::date,51),('2026-10-25',54),('2026-10-26',50),
    ('2026-10-27',48),('2026-10-28',51),('2026-10-29',51),
    ('2026-10-30',30),('2026-10-31',30),('2026-11-01',34),
    ('2026-11-02',37),('2026-11-03',26),('2026-11-04',34),
    ('2026-11-05',50),('2026-11-06',28),('2026-11-07',25),
    ('2026-11-08',28),('2026-11-09',29),('2026-11-10',32),
    ('2026-11-11',29),('2026-11-12',28),('2026-11-13',20),
    ('2026-11-14',13),('2026-11-15',10),('2026-11-16',10),
    ('2026-11-17',12)
),
closed_once as (
  select distinct on (episode_id)
    episode_id, direction, observed_at, return_pct
  from public.ep_signal_history_v1
  where event_type = 'CLOSED'
    and observed_at >= '2026-10-25 00:00:00+00'
    and observed_at <  '2026-11-19 00:00:00+00'
  order by episode_id, observed_at desc
),
joined as (
  select
    c.*,
    f.value as fgi_value,
    ((c.observed_at at time zone 'utc')::date - 1) as signal_day,
    case
      when f.value <= 24 then 'Medo extremo'
      when f.value <= 44 then 'Medo'
      when f.value <= 54 then 'Neutro'
      when f.value <= 74 then 'Ganância'
      else 'Ganância extrema'
    end as sentiment_band
  from closed_once c
  join fgi f
    on f.day = ((c.observed_at at time zone 'utc')::date - 1)
),
daily as (
  select
    signal_day, sentiment_band, direction, count(*) as n,
    100.0 * count(*) filter (where return_pct > 0) / count(*) as win_pct,
    avg(return_pct) as avg_return
  from joined
  group by signal_day, sentiment_band, direction
)
select
  sentiment_band,
  direction,
  count(*) as days,
  sum(n) as signals,
  round(avg(win_pct)::numeric, 1) as mean_daily_win_pct,
  round(avg(avg_return)::numeric, 3) as mean_daily_return_pct
from daily
group by sentiment_band, direction
order by
  case sentiment_band
    when 'Medo extremo' then 1 when 'Medo' then 2 when 'Neutro' then 3
    when 'Ganância' then 4 else 5
  end,
  direction;
