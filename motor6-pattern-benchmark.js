/*
 * REFERÊNCIA EXPERIMENTAL DOS PADRÕES DO MOTOR 6.
 * Exibe resultados congelados do laboratório H1 como contexto de pesquisa.
 * Não consulta APIs, não grava dados e não altera score, gates ou sinais.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.EPMotor6PatternBenchmark = api;
    if (root.document) {
      const mount = () => api.mount(root.document);
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount, { once: true });
      else mount();
    }
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const study = Object.freeze({
    version: 'structural-detectors-v1',
    generatedAt: '2026-10-07T17:03:18.127Z',
    market: 'CRIPTO',
    assetsTested: 50,
    totalSignals: 3936,
    timeframe: 'H1',
    contextCandles: 96,
    horizonCandles: 96,
    minimumScore: 80,
    sourceUrl: 'https://github.com/Isaias-fernandes/ep-laboratorio-caixote-obv/blob/main/data/backtest-structural-patterns-v1.json'
  });

  const patterns = Object.freeze([
    { name: 'Three Rising Valleys', direction: 'BUY', signals: 747, mfe: 13.685, mae: -4.825, retest: 68.0, obv: 90.8, hit5: 67.3, hit10: 46.3, hit20: 24.5, hit30: 11.5, hit50: 2.3 },
    { name: 'Rectangle / Trading Range', direction: 'BUY', signals: 459, mfe: 12.524, mae: -3.913, retest: 63.8, obv: 97.8, hit5: 57.7, hit10: 38.3, hit20: 21.4, hit30: 13.1, hit50: 2.4 },
    { name: 'Double Bottom', direction: 'BUY', signals: 201, mfe: 12.863, mae: -4.454, retest: 64.2, obv: 91.0, hit5: 60.7, hit10: 40.8, hit20: 23.4, hit30: 14.9, hit50: 2.0 },
    { name: 'Bull Pennant', direction: 'BUY', signals: 38, mfe: 16.742, mae: -5.924, retest: 34.2, obv: 97.4, hit5: 68.4, hit10: 52.6, hit20: 42.1, hit30: 18.4, hit50: 7.9 },
    { name: 'Bull Flag', direction: 'BUY', signals: 34, mfe: 13.326, mae: -6.440, retest: 8.8, obv: 100.0, hit5: 76.5, hit10: 41.2, hit20: 26.5, hit30: 11.8, hit50: 2.9 }
  ]);

  const pct = value => Number(value).toFixed(1) + '%';
  const pricePct = value => (value > 0 ? '+' : '') + Number(value).toFixed(2) + '%';

  function renderHtml() {
    const rows = patterns.map(p => '<tr><td><b>' + p.name + '</b></td><td>' + p.signals + '</td><td>' + pricePct(p.mfe) + ' / ' + pricePct(p.mae) + '</td><td>' + pct(p.hit10) + '</td><td>' + pct(p.hit20) + '</td><td>' + pct(p.retest) + '</td><td>' + pct(p.obv) + '</td></tr>').join('');
    return '<div class="m6pb-card" id="m6PatternBacktestReference">' +
      '<div class="m6pb-title"><h3>📊 PADRÕES DO MOTOR 6 — REFERÊNCIA EXPERIMENTAL H1</h3><span>SEM ALTERAÇÃO DE SCORE</span></div>' +
      '<p class="m6pb-note">EP Laboratório · 50 criptoativos · ' + study.totalSignals.toLocaleString('pt-BR') + ' sinais · contexto H1 ' + study.contextCandles + ' candles · horizonte ' + study.horizonCandles + ' candles · score mínimo ' + study.minimumScore + ' · atualização 07/10/2026 17:03 UTC.</p>' +
      '<div class="m6pb-table-wrap"><table><thead><tr><th>Padrão de compra</th><th>Amostra</th><th>MFE / MAE médio</th><th>Alvo +10%</th><th>Alvo +20%</th><th>Reteste</th><th>OBV</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="m6pb-note"><b>Leitura:</b> Three Rising Valleys, Rectangle e Double Bottom têm as maiores amostras e retestes mais frequentes. Bull Pennant tem os melhores alcances, mas só 38 casos; Bull Flag teve reteste em 8,8%.</p>' +
      '<p class="m6pb-caution"><b>Limite:</b> referência de backtest, não expectativa de lucro. MFE/MAE cobre a janela inteira e não mede ordem entre alvo e perda; não há walk-forward 70/30, stop, taxas ou slippage. Venda não mostrou a mesma força: Three Falling Peaks, 494 sinais, 15,2% chegaram a +10%, MFE +5,44% e MAE −8,58%.</p>' +
      '<p class="m6pb-note">Esta tabela é informativa: não muda o score técnico, o filtro de qualidade, os gates, nem os cinco motores oficiais; não reclassifica sinais existentes. <a href="' + study.sourceUrl + '" target="_blank" rel="noopener noreferrer">Abrir resultado completo</a>.</p>' +
      '</div>';
  }

  function mount(doc) {
    if (!doc || doc.getElementById('m6PatternBacktestReference')) return false;
    const section = doc.getElementById('motor6WatchSection');
    if (!section) return false;
    const style = doc.createElement('style');
    style.textContent = '.m6pb-card{margin-top:14px;padding:12px;border:1px solid #315a72;border-radius:12px;background:#081a29}.m6pb-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.m6pb-title h3{margin:0}.m6pb-title span{font-size:10px;color:#7ff0c7}.m6pb-note,.m6pb-caution{font-size:12px;line-height:1.45;color:#9db0c5}.m6pb-caution{color:#ffd06c}.m6pb-table-wrap{overflow:auto}.m6pb-table-wrap table{width:100%;min-width:760px;border-collapse:collapse}.m6pb-table-wrap th,.m6pb-table-wrap td{padding:7px;border-bottom:1px solid #20334a;text-align:left;font-size:12px}.m6pb-table-wrap a{color:#8bc8ff}';
    section.appendChild(style);
    const card = doc.createElement('div');
    card.innerHTML = renderHtml();
    section.appendChild(card.firstElementChild);
    return true;
  }

  return { study, patterns, renderHtml, mount };
});
