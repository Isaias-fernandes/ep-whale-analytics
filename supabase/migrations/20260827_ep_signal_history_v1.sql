-- EP Whale Analytics — histórico de sinais v1
-- Camada isolada: não altera motores, tabelas atuais ou decisões do EP.

create table if not exists public.ep_signal_history_v1 (
  id bigint generated always as identity primary key,
  episode_id text not null,
  market text not null check (market in ('crypto','b3')),
  asset text not null,
  direction text not null check (direction in ('BUY','SELL','NEUTRAL')),
  event_type text not null check (event_type in ('OPEN','SNAPSHOT','CLOSED')),
  observed_at timestamptz not null default now(),

  price numeric,
  entry_price numeric,
  exit_price numeric,
  return_pct numeric,

  decision_score numeric,
  signal_tier text,
  motor_count smallint check (motor_count between 0 and 5),

  motor_technical boolean,
  motor_structure boolean,
  motor_volatility boolean,
  motor_squeeze boolean,
  motor_flow boolean,

  technical_score numeric,
  structure_score numeric,
  volatility_score numeric,
  squeeze_score numeric,
  flow_score numeric,

  ibc_score numeric,
  reversal_score numeric,
  adaptive_v6_confidence numeric,

  metrics jsonb not null default '{}'::jsonb,
  source text not null default 'ep-history-api-v1',
  created_at timestamptz not null default now()
);

create index if not exists ep_signal_history_v1_episode_idx
  on public.ep_signal_history_v1 (episode_id, observed_at);

create index if not exists ep_signal_history_v1_asset_idx
  on public.ep_signal_history_v1 (market, asset, observed_at desc);

create index if not exists ep_signal_history_v1_closed_idx
  on public.ep_signal_history_v1 (event_type, observed_at desc);

create index if not exists ep_signal_history_v1_motors_idx
  on public.ep_signal_history_v1 (motor_count, event_type, observed_at desc);

alter table public.ep_signal_history_v1 enable row level security;

-- Nenhuma policy pública por desenho.
-- A Edge Function usa service_role no servidor. Usuários finais não acessam a tabela diretamente.

comment on table public.ep_signal_history_v1 is
'Histórico analítico isolado do EP. Registra snapshots e encerramentos sem alterar os 5 motores.';
