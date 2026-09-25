/*
 * OBSERVADOR EXPERIMENTAL DE INICIO DE PERNADA V2
 * Somente leitura. Nao altera motores oficiais, EPDecision, Reversal Gate ou sinais.
 * Esteira: COMPRESSAO > ABSORCAO > PRESSAO > PRE-IGNICAO > ATAQUE > ROMPIMENTO >
 * ACEITACAO > ACELERACAO > ESTICAMENTO > EXAUSTAO > RETRACAO > RETESTE.
 */
(()=>{
'use strict';
const KEY='ep_early_leg_observer_v2',HIST='ep_early_leg_events_v2',MAX_EVENTS=5000;
const PHASES=['COMPRESSÃO','ABSORÇÃO','PRESSÃO','PRÉ-IGNIÇÃO','ATAQUE À RESISTÊNCIA','ROMPIMENTO','ACEITAÇÃO','ACELERAÇÃO','ESTICAMENTO','EXAUSTÃO','RETRAÇÃO','RETESTE'];
const $=s=>document.querySelector(s),num=v=>Number.isFinite(+v)?+v:0,clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const avg=a=>{const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:0};
const pct=(a,b)=>a?((b-a)/a)*100:0;
function load(k,d){try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch{return d}}
let state=load(KEY,{}),events=load(HIST,[]);
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem(HIST,JSON.stringify(events.slice(-MAX_EVENTS)))}catch{}}
function ema(v,p){if(!v.length)return[];const k=2/(p+1),o=[v[0]];for(let i=1;i<v.length;i++)o.push(v[i]*k+o[i-1]*(1-k));return o}
function macd(c){const v=c.map(x=>x.c),e12=ema(v,12),e26=ema(v,26),line=v.map((_,i)=>e12[i]-e26[i]),sig=ema(line,9),h=line.map((x,i)=>x-sig[i]);return{line:line.at(-1)||0,signal:sig.at(-1)||0,h:h.at(-1)||0,hPrev:h.at(-2)||0,hAccel:(h.at(-1)||0)-(h.at(-2)||0)}}
function atr(c,p=14){if(c.length<p+1)return 0;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return avg(tr.slice(-p))}
function analyze(x){
 const c=(x.candles||[]).slice(-80);if(c.length<30)return null;
 const p=num(x.livePrice||x.price||c.at(-1).c),last=c.at(-1),prior=c.slice(-31,-3),recent=c.slice(-6);
 const resistance=Math.max(...prior.map(z=>z.h)),support=Math.min(...prior.map(z=>z.l));
 const a=atr(c),atrPct=p?a/p*100:0,range20=(Math.max(...c.slice(-20).map(z=>z.h))-Math.min(...c.slice(-20).map(z=>z.l)))/p*100;
 const ranges=c.slice(-20).map(z=>(z.h-z.l)/(z.c||1)*100),compression=avg(ranges.slice(-5))/(avg(ranges.slice(0,15))||1);
 const vBase=avg(c.slice(-26,-6).map(z=>z.v)),vRecent=avg(recent.map(z=>z.v)),volRatio=vBase?vRecent/vBase:1;
 const flow=num(x.flow),oi=num(x.oiChange),book=num(x.bookImbalance),vw=num(x.vwap),m=macd(c);
 const r3=pct(c.at(-4).c,p),r6=pct(c.at(-7).c,p);
 const distR=pct(p,resistance),distS=pct(support,p);
 const nearR=Math.abs(distR)<=Math.max(.45,atrPct*.8),nearS=Math.abs(distS)<=Math.max(.45,atrPct*.8);
 const attacksR=c.slice(-16).filter(z=>Math.abs(pct(z.h,resistance))<=Math.max(.35,atrPct*.65)).length;
 const attacksS=c.slice(-16).filter(z=>Math.abs(pct(support,z.l))<=Math.max(.35,atrPct*.65)).length;
 const lows=recent.map(z=>z.l),highs=recent.map(z=>z.h);
 const higherLows=lows.slice(1).filter((v,i)=>v>=lows[i]).length;
 const lowerHighs=highs.slice(1).filter((v,i)=>v<=highs[i]).length;
 const bullPressure=(flow>.02?18:0)+(book>.05?14:0)+(oi>.15?10:0)+(volRatio>1.15?10:0)+(p>vw?8:0)+(m.h>0?8:0)+(m.hAccel>0?8:0)+(higherLows>=3?12:0)+(r3>0?6:0);
 const bearPressure=(flow<-.02?18:0)+(book<-.05?14:0)+(oi>.15?10:0)+(volRatio>1.15?10:0)+(p<vw?8:0)+(m.h<0?8:0)+(m.hAccel<0?8:0)+(lowerHighs>=3?12:0)+(r3<0?6:0);
 const dir=bullPressure>=bearPressure?'BUY':'SELL',pressure=Math.max(bullPressure,bearPressure);
 const level=dir==='BUY'?resistance:support,dist=dir==='BUY'?distR:distS,attacks=dir==='BUY'?attacksR:attacksS;
 const broke=dir==='BUY'?p>resistance:p<support;
 const breakPct=dir==='BUY'?pct(resistance,p):pct(p,support);
 const accepted=dir==='BUY'?c.slice(-2).every(z=>z.c>resistance):c.slice(-2).every(z=>z.c<support);
 const rejection=dir==='BUY'?(last.h-last.c)/(last.h-last.l||1):(last.c-last.l)/(last.h-last.l||1);
 const stretched=Math.abs(r6)>=Math.max(3,atrPct*4);
 const priorState=state[x.sym]?.phase;
 let phase='COMPRESSÃO';
 if(compression<=.78&&range20<Math.max(5,atrPct*8))phase='COMPRESSÃO';
 if(phase==='COMPRESSÃO'&&((dir==='BUY'&&higherLows>=3)||(dir==='SELL'&&lowerHighs>=3))&&volRatio<1.25)phase='ABSORÇÃO';
 if(pressure>=38)phase='PRESSÃO';
 if(pressure>=52&&Math.abs(dist)<=Math.max(1.5,atrPct*2.2))phase='PRÉ-IGNIÇÃO';
 if(pressure>=58&&attacks>=2&&((dir==='BUY'&&nearR)||(dir==='SELL'&&nearS)))phase='ATAQUE À RESISTÊNCIA';
 if(broke&&breakPct>=0)phase='ROMPIMENTO';
 if(broke&&accepted&&volRatio>=1.05)phase='ACEITAÇÃO';
 if(accepted&&pressure>=65&&Math.abs(r3)>=Math.max(.6,atrPct*1.1))phase='ACELERAÇÃO';
 if(stretched&&(Math.abs(r6)>=4||num(x.rsi)>=78||num(x.rsi)<=22))phase='ESTICAMENTO';
 if((priorState==='ESTICAMENTO'||stretched)&&((volRatio<1&&rejection>.45)||(dir==='BUY'&&m.hAccel<0)||(dir==='SELL'&&m.hAccel>0)))phase='EXAUSTÃO';
 const old=state[x.sym];const peak=old?.peakPrice||p,trough=old?.troughPrice||p;
 const newPeak=Math.max(peak,p),newTrough=Math.min(trough,p);
 const retr=dir==='BUY'&&newPeak>level?pct(newPeak,p):dir==='SELL'&&newTrough<level?pct(p,newTrough):0;
 const backNear=dir==='BUY'?Math.abs(pct(level,p))<=Math.max(.8,atrPct*1.4):Math.abs(pct(p,level))<=Math.max(.8,atrPct*1.4);
 if(['ESTICAMENTO','EXAUSTÃO','RETRAÇÃO'].includes(priorState)&&retr>Math.max(.5,atrPct))phase='RETRAÇÃO';
 if(['RETRAÇÃO','EXAUSTÃO'].includes(priorState)&&backNear)phase='RETESTE';
 let score=clamp(Math.round(pressure+(attacks>=2?8:0)+(Math.abs(dist)<=1?8:0)+(broke?10:0)+(accepted?8:0)-(stretched?8:0)));
 return {sym:x.sym,asset:x.key||x.sym.replace('USDT',''),ts:Date.now(),price:p,dir,phase,score,resistance,support,level,dist,attacks,compression,volRatio,flow,oi,book,macdH:m.h,macdAccel:m.hAccel,r3,r6,atrPct,breakPct,accepted,peakPrice:newPeak,troughPrice:newTrough};
}
function scan(){
 const map=window.CryptoApp?.getData?.();if(!map?.size){render([]);return}
 const rows=[];map.forEach(x=>{const r=analyze(x);if(!r)return;const old=state[r.sym];if(!old||old.phase!==r.phase){events.push({ts:r.ts,sym:r.sym,asset:r.asset,from:old?.phase||null,to:r.phase,price:r.price,score:r.score,dir:r.dir,dist:r.dist,attacks:r.attacks,volRatio:r.volRatio,flow:r.flow,oi:r.oi,book:r.book});}state[r.sym]={...r,peakPrice:Math.max(old?.peakPrice||r.price,r.peakPrice),troughPrice:Math.min(old?.troughPrice||r.price,r.troughPrice)};rows.push(state[r.sym])});
 save();render(rows);window.dispatchEvent(new CustomEvent('ep-early-leg-updated',{detail:{rows}}));
}
const f=(v,d=2)=>Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
const pc=(v,d=2)=>Number.isFinite(+v)?((+v>=0?'+':'')+f(v,d)+'%'):'—';
function ensure(){
 if($('#earlyLegObserverSection'))return;const host=document.querySelector('main');if(!host)return;
 const sec=document.createElement('section');sec.className='card';sec.id='earlyLegObserverSection';
 sec.innerHTML='<h2>OBSERVADOR DE INÍCIO DE PERNADA — 50 CRIPTOMOEDAS</h2><p class="sub"><b>Leitura experimental em tempo real.</b> COMPRESSÃO → ABSORÇÃO → PRESSÃO → PRÉ-IGNIÇÃO → ATAQUE À RESISTÊNCIA → ROMPIMENTO → ACEITAÇÃO → ACELERAÇÃO → ESTICAMENTO → EXAUSTÃO → RETRAÇÃO → RETESTE. Não altera os 5 motores oficiais.</p><div id="earlyLegObserver">Aguardando as 50 criptomoedas...</div>';
 const ref=$('#legCycleLabCard')||$('#decisionCenter')?.closest('section.card');if(ref)ref.before(sec);else host.prepend(sec);
}
function render(rows){
 ensure();const root=$('#earlyLegObserver');if(!root)return;
 const order=new Map(PHASES.map((s,i)=>[s,i]));
 rows.sort((a,b)=>(order.get(b.phase)||0)-(order.get(a.phase)||0)||b.score-a.score);
 const counts={};rows.forEach(r=>counts[r.phase]=(counts[r.phase]||0)+1);
 root.innerHTML='<div class="sub" style="margin-bottom:8px"><b>'+rows.length+'/50 moedas</b> • '+Object.entries(counts).map(([k,v])=>k+': '+v).join(' • ')+'</div><div style="overflow:auto;max-height:760px"><table class="price-track"><thead><tr><th>Ativo</th><th>Direção</th><th>Fase</th><th>Pressão</th><th>Preço</th><th>Resistência</th><th>Suporte</th><th>Dist. nível</th><th>Ataques</th><th>Vol.</th><th>Fluxo</th><th>OI Δ</th><th>Book</th><th>MACD 12/26/9</th><th>3 velas</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+r.asset+'</b></td><td class="'+(r.dir==='BUY'?'buy':'sell')+'"><b>'+(r.dir==='BUY'?'ALTA':'BAIXA')+'</b></td><td><b>'+r.phase+'</b></td><td>'+r.score+'/100</td><td>'+f(r.price,r.price<10?6:2)+'</td><td>'+f(r.resistance,r.price<10?6:2)+'</td><td>'+f(r.support,r.price<10?6:2)+'</td><td>'+pc(r.dist,2)+'</td><td>'+r.attacks+'</td><td>'+f(r.volRatio,2)+'x</td><td>'+pc(r.flow*100,1)+'</td><td>'+pc(r.oi,2)+'</td><td>'+pc(r.book*100,1)+'</td><td>'+(r.macdH>=0?'▲':'▼')+' '+f(r.macdH,6)+'</td><td>'+pc(r.r3,2)+'</td></tr>').join('')+'</tbody></table></div><p class="sub">Ataques = aproximações recentes ao suporte/resistência. ACEITAÇÃO exige sustentação após o rompimento. A leitura é observacional e será validada pelo histórico de transições.</p>';
}
window.addEventListener('crypto-data-updated',scan);window.addEventListener('crypto-realtime-updated',()=>{clearTimeout(window.__earlyLegT);window.__earlyLegT=setTimeout(scan,900)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();setTimeout(scan,3000)});else{ensure();setTimeout(scan,3000)}
setInterval(()=>{if(!document.hidden)scan()},10000);
window.EPEarlyLegObserver={scan,get:()=>({rows:state,events}),phases:PHASES};
})();