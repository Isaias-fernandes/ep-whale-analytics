/*
 * MOTOR EXPERIMENTAL DE INÍCIO DE PERNADA V1 — shadow mode.
 * Detecta estrutura antes da sobrecompra; não altera EPDecision nem os 5 motores.
 */
(()=>{'use strict';
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x)),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function patterns(c){
 if(c.length<35)return[];const z=c.slice(-35),last=z.at(-1),out=[],close=z.map(x=>+x.c),vol=z.map(x=>+x.v||0);
 const hi=Math.max(...z.slice(-21,-1).map(x=>+x.h)),lo=Math.min(...z.slice(-21,-1).map(x=>+x.l)),range=(hi-lo)/(last.c||1)*100;
 const lows=z.slice(-7).map(x=>+x.l),higher=lows.slice(1).filter((v,i)=>v>=lows[i]).length;
 const ranges=z.slice(-20).map(x=>(+x.h-+x.l)/(+x.c||1)),compression=avg(ranges.slice(-5))/(avg(ranges.slice(0,15))||1)<=.85;
 let obv=0,obvPrev=0;for(let i=1;i<z.length;i++){obvPrev=obv;obv+=(close[i]>close[i-1]?1:close[i]<close[i-1]?-1:0)*vol[i]}const obvConfirm=obv>obvPrev;
 const dist=(hi-last.c)/(last.c||1)*100;
 if(higher>=4&&dist>=0&&dist<=2.2)out.push({name:'Three Rising Valleys',score:76,obvConfirm,compression});
 if(range<=8&&dist>=0&&dist<=1.5)out.push({name:'Rectangle Accumulation',score:70,obvConfirm,compression});
 const impulse=(Math.max(...z.slice(-18,-6).map(x=>x.h))-Math.min(...z.slice(-18,-6).map(x=>x.l)))/(Math.min(...z.slice(-18,-6).map(x=>x.l))||1)*100;
 const retr=(Math.max(...z.slice(-12).map(x=>x.h))-last.c)/(Math.max(...z.slice(-12).map(x=>x.h))||1)*100;
 if(impulse>=6&&retr>=0&&retr<=3.5&&compression)out.push({name:'Bull Pennant',score:82,obvConfirm,compression});
 if(impulse>=6&&retr>=0&&retr<=5&&higher>=3)out.push({name:'Bull Flag',score:80,obvConfirm,compression});
 const a=z.slice(-30,-15),b=z.slice(-15),l1=Math.min(...a.map(x=>x.l)),l2=Math.min(...b.map(x=>x.l));
 if(Math.abs(l2-l1)/(last.c||1)*100<=1.5&&last.c>avg(close.slice(-10)))out.push({name:'Double Bottom',score:72,obvConfirm,compression});
 const hs=z.slice(-10).map(x=>x.h);if(hs.slice(1).filter((v,i)=>v<=hs[i]).length>=4&&higher>=4)out.push({name:'Falling Wedge',score:72,obvConfirm,compression});
 return out;
}
const W={'Bull Pennant':24,'Bull Flag':22,'Three Rising Valleys':20,'Rectangle Accumulation':15,'Falling Wedge':14,'Double Bottom':14};
function calc(x){
 const c=(x?.candles||[]).slice(-96);if(c.length<35)return null;const pats=patterns(c),best=[...pats].sort((a,b)=>(W[b.name]||0)-(W[a.name]||0))[0]||null;
 const backend=(window.EPBackend24?.get?.()?.state||[]).find(s=>s.symbol===x.sym||s.asset===String(x.sym||'').replace('USDT',''));
 const el=backend?.metrics?.earlyLeg||backend?.metrics?.early_leg||null,fv=backend?.metrics?.futuresValidation||el?.metrics?.futuresValidation||null;
 const local=window.EPEarlyLegObserver?.get?.()?.rows?.[x.sym]||null,pre=el||local;
 const ps=+pre?.score||0,fs=fv?.score,rsi=+x.rsi||50;let parts={pattern:best?W[best.name]||8:0,preLeg:ps>=80?28:ps>=65?22:ps>=50?14:ps>=40?7:0,futures:Number.isFinite(+fs)?Math.round(Math.min(15,+fs*.2)):0,obv:best?.obvConfirm?8:0,compression:best?.compression?5:0,antiStretch:rsi>=80?-25:rsi>=74?-15:rsi>=69?-7:rsi<=28?-8:0};
 const score=Math.round(clamp(Object.values(parts).reduce((a,v)=>a+v,0))),phase=score>=80?'IGNIÇÃO':score>=65?'PRÉ-IGNIÇÃO':score>=50?'PRESSÃO':score>=35?'ACUMULAÇÃO':'OBSERVAÇÃO';
 return{version:'early-leg-motor-v1',score,phase,dir:'BUY',pattern:best?.name||null,patterns:pats.map(p=>p.name),parts,rsi,preLegScore:ps,futuresScore:Number.isFinite(+fs)?+fs:null,shadowMode:true};
}
window.EPEarlyLegMotorV1={calc,patterns,VERSION:'early-leg-motor-v1'};window.dispatchEvent(new Event('ep-early-leg-motor-ready'));
})();