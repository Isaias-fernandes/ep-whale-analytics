-- Run transactionally. All synthetic episodes are rolled back.
begin;
do $tests$
declare a jsonb;b jsonb;bars jsonb;n integer;d jsonb;
begin
 a:=public.ep_mmtest_arm(1,'BUY',true,'ATR');
 a:=public.ep_mmtest_advance(a,'[[300000,100,110,99,108,2,2]]',600000);
 if a->>'status'<>'COLLECTING' or (a->>'stopPrice')::numeric<>104 then raise exception 'Trailing stop used future intrabar path';end if;
 a:=public.ep_mmtest_advance(a,'[[300000,100,110,99,108,2,2],[600000,105,106,103,104,2,2]]',900000);
 if a->>'status'<>'COMPLETED' or (a->>'exitPrice')::numeric<>104 or abs((a->>'netPct')::numeric-3.8)>.00001 then raise exception 'BUY ATR failure %',a;end if;
 b:=public.ep_mmtest_advance(a,'[[900000,50,60,40,55,2,2]]',1200000);
 if a<>b then raise exception 'Completed result changed';end if;
 a:=public.ep_mmtest_advance(public.ep_mmtest_arm(1,'SELL',true,'ATR'),'[[300000,100,101,90,92,2,2],[600000,95,97,94,96,2,2]]',900000);
 if (a->>'exitPrice')::numeric<>96 or abs((a->>'netPct')::numeric-3.8)>.00001 then raise exception 'SELL ATR failure %',a;end if;
 a:=public.ep_mmtest_advance(public.ep_mmtest_arm(1,'BUY',true,'ATR'),'[[300000,100,101,99,100,2,2],[600000,90,95,89,92,2,2]]',900000);
 if (a->>'exitPrice')::numeric<>90 or (a->>'exitTime')::bigint<>600000 then raise exception 'Gap execution failure %',a;end if;
 a:=public.ep_mmtest_arm(1,'BUY',true,'CONTROL')||'{"exitQueuedAt":900000}'::jsonb;
 a:=public.ep_mmtest_advance(a,'[[300000,100,101,99,100,2,2],[600000,100,103,99,102,2,2],[900000,102,110,80,95,2,2]]',1200000);
 if (a->>'exitPrice')::numeric<>102 or abs((a->>'netPct')::numeric-1.8)>.00001 then raise exception 'Control exit failure %',a;end if;
 select jsonb_agg(jsonb_build_array(300000+i::bigint*300000,100,102,99,101,2,2) order by i) into bars from generate_series(0,575) i;
 a:=public.ep_mmtest_advance(public.ep_mmtest_arm(1,'BUY',true,'CONTROL'),bars,173100000);
 if a->>'exitReason'<>'TIME_LIMIT_48H' or abs((a->>'netPct')::numeric-.8)>.00001 then raise exception '48h failure %',a;end if;
 a:=public.ep_mmtest_advance(public.ep_mmtest_arm(1,'BUY',true,'ATR'),'[[300000,100,101,99,100,null,null]]',600000);
 if a->>'status'<>'INVALID_ATR' then raise exception 'Missing ATR passed';end if;
 a:=public.ep_mmtest_advance(public.ep_mmtest_arm(1,'BUY',true,'CONTROL'),'[[600000,100,101,99,100,2,2]]',900000);
 if a->>'status'<>'MISSING_ENTRY' then raise exception 'Missing entry fabricated';end if;
 a:=public.ep_mmtest_advance(public.ep_mmtest_arm(1,'BUY',true,'CONTROL')||'{"exitQueuedAt":300000}','[[300000,100,101,99,100,2,2]]',600000);
 if a->>'status'<>'CANCELLED_BEFORE_ENTRY' then raise exception 'Pre-entry cancellation charged a cost';end if;
 d:='[{"asset":"MM_TEST_ROLLBACK","at":"2026-11-03T00:00:01Z","direction":"BUY","motors":3,"evidence":{"technicalStructure":true,"derivatives":false,"combined":false},"bars":[]}]';
 perform public.ep_collect_mm_validation_v1(d);perform public.ep_collect_mm_validation_v1(d);
 select count(*) into n from public.ep_multimotor_shadow_tests where asset='MM_TEST_ROLLBACK';if n<>1 then raise exception 'Duplicate admission';end if;
 perform public.ep_collect_mm_validation_v1('[{"asset":"MM_TEST_ROLLBACK","at":"2026-11-03T01:00:01Z","direction":"SELL","motors":4,"evidence":{"technicalStructure":true,"derivatives":true,"combined":true},"bars":[]}]');
 select count(*) into n from public.ep_multimotor_shadow_tests where asset='MM_TEST_ROLLBACK';if n<>2 then raise exception 'Direction not split';end if;
 select count(*) into n from public.ep_multimotor_shadow_tests where asset='MM_TEST_ROLLBACK' and admission_open;if n<>1 then raise exception 'Overlapping admissions';end if;
 perform public.ep_mm_validation_report_v1();
end $tests$;
rollback;
select 'MM Validation: database tests passed; synthetic records rolled back' result;
