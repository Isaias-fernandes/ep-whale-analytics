/* Prospective shadow comparison. No orders or network calls. */
(() => {
 const KEY='ep_prospective_comparison_v1', WINDOWS=[1,4,24,168], COST=0.20, MAX_AGE=180000;
 let db;try{db=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
 db=db||{version:1,startedAt:Date.now(),costPct:COST,episodes:[]};
 const ret=(entry,p,dir)=>(dir==='SELL'?-1:1)*(p-entry)/entry*100;
 function save(){try{localStorage.setItem(KEY,JSON.stringify(db))}catch{console.warn('Experimento: armazenamento local indisponível')}}
 function advance(leg,x,now){
   const p=+(x.livePrice??x.price);if(!Number.isFinite(p)||p<=0)return;
   if(now-leg.lastAt>120000)leg.coverageGap=true;
   leg.lastAt=now;const r=ret(leg.price,p,leg.dir);leg.mfe=Math.max(leg.mfe,r);leg.mae=Math.min(leg.mae,r);
   for(const target of [3,5,10,20])if(r>=target&&!leg.targets[target])leg.targets[target]=(now-leg.at)/3600000;
   for(const hours of WINDOWS){if(leg.results[hours]||now<leg.at+hours*3600000)continue;
     const late=now-(leg.at+hours*3600000)>120000;
     leg.results[hours]={observedAt:now,price:p,grossPct:r,netPct:r-db.costPct,mfe:leg.mfe,mae:leg.mae,giveback:leg.mfe-r,valid:!late&&!leg.coverageGap};
   }
 }
 function leg(x,dir,now){return{at:now,price:+(x.livePrice??x.price),dir,lastAt:now,mfe:0,mae:0,targets:{},results:{},coverageGap:false}}
 function scan(){
   const now=Date.now(),map=window.CryptoApp?.getData?.();if(!map)return;
   for(const [symbol,x] of map){
     if(!x.observedAt||now-x.observedAt>MAX_AGE)continue;
     const m6=window.EPEarlyLegMotorV1?.calc?.(x),five=window.EPDecision?.calc?.(x,'crypto');
     if(!m6||!five||!(+(x.livePrice??x.price)>0))continue;
     let ep=[...db.episodes].reverse().find(e=>e.symbol===symbol&&now-e.early.at<168*3600000);
     if(!ep&&m6.score>=50){ep={id:symbol+':'+now,symbol,pattern:m6.pattern,score:m6.score,cohort:now<db.startedAt+30*86400000?'development':'validation',early:leg(x,m6.dir,now),confirmed:null};db.episodes.push(ep)}
     if(!ep)continue;
     advance(ep.early,x,now);
     if(!ep.confirmed&&five.dir===ep.early.dir&&five.motorAgree>=4)ep.confirmed=leg(x,five.dir,now);
     if(ep.confirmed)advance(ep.confirmed,x,now);
   }
   save();render();
 }
 function render(){
   const anchor=document.querySelector('#liveOperationsSection');if(!anchor)return;
   let panel=document.getElementById('epProspectiveComparison');if(!panel){panel=document.createElement('section');panel.id='epProspectiveComparison';panel.className='card';anchor.insertAdjacentElement('afterend',panel)}
   let rows='';for(const hours of WINDOWS)for(const side of ['early','confirmed']){
     const all=db.episodes.filter(e=>e.cohort==='validation').map(e=>e[side]?.results[hours]).filter(Boolean),valid=all.filter(r=>r.valid),mean=valid.length?valid.reduce((s,r)=>s+r.netPct,0)/valid.length:null;
     rows+='<tr><td>'+hours+'h</td><td>'+(side==='early'?'Motor 6 ≥50':'Confirmação ≥4 motores')+'</td><td>'+valid.length+'</td><td>'+(all.length-valid.length)+'</td><td>'+(mean==null?'Aguardando':mean.toFixed(3)+'%')+'</td></tr>';
   }
   panel.innerHTML='<h2>EXPERIMENTO — ANTECIPAÇÃO E CONFIRMAÇÃO</h2><p>Coleta prospectiva local, sem ordens. Custo simulado de ida e volta: '+db.costPct+'%. Não representa sua taxa real. Primeiros 30 dias: desenvolvimento; depois: validação. Resultados com lacunas ficam fora da média.</p><p>'+db.episodes.length+' episódios • '+db.episodes.filter(e=>e.confirmed).length+' confirmações. Janelas contadas a partir da entrada de cada alternativa. MFE/MAE e alvos usam preços observados, não extremos entre observações.</p><table><tr><th>Janela</th><th>Alternativa</th><th>Válidos em validação</th><th>Com lacuna</th><th>Retorno líquido médio</th></tr>'+rows+'</table><button type="button" id="epExportProspective">Exportar registros</button>';
   document.getElementById('epExportProspective').onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='ep-comparacao-prospectiva.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
 }
 window.EPProspectiveComparison={get:()=>db,scan,setCost:p=>{if(db.episodes.length)throw Error('Custo congelado após primeira entrada');if(Number.isFinite(p)&&p>=0){db.costPct=p;save()}}};
 window.addEventListener('crypto-data-updated',scan);
 window.addEventListener('ep-early-leg-updated',scan);
 setTimeout(scan,2000);
})();
