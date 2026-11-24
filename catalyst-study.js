(() => {
  'use strict';
  const KEY='epCatalystStudy.v1', BENCH=['ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT'];
  const WINDOWS=[['24h',24],['72h',72],['7d',168]];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
  const save=x=>localStorage.setItem(KEY,JSON.stringify(x.slice(0,100)));
  const fmt=n=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';
  const pairList=()=>window.CryptoApp?.getPairs?.()||[['BTCUSDT','BTC'],...BENCH.map(s=>[s,s.replace('USDT','')])];
  const localTime=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  function mount(){
    if(document.getElementById('epCatalystStudy'))return;
    const anchor=document.getElementById('altcoinMomentumCard')||document.getElementById('motor8CycleCard');if(!anchor)return;
    const section=document.createElement('section');section.id='epCatalystStudy';section.className='card';
    section.innerHTML=`<h2>🧪 EXPERIMENTO — CATALISADORES E RETORNO RELATIVO</h2>
      <p class="sub">Modo sombra. Registre notícia/evento com fonte e horário. Mede ativo, BTC e cesta em 24h, 72h e 7 dias. Não altera motores nem gera ordem.</p>
      <form id="catalystForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px;align-items:end">
        <label>Moeda afetada<select id="catalystSymbol"></select></label>
        <label>Publicado em<input id="catalystTime" type="datetime-local" required></label>
        <label>Polaridade<select id="catalystPolarity"><option value="POSITIVE">Positiva</option><option value="NEGATIVE">Negativa</option><option value="MIXED">Mista</option><option value="NEUTRAL">Neutra</option></select></label>
        <label>Categoria<select id="catalystCategory"><option>PROJECT_UPDATE</option><option>PARTNERSHIP</option><option>REGULATION</option><option>LISTING</option><option>TOKENOMICS</option><option>SECURITY</option><option>ADOPTION</option><option>MACRO</option><option>OTHER</option></select></label>
        <label>Título/resumo<input id="catalystTitle" maxlength="240" required></label>
        <label>Fonte (URL)<input id="catalystUrl" type="url" maxlength="1000" required placeholder="https://..."></label>
        <button type="submit">Registrar e calcular</button></form>
      <p id="catalystStatus" class="sub" role="status">Armazenamento somente neste navegador.</p>
      <div style="overflow:auto"><table class="price-track" style="min-width:950px"><thead><tr><th>Evento / ativo</th><th>Publicado</th><th>Janela</th><th>Ativo</th><th>BTC</th><th>Cesta 5</th><th>Excesso vs BTC</th><th>MFE / MAE</th><th>Cobertura</th></tr></thead><tbody id="catalystRows"></tbody></table></div>
      <p class="sub">Cesta igualitária fixa: ETH, SOL, BNB, XRP e ADA. Excesso = retorno do ativo menos retorno do BTC; é descritivo, não causal. Resultados incompletos ficam identificados. Dados spot públicos da Binance.</p>
      <button id="catalystExport" type="button" style="max-width:240px">Exportar registros JSON</button> <button id="catalystClear" type="button" style="max-width:240px">Apagar registros locais</button>`;
    anchor.parentNode.insertBefore(section,anchor.nextSibling);
    section.querySelector('#catalystSymbol').innerHTML=pairList().map(([s,n])=>`<option value="${esc(s)}">${esc(n)}/USDT</option>`).join('');
    section.querySelector('#catalystTime').value=localTime(new Date());
    section.querySelector('#catalystForm').addEventListener('submit',add);
    section.querySelector('#catalystExport').onclick=exportRows;section.querySelector('#catalystClear').onclick=clearRows;render();
  }
  async function candles(symbol,start,end){
    const url=`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&startTime=${start}&endTime=${end}&limit=1000`;
    const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`HTTP ${r.status}`);
    const rows=await r.json();return Array.isArray(rows)?rows.map(x=>({closeAt:+x[6],high:+x[2],low:+x[3],close:+x[4]})):[];
  }
  function measure(cs,t,h){const end=t+h*3600000,base=cs.filter(x=>x.closeAt<=t).at(-1),last=cs.filter(x=>x.closeAt<=end).at(-1),period=cs.filter(x=>x.closeAt>t&&x.closeAt<=end);if(!base||!last||!period.length)return null;return{ret:(last.close/base.close-1)*100,mfe:(Math.max(...period.map(x=>x.high))/base.close-1)*100,mae:(Math.min(...period.map(x=>x.low))/base.close-1)*100,through:new Date(last.closeAt).toISOString()}}
  async function evaluate(ev){
    ev.results={};const t=Date.parse(ev.publishedAt),now=Date.now();
    for(const [name,h] of WINDOWS){if(now<t+h*3600000){ev.results[name]={status:'PENDENTE'};continue;}
      const start=Math.floor((t-3*3600000)/3600000)*3600000,end=t+h*3600000,symbols=[...new Set([ev.symbol,'BTCUSDT',...BENCH])];
      const got=await Promise.allSettled(symbols.map(s=>candles(s,start,end))),data=Object.fromEntries(symbols.map((s,i)=>[s,got[i].status==='fulfilled'?got[i].value:null]));
      const asset=data[ev.symbol]?measure(data[ev.symbol],t,h):null,btc=data.BTCUSDT?measure(data.BTCUSDT,t,h):null;
      const basket=BENCH.map(s=>data[s]?measure(data[s],t,h):null).filter(Boolean);
      ev.results[name]={status:asset&&btc?'COMPLETO':'PARCIAL',asset,btc,basket:basket.length?basket.reduce((a,x)=>a+x.ret,0)/basket.length:null,basketCount:basket.length,basketTotal:BENCH.length};
    }
    ev.updatedAt=new Date().toISOString();save(read().map(x=>x.id===ev.id?ev:x));
  }
  async function add(e){e.preventDefault();const status=document.getElementById('catalystStatus'),title=document.getElementById('catalystTitle').value.trim(),url=document.getElementById('catalystUrl').value.trim(),symbol=document.getElementById('catalystSymbol').value,publishedAt=new Date(document.getElementById('catalystTime').value).toISOString();
    if(Date.parse(publishedAt)>Date.now()){status.textContent='O horário não pode estar no futuro.';return;}
    const norm=title.toLowerCase().replace(/\W/g,'').slice(0,80),rows=read();if(rows.some(x=>x.symbol===symbol&&x.title.toLowerCase().replace(/\W/g,'').slice(0,80)===norm&&Math.abs(Date.parse(x.publishedAt)-Date.parse(publishedAt))<86400000)){status.textContent='Possível duplicidade já registrada.';return;}
    const ev={id:crypto.randomUUID(),symbol,publishedAt,capturedAt:new Date().toISOString(),polarity:document.getElementById('catalystPolarity').value,category:document.getElementById('catalystCategory').value,title,url,results:{}};save([ev,...rows]);status.textContent='Evento salvo; consultando candles spot...';
    try{await evaluate(ev);status.textContent='Cálculo concluído. Registro salvo neste navegador.';}catch(err){status.textContent=`Evento salvo; consulta falhou (${err.message}). Tente recalcular.`;}render();
  }
  function render(){const body=document.getElementById('catalystRows');if(!body)return;const rows=read();body.innerHTML=rows.length?rows.map(ev=>WINDOWS.map(([h])=>{const r=ev.results?.[h]||{},ex=r.asset&&r.btc?r.asset.ret-r.btc.ret:null;return`<tr><td><b>${esc(ev.symbol)}</b> · ${esc(ev.polarity)}<br><a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.title)}</a><br><small>${esc(ev.category)}</small></td><td>${new Date(ev.publishedAt).toLocaleString('pt-BR')}</td><td>${h}</td><td>${r.asset?fmt(r.asset.ret):'—'}</td><td>${r.btc?fmt(r.btc.ret):'—'}</td><td>${r.basket==null?'—':`${fmt(r.basket)} (${r.basketCount}/${r.basketTotal})`}</td><td>${ex==null?'—':fmt(ex)}</td><td>${r.asset?`${fmt(r.asset.mfe)} / ${fmt(r.asset.mae)}`:'—'}</td><td>${esc(r.status||'AGUARDANDO')}<br><button type="button" data-recalc="${esc(ev.id)}">Recalcular</button></td></tr>`}).join('')).join(''):'<tr><td colspan="9">Nenhum catalisador registrado.</td></tr>';
    body.querySelectorAll('[data-recalc]').forEach(b=>b.onclick=async()=>{const ev=read().find(x=>x.id===b.dataset.recalc);if(!ev)return;b.disabled=true;document.getElementById('catalystStatus').textContent='Recalculando janelas vencidas...';try{await evaluate(ev);document.getElementById('catalystStatus').textContent='Recálculo concluído.';}catch(err){document.getElementById('catalystStatus').textContent=`Falha parcial: ${err.message}`;}render();});
  }
  function exportRows(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(read(),null,2)],{type:'application/json'}));a.download='ep-catalyst-study.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function clearRows(){if(confirm('Apagar os registros salvos apenas neste navegador?')){localStorage.removeItem(KEY);render();document.getElementById('catalystStatus').textContent='Registros locais apagados.'}}
  function start(){mount();if(!document.getElementById('epCatalystStudy'))setTimeout(start,500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
