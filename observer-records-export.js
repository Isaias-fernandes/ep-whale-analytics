/* Exportação somente em leitura dos dois observadores locais. */
(() => {
  "use strict";
  const specs = {
    earlyLeg: { key: "ep_early_leg_observer_v1", api: "EPEarlyLegObserver", label: "Início de Pernada" },
    motorEvolution: { key: "ep_motor_price_evolution_v1", api: "EPMotorPriceEvolution", label: "Evolução por Confluência" }
  };
  function read(spec) {
    let raw = null, data = null, source = "ausente", warnings = [];
    try { raw = localStorage.getItem(spec.key); }
    catch (_) { warnings.push("Armazenamento local indisponível."); }
    try {
      const current = window[spec.api]?.get?.();
      if (current && typeof current === "object") {
        data = JSON.parse(JSON.stringify(current));
        source = "memória do observador";
      }
    } catch (_) { warnings.push("Não foi possível ler o estado em memória."); }
    if (!data && raw !== null) {
      try { data = JSON.parse(raw); source = "armazenamento local"; }
      catch (_) { warnings.push("JSON armazenado inválido; conteúdo original preservado."); }
    }
    if (!data && raw === null) warnings.push("Nenhum registro disponível neste navegador.");
    const open = data?.open && typeof data.open === "object" ? Object.keys(data.open).length : 0;
    const closed = Array.isArray(data?.closed) ? data.closed.length : 0;
    return { label: spec.label, storageKey: spec.key, source, counts: { open, closed },
      data, savedJson: raw, warnings };
  }
  function build(selection) {
    const keys = selection === "all" ? Object.keys(specs) : [selection];
    if (keys.some(key => !specs[key])) throw Error("Observador inválido.");
    return { schemaVersion: 1, exportedAt: new Date().toISOString(),
      project: "ep-whale-analytics",
      notes: [
        "1M a 5M representam quantidade de motores, não minutos.",
        "Inclui todos os episódios disponíveis, sem o limite de linhas da tela.",
        "Os dois observadores podem acompanhar o mesmo movimento; não somar como oportunidades únicas.",
        "savedJson preserva o conteúdo salvo. data contém o estado em memória, quando disponível.",
        "Exportação preserva a coleta original e suas limitações; não corrige resultados históricos."
      ],
      observers: Object.fromEntries(keys.map(key => [key, read(specs[key])])) };
  }
  function download(selection) {
    const status = document.getElementById("observerExportStatus");
    let url = null, anchor = null;
    try {
      const payload = build(selection);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "ep-observadores-" + selection + "-" + payload.exportedAt.replace(/[:.]/g, "-") + ".json";
      document.body.appendChild(anchor);
      anchor.click();
      const totals = Object.values(payload.observers);
      status.textContent = "Download solicitado: " + totals.reduce((s,r) => s+r.counts.open, 0) +
        " episódios ativos e " + totals.reduce((s,r) => s+r.counts.closed, 0) +
        " encerrados. " + totals.flatMap(r => r.warnings).join(" ") +
        " Os registros continuam no navegador.";
    } catch (_) { status.textContent = "Não foi possível preparar o download. Tente novamente."; }
    finally {
      if (anchor) anchor.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  document.querySelectorAll("[data-observer-export]").forEach(button => {
    button.addEventListener("click", () => download(button.dataset.observerExport));
  });
  window.EPObserverExport = { build };
})();
