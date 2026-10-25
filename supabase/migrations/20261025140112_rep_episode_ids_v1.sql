-- REP v1: IDs estáveis por ciclo do Início da Pernada e vínculo de snapshots.
-- Aplicado no projeto EP Whale Analytics em 2026-10-25.

alter table public.ep_early_leg_v2_state
  add column if not exists episode_id text,
  add column if not exists episode_started_at timestamptz,
  add column if not exists episode_entry_price numeric;

alter table public.ep_early_leg_v2_events
  add column if not exists episode_id text,
  add column if not exists episode_started_at timestamptz,
  add column if not exists episode_entry_price numeric;

alter table public.ep_pre_signal_history
  add column if not exists episode_id text;

alter table public.ep_shadow_v3_history
  add column if not exists episode_id text;

alter table public.ep_signal_events
  add column if not exists episode_id text;

create index if not exists ep_early_leg_v2_events_episode_idx
  on public.ep_early_leg_v2_events (episode_id, observed_at desc)
  where episode_id is not null;
