(() => {
  const $ = (s) => document.querySelector(s),
    KEY = "ep_live_operations_v1",
    HKEY = "ep_live_operations_history_v1";
  let ops = [],
    hist = [];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(saved)) ops = saved.filter(o => o && o.id && o.asset && o.market);
  } catch (e) { console.warn("LiveOps: estado ativo preservado em memória; storage inválido", e); }
  try {
    const savedHist = JSON.parse(localStorage.getItem(HKEY) || "[]");
    if (Array.isArray(savedHist)) hist = savedHist;
  } catch (e) { console.warn("LiveOps: histórico inválido", e); }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ops));
      localStorage.setItem(HKEY, JSON.stringify(hist.slice(-300)));
      return true;
    } catch (e) {
      console.warn("LiveOps: falha ao salvar; operações permanecem em memória", e);
      return false;
    }
  };
  const fmt = (n) =>
      Number.isFinite(+n) && +n > 0
        ? (+n).toLocaleString("pt-BR", {
            maximumFractionDigits: +n < 10 ? 6 : 2,
          })
        : "—",
    dur = (ms) => {
      let s = Math.max(0, Math.floor(ms / 1000)),
        h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60);
      return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
    };
  function data(m, a) {
    let map =
        m === "crypto"
          ? window.CryptoApp?.getData?.()
          : window.B3App?.getData?.(),
      x = map?.get?.(a);
    if (!x && m === "crypto") x = map?.get?.(String(a).replace("/", ""));
    return x;
  }
  function calc(m, x) {
    return x ? window.EPDecision?.calc?.(x, m) : null;
  }
  function gate(m, x) {
    return x ? window.EPReversalGate?.calc?.(x, m) : null;
  }
  function price(x) {
    let p = +(
      x?.livePrice ??
      x?.price ??
      x?.regularMarketPrice ??
      x?.close ??
      0
    );
    return Number.isFinite(p) && p > 0 ? p : NaN;
  }
  function pnl(o, p) {
    if (!o.entry || !Number.isFinite(p)) return NaN;
    let q = ((p - o.entry) / o.entry) * 100;
    return o.dir === "SELL" ? -q : q;
  }
  function state(o, a, has) {
    if (!has) return ["stale", "🟦 AGUARDANDO COTAÇÃO"];
    let m = +a?.motorAgree || 0;
    if (m <= 1) return ["danger", "🔴 SINAL PERDEU CONFIRMAÇÃO"];
    if (m < Math.max(2, (+o.entryMotors || 0) - 1))
      return ["warn2", "🟠 DETERIORAÇÃO"];
    if (m < (+o.entryMotors || 0)) return ["warn", "🟡 ATENÇÃO"];
    return ["good", "🟢 MANTÉM ESTRUTURA"];
  }
  function css() {
    if ($("style[data-liveop]")) return;
    let s = document.createElement("style");
    s.dataset.liveop = "1";
    s.textContent = `.lop-actions{margin-top:8px}.lop-btn{border:1px solid #2d6c8d;background:#0b2638;color:#d9eaf5;border-radius:9px;padding:7px 10px;cursor:pointer}.lop-wrap{display:grid;gap:10px}.lop-card{border:1px solid #21465e;border-left:4px solid #46d99d;border-radius:13px;background:#081a29;padding:12px}.lop-card.warn{border-left-color:#ffd166}.lop-card.warn2{border-left-color:#ff9f43}.lop-card.danger{border-left-color:#ff5f6d}.lop-card.stale{border-left-color:#53a9ff}.lop-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.lop-grid{display:grid;grid-template-columns:repeat(7,minmax(90px,1fr));gap:7px;margin-top:9px}.lop-cell{background:#0c2638;border-radius:8px;padding:7px}.lop-cell small{display:block;color:#83a0b7;font-size:10px}.lop-good{color:#58e6aa}.lop-bad{color:#ff8f9a}.lop-close{border-color:#82434a;color:#ffadb4}@media(max-width:900px){.lop-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.lop-grid{grid-template-columns:repeat(2,1fr)}}`;
    document.head.appendChild(s);
  }
  function ensure() {
    css();
    if ($("#liveOperations")) return;
    let center = $("#decisionCenter")?.closest("section.card");
    if (!center) return;
    let s = document.createElement("section");
    s.className = "card";
    s.id = "liveOperationsSection";
    s.innerHTML =
      '<div class="ep24-head"><div><h2>MINHAS OPERAÇÕES — MONITORAMENTO AO VIVO + EXIT INTELLIGENCE</h2><p class="sub">Área prioritária: acompanha os ativos escolhidos, protege resultado e sinaliza deterioração antes do encerramento tradicional. Não executa ordens.</p></div><b id="lopCount">0 abertas</b></div><div id="liveOperations" class="lop-wrap"></div>';
    center.insertAdjacentElement("beforebegin", s);
  }
  function card(o) {
    return `<div class="lop-card" data-op="${o.id}"><div class="lop-top"><div><b>${String(o.asset).replace("USDT", "/USDT")}</b> <small>${o.market === "b3" ? "B3" : "CRIPTO"} • ${o.dir === "SELL" ? "VENDA" : "COMPRA"}</small><div><b data-f="state">🟦 AGUARDANDO COTAÇÃO</b></div></div><button class="lop-btn lop-close" data-close="${o.id}">ENCERRAR ACOMPANHAMENTO</button></div><div class="lop-grid"><div class="lop-cell"><small>ENTRADA → ATUAL</small><b data-f="price">${fmt(o.entry)} → ${fmt(o.lastPrice)}</b></div><div class="lop-cell"><small>RESULTADO</small><b data-f="pnl">—</b></div><div class="lop-cell"><small>MOTORES</small><b data-f="motors">${o.entryMotors}M → ${o.lastMotors}M</b><small data-f="peak">Pico ${o.peakMotors}M</small></div><div class="lop-cell"><small>REVERSAL GATE</small><b data-f="gate">${o.entryGate} → —</b><small data-f="gmax">Máx ${o.maxGate}</small></div><div class="lop-cell"><small>TEMPO</small><b data-f="time">0m 0s</b></div><div class="lop-cell"><small>MÁX FAVORÁVEL</small><b class="lop-good" data-f="best">+0.00%</b></div><div class="lop-cell"><small>MÁX ADVERSA</small><b class="lop-bad" data-f="worst">0.00%</b></div></div><div class="lop-grid">${[1, 2, 3, 4, 5].map((n) => `<div class="lop-cell"><small>TEMPO ${n}M</small><b data-f="d${n}">0m 0s</b></div>`).join("")}</div><div class="exit-intel lop-cell" style="margin-top:9px"><small>EXIT INTELLIGENCE — OBSERVACIONAL</small><b data-f="exitLabel">🟢 MANTÉM MOVIMENTO</b><small data-f="exitReason">Sem deterioração relevante</small></div></div>`;
  }
  function rebuild() {
    ensure();
    let root = $("#liveOperations");
    if (!root) return;
    let sig = ops.map((o) => `${o.id}:${o.asset}:${o.market}`).join("|");
    if (root.dataset.sig === sig) return;
    root.dataset.sig = sig;
    $("#lopCount").textContent =
      `${ops.length} aberta${ops.length === 1 ? "" : "s"}`;
    root.innerHTML = ops.length
      ? ops.map(card).join("")
      : '<div class="ep24-empty">Nenhuma operação em acompanhamento. Use “ACOMPANHAR ATIVO” na Central de Interpretação.</div>';
    root
      .querySelectorAll("[data-close]")
      .forEach((b) => (b.onclick = () => close(b.dataset.close)));
  }
  function refreshFields() {
    rebuild();
    ops.forEach((o) => {
      let el = [...document.querySelectorAll("[data-op]")].find((node) => node.dataset.op === o.id);
      if (!el) return;
      let x = data(o.market, o.asset),
        a = calc(o.market, x),
        g = gate(o.market, x),
        p = price(x),
        has = !!a && Number.isFinite(p);
      if (!Number.isFinite(p)) p = o.lastPrice;
      let r = pnl(o, p),
        st = state(o, a, has),
        m = has ? +a.motorAgree || 0 : o.lastMotors;
      el.className = `lop-card ${st[0]}`;
      el.querySelector('[data-f="state"]').textContent = st[1];
      el.querySelector('[data-f="price"]').textContent =
        `${fmt(o.entry)} → ${fmt(p)}`;
      let pe = el.querySelector('[data-f="pnl"]');
      pe.textContent = Number.isFinite(r)
        ? `${r >= 0 ? "+" : ""}${r.toFixed(2)}%`
        : "—";
      pe.className = Number.isFinite(r) && r >= 0 ? "lop-good" : "lop-bad";
      el.querySelector('[data-f="motors"]').textContent =
        `${o.entryMotors}M → ${m}M`;
      el.querySelector('[data-f="peak"]').textContent = `Pico ${o.peakMotors}M`;
      el.querySelector('[data-f="gate"]').textContent =
        `${o.entryGate} → ${has ? +g?.score || 0 : "—"}`;
      el.querySelector('[data-f="gmax"]').textContent = `Máx ${o.maxGate}`;
      el.querySelector('[data-f="time"]').textContent = dur(
        Date.now() - o.entryAt,
      );
      el.querySelector('[data-f="best"]').textContent =
        `+${(+o.best || 0).toFixed(2)}%`;
      el.querySelector('[data-f="worst"]').textContent =
        `${(+o.worst || 0).toFixed(2)}%`;
      [1, 2, 3, 4, 5].forEach(
        (n) =>
          (el.querySelector(`[data-f="d${n}"]`).textContent = dur(
            o.durations[n] || 0,
          )),
      );
      if (window.EPExitIntelligence?.evaluate) {
        o.currentPnl = Number.isFinite(r) ? r : 0;
        let z = window.EPExitIntelligence.evaluate(o, a, g);
        el.querySelector('[data-f="exitLabel"]').textContent = z.label;
        el.querySelector('[data-f="exitReason"]').textContent = z.reason;
      }
    });
  }
  function add(m, a) {
    let x = data(m, a),
      d = calc(m, x);
    if (!x || !d) return alert("Dados do ativo ainda não disponíveis.");
    let motors = +d.motorAgree || 0;
    let existing = ops.find((o) => o.market === m && o.asset === a);
    if (existing) {
      rebuild();
      let section = document.getElementById("liveOperationsSection");
      let el = [...document.querySelectorAll("[data-op]")].find(
        (node) => node.dataset.op === existing.id,
      );
      if (section) section.style.display = "";
      if (el) {
        el.style.outline = "3px solid #53a9ff";
        el.style.outlineOffset = "2px";
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          el.style.outline = "";
          el.style.outlineOffset = "";
        }, 3500);
      } else if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      alert("Este ativo já está em acompanhamento. Veja MINHAS OPERAÇÕES.");
      return;
    }
    let g = gate(m, x),
      p = price(x);
    if (!Number.isFinite(p))
      return alert(
        "Cotação atual indisponível. Aguarde a atualização do preço.",
      );
    let now = Date.now();
    ops.push({
      id: `${m}:${a}:${now}`,
      market: m,
      asset: a,
      dir: d.dir === "SELL" ? "SELL" : "BUY",
      entry: p,
      lastPrice: p,
      entryAt: now,
      entryMotors: motors,
      peakMotors: motors,
      entryScore: +d.score || 0,
      entryGate: +g?.score || 0,
      maxGate: +g?.score || 0,
      lastMotors: motors,
      lastTs: now,
      durations: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      best: 0,
      worst: 0,
    });
    save();
    let root = $("#liveOperations");
    if (root) root.dataset.sig = "";
    rebuild();
    refreshFields();
    window.dispatchEvent(new CustomEvent("live-operations-changed"));
    return ops.at(-1);
  }
  function close(id) {
    let i = ops.findIndex((o) => o.id === id);
    if (i < 0) return;
    let o = ops[i];
    // Resposta visual imediata: retira o cartão antes de qualquer cálculo auxiliar.
    let cardEl = [...document.querySelectorAll("[data-op]")].find((node) => node.dataset.op === id);
    if (cardEl) cardEl.remove();
    ops.splice(i, 1);
    let count = $("#lopCount");
    if (count) count.textContent = `${ops.length} aberta${ops.length === 1 ? "" : "s"}`;
    let root = $("#liveOperations");
    if (root) {
      root.dataset.sig = ops.map((z) => `${z.id}:${z.asset}:${z.market}`).join("|");
      if (!ops.length) root.innerHTML = '<div class="ep24-empty">Nenhuma operação em acompanhamento. Selecione um ativo acima para iniciar.</div>';
    }
    window.dispatchEvent(new CustomEvent("live-operations-changed"));
    // Arquivamento/cálculo após a interface responder.
    setTimeout(() => {
      let x = data(o.market, o.asset), p = price(x);
      if (!Number.isFinite(p)) p = o.lastPrice;
      hist.push({ ...o, exit: p, exitAt: Date.now(), result: pnl(o, p) });
      save();
    }, 0);
  }
  let tickCursor = 0;
  function tick() {
    if (!ops.length) return;
    let now = Date.now(), o = ops[tickCursor % ops.length];
    tickCursor = (tickCursor + 1) % Math.max(1, ops.length);
    let x = data(o.market, o.asset),
      p = price(x);
    // Falta temporária de dados nunca zera nem substitui o último estado válido.
    if (!x || !Number.isFinite(p)) { refreshFields(); return; }
    let a = calc(o.market, x);
    if (!a) { refreshFields(); return; }
    let g = gate(o.market, x),
      dt = Math.min(15000, Math.max(0, now - (o.lastTs || now))),
      lm = +o.lastMotors || 0;
    if (lm >= 1 && lm <= 5) o.durations[lm] = (o.durations[lm] || 0) + dt;
    o.lastTs = now;
    o.lastPrice = p;
    o.lastMotors = +a.motorAgree || 0;
    o.peakMotors = Math.max(+o.peakMotors || 0, o.lastMotors);
    o.maxGate = Math.max(+o.maxGate || 0, +g?.score || 0);
    let r = pnl(o, p);
    if (Number.isFinite(r)) {
      o.best = Math.max(+o.best || 0, r);
      o.worst = Math.min(+o.worst || 0, r);
    }
    save();
    refreshFields();
  }
  function init() {
    ensure();
    rebuild();
    refreshFields();
    window.dispatchEvent(new CustomEvent("live-operations-ready"));
    setInterval(() => {
      if (!document.hidden) tick();
    }, 2000);
  }
  setTimeout(init, 1500);
  window.EPLiveOperations = {
    add,
    close,
    get: () => ops,
    history: () => hist,
    render: refreshFields,
  };
})();
