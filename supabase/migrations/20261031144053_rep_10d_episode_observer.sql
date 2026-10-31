create table if not exists public.ep_early_leg_episode_tracks (
 episode_id text primary key, asset text not null, direction text not null check(direction in ('BUY','SELL')),
 started_at timestamptz not null, entry_price numeric not null check(entry_price>0),
 updated_at timestamptz not null, status text not null default 'COLLECTING', data jsonb not null
);
alter table public.ep_early_leg_episode_tracks enable row level security;
revoke all on public.ep_early_leg_episode_tracks from public,anon,authenticated;
grant select,insert,update on public.ep_early_leg_episode_tracks to service_role;
create index if not exists ep_rep10d_active_asset on public.ep_early_leg_episode_tracks(asset) where status='COLLECTING';
create index if not exists ep_rep10d_started on public.ep_early_leg_episode_tracks(started_at desc);

create or replace function public.ep_rep10d_arm(p_at bigint,p_phase text,p_evidence jsonb default null)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
select jsonb_build_object('signalAt',p_at,'phase',p_phase,'evidence',p_evidence,'entryTime',ceil(p_at/300000.0)*300000,
 'entry',null,'status','PENDING','coverage','COMPLETE','lastCloseTime',null,'mfe',0,'mae',0,'returnPct',null,
 'checkpoints','{}'::jsonb,'targets','{}'::jsonb,'stop',null,'first5orStop',null,'btcEntry',null,'btcCoverage','COMPLETE');
$$;

create or replace function public.ep_rep10d_advance(a jsonb,bars jsonb,btc jsonb,nowms bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb; b jsonb; et bigint; ct bigint; cl bigint; lastct bigint; finish bigint;
 entry numeric; o numeric; h numeric; l numeric; px numeric; up numeric; dn numeric; bef numeric;
 mfe numeric; mae numeric; ret numeric; br numeric; be numeric; cp jsonb; targets jsonb; stop jsonb;
 sgn integer; firsthit text; cov text; bcov text; hours integer; target integer; hit boolean; stopped boolean; due bigint;
begin
 if a->>'status' in ('COMPLETED','MISSING_ENTRY') then return a; end if;
 sgn:=case when a->>'direction'='SELL' then -1 else 1 end;
 et:=(a->>'entryTime')::bigint; entry:=(a->>'entry')::numeric;
 if entry is null then
  select value into c from jsonb_array_elements(bars) where (value->>0)::bigint=et limit 1;
  if c is null then
   if (bars->0->>0)::bigint>et then a:=a||jsonb_build_object('status','MISSING_ENTRY','coverage','PARTIAL'); end if;
   return a;
  end if;
  entry:=(c->>1)::numeric;
  select value into b from jsonb_array_elements(btc) where (value->>0)::bigint=et limit 1;
  a:=a||jsonb_build_object('entry',entry,'lastCloseTime',et,'status','COLLECTING','btcEntry',(b->>1)::numeric,'btcCoverage',case when b is null then 'PARTIAL' else 'COMPLETE' end);
 end if;
 lastct:=(a->>'lastCloseTime')::bigint; finish:=et+864000000;
 mfe:=(a->>'mfe')::numeric;mae:=(a->>'mae')::numeric;cov:=a->>'coverage';bcov:=a->>'btcCoverage';
 cp:=a->'checkpoints';targets:=a->'targets';stop:=a->'stop';firsthit:=a->>'first5orStop';be:=(a->>'btcEntry')::numeric;
 for c in select value from jsonb_array_elements(bars) where (value->>0)::bigint>=lastct and (value->>0)::bigint+300000<=least(nowms,finish) order by (value->>0)::bigint loop
  ct:=(c->>0)::bigint;cl:=ct+300000;
  if ct<>lastct then cov:='PARTIAL';end if;
  o:=(c->>1)::numeric;h:=(c->>2)::numeric;l:=(c->>3)::numeric;px:=(c->>4)::numeric;
  up:=case when sgn=1 then (h/entry-1)*100 else (1-l/entry)*100 end;dn:=case when sgn=1 then (l/entry-1)*100 else (1-h/entry)*100 end;bef:=mae;
  mfe:=greatest(mfe,up);mae:=least(mae,dn);ret:=sgn*(px/entry-1)*100;lastct:=cl;
  select value into b from jsonb_array_elements(btc) where (value->>0)::bigint=ct limit 1;
  if b is null then bcov:='PARTIAL';end if;
  br:=case when be>0 and b is not null then sgn*((b->>4)::numeric/be-1)*100 else null end;
  hit:=up>=5;stopped:=dn<=-3;
  if firsthit is null then firsthit:=case when sgn*(o/entry-1)*100>=5 then 'TARGET_FIRST' when sgn*(o/entry-1)*100<=-3 then 'STOP_FIRST' when hit and stopped then 'AMBIGUOUS' when hit then 'TARGET_FIRST' when stopped then 'STOP_FIRST' end;end if;
  if (stop is null or stop='null'::jsonb) and stopped then stop:=jsonb_build_object('at',cl,'hours',(cl-et)/3600000.0);end if;
  foreach target in array array[1,2,3,5,10,20] loop
   if not targets ? target::text and up>=target then targets:=targets||jsonb_build_object(target::text,jsonb_build_object('at',cl,'hours',(cl-et)/3600000.0,'maeBeforeCandle',bef,'maeThroughCandle',mae,'orderWithinCandle','UNKNOWN','coverage',cov));end if;
  end loop;
  foreach hours in array array[1,6,12,24,48,72,120,168,240] loop
   due:=et+hours::bigint*3600000;
   if not cp ? hours::text and cl>=due then
    cp:=cp||jsonb_build_object(hours::text,case when cl=due then jsonb_build_object('at',cl,'price',px,'rawReturnPct',sgn*ret,'returnPct',ret,'mfe',mfe,'mae',mae,'coverage',cov,'btcReturnPct',br,'excessBtcPct',ret-br,'btcCoverage',bcov) else jsonb_build_object('at',due,'returnPct',null,'coverage','MISSING') end);
   end if;
  end loop;
  a:=a||jsonb_build_object('lastPrice',px,'rawReturnPct',sgn*ret,'returnPct',ret,'btcReturnPct',br,'excessBtcPct',ret-br);
 end loop;
 a:=a||jsonb_build_object('mfe',mfe,'mae',mae,'lastCloseTime',lastct,'coverage',cov,'btcCoverage',bcov,'checkpoints',cp,'targets',targets,'stop',stop,'first5orStop',firsthit);
 if lastct=finish then a:=a||jsonb_build_object('status','COMPLETED');
 elsif nowms>finish+300000 then
  foreach hours in array array[1,6,12,24,48,72,120,168,240] loop
   if not cp ? hours::text then cp:=cp||jsonb_build_object(hours::text,jsonb_build_object('at',et+hours::bigint*3600000,'returnPct',null,'coverage','MISSING'));end if;
  end loop;
  a:=a||jsonb_build_object('status','COMPLETED','coverage','PARTIAL','checkpoints',cp);
 end if;
 return a;
end $$;

create or replace function public.ep_collect_rep_10d(p_samples jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare sample jsonb; cur jsonb; candidate jsonb; bars jsonb; btc jsonb; models jsonb; payload jsonb;
 rec public.ep_early_leg_episode_tracks%rowtype; armname text; nowms bigint; age numeric; finalstatus text; n integer:=0;
begin
 if jsonb_typeof(p_samples)<>'array' or jsonb_array_length(p_samples)>50 then raise exception 'Invalid samples';end if;
 select value->'bars' into btc from jsonb_array_elements(p_samples) where value->'current'->>'asset'='BTCUSDT' limit 1;btc:=coalesce(btc,'[]'::jsonb);
 for sample in select value from jsonb_array_elements(p_samples) loop
  cur:=sample->'current';candidate:=sample->'candidate';bars:=sample->'bars';
  nowms:=(extract(epoch from (cur->>'updated_at')::timestamptz)*1000)::bigint;
  if cur->>'direction' in ('BUY','SELL') and cur->>'episode_id' is not null then
   insert into public.ep_early_leg_episode_tracks(episode_id,asset,direction,started_at,entry_price,updated_at,data)
   values(cur->>'episode_id',cur->>'asset',cur->>'direction',(cur->>'updated_at')::timestamptz,(cur->>'price')::numeric,(cur->>'updated_at')::timestamptz,
    jsonb_build_object('version','rep-10d-v1','prospective',true,'referencePrice',cur->'price','sourceEpisodeStartedAt',cur->'episode_started_at','models',jsonb_build_object('observer',public.ep_rep10d_arm(nowms,cur->>'phase')||jsonb_build_object('direction',cur->>'direction'))))
   on conflict(episode_id) do nothing;
  end if;
  for rec in select * from public.ep_early_leg_episode_tracks where asset=cur->>'asset' and status='COLLECTING' for update loop
   payload:=rec.data;models:=payload->'models';age:=extract(epoch from ((cur->>'updated_at')::timestamptz-rec.started_at))/3600;
   if rec.episode_id=cur->>'episode_id' and cur->>'direction'='BUY' and age<24 and not models ? 'selective' then
    payload:=payload||jsonb_build_object('lastSelectiveReading',candidate);
    if (candidate->>'approved')::boolean then models:=models||jsonb_build_object('selective',public.ep_rep10d_arm(nowms,candidate->>'stage',candidate));end if;
   end if;
   for armname in select jsonb_object_keys(models) loop
    models:=jsonb_set(models,array[armname],public.ep_rep10d_advance(models->armname,bars,btc,nowms));
   end loop;
   finalstatus:=case when age>=24 and not exists(select 1 from jsonb_each(models) where value->>'status' not in('COMPLETED','MISSING_ENTRY')) then 'COMPLETED' else 'COLLECTING' end;
   payload:=payload||jsonb_build_object('models',models);
   update public.ep_early_leg_episode_tracks set data=payload,status=finalstatus,updated_at=(cur->>'updated_at')::timestamptz where episode_id=rec.episode_id;
   n:=n+1;
  end loop;
 end loop;
 return n;
end $$;

create or replace function public.ep_rep10d_report()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with arms as (
 select t.direction,m.key model,m.value arm from public.ep_early_leg_episode_tracks t cross join lateral jsonb_each(t.data->'models') m
), checkpoints as (
 select direction,model,h.horizon,arm->'checkpoints'->h.horizon::text cp from arms cross join (values(24),(240)) h(horizon)
), summaries as (
 select direction,model,horizon,count(*) filter(where cp->>'coverage'='COMPLETE' and cp->>'returnPct' is not null) evaluated,
 count(*) filter(where (cp->>'returnPct')::numeric>0 and cp->>'coverage'='COMPLETE') positive,
 avg((cp->>'returnPct')::numeric) filter(where cp->>'coverage'='COMPLETE') return_mean,
 avg((cp->>'excessBtcPct')::numeric) filter(where cp->>'coverage'='COMPLETE' and cp->>'btcCoverage'='COMPLETE') excess_btc_mean
 from checkpoints group by direction,model,horizon
), recent as (select episode_id,asset,started_at,updated_at,status,data from public.ep_early_leg_episode_tracks order by started_at desc limit 30)
select jsonb_build_object('ok',true,'version','rep-10d-v1','generated_at',now(),
 'summary',coalesce((select jsonb_agg(to_jsonb(s)) from summaries s),'[]'::jsonb),
 'total',(select count(*) from public.ep_early_leg_episode_tracks),'recent',coalesce((select jsonb_agg(to_jsonb(r)) from recent r),'[]'::jsonb));
$$;
revoke all on function public.ep_rep10d_arm(bigint,text,jsonb),public.ep_rep10d_advance(jsonb,jsonb,jsonb,bigint),public.ep_collect_rep_10d(jsonb),public.ep_rep10d_report() from public,anon,authenticated;
grant execute on function public.ep_rep10d_arm(bigint,text,jsonb),public.ep_rep10d_advance(jsonb,jsonb,jsonb,bigint),public.ep_collect_rep_10d(jsonb),public.ep_rep10d_report() to service_role;
notify pgrst,'reload schema';
