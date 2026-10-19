/* Motor 6 Min30: alternativa experimental local, sem chamadas ou gravações Supabase.
 * Reutiliza somente a leitura em memória do Motor 7 e os dados já presentes no CryptoApp.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EPMotor6Min30Shadow = api.start(root);
})(typeof window !== "undefined" ? window : null, function(root) {
  "use strict";
  const KEY = "ep_motor6_min30_shadow_v1";
  const MAX_HISTORY = 500;
  const HORIZON_MS = 96 * 60 * 60 * 1000;
  const REENTRY_COOLDOWN_MS = HORIZON_MS;
  const $ = (id) => document.getElementById(id);
  const normalize = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const priceOf = (x) => {
    const p = +(x?.livePrice ?? x?.price ?? x?.regularMarketPrice ?? x?.close ?? x?.candles?.at?.(-1)?.c);
    return Number.isFinite(p) && p > 0 ? p : NaN;
  };
  const directionalReturn = (entry, current, direction) => {
    if (!Number.isFinite(entry) || !Number.isFinite(current) || !entry) return NaN;
    const raw = (current - entry) / entry * 100;
    return direction === "SELL" ? -raw : raw;
  };

  function assess(signal, minimum, now = Date.now(), currentPrice = +minimum?.price) {
    const w = minimum?.windows?.["30d"];
    const fresh = !!minimum && !minimum.error && Number.isFinite(+minimum.updatedAt) && now - +minimum.updatedAt <= 8 * 60 * 1000;
    const policy = root?.EPMotor6PatternPolicy || (typeof require === "function" ? require("./motor6-pattern-policy.js") : null);
    if (!policy?.assessMin30) return { eligible: false, reason: "política do Motor 6 indisponível" };
    const distancePct = Number.isFinite(+currentPrice) && Number.isFinite(+w?.low) && +w.low > 0
      ? (+currentPrice - +w.low) / +w.low * 100
      : NaN;
    return policy.assessMin30({
      fresh,
      minimumValid: !!w && Number.isFinite(+w.low) && +w.low > 0,
      candleCount: +w?.candles || 0,
      distancePct,
      direction: signal?.dir,
      pattern: signal?.confirmedPattern,
      patternConfirmed: signal?.patternConfirmed === true,
      score: +signal?.score || 0
    });
  }

  function start(win) {
    const doc = win.document;
    const el = () => doc.getElementById("motor6Min30ShadowPanel");
    let episodes = [];
    try {
      const saved = JSON.parse(win.localStorage.getItem(KEY) || "[]");
      if (Array.isArray(saved)) episodes = saved.filter(x => x && x.id && x.asset && x.entryPrice).slice(-MAX_HISTORY);
    } catch {}
    const persist = () => { try { win.localStorage.setItem(KEY, JSON.stringify(episodes.slice(-MAX_HISTORY))); } catch {} };

    function getMinimum(symbol) {
      try { return win.EPMotor7Minimum?.get?.(symbol) || null; } catch { return null; }
    }
    function createEpisode(asset, x, signal, gate, minimum, now) {
      const p = priceOf(x), w = minimum.windows["30d"];
      if (!Number.isFinite(p)) return null;
      return {
        id: "m6-min30:" + normalize(asset) + ":" + now,
        asset: normalize(asset), source: "motor6-min30-shadow",
        direction: signal.dir, pattern: signal.confirmedPattern, score: +signal.score,
        minimum30: +w.low, distancePct: +gate.distancePct, entryPrice: p, lastPrice: p,
        entryAt: now, status: "OPEN", bestPct: 0, worstPct: 0, resultPct: null,
        gateReason: gate.reason
      };
    }
    function updateOpen(map, now) {
      for (const episode of episodes.filter(x => x.status === "OPEN")) {
        const x = map.get(episode.asset) || [...map.entries()].find(([k,v]) => normalize(k) === episode.asset || normalize(v?.sym) === episode.asset)?.[1];
        if (!x) continue;
        const p = priceOf(x);
        if (!Number.isFinite(p)) continue;
        const r = directionalReturn(+episode.entryPrice, p, episode.direction);
        episode.lastPrice = p;
        episode.lastAt = now;
        episode.bestPct = Math.max(+episode.bestPct || 0, r);
        episode.worstPct = Math.min(+episode.worstPct || 0, r);
        if (now - +episode.entryAt >= HORIZON_MS) {
          episode.status = "CLOSED";
          episode.exitAt = now;
          episode.resultPct = r;
          episode.closeReason = "HORIZON_96H";
        }
      }
    }
    function scan() {
      const map = win.CryptoApp?.getData?.();
      const policy = win.EPMotor6PatternPolicy;
      const calc = win.EPEarlyLegMotorV1?.calc;
      if (!map?.entries || !policy?.assessMin30 || !calc) { render([]); return; }
      const now = Date.now(), current = [];
      updateOpen(map, now);
      for (const [key, x] of map.entries()) {
        const asset = normalize(key || x?.sym || x?.key);
        const minimum = getMinimum(asset);
        if (!minimum) continue;
        let signal;
        try { signal = calc(x); } catch { continue; }
        if (!signal) continue;
        const gate = assess(signal, minimum, now);
        if (!gate.eligible) continue;
        const existing = episodes.find(e => normalize(e.asset) === asset && e.status === "OPEN");
        if (!existing) {
          const last = [...episodes].reverse().find(e => normalize(e.asset) === asset);
          if (!last || now - +last.entryAt >= REENTRY_COOLDOWN_MS) {
            const episode = createEpisode(asset, x, signal, gate, minimum, now);
            if (episode) { episodes.push(episode); current.push(episode); }
          }
        } else current.push(existing);
      }
      episodes = episodes.slice(-MAX_HISTORY);
      persist();
      render(current);
      win.dispatchEvent(new CustomEvent("ep-motor6-min30-shadow-updated", { detail: { active: episodes.filter(e => e.status === "OPEN").length, closed: episodes.filter(e => e.status === "CLOSED").length } }));
    }
    function close(id) {
      const episode = episodes.find(e => e.id === id && e.status === "OPEN");
      if (!episode) return;
      const map = win.CryptoApp?.getData?.();
      const x = map?.get?.(episode.asset);
      const p = priceOf(x);
      if (Number.isFinite(p)) episode.lastPrice = p;
      episode.resultPct = directionalReturn(+episode.entryPrice, +episode.lastPrice, episode.direction);
      episode.exitAt = Date.now();
      episode.status = "CLOSED";
      episode.closeReason = "MANUAL_LOCAL";
      persist(); render([]);
    }
    const fmt = (v, d = 2) => Number.isFinite(+v) ? (+v).toLocaleString("pt-BR", { maximumFractionDigits: d }) : "—";
    function render(current) {
      const target = el();
      if (!target) return;
      const open = episodes.filter(e => e.status === "OPEN");
      const closed = episodes.filter(e => e.status === "CLOSED" && e.closeReason === "HORIZON_96H" && Number.isFinite(+e.resultPct));
      const manual = episodes.filter(e => e.status === "CLOSED" && e.closeReason === "MANUAL_LOCAL");
      const wins = closed.filter(e => +e.resultPct > 0).length;
      const mean = closed.length ? closed.reduce((s,e) => s + +e.resultPct, 0) / closed.length : null;
      const signals = current.filter(e => e.status === "OPEN");
      target.innerHTML = '<div class="m7-summary"><div class="m7-chip"><b>' + signals.length + '</b><br><span class="sub">novos/ativos elegíveis</span></div><div class="m7-chip"><b>' + open.length + '</b><br><span class="sub">em teste local</span></div><div class="m7-chip"><b>' + closed.length + '</b><br><span class="sub">fechados em 96h</span></div><div class="m7-chip"><b>' + manual.length + '</b><br><span class="sub">encerrados manualmente, fora da taxa</span></div><div class="m7-chip"><b>' + (closed.length ? wins + '/' + closed.length + ' (' + (100*wins/closed.length).toFixed(1) + '%)' : '—') + '</b><br><span class="sub">positivos 96h • média ' + (mean == null ? '—' : (mean >= 0 ? '+' : '') + mean.toFixed(2) + '%') + '</span></div></div>' +
        (open.length ? '<div class="m7-grid">' + open.map(e => {
          const r = directionalReturn(+e.entryPrice, +e.lastPrice, e.direction);
          return '<article class="m7-card m7-confirmed"><h3>' + e.asset.replace(/USDT$/,'') + '/USDT — ' + (e.direction === 'BUY' ? 'COMPRA' : 'VENDA') + '</h3><div class="m7-pills"><span class="m7-pill">SINAL SOMBRA</span><span class="m7-pill">' + e.pattern + '</span></div><div class="row"><span>Distância da mínima 30d na entrada</span><b>' + fmt(e.distancePct,3) + '%</b></div><div class="row"><span>Score técnico • Entrada</span><b>' + fmt(e.score,0) + '/100</b></div><div class="row"><span>Entrada → preço atual</span><b>' + fmt(e.entryPrice,6) + ' → ' + fmt(e.lastPrice,6) + ' (' + (r >= 0 ? '+' : '') + fmt(r) + '%)</b></div><div class="row"><span>MFE / MAE direcional</span><b>+' + fmt(e.bestPct) + '% / ' + fmt(e.worstPct) + '%</b></div><div class="row"><span>Tempo de teste</span><b>' + fmt((Date.now()-e.entryAt)/3600000,1) + ' h / 96 h</b></div><button type="button" data-m6-min30-close="' + e.id + '">Encerrar teste local</button></article>';
        }).join('') + '</div>' : '<div class="m7-empty">Nenhum sinal sombra atende simultaneamente aos filtros. Os sinais só aparecem com mínima 30d recente e padrão direcional confirmado.</div>') +
        '<p class="sub">Teste exploratório no navegador; entrada no preço atual, acompanhamento por até 96h. Não é ordem nem recomendação. Os resultados ficam só neste navegador e não alimentam o arquivo oficial.</p>';
      target.querySelectorAll('[data-m6-min30-close]').forEach(b => b.addEventListener('click', () => close(b.dataset.m6Min30Close)));
    }
    win.addEventListener("crypto-data-updated", scan);
    win.addEventListener("ep-motor7-minimum-updated", scan);
    win.addEventListener("ep-early-leg-motor-ready", scan);
    const timer = win.setInterval(() => { if (!doc.hidden) scan(); }, 30000);
    scan();
    return { VERSION: "motor6-min30-shadow-v1", scan, assess, get: () => episodes.slice(), stop: () => win.clearInterval(timer), KEY };
  }

  return { VERSION: "motor6-min30-shadow-v1", assess, start };
});
