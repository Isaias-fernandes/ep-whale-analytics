/*
 * MOTOR EXPERIMENTAL DE INÍCIO DE PERNADA V1 — shadow mode.
 * Detecta estrutura antes da sobrecompra; não altera EPDecision nem os 5 motores.
 */
(()=>{'use strict';
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x)),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function patterns(c){
 if(c.length<35||!window.EPMotor6PatternPolicy?.assess)return[];
 const z=c.slice(-35),last=z.at(-1),out=[],close=z.map(x=>+x.c),vol=z.map(x=>+x.v||0);
 const hi=Math.max(...z.slice(-21,-1).map(x=>+x.h)),lo=Math.min(...z.slice(-21,-1).map(x=>+x.l)),range=(hi-lo)/(last.c||1)*100;
 const lows=z.slice(-7).map(x=>+x.l),highs=z.slice(-7).map(x=>+x.h);
 const higher=lows.slice(1).filter((v,i)=>v>=lows[i]).length,lower=highs.slice(1).filter((v,i)=>v<=highs[i]).length;
 const ranges=z.slice(-20).map(x=>(+x.h-+x.l)/(+x.c||1)),compression=avg(ranges.slice(-5))/(avg(ranges.slice(0,15))||1)<=.85;
 const tr=[];for(let i=1;i<z.length;i++){const h=+z[i].h,l=+z[i].l,pc=+z[i-1].c;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}const atr=avg(tr.slice(-14));
 const volBase=avg(vol.slice(-23,-3)),volumeRatio=volBase>0?avg(vol.slice(-3))/(volBase||1):0;
 const obvSeries=[0];for(let i=1;i<z.length;i++){const step=close[i]>close[i-1]?1:close[i]<close[i-1]?-1:0;obvSeries.push(obvSeries[i-1]+step*vol[i])}
 const obvDelta=obvSeries.at(-1)-obvSeries[Math.max(0,obvSeries.length-4)],obvBull=obvDelta>0,obvBear=obvDelta<0;
 const distR=(hi-last.c)/(last.c||1)*100,distS=(last.c-lo)/(last.c||1)*100;
 const breakoutUp=atr>0&&last.c>hi+.15*atr,breakdown=atr>0&&last.c<lo-.15*atr;
 const add=(name,dir,condition,levels={})=>{if(!condition)return;const evidence={volumeRatio,obvConfirmed:dir==='BUY'?obvBull:obvBear,breakout:levels.breakout??breakoutUp,breakdown:levels.breakdown??breakdown};const p=window.EPMotor6PatternPolicy.assess(name,dir,evidence);out.push({...p,name,dir,score:p.points,obvConfirm:evidence.obvConfirmed,compression,volumeRatio,breakout:evidence.breakout,breakdown:evidence.breakdown})};
 if(higher>=4&&distR>=-1.5&&distR<=2.2)add('Three Rising Valleys','BUY',true);
 if(range<=8&&distR>=-2.5&&distR<=1.5)add('Rectangle Accumulation','BUY',true);
 if(range<=8&&distS>=-2.5&&distS<=1.5)add('Rectangle Distribution','SELL',true);
 const impulseWindow=z.slice(-18,-6),impulseHigh=Math.max(...impulseWindow.map(x=>+x.h)),impulseLow=Math.min(...impulseWindow.map(x=>+x.l)),impulseUp=(impulseHigh-impulseLow)/(impulseLow||1)*100,impulseDn=(impulseHigh-impulseLow)/(impulseHigh||1)*100;
 const retrUp=(Math.max(...z.slice(-12).map(x=>+x.h))-last.c)/(Math.max(...z.slice(-12).map(x=>+x.h))||1)*100;
 const retrDn=(last.c-Math.min(...z.slice(-12).map(x=>+x.l)))/(last.c||1)*100;
 if(impulseUp>=6&&retrUp>=0&&retrUp<=3.5&&compression)add('Bull Pennant','BUY',true);
 if(impulseUp>=6&&retrUp>=0&&retrUp<=5&&higher>=3)add('Bull Flag','BUY',true);
 if(impulseDn>=6&&retrDn>=0&&retrDn<=3.5&&compression)add('Bear Pennant','SELL',true,{breakdown});
 if(impulseDn>=6&&retrDn>=0&&retrDn<=5&&lower>=3)add('Bear Flag','SELL',true,{breakdown});
 const old=z.slice(-30,-15),recent=z.slice(-15),l1=Math.min(...old.map(x=>+x.l)),l2=Math.min(...recent.map(x=>+x.l)),h1=Math.max(...old.map(x=>+x.h)),h2=Math.max(...recent.map(x=>+x.h));
 const i1=old.findIndex(x=>+x.l===l1),i2=recent.findIndex(x=>+x.l===l2),between=z.slice(z.length-30+i1,z.length-15+i2+1),neckline=between.length?Math.max(...between.map(x=>+x.h)):Math.max(h1,h2);
 const doubleBottomBreak=atr>0&&last.c>neckline+.15*atr;
 if(Math.abs(l2-l1)/(last.c||1)*100<=1.5&&last.c>avg(close.slice(-10)))add('Double Bottom','BUY',true,{breakout:doubleBottomBreak});
 const hs=z.slice(-10).map(x=>+x.h),ls=z.slice(-10).map(x=>+x.l);
 if(hs.slice(1).filter((v,i)=>v<=hs[i]).length>=4&&higher>=4)add('Falling Wedge','BUY',true);
 if(ls.slice(1).filter((v,i)=>v>=ls[i]).length>=4&&lower>=4)add('Rising Wedge','SELL',true,{breakdown});
 return out;
}
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
   const sideP=pats.filter(p=>p.dir===dir),ordered=[...sideP].sort((a,b)=>(a.rank||99)-(b.rank||99)||b.points-a.points),best=ordered[0]||null,confirmedBest=ordered.find(p=>p.confirmed)||null;
   const aligned=!preDir||preDir===dir;
   let parts={pattern:best?best.points:0,preLeg:aligned?(ps>=80?28:ps>=65?22:ps>=50?14:ps>=40?7:0):0,futures:Number.isFinite(+fs)?Math.round(Math.min(15,+fs*.2)):0,obv:best?.obvConfirm?8:0,compression:best?.compression?5:0,antiStretch:0};
   if(dir==='BUY')parts.antiStretch=rsi>=80?-25:rsi>=74?-15:rsi>=69?-7:rsi<=28?-8:0;
   else parts.antiStretch=rsi<=20?-25:rsi<=26?-15:rsi<=31?-7:rsi>=72?-8:0;
   return{dir,best,confirmedBest,parts,score:Math.round(clamp(Object.values(parts).reduce((a,v)=>a+v,0)))};
 }
 const buy=side('BUY'),sell=side('SELL'),s=sell.score>buy.score?sell:buy,score=s.score,phase=score>=80?'IGNIÇÃO':score>=65?'PRÉ-IGNIÇÃO':score>=50?'PRESSÃO':score>=35?'ACUMULAÇÃO':'OBSERVAÇÃO';
 return{version:'early-leg-motor-v1.2',score,phase,dir:s.dir,pattern:s.best?.name||null,patterns:pats.filter(p=>p.dir===s.dir).map(p=>p.name),patternConfirmed:!!s.confirmedBest,confirmedPattern:s.confirmedBest?.name||null,patternStatus:s.confirmedBest?.status||s.best?.status||'AGUARDANDO PADRÃO',patternReason:s.confirmedBest?.reason||s.best?.reason||'sem estrutura prioritária',patternPriority:s.best?.rank??null,patternVolumeRatio:s.best?.volumeRatio??0,patternObvConfirmed:!!s.best?.obvConfirm,patternBreakoutConfirmed:!!s.best?.breakoutConfirmed,parts:s.parts,rsi,preLegScore:ps,futuresScore:Number.isFinite(+fs)?+fs:null,buyScore:buy.score,sellScore:sell.score,shadowMode:true};
}
window.EPEarlyLegMotorV1={calc,patterns,VERSION:'early-leg-motor-v1.2'};window.dispatchEvent(new Event('ep-early-leg-motor-ready'));
})();