create table if not exists public.ep_multimotor_shadow_tests(
 id text primary key, asset text not null, direction text not null check(direction in('BUY','SELL')),
 signal_at timestamptz not null, updated_at timestamptz not null,
 admission_open boolean not null default true, status text not null default 'COLLECTING',data jsonb not null
);
alter table public.ep_multimotor_shadow_tests enable row level security;
revoke all on public.ep_multimotor_shadow_tests from public,anon,authenticated;
grant select,insert,update on public.ep_multimotor_shadow_tests to service_role;
create unique index if not exists ep_mmtest_one_admission on public.ep_multimotor_shadow_tests(asset) where admission_open;
create index if not exists ep_mmtest_collecting on public.ep_multimotor_shadow_tests(asset) where status='COLLECTING';
create index if not exists ep_mmtest_recent on public.ep_multimotor_shadow_tests(signal_at desc);

create or replace function public.ep_mmtest_arm(p_at bigint,p_dir text,p_accepted boolean,p_exit text)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
select jsonb_build_object('accepted',p_accepted,'exitRule',p_exit,'direction',p_dir,'entryTime',ceil(p_at/300000.0)*300000,
 'entry',null,'status',case when p_accepted then 'PENDING' else 'FILTERED' end,'coverage','COMPLETE',
 'lastCloseTime',null,'mfe',0,'mae',0,'stopPrice',null,'watermark',null,'exitQueuedAt',null,'netPct',null);
$$;

create or replace function public.ep_mmtest_advance(a jsonb,bars jsonb,nowms bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;et bigint; ct bigint;cl bigint;lastct bigint;endms bigint;queue bigint;sgn integer;
 entry numeric;atr numeric;atrclose numeric;stopprice numeric;water numeric;o numeric;h numeric;l numeric;px numeric;
 mfe numeric;mae numeric;fill numeric;fillat bigint;reason text;cov text;ret numeric;
begin
 if a->>'status' not in ('PENDING','COLLECTING') then return a;end if;
 et:=(a->>'entryTime')::bigint;endms:=et+172800000;entry:=(a->>'entry')::numeric;
 queue:=(a->>'exitQueuedAt')::bigint;
 if entry is null and a->>'exitRule'='CONTROL' and queue<=et then return a||jsonb_build_object('status','CANCELLED_BEFORE_ENTRY');end if;
 sgn:=case when a->>'direction'='SELL' then -1 else 1 end;
 if entry is null then
  select value into c from jsonb_array_elements(bars) where (value->>0)::bigint=et limit 1;
  if c is null then
   if (bars->0->>0)::bigint>et or nowms>endms then return a||jsonb_build_object('status','MISSING_ENTRY','coverage','PARTIAL');end if;
   return a;
  end if;
  entry:=(c->>1)::numeric;atr:=(c->>5)::numeric;
  if a->>'exitRule'='ATR' and (atr is null or atr<=0 or entry-sgn*3*atr<=0) then return a||jsonb_build_object('status','INVALID_ATR','coverage','PARTIAL');end if;
  a:=a||jsonb_build_object('entry',entry,'lastCloseTime',et,'status','COLLECTING','watermark',entry,'atrEntry',atr,'stopPrice',case when a->>'exitRule'='ATR' then entry-sgn*3*atr end);
 end if;
 lastct:=(a->>'lastCloseTime')::bigint;queue:=(a->>'exitQueuedAt')::bigint;stopprice:=(a->>'stopPrice')::numeric;water:=(a->>'watermark')::numeric;
 mfe:=(a->>'mfe')::numeric;mae:=(a->>'mae')::numeric;cov:=a->>'coverage';
 for c in select value from jsonb_array_elements(bars) where (value->>0)::bigint>=lastct and (value->>0)::bigint+300000<=least(nowms,endms) order by (value->>0)::bigint loop
  ct:=(c->>0)::bigint;cl:=ct+300000;o:=(c->>1)::numeric;h:=(c->>2)::numeric;l:=(c->>3)::numeric;px:=(c->>4)::numeric;atrclose:=(c->>6)::numeric;
  if ct<>lastct then cov:='PARTIAL';end if;
  if a->>'exitRule'='CONTROL' and queue is not null and ct>=queue then
   fill:=o;fillat:=ct;reason:='OFFICIAL_END_OR_REVERSAL';exit;
  end if;
  if a->>'exitRule'='ATR' and ((sgn=1 and l<=stopprice) or (sgn=-1 and h>=stopprice)) then
   fill:=case when sgn*(o-stopprice)<=0 then o else stopprice end;fillat:=case when sgn*(o-stopprice)<=0 then ct else cl end;reason:='ATR_STOP';
   -- Intracandle extrema before the exit are unknown; report only known opening/fill.
   mfe:=greatest(mfe,sgn*(o/entry-1)*100,sgn*(fill/entry-1)*100);
   mae:=least(mae,sgn*(o/entry-1)*100,sgn*(fill/entry-1)*100);
   a:=a||jsonb_build_object('exitCandleExcursion','UNKNOWN');exit;
  end if;
  mfe:=greatest(mfe,case when sgn=1 then (h/entry-1)*100 else (1-l/entry)*100 end);
  mae:=least(mae,case when sgn=1 then (l/entry-1)*100 else (1-h/entry)*100 end);
  lastct:=cl;
  if a->>'exitRule'='ATR' then
   water:=case when sgn=1 then greatest(water,h) else least(water,l) end;
   if atrclose>0 then stopprice:=case when sgn=1 then greatest(stopprice,water-3*atrclose) else least(stopprice,water+3*atrclose) end;
   else cov:='PARTIAL';end if;
  end if;
  if cl=endms then fill:=px;fillat:=cl;reason:='TIME_LIMIT_48H';exit;end if;
 end loop;
 a:=a||jsonb_build_object('coverage',cov,'mfe',mfe,'mae',mae,'lastCloseTime',lastct,'stopPrice',stopprice,'watermark',water);
 if fill is not null then ret:=sgn*(fill/entry-1)*100;
  return a||jsonb_build_object('status','COMPLETED','exitPrice',fill,'exitTime',fillat,'exitReason',reason,'grossPct',ret,'netPct',ret-.20,'durationHours',(fillat-et)/3600000.0);
 end if;
 if nowms>endms+300000 then return a||jsonb_build_object('status','INCOMPLETE','coverage','PARTIAL');end if;
 return a;
end $$;

create or replace function public.ep_collect_mm_validation_v1(p_samples jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb;ev jsonb;models jsonb; a jsonb; rec public.ep_multimotor_shadow_tests%rowtype;
 atms bigint;nm text;n integer:=0;isopen boolean;signalid text;started timestamptz;latest timestamptz;
begin
 if jsonb_typeof(p_samples)<>'array' or jsonb_array_length(p_samples)>50 then raise exception 'Invalid samples';end if;
 for s in select value from jsonb_array_elements(p_samples) loop
  perform pg_advisory_xact_lock(hashtextextended('mm-validation-v1:'||(s->>'asset'),0));
  started:=(s->>'at')::timestamptz;atms:=(extract(epoch from started)*1000)::bigint;
  select max(updated_at) into latest from public.ep_multimotor_shadow_tests where asset=s->>'asset';
  if latest is not null and started<=latest then continue;end if;
  -- End admission and queue a next-open control exit before starting a new direction.
  for rec in select * from public.ep_multimotor_shadow_tests where asset=s->>'asset' and admission_open and ((s->>'motors')::integer<=1 or direction<>s->>'direction') for update loop
   models:=rec.data->'models';
   for nm in select jsonb_object_keys(models) loop
    a:=models->nm;
    if a->>'exitRule'='CONTROL' and a->>'status' in('PENDING','COLLECTING') then models:=jsonb_set(models,array[nm],a||jsonb_build_object('exitQueuedAt',ceil(atms/300000.0)*300000));end if;
   end loop;
   update public.ep_multimotor_shadow_tests set admission_open=false,data=jsonb_set(rec.data,'{models}',models) where id=rec.id;
  end loop;
  if (s->>'motors')::integer>=3 and not exists(select 1 from public.ep_multimotor_shadow_tests where asset=s->>'asset' and admission_open) then
   ev:=s->'evidence';models:=jsonb_build_object(
    'control',public.ep_mmtest_arm(atms,s->>'direction',true,'CONTROL'),
    'technical_structure',public.ep_mmtest_arm(atms,s->>'direction',coalesce((ev->>'technicalStructure')::boolean,false),'CONTROL'),
    'derivatives',public.ep_mmtest_arm(atms,s->>'direction',coalesce((ev->>'derivatives')::boolean,false),'CONTROL'),
    'combined',public.ep_mmtest_arm(atms,s->>'direction',coalesce((ev->>'combined')::boolean,false),'CONTROL'),
    'atr_exit',public.ep_mmtest_arm(atms,s->>'direction',true,'ATR'),
    'combined_atr',public.ep_mmtest_arm(atms,s->>'direction',coalesce((ev->>'combined')::boolean,false),'ATR'));
   signalid:='mm-validation-v1:'||(s->>'asset')||':'||atms;
   insert into public.ep_multimotor_shadow_tests(id,asset,direction,signal_at,updated_at,data)
    values(signalid,s->>'asset',s->>'direction',started,started,jsonb_build_object('version','mm-validation-v1','costPct',.20,'horizonHours',48,'atrMultiplier',3,'evidence',ev,'models',models));
  end if;
  for rec in select * from public.ep_multimotor_shadow_tests where asset=s->>'asset' and status='COLLECTING' for update loop
   models:=rec.data->'models';
   for nm in select jsonb_object_keys(models) loop models:=jsonb_set(models,array[nm],public.ep_mmtest_advance(models->nm,s->'bars',atms));end loop;
   isopen:=exists(select 1 from jsonb_each(models) where value->>'status' in('PENDING','COLLECTING'));
   update public.ep_multimotor_shadow_tests set data=jsonb_set(rec.data,'{models}',models),updated_at=started,status=case when isopen then 'COLLECTING' else 'COMPLETED' end where id=rec.id;
   n:=n+1;
  end loop;
 end loop;
 return n;
end $$;

create or replace function public.ep_mm_validation_report_v1()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with arms as (
 select t.direction,t.id,m.key model,m.value arm,t.data->'models'->'control' control from public.ep_multimotor_shadow_tests t cross join lateral jsonb_each(t.data->'models') m
), summary as (
 select direction,model,count(*) total,
 count(*) filter(where arm->>'accepted'='true') admitted,
 count(*) filter(where arm->>'status'='COMPLETED' and arm->>'coverage'='COMPLETE') completed,
 avg((arm->>'netPct')::numeric) filter(where arm->>'status'='COMPLETED' and arm->>'coverage'='COMPLETE') net_mean,
 avg((arm->>'durationHours')::numeric) filter(where arm->>'status'='COMPLETED' and arm->>'coverage'='COMPLETE') duration_mean,
 count(*) filter(where arm->>'status'='COMPLETED' and arm->>'coverage'='COMPLETE' and (arm->>'netPct')::numeric>0) positive,
 count(*) filter(where arm->>'status'='COMPLETED' and arm->>'coverage'='COMPLETE' and control->>'status'='COMPLETED' and control->>'coverage'='COMPLETE') paired,
 avg((arm->>'netPct')::numeric-(control->>'netPct')::numeric) filter(where arm->>'status'='COMPLETED' and arm->>'coverage'='COMPLETE' and control->>'status'='COMPLETED' and control->>'coverage'='COMPLETE') paired_delta,
 avg((control->>'netPct')::numeric) filter(where arm->>'accepted'='true' and control->>'status'='COMPLETED' and control->>'coverage'='COMPLETE') admitted_control_mean,
 count(*) filter(where arm->>'accepted'='false' and control->>'status'='COMPLETED' and control->>'coverage'='COMPLETE' and (control->>'netPct')::numeric<0) blocked_losses,
 count(*) filter(where arm->>'accepted'='false' and control->>'status'='COMPLETED' and control->>'coverage'='COMPLETE' and (control->>'netPct')::numeric>0) blocked_winners
 from arms group by direction,model
),recent as(select * from public.ep_multimotor_shadow_tests order by signal_at desc limit 30)
select jsonb_build_object('ok',true,'version','mm-validation-v1','generated_at',now(),'total',(select count(*) from public.ep_multimotor_shadow_tests),
 'summary',coalesce((select jsonb_agg(to_jsonb(s)) from summary s),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(r)) from recent r),'[]'::jsonb));
$$;
revoke all on function public.ep_mmtest_arm(bigint,text,boolean,text),public.ep_mmtest_advance(jsonb,jsonb,bigint),public.ep_collect_mm_validation_v1(jsonb),public.ep_mm_validation_report_v1() from public,anon,authenticated;
grant execute on function public.ep_mmtest_arm(bigint,text,boolean,text),public.ep_mmtest_advance(jsonb,jsonb,bigint),public.ep_collect_mm_validation_v1(jsonb),public.ep_mm_validation_report_v1() to service_role;
notify pgrst,'reload schema';
