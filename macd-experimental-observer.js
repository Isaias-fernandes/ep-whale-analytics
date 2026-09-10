(()=>{
  const KEY='ep_macd_experimental_observer_v1';
  const MAX=3000;
  const ema=(v,p)=>{if(!v.length)return[];const k=2/(p+1),o=[v[0]];for(let i=1;i<v.length;i++)o.push(v[i]*k+o[i-1]*(1-k));return o};
  const macd=(candles)=>{
    const close=(candles||[]).map(x=>+x.c).filter(Number.isFinite);
    if(close.length<40)return null;
    const e12=ema(close,12),e26=ema(close,26),dif=close.map((_,i)=>e12[i]-e26[i]),dea=ema(dif,9),hist=dif.map((x,i)=>x-dea[i]);
    const i=close.length-1,p=i-1;
    const crossUp=dif[p]<=dea[p]&&dif[i]>dea[i],crossDown=dif[p]>=dea[p]&&dif[i]<dea[i];
    const histGrowing=Math.abs(hist[i])>Math.abs(hist[p])&&Math.sign(hist[i])===Math.sign(hist[p]);
    const histShrinking=Math.abs(hist[i])<Math.abs(hist[p])&&Math.sign(hist[i])===Math.sign(hist[p]);
    const zeroPos=dif[i]>0?'ACIMA':dif[i]<0?'ABAIXO':'ZERO';
    let divergence='NENHUMA';
    if(close.length>=30){
      const a0=close.length-24,a1=close.length-12;
      const oldP=close.slice(a0,a1),newP=close.slice(a1),oldH=hist.slice(a0,a1),newH=hist.slice(a1);
      const oldMax=Math.max(...oldP),newMax=Math.max(...newP),oldMin=Math.min(...oldP),newMin=Math.min(...newP);
      const oldHistMax=Math.max(...oldH),newHistMax=Math.max(...newH),oldHistMin=Math.min(...oldH),newHistMin=Math.min(...newH);
      if(newMax>oldMax&&newHistMax<oldHistMax)divergence='TOPO_BAIXISTA';
      else if(newMin<oldMin&&newHistMin>oldHistMin)divergence='FUNDO_ALTISTA';
    }
    let state='NEUTRO';
    if(crossUp)state=zeroPos==='ACIMA'?'CRUZAMENTO_DOURADO_FORTE':'CRUZAMENTO_DOURADO';
    else if(crossDown)state=zeroPos==='ABAIXO'?'CRUZAMENTO_MORTE_FORTE':'CRUZAMENTO_MORTE';
    else if(hist[i]>0&&histGrowing)state='MOMENTUM_COMPRADOR_CRESCENTE';
    else if(hist[i]<0&&histGrowing)state='MOMENTUM_VENDEDOR_CRESCENTE';
    else if(histShrinking)state='MOMENTUM_ENFRAQUECENDO';
    return{dif:dif[i],dea:dea[i],hist:hist[i],histPrev:hist[p],crossUp,crossDown,zeroPos,histGrowing,histShrinking,divergence,state};
  };
  const motorInfo=(asset,market)=>{try{const dir=asset?.signal?.dir||'NEUTRAL',a=window.EPConfluence?.analyze?.(asset,market,dir);if(!a)return{};return{direction:dir,motorCount:a.agree,signature:a.motors.map(m=>m.ok?'1':'0').join(''),motors:a.motors.filter(m=>m.ok).map(m=>m.name)};}catch{return{}}};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const save=(rows)=>{try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-MAX)))}catch{}};
  const record=(market,symbol,asset,res)=>{
    const mi=motorInfo(asset,market),rows=load(),last=rows.at(-1);
    const key=[market,symbol,res.state,res.divergence,mi.signature||''].join('|');
    if(last?.key===key&&Date.now()-last.at<5*60*1000)return;
    rows.push({key,at:Date.now(),market,symbol,price:+asset.price||+(asset.candles?.at(-1)?.c||0),macd:res,...mi});save(rows);
  };
  const badge=(r)=>{if(!r)return'—';return `${r.state.replaceAll('_',' ')} • hist ${r.hist.toFixed(6)} • ${r.zeroPos} zero${r.divergence!=='NENHUMA'?' • '+r.divergence.replaceAll('_',' '):''}`};
  function ensurePanel(){
    let el=document.getElementById('macdExperimentalObserver');if(el)return el;
    el=document.createElement('section');el.id='macdExperimentalObserver';el.className='card';
    el.innerHTML=`<h2>MACD 12/26/9 — OBSERVADOR EXPERIMENTAL</h2><p class="sub"><b>Somente observação.</b> Não altera os 5 motores, não gera entrada e não muda o MACD oficial 20/30/60.</p><div id="macdExpSummary" class="sub">Aguardando dados...</div><div id="macdExpRows"></div>`;
    const anchor=document.getElementById('decisionCenter')?.closest('section.card');
    (anchor?.parentNode||document.querySelector('main'))?.insertBefore(el,anchor?.nextSibling||null);return el;
  }
  function render(){
    ensurePanel();const rows=[];
    const cm=window.CryptoApp?.getData?.();if(cm)for(const [s,a] of cm){const r=macd(a.candles);if(r){record('crypto',s,a,r);rows.push({market:'CRIPTO',symbol:s,r,mi:motorInfo(a,'crypto')})}}
    const bm=window.B3App?.getData?.();if(bm)for(const [s,a] of bm){const r=macd(a.candles);if(r){record('b3',s,a,r);rows.push({market:'B3',symbol:s,r,mi:motorInfo(a,'b3')})}}
    const strong=rows.filter(x=>x.r.crossUp||x.r.crossDown||x.r.divergence!=='NENHUMA'||x.r.histGrowing).sort((a,b)=>(b.mi.motorCount||0)-(a.mi.motorCount||0)).slice(0,12);
    const sum=document.getElementById('macdExpSummary'),out=document.getElementById('macdExpRows');
    if(sum)sum.textContent=`${rows.length} ativos observados • ${strong.length} destaques exibidos • histórico local até ${MAX} observações.`;
    if(out)out.innerHTML=strong.length?`<table><thead><tr><th>Mercado</th><th>Ativo</th><th>Motores</th><th>Assinatura</th><th>Leitura MACD experimental</th></tr></thead><tbody>${strong.map(x=>`<tr><td>${x.market}</td><td><b>${x.symbol}</b></td><td>${x.mi.motorCount??'—'}</td><td>${x.mi.signature||'—'}</td><td>${badge(x.r)}</td></tr>`).join('')}</tbody></table>`:'<div class="sub">Nenhum destaque experimental neste ciclo.</div>';
  }
  window.EPMacdExperimentalObserver={analyze:macd,getHistory:load,render};
  window.addEventListener('crypto-data-updated',()=>setTimeout(render,50));
  window.addEventListener('b3-data-updated',()=>setTimeout(render,50));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensurePanel();setTimeout(render,1200)});else{ensurePanel();setTimeout(render,1200)}
})();