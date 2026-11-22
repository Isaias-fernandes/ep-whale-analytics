/* Motor 8: independent cycle and early-leg shadow study. Read-only UI; collector runs in SQL. */
(()=>{'use strict';
const API='https://qhgclnkctpzumtybailv.supabase.co/rest/v1/rpc/ep_motor8_read';
const KEY='sb_publishable__eewYv5qb1iFqw-xY3TkZA_7AjoQvZt';
const root=document.getElementById('motor8CycleLab');
if(!root)return;
let cache=null,loadedAt=0,busy=false;
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,d=2)=>x==null||!Number.isFinite(+x)?'—':(+x).toLocaleString('pt-BR',{maximumFractionDigits:d});
const pct=x=>x==null?'—':`${+x>0?'+':''}${num(x,2)}%`;
const dt=x=>x?new Date(x).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const phase=x=>({INSUFFICIENT_DATA:'Dados insuficientes',NO_SIGNAL:'Sem candidato',WATCH:'Em observação',CONFIRMED:'Rompimento confirmado'}[x]||x||'—');
const regime=x=>({BULL:'Favorável',BEAR:'Fraco',NEUTRAL:'Neutro',NO_BTC:'BTC indisponível'}[x]||x||'—');
const outcome=x=>x?`${pct(x.return_pct)} • MFE ${pct(x.mfe_pct)} / MAE ${pct(x.mae_pct)}${x.coverage==='PARTIAL'?' • parcial':''}`:'Aguardando';
function render(){
 const d=cache;
 if(!d?.ok){root.innerHTML='<p class="sub">Histórico do Motor 8 indisponível. Tente atualizar.</p>';return}
 const s=d.summary||{},m=d.market||{},states=Array.isArray(d.states)?d.states:[],events=Array.isArray(d.events)?d.events:[];
 const candidates=states.filter(x=>['WATCH','CONFIRMED'].includes(x.phase)).sort((a,b)=>(+b.score||0)-(+a.score||0));
 const stateRows=states.filter(x=>x.phase!=='INSUFFICIENT_DATA').sort((a,b)=>(+b.score||0)-(+a.score||0));
 const recent=events.slice(0,30);
 root.innerHTML=`<style>
 #motor8CycleLab .m8-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;margin:12px 0}
 #motor8CycleLab .m8-stat,#motor8CycleLab .m8-card{border:1px solid #24455d;border-radius:12px;background:#091a29;padding:11px}
 #motor8CycleLab .m8-stat b{font-size:19px} #motor8CycleLab .m8-stat small{display:block;color:#90aabe}
 #motor8CycleLab .m8-tablewrap{overflow:auto;max-height:460px;margin:8px 0 16px}
 #motor8CycleLab table{border-collapse:collapse;width:100%;min-width:900px;font-size:12px}
 #motor8CycleLab th,#motor8CycleLab td{padding:8px;border-bottom:1px solid #20384d;text-align:left;white-space:nowrap}
 #motor8CycleLab th{position:sticky;top:0;background:#0a2032;color:#9bb6cb}
 #motor8CycleLab .m8-good{color:#65e6ad} #motor8CycleLab .m8-warn{color:#ffd078} #motor8CycleLab .m8-muted{color:#91a7ba}
 #motor8CycleLab .m8-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
 #motor8CycleLab .m8-btn{width:auto;padding:8px 12px}
 @media(max-width:650px){#motor8CycleLab .m8-grid{grid-template-columns:repeat(2,minmax(100px,1fr))}}
 </style>
 <div class="m8-head"><div><b>Coletor sombra: ${dt(d.generated_at)}</b><div class="sub">Atualização horária • nenhum sinal executa ordens</div></div><button class="m8-btn" id="m8Refresh" type="button">Atualizar</button></div>
 <div class="m8-grid">
  <div class="m8-stat"><b>${s.tracked??0}/${s.coverage??0}</b><small>pares com leitura suficiente</small></div>
  <div class="m8-stat"><b>${s.watch??0}</b><small>em observação</small></div>
  <div class="m8-stat"><b>${s.confirmed??0}</b><small>rompimentos confirmados</small></div>
  <div class="m8-stat"><b>${esc(regime(m.regime))}</b><small>regime BTC / amplitude ${num(m.breadth_pct,1)}%</small></div>
 </div>
 <p class="sub">O score 0–100 é uma pontuação experimental, não uma probabilidade. “Confirmado” indica rompimento técnico; não significa que a alta vá continuar. A cobertura de 30 dias só fica completa depois de o histórico horário acumular 30 dias.</p>
 <h3>Candidatos atuais (${candidates.length})</h3>
 ${candidates.length?`<div class="m8-tablewrap"><table><thead><tr><th>Ativo</th><th>Fase</th><th>Score</th><th>Regime</th><th>Dist. mínima 14d</th><th>Dist. mínima 30d</th><th>Volume 6h / 18h</th><th>Compressão 24h / 7d</th><th>Leitura</th></tr></thead><tbody>${candidates.map(x=>`<tr><td>${esc(x.asset)}</td><td class="${x.phase==='CONFIRMED'?'m8-good':'m8-warn'}">${esc(phase(x.phase))}</td><td>${num(x.score,0)}</td><td>${esc(regime(x.market_regime))}</td><td>${pct(x.metrics?.distance_to_low_14d_pct)}</td><td>${pct(x.metrics?.distance_to_low_30d_pct)}</td><td>${num(x.metrics?.volume_6h_vs_previous_18h,2)}×</td><td>${num(x.metrics?.range_24h_vs_7d,2)}×</td><td>${x.metrics?.breakout_6h?'Fechou acima da faixa de 6h':'Sem rompimento de 6h'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="m8-card m8-muted">Nenhum candidato atingiu os critérios nesta leitura.</div>'}
 <h3>Acompanhamento por ativo</h3>
 <div class="m8-tablewrap"><table><thead><tr><th>Ativo</th><th>Fase</th><th>Score</th><th>Regime</th><th>Preço</th><th>Atualização</th><th>Candles</th><th>30d completos</th></tr></thead><tbody>${stateRows.map(x=>`<tr><td>${esc(x.asset)}</td><td>${esc(phase(x.phase))}</td><td>${num(x.score,0)}</td><td>${esc(regime(x.market_regime))}</td><td>${num(x.price,8)}</td><td>${dt(x.observed_at)}</td><td>${num(x.metrics?.candles_available,0)}</td><td>${x.metrics?.history_30d_complete?'Sim':'Ainda não'}</td></tr>`).join('')}</tbody></table></div>
 <h3>Histórico do experimento (${events.length} episódios)</h3>
 <div class="m8-grid">
  <div class="m8-stat"><b>${s.matured_24h??0}</b><small>resultados 24h maduros</small></div>
  <div class="m8-stat"><b>${s.matured_72h??0}</b><small>resultados 72h maduros</small></div>
  <div class="m8-stat"><b>${s.matured_7d??0}</b><small>resultados 7d maduros</small></div>
  <div class="m8-stat"><b>${s.hit_5pct_7d??0}/${s.matured_7d??0}</b><small>episódios com MFE ≥5% em 7d</small></div>
 </div>
 <div class="m8-tablewrap"><table><thead><tr><th>Início</th><th>Ativo</th><th>Score/fase</th><th>Regime</th><th>Entrada</th><th>Atual</th><th>MFE/MAE até agora</th><th>24h</th><th>72h</th><th>7d</th><th>Status</th></tr></thead><tbody>${recent.map(e=>`<tr><td>${dt(e.signal_at)}</td><td>${esc(e.asset)}</td><td>${num(e.score,0)} • ${esc(phase(e.phase))}</td><td>${esc(regime(e.market_regime))}</td><td>${num(e.entry_price,8)}</td><td>${num(e.last_price,8)}</td><td>${pct(e.best_pct)} / ${pct(e.worst_pct)}</td><td>${esc(outcome(e.outcome_24h))}</td><td>${esc(outcome(e.outcome_72h))}</td><td>${esc(outcome(e.outcome_7d))}</td><td>${esc(e.status)}</td></tr>`).join('')}</tbody></table></div>
 <p class="sub">Os resultados “MFE/MAE” medem a maior alta e a maior queda após o alerta; não determinam qual ocorreu primeiro quando ambos aparecem no mesmo candle.</p>`;
 root.querySelector('#m8Refresh')?.addEventListener('click',()=>load(true));
}
async function load(force=false){
 if(busy)return;
 if(cache&&!force&&Date.now()-loadedAt<900000){render();return}
 busy=true;root.innerHTML='<p class="sub">Carregando histórico isolado do Motor 8...</p>';
 try{const r=await fetch(API,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);let d=await r.json();if(Array.isArray(d))d=d[0];if(!d?.ok)throw Error('Resposta inválida');cache=d;loadedAt=Date.now();render()}
 catch(e){root.innerHTML=`<p class="sub">Motor 8 indisponível: ${esc(e.message)}. A coleta do servidor é independente do navegador.</p><button class="m8-btn" id="m8Retry" type="button">Tentar novamente</button>`;root.querySelector('#m8Retry')?.addEventListener('click',()=>load(true))}
 finally{busy=false}
}
load();setInterval(()=>{if(document.visibilityState==='visible')load()},900000);
})();
