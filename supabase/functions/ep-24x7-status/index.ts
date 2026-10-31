
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

serveProtectedRead(async(req)=>{if(req.method!=='GET'&&req.method!=='OPTIONS')return new Response(JSON.stringify({ok:false,error:'read_only'}),{status:405,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://isaias-fernandes.github.io','Access-Control-Allow-Methods':'GET,OPTIONS'}});const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Content-Type':'application/json'};if(req.method==='OPTIONS')return new Response('ok',{headers:cors});const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,H={'apikey':key,'Authorization':`Bearer ${key}`};try{if(new URL(req.url).searchParams.get('view')==='rep-10d'){
 const r=await fetch(`${url}/rest/v1/rpc/ep_rep10d_report`,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('REP 10D HTTP '+r.status);
 return new Response(JSON.stringify(await r.json()),{headers:cors});
}const [runs,state,events,motor6,early_leg_state]=await Promise.all([fetch(`${url}/rest/v1/ep_backend_runs?select=id,started_at,finished_at,status,symbols_ok,symbols_error&order=id.desc&limit=3`,{headers:H}).then(r=>r.json()),fetch(`${url}/rest/v1/ep_signal_state?select=market,symbol,asset,direction,score,motors,tier,entry_score,entry_price,price,peak_motors,started_at,stage_started_at,updated_at,durations,metrics&order=symbol.asc`,{headers:H}).then(r=>r.json()),fetch(`${url}/rest/v1/ep_signal_events?select=id,event_at,market,symbol,asset,event_type,direction,from_motors,motors,score,tier,entry_score,peak_motors,entry_price,price,return_pct,max_favorable_pct,max_adverse_pct,duration_ms,durations,metrics&order=id.desc&limit=200`,{headers:H}).then(r=>r.json()),fetch(`${url}/rest/v1/ep_motor6_watch?select=*&status=eq.OPEN&order=entry_at.asc`,{headers:H}).then(r=>r.json()),fetch(`${url}/rest/v1/ep_early_leg_v2_state?select=asset,phase,direction,episode_id,episode_started_at,episode_entry_price,price,updated_at&episode_id=not.is.null&order=episode_started_at.desc&limit=50`,{headers:H}).then(r=>r.json())]);return new Response(JSON.stringify({ok:true,server_time:new Date().toISOString(),runs,state,events,motor6,early_leg_state}),{headers:cors})}catch(e){return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:cors})}})
