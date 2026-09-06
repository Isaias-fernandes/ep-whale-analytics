(() => {
  const HISTORY_KEY = "ep_reversal_gate_history_v1",
    $ = (s) => document.querySelector(s);
  function keyText(x) {
    return String(x || "")
      .replace("/", "")
      .toUpperCase();
  }
  function apply() {
    let root = $("#ep24Closed"),
      db = window.EPPriceTracker?.get?.();
    if (!root || !db) return;
    let closed = db.closed || [],
      history = {};
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}") || {};
    } catch {}
    root.querySelectorAll(".ep24-item").forEach((card) => {
      let asset = keyText(card.querySelector(".ep24-asset b")?.textContent),
        signal = closed.find((e) => keyText(e.asset) === asset),
        row = signal ? history[signal.id] : null;
      if (!signal || (!row && !Number.isFinite(+signal.reversalGateEntry))) return;
      let old = card.querySelector(".rgate-history");
      if (!old) {
        old = document.createElement("div");
        old.className = "rgate-history";
        old.style.cssText =
          "font-size:11px;padding:6px 8px;border-radius:8px;background:#0c2436;border:1px solid #21445e";
        card.appendChild(old);
      }
      let a = +(row?.entry ?? signal.reversalGateEntry) || 0,
        m = +(row?.max ?? signal.reversalGateMax) || a,
        ico = (x) =>
          x >= 85
            ? "🟣"
            : x >= 70
              ? "🔴"
              : x >= 50
                ? "🟠"
                : x >= 30
                  ? "🟡"
                  : "🟢";
      old.innerHTML = `<small>REVERSAL GATE</small><b>${ico(a)} entrada ${a}/100</b><small>máximo ${ico(m)} ${m}/100</small>`;
    });
  }
  setTimeout(() => {
    apply();
    setInterval(() => {
      if (!document.hidden) apply();
    }, 7000);
  }, 3000);
})();
