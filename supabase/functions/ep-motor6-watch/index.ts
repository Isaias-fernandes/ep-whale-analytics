
const TRAFFIC_PROTECTION = Object.freeze({version:'2026-10-12',cacheMs:60000,maxEntries:32});
function serveProtectedRead(handler:(req:Request)=>Promise<Response>){
  const cache=new Map<string,{expires:number,body:Uint8Array,gzip:Uint8Array,status:number,headers:Headers}>();
  const inflight=new Map<string,Promise<any>>();
  Deno.serve(async(req:Request)=>{
    if(req.method!=='GET')return handler(req);
    const key=JSON.stringify([req.url,req.headers.get('authorization'),req.headers.get('apikey'),req.headers.get('origin')]);
    let entry=cache.get(key);
    if(!entry||entry.expires<=Date.now()){
      let pending=inflight.get(key);
      if(!pending){
        pending=(async()=>{
          const response=await handler(req);
          const body=new Uint8Array(await response.arrayBuffer());
          let valid=response.ok;
          try{if(JSON.parse(new TextDecoder().decode(body)).ok===false)valid=false;}catch{valid=false;}
          const gzip=valid?new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()):body;
          const next={expires:valid?Date.now()+TRAFFIC_PROTECTION.cacheMs:0,body,gzip,status:response.status,headers:new Headers(response.headers)};
          if(valid){if(cache.size>=TRAFFIC_PROTECTION.maxEntries)cache.delete(cache.keys().next().value!);cache.set(key,next);}
          return next;
        })().finally(()=>inflight.delete(key));
        inflight.set(key,pending);
      }
      entry=await pending;
    }
    const headers=new Headers(entry!.headers);
    headers.set('Cache-Control',entry!.expires>Date.now()?'private, max-age=60':'no-store');
    const vary=new Set((headers.get('Vary')||'').split(',').map(x=>x.trim()).filter(Boolean));
    ['Accept-Encoding','Origin','Authorization','apikey'].forEach(x=>vary.add(x));
    headers.set('Vary',Array.from(vary).join(', '));
    headers.set('X-EP-Traffic-Protection',TRAFFIC_PROTECTION.version);
    headers.delete('Content-Length');
    const compressed=/\bgzip\b/i.test(req.headers.get('Accept-Encoding')||'')&&entry!.gzip.length<entry!.body.length;
    if(compressed)headers.set('Content-Encoding','gzip');else headers.delete('Content-Encoding');
    return new Response(compressed?entry!.gzip:entry!.body,{status:entry!.status,headers});
  });
}

const cors={'Access-Control-Allow-Origin':'https://isaias-fernandes.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json'};
serveProtectedRead(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='GET')return new Response(JSON.stringify({ok:false,error:'read_only'}),{status:405,headers:cors});const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,H={'apikey':key,'Authorization':`Bearer ${key}`};try{const [r,h]=await Promise.all([fetch(`${url}/rest/v1/ep_motor6_watch?select=*&status=eq.OPEN&order=entry_at.asc`,{headers:H}),fetch(`${url}/rest/v1/ep_motor6_history_canonical?select=*&order=observed_at.desc&limit=100`,{headers:H})]);if(!r.ok||!h.ok)throw new Error('backend_read_failed');const [rows,history]=await Promise.all([r.json(),h.json()]);return Response.json({ok:true,rows,history},{headers:cors})}catch{return new Response(JSON.stringify({ok:false,error:'backend_unavailable'}),{status:503,headers:cors})}});