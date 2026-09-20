(()=>{
 const $=s=>document.querySelector(s);
 function mapFor(m){return m==="crypto"?window.CryptoApp?.getData?.():window.B3App?.getData?.()}
 function fmt(n){return Number.isFinite(+n)?(+n).toLocaleString("pt-BR",{maximumFractionDigits:+n<10?6:2}):"—"}
 function active(m,a){return (window.EPLiveOperations?.get?.()||[]).some(o=>o.market===m&&o.asset===a)}
 function options(m){
   let map=mapFor(m); if(!map?.entries)return "";
   return [...map.keys()].map(key=>`<option value="${key}">${String(key).replace("USDT","/USDT")}${active(m,key)?" — ACOMPANHANDO":""}</option>`).join("");
 }
 function preview(){
   let m=$("#lopMarket")?.value||"crypto",a=$("#lopAsset")?.value,el=$("#lopPreview"); if(!el||!a)return;
   let x=mapFor(m)?.get?.(a),d=x?window.EPDecision?.calc?.(x,m):null;
   let p=+(x?.livePrice??x?.price??x?.regularMarketPrice??x?.close??0),mot=+d?.motorAgree||0,dir=d?.dir==="BUY"?"COMPRA":d?.dir==="SELL"?"VENDA":"NEUTRO";
   el.innerHTML=`<b>${String(a).replace("USDT","/USDT")}</b> • Preço <b>${fmt(p)}</b> • <b>${mot}/5 motores</b> • ${dir} ${active(m,a)?"• <b>📌 JÁ EM ACOMPANHAMENTO</b>":""}`;
 }
 function focus(m,a){if(a)window.EPCentralFocus?.set?.(m,a)}
 function fill(force=false){
   let m=$("#lopMarket")?.value||"crypto",s=$("#lopAsset"); if(!s)return;
   let old=s.value,html=options(m); if(force||s.dataset.market!==m||!s.options.length){s.innerHTML=html;s.dataset.market=m}
   if([...s.options].some(o=>o.value===old))s.value=old; preview();
 }
 function ensure(){
   let root=$("#liveOperations"); if(!root||$("#lopManualSelector"))return;
   let box=document.createElement("div"); box.id="lopManualSelector"; box.style.cssText="display:grid;gap:8px;margin:8px 0 12px";
   box.innerHTML=`<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center"><select id="lopMarket" class="lop-btn"><option value="crypto">CRIPTO</option><option value="b3">B3</option></select><select id="lopAsset" class="lop-btn" style="min-width:210px"></select><button id="lopShow" class="lop-btn" type="button">👁 MOSTRAR ATIVO</button><button id="lopAddManual" class="lop-btn" type="button">📌 INICIAR ACOMPANHAMENTO</button></div><div id="lopPreview" class="lop-cell">Selecione um ativo.</div><div id="lopActionStatus" class="sub" role="status" aria-live="polite"></div>`;
   root.parentElement?.insertBefore(box,root);
   $("#lopMarket").onchange=()=>fill(true);
   $("#lopAsset").onchange=preview;
   $("#lopShow").onclick=()=>{let m=$("#lopMarket").value,a=$("#lopAsset").value;preview();focus(m,a);$("#lopActionStatus").textContent=a?`${String(a).replace("USDT","/USDT")} selecionado para leitura na Central.`:""};
   $("#lopAddManual").onclick=()=>{let m=$("#lopMarket").value,a=$("#lopAsset").value,status=$("#lopActionStatus");if(!a)return;
     status.textContent="Registrando acompanhamento...";
     window.EPLiveOperations?.add?.(m,a);
     requestAnimationFrame(()=>{preview();fill(true);let o=(window.EPLiveOperations?.get?.()||[]).find(z=>z.market===m&&z.asset===a);status.textContent=o?`✓ ${String(a).replace("USDT","/USDT")} está em acompanhamento.`:"Acompanhamento não iniciado: confira se o ativo possui sinal ativo com 2 ou mais motores.";if(o){let el=[...document.querySelectorAll("[data-op]")].find(n=>n.dataset.op===o.id);el?.scrollIntoView({behavior:"smooth",block:"center"})}});
   };
   fill(true);
 }
 function refresh(){ensure();if(!$("#lopAsset")?.matches(":focus"))fill(false);else preview()}
 setTimeout(()=>{ensure();refresh()},300);
 window.addEventListener("live-operations-ready",()=>setTimeout(refresh,0));
 window.addEventListener("crypto-data-updated",refresh);
 window.addEventListener("b3-data-updated",refresh);
 window.addEventListener("ep-central-focus",preview);
})();