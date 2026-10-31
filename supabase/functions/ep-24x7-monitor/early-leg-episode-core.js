/* REP 10D v1: pure observer; no orders, network, or official motor mutations. */
(function(root){
'use strict';
const MS=300000,HOUR=3600000,HOURS=[1,6,12,24,48,72,120,168,240],TARGETS=[1,2,3,5,10,20];
const pct=(a,b)=>(b/a-1)*100,avg=a=>a.reduce((s,v)=>s+v,0)/(a.length||1);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function closed(rows,now){return [...new Map((rows||[]).filter(c=>c.t+MS<=now&&['t','o','h','l','c','v'].every(k=>finite(c[k]))&&c.o>0&&c.c>0&&c.l>0&&c.h>=Math.max(c.o,c.c,c.l)&&c.l<=Math.min(c.o,c.c)).map(c=>[c.t,c])).values()].sort((a,b)=>a.t-b.t);}
function retracement(dir,peak,trough,price){return Math.max(0,dir==='BUY'?-pct(peak,price):pct(trough,price));}
function phasePrices(old,dir,price){const same=old?.direction===dir||old?.dir===dir;return{peak:Math.max(same?+(old.peak_price??old.peakPrice??price):price,price),trough:Math.min(same?+(old.trough_price??old.troughPrice??price):price,price)};}
function selective(rows,phase,dir,now){
 const c=closed(rows,now).slice(-80);if(c.length<35||c.some((x,i)=>i&&x.t!==c[i-1].t+MS)||now-(c.at(-1).t+MS)>MS*2)return {approved:false,reason:'SEM VELAS FECHADAS RECENTES'};
 const z=c.at(-1),res=Math.max(...c.slice(-21,-1).map(x=>x.h)),priorMax=Math.max(...c.slice(-13,-3).map(x=>x.h));
 const vol=avg(c.slice(-3).map(x=>x.v))/(avg(c.slice(-23,-3).map(x=>x.v))||Infinity);
 let obv=0;for(let i=c.length-10;i<c.length;i++)obv+=Math.sign(c[i].c-c[i-1].c)*c[i].v;
 const last3=c.slice(-3),den=last3.reduce((s,x)=>s+x.v,0),flow=den?last3.reduce((s,x)=>s+(2*(x.tb??NaN)-x.v),0)/den:NaN;
 let gain=0,loss=0;for(let i=c.length-14;i<c.length;i++){let d=c[i].c-c[i-1].c;gain+=Math.max(d,0);loss+=Math.max(-d,0);}const rsi=loss?100-100/(1+gain/loss):gain?100:50;
 const move6=pct(c.at(-7).c,z.c),higher=avg(c.slice(-5).map(x=>x.l))>avg(c.slice(-10,-5).map(x=>x.l));
 const near=Math.abs(pct(z.c,res))<=1.5&&z.c>=res*.99;
 const retest=c.slice(-3,-1).some(x=>x.h>priorMax)&&z.l<=priorMax*1.004&&z.c>priorMax;
 const stage=retest?'RETESTE':z.c>res?'ROMPIMENTO':'PRÉ-IGNIÇÃO';
 const gates={direction:dir==='BUY',structure:higher,volume:vol>=1.2,obv:obv>0,flow:finite(flow)&&flow>=.10,momentum:z.c>avg(c.slice(-20).map(x=>x.c)),antiStretch:rsi<74&&move6<5&&move6>=0,entry:near||retest};
 return{approved:Object.values(gates).every(Boolean),stage,gates,rsi,move6,volumeRatio:vol,flow,obvDelta:obv,sourcePhase:phase};
}
function arm(signalAt,phase,evidence=null){return{signalAt,phase,evidence,entryTime:Math.ceil(signalAt/MS)*MS,entry:null,status:'PENDING',coverage:'COMPLETE',lastCloseTime:null,mfe:0,mae:0,returnPct:null,checkpoints:{},targets:{},stop:null,first5orStop:null,btcEntry:null,btcCoverage:'COMPLETE'};}
function advanceArm(a,rows,btcRows,now){
 if(a.status==='COMPLETED'||a.status==='MISSING_ENTRY')return;
 const bars=closed(rows,now),btc=new Map(closed(btcRows,now).map(c=>[c.t,c]));
 if(a.entry===null){const first=bars.find(c=>c.t===a.entryTime);if(!first){if(bars[0]?.t>a.entryTime){a.status='MISSING_ENTRY';a.coverage='PARTIAL';}return;}a.entry=first.o;a.lastCloseTime=a.entryTime;a.status='COLLECTING';const b=btc.get(a.entryTime);if(b)a.btcEntry=b.o;else a.btcCoverage='PARTIAL';}
 const end=a.entryTime+240*HOUR;
 for(const c of bars){const close=c.t+MS;if(close<=a.lastCloseTime||c.t<a.entryTime||close>end)continue;
  if(c.t!==a.lastCloseTime)a.coverage='PARTIAL';
  const up=pct(a.entry,c.h),down=pct(a.entry,c.l),before=a.mae;
  a.mfe=Math.max(a.mfe,up);a.mae=Math.min(a.mae,down);a.returnPct=pct(a.entry,c.c);a.lastCloseTime=close;
  const b=btc.get(c.t);if(!b)a.btcCoverage='PARTIAL';
  a.btcReturnPct=b&&a.btcEntry?pct(a.btcEntry,b.c):null;a.excessBtcPct=a.btcReturnPct===null?null:a.returnPct-a.btcReturnPct;
  if(!a.first5orStop){const hit=c.h>=a.entry*1.05,stop=c.l<=a.entry*.97;a.first5orStop=c.o>=a.entry*1.05?'TARGET_FIRST':c.o<=a.entry*.97?'STOP_FIRST':hit&&stop?'AMBIGUOUS':hit?'TARGET_FIRST':stop?'STOP_FIRST':null;}
  if(!a.stop&&c.l<=a.entry*.97)a.stop={at:close,hours:(close-a.entryTime)/HOUR};
  for(const p of TARGETS)if(!a.targets[p]&&up>=p)a.targets[p]={at:close,hours:(close-a.entryTime)/HOUR,maeBeforeCandle:before,maeThroughCandle:a.mae,orderWithinCandle:'UNKNOWN',coverage:a.coverage};
  for(const h of HOURS){const due=a.entryTime+h*HOUR;if(!a.checkpoints[h]&&close>=due)a.checkpoints[h]=close===due?{at:close,returnPct:a.returnPct,mfe:a.mfe,mae:a.mae,coverage:a.coverage,btcReturnPct:a.btcReturnPct,excessBtcPct:a.excessBtcPct,btcCoverage:a.btcCoverage}:{at:due,returnPct:null,coverage:'MISSING'};}
  if(close===end)a.status='COMPLETED';
 }
 if(now>end+MS&&a.lastCloseTime<end){a.status='COMPLETED';a.coverage='PARTIAL';for(const h of HOURS)if(!a.checkpoints[h])a.checkpoints[h]={at:a.entryTime+h*HOUR,returnPct:null,coverage:'MISSING'};}
}
function updateTrack(input,current,rows,btcRows,now){
 const track=structuredClone(input||{episode_id:current.episode_id,asset:current.asset,direction:current.direction,started_at:current.updated_at,entry_price:current.price,status:'COLLECTING',data:{version:'rep-10d-v1',prospective:true,referencePrice:current.price,sourceEpisodeStartedAt:current.episode_started_at,models:{}}});
 // Only BUY is evaluated as a prospective purchase. SELL remains in original observer.
 if(!input&&current.direction==='BUY')track.data.models.observer=arm(now,current.phase);
 if(current?.episode_id===track.episode_id&&current.direction==='BUY'&&!track.data.models.selective&&now-Date.parse(track.started_at)<24*HOUR){const e=selective(rows,current.phase,current.direction,now);track.data.lastSelectiveReading=e;if(e.approved)track.data.models.selective=arm(now,e.stage,e);}
 for(const a of Object.values(track.data.models))advanceArm(a,rows,btcRows,now);
 const models=Object.values(track.data.models),age=now-Date.parse(track.started_at);
 track.status=age>=24*HOUR&&models.every(a=>['COMPLETED','MISSING_ENTRY'].includes(a.status))?'COMPLETED':'COLLECTING';
 track.updated_at=new Date(now).toISOString();return track;
}
const api={MS,HOURS,TARGETS,closed,retracement,phasePrices,selective,arm,advanceArm,updateTrack};root.EPEarlyEpisodeCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
