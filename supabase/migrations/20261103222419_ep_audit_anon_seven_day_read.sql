ALTER POLICY deny_anon_authenticated_all ON public.ep_signal_events
  USING (current_user = 'anon' AND event_at >= now() - interval '7 days')
  WITH CHECK (current_user = 'anon' AND event_at >= now() - interval '7 days');
CREATE POLICY ep_audit_anon_recent_select ON public.ep_signal_events
  AS PERMISSIVE FOR SELECT TO anon
  USING (event_at >= now() - interval '7 days');
GRANT SELECT ON TABLE public.ep_signal_events TO anon;

ALTER POLICY deny_anon_authenticated_all ON public.ep_pre_signal_history
  USING (current_user = 'anon' AND observed_at >= now() - interval '7 days')
  WITH CHECK (current_user = 'anon' AND observed_at >= now() - interval '7 days');
CREATE POLICY ep_audit_anon_recent_select ON public.ep_pre_signal_history
  AS PERMISSIVE FOR SELECT TO anon
  USING (observed_at >= now() - interval '7 days');
GRANT SELECT ON TABLE public.ep_pre_signal_history TO anon;

ALTER POLICY deny_anon_authenticated_all ON public.ep_shadow_v3_history
  USING (current_user = 'anon' AND observed_at >= now() - interval '7 days')
  WITH CHECK (current_user = 'anon' AND observed_at >= now() - interval '7 days');
CREATE POLICY ep_audit_anon_recent_select ON public.ep_shadow_v3_history
  AS PERMISSIVE FOR SELECT TO anon
  USING (observed_at >= now() - interval '7 days');
GRANT SELECT ON TABLE public.ep_shadow_v3_history TO anon;

ALTER POLICY deny_anon_authenticated_all ON public.ep_early_leg_v2_events
  USING (current_user = 'anon' AND observed_at >= now() - interval '7 days')
  WITH CHECK (current_user = 'anon' AND observed_at >= now() - interval '7 days');
CREATE POLICY ep_audit_anon_recent_select ON public.ep_early_leg_v2_events
  AS PERMISSIVE FOR SELECT TO anon
  USING (observed_at >= now() - interval '7 days');
GRANT SELECT ON TABLE public.ep_early_leg_v2_events TO anon;

ALTER POLICY deny_anon_authenticated_all ON public.ep_motor6_history
  USING (current_user = 'anon' AND observed_at >= now() - interval '7 days')
  WITH CHECK (current_user = 'anon' AND observed_at >= now() - interval '7 days');
CREATE POLICY ep_audit_anon_recent_select ON public.ep_motor6_history
  AS PERMISSIVE FOR SELECT TO anon
  USING (observed_at >= now() - interval '7 days');
GRANT SELECT ON TABLE public.ep_motor6_history TO anon;
