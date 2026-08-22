(()=>{
const $=s=>document.querySelector(s),fmt=(n,d=3)=>Number.isFinite(+n)?(+n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function n(id,def=0){const v=parseFloat($(id)?.value);return Number.isFinite(v)?v:def}
function parseCostR(){const txt=$('#btResults')?.innerText||'';let m=txt.match(/custo médio\/trade\s*([\d.,]+)R/i)||txt.match(/([\d.,]+)R\s*custo médio\/trade/i);return m?parseFloat(m[1].replace('.','').replace(',','.')):NaN}
function diagnose(){
 const host=$('#btCostDiagnostics'); if(!host)return;
 const fee=n('#btFee',.10),slip=n('#btSlip',.03),stopATR=n('#btStopATR',1.5),costR=parseCostR();
 const oneWay=fee+slip,roundTripPct=2*oneWay;
 let feeR=NaN,slipR=NaN,stopPct=NaN,costShare=NaN,minStop25=roundTripPct/.25,minStop50=roundTripPct/.50;
 let status='AGUARDANDO BACKTEST',cls='pending',detail='Execute o Backtest Rigoroso V3 para calcular a decomposição real de custos em R.';
 if(Number.isFinite(costR)&&costR>0){
   const den=fee+slip;
   feeR=den>0?costR*(fee/den):0;
   slipR=den>0?costR*(slip/den):0;
   stopPct=roundTripPct/costR;
   costShare=costR*100;
   if(costR>=.50){status='CUSTO ANORMALMENTE ALTO';cls='danger';detail=`O custo consome ${fmt(costShare,1)}% de 1R. Com os custos atuais, o stop médio implícito é só ${fmt(stopPct,3)}%. Isso torna o setup economicamente frágil.`}
   else if(costR>=.25){status='CUSTO ELEVADO';cls='warning';detail=`O custo consome ${fmt(costShare,1)}% de 1R. O sistema deve exigir vantagem bruta bem maior antes de aprovar esse setup.`}
   else {status='CUSTO SOB CONTROLE';cls='approved';detail=`O custo consome cerca de ${fmt(costShare,1)}% de 1R. Ainda deve sobreviver ao OOS e ao stress de custos.`}
 }
 const stopGuard=Number.isFinite(stopPct)&&stopPct<minStop50?'TRAVA ECONÔMICA: STOP CURTO DEMAIS':Number.isFinite(stopPct)&&stopPct<minStop25?'ATENÇÃO: STOP APERTADO':'STOP/CUSTO COMPATÍVEL';
 const guardCls=Number.isFinite(stopPct)&&stopPct<minStop50?'danger':Number.isFinite(stopPct)&&stopPct<minStop25?'warning':'approved';
 host.innerHTML=`<h3>Diagnóstico de custos — V2</h3>
 <div class="bt-kpis">
  <div><b>${fmt(fee,2)}%</b><span>fee por lado</span></div>
  <div><b>${fmt(slip,2)}%</b><span>slippage por lado</span></div>
  <div><b>${fmt(roundTripPct,2)}%</b><span>custo nominal ida+volta</span></div>
  <div><b>${Number.isFinite(feeR)?fmt(feeR,3)+'R':'—'}</b><span>fee em R</span></div>
  <div><b>${Number.isFinite(slipR)?fmt(slipR,3)+'R':'—'}</b><span>slippage em R</span></div>
  <div><b>${Number.isFinite(costR)?fmt(costR,3)+'R':'—'}</b><span>custo total em R</span></div>
  <div><b>${Number.isFinite(stopPct)?fmt(stopPct,3)+'%':'—'}</b><span>stop médio implícito</span></div>
  <div><b>${fmt(stopATR,2)} ATR</b><span>stop configurado</span></div>
 </div>
 <div class="wf-verdict ${cls}"><b>${status}</b><span>${detail}</span></div>
 <div class="wf-verdict ${guardCls}"><b>${stopGuard}</b><span>Para custo ≤0,50R, o stop médio deveria ser ≥ ${fmt(minStop50,3)}%. Para custo ≤0,25R, deveria ser ≥ ${fmt(minStop25,3)}%, mantidos fee e slippage atuais.</span></div>
 <div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>Componente</th><th>Valor</th><th>Interpretação</th></tr></thead><tbody>
 <tr><td>Fee total ida+volta</td><td>${fmt(2*fee,3)}%</td><td>${Number.isFinite(feeR)?fmt(feeR,3)+'R':'—'} do risco médio</td></tr>
 <tr><td>Slippage total ida+volta</td><td>${fmt(2*slip,3)}%</td><td>${Number.isFinite(slipR)?fmt(slipR,3)+'R':'—'} do risco médio</td></tr>
 <tr><td>Custo combinado</td><td>${fmt(roundTripPct,3)}%</td><td>${Number.isFinite(costR)?fmt(costR,3)+'R':'—'} por trade</td></tr>
 <tr><td>Stop médio estimado</td><td>${Number.isFinite(stopPct)?fmt(stopPct,3)+'%':'—'}</td><td>Distância percentual implícita pelo custo observado</td></tr>
 </tbody></table></div>
 <p class="sub"><b>Importante:</b> esta leitura não muda os indicadores. Ela verifica se a distância do stop é economicamente compatível com fee e slippage. Se o custo for alto em R, o EP deve rejeitar o setup mesmo que o resultado bruto pareça aceitável.</p>`;
}
function inject(){const area=$('#backtestArea');if(!area||$('#btCostDiagnostics'))return;const d=document.createElement('div');d.id='btCostDiagnostics';d.className='wf-block';const results=$('#btResults');results?.after(d);diagnose();const obs=new MutationObserver(()=>diagnose());if(results)obs.observe(results,{childList:true,subtree:true,characterData:true});['btFee','btSlip','btStopATR'].forEach(id=>$("#"+id)?.addEventListener('input',diagnose));}
setTimeout(inject,800);
})();
