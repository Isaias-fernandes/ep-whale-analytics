/* Motor 6: diagnostics from candles and market data already loaded in memory.
 * No network, Supabase, or signal-score changes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EPMotor6MechanismPanel = api.start(root);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const MAX_CANDLES = 96;
  const FRESH_MS = 180000;
  const fmt = (v, d = 2) => Number.isFinite(+v)
    ? (+v).toLocaleString("pt-BR", { maximumFractionDigits: d })
    : "—";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (v, d = 2) => Number.isFinite(+v)
    ? (+v).toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%"
    : "—";

  function bollinger(candles, period = 20) {
    const out = [];
    for (let i = period - 1; i < candles.length; i++) {
      const values = candles.slice(i - period + 1, i + 1).map(c => +c.c);
      const mean = values.reduce((a, b) => a + b, 0) / period;
      if (!(mean > 0)) continue;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
      out.push(4 * Math.sqrt(variance) / mean * 100);
    }
    if (out.length < 20) return null;
    const latest = out.at(-1), prior = out.slice(-61, -1).sort((a, b) => a - b);
    const rank = prior.filter(v => v <= latest).length / prior.length;
    return { widthPct: latest, percentile: rank * 100, squeezed: rank <= 0.2 };
  }

  function obvReading(candles) {
    if (candles.length < 42) return { label: "histórico insuficiente", divergence: false };
    const n = candles.length, start = n - 40;
    let obv = 0;
    const series = [0];
    for (let i = 1; i < candles.length; i++) {
      const direction = Math.sign(+candles[i].c - +candles[i - 1].c);
      obv += direction * (+candles[i].v || 0);
      series.push(obv);
    }
    const priceChange = (+candles[n - 1].c / +candles[n - 21].c - 1) * 100;
    const recentObv = series[n - 1] - series[n - 21];
    const priorObv = series[n - 21] - series[start];
    const totalVol = candles.slice(start, n).reduce((s, c) => s + (+c.v || 0), 0) || 1;
    const relObv = (recentObv - priorObv) / totalVol;
    const divergence = priceChange <= 0.2 && relObv > 0.05;
    return {
      label: divergence ? "possível divergência de acumulação" : relObv > 0.05 ? "OBV comprador" : relObv < -0.05 ? "OBV vendedor" : "OBV sem direção clara",
      divergence,
      priceChange,
      relativeChange: relObv
    };
  }

  function volumeProfile(candles, bins = 24) {
    if (candles.length < 30) return null;
    const low = Math.min(...candles.map(c => +c.l));
    const high = Math.max(...candles.map(c => +c.h));
    if (!(high > low)) return null;
    const step = (high - low) / bins, volume = Array(bins).fill(0);
    for (const c of candles) {
      const typical = ((+c.h) + (+c.l) + (+c.c)) / 3;
      const ix = Math.max(0, Math.min(bins - 1, Math.floor((typical - low) / step)));
      volume[ix] += +c.v || 0;
    }
    const sorted = volume.filter(v => v > 0).sort((a, b) => a - b);
    const current = +candles.at(-1).c;
    const currentIx = Math.max(0, Math.min(bins - 1, Math.floor((current - low) / step)));
    const pocIx = volume.indexOf(Math.max(...volume));
    return {
      poc: low + (pocIx + 0.5) * step,
      currentBinLow: low + currentIx * step,
      currentBinHigh: low + (currentIx + 1) * step,
      lowNodeProxy: sorted.length > 0 && volume[currentIx] <= sorted[Math.floor((sorted.length - 1) * 0.25)],
      currentBinVolume: volume[currentIx]
    };
  }

  function analyze(input = {}) {
    const candles = Array.isArray(input.candles) ? input.candles.slice(-MAX_CANDLES) : [];
    const e = input.early || {};
    const ranges = candles.map(c => ((+c.h - +c.l) / (+c.c || 1)) * 100).filter(Number.isFinite);
    const rangeCompress = ranges.length >= 20
      ? (ranges.slice(-5).reduce((a, b) => a + b, 0) / 5) /
        ((ranges.slice(-20, -5).reduce((a, b) => a + b, 0) / 15) || 1) <= 0.85
      : null;
    const bb = bollinger(candles);
    const obv = obvReading(candles);
    const profile = volumeProfile(candles);
    const price = +(input.price ?? candles.at(-1)?.c);
    const flow = input.flow || null;
    return {
      asset: input.asset || "",
      fresh: Number.isFinite(+input.observedAt) && input.now - +input.observedAt <= FRESH_MS,
      price,
      score: Number(e.score) || 0,
      phase: e.phase || "OBSERVAÇÃO",
      direction: e.dir || "NEUTRAL",
      pattern: e.confirmedPattern || e.pattern || "sem padrão prioritário",
      volumeRatio: Number(e.patternVolumeRatio) || 0,
      patternObv: e.patternObvConfirmed === true,
      rangeCompress,
      bollinger: bb,
      obv,
      profile,
      flow,
      liquidation: null,
      onChain: null,
      candleCount: candles.length
    };
  }

  function flowText(flow) {
    if (!flow) return "Fluxo institucional: sem leitura recente disponível";
    const parts = [];
    if (flow.flow != null && Number.isFinite(+flow.flow)) parts.push("delta/fluxo " + fmt(+flow.flow * 100, 2) + "%");
    if (flow.book != null && Number.isFinite(+flow.book)) parts.push("book " + fmt(+flow.book * 100, 2) + "%");
    if (flow.oi != null && Number.isFinite(+flow.oi)) parts.push("OI " + fmt(flow.oi, 2) + "%");
    return (flow.label || flow.level || "Fluxo lido") + (parts.length ? " • " + parts.join(" • ") : "");
  }

  function card(a) {
    const dir = a.direction === "BUY" ? "COMPRA" : a.direction === "SELL" ? "VENDA" : "NEUTRO";
    const squeeze = a.bollinger
      ? (a.bollinger.squeezed ? "Squeeze: sim" : "Squeeze: não") + " • largura no percentil " + fmt(a.bollinger.percentile, 0)
      : "Squeeze: histórico insuficiente";
    const compression = a.rangeCompress == null ? "compressão: sem candles suficientes" : a.rangeCompress ? "compressão de amplitude detectada" : "sem compressão recente";
    const obv = a.obv?.label || "OBV indisponível";
    const profile = a.profile
      ? (a.profile.lowNodeProxy ? "zona de baixo volume aproximada" : "zona sem vazio aproximado") + " • POC " + fmt(a.profile.poc, 6)
      : "perfil de volume: histórico insuficiente";
    const liquidation = a.liquidation ? "dados de liquidação disponíveis" : "sem mapa de liquidações conectado; não pontua";
    const onChain = a.onChain ? "métrica on-chain disponível" : "sem fonte on-chain conectada; não pontua";
    return '<article class="m6-mechanism-card"><div class="m6-mechanism-head"><b>' + esc(a.asset.replace(/USDT$/, "/USDT")) + '</b><span>' + dir + ' • ' + esc(a.phase) + ' • ' + fmt(a.score, 0) + '/100</span></div>' +
      '<div class="m6-mechanism-pattern">' + esc(a.pattern) + ' • preço ' + fmt(a.price, 6) + (a.fresh ? '' : ' • dados antigos') + '</div>' +
      '<div class="m6-mechanism-grid">' +
      '<div><b>Compressão</b><span>' + compression + '</span></div>' +
      '<div><b>Bollinger</b><span>' + squeeze + '</span></div>' +
      '<div><b>Volume + OBV</b><span>' + fmt(a.volumeRatio, 2) + '× média • ' + obv + (a.patternObv ? ' • confirma padrão' : '') + '</span></div>' +
      '<div><b>Perfil H1 aproximado</b><span>' + profile + '</span></div>' +
      '<div><b>Fluxo / book</b><span>' + flowText(a.flow) + '</span></div>' +
      '<div><b>Liquidações</b><span>' + liquidation + '</span></div>' +
      '<div><b>On-chain</b><span>' + onChain + '</span></div>' +
      '</div></article>';
  }

  function start(win) {
    const doc = win.document;
    function readFlow(x) {
      try {
        const state = win.EPBackend24?.get?.()?.state || [];
        const sym = x?.sym || x?.key;
        const row = state.find(z => z.symbol === sym || z.asset === String(sym || "").replace("USDT", ""));
        const updatedAt = Date.parse(row?.updated_at);
        if (!row || !Number.isFinite(updatedAt) || Date.now() - updatedAt > FRESH_MS) return null;
        const m = row.metrics || {};
        return { flow: m.flow != null && Number.isFinite(+m.flow) ? +m.flow : null, book: m.book != null && Number.isFinite(+m.book) ? +m.book : null, oi: m.oiChange != null && Number.isFinite(+m.oiChange) ? +m.oiChange : null, label: "leitura existente do backend 24/7" };
      } catch { return null; }
    }
    function render() {
      const target = doc.getElementById("motor6MechanismsPanel");
      if (!target) return;
      const map = win.CryptoApp?.getData?.();
      if (!map?.entries || !win.EPEarlyLegMotorV1?.calc) {
        target.innerHTML = '<p class="sub">Aguardando os candles e a cotação já carregados pelo EP.</p>';
        return;
      }
      const now = Date.now(), rows = [];
      for (const [key, x] of map.entries()) {
        let e;
        try { e = win.EPEarlyLegMotorV1.calc(x); } catch { continue; }
        if (!e || +e.score < 35 || !Array.isArray(x?.candles) || x.candles.length < 35) continue;
        const flow = readFlow(x);
        rows.push(analyze({ asset: key || x.sym || x.key, candles: x.candles, observedAt: x.observedAt, now, price: x.livePrice ?? x.price, early: e, flow }));
      }
      rows.sort((a, b) => b.score - a.score);
      target.innerHTML = rows.length
        ? rows.slice(0, 8).map(card).join("") + '<p class="sub">Diagnóstico experimental, somente leitura. Compressão, Bollinger, OBV e perfil usam candles já carregados; perfil é aproximado. Esta leitura não muda score, sinais ou os cinco motores. Liquidações e on-chain não têm fonte conectada e não entram no cálculo.</p>'
        : '<p class="sub">Nenhum ativo com dados recentes e score de observação ≥35 para exibir.</p>';
    }
    win.addEventListener("crypto-data-updated", render);
    win.addEventListener("ep-early-leg-motor-ready", render);
    win.addEventListener("ep-early-leg-updated", render);
    const timer = win.setInterval(() => { if (!doc.hidden) render(); }, 30000);
    render();
    return { render, stop: () => win.clearInterval(timer) };
  }

  return { analyze, bollinger, obvReading, volumeProfile, start };
});
