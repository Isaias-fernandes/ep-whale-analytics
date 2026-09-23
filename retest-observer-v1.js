(()=> {
  // EP Retest Observer V1 — experimental/read-only observer.
  // Does not modify the 5 official engines or Reversal Gate.
  const KEY='ep_retest_observer_v1';
  const LOOKBACK=168; // candles from CryptoApp (up to 220)
  const NEAR_PCT=8;
  const levels=[50,30,20,10];

  function givebackClass(g){
    if(!Number.isFinite(g)) return 'SEM DADO';
    if(g < 50) return 'DEVOLUÇÃO <50%';
    if(g < 61.8) return 'RETRAÇÃO 50–61,7%';
    if(g < 75) return 'RETESTE INICIAL 61,8–74,9%';
    if(g < 90) return 'RETESTE PROFUNDO 75–89,9%';
    if(g <= 105) return 'RETORNO AO FUNDO 90–105%';
    return 'FUNDO PERDIDO >105%';
  }

  const pct=(a,b)=>a?((b-a)/a)*100:NaN;
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}};
  const db=load();
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db));return true}catch(e){console.warn('EP Retest: armazenamento local indisponível',e);return false}};

  function analyze(x){
    const c=(x.candles||[]).slice(-LOOKBACK);
    if(c.length<10)return null;
    // Find a low that occurs before the subsequent high.
    let low=Infinity, lowI=-1, high=-Infinity, highI=-1;
    for(let i=0;i<c.length;i++){
      if(c[i].l<low){low=c[i].l;lowI=i;high=-Infinity;highI=-1}
      if(lowI>=0 && i>lowI && c[i].h>high){high=c[i].h;highI=i}
    }
    if(!(low>0&&highI>lowI))return null;
    const leg=pct(low,high);
    if(leg<10)return null;
    const current=+x.price||c.at(-1).c;
    const distLow=pct(low,current);
    const giveback=((high-current)/(high-low))*100;
    const tier=levels.find(v=>leg>=v)||10;
    const status=distLow<=NEAR_PCT?`RETESTE-${tier}`:distLow<=NEAR_PCT*1.75?'APROXIMANDO':'LONGE';
    const givebackStatus=givebackClass(giveback);
    return {asset:x.key,sym:x.sym,low,high,current,leg,distLow,giveback,givebackStatus,tier,status,lowTs:c[lowI].t,highTs:c[highI].t,ts:Date.now()};
  }

  function outcome(r,hours){
    const x=window.CryptoApp?.getData?.()?.get?.(r.sym);
    if(!x)return null;
    const p=+x.price;
    return pct(r.current,p);
  }

  function scan(){
    const map=window.CryptoApp?.getData?.();
    if(!map?.size){render([],0);return;}
    const rows=[];
    map.forEach(x=>{const r=analyze(x);if(r)rows.push(r)});
    rows.sort((a,b)=>{
      const rank=s=>s==='RETESTE-50'?0:s==='RETESTE-30'?1:s==='RETESTE-20'?2:s==='RETESTE-10'?3:s==='APROXIMANDO'?4:5;
      return b.giveback-a.giveback||rank(a.status)-rank(b.status);
    });
    const now=Date.now();
    db.events=db.events||[];
    for(const r of rows.filter(x=>x.status.startsWith('RETESTE'))){
      let e=db.events.find(e=>e.sym===r.sym&&e.status===r.status&&!e.closed&&now-e.startTs<86400000);
      if(!e){e={...r,startTs:now,p0:r.current};db.events.push(e)}
      for(const h of [1,4,24]){
        if(!e['r'+h]&&now-e.startTs>=h*3600000)e['r'+h]=outcome(e,h);
      }
      if(now-e.startTs>=86400000)e.closed=true;
    }
    db.events=db.events.slice(-500);
    db.rows=rows;db.updatedAt=now;render(rows,map.size);save();
    window.dispatchEvent(new CustomEvent('ep-retest-updated',{detail:{rows}}));
  }

  const f=(n,d=2)=>Number.isFinite(+n)?(+n).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
  function render(rows,total=window.CryptoApp?.getData?.()?.size||0){
    let el=document.querySelector('#retestObserver');
    if(!el)return; // painel tem posição fixa no index.html; não injeta conteúdo em outras áreas do EP.
    const show=rows.filter(r=>r.giveback>=50 || r.status!=='LONGE').slice(0,25);
    const diag=`<div class="sub" style="margin-bottom:8px">Dados recebidos: <b>${total}/50 moedas</b> • Pernadas ≥10% detectadas: <b>${rows.length}</b> • Exibidas: <b>${show.length}</b></div>`;
    el.innerHTML=diag+(show.length?`<div style="overflow:auto"><table class="price-track"><thead><tr><th>Ativo</th><th>Pernada</th><th>Classe devolução</th><th>Mínima</th><th>Máxima</th><th>Atual</th><th>Dist. fundo</th><th>Devolução</th></tr></thead><tbody>${show.map(r=>`<tr><td><b>${r.asset}</b></td><td><b>+${f(r.leg,1)}% (≥${r.tier}%)</b></td><td><b>${r.givebackStatus}</b></td><td>${f(r.low,r.low<10?6:2)}</td><td>${f(r.high,r.high<10?6:2)}</td><td>${f(r.current,r.current<10?6:2)}</td><td>${f(r.distLow,1)}%</td><td>${f(r.giveback,1)}%</td></tr>`).join('')}</tbody></table></div>`:'Nenhum ativo atingiu agora os critérios de devolução/reteste para exibição.');
  }
  window.addEventListener('crypto-data-updated',scan);
  window.addEventListener('crypto-realtime-updated',scan);
  setTimeout(scan,2500);setInterval(scan,30000);
  window.EPRetestObserver={scan,get:()=>db};
})();