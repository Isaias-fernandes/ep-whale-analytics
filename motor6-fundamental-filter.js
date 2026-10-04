/*
 * FILTRO FUNDAMENTAL DO MOTOR 6 — camada complementar, somente para leitura.
 * Uma avaliação atual por ativo fica no localStorage deste navegador; não usa Supabase,
 * não grava histórico e não modifica o score técnico nem os cinco motores oficiais.
 */
(()=>{'use strict';
const STORE='ep_m6_fundamental_check_v1';
const ITEMS=[
 {id:'utility',label:'Utilidade do token',help:'O token tem função clara e necessária no projeto?'},
 {id:'adoption',label:'Uso e adoção',help:'Há uso real, usuários, aplicações ou atividade verificável?'},
 {id:'liquidity',label:'Liquidez',help:'O volume e a profundidade permitem entrar e sair sem grande impacto?'},
 {id:'supply',label:'Oferta e desbloqueios',help:'A emissão, concentração e calendário de desbloqueios são sustentáveis?'},
 {id:'transparency',label:'Transparência e riscos',help:'Equipe, documentação, segurança e riscos são verificáveis?'}
];
let records={};
try{records=JSON.parse(localStorage.getItem(STORE)||'{}')||{}}catch{records={}}
const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function options(){
 const pairs=window.CryptoApp?.getPairs?.()||[];
 return pairs.map(p=>({symbol:p[0],label:p[1]+'/USDT'}));
}
function assetLabel(sym){return options().find(x=>norm(x.symbol)===norm(sym)||norm(x.label)===norm(sym))?.label||String(sym||'').toUpperCase()}
function result(r){
 if(!r)return{label:'Não avaliado',score:null,cls:'m6f-unknown'};
 const vals=ITEMS.map(i=>r.ratings?.[i.id]);
 if(vals.some(v=>v===0))return{label:'Risco identificado',score:vals.filter(v=>v===2).length*20+vals.filter(v=>v===1).length*10,cls:'m6f-risk'};
 if(vals.some(v=>v!==1&&v!==2))return{label:'Incompleto',score:null,cls:'m6f-unknown'};
 const score=vals.reduce((a,v)=>a+v*10,0);
 if(score>=80)return{label:'Fundamento favorável',score,cls:'m6f-good'};
 if(score>=50)return{label:'Revisar antes de priorizar',score,cls:'m6f-review'};
 return{label:'Risco elevado',score,cls:'m6f-risk'};
}
function status(sym){
 const r=records[norm(sym)],v=result(r);
 return{...v,date:r?.reviewedAt||null};
}
function renderTable(){
 const box=document.getElementById('m6FundamentalWatch');
 if(!box)return;
 const rows=window.EPMotor6Watch?.get?.()||[];
 if(!rows.length){box.innerHTML='<p class="m6f-muted">Nenhum ativo está em acompanhamento pelo Motor 6.</p>';return}
 box.innerHTML='<div class="m6f-table-wrap"><table class="m6f-table"><thead><tr><th>Ativo</th><th>Sinal Motor 6</th><th>Score técnico</th><th>Filtro fundamental</th></tr></thead><tbody>'+
 rows.map(o=>{const s=status(o.asset);return '<tr><td><b>'+esc(assetLabel(o.asset))+'</b></td><td>'+esc(o.lastDir||o.entryDir||'—')+' · '+esc(o.lastPhase||o.entryPhase||'—')+'</td><td>'+esc(o.lastScore??o.entryScore??'—')+'</td><td><span class="m6f-badge '+s.cls+'">'+esc(s.label)+(s.score===null?'':' · '+s.score+'/100')+'</span></td></tr>'}).join('')+
 '</tbody></table></div><p class="m6f-muted">O filtro fundamental qualifica o projeto; não confirma entrada nem muda o sinal técnico.</p>';
}
function mount(){
 const section=document.getElementById('motor6WatchSection');
 if(!section||document.getElementById('m6FundamentalCard'))return;
 const card=document.createElement('div');
 card.id='m6FundamentalCard';
 card.className='m6f-card';
 card.innerHTML='<h3>🔎 FILTRO DE QUALIDADE DO PROJETO — MOTOR 6</h3>'+
 '<p class="m6f-muted">Use esta lista antes de priorizar um sinal: utilidade do token, adoção verificável, liquidez, oferta/desbloqueios e transparência/segurança. A avaliação é manual e complementar; não altera os cinco motores nem o score de mercado do Motor 6.</p>'+
 '<div class="m6f-form">'+
 '<label>Ativo<select id="m6fAsset"></select></label>'+
 ITEMS.map(i=>'<label class="m6f-item"><span><b>'+esc(i.label)+'</b><small>'+esc(i.help)+'</small></span><select data-m6f-rating="'+i.id+'"><option value="">Não avaliado</option><option value="2">Favorável — evidência verificada</option><option value="1">Misto — precisa confirmar</option><option value="0">Risco — evidência desfavorável</option></select></label>').join('')+
 '<label class="m6f-notes">Fonte/evidência consultada (opcional)<textarea id="m6fNotes" maxlength="500" placeholder="Ex.: documentação oficial, dados de uso, calendário de desbloqueios"></textarea></label>'+
 '<div class="m6f-actions"><button type="button" id="m6fSave">Salvar avaliação</button><button type="button" id="m6fClear" class="secondary">Apagar avaliação deste ativo</button><span id="m6fResult" role="status"></span></div></div>'+
 '<h4>Ativos acompanhados pelo Motor 6</h4><div id="m6FundamentalWatch"></div>'+
 '<p class="m6f-foot">Os dados da avaliação ficam somente neste navegador (uma versão atual por moeda), sem histórico e sem chamadas adicionais ao Supabase.</p>';
 const style=document.createElement('style');
 style.textContent='#m6FundamentalCard{margin-top:14px;padding:14px;border:1px solid #315a72;border-radius:12px;background:#081a29}#m6FundamentalCard h3{margin:0 0 7px}#m6FundamentalCard h4{margin:16px 0 8px}.m6f-muted,.m6f-foot{color:#9db0c5;font-size:12px;line-height:1.45}.m6f-foot{border-top:1px solid #20334a;padding-top:8px}.m6f-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:9px}.m6f-form>label{display:flex;flex-direction:column;gap:5px}.m6f-form select,.m6f-form textarea{width:100%;box-sizing:border-box;padding:9px;border-radius:7px;background:#0b1726;color:#e8eef6;border:1px solid #35516e}.m6f-item{padding:8px;border:1px solid #20334a;border-radius:8px}.m6f-item small{display:block;color:#9db0c5;margin:3px 0 6px}.m6f-notes{grid-column:1/-1}.m6f-form textarea{min-height:58px}.m6f-actions{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.m6f-actions button{width:auto}.m6f-badge{display:inline-block;padding:4px 7px;border-radius:7px;font-size:11px}.m6f-good{color:#7ff0c7;background:#103426}.m6f-review{color:#ffd06c;background:#352b10}.m6f-risk{color:#ff9da6;background:#371920}.m6f-unknown{color:#b9c4d1;background:#1d2936}.m6f-table-wrap{overflow:auto}.m6f-table{width:100%;min-width:520px;border-collapse:collapse}.m6f-table th,.m6f-table td{padding:8px;border-bottom:1px solid #20334a;text-align:left;font-size:12px}';
 section.appendChild(card);section.appendChild(style);
 const sel=document.getElementById('m6fAsset'),pairs=options();
 sel.innerHTML=pairs.map(p=>'<option value="'+esc(p.symbol)+'">'+esc(p.label)+'</option>').join('');
 function load(){
   const key=norm(sel.value),r=records[key]||{};
   ITEMS.forEach(i=>{const el=card.querySelector('[data-m6f-rating="'+i.id+'"]');el.value=r.ratings?.[i.id]===0?'0':r.ratings?.[i.id]===1?'1':r.ratings?.[i.id]===2?'2':''});
   document.getElementById('m6fNotes').value=r.notes||'';
   const v=result(r.ratings?r:null);
   document.getElementById('m6fResult').textContent=r.reviewedAt?'Avaliação atual: '+v.label+(v.score===null?'':' ('+v.score+'/100)')+' · revisada em '+new Date(r.reviewedAt).toLocaleString('pt-BR'):'Ainda não avaliado.';
   renderTable();
 }
 sel.addEventListener('change',load);
 document.getElementById('m6fSave').addEventListener('click',()=>{
   const ratings={};ITEMS.forEach(i=>{const v=card.querySelector('[data-m6f-rating="'+i.id+'"]').value;if(v!=='')ratings[i.id]=Number(v)});
   records[norm(sel.value)]={ratings,notes:document.getElementById('m6fNotes').value.trim(),reviewedAt:new Date().toISOString()};
   try{localStorage.setItem(STORE,JSON.stringify(records))}catch{}
   load();
 });
 document.getElementById('m6fClear').addEventListener('click',()=>{
   delete records[norm(sel.value)];try{localStorage.setItem(STORE,JSON.stringify(records))}catch{}load();
 });
 window.addEventListener('ep-motor6-watch-changed',renderTable);
 window.addEventListener('ep-motor6-watch-updated',renderTable);
 window.EPMotor6Fundamental={get:status,grade:result,criteria:ITEMS,refresh:renderTable};
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
