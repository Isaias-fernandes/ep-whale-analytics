(() => {
  const originalFetch = window.fetch.bind(window);
  const policies = new Map([
    ['ep-24x7-status', 300000],
    ['ep-five-motor-watch', 300000],
    ['ep-motor6-watch', 300000]
  ]);
  const entries = new Map();
  window.fetch = function(input, options = {}) {
    const raw = typeof input === 'string' ? input : input?.url;
    let url;
    try { url = new URL(raw, location.href); } catch { return originalFetch(input, options); }
    const name = url.pathname.split('/').pop();
    const method = (options.method || input?.method || 'GET').toUpperCase();
    if (url.hostname !== 'qhgclnkctpzumtybailv.supabase.co' ||
        !url.pathname.startsWith('/functions/v1/') ||
        method !== 'GET' || !policies.has(name)) return originalFetch(input, options);
    const key = url.href;
    let entry = entries.get(key);
    if (!entry) { entry = { next: 0, failures: 0, response: null, pending: null }; entries.set(key, entry); }
    const fallback = () => entry.response ? entry.response.clone() :
      new Response('{"ok":false,"error":"temporarily_unavailable"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    if (document.hidden || Date.now() < entry.next) return Promise.resolve(fallback());
    if (entry.pending) return entry.pending.then(r => r.clone());
    entry.pending = (async () => {
      try {
        const response = await originalFetch(input, options);
        if (response.ok) {
          entry.response = response.clone();
          entry.failures = 0;
          entry.next = Date.now() + policies.get(name);
        } else {
          entry.failures++;
          entry.next = Date.now() + (response.status === 402 ? 1800000 :
            Math.min(900000, 60000 * 2 ** Math.min(entry.failures - 1, 4)));
        }
        return response;
      } catch (error) {
        entry.failures++;
        entry.next = Date.now() + Math.min(900000, 60000 * 2 ** Math.min(entry.failures - 1, 4));
        return fallback();
      } finally { entry.pending = null; }
    })();
    return entry.pending.then(r => r.clone());
  };
})();
