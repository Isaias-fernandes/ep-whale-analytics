(()=>{'use strict';
const KEY='ep_currency_watchlist_v1';
let defaults=[];
const normalize=value=>{
 const raw=String(value||'').trim().toUpperCase().replace(/\\s+/g,'');
 if(!raw)return '';
 const pair=raw.endsWith('USDT')?raw:raw+'USDT';
 return /^[A-Z0-9]{2,20}USDT$/.test(pair)?pair:'';
};
const clean=list=>[...new Set((Array.isArray(list)?list:[]).map(x=>normalize(Array.isArray(x)?x[0]:x)).filter(Boolean))].map(s=>[s,s.slice(0,-4)]);
function read(){
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(saved)&&saved.length)return clean(saved);}catch{}
 return defaults.length?defaults.map(x=>x.slice()):[];
}
function save(pairs){
 if(!Array.isArray(pairs)||!pairs.length)return false;
 const normalized=clean(pairs);
 try{localStorage.setItem(KEY,JSON.stringify(normalized));}catch{return false;}
 window.dispatchEvent(new CustomEvent('ep-watchlist-changed',{detail:{pairs:normalized.map(x=>x.slice())}}));
 render();return true;
}
function mount(fallback){
 defaults=clean(fallback);
 const pair=document.getElementById('pair');
 if(!pair||document.getElementById('epWatchlistManager'))return;
 const panel=document.createElement('section');panel.id='epWatchlistManager';panel.className='ep-watchlist-manager';
 panel.innerHTML='<div class="ep-watchlist-heading"><div><b>Moedas monitoradas</b><small id="epWatchlistCount"></small></div><button type="button" id="epWatchlistToggle" aria-expanded="false">Gerenciar lista</button></div><div id="epWatchlistEditor" hidden><div class="ep-watchlist-add"><input id="epWatchlistInput" type="text" autocomplete="off" placeholder="Adicionar moeda, ex.: GRT ou GRTUSDT" aria-label="Moeda para adicionar"><button type="button" id="epWatchlistAdd">Adicionar</button></div><div id="epWatchlistTags" class="ep-watchlist-tags"></div><label class="ep-watchlist-bulk-label" for="epWatchlistBulk">Ou substitua a lista completa (moedas separadas por vírgula)</label><textarea id="epWatchlistBulk" rows="3" placeholder="BTC, ETH, SOL, GRT"></textarea><div class="ep-watchlist-actions"><button type="button" id="epWatchlistReplace">Salvar lista completa</button><button type="button" class="ep-watchlist-reset">Restaurar lista padrão</button></div><small class="ep-watchlist-note">A lista fica salva neste navegador e é usada ao reabrir o EP.</small><small id="epWatchlistStatus" role="status" aria-live="polite"></small></div>';
 pair.insertAdjacentElement('afterend',panel);
 const editor=panel.querySelector('#epWatchlistEditor'),tags=panel.querySelector('#epWatchlistTags'),input=panel.querySelector('#epWatchlistInput'),bulk=panel.querySelector('#epWatchlistBulk'),status=panel.querySelector('#epWatchlistStatus');
 const setStatus=t=>{status.textContent=t;};
 function render(){
  const pairs=read();panel.querySelector('#epWatchlistCount').textContent=' • '+pairs.length+' ativas';
  tags.replaceChildren();
  for(const [symbol,label] of pairs){
   const chip=document.createElement('span');chip.className='ep-watchlist-chip';chip.append(document.createTextNode(label));
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remover '+label);remove.title='Remover '+label;
   remove.onclick=()=>{const next=read().filter(x=>x[0]!==symbol);if(!save(next))setStatus('A lista precisa ter ao menos uma moeda.');else setStatus(label+' removida e salva.');};
   chip.append(remove);tags.append(chip);
  }
 }
 panel.querySelector('#epWatchlistToggle').onclick=e=>{const opening=editor.hidden;editor.hidden=!opening;e.currentTarget.setAttribute('aria-expanded',String(opening));e.currentTarget.textContent=opening?'Fechar gerenciamento':'Gerenciar lista';};
 panel.querySelector('#epWatchlistAdd').onclick=()=>{
  const pairValue=normalize(input.value);if(!pairValue){setStatus('Informe um ticker válido, como BTC ou GRT.');return;}
  const current=read();if(current.some(x=>x[0]===pairValue)){setStatus(pairValue.slice(0,-4)+' já está na lista.');return;}
  if(save([...current,[pairValue,pairValue.slice(0,-4)]])){input.value='';setStatus(pairValue.slice(0,-4)+' adicionada e salva.');}
 };
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();panel.querySelector('#epWatchlistAdd').click();}};
 panel.querySelector('#epWatchlistReplace').onclick=()=>{
  const values=bulk.value.split(/[\\s,;]+/).map(x=>normalize(x)).filter(Boolean);
  const next=clean(values);if(!next.length){setStatus('Digite ao menos um ticker válido.');return;}
  if(save(next)){bulk.value='';setStatus('Lista substituída e salva neste navegador.');}
 };
 panel.querySelector('.ep-watchlist-reset').onclick=()=>{
  try{localStorage.removeItem(KEY);}catch{}
  const pairs=defaults.map(x=>x.slice());window.dispatchEvent(new CustomEvent('ep-watchlist-changed',{detail:{pairs}}));render();setStatus('Lista padrão restaurada.');
 };
 render();
}
window.EPCurrencyWatchlist={getPairs:fallback=>{if(fallback)defaults=clean(fallback);return read().map(x=>x.slice());},mount};
})();