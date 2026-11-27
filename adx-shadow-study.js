/* ADX Shadow Study: independent observation only; does not change motor signals. */
(()=>{'use strict';
const KEY='ep-adx-shadow-v1',MAX=5000;
const host=document.querySelector('main');if(!host||document.getElementById('adxShadowCard'))return;
const card=document.createElement('section');card.className='card';card.id='adxShadowCard';
card.innerHTML='<h2>🧭 EXPERIMENTO ADX — FORÇA E DIREÇÃO DA TENDÊNCIA</h2><p class="sub">Modo sombra: registra transições entre faixas do ADX 14, direção pelos DI+/DI−, preço de entrada e máximas/mínimas posteriores. Não altera os motores nem executa ordens. Histórico salvo neste navegador.</p><div id="adxShadowPanel">Aguardando candles...</div>';
const ref=document.getElementById('motor8CycleCard')||document.getElementById('altcoinMomentumCard');if(ref)ref.before(card);else host.append(card);
const root=card.querySelector('#adxShadowPanel');
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(x,d=2)=>Number.isFinite(+x)?(+x).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
const pct=(a,b)=>a>0?(b-a)/a*100:null;
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return{states:x.states||{},events:Array.isArray(x.events)?x.events:[]}}catch{return{states:{},events:[]}}};
let db=read(),lastScan=0,busy=false;const eventById=new Map(db.events.map(e=>[e.id,e]));for(const s of Object.values(db.states)){if(s.active&&eventById.has(s.active.id))s.active=eventById.get(s.active.id);s.patterns=s.patterns||{}}
function adxCalc(c,p=14){
 if(!Array.isArray(c)||c.length<p*2+2)return null;const tr=[],plus=[],minus=[];
 for(let i=1;i<c.length;i++){const up=+c[i].h- +c[i-1].h,down=+c[i-1].l- +c[i].l;plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);tr.push(Math.max(+c[i].h- +c[i].l,Math.abs(+c[i].h- +c[i-1].c),Math.abs(+c[i].l- +c[i-1].c)))}
 const dx=[];for(let i=p-1;i<tr.length;i++){const at=tr.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p,pp=100*(plus.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p)/(at||1),mm=100*(minus.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p)/(at||1);dx.push({v:100*Math.abs(pp-mm)/(pp+mm||1),pp,mm})}
 if(dx.length<p)return null;let a=dx.slice(0,p).reduce((s,x)=>s+x.v,0)/p;for(const x of dx.slice(p))a=(a*(p-1)+x.v)/p;return{adx:a,pdi:dx.at(-1).pp,mdi:dx.at(-1).mm}
}
const bucket=a=>a<20?'FRACA (<20)':a<25?'GANHANDO FORÇA (20–24,9)':a<40?'FORTE (25–39,9)':'MUITO FORTE (≥40)';
function direction(x){const gap=x.pdi-x.mdi;if(Math.abs(gap)<2)return'NEUTRA';return gap>0?'ALTA':'BAIXA'}
const symOf=(x,k)=>String(x.sym||x.symbol||k||'').toUpperCase().replace('/','');
function extrema(e,c){
 const after=(c||[]).filter(z=>Number.isFinite(+z.t)&&+z.t>=e.startedAt);
 for(const z of after){if(Number.isFinite(+z.h))e.maxPrice=Math.max(e.maxPrice||e.entryPrice,+z.h);if(Number.isFinite(+z.l))e.minPrice=Math.min(e.minPrice||e.entryPrice,+z.l)}
 e.lastPrice=+(c?.at(-1)?.c)||e.lastPrice||e.entryPrice;e.updatedAt=Date.now();e.adxChange=Number.isFinite(+e.lastAdx)?e.lastAdx-e.adxEntry:null;
 for(const h of [24,72,168]){const key=h===168?'7d':h+'h',mature=Date.now()-e.startedAt>=h*3600000;e.outcomes[key]={mature,highPct:pct(e.entryPrice,e.maxPrice),lowPct:pct(e.entryPrice,e.minPrice),returnPct:pct(e.entryPrice,e.lastPrice)}}
}
function scan(){
 if(busy||document.hidden)return;const map=window.CryptoApp?.getData?.();if(!map?.size)return;busy=true;const now=Date.now(),rows=[];
 map.forEach((asset,key)=>{
  const c=asset?.candles||[];if(c.length<30)return;const v=adxCalc(c.slice(-100));if(!v)return;
  const sym=symOf(asset,key),dir=direction(v),band=bucket(v.adx),id=sym+'|'+dir+'|'+band,price=+(asset.livePrice||asset.price||c.at(-1).c);if(!(price>0))return;
  const old=db.states[sym],currentPatterns={};let active=old?.active;
  if(dir!=='NEUTRA'&&(!active||active.id!==id)){active={id,sym,asset:String(asset.key||sym.replace(/USDT$/,'')),direction:dir,band,startedAt:now,entryPrice:price,maxPrice:price,minPrice:price,lastPrice:price,adxEntry:v.adx,lastAdx:v.adx,pdi:v.pdi,mdi:v.mdi,adxChange:0,timeframe:asset.interval||asset.timeframe||'candles recebidos pelo EP'};db.events.push(active)}
  if(active)rows.push(active)
  let early=null;try{early=window.EPEarlyLegMotorV1?.calc?.(asset)||null}catch{}
  const patternCandidates=[];
  const prioritized={'Three Rising Valleys':'TRV_CONFIRMED','Bull Flag':'BULL_FLAG_BREAKOUT'};
  if(early?.patternConfirmed&&prioritized[early.confirmedPattern])patternCandidates.push({name:prioritized[early.confirmedPattern],dir:early.dir||'BUY',confirmed:true});
  const min=window.EPMotor7Minimum?.get?.(sym),min30=min?.windows?.['30d'];
  if(min30&&Number.isFinite(+min30.distance)&&+min30.distance<=.5&&early?.dir==='BUY'&&+early?.buyerFlow?.ratio>=.55)patternCandidates.push({name:'MIN30_FLOW',dir:'BUY',confirmed:true});
  const aligned=(d)=>d==='BUY'?v.pdi>v.mdi:d==='SELL'?v.mdi>v.pdi:false;
  for(const p of patternCandidates){
   const pid=sym+'|PATTERN|'+p.name+'|'+p.dir,existing=old?.patterns?.[p.name];
   currentPatterns[p.name]=existing||pid;
   let pe=existing?eventById.get(existing):null;
   if(!pe){pe={id:pid+'|'+now,eventType:'PATTERN',pattern:p.name,controlGroup:'PADRAO',adxQualifiedAtEntry:v.adx>=25&&aligned(p.dir),direction:p.dir,sym,asset:String(asset.key||sym.replace(/USDT$/,'')),band:bucket(v.adx),startedAt:now,entryPrice:price,maxPrice:price,minPrice:price,lastPrice:price,adxEntry:v.adx,lastAdx:v.adx,pdi:v.pdi,mdi:v.mdi,adxChange:0,timeframe:'H1'};db.events.push(pe);eventById.set(pe.id,pe);currentPatterns[p.name]=pe.id}
  }
  for(const e of db.events)if(e.sym===sym&&!e.outcomes?.['7d']?.mature){e.lastAdx=v.adx;e.pdi=v.pdi;e.mdi=v.mdi;extrema(e,c)}
  db.states[sym]={active,patterns:currentPatterns,latest:{adx:v.adx,pdi:v.pdi,mdi:v.mdi,band,direction:dir,price,at:now}}
 });
 db.events=db.events.slice(-MAX);try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}
 if(now-lastScan>30000){lastScan=now;render(rows)}busy=false
}
function render(rows){
 const all=db.events.slice().reverse(),active=db.events.filter(e=>!e.outcomes?.['7d']?.mature),pat=db.events.filter(e=>e.eventType==='PATTERN'),qualified=pat.filter(e=>e.adxQualifiedAtEntry),summary=[['Episódios ADX',db.events.filter(e=>e.eventType!=='PATTERN').length],['Eventos de padrão',pat.length],['Padrão + ADX ≥25 alinhado',qualified.length],['ADX ≥40',db.events.filter(e=>e.eventType!=='PATTERN'&&e.adxEntry>=40).length]];
 root.innerHTML='<div class="sub">Faixas: abaixo de 20 = fraca; 20–24,9 = ganhando força; 25–39,9 = forte; 40 ou mais = muito forte. A direção vem de +DI/−DI. Padrões observados: TRV confirmado, Bull Flag confirmado e mínima 30D + fluxo comprador ≥55%. “Padrão + ADX” exige ADX ≥25 e DI alinhado no momento da entrada; todos os padrões também ficam registrados como controle.</div><div class="m8-grid">'+summary.map(([a,b])=>'<div class="m8-stat"><b>'+n(b,0)+'</b><small>'+a+'</small></div>').join('')+'</div><button id="adxExport" type="button" style="width:auto">Baixar histórico JSON</button> <button id="adxRefresh" type="button" style="width:auto">Atualizar leitura</button><div class="m8-tablewrap"><table><thead><tr><th>Entrada</th><th>Ativo</th><th>Padrão / grupo</th><th>Direção</th><th>Faixa ADX</th><th>ADX inicial → atual</th><th>+DI / −DI</th><th>Preço entrada</th><th>Máxima depois</th><th>Mínima depois</th><th>Retorno atual</th><th>24h / 72h / 7d</th></tr></thead><tbody>'+all.slice(0,100).map(e=>'<tr><td>'+new Date(e.startedAt).toLocaleString('pt-BR')+'</td><td>'+esc(e.asset)+'</td><td>'+esc(e.eventType==='PATTERN'?e.pattern+' • '+(e.adxQualifiedAtEntry?'Padrão + ADX':'Padrão controle'):'ADX isolado')+'</td><td>'+esc(e.direction)+'</td><td>'+esc(e.band)+'</td><td>'+n(e.adxEntry,1)+' → '+n(e.lastAdx,1)+' ('+(e.adxChange>=0?'+':'')+n(e.adxChange,1)+')</td><td>'+n(e.pdi,1)+' / '+n(e.mdi,1)+'</td><td>'+n(e.entryPrice,8)+'</td><td>'+n(e.maxPrice,8)+'</td><td>'+n(e.minPrice,8)+'</td><td>'+n(pct(e.entryPrice,e.lastPrice),2)+'%</td><td>'+[e.outcomes?.['24h'],e.outcomes?.['72h'],e.outcomes?.['7d']].map(x=>x?.mature?'+'+n(x.highPct,2)+'% / '+n(x.lowPct,2)+'%':'aguardando').join(' • ')+'</td></tr>').join('')+'</tbody></table></div><p class="sub">Máxima e mínima são atualizadas usando os extremos dos candles disponíveis após a entrada. Para padrões, a comparação é entre todos os eventos de padrão e o subconjunto com ADX ≥25 e DI alinhado na entrada; ADX isolado serve de referência separada. Máxima/mínima usam os extremos dos candles disponíveis depois da entrada. Sem taxas ou execução de ordens.</p>';
 root.querySelector('#adxRefresh')?.addEventListener('click',scan);
 root.querySelector('#adxExport')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),events:db.events},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ep-adx-shadow.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})
}
scan();window.addEventListener('crypto-data-updated',scan);window.addEventListener('crypto-realtime-updated',scan);setInterval(scan,30000);
window.EPADXShadow={scan,get:()=>JSON.parse(JSON.stringify(db))};
})();