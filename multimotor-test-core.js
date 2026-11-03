/* MM Validação v1: immutable experiment parameters; no orders or network. */
(function(root){'use strict';
const CONFIG=Object.freeze({version:'mm-validation-v1',intervalMs:300000,horizonHours:48,costPct:.20,atrPeriod:14,atrMultiplier:3,oiDropPct:-.35,fundingAbsPct:.08,minMotors:3});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function closedBars(rows,now){return [...new Map((rows||[]).filter(c=>['t','o','h','l','c'].every(k=>finite(c[k]))&&c.t+CONFIG.intervalMs<=now&&c.o>0&&c.l>0&&c.c>0&&c.h>=Math.max(c.o,c.c,c.l)&&c.l<=Math.min(c.o,c.c)).map(c=>[c.t,c])).values()].sort((a,b)=>a.t-b.t);}
function barsWithAtr(rows,now){const c=closedBars(rows,now),trs=c.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-c[i-1].c),Math.abs(x.l-c[i-1].c)):null);
 const at=(i)=>{const start=i-13;if(start<1||c.slice(start,i+1).some((x,j)=>x.t!==c[start].t+j*CONFIG.intervalMs)||c[start].t!==c[start-1].t+CONFIG.intervalMs)return null;return trs.slice(start,i+1).reduce((a,b)=>a+b,0)/14;};
 return c.map((x,i)=>[x.t,x.o,x.h,x.l,x.c,i?at(i-1):null,at(i)]);}
function evidence(x){const m=x.motorFingerprint?.list||[],tech=m.find(a=>a.id==='technical')?.ok===true,structure=m.find(a=>a.id==='structure')?.ok===true;
 const quality=x.derivativesQuality||{},fundingKnown=quality.funding===true&&finite(x.funding),oiKnown=quality.oi===true&&finite(x.oiChange);
 const directionalMove=x.direction==='SELL'?-x.oiWindowPriceChangePct:x.oiWindowPriceChangePct;
 const oiPass=oiKnown&&finite(directionalMove)&&!(x.oiChange<CONFIG.oiDropPct&&directionalMove>0);
 const fundingPass=fundingKnown&&Math.abs(x.funding)<=CONFIG.fundingAbsPct;
 const technicalStructure=tech&&structure,derivatives=oiPass&&fundingPass;
 return{technical:tech,structure,technicalStructure,oiKnown,fundingKnown,oiPass,fundingPass,derivatives,combined:technicalStructure&&derivatives,
  score:x.score,motors:x.motors,fundingPct:fundingKnown?x.funding:null,oiChangePct:oiKnown?x.oiChange:null,oiWindowPriceChangePct:finite(x.oiWindowPriceChangePct)?x.oiWindowPriceChangePct:null,ret30Pct:finite(x.ret30)?x.ret30:null};}
function sample(x,at){return{asset:x.sym,at,direction:x.direction,motors:x.motors,price:x.price,evidence:evidence(x),bars:barsWithAtr(x.candles,Date.parse(at))};}
const api={CONFIG,closedBars,barsWithAtr,evidence,sample};root.EPMultimotorTest=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
