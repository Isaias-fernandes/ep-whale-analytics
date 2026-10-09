(()=>{
 const $=s=>document.querySelector(s);
 const MARKET="crypto";
 const SELECTED_KEY="ep_live_operations_selected_crypto";
 let selected="";
 try { selected=localStorage.getItem(SELECTED_KEY)||""; } catch {}
 function mapFor(){return window.CryptoApp?.getData?.()}
 function fmt(n){return Number.isFinite(+n)?(+n).toLocaleString("pt-BR",{maximumFractionDigits:+n<10?6:2}):"—"}
 function active(m,a){return (window.EPLiveOperations?.get?.()||[]).some(o=>o.market===m&&o.asset===a)}
 function options(m){
   let map=mapFor(m); if(!map?.entries)return "";
   return [...map.keys()].map(key=>`<option value="${key}">${String(key).replace("USDT","/USDT")}${active(m,key)?" — ACOMPANHANDO":""}</option>`).join("");
 }
 function preview(){
   let m=MARKET,a=$("#lopAsset")?.value,el=$("#lopPreview"); if(!el||!a)return;
   let x=mapFor(m)?.get?.(a),d=x?window.EPDecision?.calc?.(x,m):null;
   let p=+(x?.livePrice??x?.price??x?.regularMarketPrice??x?.close??x?.candles?.at?.(-1)?.c??0),mot=+d?.motorAgree||0,dir=d?.dir==="BUY"?"COMPRA":d?.dir==="SELL"?"VENDA":"NEUTRO";
   el.innerHTML=`<b>${String(a).replace("USDT","/USDT")}</b> • Preço <b>${fmt(p)}</b> • <b>${mot}/5 motores</b> • ${dir} ${active(m,a)?"• <b>📌 JÁ EM ACOMPANHAMENTO</b>":""}`;
 }
 function fill(force=false){
   let m=MARKET,s=$("#lopAsset"); if(!s)return;
   if(s.matches(":focus")){preview();return;}
   let old=selected||s.value,html=options(m); if(force||s.dataset.market!==m||!s.options.length){s.innerHTML=html;s.dataset.market=m}
   if([...s.options].some(o=>o.value===old))s.value=old;
   else if(s.value)selected=s.value;
   preview();
 }
 function ensure(){
   let root=$("#liveOperations"); if(!root||$("#lopManualSelector"))return;
   let box=document.createElement("div"); box.id="lopManualSelector"; box.style.cssText="display:grid;gap:8px;margin:8px 0 12px";
   box.innerHTML=`<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center"><b class="lop-btn" style="cursor:default">CRIPTO</b><select id="lopAsset" class="lop-btn" style="min-width:210px"></select><button id="lopShow" class="lop-btn" type="button">👁 MOSTRAR ATIVO</button><button id="lopAddManual" class="lop-btn" type="button">📌 INICIAR ACOMPANHAMENTO</button></div><div id="lopPreview" class="lop-cell">Selecione um ativo.</div><div id="lopActionStatus" class="sub" role="status" aria-live="polite"></div>`;
   root.parentElement?.insertBefore(box,root);
   $("#lopAsset").onchange=()=>{selected=$("#lopAsset").value;try{localStorage.setItem(SELECTED_KEY,selected)}catch{}preview();startTracking(MARKET,selected)};
 function startTracking(m,a){
   if(!a)return null;
   const name=String(a).replace("USDT","/USDT"),status=$("#lopActionStatus");
   let o=(window.EPLiveOperations?.get?.()||[]).find(z=>z.market===m&&z.asset===a);
   if(o){
     if(status)status.textContent=`✓ ${name} já está em acompanhamento.`;
   }else{
     if(status)status.textContent=`⏱ Iniciando ${name}...`;
     o=window.EPLiveOperations?.add?.(m,a);
     o=o||(window.EPLiveOperations?.get?.()||[]).find(z=>z.market===m&&z.asset===a);
     if(!o){
       if(status)status.textContent=`Não foi possível iniciar ${name}. A seleção foi mantida; verifique cotação e limite de 10 ativos.`;
       return null;
     }
     if(status)status.textContent=`✓ ${name} está em acompanhamento.`;
   }
   preview();
   const el=[...document.querySelectorAll("#liveOperations [data-op]")].find(n=>n.dataset.op===o.id);
   el?.scrollIntoView({behavior:"smooth",block:"center"});
   return o;
 }
   $("#lopShow").onclick=()=>{
     let a=$("#lopAsset").value,status=$("#lopActionStatus"); if(!a)return;
     selected=a;try{localStorage.setItem(SELECTED_KEY,a)}catch{}
     preview();
     // MOSTRAR ATIVO deve fixar imediatamente o ativo escolhido na Central de Interpretação.
     window.EPCentralFocus?.set?.(MARKET,a);
     window.dispatchEvent(new CustomEvent("ep-central-focus",{detail:{market:MARKET,asset:a,source:"five-motor-selector"}}));
     let op=(window.EPLiveOperations?.get?.()||[]).find(o=>o.market===MARKET&&o.asset===a);
     let card=op&&[...document.querySelectorAll("#liveOperations [data-op]")].find(n=>n.dataset.op===op.id);
     if(card){card.scrollIntoView({behavior:"smooth",block:"nearest"});status.textContent=`${String(a).replace("USDT","/USDT")} em acompanhamento.`}
     else status.textContent=`${String(a).replace("USDT","/USDT")} selecionado. Toque em INICIAR ACOMPANHAMENTO para mantê-lo no painel.`;
   };
   $("#lopAddManual").onclick=()=>{const a=$("#lopAsset").value;if(!a)return;selected=a;try{localStorage.setItem(SELECTED_KEY,a)}catch{}startTracking(MARKET,a)};
   fill(true);
 }
 function refresh(){ensure();if(!$("#lopAsset")?.matches(":focus"))fill(false);else preview()}
 setTimeout(()=>{ensure();refresh()},300);
 window.addEventListener("live-operations-ready",()=>setTimeout(refresh,0));
 window.addEventListener("crypto-data-updated",refresh);
 window.addEventListener("ep-central-focus",preview);
 window.addEventListener("live-operations-changed",()=>{fill(true);preview()});
})();
