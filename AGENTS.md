# Protected traffic settings

The user explicitly authorized hourly backend execution on 2026-10-12 to control Supabase egress.

- Preserve EP Whale project cron job 1 at `0 * * * *`, active. The legacy job name contains `every-minute`, but the authorized schedule is hourly. Do not shorten the interval without new explicit user authorization.
- Preserve the five-minute browser cache in `ep-read-cache.js` for ep-24x7-status, ep-five-motor-watch and ep-motor6-watch.
- Preserve the protected server read wrapper in the three functions under `supabase/functions/`: 60-second valid-response cache, concurrent request deduplication, gzip negotiation, credential separation and no error caching.
- Run `node scripts/check-traffic-protection.mjs` before updating these functions or browser cache. Preserve the response schemas consumed by the UI.
- Memory caches are per Edge runtime instance; cold starts and multiple instances can still query the database. These protections do not guarantee a percentage reduction in organization egress.
- Never publish privileged credentials or internal invocation keys. Other deployed functions must be inspected and sanitized before committing their source.
