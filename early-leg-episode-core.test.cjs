const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {MS,arm,advanceArm,closed,selective,retracement}=require('./early-leg-episode-core.js');
const entry=MS,bar=(t,o=100,h=101,l=99,c=100)=>({t,o,h,l,c,v:100,tb:60});
const bars=n=>Array.from({length:n},(_,i)=>bar(entry+i*MS));
test('closed candles exclude current candle and malformed OHLC',()=>assert.equal(closed([bar(0),bar(MS),bar(2*MS,100,90,99)],2*MS).length,2));
test('next-open entry excludes signal-candle extremes; 10 days and nine checkpoints',()=>{
 const a=arm(1,'PRESSÃO'),r=bars(2880);r[0]=bar(entry,100,106,99,102);
 advanceArm(a,[bar(0,100,1000,1),...r],r,entry+2880*MS);
 assert.equal(a.entry,100);assert.equal(a.status,'COMPLETED');assert.equal(a.coverage,'COMPLETE');
 assert.equal(Object.keys(a.checkpoints).length,9);assert.equal(a.first5orStop,'TARGET_FIRST');
 assert.equal(a.targets[5].hours,1/12);assert.equal(a.stop,null);assert.equal(a.btcCoverage,'COMPLETE');
 const old=JSON.stringify(a);advanceArm(a,r,r,entry+2880*MS);assert.equal(JSON.stringify(a),old);
});
test('target and stop same candle is ambiguous; later stop never changes first hit',()=>{
 const a=arm(1,'PRESSÃO');advanceArm(a,[bar(entry,100,106,96)],[],entry+MS);assert.equal(a.first5orStop,'AMBIGUOUS');
 const b=arm(1,'PRESSÃO');advanceArm(b,[bar(entry,100,106,99),bar(entry+MS,100,101,90)],[],entry+2*MS);assert.equal(b.first5orStop,'TARGET_FIRST');assert.ok(b.mae< -9.9);
});
test('gaps do not fabricate checkpoints or next-open entry',()=>{
 const a=arm(1,'PRESSÃO');advanceArm(a,[bar(entry+MS)],[],entry+2*MS);assert.equal(a.status,'MISSING_ENTRY');
 const b=arm(1,'PRESSÃO'),r=bars(14).filter((_,i)=>i!==11);advanceArm(b,r,[],entry+14*MS);assert.equal(b.coverage,'PARTIAL');assert.equal(b.checkpoints[1].coverage,'MISSING');assert.equal(b.checkpoints[1].returnPct,null);
});
test('falling 10 percent is a positive retracement, both directions',()=>{assert.ok(retracement('BUY',100,80,90)>0);assert.ok(retracement('SELL',100,80,90)>0)});
test('selective rejects open-only evidence and unavailable taker volume',()=>{
 const r=bars(80);assert.equal(selective(r,'PRESSÃO','BUY',entry+MS).approved,false);
 assert.equal(selective(r.map(c=>({...c,tb:undefined})),'PRESSÃO','BUY',entry+80*MS).approved,false);
});
test('deployed backend candidate wiring leaves official motor calculation intact',()=>{
 const s=fs.readFileSync('supabase/functions/ep-24x7-monitor/index.ts','utf8');
 assert.ok(s.includes('core.closed(x.candles,now)'));assert.ok(s.includes('ep_collect_rep_10d'));
 assert.ok(s.includes("const retr=dir==='BUY'&&peak>level?-pct(peak,p)"));
 assert.ok(!/const internalKey="/.test(s));
});
