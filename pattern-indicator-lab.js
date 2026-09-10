/*
 * O antigo TESTE DE INDICADORES + PADROES foi transferido para o laboratorio isolado.
 * Este slot carrega SOMENTE camadas observacionais.
 * Nao altera EPDecision, EPConfluence, score, regras ou qualquer um dos 5 motores.
 */
(()=>{
  const load=(src,key)=>{
    if(document.querySelector(`script[data-${key}]`))return;
    const s=document.createElement('script');
    s.src=src;
    s.defer=true;
    s.dataset[key]='1';
    document.head.appendChild(s);
  };
  if(!window.EPMotorPriceEvolution)load('motor-price-evolution.js?v=1','motorPriceEvolution');
  if(!window.EPMacdExperimentalObserver)load('macd-experimental-observer.js?v=1','macdExperimentalObserver');
})();