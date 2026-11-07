import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function context(){const urls=[];const ctx={document:{querySelector(){}},console:{warn(){}},Date,CustomEvent:class{},setInterval(){},fetch:async url=>{
  urls.push(url);assert.equal(typeof url,'string');let data;
  if(url.includes('/klines'))data=Array.from({length:96},(_,i)=>[i*3600000,100,101,99,100,100,0,10000,0,60]);
  else if(url.includes('/ticker/24hr'))data={lastPrice:'100',lowPrice:'99',highPrice:'101',priceChangePercent:'0'};
  else if(url.includes('/depth'))data={bids:[['100','30']],asks:[['101','10']]};
  else throw Error('optional derivative source unavailable');
  return{ok:true,json:async()=>data};
}};vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf('function top4()')),ctx);return {ctx,urls};}
test('order book promise is awaited once, never fetched as [object Promise]',async()=>{const {ctx,urls}=context();const x=await ctx.loadPair('BTCUSDT','BTC','1h');assert.equal(x.bookImbalance,.5);assert.equal(x.dataQuality.orderBook,true);assert.ok(!urls.some(u=>u.includes('[object Promise]')));assert.equal(urls.filter(u=>u.includes('/depth')).length,1);});
test('missing derivatives remain unavailable instead of numeric zero',async()=>{const {ctx}=context();const x=await ctx.loadPair('BTCUSDT','BTC','1h');assert.equal(x.oi,null);assert.equal(x.oiChange,null);assert.equal(x.funding,null);assert.equal(ctx.fmt(x.funding),'Indisponível');});
