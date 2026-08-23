(()=>{
const $=s=>document.querySelector(s);
function init(){
 const history=$('#paperHistory');
 if(!history||$('#paperHistoryToggle')) return;
 const heading=[...document.querySelectorAll('h3')].find(x=>/HISTÓRICO DO PAPER TRADING/i.test(x.textContent||''));
 const intro=heading?.nextElementSibling?.classList?.contains('sub')?heading.nextElementSibling:null;
 const btn=document.createElement('button');
 btn.id='paperHistoryToggle'; btn.className='secondary'; btn.type='button';
 btn.textContent='Mostrar histórico';
 btn.style.marginBottom='10px';
 history.style.display='none';
 if(intro) intro.style.display='none';
 (heading||history).insertAdjacentElement(heading?'afterend':'beforebegin',btn);
 btn.onclick=()=>{
   const open=history.style.display==='none';
   history.style.display=open?'block':'none';
   if(intro) intro.style.display=open?'block':'none';
   btn.textContent=open?'Ocultar histórico':'Mostrar histórico';
 };
}
function loadScript(src,attr){
 if(document.querySelector(`script[${attr}]`)) return;
 const s=document.createElement('script');
 s.src=src;
 s.setAttribute(attr,'1');
 s.async=true;
 document.body.appendChild(s);
}
function loadSignalQuality(){loadScript('signal-quality.js?v=1','data-signal-quality')}
function loadPriceTracker(){loadScript('signal-price-tracker.js?v=1','data-price-tracker')}
setTimeout(init,500);
setTimeout(loadSignalQuality,1200);
setTimeout(loadPriceTracker,1400);
})();
