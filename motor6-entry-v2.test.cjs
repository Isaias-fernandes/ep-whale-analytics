const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=require('./motor6-pattern-policy.js');
const now=Date.now(),minimum={updatedAt:now,windows:{'30d':{low:100,candles:721}}};
const signal={dir:'BUY',timeframe:'1h',closedCandles:true,score:55,pattern:'Bull Flag',patterns:['Bull Flag'],confirmedPattern:'Bull Flag',patternConfirmed:true,compression:true,patternObvConfirmed:true,patternVolumeRatio:1.3,buyerFlow:{ratio:.6}};
test('strict admission rejects incomplete evidence, stale minimum, downside and chasing',()=>{
 assert.equal(policy.entryGate(signal,minimum,100.3,now).confirmed,true);
 for(const patch of [{dir:'SELL'},{compression:false},{closedCandles:false},{timeframe:'5m'},{patternObvConfirmed:false},{score:34}])assert.equal(policy.entryGate({...signal,...patch},minimum,100.3,now).eligible,false);
 for(const patch of [{buyerFlow:null},{buyerFlow:{ratio:.5}},{patternVolumeRatio:1.19},{patternConfirmed:false}]){const g=policy.entryGate({...signal,...patch},minimum,100.3,now);assert.equal(g.eligible,true);assert.equal(g.confirmed,false)}
 for(const p of [99.9,100.51,NaN,Infinity])assert.equal(policy.entryGate(signal,minimum,p,now).eligible,false);
 assert.equal(policy.entryGate(signal,{...minimum,updatedAt:now-480001},100.3,now).eligible,false);
 assert.equal(policy.entryGate(signal,{...minimum,windows:{'30d':{low:100,candles:700}}},100.3,now).eligible,false);
});
test('armed confirmation has direction, six-hour and three-percent limits',()=>{
 const armed={policyVersion:'m6-entry-v2',entryDir:'BUY',armedAt:now-1000,minimum30:100,entryPrice:100.3};
 assert.equal(policy.entryGate(signal,minimum,102,now,armed).confirmed,true);
 for(const patch of [{armedAt:now-21600001},{entryDir:'SELL'},{policyVersion:'old'}])assert.equal(policy.entryGate(signal,minimum,102,now,{...armed,...patch}).eligible,false);
 assert.equal(policy.entryGate(signal,minimum,104,now,armed).eligible,false);
 assert.equal(policy.entryGate(signal,minimum,100.3,now,{...armed,armedAt:now-21600001}).eligible,false);
});
test('H1 calculation drops open candle and reuses cached candles without network',()=>{
 const end=Math.floor(now/3600000)*3600000;
 const candles=Array.from({length:97},(_,i)=>({t:end-(96-i)*3600000,closeTime:end-(95-i)*3600000-1,o:100,h:101,l:99,c:100+(i%2)*.01,v:100,quoteVolume:10000,takerBuyQuote:6000}));
 let seen;const win={EPMotor6PatternPolicy:{assess:(n,d,e)=>{seen=e;return policy.assess(n,d,e)}},EPMotor7Minimum:{getCandles:()=>candles},addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync('early-leg-motor-v1.js','utf8'),{window:win,Date,Event:class{},fetch(){throw Error('network forbidden')}});
 const r=win.EPEarlyLegMotorV1.calc({sym:'BTCUSDT',observedAt:now,rsi:50});
 assert.ok(r);assert.equal(r.candleAt,end-3600000);assert.equal(r.timeframe,'1h');assert.equal(r.buyerFlow.ratio,.6);assert.equal(r.parts.buyerFlow,10);
 const bad=[...candles];bad.splice(85,1);win.EPMotor7Minimum.getCandles=()=>bad;
 assert.equal(win.EPEarlyLegMotorV1.calc({sym:'BTCUSDT',observedAt:now}),null);
});
test('traffic uses only the existing fetch and five-minute synchronization',()=>{
 const next=fs.readFileSync('motor6-signal-monitor.js','utf8');
 assert.equal((next.match(/\bfetch\s*\(/g)||[]).length,1);
 assert.ok(next.includes("setInterval(()=>{if(!document.hidden)syncRemote()},300000)"));
 assert.ok(next.includes("fetch(API,{method:'GET',cache:'no-store'})"));
 for(const name of ['motor6-pattern-policy.js','early-leg-motor-v1.js','motor6-min30-shadow.js'])assert.ok(!/\bfetch\s*\(/.test(fs.readFileSync(name,'utf8')));
});
test('monitor requires same direction and tracks confirmed returns from confirmed price',()=>{
 let at=now,e={...signal,score:40,patternConfirmed:false},x={sym:'BTCUSDT',observedAt:now,price:100.3};
 const memory=new Map(),events={},map=new Map([['BTCUSDT',x]]);
 const win={CryptoApp:{getData:()=>map},EPEarlyLegMotorV1:{calc:()=>e},EPMotor6PatternPolicy:policy,EPMotor7Minimum:{get:()=>({...minimum,updatedAt:at})},EPMotor6Fundamental:{get:()=>({label:'Fundamento favorável',score:90,hasEvidence:true})},addEventListener(n,f){events[n]=f},dispatchEvent(){}};
 const FakeDate=class extends Date{static now(){return at}};
 vm.runInNewContext(fs.readFileSync('motor6-signal-monitor.js','utf8'),{window:win,document:{hidden:false},Date:FakeDate,localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},CustomEvent:class{},Event:class{},setInterval(){},setTimeout(){},fetch:async()=>({ok:false}),alert(){}});
 win.EPMotor6Watch.autoScan();let o=win.EPMotor6Watch.get()[0];assert.ok(o);assert.equal(o.signalStatus,'OBSERVAÇÃO');
 at+=1000;x.price=102;x.observedAt=at;e={...signal,dir:'SELL'};win.EPMotor6Watch.tick();assert.equal(o.signalStatus,'OBSERVAÇÃO');
 e={...signal};win.EPMotor6Watch.tick();assert.equal(o.signalStatus,'CONFIRMADO');assert.equal(o.confirmedPrice,102);assert.equal(o.confirmedReturn,0);
 x.price=112.2;at+=1000;x.observedAt=at;win.EPMotor6Watch.tick();assert.ok(o.confirmedTargets[10]);assert.equal(o.entryPrice,100.3);
});
