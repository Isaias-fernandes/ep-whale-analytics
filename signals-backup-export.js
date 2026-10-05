(() => {
  'use strict';
  const PROJECT = "ep-analitico";
  const STORAGE_KEYS = [
  "ep_backtest_runs",
  "ep_closed_signal_archive_v1",
  "ep_closed_signal_archive_v2",
  "ep_closed_signal_runtime_v1",
  "ep_closed_signal_runtime_v2",
  "ep_early_leg_events_v2",
  "ep_early_leg_observer_v1",
  "ep_early_leg_observer_v2",
  "ep_h1_exit_locked",
  "ep_h1_exit_oos",
  "ep_h1x_frozen",
  "ep_h1x_oos",
  "ep_leg_cycle_events_v1",
  "ep_leg_cycle_lab_v1",
  "ep_live_operations_dismissed_v1",
  "ep_live_operations_history_v1",
  "ep_live_operations_selected_crypto",
  "ep_live_operations_v1",
  "ep_m6_fundamental_check_v1",
  "ep_macd_experimental_observer_v1",
  "ep_macro_context_v1",
  "ep_motor6_watch_cooldown_v1",
  "ep_motor6_watch_dismissed_v1",
  "ep_motor6_watch_history_v1",
  "ep_motor6_watch_v1",
  "ep_motor_price_evolution_v1",
  "ep_motor_price_evolution_v2",
  "ep_paper",
  "ep_prospective_comparison_v1",
  "ep_retest_observer_v1",
  "ep_reversal_gate_history_v1",
  "ep_signal_audit_v1",
  "ep_signal_price_episodes_v1",
  "ep_signal_stats_archive_v1",
  "ep_signal_stats_state_v2",
  "ep_signal_stats_v2",
  "ep_signal_watch_v2"
];
  const RETENTION_NOTE = "O backup inclui apenas registros ainda presentes no navegador; os limites existentes dos motores continuam valendo.";
  const countRows = value => {
    if (Array.isArray(value)) return value.length;
    if (!value || typeof value !== 'object') return 1;
    for (const name of ['records', 'events', 'history', 'closed', 'signals']) {
      if (Array.isArray(value[name])) return value[name].length;
    }
    for (const name of ['items', 'open']) {
      if (value[name] && typeof value[name] === 'object') return Object.keys(value[name]).length;
    }
    return Object.keys(value).length;
  };
  function exportBackup() {
    const stored = {};
    const inventory = [];
    let bytesApprox = 0;
    for (const key of STORAGE_KEYS) {
      let raw;
      try { raw = localStorage.getItem(key); } catch (_) { continue; }
      if (raw == null) continue;
      bytesApprox += raw.length * 2;
      let value = raw;
      try { value = JSON.parse(raw); } catch (_) {}
      stored[key] = value;
      inventory.push({ key, approxBytes: raw.length * 2, records: countRows(value) });
    }
    const exportedAt = new Date().toISOString();
    const payload = {
      format: 'ep-signals-backup',
      version: 1,
      project: PROJECT,
      exportedAt,
      scope: 'Dados locais deste projeto e desta origem/navegador',
      inventory: { keysWithData: inventory.length, approxBytes, entries: inventory },
      retentionNote: RETENTION_NOTE,
      localStorage: stored
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const stamp = exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    link.href = url;
    link.download = PROJECT + '-sinais-backup-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const status = document.getElementById('epSignalsBackupStatus');
    if (status) status.textContent = inventory.length
      ? 'Backup baixado: ' + inventory.length + ' grupos de dados • ' + inventory.reduce((n, row) => n + row.records, 0) + ' registros/itens contabilizados.'
      : 'Backup baixado. Nenhuma chave de histórico deste projeto tinha dados salvos neste navegador.';
  }
  function init() {
    const main = document.querySelector('main');
    if (!main || document.getElementById('epSignalsBackupCard')) return;
    const section = document.createElement('section');
    section.id = 'epSignalsBackupCard';
    section.className = 'card';
    section.innerHTML = '<h2>BACKUP LOCAL DE TODOS OS SINAIS</h2>' +
      '<p class="sub">Baixa em um arquivo JSON os históricos e experimentos deste notebook que estão salvos neste navegador. O arquivo não apaga nem envia os dados.</p>' +
      '<button type="button" id="epSignalsBackupButton">Exportar todos os sinais</button>' +
      '<p id="epSignalsBackupStatus" class="sub" role="status" aria-live="polite">Inclui todos os grupos de dados locais reconhecidos por este projeto. ' + RETENTION_NOTE + '</p>';
    main.prepend(section);
    document.getElementById('epSignalsBackupButton').addEventListener('click', exportBackup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
