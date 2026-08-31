(() => {
  const $ = (s) => document.querySelector(s);
  const TFS = [
    { key: "M5", interval: "5m", b3Range: "5d" },
    { key: "M15", interval: "15m", b3Range: "5d" },
    { key: "M30", interval: "30m", b3Range: "5d" },
    { key: "H1", interval: "1h", b3Range: "1mo" },
  ];
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
  const ema = (v, p) => {
    if (!v.length) return [];
    const k = 2 / (p + 1), out = [v[0]];
    for (let i = 1; i < v.length; i++) out.push(v[i] * k + out[i - 1] * (1 - k));
    return out;
  };
  const rsi = (v, p = 7) => {
    if (v.length <= p) return 50;
    let gain = 0, loss = 0;
    for (let i = 1; i <= p; i++) {
      const d = v[i] - v[i - 1];
      d >= 0 ? (gain += d) : (loss -= d);
    }
    let ag = gain / p, al = loss / p;
    for (let i = p + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      ag = (ag * (p - 1) + Math.max(d, 0)) / p;
      al = (al * (p - 1) + Math.max(-d, 0)) / p;
    }
    return al ? 100 - 100 / (1 + ag / al) : 100;
  };
  const atr = (c, p = 14) => avg(c.slice(-(p + 1)).map((x, i, a) => i ? Math.max(x.h - x.l, Math.abs(x.h - a[i - 1].c), Math.abs(x.l - a[i - 1].c)) : x.h - x.l).slice(1));
  const cci = (c, p = 14) => {
    const t = c.slice(-p).map((x) => (x.h + x.l + x.c) / 3), m = avg(t), d = avg(t.map((x) => Math.abs(x - m)));
    return d ? (t.at(-1) - m) / (0.015 * d) : 0;
  };
  const normalizeB3 = (a) => (a || []).map((x) => ({
    t: +(x.date || x.datetime || x.timestamp || 0) * (+(x.date || 0) < 1e12 ? 1000 : 1),
    o: +(x.open ?? x.close), h: +(x.high ?? x.close), l: +(x.low ?? x.close), c: +x.close, v: +(x.volume || 0),
  })).filter((x) => [x.o, x.h, x.l, x.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  function analyze(c) {
    if (!c || c.length < 25) throw Error("candles insuficientes");
    const close = c.map((x) => x.c), last = c.at(-1), price = last.c, e20 = ema(close, 20).at(-1), a = atr(c), rv = rsi(close), cv = cci(c);
    const w = close.slice(-20), mid = avg(w), sd = Math.sqrt(avg(w.map((x) => (x - mid) ** 2))), z = sd ? (price - mid) / sd : 0;
    const vbase = avg(c.slice(-21, -1).map((x) => x.v)), vr = last.v / (vbase || last.v || 1), previous = c.slice(-21, -1);
    const breakout = previous.length && (price > Math.max(...previous.map((x) => x.h)) || price < Math.min(...previous.map((x) => x.l)));
    const distAtr = a ? Math.abs(price - e20) / a : 0, momentumAtr = a ? Math.abs(price - (close.at(-4) || price)) / a : 0;
    let score = 0;
    score += Math.min(28, distAtr * 14);
    score += Math.min(18, Math.abs(z) * 7);
    score += rv >= 75 || rv <= 25 ? 14 : 0;
    score += Math.abs(cv) >= 150 ? 10 : 0;
    score += Math.min(14, Math.max(0, vr - 1) * 10);
    score += Math.min(10, momentumAtr * 5);
    score += breakout ? 6 : 0;
    score = clamp(Math.round(score));
    const stage = score >= 80 ? "STRETCH_RISK" : score >= 65 ? "PRE_STRETCH" : score >= 45 ? "WATCH" : "NORMAL";
    const atrPct = price ? (a / price) * 100 : 0;
    const projected = Math.round(Math.max(atrPct * 0.8, Math.min(atrPct * 3, atrPct * (0.8 + score / 45))) * 100) / 100;
    return { price, direction: price >= e20 ? "UP" : "DOWN", score, stage, projected, rsi: rv, cci: cv, z, volumeRatio: vr, distAtr };
  }
  async function cryptoCandles(symbol, interval) {
    const bases = ["https://api.binance.com", "https://api-gcp.binance.com", "https://data-api.binance.vision"];
    let lastError;
    for (const base of bases) {
      try {
        const r = await fetch(`${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=120`, { cache: "no-store" });
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const a = await r.json();
        return a.map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
      } catch (e) { lastError = e; }
    }
    throw lastError || Error("Binance indisponível");
  }
  async function b3Candles(symbol, tf) {
    const token = localStorage.getItem("brapi_token") || "";
    if (!token) throw Error("token BRAPI não salvo");
    const headers = { Authorization: `Bearer ${token}` };
    const urls = [
      `https://brapi.dev/api/quote/${encodeURIComponent(symbol)}?range=${tf.b3Range}&interval=${tf.interval}&fundamental=false&dividends=false`,
      `https://brapi.dev/api/v2/stocks/historical?symbols=${encodeURIComponent(symbol)}&range=${tf.b3Range}&interval=${tf.interval}&sortOrder=asc`,
    ];
    let lastError;
    for (const url of urls) {
      try {
        const r = await fetch(url, { headers, cache: "no-store" }), j = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(j.message || `HTTP ${r.status}`);
        const item = j?.results?.[0] || {}, payload = item.data || item;
        const c = normalizeB3(payload.historicalDataPrice || payload.historical || payload.prices || []);
        if (c.length) return c;
        throw Error("sem OHLCV");
      } catch (e) { lastError = e; }
    }
    throw lastError || Error("BRAPI indisponível");
  }
  function ensure() {
    if ($("#stretchObserver")) return;
    const anchor = $(".chart-section") || $("#decisionCenter")?.closest("section.card");
    if (!anchor) return;
    const section = document.createElement("section");
    section.id = "stretchObserver";
    section.className = "card";
    section.innerHTML = `<h2>PREVISÃO OBSERVACIONAL — MOVIMENTO ESTICADO MTF</h2><p class="sub">Camada independente dos 5 motores oficiais. Mede risco de continuação/exaustão; não cria ordem nem confirma entrada sozinha.</p><div class="stretch-controls"><label>Mercado<select id="stretchMarket"><option value="crypto">Cripto</option><option value="b3">B3</option></select></label><label>Ativo<select id="stretchAsset"></select></label><button id="stretchRefresh">Atualizar previsão</button><span id="stretchStatus" class="sub">Aguardando...</span></div><div id="stretchTable"></div>`;
    anchor.insertAdjacentElement("afterend", section);
    const style = document.createElement("style");
    style.textContent = `.stretch-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.stretch-controls label{min-width:170px}.stretch-stage{font-weight:800}.stretch-normal{color:#60d394}.stretch-watch{color:#74b9ff}.stretch-pre{color:#ffd166}.stretch-risk{color:#ff6b7a}`;
    document.head.appendChild(style);
  }
  function fillAssets() {
    const market = $("#stretchMarket")?.value || "crypto", select = $("#stretchAsset");
    if (!select) return;
    const items = market === "crypto" ? (window.CryptoApp?.getPairs?.() || []) : (window.B3App?.getStocks?.() || []);
    select.innerHTML = items.map(([symbol, name]) => `<option value="${symbol}">${market === "crypto" ? `${name}/USDT` : `${symbol} — ${name}`}</option>`).join("");
  }
  const stageClass = (s) => s === "STRETCH_RISK" ? "stretch-risk" : s === "PRE_STRETCH" ? "stretch-pre" : s === "WATCH" ? "stretch-watch" : "stretch-normal";
  async function refresh() {
    const market = $("#stretchMarket").value, symbol = $("#stretchAsset").value, status = $("#stretchStatus"), table = $("#stretchTable");
    status.textContent = `Calculando ${symbol} em 4 períodos...`;
    const rows = await Promise.all(TFS.map(async (tf) => {
      try {
        const candles = market === "crypto" ? await cryptoCandles(symbol, tf.interval) : await b3Candles(symbol, tf);
        return { tf: tf.key, ...analyze(candles), candles: candles.length };
      } catch (e) { return { tf: tf.key, error: e.message || String(e) }; }
    }));
    table.innerHTML = `<div style="overflow-x:auto"><table><tr><th>Período</th><th>Estágio</th><th>Direção</th><th>Score</th><th>Movimento projetado*</th><th>RSI</th><th>Distância EMA20/ATR</th><th>Dados</th></tr>${rows.map((r) => r.error ? `<tr><td><b>${r.tf}</b></td><td colspan="7">Indisponível: ${r.error}</td></tr>` : `<tr><td><b>${r.tf}</b></td><td class="stretch-stage ${stageClass(r.stage)}">${r.stage}</td><td>${r.direction === "UP" ? "↑ ALTA" : "↓ BAIXA"}</td><td>${r.score}/100</td><td>${r.projected.toFixed(2)}%</td><td>${r.rsi.toFixed(1)}</td><td>${r.distAtr.toFixed(2)} ATR</td><td>${r.candles} candles</td></tr>`).join("")}</table></div><p class="sub">*Faixa estatística observacional baseada no ATR e no score atual; não é garantia de movimento.</p>`;
    status.textContent = rows.some((r) => !r.error) ? `Atualizado ${new Date().toLocaleTimeString("pt-BR")}` : "Nenhum período disponível";
    window.dispatchEvent(new CustomEvent("stretch-observer-updated", { detail: { market, symbol, rows, ts: Date.now() } }));
  }
  function init() {
    ensure(); fillAssets();
    $("#stretchMarket")?.addEventListener("change", () => { fillAssets(); refresh(); });
    $("#stretchAsset")?.addEventListener("change", refresh);
    $("#stretchRefresh")?.addEventListener("click", refresh);
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
    window.EPStretchObserver = { refresh, analyze, timeframes: TFS };
  }
  setTimeout(init, 1200);
})();
