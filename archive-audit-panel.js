/* Read-only seven-day audit. No motor decisions or pharmacy records are changed. */
(()=>{
'use strict';
const TABLES={
 ep_signal_events:['Eventos dos 5 motores','event_at'],
 ep_pre_signal_history:['Pré-sinais e confluência','observed_at'],
 ep_shadow_v3_history:['Experimentos Shadow','observed_at'],
 ep_early_leg_v2_events:['Início de pernada V2','observed_at'],
 ep_motor6_history:['Histórico do Motor 6','observed_at']
};
const SOURCE={url:'https://qhgclnkctpzumtybailv.supabase.co/rest/v1/rpc/ep_audit_live_page',key:'sb_publishable__eewYv5qb1iFqw-xY3TkZA_7AjoQvZt'};
const ARCHIVE={url:'https://iayxjarkeefbzjbpfurl.supabase.co/rest/v1/rpc/ep_audit_archive_page',key:'sb_publishable_7K321oiYAFOl6k6uqn5fAg_rsNH3e10'};
const finite=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:6});
const date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}
async function decodeBatch(batch){
 const bytes=Uint8Array.from(atob(batch.payload_base64.replace(/\s/g,'')),c=>c.charCodeAt(0));
 if(await hash(bytes)!==batch.payload_sha256)throw Error('Arquivo comprimido com hash inválido');
 const raw=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 if(await hash(raw)!==batch.batch_sha256)throw Error('Conteúdo recuperado com hash inválido');
 const lines=new TextDecoder().decode(raw).split('\n').filter(Boolean);
 if(lines.length!==batch.row_count)throw Error('Quantidade de registros divergente');
 return lines;
}
function summarize(lines,table,asset=''){
 const rows=[],stats={n:0,buy:0,sell:0,results:0,wins:0,sum:0,missingPrice:0,first:null,last:null};
 const target=asset.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,'');
 for(const line of lines){
  const r=JSON.parse(line),name=String(r.asset||r.symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,'');
  if(target&&name!==target)continue;
  const ts=r[TABLES[table][1]],dir=r.direction||r.pre_direction||r.official_direction||r.entry_dir||r.experimental_direction;
  const price=finite(r.price??r.entry_price??r.last_price),result=finite(r.return_pct??r.result_pct);
  stats.n++;if(dir==='BUY')stats.buy++;if(dir==='SELL')stats.sell++;
  if(price==null||price<=0)stats.missingPrice++;
  if(!stats.first||Date.parse(ts)<Date.parse(stats.first))stats.first=ts;
  if(!stats.last||Date.parse(ts)>Date.parse(stats.last))stats.last=ts;
  if((r.event_type==='CLOSED'||r.status==='CLOSED')&&result!=null){stats.results++;stats.sum+=result;if(result>0)stats.wins++}
  rows.push({id:r.id,ts,name,dir,price,result,phase:r.phase||r.event_type||r.status||'OBSERVAÇÃO',motors:r.motors??r.official_motor_count??r.active_signal_count,score:r.score??r.official_score??r.last_score,max:finite(r.max_favorable_pct??r.best_pct),min:finite(r.max_adverse_pct??r.worst_pct)});
 }
 rows.sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts));
 return {stats,rows:rows.slice(0,50)};
}
async function rpc(server,body,signal){
 const response=await fetch(server.url,{method:'POST',headers:{apikey:server.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!response.ok)throw Error('Consulta indisponível (HTTP '+response.status+')');
 const result=await response.json();if(!Array.isArray(result))throw Error('Resposta de auditoria inválida');return result;
}
let controller=null,loaded=null,selection=null;
function init(){
 const host=document.createElement('section');host.className='card';host.id='epSevenDayAudit';
 host.innerHTML='<h2>AUDITORIA CENTRAL — HISTÓRICO DE 7 DIAS</h2><p class="sub">Consulta os registros do EP Analítico e do arquivo separado. Preserva indicadores, preços e resultados. Observações e eventos não equivalem a operações independentes.</p><div class="bt-controls"><label>Registro<select id="epAuditTable">'+Object.entries(TABLES).map(([key,[label]])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label><label>Ativo (opcional)<input id="epAuditAsset" placeholder="BTC, XRP, XLM..." maxlength="20"></label><button id="epAuditLoad" type="button">Consultar 7 dias</button><button id="epAuditCancel" type="button" disabled>Cancelar consulta</button><button id="epAuditDownload" type="button" disabled>Baixar registros completos</button></div><p id="epAuditStatus" class="sub" role="status" aria-live="polite">Consulta sob demanda. Nenhum registro será alterado.</p><div id="epAuditSummary"></div><div style="overflow:auto;max-height:550px"><table class="price-track"><thead><tr><th>Data</th><th>Ativo</th><th>Direção</th><th>Evento / fase</th><th>Preço</th><th>Motores</th><th>Score</th><th>Resultado</th><th>Máx. favorável</th><th>Máx. adversa</th></tr></thead><tbody id="epAuditRows"></tbody></table></div><p class="sub">A tabela exibe os 50 registros mais recentes; o download contém todos os registros consultados. A janela pode ter lacunas ou ter começado há menos de sete dias. Resultados registrados não incluem necessariamente taxas e execução real.</p>';
 const anchor=document.querySelector('#signalStats')?.closest('section.card');if(anchor)anchor.after(host);else document.querySelector('main')?.append(host);
 const el=id=>host.querySelector('#'+id);
 function show(){
  if(!loaded)return;
  const {stats:s,rows}=summarize(loaded.lines,loaded.table,el('epAuditAsset').value);
  el('epAuditSummary').textContent=s.n+' registros únicos • Compra: '+s.buy+' • Venda: '+s.sell+' • Eventos encerrados com resultado: '+s.results+' • Favoráveis: '+s.wins+(s.results?' • Resultado médio por evento encerrado: '+fmt(s.sum/s.results)+'%':'')+' • Sem preço válido: '+s.missingPrice+' • Período registrado: '+date(s.first)+' → '+date(s.last);
  el('epAuditRows').innerHTML=rows.map(r=>'<tr>'+[date(r.ts),r.name,r.dir,r.phase,fmt(r.price),r.motors,fmt(r.score),r.result==null?'—':fmt(r.result)+'%',r.max==null?'—':fmt(r.max)+'%',r.min==null?'—':fmt(r.min)+'%'].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('');
 }
 el('epAuditAsset').addEventListener('input',show);
 el('epAuditCancel').onclick=()=>controller?.abort();
 el('epAuditLoad').onclick=async()=>{
  if(controller)return;
  if(!globalThis.DecompressionStream||!globalThis.crypto?.subtle){el('epAuditStatus').textContent='Este navegador não suporta a recuperação dos arquivos. Atualize o navegador.';return}
  controller=new AbortController();const signal=controller.signal;
  el('epAuditLoad').disabled=true;el('epAuditTable').disabled=true;el('epAuditCancel').disabled=false;el('epAuditDownload').disabled=true;loaded=null;
  const table=el('epAuditTable').value,before=new Date().toISOString(),since=new Date(Date.parse(before)-7*86400000).toISOString();
  const records=new Map();let fromLive=0,fromArchive=0,last=0;
  try{
   // Live first, archives afterwards: concurrent finalized-row transfers remain visible.
   while(true){
    el('epAuditStatus').textContent='Consultando origem: '+records.size+' registros...';
    const page=await rpc(SOURCE,{p_table:table,p_since:since,p_before:before,p_after_id:last},signal);
    if(!page.length)break;
    for(const row of page){records.set(String(row.id),row.row_json);fromLive++}
    const next=Number(page.at(-1).id);if(next<=last)throw Error('Cursor da origem não avançou');last=next;
   }
   let afterAt=null,afterHash='';
   while(true){
    el('epAuditStatus').textContent='Conferindo arquivo separado: '+records.size+' registros únicos...';
    const page=await rpc(ARCHIVE,{p_table:table,p_since:since,p_before:before,p_after_at:afterAt,p_after_hash:afterHash},signal);
    if(!page.length)break;
    for(const batch of page){
     if(signal.aborted)throw new DOMException('Consulta cancelada','AbortError');
     for(const line of await decodeBatch(batch)){
      const row=JSON.parse(line),ts=Date.parse(row[TABLES[table][1]]);
      if(ts<Date.parse(since)||ts>Date.parse(before)||!Number.isFinite(ts)||records.has(String(row.id)))continue;
      records.set(String(row.id),line);fromArchive++;
     }
    }
    const tail=page.at(-1);if(tail.archived_at===afterAt&&tail.batch_sha256===afterHash)throw Error('Cursor do arquivo não avançou');
    afterAt=tail.archived_at;afterHash=tail.batch_sha256;
   }
   loaded={table,since,before,lines:Array.from(records.values())};selection=table;
   show();el('epAuditDownload').disabled=false;
   el('epAuditStatus').textContent='Consulta concluída: '+fromLive+' registros da origem + '+fromArchive+' exclusivos do arquivo. Cópias comprimidas conferidas; duplicações removidas. Leitura progressiva: não é uma fotografia simultânea das duas bases.';
  }catch(error){el('epAuditStatus').textContent=error.name==='AbortError'?'Consulta cancelada. Nenhum dado foi alterado.':'Consulta incompleta: '+error.message+'. Não use os dados parciais como auditoria completa.';el('epAuditSummary').textContent='';el('epAuditRows').innerHTML=''}
  finally{controller=null;el('epAuditLoad').disabled=false;el('epAuditTable').disabled=false;el('epAuditCancel').disabled=true}
 };
 el('epAuditTable').onchange=()=>{if(selection!==el('epAuditTable').value){loaded=null;el('epAuditDownload').disabled=true;el('epAuditRows').innerHTML='';el('epAuditSummary').textContent='';el('epAuditStatus').textContent='Clique em Consultar 7 dias para carregar este registro.'}};
 el('epAuditDownload').onclick=()=>{
  if(!loaded)return;
  const blob=new Blob(['{"schema_version":1,"table":'+JSON.stringify(loaded.table)+',"since":'+JSON.stringify(loaded.since)+',"before":'+JSON.stringify(loaded.before)+',"records":[',loaded.lines.join(',\n'),']}'],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ep-auditoria-'+loaded.table+'-'+loaded.before.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 };
}
globalThis.EPArchiveAudit={decodeBatch,summarize};
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init()}
})();
