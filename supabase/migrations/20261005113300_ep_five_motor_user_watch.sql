create table public.ep_five_motor_user_watch (
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  asset text not null check (asset ~ '^[A-Z0-9]{2,20}USDT$'),
  market text not null default 'crypto' check (market = 'crypto'),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  direction text check (direction in ('BUY','SELL')),
  entry_price double precision check (entry_price is null or entry_price > 0),
  entry_at timestamptz not null default now(),
  entry_motors integer check (entry_motors between 0 and 5),
  peak_motors integer check (peak_motors between 0 and 5),
  entry_score double precision,
  entry_gate double precision,
  max_gate double precision,
  last_price double precision check (last_price is null or last_price > 0),
  last_motors integer check (last_motors between 0 and 5),
  best_pct double precision not null default 0,
  worst_pct double precision not null default 0,
  durations jsonb not null default '{}'::jsonb check (jsonb_typeof(durations) = 'object'),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  exit_price double precision,
  result_pct double precision,
  primary key (owner_hash, asset)
);
alter table public.ep_five_motor_user_watch enable row level security;
revoke all on table public.ep_five_motor_user_watch from public, anon, authenticated;
grant select, insert, update, delete on table public.ep_five_motor_user_watch to service_role;
create policy deny_anon_authenticated_all on public.ep_five_motor_user_watch
  for all to anon, authenticated using (false) with check (false);
create index ep_five_motor_user_watch_owner_status_idx
  on public.ep_five_motor_user_watch (owner_hash, status);
comment on table public.ep_five_motor_user_watch is
  'Private per-pairing-code state for manual 5-motor monitoring. Edge Function only; no public Data API access.';
