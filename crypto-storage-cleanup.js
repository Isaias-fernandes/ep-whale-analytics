(() => {
  const allowed = value => ['crypto', 'cripto'].includes(String(value).toLowerCase());
  const isTon = value => ['TON', 'TONUSDT'].includes(String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
  function clean(value) {
    if (Array.isArray(value)) {
      return value
        .filter(item => !(typeof item === 'string' && isTon(item)))
        .filter(item => !(Array.isArray(item) && item.some(cell => typeof cell === 'string' && isTon(cell))))
        .map(clean)
        .filter(item => item !== undefined);
    }
    if (!value || typeof value !== 'object') return isTon(value) ? undefined : value;
    if (value.market != null && !allowed(value.market)) return undefined;
    if (isTon(value.asset) || isTon(value.symbol)) return undefined;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (/b3|brapi/i.test(key) || isTon(key)) continue;
      const next = clean(item);
      if (next !== undefined) result[key] = next;
    }
    return result;
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (/b3|brapi/i.test(key)) { localStorage.removeItem(key); continue; }
      if (!/^(ep_|lab_|early_|pattern_|smart_)/.test(key)) continue;
      try {
        const raw = localStorage.getItem(key), parsed = JSON.parse(raw), next = clean(parsed);
        if (next === undefined) localStorage.removeItem(key);
        else if (JSON.stringify(parsed) !== JSON.stringify(next)) localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    }
  } catch {}
})();
