(()=> {
  // EP LAB — Ciclo da Pernada V1. Observador experimental; não altera motores oficiais.
  const KEY='ep_leg_cycle_lab_v1', HIST='ep_leg_cycle_events_v1';
  const cache=new Map(), TTL=5*60e3;
  const states=['COMPRESSÃO','PRÉ-IGNIÇÃO','IGNIÇÃO','ACELERAÇÃO','ESTICAMENTO','PERDA DE FORÇA','DEVOLUÇÃO','RETESTE'];
  const num=v=>Number.isFinite(+v)?+v:0, pct=(a,b)=>a?((b-a)/a)*100:0;
  function load(k,d){try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch{return d}}
  let db=load(KEY,{}), events=load(HIST,[]);
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db));localStorage.setItem(HIST,JSON.stringify(events.slice(-5000)))}catch(e){}};
  async function h1(sym){ return window.EPH1Data?.get ? window.EPH1Data.get(sym) : []; }
  function stats(x,c){
    if(c.length<24)return {state:'SEM DADO',score:0};
    const cur=num(x.price)||c.at(-1).c, lo=Math.min(...c.map(z=>z.l)), hi=Math.max(...c.map(z=>z.h));
    const recent=c.slice(-6), prev=c.slice(-18,-6), v6=recent.reduce((s,z)=>s+z.v,0)/6, vp=prev.reduce((s,z)=>s+z.v,0)/Math.max(prev.length,1);
    const volRatio=vp?v6/vp:1, r6=pct(recent[0].o,cur), range=pct(lo,hi), pos=hi>lo?(cur-lo)/(hi-lo)*100:50;
    const rsi=num(x.rsi), cci=num(x.cci), atr=num(x.atr), oi=num(x.oiChange), book=num(x.bookImbalance), flow=num(x.flow);
    let score=0; if(r6>1)score+=15;if(r6>3)score+=15;if(volRatio>1.3)score+=15;if(oi>0.4)score+=10;if(book>0.08)score+=10;if(flow>0)score+=10;if(rsi>52&&rsi<78)score+=10;if(cci>50)score+=5;if(pos>70)score+=10;
    let state='COMPRESSÃO';
    if(range<5&&volRatio<1.15)state='COMPRESSÃO';
    if(score>=35)state='PRÉ-IGNIÇÃO';
    if(score>=50&&r6>1.5)state='IGNIÇÃO';
    if(score>=65&&r6>3)state='ACELERAÇÃO';
    if((rsi>=78||pos>=92)&&r6>4)state='ESTICAMENTO';
    if(pos>=80&&volRatio>1.2&&r6<1)state='PERDA DE FORÇA';
    if(hi>lo&&((hi-cur)/(hi-lo))*100>=50)state='DEVOLUÇÃO';
    if(hi>lo&&((hi-cur)/(hi-lo))*100>=75)state='RETESTE';
    return {state,score,cur,lo,hi,range,r6,volRatio,rsi,cci,atr,oi,book,flow,pos,giveback:hi>lo?(hi-cur)/(hi-lo)*100:0};
  }
  async function scan(){
    const map=window.CryptoApp?.getData?.(), pairs=window.CryptoApp?.getPairs?.()||[];
    const bySym=new Map(); map?.forEach?.(x=>bySym.set(x.sym,x));
    const rows=await Promise.all(pairs.map(async p=>{const sym=p[0],asset=p[1],x=bySym.get(sym)||{sym,key:asset};return {asset,sym,...stats(x,await h1(sym))}}));
    const now=Date.now();
    rows.forEach(r=>{const old=db[r.sym];if(!old||old.state!==r.state){events.push({ts:now,sym:r.sym,asset:r.asset,from:old?.state||null,to:r.state,score:r.score,price:r.cur,r6:r.r6,volRatio:r.volRatio,oi:r.oi,book:r.book,rsi:r.rsi,cci:r.cci});}db[r.sym]={...r,ts:now}});
    save();render(rows);window.dispatchEvent(new CustomEvent('ep-leg-cycle-updated',{detail:{rows}}));
  }
  const f=(v,d=1)=>Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
  function render(rows){
    const el=document.querySelector('#legCycleLab');if(!el)return;
    const order=new Map(states.map((s,i)=>[s,i])); rows.sort((a,b)=>(order.get(b.state)||0)-(order.get(a.state)||0)||b.score-a.score);
    const counts={};rows.forEach(r=>counts[r.state]=(counts[r.state]||0)+1);
    el.innerHTML='<div class="sub" style="margin-bottom:8px"><b>'+rows.length+'/50 moedas visíveis</b> • '+Object.entries(counts).map(([k,v])=>k+': '+v).join(' • ')+'</div><div style="overflow:auto;max-height:680px"><table class="price-track"><thead><tr><th>Ativo</th><th>Estado</th><th>Score</th><th>Preço</th><th>6h</th><th>Volume x</th><th>OI Δ</th><th>Book</th><th>RSI</th><th>CCI</th><th>Pos. 7d</th><th>Devolução</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+r.asset+'</b></td><td><b>'+r.state+'</b></td><td>'+f(r.score,0)+'</td><td>'+f(r.cur,r.cur<10?6:2)+'</td><td>'+f(r.r6,1)+'%</td><td>'+f(r.volRatio,2)+'x</td><td>'+f(r.oi,2)+'%</td><td>'+f(r.book,2)+'</td><td>'+f(r.rsi,1)+'</td><td>'+f(r.cci,1)+'</td><td>'+f(r.pos,1)+'%</td><td>'+f(r.giveback,1)+'%</td></tr>').join('')+'</tbody></table></div>';
  }
  window.addEventListener('crypto-data-updated',scan);window.addEventListener('crypto-realtime-updated',()=>{clearTimeout(window.__epLegCycleT);window.__epLegCycleT=setTimeout(scan,1200)});
  setTimeout(scan,3500);setInterval(scan,30000);window.EPLegCycleLab={scan,get:()=>db,events:()=>events};
})();