import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const names=['ep-24x7-status','ep-motor6-watch','ep-five-motor-watch'];
for(const name of names){
 const source=fs.readFileSync('supabase/functions/'+name+'/index.ts','utf8');
 assert(source.includes("cacheMs:60000"),'Server cache protection removed');
 assert(source.includes("CompressionStream('gzip')"),'Compression protection removed');
 let serve, reads=0;
 const context={Deno:{serve:f=>serve=f},Request,Response,Headers,Blob,CompressionStream,Uint8Array,TextDecoder,Date,Map,Set,JSON,Promise};
 vm.createContext(context);
 vm.runInContext(stripTypeScriptTypes(source.slice(0,source.indexOf('\n\n',source.indexOf('function serveProtectedRead'))+2)||source),context);
 context.serveProtectedRead(async()=>{reads++;await new Promise(r=>setTimeout(r,5));return Response.json({ok:true,rows:Array(100).fill({asset:'BTC',phase:'confirmed'})});});
 const req=()=>new Request('https://example.com/status',{headers:{'Accept-Encoding':'gzip'}});
 const [a,b]=await Promise.all([serve(req()),serve(req())]);assert.equal(reads,1);assert.equal(a.headers.get('Content-Encoding'),'gzip');assert((await a.arrayBuffer()).byteLength<1000);await serve(req());assert.equal(reads,1);
 await serve(new Request('https://example.com/status',{headers:{Authorization:'different'}}));assert.equal(reads,2);
 context.serveProtectedRead(async()=>{reads++;return Response.json({ok:false},{status:503});});await serve(req());await serve(req());assert.equal(reads,4);
}
const browser=fs.readFileSync('ep-read-cache.js','utf8');
for(const name of names)assert(browser.includes("['"+name+"', 300000]"),'Five-minute browser cache changed: '+name);
console.log('Traffic protection checks passed');
