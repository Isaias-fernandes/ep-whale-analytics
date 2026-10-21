/*
 * MONITOR DO MOTOR 6 — shadow only.
 * Autoentrada: score técnico >= 50 + filtro de qualidade completo >= 80/100, sem risco e com fonte. Encerramento manual arquiva o episódio.
 */
(()=>{'use strict';
const API='https://qhgclnkctpzumtybailv.supabase.co/functions/v1/ep-motor6-watch',KEY='ep_motor6_watch_v1',HKEY='ep_motor6_watch_history_v1',COOLDOWN_KEY='ep_motor6_watch_cooldown_v1',TARGETS=[3,5,10,20,30,50],AUTO_SCORE=50,AUTO_WATCH_SCORE=35,QUALITY_MIN=80,MAX_OPEN=50,COOLDOWN_MS=30*60*1000;
let open=[],hist=[],remoteHistory=[],cooldown={},dismissed=[];
try{dismissed=JSON.parse(localStorage.getItem('ep_motor6_watch_dismissed_v1')||'[]');if(!Array.isArray(dismissed))dismissed=[]}catch{dismissed=[]}
try{open=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(open))open=[]}catch{open=[]}
try{hist=JSON.parse(localStorage.getItem(HKEY)||'[]');if(!Array.isArray(hist))hist=[]}catch{hist=[]}
try{cooldown=JSON.parse(localStorage.getItem(COOLDOWN_KEY)||'{}')||{}}catch{cooldown={}}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(open));localStorage.setItem(HKEY,JSON.stringify(hist.slice(-500)));localStorage.setItem(COOLDOWN_KEY,JSON.stringify(cooldown));localStorage.setItem('ep_motor6_watch_dismissed_v1',JSON.stringify([...new Set(dismissed.map(norm).filter(Boolean))]))}catch{}};
async function remote(){try{const r=await fetch(API,{method:'GET',cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
async function syncRemote(){const j=await remote();if(!j?.rows)return;remoteHistory=Array.isArray(j.history)?j.history:[];const local=new Map(open.map(o=>[norm(o.asset),o]));for(const r of j.rows){const n=norm(r.asset);if(isDismissed(n)||local.has(n))continue;const o={id:'m6:'+n+':shared',asset:n,source:r.source,entryAt:new Date(r.entry_at).getTime(),entryPrice:+r.entry_price,lastPrice:+(r.last_price??r.entry_price),entryScore:r.entry_score,entryDir:r.entry_dir||'BUY',entryPhase:r.entry_phase,entryPattern:r.entry_pattern,entryRsi:r.entry_rsi,entryPreLeg:r.entry_pre_leg,entryFutures:r.entry_futures,best:+r.best_pct||0,worst:+r.worst_pct||0,targets:r.targets||{},lastScore:r.last_score,lastDir:r.last_dir||r.entry_dir||'BUY',lastPhase:r.last_phase,lastPattern:r.last_pattern,readOnlySeed:true};local.set(n,o)}open=[...local.values()];save();window.dispatchEvent(new CustomEvent('ep-motor6-watch-changed'))}
function map(){return window.CryptoApp?.getData?.()}
function norm(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function isDismissed(sym){const n=norm(sym);return !!n&&dismissed.some(x=>norm(x)===n)}
function qualityGate(sym){
 let q=null;try{q=window.EPMotor6Fundamental?.get?.(sym)||null}catch{}
 if(!q)return{ok:false,reason:'Filtro de qualidade ainda não carregou.'};
 if(q.label!=='Fundamento favorável'||!Number.isFinite(+q.score)||+q.score<QUALITY_MIN){
   const reason=q.label==='Risco identificado'||q.label==='Risco elevado'
     ?'há risco ou risco elevado identificado'
     :q.label==='Não avaliado'||q.label==='Incompleto'||String(q.label||'').includes('incompleto')
       ?'a avaliação fundamental está incompleta'
       :'a avaliação fundamental ficou abaixo de '+QUALITY_MIN+'/100';
   return{ok:false,reason};
 }
 if(q.hasEvidence!==true)return{ok:false,reason:'registre a fonte/evidência consultada no filtro'};
 return{ok:true,reason:'aprovado'};
}
function asset(sym){const m=map();if(!m)return null;const n=norm(sym);let x=m.get?.(sym)||m.get?.(n)||m.get?.(n.replace(/USDT$/,'/USDT'));if(x)return x;for(const [k,v] of m.entries?.()||[])if(norm(k)===n||norm(v?.sym)===n||norm(v?.key)===n)return v;return null}
function price(x){const p=+(x?.livePrice??x?.price??x?.regularMarketPrice??x?.close??x?.candles?.at?.(-1)?.c);return Number.isFinite(p)&&p>0?p:NaN}
function ret(p0,p,dir='BUY'){if(!Number.isFinite(p0)||!Number.isFinite(p)||!p0)return NaN;const r=(p-p0)/p0*100;return dir==='SELL'?-r:r}
function snapshot(sym,source='manual'){
 const x=asset(sym),e=window.EPEarlyLegMotorV1?.calc?.(x),p=price(x);if(!x||!e||!Number.isFinite(p))return null;
 const n=norm(sym),now=Date.now();return{id:'m6:'+n+':'+now,asset:n,source,entryAt:now,entryPrice:p,lastPrice:p,entryScore:+e.score||0,entryDir:e.dir||'BUY',entryPhase:e.phase,entryPattern:e.pattern,entryRsi:e.rsi,entryPreLeg:e.preLegScore,entryFutures:e.futuresScore,signalStatus:'OBSERVAÇÃO',entryPatternStatus:e.patternStatus,entryPatternReason:e.patternReason,best:0,worst:0,targets:{},lastScore:+e.score||0,lastDir:e.dir||'BUY',lastPhase:e.phase,lastPattern:e.pattern,lastPatternStatus:e.patternStatus,lastPatternReason:e.patternReason,updates:0};
}
function admission(sym,e,x,armed=null){return window.EPMotor6PatternPolicy?.entryGate?.(e,window.EPMotor7Minimum?.get?.(sym),price(x),Date.now(),armed)||{eligible:false,confirmed:false,reason:'política indisponível'}}
function add(sym,opts={}){
 const n=norm(sym),existing=open.find(z=>norm(z.asset)===n);if(existing)return existing;
 if(isDismissed(n)){if(opts.silent)return null;dismissed=dismissed.filter(x=>norm(x)!==n)}
 if(open.length>=MAX_OPEN){if(!opts.silent)alert('Motor 6: limite de '+MAX_OPEN+' sinais em acompanhamento.');return null}
 const x=asset(n),e=x&&window.EPEarlyLegMotorV1?.calc?.(x);
 if(!x||!e||!Number.isFinite(+e.score)){if(!opts.silent)alert('Motor 6: dados do ativo ainda não disponíveis.');return null}
 const technical=admission(n,e,x);if(!technical.eligible){if(!opts.silent)alert('Motor 6: '+technical.reason);return null}
 const watchOnly=opts.watchOnly===true,minimum=watchOnly?AUTO_WATCH_SCORE:AUTO_SCORE;
 if(+e.score<minimum){if(!opts.silent)alert('Motor 6: score técnico abaixo de '+minimum+'.');return null}
 const gate=qualityGate(n);if(!watchOnly&&!gate.ok){if(!opts.silent)alert('Motor 6 não confirmou sinal para '+String(sym).replace(/USDT$/,'/USDT')+': '+gate.reason+'. Complete o filtro, sem itens de risco, nota mínima 80/100 e fonte registrada.');return null}
 const o=snapshot(n,opts.source||'manual');if(!o){if(!opts.silent)alert('Motor 6: dados do ativo ainda não disponíveis.');return null}
 o.policyVersion='m6-entry-v2';o.armedAt=o.entryAt;o.minimum30=technical.minimum30;o.entryPattern=e.confirmedPattern||e.pattern;o.entryEvidence={compression:e.compression,volumeRatio:e.patternVolumeRatio,obv:e.patternObvConfirmed,buyerFlow:e.buyerFlow};
 o.signalStatus=(!watchOnly&&gate.ok&&technical.confirmed)?'CONFIRMADO':'OBSERVAÇÃO';if(o.signalStatus==='CONFIRMADO'){o.confirmedAt=o.entryAt;o.confirmedPrice=o.entryPrice;o.confirmedTargets={}}
 open.push(o);save();window.dispatchEvent(new CustomEvent('ep-motor6-watch-changed',{detail:o}));return o;
}
function close(id,reason='MANUAL'){
 const i=open.findIndex(z=>z.id===id);if(i<0)return false;
 const o=open[i],x=asset(o.asset),p=price(x),exit=Number.isFinite(p)?p:o.lastPrice,now=Date.now();
 const archived={...o,exitAt:now,exitPrice:exit,result:ret(o.entryPrice,exit,o.entryDir),closeReason:reason,lastPrice:exit,status:'CLOSED'};
 hist.push(archived);open.splice(i,1);cooldown[norm(o.asset)]=now;const closedAsset=norm(o.asset);if(closedAsset&&!isDismissed(closedAsset))dismissed.push(closedAsset);save();
 window.dispatchEvent(new CustomEvent('ep-motor6-watch-changed',{detail:{closed:archived}}));return true;
}
function autoScan(){
 const m=map();if(!m?.entries||!window.EPEarlyLegMotorV1?.calc)return;
 const now=Date.now();
 for(const [key,x] of m.entries()){
   if(open.length>=MAX_OPEN)break;
   const sym=norm(key||x?.sym||x?.key);if(!sym||isDismissed(sym)||open.some(o=>norm(o.asset)===sym))continue;
   if(now-(+cooldown[sym]||0)<COOLDOWN_MS)continue;
   let e;try{e=window.EPEarlyLegMotorV1.calc(x)}catch{continue}
   if(x.observedAt&&now-x.observedAt<=180000&&e&&Number.isFinite(+e.score)&&+e.score>=AUTO_WATCH_SCORE&&e.pattern&&Array.isArray(e.patterns)&&e.patterns.length){
    const gate=qualityGate(sym),confirmed=admission(sym,e,x).confirmed&&gate.ok;
    add(sym,{silent:true,watchOnly:!confirmed,source:confirmed?'auto-pattern-confirmed':'auto-pattern-watch'});
   }
 }
}
function tick(){
 const now=Date.now();
 for(const o of open){
  const x=asset(o.asset),p=price(x);
  if(!Number.isFinite(p))continue;
  let e=null;try{e=window.EPEarlyLegMotorV1?.calc?.(x)||null}catch{}
  if(!x?.observedAt||now-x.observedAt>180000||now<x.observedAt)continue;
  if(!o.invalidatedAt&&o.policyVersion==='m6-entry-v2'&&o.signalStatus==='OBSERVAÇÃO'&&!o.invalidatedAt&&(now-o.armedAt>21600000||p<o.minimum30||p>o.entryPrice*1.03)){o.invalidatedAt=now;o.signalStatus='INVALIDADO';o.invalidationReason='Janela de 6h expirada, perda da mínima ou avanço acima de 3%'}
  const r=ret(o.entryPrice,p,o.entryDir);
  o.lastPrice=p;o.lastPriceAt=now;o.updates=(o.updates||0)+1;
  if(e){o.lastScore=+e.score||0;o.lastDir=e.dir||o.lastDir||'BUY';o.lastPhase=e.phase;o.lastPattern=e.confirmedPattern||e.pattern;o.lastPatternStatus=e.patternStatus;o.lastPatternReason=e.patternReason;o.lastPatternConfirmed=!!e.patternConfirmed;o.lastRsi=e.rsi;o.lastPreLeg=e.preLegScore;o.lastFutures=e.futuresScore;if(!o.invalidatedAt&&o.policyVersion==='m6-entry-v2'&&o.signalStatus==='OBSERVAÇÃO'&&e.dir===o.entryDir&&admission(o.asset,e,x,o).confirmed&&qualityGate(o.asset).ok){o.signalStatus='CONFIRMADO';o.confirmedAt=now;o.confirmedPrice=p;o.confirmedTargets={}}}
  if(Number.isFinite(r)){
   if(o.confirmedPrice>0){const cr=ret(o.confirmedPrice,p,o.entryDir);o.confirmedReturn=cr;o.confirmedTargets||={};for(const t of TARGETS)if(cr>=t&&!o.confirmedTargets[t])o.confirmedTargets[t]={at:now,price:p,hours:+((now-o.confirmedAt)/36e5).toFixed(2)}}
   o.best=Math.max(+o.best||0,r);o.worst=Math.min(+o.worst||0,r);
   if(!o.targets||typeof o.targets!=='object')o.targets={};
   for(const t of TARGETS)if(r>=t&&!o.targets[t])o.targets[t]={at:now,price:p,hours:+((now-o.entryAt)/36e5).toFixed(2)};
  }
 }
 save();autoScan();window.dispatchEvent(new CustomEvent('ep-motor6-watch-updated'));
}
['crypto-data-updated','ep-early-leg-motor-ready','ep-early-leg-updated','ep-motor7-minimum-updated'].forEach(ev=>window.addEventListener(ev,autoScan));
setInterval(()=>{if(!document.hidden){autoScan();if(open.length)tick()}},5000);setInterval(()=>{if(!document.hidden)syncRemote()},300000);
window.EPMotor6Watch={add,close,tick,autoScan,syncRemote,get:()=>open,history:()=>hist,recordedHistory:()=>remoteHistory,TARGETS,AUTO_SCORE,AUTO_WATCH_SCORE,QUALITY_MIN,MAX_OPEN};syncRemote();window.dispatchEvent(new Event('ep-motor6-watch-ready'));setTimeout(autoScan,1200);
})();
