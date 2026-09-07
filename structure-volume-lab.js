/*
 * EVOLUÇÃO DE PREÇO POR CONFLUÊNCIA — 1M → 5M
 * CAMADA SOMENTE OBSERVACIONAL.
 * Não altera EPDecision, EPConfluence, score, sinais ou qualquer um dos 5 motores.
 * Este arquivo substitui visualmente o antigo Experimento separado — Caixote / Bandeira / OBV.
 */
(()=>{
  'use strict';
  const KEY='ep_motor_price_evolution_v1', LIMIT=120;
  const $=s=>document.querySelector(s), now=()=>Date.now();
  let db=load();

  function load(){
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||'null');
      return x&&typeof x==='object'?{open:x.open||{},closed:Array.isArray(x.closed)?x.closed:[]}:{open:{},closed:[]};
    }catch{return{open:{},closed:[]}}
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}}
  function id(asset,market){return market+':'+(asset.sym||asset.ticker||asset.key||'unknown')}
  function name(asset){return asset.sym||asset.ticker||asset.key||'unknown'}
  function price(asset){
    const p=+(asset?.livePrice??asset?.price??asset?.regularMarketPrice??asset?.candles?.at?.(-1)?.c);
    return Number.isFinite(p)&&p>0?p:NaN;
  }
  function pct(dir,p0,p1){
    if(!Number.isFinite(+p0)||!Number.isFinite(+p1)||!+p0)return NaN;
    let r=(+p1-+p0)/+p0*100;
    return dir==='SELL'?-r:r;
  }
  function fp(v){
    if(!Number.isFinite(+v))return'—';
    const n=+v,d=n<1?6:n<10?4:2;
    return n.toLocaleString('pt-BR',{maximumFractionDigits:d});
  }
  function pc(v){
    if(!Number.isFinite(+v))return'—';
    v=+v;return`${v>=0?'+':''}${v.toFixed(2).replace('.',',')}%`;
  }
  function elapsed(ts){
    if(!ts)return'—';
    let s=Math.max(0,Math.floor((now()-ts)/1000)),m=Math.floor(s/60),h=Math.floor(m/60);
    return h?`${h}h ${m%60}m`:`${m}m ${s%60}s`;
  }
  function stage(e,n){
    const s=e.stages?.[n];
    if(!s)return'<span class="mpe-empty">—</span>';
    const varTxt=n===1?'INÍCIO':pc(pct(e.dir,e.startPrice,s.price));
    return`<b>${fp(s.price)}</b><small>${varTxt}</small>`;
  }
  function start(asset,market,d,n,p,ts){
    const k=id(asset,market),e={
      id:`${k}:${ts}`,market,asset:name(asset),dir:d.dir,startTs:ts,startPrice:p,startMotors:n,
      currentPrice:p,currentMotors:n,peakMotors:n,stages:{},events:[]
    };
    e.stages[n]={price:p,ts};
    e.events.push({ts,motors:n,price:p,score:d.score||0});
    db.open[k]=e;
  }
  function close(k,e,p,n,ts,reason){
    e.currentPrice=p;e.currentMotors=n;e.endTs=ts;e.finalPrice=p;
    e.finalReturn=pct(e.dir,e.startPrice,p);e.reason=reason;
    delete db.open[k];db.closed.unshift(e);db.closed=db.closed.slice(0,LIMIT);
  }
  function update(asset,market){
    const d=window.EPDecision?.calc?.(asset,market);
    if(!d)return;
    const n=Math.max(0,Math.min(5,+d.motorAgree||0)),p=price(asset),k=id(asset,market),ts=now();
    if(!Number.isFinite(p))return;
    let e=db.open[k];
    const directional=d.dir==='BUY'||d.dir==='SELL';
    if(!e){if(n>=1&&directional)start(asset,market,d,n,p,ts);return}
    if(n>=1&&directional&&d.dir!==e.dir){close(k,e,p,n,ts,'virada de direção');start(asset,market,d,n,p,ts);return}
    e.currentPrice=p;e.currentMotors=n;e.peakMotors=Math.max(e.peakMotors||0,n);
    if(n>=1&&!e.stages[n])e.stages[n]={price:p,ts};
    const prev=e.events?.at?.(-1);
    if(!prev||prev.motors!==n){e.events=e.events||[];e.events.push({ts,motors:n,price:p,score:d.score||0});e.events=e.events.slice(-30)}
    if(n===0||!directional)close(k,e,p,n,ts,'fim da confluência');
  }
  function ensureCss(){
    if($('#mpeStyle'))return;
    const st=document.createElement('style');st.id='mpeStyle';st.textContent=`
      #motorPriceEvolutionSection{border:1px solid #274e73;background:linear-gradient(180deg,#0a1c2d,#081522);box-shadow:0 0 0 1px #0b2a43 inset}
      .mpe-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .mpe-badge{border:1px solid #2a8b67;color:#72e6b5;background:#0b3028;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700}
      .mpe-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
      .mpe-summary span{background:#091827;border:1px solid #29415e;border-radius:8px;padding:7px 9px}
      .mpe-wrap{overflow:auto}
      .mpe-table{width:100%;min-width:1200px;border-collapse:collapse}
      .mpe-table th,.mpe-table td{padding:9px 8px;border-bottom:1px solid #20334a;text-align:left;vertical-align:top}
      .mpe-table th{background:#091827;color:#bdd4eb;position:sticky;top:0}
      .mpe-table small{display:block;color:#8fa7c2;margin-top:3px}
      .mpe-pos{color:#67e8a5}.mpe-neg{color:#ff8f9a}.mpe-empty{color:#61778b}
      .mpe-note{margin-top:9px;color:#9db0c5;font-size:12px}
    `;document.head.appendChild(st);
  }
  function ensure(){
    ensureCss();
    if($('#motorPriceEvolutionSection'))return;
    const host=document.querySelector('main');if(!host)return;
    const sec=document.createElement('section');sec.className='card';sec.id='motorPriceEvolutionSection';
    sec.innerHTML=`<div class="mpe-head"><div><h2>EVOLUÇÃO DE PREÇO POR CONFLUÊNCIA — 1M → 5M</h2><p class="sub"><b>Somente observacional.</b> Registra o primeiro preço visto quando o ativo atinge 1, 2, 3, 4 e 5 motores. Não altera score, decisão, confirmação ou a natureza dos 5 motores.</p></div><span class="mpe-badge">5 MOTORES INTACTOS</span></div><div id="motorPriceEvolution">Aguardando dados...</div>`;
    const central=$('#decisionCenter')?.closest('section.card');
    if(central)central.before(sec);else host.prepend(sec);
  }
  function row(e){
    const cur=pct(e.dir,e.startPrice,e.currentPrice),closed=!!e.endTs;
    return`<tr><td><b>${e.asset}</b><small>${e.market==='crypto'?'CRIPTO':'B3'} • ${e.dir==='BUY'?'COMPRA':'VENDA'}${closed?' • ENCERRADO':''}</small></td><td>${stage(e,1)}</td><td>${stage(e,2)}</td><td>${stage(e,3)}</td><td>${stage(e,4)}</td><td>${stage(e,5)}</td><td><b>${e.peakMotors}/5</b></td><td><b>${e.currentMotors}/5</b><small>${fp(e.currentPrice)}</small></td><td class="${cur>=0?'mpe-pos':'mpe-neg'}"><b>${pc(cur)}</b></td><td>${elapsed(e.startTs)}</td></tr>`;
  }
  function render(){
    ensure();const root=$('#motorPriceEvolution');if(!root)return;
    const open=Object.values(db.open).sort((a,b)=>(b.peakMotors-a.peakMotors)||(b.startTs-a.startTs));
    const recent=db.closed.slice(0,15),list=[...open,...recent].slice(0,30);
    root.innerHTML=`<div class="mpe-summary"><span><b>1M+ em acompanhamento:</b> ${open.length}</span><span><b>Episódios encerrados:</b> ${db.closed.length}</span><span><b>Regra:</b> congela o primeiro preço de cada estágio</span></div><div class="mpe-wrap"><table class="mpe-table"><thead><tr><th>Ativo</th><th>1 Motor</th><th>2 Motores</th><th>3 Motores</th><th>4 Motores</th><th>5 Motores</th><th>Pico</th><th>Atual</th><th>Var. desde 1M</th><th>Tempo</th></tr></thead><tbody>${list.length?list.map(row).join(''):'<tr><td colspan="10">Aguardando o primeiro ativo atingir 1 motor na mesma direção do sinal.</td></tr>'}</tbody></table></div><div class="mpe-note">A variação é calculada na direção do sinal desde o preço de 1M. Cada estágio registra somente a primeira passagem. Esta camada observa os motores; não participa da decisão.</div>`;
  }
  function scan(){
    window.CryptoApp?.getData?.()?.forEach?.(x=>update(x,'crypto'));
    window.B3App?.getData?.()?.forEach?.(x=>update(x,'b3'));
    save();render();
  }
  window.addEventListener('crypto-data-updated',scan);
  window.addEventListener('b3-data-updated',scan);
  window.addEventListener('mtf-updated',scan);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();setTimeout(scan,2600)});else{ensure();setTimeout(scan,2600)}
  setInterval(()=>{if(!document.hidden)scan()},10000);
  window.EPMotorPriceEvolution={scan,get:()=>db};
})();