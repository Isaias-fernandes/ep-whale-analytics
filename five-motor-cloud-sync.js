(() => {
  const API = "https://qhgclnkctpzumtybailv.supabase.co/functions/v1/ep-five-motor-user-watch";
  const TOKEN_KEY = "ep_five_motor_pair_code_v1";
  const CLOSED_KEY = "ep_five_motor_closed_sync_v1";
  let token = "";
  let busy = false;
  let wrapped = false;
  let timer = 0;

  function validToken(value) { return /^[A-Za-z0-9_-]{43}$/.test(String(value || "")); }
  function createToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let raw = "";
    bytes.forEach(b => raw += String.fromCharCode(b));
    return btoa(raw).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  function readToken() {
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (validToken(saved)) return saved;
      const fresh = createToken();
      localStorage.setItem(TOKEN_KEY, fresh);
      return fresh;
    } catch { return createToken(); }
  }
  function loadClosed() {
    try {
      const rows = JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]");
      return Array.isArray(rows) ? rows.filter(x => x && x.asset && x.status === "CLOSED") : [];
    } catch { return []; }
  }
  function saveClosed(rows) {
    try { localStorage.setItem(CLOSED_KEY, JSON.stringify(rows.slice(-50))); } catch {}
  }
  function asMillis(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.getTime() : Date.now();
  }
  function serialize(o, status = "OPEN") {
    return {
      asset: String(o.asset || "").toUpperCase(),
      market: "crypto",
      status,
      direction: o.dir === "SELL" ? "SELL" : "BUY",
      entry: +o.entry,
      entryAt: +o.entryAt || Date.now(),
      entryMotors: +o.entryMotors || 0,
      peakMotors: +o.peakMotors || 0,
      entryScore: +o.entryScore || 0,
      entryGate: +o.entryGate || 0,
      maxGate: +o.maxGate || 0,
      lastPrice: +o.lastPrice || +o.entry,
      lastMotors: +o.lastMotors || 0,
      best: +o.best || 0,
      worst: +o.worst || 0,
      durations: o.durations || {},
      closedAt: status === "CLOSED" ? (+o.closedAt || Date.now()) : null,
      exitPrice: status === "CLOSED" ? (+o.exitPrice || +o.lastPrice || +o.entry) : null,
      result: status === "CLOSED" ? (+o.result || 0) : null
    };
  }
  function rowToOperation(r) {
    const entryAt = asMillis(r.entry_at);
    return {
      id: `crypto:${r.asset}:${entryAt}`,
      market: "crypto",
      asset: r.asset,
      dir: r.direction === "SELL" ? "SELL" : "BUY",
      entry: +r.entry_price,
      lastPrice: +(r.last_price || r.entry_price),
      entryAt,
      entryMotors: +r.entry_motors || 0,
      peakMotors: +r.peak_motors || 0,
      entryScore: +r.entry_score || 0,
      entryGate: +r.entry_gate || 0,
      maxGate: +r.max_gate || 0,
      lastMotors: +r.last_motors || 0,
      lastTs: Date.now(),
      durations: r.durations || {},
      best: +r.best_pct || 0,
      worst: +r.worst_pct || 0,
      cloudUpdatedAt: asMillis(r.updated_at),
      remoteManaged: true
    };
  }
  function setStatus(message, error = false) {
    const el = document.getElementById("lopSyncStatus");
    if (!el) return;
    el.textContent = message;
    el.style.color = error ? "#ff9caa" : "";
  }
  function setupPanel() {
    const section = document.getElementById("liveOperationsSection");
    if (!section || document.getElementById("lopCloudSync")) return;
    const box = document.createElement("div");
    box.id = "lopCloudSync";
    box.className = "lop-cell";
    box.style.cssText = "display:grid;gap:8px;margin:8px 0 12px";
    box.innerHTML = '<b>Sincronização privada entre aparelhos</b><small class="sub">Copie o código do aparelho principal e vincule aqui no outro. O código é privado e dá acesso apenas à sua lista manual.</small><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="lopCopyPairCode" class="lop-btn" type="button">Copiar código deste aparelho</button><input id="lopPairCodeInput" class="lop-btn" type="password" inputmode="text" autocomplete="off" maxlength="43" placeholder="Cole o código do outro aparelho" style="min-width:220px"><button id="lopUsePairCode" class="lop-btn" type="button">Vincular aparelho</button></div><small id="lopSyncStatus" class="sub" role="status" aria-live="polite"></small>';
    const header = section.querySelector(".ep24-head");
    if (header) header.insertAdjacentElement("afterend", box);
    else section.insertAdjacentElement("afterbegin", box);

    document.getElementById("lopCopyPairCode").onclick = async () => {
      try {
        await navigator.clipboard.writeText(token);
        setStatus("Código copiado. No outro aparelho, cole no campo e toque em “Vincular aparelho”.");
      } catch {
        const input = document.getElementById("lopPairCodeInput");
        input.value = token;
        input.type = "text";
        input.select();
        setStatus("Copie o código exibido no campo e cole no outro aparelho.");
      }
    };
    document.getElementById("lopUsePairCode").onclick = async () => {
      const input = document.getElementById("lopPairCodeInput");
      const next = input.value.trim();
      if (!validToken(next)) return setStatus("Código inválido. Cole o código completo de 43 caracteres.", true);
      if (next !== token) {
        token = next;
        try { localStorage.setItem(TOKEN_KEY, token); } catch {}
        input.value = "";
        input.type = "password";
        setStatus("Aparelho vinculado. Carregando a lista sincronizada…");
        await sync();
      }
    };
    setStatus("Este aparelho tem um código próprio. Para compartilhar a lista, copie o código e vincule o outro aparelho.");
  }
  async function request(method, rows) {
    return fetch(API, {
      method,
      cache: "no-store",
      headers: { "x-ep-manual-token": token, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(method === "POST" ? { body: JSON.stringify({ rows }) } : {})
    });
  }
  function currentOperations() {
    return (window.EPLiveOperations?.get?.() || []).filter(o => !o.readOnlySeed && o.market === "crypto");
  }
  function pendingPayload() {
    const byAsset = new Map();
    for (const row of loadClosed()) byAsset.set(row.asset, row);
    for (const o of currentOperations()) {
      const row = serialize(o, "OPEN");
      const old = byAsset.get(row.asset);
      if (!old || asMillis(row.entryAt) >= asMillis(old.entryAt)) byAsset.set(row.asset, row);
    }
    return [...byAsset.values()];
  }
  function merge(rows) {
    const ops = window.EPLiveOperations?.get?.();
    if (!Array.isArray(ops)) return;
    let changed = false;
    const queued = loadClosed();
    for (const r of rows) {
      if (!r?.asset || r.market !== "crypto") continue;
      const ix = ops.findIndex(o => !o.readOnlySeed && o.market === "crypto" && o.asset === r.asset);
      if (r.status === "CLOSED") {
        const closedAt = asMillis(r.closed_at || r.updated_at);
        if (ix >= 0 && closedAt >= (+ops[ix].entryAt || 0)) {
          ops.splice(ix, 1);
          changed = true;
        }
        continue;
      }
      if (r.status !== "OPEN") continue;
      const pendingClose = queued.find(x => x.asset === r.asset);
      if (pendingClose && asMillis(pendingClose.closedAt) >= asMillis(r.updated_at)) continue;
      const remote = rowToOperation(r);
      if (ix < 0) {
        ops.push(remote);
        changed = true;
      } else if ((+ops[ix].entryAt || 0) <= remote.entryAt && remote.cloudUpdatedAt > (+ops[ix].cloudUpdatedAt || 0)) {
        ops[ix] = remote;
        changed = true;
      }
    }
    if (changed) window.EPLiveOperations.render?.();
  }
  async function sync() {
    if (busy || !validToken(token)) return;
    busy = true;
    try {
      const read = await request("GET");
      if (!read.ok) throw new Error("GET " + read.status);
      const data = await read.json();
      const rows = Array.isArray(data.rows) ? data.rows : [];
      merge(rows);
      const payload = pendingPayload();
      const write = await request("POST", payload);
      if (!write.ok) {
        const result = await write.json().catch(() => ({}));
        throw new Error(result.error || ("POST " + write.status));
      }
      saveClosed([]);
      setStatus(`Sincronizado • ${currentOperations().length}/10 ativos • atualizado ${new Date().toLocaleTimeString("pt-BR")}.`);
    } catch (err) {
      setStatus("Sem conexão com a sincronização. A lista local continua salva e tentarei novamente.", true);
    } finally { busy = false; }
  }
  function wrapOperations() {
    const api = window.EPLiveOperations;
    if (!api || wrapped) return false;
    wrapped = true;
    const originalAdd = api.add.bind(api);
    api.add = (...args) => {
      const result = originalAdd(...args);
      if (result && !result.readOnlySeed) setTimeout(sync, 0);
      return result;
    };
    const originalClose = api.close.bind(api);
    api.close = id => {
      const row = api.get().find(o => o.id === id && !o.readOnlySeed);
      if (row) {
        const closed = serialize({ ...row, closedAt: Date.now(), exitPrice: row.lastPrice, result: row.currentPnl || 0 }, "CLOSED");
        const queue = loadClosed().filter(x => x.asset !== closed.asset);
        queue.push(closed);
        saveClosed(queue);
      }
      originalClose(id);
      if (row) setTimeout(sync, 0);
    };
    return true;
  }
  function init() {
    setupPanel();
    if (!wrapOperations()) {
      timer = setTimeout(init, 150);
      return;
    }
    clearTimeout(timer);
    sync();
    setInterval(() => { if (!document.hidden) sync(); }, 60000);
  }
  token = readToken();
  window.addEventListener("live-operations-ready", init);
  setTimeout(init, 250);
})();
