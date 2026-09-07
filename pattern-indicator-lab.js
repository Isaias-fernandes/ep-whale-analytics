/*
 * O antigo TESTE DE INDICADORES + PADROES foi transferido para o laboratorio isolado.
 * Este slot agora carrega SOMENTE a camada observacional de evolucao de preco 1M -> 5M.
 * Nao altera EPDecision, EPConfluence, score, regras ou qualquer um dos 5 motores.
 */
(()=>{
  if(window.EPMotorPriceEvolution)return;
  const s=document.createElement('script');
  s.src='motor-price-evolution.js?v=1';
  s.defer=true;
  s.dataset.motorPriceEvolution='1';
  document.head.appendChild(s);
})();