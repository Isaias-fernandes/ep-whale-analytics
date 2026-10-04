/* Motor 7: observação transitória das mínimas e reversão inicial.
 * Não altera os 5 motores nem o Motor 6. Não usa localStorage, Supabase ou histórico.
 */
(()=>{'use strict';
 const root=document.getElementById('motor7MinimumPanel');
 if(!root)return;
 const MINS=[['24h',24],['7d',168],['14d',336],['30d',720]];
 const api='https://data-api.binance.vision/api/v3/klines';
 const fmt=(n,d=6)=>Number.isFinite(+n)?(+n).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
 const pct=(v,d=2)=>Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
 let results=[],watching=new Set(),busy=false,lastRun=0,scanId=0;
 root.innerHTML=`
  <div class="m7-controls">
   <label>Distância máxima da mínima<select id="m7Tolerance"><option value="0.25">0,25%</option><option value="0.5" selected>0,50%</option><option value="1">1,00%</option></select></label>
   <button id="m7Scan" type="button" style="width:auto">Atualizar mínimas</button>
   <span id="m7Status" class="m7-status" role="status" aria-live="polite">Aguardando atualização.</span>
  </div>
  <div id="m7Summary" class="m7-summary"></div>
  <h3>Central de interpretação</h3><div id="m7Signals"></div>
  <h3>Monitoramento selecionado <span id="m7WatchCount" class="sub"></span></h3><div id="m7Watching"></div>
  <p class="sub">As mínimas de 7d, 14d e 30d são calculadas pelas mínimas das velas de 1h. Não são sinais de entrada nem previsão de fundo. A varredura atualiza a leitura, sem manter registros anteriores.</p>`;
 const el=id=>document.getElementById(id);
 const status=(s)=>{if(el('m7Status'))el('m7Status').textContent=s};
 const dataMap=()=>window.CryptoApp?.getData?.();
 const pairs=()=>window.CryptoApp?.getPairs?.()||[];
 function candlePatterns(c){
  if(c.length<3)return[];
  const a=c.at(-2),b=c.at(-1),body=Math.abs(b.c-b.o),range=Math.max(b.h-b.l,1e-12),lower=Math.min(b.o,b.c)-b.l,upper=b.h-Math.max(b.o,b.c),out=[];
  if(a.c<a.o&&b.c>b.o&&b.o<=a.c&&b.c>=a.o)out.push('Engolfo comprador');
  if(b.c>b.o&&lower>=Math.max(body*2,range*.45)&&upper<=Math.max(body*.7,range*.12))out.push('Martelo comprador');
  if(c.length>=3){const p=c.at(-3),m=c.at(-2),last=b,mid=(p.o+p.c)/2,small=Math.abs(m.c-m.o)<=Math.abs(p.c-p.o)*.55;
   if(p.c<p.o&&small&&last.c>last.o&&last.c>=mid)out.push('Estrela da manhã (em formação)');
  }
  if(body/range<=.1)out.push('Doji (neutro)');
  return out;
 }
 function calculateRsi(c){
  if(c.length<16)return null;
  const values=c.map(x=>x.c);
  function rsi(v){let g=0,l=0;for(let i=1;i<=14;i++){let d=v[i]-v[i-1];g+=Math.max(d,0)/14;l+=Math.max(-d,0)/14}
   for(let i=15;i<v.length;i++){let d=v[i]-v[i-1];g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14}
   return l===0?100:100-100/(1+g/l);
  }
  return {now:rsi(values),previous:rsi(values.slice(0,-1))};
 }
 function windowLow(c,hrs,now){
  const cut=now-hrs*3600000;
  const selected=c.filter(x=>x.t+3600000>cut&&x.t<=now);
  if(!selected.length)return null;
  const oldest=selected[0].t;
  if(hrs>=720&&oldest>cut+2*3600000)return null;
  return {low:Math.min(...selected.map(x=>x.l)),candles:selected.length};
 }
 async function requestCandles(symbol){
  const r=await fetch(api+`?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=744`,{cache:'no-store',signal:AbortSignal.timeout(16000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  const raw=await r.json();
  if(!Array.isArray(raw)||!raw.length)throw Error('Sem candles');
  return raw.map(a=>({t:+a[0],o:+a[1],h:+a[2],l:+a[3],c:+a[4],v:+a[5]})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite));
 }
 async function worker(items,limit,fn){
  let i=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const item=items[i++];try{await fn(item)}catch(e){}}}));
 }
 function buildResult(pair,c,map){
  const [sym,name]=pair,live=map.get(sym)||map.get(name);
  if(!live||Date.now()-(+live.observedAt||0)>180000||!(+live.price>0))return{sym,name,error:'Cotação atual indisponível ou desatualizada'};
  const now=Date.now(),price=+live.price,windows={};
  for(const [label,hrs] of MINS){const w=windowLow(c,hrs,now);if(!w){windows[label]=null;continue}
   const distance=(price-w.low)/w.low*100;
   windows[label]={low:w.low,distance,candles:w.candles,near:distance<=+(el('m7Tolerance')?.value||.5)};
  }
  const active=MINS.map(([label])=>label).filter(label=>windows[label]?.near);
  const rsi=calculateRsi(c),patterns=candlePatterns(c);
  const last=c.at(-1),volBase=c.slice(-21,-1).reduce((s,x)=>s+x.v,0)/Math.max(1,c.slice(-21,-1).length);
  const volumeX=volBase?last.v/volBase:null;
  const green=last.c>last.o,rsiRising=!!rsi&&rsi.now>rsi.previous+.4;
  const bullish=patterns.some(p=>['Engolfo comprador','Martelo comprador','Estrela da manhã (em formação)'].includes(p));
  const confirmed=bullish;
  const forming=!confirmed&&green&&rsiRising;
  const phase=confirmed?'REVERSÃO INICIAL — candle comprador':forming?'POSSÍVEL REVERSÃO — candle verde e RSI subindo':'NA MÍNIMA — sem reversão confirmada';
  return{sym,name,price,windows,active,rsi,patterns,volumeX,phase,level:confirmed?'confirmed':forming?'forming':'touch',updatedAt:now};
 }
 function row(label,w){return w?`<div class="row"><span>Mínima ${label} • distância</span><b>${fmt(w.low)} • ${pct(w.distance)}</b></div>`:`<div class="row"><span>Mínima ${label}</span><b>Dados insuficientes</b></div>`}
 function card(x,watch=false){
  const cls=x.level==='confirmed'?'m7-confirmed':x.level==='forming'?'m7-forming':'';
  return `<article class="m7-card ${cls}">
   <h3>${x.name}/USDT</h3><div class="m7-pills"><span class="m7-pill">${watch?'EM MONITORAMENTO':'ALERTA DE MÍNIMA'}</span><span class="m7-pill">${x.phase}</span></div>
   <div class="row"><span>Preço atual</span><b>${fmt(x.price)}</b></div>${MINS.map(([label])=>row(label,x.windows[label])).join('')}
   <div class="row"><span>RSI 14</span><b>${x.rsi?pct(x.rsi.now,1).replace('%','')+(x.rsi.now>x.rsi.previous+.4?' • subindo':''): '—'}</b></div>
   <div class="row"><span>Volume da vela 1h</span><b>${x.volumeX==null?'—':fmt(x.volumeX,2)+'× da média'}</b></div>
   <div class="row"><span>Padrões de candle</span><b>${x.patterns.length?x.patterns.join(', '):'Nenhum comprador identificado'}</b></div>
   <div class="m7-actions"><button type="button" data-m7-watch="${x.sym}">${watch?'Parar monitoramento':'Monitorar'}</button></div>
  </article>`;
 }
 function render(){
  const near=results.filter(x=>!x.error&&x.active?.length).sort((a,b)=>Math.min(...a.active.map(k=>a.windows[k].distance))-Math.min(...b.active.map(k=>b.windows[k].distance)));
  const inWatch=[...watching].map(sym=>results.find(x=>x.sym===sym)).filter(Boolean);
  const total=results.filter(x=>!x.error).length;
  el('m7Summary').innerHTML=`<div class="m7-chip"><b>${total}/${pairs().length}</b><br><span class="sub">ativos calculados</span></div><div class="m7-chip"><b>${near.length}</b><br><span class="sub">perto de uma mínima</span></div><div class="m7-chip"><b>${results.filter(x=>x.level==='confirmed'&&x.active?.length).length}</b><br><span class="sub">com candle comprador</span></div><div class="m7-chip"><b>${results.filter(x=>x.error).length}</b><br><span class="sub">sem dados atuais</span></div>`;
  el('m7Signals').innerHTML=near.length?`<div class="m7-grid">${near.map(x=>card(x,watching.has(x.sym))).join('')}</div>`:'<div class="m7-empty">Nenhum ativo está dentro da distância selecionada de uma mínima. Isso não significa que não possa haver uma queda em andamento.</div>';
  el('m7WatchCount').textContent='('+inWatch.length+' ativos; somente enquanto esta página estiver aberta)';
  el('m7Watching').innerHTML=inWatch.length?`<div class="m7-grid">${inWatch.map(x=>card(x,true)).join('')}</div>`:'<div class="m7-empty">Nenhum ativo selecionado. Use “Monitorar” em um alerta de mínima.</div>';
 }
 async function scan(){
  if(busy)return;
  const map=dataMap(),allPairs=pairs();
  if(!map?.size||!allPairs.length){status('Aguardando o carregamento das cotações da central principal. Tente novamente em alguns segundos.');return}
  busy=true;const id=++scanId;el('m7Scan').disabled=true;status('Calculando mínimas das 50 criptomoedas em memória...');
  const next=[];
  await worker(allPairs,5,async pair=>{
   const c=await requestCandles(pair[0]);
   const x=buildResult(pair,c,map);
   next.push(x);
  });
  if(id===scanId){
   // Mantém falhas explícitas para não confundir falta de dados com ausência de sinal.
   const seen=new Set(next.map(x=>x.sym));
   for(const p of allPairs)if(!seen.has(p[0]))next.push({sym:p[0],name:p[1],error:'Falha ao obter candles de 1h'});
   results=next.sort((a,b)=>a.name.localeCompare(b.name));
   lastRun=Date.now();render();
   status(`Atualizado às ${new Date(lastRun).toLocaleTimeString('pt-BR')} • ${next.filter(x=>!x.error).length}/${allPairs.length} ativos • sem gravação de histórico.`);
  }
  busy=false;el('m7Scan').disabled=false;
 }
 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-m7-watch]');
  if(b){const sym=b.dataset.m7Watch;if(watching.has(sym))watching.delete(sym);else watching.add(sym);render()}
  if(e.target.id==='m7Scan')scan();
 });
 el('m7Tolerance').addEventListener('change',()=>{if(results.length)render()});
 // The page refreshes from the existing live market feed every 30s; this windowed scan runs every 5m.
 setTimeout(()=>{if(document.visibilityState==='visible')scan()},20000);
 setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastRun>=300000)scan()},30000);
 window.addEventListener('beforeunload',()=>{watching.clear();results=[]});
})();