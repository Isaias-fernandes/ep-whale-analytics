/*
 * MONITOR DO MOTOR 6 — shadow only.
 */
(()=>{'use strict';const KEY='ep_motor6_watch_v1',HKEY='ep_motor6_watch_history_v1',TARGETS=[3,5,10,20,30,50];
let open=[],hist=[];try{open=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(open))open=[]}catch{open=[]}try{hist=JSON.parse(localStorage.getItem(HKEY)||'[]');if(!Array.isArray(hist))hist=[]}catch{hist=[]}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(open));localStorage.setItem(HKEY,JSON.stringify(hist.slice(-500)))}catch{}};
function map(){return window.CryptoApp?.getData?.()}function asset(sym){const m=map();return m?.get?.(sym)||m?.get?.(String(sym).replace('/',''))}
function price(x){const p=+(x?.livePrice??x?.price??x?.regularMarketPrice??x?.candles?.at?.(-1)?.c);return Number.isFinite(p)&&p>0?p:NaN}
function ret(p0,p){return Number.isFinite(p0)&&Number.isFinite(p)&&p0?((p-p0)/p0*100):NaN}
function add(sym){
 const x=asset(sym),e=window.EPEarlyLegMotorV1?.calc?.(x),p=price(x);if(!x||!e||!Number.isFinite(p))return alert('Motor 6: dados do ativo ainda não disponíveis.');
 let o=open.find(z=>z.asset===sym);if(o){window.dispatchEvent(new CustomEvent('ep-motor6-watch-changed'));return o}
 if(open.length>=20)return alert('Motor 6: limite de 20 sinais em acompanhamento.');
 const now=Date.now();o={id:'m6:'+sym+':'+now,asset:sym,entryAt:now,entryPrice:p,lastPrice:p,entryScore:e.score,entryPhase:e.phase,entryPattern:e.pattern,entryRsi:e.rsi,entryPreLeg:e.preLegScore,entryFutures:e.futuresScore,best:0,worst:0,targets:{},lastScore:e.score,lastPhase:e.phase,lastPattern:e.pattern,updates:0};
 open.push(o);save();window.dispatchEvent(new CustomEvent('ep-motor6-watch-changed',{detail:o}));return o;
}
function close(id){const i=open.findIndex(z=>z.id===id);if(i<0)return;const o=open[i],x=asset(o.asset),p=price(x);hist.push({...o,exitAt:Date.now(),exitPrice:Number.isFinite(p)?p:o.lastPrice,result:ret(o.entryPrice,Number.isFinite(p)?p:o.lastPrice)});open.splice(i,1);save();window.dispatchEvent(new CustomEvent('ep-motor6-watch-changed'))}
function tick(){for(const o of open){const x=asset(o.asset),p=price(x),e=window.EPEarlyLegMotorV1?.calc?.(x);if(!Number.isFinite(p)||!e)continue;const r=ret(o.entryPrice,p);o.lastPrice=p;o.lastScore=e.score;o.lastPhase=e.phase;o.lastPattern=e.pattern;o.lastRsi=e.rsi;o.lastPreLeg=e.preLegScore;o.lastFutures=e.futuresScore;o.updates=(o.updates||0)+1;if(Number.isFinite(r)){o.best=Math.max(+o.best||0,r);o.worst=Math.min(+o.worst||0,r);for(const t of TARGETS)if(r>=t&&!o.targets[t])o.targets[t]={at:Date.now(),price:p,hours:+((Date.now()-o.entryAt)/36e5).toFixed(2)}}}save()}window.dispatchEvent(new CustomEvent('ep-motor6-watch-updated'))}
setInterval(()=>{if(!document.hidden&&open.length)tick()},5000);
window.EPMotor6Watch={add,close,tick,get:()=>open,history:()=>hist,TARGETS};window.dispatchEvent(new Event('ep-motor6-watch-ready'));
})();