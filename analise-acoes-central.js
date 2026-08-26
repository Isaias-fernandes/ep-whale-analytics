(()=>{
  const $=s=>document.querySelector(s);
  const fmt=n=>Number.isFinite(+n)?Math.round(+n):'—';
  let focoB3=null;

  function fundamentosSalvos(ticker){
    try{return JSON.parse(localStorage.getItem('ep_fundamentos_'+ticker)||'{}')||{};}catch{return {};}
  }

  function ativoCentral(){
    const cards=$('#decisionCenter')?.querySelectorAll('.decision-card');
    const card=cards?.[1];
    if(!card)return null;
    const ticker=(card.querySelector('.central-auto-head>b')?.textContent||'').trim();
    return ticker||focoB3||null;
  }

  function cor(n){return n>=75?'#49d58c':n>=60?'#f3c969':n>=45?'#f0a45d':'#ff7b7b';}

  function linha(nome,b){
    const n=b?.nota;
    return `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0"><span>${nome}</span><b style="color:${Number.isFinite(+n)?cor(+n):'#93a8b8'}">${Number.isFinite(+n)?fmt(n)+'/100':'AGUARDANDO DADOS'}</b></div>`;
  }

  function htmlAnalise(r){
    if(!r)return'';
    const parcial=r.cobertura<100;
    const nota=Number.isFinite(+r.notaIntegrada)?fmt(r.notaIntegrada):'—';
    return `<div data-analise-acoes-central="1" style="margin-top:10px;border:1px solid #31556c;border-radius:10px;padding:10px;background:rgba(7,25,37,.72)">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px"><b>📊 ANÁLISE INTEGRADA DE AÇÕES</b><span style="font-size:11px;border:1px solid #31556c;border-radius:999px;padding:3px 7px">ISOLADA • NÃO ALTERA MOTORES</span></div>
      <div style="display:flex;justify-content:space-between;align-items:end;gap:8px;margin-bottom:6px"><span><b>Nota integrada:</b> <span style="color:${Number.isFinite(+r.notaIntegrada)?cor(+r.notaIntegrada):'#93a8b8'}">${nota}/100</span></span><small>Cobertura ${r.cobertura}%${parcial?' • análise parcial':''}</small></div>
      ${linha('Qualidade da Empresa',r.blocos?.['Qualidade da Empresa'])}
      ${linha('Preço Justo e Valuation',r.blocos?.['Preço Justo e Valuation'])}
      ${linha('Tendência e Força Técnica',r.blocos?.['Tendência e Força Técnica'])}
      ${linha('Confirmação por Volume',r.blocos?.['Confirmação por Volume'])}
      ${linha('Qualidade da Entrada',r.blocos?.['Qualidade da Entrada'])}
      <div style="margin-top:7px"><b>${r.classificacao}</b></div>
      ${r.alertas?.length?`<div style="margin-top:5px;font-size:12px">⚠ ${r.alertas.join(' • ')}</div>`:''}
      ${parcial?'<div style="margin-top:5px;font-size:11px;color:#9fb6c6">Fundamentos/valuation entram somente quando houver dados confiáveis; até lá a nota não interfere no sinal técnico.</div>':''}
    </div>`;
  }

  function render(){
    const api=window.EPAnaliseIntegradaAcoes;
    const map=window.B3App?.getData?.();
    const ticker=ativoCentral();
    if(!api?.analisar||!map?.get||!ticker)return;
    const x=map.get(ticker);
    if(!x)return;
    const r=api.analisar(x,fundamentosSalvos(ticker));
    const cards=$('#decisionCenter')?.querySelectorAll('.decision-card');
    const card=cards?.[1];
    if(!card)return;
    card.querySelector('[data-analise-acoes-central]')?.remove();
    card.insertAdjacentHTML('beforeend',htmlAnalise(r));
  }

  function iniciar(){
    if(!window.EPAnaliseIntegradaAcoes)return setTimeout(iniciar,250);
    render();
    window.addEventListener('b3-data-updated',()=>setTimeout(render,50));
    window.addEventListener('ep-central-focus',e=>{if(e.detail?.market==='b3'){focoB3=e.detail.asset;setTimeout(render,80);}});
    const dc=$('#decisionCenter');
    if(dc)new MutationObserver(()=>setTimeout(render,0)).observe(dc,{childList:true,subtree:false});
    setInterval(()=>{if(!document.hidden)render()},5000);
    window.EPAnaliseAcoesCentral={render,versao:'1.0.0-isolada',somenteAcoes:true,alteraMotores:false};
  }
  setTimeout(iniciar,900);
})();