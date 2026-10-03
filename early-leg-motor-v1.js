/*
 * MOTOR EXPERIMENTAL DE INÍCIO DE PERNADA V1 — shadow mode.
 * Detecta estrutura antes da sobrecompra; não altera EPDecision nem os 5 motores.
 */
(()=>{'use strict';
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x)),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function patterns(c){
 if(c.length<35)return[];const z=c.slice(-35),last=z.at(-1),out=[],close=z.map(x=>+x.c),vol=z.map(x=>+x.v||0);
 const hi=Math.max(...z.slice(-21,-1).map(x=>+x.h)),lo=Math.min(...z.slice(-21,-1).map(x=>+x.l)),range=(hi-lo)/(last.c||1)*100;
 const lows=z.slice(-7).map(x=>+x.l),highs=z.slice(-7).map(x=>+x.h);
 const higher=lows.slice(1).filter((v,i)=>v>=lows[i]).length,lower=highs.slice(1).filter((v,i)=>v<=highs[i]).length;
 const ranges=z.slice(-20).map(x=>(+x.h-+x.l)/(+x.c||1)),compression=avg(ranges.slice(-5))/(avg(ranges.slice(0,15))||1)<=.85;
 let obv=0,obvPrev=0;for(let i=1;i<z.length;i++){obvPrev=obv;obv+=(close[i]>close[i-1]?1:close[i]<close[i-1]?-1:0)*vol[i]}
 const obvBull=obv>obvPrev,obvBear=obv<obvPrev,distR=(hi-last.c)/(last.c||1)*100,distS=(last.c-lo)/(last.c||1)*100;
 if(higher>=4&&distR>=0&&distR<=2.2)out.push({name:'Three Rising Valleys',dir:'BUY',score:76,obvConfirm:obvBull,compression});
 if(range<=8&&distR>=0&&distR<=1.5)out.push({name:'Rectangle Accumulation',dir:'BUY',score:70,obvConfirm:obvBull,compression});
 if(range<=8&&distS>=0&&distS<=1.5)out.push({name:'Rectangle Distribution',dir:'SELL',score:70,obvConfirm:obvBear,compression});
 const impulseUp=(Math.max(...z.slice(-18,-6).map(x=>x.h))-Math.min(...z.slice(-18,-6).map(x=>x.l)))/(Math.min(...z.slice(-18,-6).map(x=>x.l))||1)*100;
 const impulseDn=(Math.max(...z.slice(-18,-6).map(x=>x.h))-Math.min(...z.slice(-18,-6).map(x=>x.l)))/(Math.max(...z.slice(-18,-6).map(x=>x.h))||1)*100;
 const retrUp=(Math.max(...z.slice(-12).map(x=>x.h))-last.c)/(Math.max(...z.slice(-12).map(x=>x.h))||1)*100;
 const retrDn=(last.c-Math.min(...z.slice(-12).map(x=>x.l)))/(last.c||1)*100;
 if(impulseUp>=6&&retrUp>=0&&retrUp<=3.5&&compression)out.push({name:'Bull Pennant',dir:'BUY',score:82,obvConfirm:obvBull,compression});
 if(impulseUp>=6&&retrUp>=0&&retrUp<=5&&higher>=3)out.push({name:'Bull Flag',dir:'BUY',score:80,obvConfirm:obvBull,compression});
 if(impulseDn>=6&&retrDn>=0&&retrDn<=3.5&&compression)out.push({name:'Bear Pennant',dir:'SELL',score:82,obvConfirm:obvBear,compression});
 if(impulseDn>=6&&retrDn>=0&&retrDn<=5&&lower>=3)out.push({name:'Bear Flag',dir:'SELL',score:80,obvConfirm:obvBear,compression});
 const a=z.slice(-30,-15),b=z.slice(-15),l1=Math.min(...a.map(x=>x.l)),l2=Math.min(...b.map(x=>x.l)),h1=Math.max(...a.map(x=>x.h)),h2=Math.max(...b.map(x=>x.h));
 if(Math.abs(l2-l1)/(last.c||1)*100<=1.5&&last.c>avg(close.slice(-10)))out.push({name:'Double Bottom',dir:'BUY',score:72,obvConfirm:obvBull,compression});
 if(Math.abs(h2-h1)/(last.c||1)*100<=1.5&&last.c<avg(close.slice(-10)))out.push({name:'Double Top',dir:'SELL',score:72,obvConfirm:obvBear,compression});
 const hs=z.slice(-10).map(x=>x.h),ls=z.slice(-10).map(x=>x.l);
 if(hs.slice(1).filter((v,i)=>v<=hs[i]).length>=4&&higher>=4)out.push({name:'Falling Wedge',dir:'BUY',score:72,obvConfirm:obvBull,compression});
 if(ls.slice(1).filter((v,i)=>v>=ls[i]).length>=4&&lower>=4)out.push({name:'Rising Wedge',dir:'SELL',score:72,obvConfirm:obvBear,compression});
 return out;
}
const W={'Bull Pennant':24,'Bear Pennant':24,'Bull Flag':22,'Bear Flag':22,'Three Rising Valleys':20,'Rectangle Accumulation':15,'Rectangle Distribution':15,'Falling Wedge':14,'Rising Wedge':14,'Double Bottom':14,'Double Top':14};
function calc(x){
 if(!x?.observedAt||Date.now()-x.observedAt>180000)return null;
 const candles=(x?.candles||[]).slice(-96);if(candles.length<35)return null;const pats=patterns(candles);
 const candidate=(window.EPBackend24?.get?.()?.state||[]).find(s=>s.symbol===x.sym||s.asset===String(x.sym||'').replace('USDT',''));
 const backend=candidate&&Date.now()-Date.parse(candidate.updated_at)<=180000?candidate:null;
 const el=backend?.metrics?.earlyLeg||backend?.metrics?.early_leg||null,fv=backend?.metrics?.futuresValidation||el?.metrics?.futuresValidation||null;
 const localRows=window.EPEarlyLegObserver?.get?.()?.rows;
 const localCandidate=Array.isArray(localRows)?localRows.find(r=>r.sym===x.sym):localRows?.[x.sym]||null;
 const localTime=localCandidate?.updated_at||localCandidate?.observedAt||localCandidate?.ts;
 const local=localTime&&Date.now()-(typeof localTime==='number'?localTime:Date.parse(localTime))<=180000?localCandidate:null,pre=el||local,preDir=pre?.dir||null,ps=+pre?.score||0,fs=fv?.score,rsi=Number.isFinite(+x.rsi)?+x.rsi:50;
 function side(dir){
   const sideP=pats.filter(p=>p.dir===dir),best=[...sideP].sort((a,b)=>(W[b.name]||0)-(W[a.name]||0))[0]||null;
   const aligned=!preDir||preDir===dir;
   let parts={pattern:best?W[best.name]||8:0,preLeg:aligned?(ps>=80?28:ps>=65?22:ps>=50?14:ps>=40?7:0):0,futures:Number.isFinite(+fs)?Math.round(Math.min(15,+fs*.2)):0,obv:best?.obvConfirm?8:0,compression:best?.compression?5:0,antiStretch:0};
   if(dir==='BUY')parts.antiStretch=rsi>=80?-25:rsi>=74?-15:rsi>=69?-7:rsi<=28?-8:0;
   else parts.antiStretch=rsi<=20?-25:rsi<=26?-15:rsi<=31?-7:rsi>=72?-8:0;
   return{dir,best,parts,score:Math.round(clamp(Object.values(parts).reduce((a,v)=>a+v,0)))};
 }
 const buy=side('BUY'),sell=side('SELL'),s=sell.score>buy.score?sell:buy,score=s.score,phase=score>=80?'IGNIÇÃO':score>=65?'PRÉ-IGNIÇÃO':score>=50?'PRESSÃO':score>=35?'ACUMULAÇÃO':'OBSERVAÇÃO';
 return{version:'early-leg-motor-v1.1',score,phase,dir:s.dir,pattern:s.best?.name||null,patterns:pats.filter(p=>p.dir===s.dir).map(p=>p.name),parts:s.parts,rsi,preLegScore:ps,futuresScore:Number.isFinite(+fs)?+fs:null,buyScore:buy.score,sellScore:sell.score,shadowMode:true};
}
window.EPEarlyLegMotorV1={calc,patterns,VERSION:'early-leg-motor-v1.1'};window.dispatchEvent(new Event('ep-early-leg-motor-ready'));
})();