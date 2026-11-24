/* Altcoin Momentum v1.1: read-only view of hourly shadow observations. */
(()=>{'use strict';
const API='https://qhgclnkctpzumtybailv.supabase.co/rest/v1/rpc/ep_altcoin_momentum_read';
const KEY='sb_publishable__eewYv5qb1iFqw-xY3TkZA_7AjoQvZt';
const root=document.getElementById('altcoinMomentumPanel');if(!root)return;
let busy=false,cache=null,loaded=0;
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(x,d=2)=>x==null||!Number.isFinite(+x)?'—':(+x).toLocaleString('pt-BR',{maximumFractionDigits:d});
const p=x=>x==null?'—':(x>0?'+':'')+n(x,2)+'%';
const dt=x=>x?new Date(x).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const label=x=>({INSUFFICIENT_DATA:'Histórico insuficiente',NO_SIGNAL:'Sem candidato',WATCH:'Observar',CONFIRMED:'Confirmação técnica'}[x]||x||'—');
function render(){
 const d=cache||{},s=d.summary||{},m=d.market||{},states=d.states||[],events=d.events||[];
 const candidates=states.filter(x=>['WATCH','CONFIRMED'].includes(x.phase)).sort((a,b)=>(+b.score||0)-(+a.score||0));
 const cleanEvents=events.filter(e=>!e.metrics?.baseline_snapshot);
 root.innerHTML=`<style>
 #altcoinMomentumPanel .am-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin:10px 0}
 #altcoinMomentumPanel .am-stat,#altcoinMomentumPanel .am-note{border:1px solid #24455d;border-radius:10px;background:#091a29;padding:10px}
 #altcoinMomentumPanel .am-stat b{font-size:18px}#altcoinMomentumPanel .am-stat small{display:block;color:#91aabd}
 #altcoinMomentumPanel .am-wrap{overflow:auto;max-height:390px;margin:8px 0}
 #altcoinMomentumPanel table{border-collapse:collapse;width:100%;min-width:760px;font-size:12px}
 #altcoinMomentumPanel th,#altcoinMomentumPanel td{padding:7px;border-bottom:1px solid #20384d;text-align:left;white-space:nowrap}
 #altcoinMomentumPanel th{position:sticky;top:0;background:#0a2032;color:#9bb6cb}
 #altcoinMomentumPanel .am-good{color:#65e6ad}#altcoinMomentumPanel .am-warn{color:#ffd078}
 #altcoinMomentumPanel .am-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
 #altcoinMomentumPanel button{width:auto;padding:7px 11px}
 </style>
 <div class="am-head"><span><b>Última leitura: ${dt(d.generated_at)}</b> · coleta do servidor a cada hora</span><button id="amRefresh" type="button">Atualizar</button></div>
 <div class="am-grid">
  <div class="am-stat"><b>${p(m.btc_return_72h_pct)}</b><small>BTC em 72h</small></div>
  <div class="am-stat"><b>${n(m.breadth_72h_pct,1)}%</b><small>ativos positivos em 72h</small></div>
  <div class="am-stat"><b>${s.watch??0}</b><small>moedas em observação</small></div>
  <div class="am-stat"><b>${s.insufficient??0}/${s.coverage??0}</b><small>sem histórico de 72h</small></div>
 </div>
 <p class="sub">Score é pontuação experimental, não probabilidade. O filtro evita chamar de previsão um ativo que já subiu ≥10% em 72h ou ≥6% em 24h. “Confirmada” exige rompimento e volume relativo; não é ordem nem garantia de continuação.</p>
 <h3>Moedas para acompanhar (${candidates.length})</h3>
 ${candidates.length?`<div class="am-wrap"><table><thead><tr><th>Ativo</th><th>Fase</th><th>Score</th><th>Moeda 24h</th><th>Moeda 72h</th><th>Vantagem sobre BTC 72h</th><th>Volume 6h/18h</th><th>Rompimento 24h</th></tr></thead><tbody>${candidates.map(x=>`<tr><td>${esc(x.asset)}</td><td class="${x.phase==='CONFIRMED'?'am-good':'am-warn'}">${esc(label(x.phase))}</td><td>${n(x.score,0)}</td><td>${p(x.asset_return_24h)}</td><td>${p(x.asset_return_72h)}</td><td>${p(x.relative_strength_72h)}</td><td>${n(x.volume_ratio_6h,2)}×</td><td>${x.breakout_24h?'Sim':'Não'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="am-note sub">Nenhum ativo passou pelos critérios nesta leitura.</div>'}
 <h3>Validação do alvo +10% (episódios após o marco inicial: ${cleanEvents.length})</h3>
 <p class="sub">O painel mede se +10% ocorreu em até 24h, 72h ou 7 dias, junto da maior alta (MFE), maior queda (MAE) e desempenho relativo ao BTC. O primeiro snapshot foi separado e não será contado como previsão da alta já observada.</p>
 <div class="am-wrap"><table><thead><tr><th>Data</th><th>Ativo</th><th>Score</th><th>Preço inicial</th><th>MFE/MAE atual</th><th>+10%</th><th>24h</th><th>72h</th><th>7d</th><th>Status</th></tr></thead><tbody>${events.slice(0,40).map(e=>`<tr><td>${dt(e.signal_at)}${e.metrics?.baseline_snapshot?' · base':''}</td><td>${esc(e.asset)}</td><td>${n(e.score,0)}</td><td>${n(e.entry_price,8)}</td><td>${p(e.best_pct)} / ${p(e.worst_pct)}</td><td>${e.hit_10pct_at?'Sim · '+n(e.hours_to_10pct,1)+'h':'Aguardando'}</td><td>${e.outcome_24h?.hit_10pct?'Sim':e.outcome_24h?'Não':'—'}</td><td>${e.outcome_72h?.hit_10pct?'Sim':e.outcome_72h?'Não':'—'}</td><td>${e.outcome_7d?.hit_10pct?'Sim':e.outcome_7d?'Não':'—'}</td><td>${esc(e.status)}</td></tr>`).join('')}</tbody></table></div>`;
 root.querySelector('#amRefresh')?.addEventListener('click',()=>load(true));
}
async function load(force=false){
 if(busy)return;if(cache&&!force&&Date.now()-loaded<900000){render();return}
 busy=true;root.innerHTML='<p class="sub">Lendo o monitor de momentum...</p>';
 try{const r=await fetch(API,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);let d=await r.json();if(Array.isArray(d))d=d[0];if(!d?.ok)throw Error('resposta inválida');cache=d;loaded=Date.now();render()}
 catch(e){root.innerHTML='<p class="sub">Monitor temporariamente indisponível: '+esc(e.message)+'</p><button id="amRetry" type="button">Tentar novamente</button>';root.querySelector('#amRetry')?.addEventListener('click',()=>load(true))}
 finally{busy=false}
}
load();setInterval(()=>{if(document.visibilityState==='visible')load()},900000);
})();