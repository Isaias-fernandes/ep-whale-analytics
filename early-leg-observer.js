/*
 * OBSERVADOR EXPERIMENTAL DE INICIO DE PERNADA
 * Somente observacional: NAO altera EPDecision, EPConfluence, score, sinais ou os 5 motores.
 * Objetivo: identificar PRE-ALTA / PRE-BAIXA antes de 4-5 motores, medindo quanto do movimento ja foi consumido.
 */
(()=>{
  'use strict';
  const KEY='ep_early_leg_observer_v1', LIMIT=240, SNAP_LIMIT=120;
  const MOTOR_NAMES={1:'Tecnico',2:'Estrutura',3:'Volatilidade',4:'Bollinger/Keltner',5:'Volume/Fluxo'};
  const state=load(), prev=new Map();
  const $=s=>document.querySelector(s), now=()=>Date.now();
  function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&typeof x==='object'?{open:x.open||{},closed:Array.isArray(x.closed)?x.closed:[]}:{open:{},closed:[]}}catch{return{open:{},closed:[]}}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
  const n=v=>Number.isFinite(+v)?+v:null;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  function id(asset,market){return `${market}:${asset?.sym||asset?.ticker||asset?.key||'unknown'}`}
  function name(asset){return asset?.sym||asset?.ticker||asset?.key||'unknown'}
  function price(asset){const p=n(asset?.livePrice??asset?.price??asset?.regularMarketPrice??asset?.candles?.at?.(-1)?.c);return p&&p>0?p:null}
  function pct(a,b){return a?((b-a)/a)*100:0}
  function avg(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:0}
  function atr(c,p=14){if(!Array.isArray(c)||c.length<p+1)return null;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return avg(tr.slice(-p))}
  function activeMotors(d){return (d?.motors||[]).map((m,i)=>({id:i+1,ok:!!m.ok,dir:m.dir||'NEUTRAL',strength:+m.strength||0,name:m.name||MOTOR_NAMES[i+1]})).filter(m=>m.ok)}
  function direction(asset,d,active){
    if(d?.dir==='BUY'||d?.dir==='SELL')return d.dir;
    const sig=asset?.signal?.dir;if(sig==='BUY'||sig==='SELL')return sig;
    const buy=active.filter(m=>m.dir==='BUY').length,sell=active.filter(m=>m.dir==='SELL').length;
    return buy>sell?'BUY':sell>buy?'SELL':'NEUTRAL';
  }
  function aligned(dir,v,thr=0){return dir==='BUY'?v>thr:dir==='SELL'?v<-thr:false}
  function metrics(asset,d,market){
    const active=activeMotors(d), dir=direction(asset,d,active), p=price(asset), candles=asset?.candles||[];
    if(!p||dir==='NEUTRAL')return null;
    const old=prev.get(id(asset,market))||{};
    const flow=n(asset?.flow)||0, oi=n(asset?.oiChange)||0, vol=n(asset?.vol)||0, book=n(asset?.bookImbalance)||0, vw=n(asset?.vwap), a=atr(candles)||0;
    const last5=candles.length>=6?candles.at(-6)?.c:null, consumed=last5?pct(last5,p):0;
    const consumedDir=dir==='SELL'?-consumed:consumed;
    const last=candles.at(-1), prior=candles.slice(-21,-1), rangeAvg=prior.length?avg(prior.map(c=>(c.h-c.l)/(c.c||1)*100)):0;
    const rangeNow=last?(last.h-last.l)/(last.c||1)*100:0, rangeExpansion=rangeAvg?rangeNow/rangeAvg:1;
    const motorIds=active.map(m=>m.id), motorCount=active.length;
    let score=0;const reasons=[];
    if(motorCount>=1&&motorCount<=3){score+=8;reasons.push(`${motorCount} motor(es): fase precoce`)}
    if(motorIds.includes(5)){score+=20;reasons.push('M5 Volume/Fluxo ativo')}
    if(motorIds.includes(3)){score+=18;reasons.push('M3 Volatilidade ativo')}
    if(motorIds.includes(2)){score+=10;reasons.push('M2 Estrutura ativo')}
    if(aligned(dir,flow,.02)){score+=14;reasons.push('fluxo alinhado')}
    const flowDelta=flow-(n(old.flow)||0);if(aligned(dir,flowDelta,.01)){score+=10;reasons.push('fluxo acelerando')}
    if(oi>.15){score+=8;reasons.push('OI em expansao')}
    const oiDelta=oi-(n(old.oi)||0);if(oiDelta>.08){score+=6;reasons.push('OI acelerando')}
    if(vol>=1.2){score+=8;reasons.push('volume acima da media')}
    if(aligned(dir,book,.05)){score+=8;reasons.push('book alinhado')}
    if(vw&&aligned(dir,p-vw,0)){score+=6;reasons.push('preco no lado correto da VWAP')}
    if(rangeExpansion>=1.25){score+=8;reasons.push('expansao de range')}
    if(consumedDir<=.6){score+=10;reasons.push('movimento ainda pouco consumido')}
    else if(consumedDir<=1.2){score+=5}
    else if(consumedDir>2){score-=15;reasons.push('movimento possivelmente tardio')}
    if(motorCount>=4){score-=18;reasons.push('4-5 motores: confirmacao ja avancada')}
    score=clamp(Math.round(score));
    let phase='OBSERVAR';if(motorCount>=4)phase='CONFIRMACAO_AVANCADA';else if(score>=80)phase=dir==='BUY'?'ACELERACAO_ALTA':'ACELERACAO_BAIXA';else if(score>=65)phase=dir==='BUY'?'PRE_ALTA':'PRE_BAIXA';
    return {ts:now(),dir,score,phase,price:p,motorCount,motorIds,flow,flowDelta,oi,oiDelta,vol,book,vwap:vw,atr:a,consumedPct:consumedDir,rangeExpansion,reasons};
  }
  function updateEpisode(asset,market,m){
    const k=id(asset,market), e=state.open[k];
    if(!e){
      if(!['PRE_ALTA','PRE_BAIXA','ACELERACAO_ALTA','ACELERACAO_BAIXA'].includes(m.phase))return;
      state.open[k]={id:`${k}:${m.ts}`,market,asset:name(asset),dir:m.dir,startTs:m.ts,startPrice:m.price,startScore:m.score,startPhase:m.phase,startMotors:m.motorCount,startMotorIds:m.motorIds,peakScore:m.score,peakMotors:m.motorCount,currentPrice:m.price,mfe:0,mae:0,reached4:false,reached5:false,priceAt4:null,priceAt5:null,snapshots:[m]};return;
    }
    const move=e.dir==='BUY'?pct(e.startPrice,m.price):-pct(e.startPrice,m.price);
    e.currentPrice=m.price;e.mfe=Math.max(e.mfe||0,move);e.mae=Math.min(e.mae||0,move);e.peakScore=Math.max(e.peakScore||0,m.score);e.peakMotors=Math.max(e.peakMotors||0,m.motorCount);
    if(m.motorCount>=4&&!e.reached4){e.reached4=true;e.priceAt4=m.price;e.tsAt4=m.ts;e.moveAt4=move}
    if(m.motorCount>=5&&!e.reached5){e.reached5=true;e.priceAt5=m.price;e.tsAt5=m.ts;e.moveAt5=move}
    e.snapshots=e.snapshots||[];const last=e.snapshots.at(-1);if(!last||last.phase!==m.phase||last.motorCount!==m.motorCount||Math.abs(last.score-m.score)>=5)e.snapshots.push(m);e.snapshots=e.snapshots.slice(-SNAP_LIMIT);
    const reversed=m.dir!==e.dir&&m.phase!=='OBSERVAR';
    const stale=m.ts-e.startTs>6*60*60*1000;
    if(reversed||stale){e.endTs=m.ts;e.endPrice=m.price;e.endReason=reversed?'VIRADA_DIRECAO':'LIMITE_6H';e.finalReturn=move;delete state.open[k];state.closed.unshift(e);state.closed=state.closed.slice(0,LIMIT)}
  }
  function fmt(v,d=2){return Number.isFinite(+v)?(+v).toFixed(d).replace('.',','):'—'}
  function pc(v){return Number.isFinite(+v)?`${+v>=0?'+':''}${fmt(v,2)}%`:'—'}
  function ensure(){
    if($('#earlyLegObserverSection'))return;const host=document.querySelector('main');if(!host)return;
    const sec=document.createElement('section');sec.className='card';sec.id='earlyLegObserverSection';sec.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h2>OBSERVADOR DE INICIO DE PERNADA</h2><p class="sub"><b>Somente experimental.</b> Procura PRE-ALTA / PRE-BAIXA antes da confirmacao de 4-5 motores. Nao altera os 5 motores, score ou sinais oficiais.</p></div><span class="signal-badge warn">OBSERVACIONAL</span></div><div id="earlyLegObserver">Aguardando dados...</div>`;
    const ref=$('#motorPriceEvolutionSection')||$('#decisionCenter')?.closest('section.card');if(ref)ref.before(sec);else host.prepend(sec);
  }
  function render(){ensure();const root=$('#earlyLegObserver');if(!root)return;const open=Object.values(state.open).sort((a,b)=>(b.peakScore-a.peakScore)||(b.startTs-a.startTs)).slice(0,20);
    root.innerHTML=`<div class="sub">Acompanhando ${open.length} episodio(s). PRE-PERNADA exige sinais iniciais + fluxo/volatilidade/volume e penaliza movimento ja consumido. Dados locais deste navegador.</div><div style="overflow:auto"><table class="bt-table"><thead><tr><th>Ativo</th><th>Direcao</th><th>Fase inicial</th><th>Score inicial</th><th>Motores inicio</th><th>Mov. consumido</th><th>Chegou 4M</th><th>Chegou 5M</th><th>MFE</th><th>MAE</th></tr></thead><tbody>${open.length?open.map(e=>`<tr><td><b>${e.asset}</b><small>${e.market}</small></td><td class="${e.dir==='BUY'?'buy':'sell'}"><b>${e.dir==='BUY'?'ALTA':'BAIXA'}</b></td><td>${e.startPhase}</td><td>${e.startScore}</td><td>${(e.startMotorIds||[]).map(x=>'M'+x).join('+')||'—'}</td><td>${pc(e.snapshots?.[0]?.consumedPct)}</td><td>${e.reached4?pc(e.moveAt4):'—'}</td><td>${e.reached5?pc(e.moveAt5):'—'}</td><td class="buy">${pc(e.mfe)}</td><td class="sell">${pc(e.mae)}</td></tr>`).join(''):'<tr><td colspan="10">Nenhuma pre-pernada ativa neste momento.</td></tr>'}</tbody></table></div><p class="sub">A leitura nao e ordem de entrada. O estudo servira para comparar preco no PRE → 4 motores → 5 motores → MFE/MAE e descobrir quais sequencias realmente antecedem pernadas.</p>`;
  }
  function update(asset,market){const d=window.EPDecision?.calc?.(asset,market);if(!d)return;const m=metrics(asset,d,market);if(!m)return;updateEpisode(asset,market,m);prev.set(id(asset,market),{flow:m.flow,oi:m.oi,price:m.price,ts:m.ts});}
  function scan(){window.CryptoApp?.getData?.()?.forEach?.(x=>update(x,'crypto'));window.B3App?.getData?.()?.forEach?.(x=>update(x,'b3'));save();render();}
  window.addEventListener('crypto-data-updated',scan);window.addEventListener('b3-data-updated',scan);window.addEventListener('mtf-updated',scan);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();setTimeout(scan,3200)});else{ensure();setTimeout(scan,3200)}
  setInterval(()=>{if(!document.hidden)scan()},10000);
  window.EPEarlyLegObserver={scan,get:()=>state};
})();
