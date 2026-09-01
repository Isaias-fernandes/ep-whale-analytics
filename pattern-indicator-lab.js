(() => {
  const TARGETS = [10, 20, 30, 40, 50];
  const CONFIGS = {
    atual: { label: 'Atual (controle)', rsi: 7, cci: 14, macd: [20, 30, 60] },
    candidata: { label: 'Candidata', rsi: 14, cci: 20, macd: [12, 26, 9] }
  };
  const TF = {
    M5: { interval: '5m', b3Range: '5d' },
    M15: { interval: '15m', b3Range: '5d' },
    M30: { interval: '30m', b3Range: '1mo' },
    H1: { interval: '1h', b3Range: '3mo' }
  };
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
  const ema = (v, p) => {
    if (!v.length) return [];
    const k = 2 / (p + 1), out = [v[0]];
    for (let i = 1; i < v.length; i++) out.push(v[i] * k + out[i - 1] * (1 - k));
    return out;
  };
  const rsi = (v, p) => {
    if (v.length <= p) return NaN;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; d >= 0 ? g += d : l -= d; }
    let ag = g / p, al = l / p;
    for (let i = p + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      ag = (ag * (p - 1) + Math.max(d, 0)) / p;
      al = (al * (p - 1) + Math.max(-d, 0)) / p;
    }
    return al ? 100 - 100 / (1 + ag / al) : 100;
  };
  const cci = (c, p) => {
    if (c.length < p) return NaN;
    const t = c.slice(-p).map(x => (x.h + x.l + x.c) / 3), m = avg(t), d = avg(t.map(x => Math.abs(x - m)));
    return d ? (t.at(-1) - m) / (0.015 * d) : 0;
  };
  const macd = (v, fast, slow, signal) => {
    if (v.length < Math.max(fast, slow, signal) + 2) return { histogram: NaN, previousHistogram: NaN };
    const a = ema(v, fast), b = ema(v, slow), line = v.map((_, i) => a[i] - b[i]), sig = ema(line, signal);
    return { line: line.at(-1), signal: sig.at(-1), histogram: line.at(-1) - sig.at(-1), previousHistogram: line.at(-2) - sig.at(-2) };
  };
  const atr = (c, p = 14) => {
    if (c.length < p + 1) return NaN;
    const tr = [];
    for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
    return avg(tr.slice(-p));
  };
  const slope = v => {
    if (v.length < 3) return 0;
    const center = (v.length - 1) / 2, mean = avg(v);
    let num = 0, den = 0;
    v.forEach((x, i) => { const d = i - center; num += d * (x - mean); den += d * d; });
    return den ? num / den : 0;
  };
  function swings(c, field, high) {
    const out = [];
    for (let i = 2; i < c.length - 2; i++) {
      const x = c[i][field], ok = high ? x > c[i - 1][field] && x >= c[i + 1][field] : x < c[i - 1][field] && x <= c[i + 1][field];
      if (ok) out.push({ i, x });
    }
    return out;
  }
  function classifyPattern(candles) {
    const w = candles.slice(-60);
    if (w.length < 30) return { type: 'NEUTRO', direction: 'NEUTRAL', name: 'Dados insuficientes', confirmed: false, strength: 0 };
    const b = w.at(-1), a = w.at(-2), d = w.at(-3), body = Math.abs(b.c - b.o), range = Math.max(b.h - b.l, 1e-12);
    const upper = b.h - Math.max(b.o, b.c), lower = Math.min(b.o, b.c) - b.l;
    const bullEng = b.c > b.o && a.c < a.o && b.c >= a.o && b.o <= a.c;
    const bearEng = b.c < b.o && a.c > a.o && b.o >= a.c && b.c <= a.o;
    const hammer = lower >= body * 2 && upper <= Math.max(body, range * .12) && b.c >= b.o;
    const shooting = upper >= body * 2 && lower <= Math.max(body, range * .12) && b.c <= b.o;
    const morning = d.c < d.o && Math.abs(a.c - a.o) < Math.abs(d.c - d.o) * .45 && b.c > b.o && b.c > (d.o + d.c) / 2;
    const evening = d.c > d.o && Math.abs(a.c - a.o) < Math.abs(d.c - d.o) * .45 && b.c < b.o && b.c < (d.o + d.c) / 2;
    const prior = w.slice(-21, -1), high = Math.max(...prior.map(x => x.h)), low = Math.min(...prior.map(x => x.l));
    const close = w.map(x => x.c), impulse = (close.at(-9) - close.at(-17)) / (close.at(-17) || 1), recent = w.slice(-8);
    const recentRange = (Math.max(...recent.map(x => x.h)) - Math.min(...recent.map(x => x.l))) / (b.c || 1);
    const flag = Math.abs(impulse) >= .025 && recentRange <= Math.abs(impulse) * .7;
    const highs = w.slice(-18).map(x => x.h), lows = w.slice(-18).map(x => x.l);
    const converging = slope(highs) < 0 && slope(lows) > 0;
    const ascending = Math.abs(slope(highs)) <= Math.abs(slope(lows)) * .25 && slope(lows) > 0;
    const descending = Math.abs(slope(lows)) <= Math.abs(slope(highs)) * .25 && slope(highs) < 0;
    const currentAtr = atr(w), oldAtr = atr(w.slice(0, -8)), compression = Number.isFinite(currentAtr) && Number.isFinite(oldAtr) && currentAtr < oldAtr * .78;
    const peaks = swings(w, 'h', true), valleys = swings(w, 'l', false), tol = Math.max(currentAtr || 0, b.c * .008);
    const doubleTop = peaks.length >= 2 && Math.abs(peaks.at(-1).x - peaks.at(-2).x) <= tol && b.c < avg(w.slice(-8).map(x => x.c));
    const doubleBottom = valleys.length >= 2 && Math.abs(valleys.at(-1).x - valleys.at(-2).x) <= tol && b.c > avg(w.slice(-8).map(x => x.c));
    if (b.c > high) return { type: 'CONTINUAÇÃO', direction: 'BUY', name: 'Rompimento da máxima de 20 períodos', confirmed: true, strength: 90 };
    if (b.c < low) return { type: 'CONTINUAÇÃO', direction: 'SELL', name: 'Rompimento da mínima de 20 períodos', confirmed: true, strength: 90 };
    if (doubleBottom) return { type: 'REVERSÃO', direction: 'BUY', name: 'Fundo duplo', confirmed: true, strength: 76 };
    if (doubleTop) return { type: 'REVERSÃO', direction: 'SELL', name: 'Topo duplo', confirmed: true, strength: 76 };
    if (morning || bullEng || hammer) return { type: 'REVERSÃO', direction: 'BUY', name: morning ? 'Estrela da manhã' : bullEng ? 'Engolfo de alta' : 'Martelo', confirmed: false, strength: 62 };
    if (evening || bearEng || shooting) return { type: 'REVERSÃO', direction: 'SELL', name: evening ? 'Estrela da noite' : bearEng ? 'Engolfo de baixa' : 'Estrela cadente', confirmed: false, strength: 62 };
    if (flag) return { type: 'CONTINUAÇÃO', direction: impulse > 0 ? 'BUY' : 'SELL', name: impulse > 0 ? 'Bandeira de alta' : 'Bandeira de baixa', confirmed: false, strength: 68 };
    if (ascending) return { type: 'CONTINUAÇÃO', direction: 'BUY', name: 'Triângulo ascendente', confirmed: false, strength: 64 };
    if (descending) return { type: 'CONTINUAÇÃO', direction: 'SELL', name: 'Triângulo descendente', confirmed: false, strength: 64 };
    if (converging || compression) return { type: 'NEUTRO', direction: 'NEUTRAL', name: converging ? 'Triângulo simétrico aguardando saída' : 'Compressão aguardando saída', confirmed: false, strength: 50 };
    if (body / range <= .1 || (b.h < a.h && b.l > a.l)) return { type: 'NEUTRO', direction: 'NEUTRAL', name: body / range <= .1 ? 'Doji / indecisão' : 'Inside bar aguardando rompimento', confirmed: false, strength: 42 };
    return { type: 'NEUTRO', direction: 'NEUTRAL', name: 'Sem padrão confirmado', confirmed: false, strength: 20 };
  }
  function analyze(candles, configName = 'candidata') {
    const cfg = CONFIGS[configName] || CONFIGS.candidata, close = candles.map(x => x.c), pattern = classifyPattern(candles);
    const rv = rsi(close, cfg.rsi), cv = cci(candles, cfg.cci), mv = macd(close, ...cfg.macd), last = candles.at(-1);
    const volumeRatio = last.v / (avg(candles.slice(-21, -1).map(x => x.v)) || last.v || 1), sign = pattern.direction === 'BUY' ? 1 : pattern.direction === 'SELL' ? -1 : 0;
    const aligned = sign && (sign > 0 ? rv >= 50 && cv > 0 && mv.histogram > 0 : rv <= 50 && cv < 0 && mv.histogram < 0);
    const ignition = sign && (sign > 0 ? cv >= 100 && mv.histogram > mv.previousHistogram : cv <= -100 && mv.histogram < mv.previousHistogram);
    let score = pattern.strength + (aligned ? 14 : 0) + (ignition ? 10 : 0) + (volumeRatio >= 2 ? 12 : volumeRatio >= 1.5 ? 8 : volumeRatio >= 1.2 ? 4 : 0);
    if (pattern.type === 'NEUTRO') score = Math.min(score, 49);
    return { config: configName, pattern, direction: pattern.direction, score: clamp(Math.round(score)), rsi: rv, cci: cv, macd: mv, volumeRatio, momentumAligned: !!aligned, ignition: !!ignition };
  }
  function evaluate(candles, configName, horizon = 48, minimumScore = 70) {
    const targets = Object.fromEntries(TARGETS.map(x => [x, 0])), groups = new Map(), signals = [], warmup = 80;
    for (let i = warmup; i < candles.length - horizon; i++) {
      const result = analyze(candles.slice(0, i + 1), configName);
      if (result.direction === 'NEUTRAL' || result.score < minimumScore) continue;
      const entry = candles[i].c, future = candles.slice(i + 1, i + 1 + horizon);
      const favorable = result.direction === 'BUY' ? (Math.max(...future.map(x => x.h)) - entry) / entry * 100 : (entry - Math.min(...future.map(x => x.l))) / entry * 100;
      const adverse = result.direction === 'BUY' ? (Math.min(...future.map(x => x.l)) - entry) / entry * 100 : (entry - Math.max(...future.map(x => x.h))) / entry * 100;
      signals.push({ i, time: candles[i].t, entry, favorable, adverse, ...result });
      TARGETS.forEach(t => { if (favorable >= t) targets[t]++; });
      const key = `${result.pattern.type}: ${result.pattern.name}`, g = groups.get(key) || { pattern: key, signals: 0, favorable: 0, sum: 0, targets: Object.fromEntries(TARGETS.map(x => [x, 0])) };
      g.signals++; g.sum += favorable; if (favorable > 0) g.favorable++;
      TARGETS.forEach(t => { if (favorable >= t) g.targets[t]++; });
      groups.set(key, g); i += Math.max(0, Math.floor(horizon / 4) - 1);
    }
    return { config: configName, horizon, signals, targets, patterns: [...groups.values()].map(g => ({ ...g, average: g.sum / g.signals })).sort((a, b) => b.targets[10] - a.targets[10] || b.average - a.average) };
  }
  const normalizeB3 = rows => (rows || []).map(x => ({ t: +(x.date || x.datetime || x.timestamp || 0) * (+(x.date || 0) < 1e12 ? 1000 : 1), o: +(x.open ?? x.close), h: +(x.high ?? x.close), l: +(x.low ?? x.close), c: +x.close, v: +(x.volume || 0) })).filter(x => [x.o, x.h, x.l, x.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  async function fetchCandles(market, symbol, timeframe) {
    const tf = TF[timeframe] || TF.M15;
    if (market === 'crypto') {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf.interval}&limit=1000`, { cache: 'no-store' });
      if (!response.ok) throw Error(`Binance HTTP ${response.status}`);
      return (await response.json()).map(x => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
    }
    const token = localStorage.getItem('brapi_token') || '';
    if (!token) throw Error('Token BRAPI não salvo');
    const response = await fetch(`https://brapi.dev/api/v2/stocks/historical?symbols=${encodeURIComponent(symbol)}&range=${tf.b3Range}&interval=${tf.interval}&sortOrder=asc`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(payload.message || `BRAPI HTTP ${response.status}`);
    const item = payload?.results?.[0] || {}, data = item.data || item;
    return normalizeB3(data.historicalDataPrice || data.historical || data.prices || []);
  }
  const pct = n => `${Number(n || 0).toFixed(1)}%`;
  function resultHtml(result) {
    const total = result.signals.length;
    return `<section class="pattern-lab-result"><h4>${CONFIGS[result.config].label}</h4><div class="pattern-lab-kpis"><span>Sinais<b>${total}</b></span>${TARGETS.map(t => `<span>Alvo ${t}%<b>${result.targets[t]}</b><small>${total ? pct(result.targets[t] / total * 100) : '—'}</small></span>`).join('')}</div><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>Padrão</th><th>Sinais</th><th>Favoráveis</th><th>Média</th>${TARGETS.map(t => `<th>≥${t}%</th>`).join('')}</tr></thead><tbody>${result.patterns.length ? result.patterns.map(g => `<tr><td>${g.pattern}</td><td>${g.signals}</td><td>${pct(g.favorable / g.signals * 100)}</td><td>${pct(g.average)}</td>${TARGETS.map(t => `<td>${g.targets[t]}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="9">Nenhum sinal elegível nesta amostra.</td></tr>'}</tbody></table></div></section>`;
  }
  function fillAssets() {
    const market = document.querySelector('#patternLabMarket')?.value || 'crypto', select = document.querySelector('#patternLabAsset');
    if (!select) return;
    const items = market === 'crypto' ? window.CryptoApp?.getPairs?.() || [] : window.B3App?.getStocks?.() || [];
    select.innerHTML = items.map(([symbol, name]) => `<option value="${symbol}">${market === 'crypto' ? `${name}/USDT` : `${symbol} — ${name}`}</option>`).join('');
  }
  async function run() {
    const market = document.querySelector('#patternLabMarket').value, symbol = document.querySelector('#patternLabAsset').value, timeframe = document.querySelector('#patternLabTf').value;
    const horizon = +document.querySelector('#patternLabHorizon').value, score = +document.querySelector('#patternLabScore').value;
    const status = document.querySelector('#patternLabStatus'), output = document.querySelector('#patternLabOutput');
    status.textContent = `Carregando ${symbol} ${timeframe}...`; output.innerHTML = '';
    try {
      const candles = await fetchCandles(market, symbol, timeframe);
      if (candles.length < horizon + 80) throw Error(`Amostra insuficiente: ${candles.length} candles`);
      const current = evaluate(candles, 'atual', horizon, score), candidate = evaluate(candles, 'candidata', horizon, score);
      output.innerHTML = `<p class="sub">${candles.length} candles. Alvos medidos pela máxima excursão favorável após o sinal; não representam lucro garantido.</p>${resultHtml(current)}${resultHtml(candidate)}`;
      status.textContent = `Concluído • ${symbol} • ${timeframe} • horizonte ${horizon} candles`;
    } catch (error) { status.textContent = `Falha no teste: ${error.message}`; }
  }
  function init() {
    if (document.querySelector('#patternIndicatorLab')) return;
    const anchor = document.querySelector('#backtestArea'); if (!anchor) return;
    const section = document.createElement('section'); section.id = 'patternIndicatorLab'; section.className = 'card';
    section.innerHTML = `<h2>LABORATÓRIO DE INDICADORES + PADRÕES — ALVOS 10% A 50%</h2><p class="sub">Compara o controle atual com RSI 14, CCI 20 e MACD 12/26/9. Não altera os cinco motores oficiais.</p><div class="pattern-lab-controls"><label>Mercado<select id="patternLabMarket"><option value="crypto">Cripto</option><option value="b3">B3</option></select></label><label>Ativo<select id="patternLabAsset"></select></label><label>Período<select id="patternLabTf"><option>M5</option><option selected>M15</option><option>M30</option><option>H1</option></select></label><label>Horizonte<select id="patternLabHorizon"><option value="24">24 candles</option><option value="48" selected>48 candles</option><option value="96">96 candles</option></select></label><label>Pontuação mínima<select id="patternLabScore"><option>60</option><option selected>70</option><option>80</option></select></label><button id="patternLabRun">Executar teste</button></div><div id="patternLabStatus" class="sub">Aguardando execução manual.</div><div id="patternLabOutput"></div>`;
    anchor.insertAdjacentElement('afterend', section);
    const style = document.createElement('style'); style.textContent = '.pattern-lab-controls{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr)) 150px;gap:10px;align-items:end}.pattern-lab-result{margin-top:14px;padding:12px;background:#091827;border:1px solid #29415e;border-radius:10px}.pattern-lab-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0}.pattern-lab-kpis span{padding:8px;background:#0d1a2b;border-radius:7px;font-size:11px}.pattern-lab-kpis b,.pattern-lab-kpis small{display:block;margin-top:3px}@media(max-width:900px){.pattern-lab-controls,.pattern-lab-kpis{grid-template-columns:repeat(2,1fr)}}'; document.head.appendChild(style);
    fillAssets(); document.querySelector('#patternLabMarket').addEventListener('change', fillAssets); document.querySelector('#patternLabRun').addEventListener('click', run);
  }
  window.EPPatternIndicatorLab = { analyze, classifyPattern, evaluate, configs: CONFIGS, targets: TARGETS };
  setTimeout(init, 900);
})();
