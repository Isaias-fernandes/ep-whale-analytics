export const PERIODS={'1h':3600000,'30m':1800000,'15m':900000,'5m':300000};
export function normalizeSymbol(value){const s=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return s?(s.endsWith('USDT')?s:s+'USDT'):'';}
export function readCandles(payload,interval,now=Date.now()){
 const ms=PERIODS[interval];if(!ms||!payload?.ok||!Array.isArray(payload.candles))return{status:'unavailable',count:0};
 const rows=payload.candles.filter(c=>{const t=Date.parse(c.candleTime);return Number.isFinite(t)&&t%ms===0&&t+ms<=now&&[c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.low>0&&c.volume>=0&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close);}).sort((a,b)=>Date.parse(a.candleTime)-Date.parse(b.candleTime));
 if(!rows.length)return{status:'empty',count:0};
 const tail=[rows.at(-1)];for(let i=rows.length-2;i>=0;i--){if(Date.parse(tail[0].candleTime)-Date.parse(rows[i].candleTime)!==ms)break;tail.unshift(rows[i]);}
 const last=tail.at(-1),closedAt=Date.parse(last.candleTime)+ms,stale=now-closedAt>ms+300000||payload.__stale===true;
 let ema=null;if(tail.length>=20){ema=tail.slice(0,20).reduce((s,c)=>s+c.close,0)/20;for(const c of tail.slice(20))ema=c.close*2/21+ema*19/21;}
 const prev=tail.slice(-21,-1),base=prev.length===20?prev.reduce((s,c)=>s+c.volume,0)/20:null,volRatio=base>0?last.volume/base:null;
 let obv=null;if(tail.length>=11){let a=0,b=0;for(let i=tail.length-10;i<tail.length;i++){const delta=Math.sign(tail[i].close-tail[i-1].close)*tail[i].volume;b+=delta;if(i>=tail.length-3)a+=delta;}obv=a>0&&b>0?'Subindo':a<0&&b<0?'Caindo':'Misto';}
 const flow=tail.slice(-3),hasFlow=flow.length===3&&flow.every(c=>Number.isFinite(c.quoteVolume)&&c.quoteVolume>0&&Number.isFinite(c.takerBuyQuoteVolume)&&c.takerBuyQuoteVolume>=0&&c.takerBuyQuoteVolume<=c.quoteVolume);
 return{status:stale?'stale':'ready',count:rows.length,used:tail.length,closedAt,price:last.close,ema,reading:ema==null?'Histórico insuficiente':last.close>ema?'Acima da EMA20':last.close<ema?'Abaixo da EMA20':'Na EMA20',volRatio,obv,buyerPct:hasFlow?100*flow.reduce((s,c)=>s+c.takerBuyQuoteVolume,0)/flow.reduce((s,c)=>s+c.quoteVolume,0):null,gaps:Math.max(payload.gaps||0,rows.length>tail.length?1:0)};
}
export function createReadCache(fetcher,storage=null,ttl=900000){
 const memory=new Map(),pending=new Map();
 return async function read(url,now=Date.now()){
  let item=memory.get(url);if(!item&&storage)try{const saved=JSON.parse(storage.getItem('ep_m6_mtf_cache')||'[]');for(const [k,v] of saved)memory.set(k,v);item=memory.get(url);}catch{}
  if(item&&now-item.at<ttl&&now>=item.at)return item.value;
  if(pending.has(url))return pending.get(url);
  const task=(async()=>{try{const r=await fetcher(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);const value=await r.json();if(value.ok!==true)throw Error('Dados indisponíveis');memory.set(url,{at:now,value});if(memory.size>24)memory.delete(memory.keys().next().value);if(storage)try{storage.setItem('ep_m6_mtf_cache',JSON.stringify([...memory].slice(-20)));}catch{}return value;}catch(error){if(item)return{...item.value,__stale:true,__error:String(error)};throw error;}finally{pending.delete(url);}})();pending.set(url,task);return task;
 };
}
