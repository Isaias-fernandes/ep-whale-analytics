delete from public.ep_early_leg_episode_tracks where upper(asset) in ('TON','TONUSDT');
delete from public.ep_early_leg_v2_events where upper(asset) in ('TON','TONUSDT');
delete from public.ep_early_leg_v2_state where upper(asset) in ('TON','TONUSDT');
delete from public.ep_pre_signal_history where upper(asset) in ('TON','TONUSDT');
delete from public.ep_shadow_v3_history where upper(asset) in ('TON','TONUSDT');
delete from public.ep_signal_events where upper(asset) in ('TON','TONUSDT') or upper(symbol) in ('TON','TONUSDT');
delete from public.ep_signal_state where upper(asset) in ('TON','TONUSDT') or upper(symbol) in ('TON','TONUSDT');
delete from public.ep_whale_ignition_state where upper(asset) in ('TON','TONUSDT');
