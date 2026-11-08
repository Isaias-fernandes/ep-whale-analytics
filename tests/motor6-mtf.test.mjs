import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSymbol,readCandles,createReadCache} from '../motor6-mtf-core.mjs';
const ms=900000,rows=n=>Array.from({length:n},(_,i)=>({candleTime:new Date(i*ms).toISOString(),open:100+i,high:102+i,low:99+i,close:101+i,volume:10,quoteVolume:1000,takerBuyQuoteVolume:600}));
test('MTF reading excludes open candles and distinguishes missing, stale and insufficient data',()=>{
 assert.equal(normalizeSymbol('IMX/USDT'),'IMXUSDT');assert.equal(normalizeSymbol('BTC'),'BTCUSDT');
 const r=readCandles({ok:true,candles:rows(30)},'15m',29*ms);assert.equal(r.count,29);assert.equal(r.used,29);assert.equal(r.buyerPct,60);assert.equal(r.obv,'Subindo');assert.ok(r.ema>0);
 assert.equal(readCandles({ok:true,candles:[]},'5m').status,'empty');assert.equal(readCandles(null,'15m').status,'unavailable');
 assert.equal(readCandles({ok:true,candles:rows(10)},'15m',20*ms).status,'stale');assert.equal(readCandles({ok:true,candles:rows(10)},'15m',10*ms).ema,null);
});
test('MTF indicators use contiguous suffix and never turn missing flow into zero',()=>{
 const c=rows(40).filter((_,i)=>i!==35),r=readCandles({ok:true,candles:c},'15m',40*ms);assert.equal(r.used,4);assert.equal(r.ema,null);assert.equal(r.obv,null);assert.equal(r.gaps,1);
 assert.equal(readCandles({ok:true,candles:rows(30).map(c=>({...c,quoteVolume:null,takerBuyQuoteVolume:null}))},'15m',30*ms).buyerPct,null);
});
test('two panels share one request and 15-minute cache; failed reads expose stale data',async()=>{
 let calls=0,fail=false;const read=createReadCache(async()=>{calls++;await Promise.resolve();if(fail)throw Error('offline');return{ok:true,json:async()=>({ok:true,candles:[]})};});
 await Promise.all([read('url',1000),read('url',1000)]);assert.equal(calls,1);await read('url',899999);assert.equal(calls,1);fail=true;const old=await read('url',902000);assert.equal(calls,2);assert.equal(old.__stale,true);
});
