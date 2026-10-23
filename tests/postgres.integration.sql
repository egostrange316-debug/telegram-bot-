-- Run in the dedicated ENZO project. All fixtures roll back, including queue work.
begin;
set local role service_role;
do $$
declare a jsonb; b jsonb; id text := 'aaaaaaaaaaaaaaaaaaaaaaaa';
begin
  if not enzo_private.matches('{"n":8,"groups":["a","b"]}', '{"n":{"$gte":8},"groups":"b"}') then raise exception 'array/numeric filter'; end if;
  if not enzo_private.matches('{}', '{"x":null}') then raise exception 'missing null'; end if;
  if enzo_private.matches('{}', '{"x":{"$ne":null}}') then raise exception 'missing ne null'; end if;
  a := public.enzo_documents('bot_students','findOneAndUpdate','{"telegram_id":991000001}',
    '{"$setOnInsert":{"role":"student","full_name":"SQL Fixture"},"$addToSet":{"group_ids":"bbbbbbbbbbbbbbbbbbbbbbbb"}}', '{}',0,
    jsonb_build_object('new',true,'upsert',true,'new_id',id,'defaults',jsonb_build_object('group_ids','[]'::jsonb)));
  if a->>'_id' <> id or a->>'role' <> 'student' then raise exception 'upsert'; end if;
  b := public.enzo_documents('bot_students','findOne','{"group_ids":"bbbbbbbbbbbbbbbbbbbbbbbb","role":"student"}');
  if b->>'_id' <> id then raise exception 'array roster'; end if;
  b := public.enzo_documents('bot_students','updateOne',jsonb_build_object('_id',id),
    '{"$set":{"status":"active"},"$max":{"subscription_end_date":"2026-11-30T18:59:59.999Z"},"$push":{"payments":{"$each":[{"kind":"month"}],"$slice":-60}}}');
  if b->>'modifiedCount' <> '1' then raise exception 'payment update'; end if;
  b := public.enzo_documents('bot_students','updateOne',jsonb_build_object('_id',id,'$or',jsonb_build_array(jsonb_build_object('subscription_end_date',jsonb_build_object('$lt','2026-11-30T18:59:59.999Z')),jsonb_build_object('subscription_end_date',null))),'{"$push":{"payments":{"kind":"duplicate"}}}');
  if b->>'matchedCount' <> '0' then raise exception 'payment idempotence'; end if;
  perform public.enzo_documents('bot_students','updateOne',jsonb_build_object('_id',id),'{"$addToSet":{"group_ids":"bbbbbbbbbbbbbbbbbbbbbbbb"},"$unset":{"name_key":1}}');
  b := public.enzo_documents('bot_students','findOne',jsonb_build_object('_id',id));
  if jsonb_array_length(b->'group_ids') <> 1 or jsonb_array_length(b->'payments') <> 1 then raise exception 'array update'; end if;
  perform public.enzo_documents('bot_students','updateOne',jsonb_build_object('_id',id),'{"$pull":{"group_ids":"bbbbbbbbbbbbbbbbbbbbbbbb"}}');
  if public.enzo_documents('bot_students','count','{"group_ids":"bbbbbbbbbbbbbbbbbbbbbbbb"}') <> '0'::jsonb then raise exception 'membership removal'; end if;
  begin
    perform public.enzo_documents('bot_students','create','{}','{"telegram_id":991000001}', '{}',0,'{"new_id":"cccccccccccccccccccccccc"}');
    raise exception 'duplicate telegram accepted';
  exception when unique_violation then null; end;
  perform public.enzo_documents('bot_screenshot_results','create','{}',jsonb_build_object('user',id,'status','accepted','needs_analysis',true,'file_unique_id','fixture1'), '{}',0,'{"new_id":"dddddddddddddddddddddddd"}');
  begin
    perform public.enzo_documents('bot_screenshot_results','create','{}',jsonb_build_object('user',id,'status','accepted','needs_analysis',true,'file_unique_id','fixture2'), '{}',0,'{"new_id":"eeeeeeeeeeeeeeeeeeeeeeee"}');
    raise exception 'second pending analysis accepted';
  exception when unique_violation then null; end;
  perform public.enzo_documents('bot_screenshot_results','updateOne','{"file_unique_id":"fixture1"}','{"$set":{"needs_analysis":false,"analysis":"I reviewed all my mistakes"}}');
  perform public.enzo_documents('bot_screenshot_results','create','{}',jsonb_build_object('user',id,'status','accepted','needs_analysis',true,'file_unique_id','fixture2'), '{}',0,'{"new_id":"eeeeeeeeeeeeeeeeeeeeeeee"}');
  if public.enzo_documents('bot_screenshot_results','count',jsonb_build_object('user',id,'needs_analysis',true)) <> '1'::jsonb then raise exception 'analysis lock'; end if;
  if not public.enzo_lease('fixture','owner-a') or public.enzo_lease('fixture','owner-b') then raise exception 'worker lease'; end if;
  perform public.enzo_lease('fixture','owner-a',true);
  if not public.enzo_lease('fixture','owner-b') then raise exception 'worker release'; end if;
  perform public.enzo_queue('enqueue','{"update_id":991000001}');
  perform public.enzo_queue('enqueue','{"update_id":991000001}');
  a := public.enzo_queue('claim');
  if a->>'update_id' <> '991000001' then raise exception 'queue claim'; end if;
  if public.enzo_queue('claim') is not null then raise exception 'double claim'; end if;
  perform public.enzo_queue('done','{}',991000001);
  if public.enzo_queue('claim') is not null then raise exception 'duplicate update'; end if;
  if (select count(*) from public.enzo_updates where update_id=991000001) <> 1 then raise exception 'deduplication'; end if;
  if (select count(*) from jsonb_object_keys(public.enzo_runtime_settings())) <> 6 then raise exception 'Vault settings unavailable'; end if;
end;
$$;
select 'Postgres workflows, constraints, leases, queue and Vault: PASS' as result;
rollback;
