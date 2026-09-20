(()=>{
  const $=s=>document.querySelector(s);
  let cache={crypto:{html:"",ts:0,size:-1},b3:{html:"",ts:0,size:-1}};
  function mapFor(m){return m==="crypto"?window.CryptoApp?.getData?.():window.B3App?.getData?.()}
  function opts(m,force=false){
    let map=mapFor(m),now=Date.now(),z=cache[m];
    if(!map?.entries)return "";
    if(!force&&z.html&&z.size===map.size&&now-z.ts<15000)return z.html;
    let active=window.EPLiveOperations?.get?.()||[];
    let html=[...map.entries()].map(([key,x])=>{
      let a=window.EPDecision?.calc?.(x,m),motors=+a?.motorAgree||0,dir=a?.dir||"NEUTRAL";
      let tracked=active.some(o=>o.market===m&&o.asset===key);
      return `<option value="${key}">${String(key).replace("USDT","/USDT")} — ${motors}M ${dir==="BUY"?"COMPRA":dir==="SELL"?"VENDA":""}${tracked?" — ACOMPANHANDO":""}</option>`;
    }).join("");
    cache[m]={html,ts:now,size:map.size}; return html;
  }
  function focusCentral(market,asset){if(!asset)return;window.dispatchEvent(new CustomEvent("ep-central-focus",{detail:{market,asset,source:"operations"}}));updateMode()}
  function clearCentral(market){window.EPCentralFocus?.clear?.(market);updateMode()}
  function updateMode(){let m=$("#lopMarket")?.value||"crypto",f=window.EPCentralFocus?.get?.()||{},manual=!!f[m],b=$("#lopAuto");if(b){b.textContent=manual?"↩ VOLTAR AO AUTOMÁTICO":"⚡ AUTOMÁTICO ATIVO";b.disabled=!manual;b.style.opacity=manual?"1":".65";b.title=manual?"Liberar o ativo manual e voltar à seleção automática":"A Central já está em modo automático"}}
  function ensure(){let root=$("#liveOperations");if(!root||$("#lopManualSelector"))return;let box=document.createElement("div");box.id="lopManualSelector";box.style.cssText="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:8px 0 10px";box.innerHTML=`<select id="lopMarket" class="lop-btn"><option value="crypto">CRIPTO</option><option value="b3">B3</option></select><select id="lopAsset" class="lop-btn" style="min-width:190px"></select><button id="lopAddManual" class="lop-btn">📌 ACOMPANHAR ATIVO</button><button id="lopAuto" class="lop-btn" type="button">⚡ AUTOMÁTICO ATIVO</button>`;root.parentElement?.insertBefore(box,root)}
  function refresh(force=false){ensure();let m=$("#lopMarket")?.value||"crypto",s=$("#lopAsset");if(s){let old=s.value,html=opts(m,force);if(html&&s.innerHTML!==html)s.innerHTML=html;if([...s.options].some(o=>o.value===old))s.value=old;if(!s.dataset.bound){s.dataset.bound="1";s.onchange=()=>focusCentral($("#lopMarket")?.value||"crypto",s.value)}}let mk=$("#lopMarket");if(mk&&!mk.dataset.bound){mk.dataset.bound="1";mk.onchange=()=>{cache[mk.value].ts=0;refresh(true);updateMode()}}let b=$("#lopAddManual");if(b&&!b.dataset.bound){b.dataset.bound="1";b.onclick=()=>{let market=$("#lopMarket")?.value,asset=$("#lopAsset")?.value;if(!asset)return;window.EPLiveOperations?.add?.(market,asset);setTimeout(()=>focusCentral(market,asset),0);setTimeout(()=>{cache[market].ts=0;refresh(true)},100)}}let a=$("#lopAuto");if(a&&!a.dataset.bound){a.dataset.bound="1";a.onclick=()=>clearCentral($("#lopMarket")?.value||"crypto")}updateMode()}
  setTimeout(()=>{ensure();refresh(true);setInterval(()=>{if(!document.hidden)refresh(false)},15000)},600);
  window.addEventListener("live-operations-ready",()=>setTimeout(()=>refresh(true),0));
  window.addEventListener("crypto-data-updated",()=>refresh(false));
  window.addEventListener("b3-data-updated",()=>refresh(false));
  window.addEventListener("ep-central-focus",()=>setTimeout(updateMode,0));
})();