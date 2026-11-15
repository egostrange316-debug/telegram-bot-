-- Additive Biology import and attempts. Existing mocks/results are preserved.
alter table public.enzo_documents_store drop constraint enzo_documents_store_collection_check;
alter table public.enzo_documents_store add constraint enzo_documents_store_collection_check check (collection in ('bot_students','bot_attendances','bot_tg_links','bot_tests','bot_attempts','bot_groups','bot_job_logs','bot_sessions','bot_link_codes','bot_screenshot_results','bot_attendance_reports','bio_profiles','bio_groups','bio_mocks','bio_submissions','bio_packages','bio_attempts'));
create or replace function public.enzo_documents(
  p_collection text, p_operation text, p_filter jsonb default '{}', p_update jsonb default '{}',
  p_sort jsonb default '{}', p_limit integer default 0, p_options jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare old jsonb; doc jsonb; rows jsonb; r record; k text; v jsonb;
  ordering text := ''; n integer := 0; changed integer := 0; simple jsonb := '{}';
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  stmt text;
begin
  if p_collection not in ('bot_students','bot_attendances','bot_tg_links','bot_tests','bot_attempts','bot_groups','bot_job_logs','bot_sessions','bot_link_codes','bot_screenshot_results','bot_attendance_reports','bio_profiles','bio_groups','bio_mocks','bio_submissions','bio_packages','bio_attempts') then raise exception 'Unknown collection'; end if;
  if p_operation not in ('find','findOne','count','create','findOneAndUpdate','updateOne','updateMany','deleteOne','findOneAndDelete') then raise exception 'Unknown operation'; end if;
  if p_operation not in ('find','findOne','count') then perform pg_advisory_xact_lock(hashtextextended('enzo:' || p_collection, 0)); end if;
  for k, v in select * from jsonb_each(p_filter) loop
    if left(k,1) <> '$' and position('.' in k) = 0 and k not in ('group_ids','report_chats') and jsonb_typeof(v) in ('string','number','boolean') then simple := simple || jsonb_build_object(k,v); end if;
  end loop;
  -- JSONB objects reorder keys. The adapter sends sort priority separately.
  for k in select value from jsonb_array_elements_text(coalesce(p_options->'sort_fields',(select jsonb_agg(key) from jsonb_each(p_sort)))) loop
    v := p_sort->k;
    ordering := ordering || case when ordering = '' then '' else ', ' end || format('(data #> %L::text[]) %s nulls last', string_to_array(k, '.'), case when v = '-1'::jsonb then 'desc' else 'asc' end);
  end loop;
  if ordering = '' then ordering := 'id'; end if;
  stmt := 'select data from public.enzo_documents_store where collection = $1 and data @> $2 and enzo_private.matches(data, $3) order by ' || ordering;
  if p_operation <> 'updateMany' and p_operation <> 'count' then
    if p_operation <> 'find' then stmt := stmt || ' limit 1';
    elsif p_limit > 0 then stmt := stmt || format(' limit %s', least(p_limit,10000)); end if;
  end if;
  if p_operation = 'count' then
    execute 'select count(*) from public.enzo_documents_store where collection = $1 and data @> $2 and enzo_private.matches(data, $3)' into n using p_collection, simple, p_filter;
    return to_jsonb(n);
  elsif p_operation = 'find' then
    execute 'select coalesce(jsonb_agg(data), ''[]''::jsonb) from (' || stmt || ') q' into rows using p_collection, simple, p_filter;
    return rows;
  elsif p_operation = 'findOne' then
    execute stmt into old using p_collection, simple, p_filter;
    return old;
  end if;
  if p_operation <> 'create' then
    for r in execute stmt using p_collection, simple, p_filter loop
      n := n + 1; old := r.data;
      if p_operation in ('deleteOne','findOneAndDelete') then
        delete from public.enzo_documents_store where collection = p_collection and id = old->>'_id';
        if p_operation = 'findOneAndDelete' then return old; end if;
        return jsonb_build_object('deletedCount', 1);
      end if;
      doc := enzo_private.patch(old, p_update, false);
      if doc <> old then changed := changed + 1; end if;
      if coalesce((p_options->>'timestamps')::boolean,true) then doc := doc || jsonb_build_object('updatedAt', stamp); end if;
      update public.enzo_documents_store set data = doc where collection = p_collection and id = old->>'_id';
      if p_operation = 'findOneAndUpdate' then return case when p_options->>'new' = 'true' then doc else old end; end if;
    end loop;
  end if;
  if n = 0 and (p_operation = 'create' or (p_options->>'upsert' = 'true' and p_operation in ('updateOne','findOneAndUpdate'))) then
    doc := coalesce(p_options->'defaults','{}'::jsonb);
    if p_operation = 'create' then doc := doc || p_update;
    else
      for k,v in select * from jsonb_each(p_filter) loop
        if left(k,1) <> '$' and jsonb_typeof(v) <> 'object' then doc := doc || jsonb_build_object(k,v); end if;
      end loop;
      doc := enzo_private.patch(doc,p_update,true);
    end if;
    doc := doc || jsonb_build_object('_id',coalesce(doc->>'_id',p_options->>'new_id'));
    if coalesce((p_options->>'timestamps')::boolean,true) then doc := doc || jsonb_build_object('createdAt',coalesce(doc->>'createdAt',stamp),'updatedAt',stamp); end if;
    insert into public.enzo_documents_store values(p_collection,doc->>'_id',doc);
    if p_operation = 'create' or (p_operation = 'findOneAndUpdate' and p_options->>'new' = 'true') then return doc; end if;
    if p_operation = 'findOneAndUpdate' then return null; end if;
    return jsonb_build_object('matchedCount',0,'modifiedCount',0,'upsertedCount',1);
  end if;
  if p_operation in ('findOneAndUpdate','findOneAndDelete') then return null; end if;
  return jsonb_build_object('matchedCount',n,'modifiedCount',changed,'deletedCount',0);
end;
$$;

create unique index bio_package_version on public.enzo_documents_store ((data->>'mock_id'), (data->>'version')) where collection='bio_packages';
create unique index bio_attempt_user on public.enzo_documents_store ((data->>'mock_id'), (data->>'telegram_id')) where collection='bio_attempts';

create or replace function public.bio_begin(p_mock_id text,p_telegram_id bigint,p_new_id text,p_nonce text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb; p jsonb; g jsonb; a jsonb; s jsonb; stamp text;
begin
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_mocks',0));
  select data into m from public.enzo_documents_store where collection='bio_mocks' and id=p_mock_id;
  if m is null or m->>'status'<>'open' or clock_timestamp()<(m->>'starts_at')::timestamptz or clock_timestamp()>=(m->>'ends_at')::timestamptz then return jsonb_build_object('ok',false,'reason','closed'); end if;
  select data into g from public.enzo_documents_store where collection='bio_groups' and id=m->>'group_id';
  select data into p from public.enzo_documents_store where collection='bio_profiles' and data @> jsonb_build_object('telegram_id',p_telegram_id);
  if g is null or g->>'enabled'<>'true' or p is null or not coalesce(p->'group_ids' @> jsonb_build_array(m->>'group_id'),false) then return jsonb_build_object('ok',false,'reason','membership'); end if;
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_attempts',0));
  select data into a from public.enzo_documents_store where collection='bio_attempts' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  select data into s from public.enzo_documents_store where collection='bio_submissions' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  if s is not null and not coalesce((a->>'retake_allowed')::boolean,false) and (a is null or a->>'state'<>'active') then return jsonb_build_object('ok',false,'reason','already'); end if;
  if a is null or a->>'state'<>'active' then
    stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    a:=jsonb_build_object('_id',coalesce(a->>'_id',p_new_id),'mock_id',p_mock_id,'telegram_id',p_telegram_id,'nonce',p_nonce,
      'generation',coalesce((a->>'generation')::integer,0)+1,'started_at',stamp,'state','active','retake_allowed',false,'draft','{}'::jsonb);
    insert into public.enzo_documents_store values('bio_attempts',a->>'_id',a) on conflict(collection,id) do update set data=excluded.data;
  end if;
  return jsonb_build_object('ok',true,'nonce',a->>'nonce','started_at',a->>'started_at');
end; $$;
revoke all on function public.bio_begin(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.bio_begin(text,bigint,text,text) to service_role;

create or replace function public.bio_submit_v2(p_mock_id text,p_telegram_id bigint,p_answers jsonb,p_new_id text,p_nonce text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb; p jsonb; g jsonb; a jsonb; old jsonb; r jsonb; n integer; correct integer; blanks integer; mistakes jsonb; stamp text;
begin
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_mocks',0));
  select data into m from public.enzo_documents_store where collection='bio_mocks' and id=p_mock_id;
  if m is null or m->>'status'<>'open' or clock_timestamp()<(m->>'starts_at')::timestamptz or clock_timestamp()>=(m->>'ends_at')::timestamptz then return jsonb_build_object('ok',false,'reason','closed'); end if;
  select data into g from public.enzo_documents_store where collection='bio_groups' and id=m->>'group_id';
  select data into p from public.enzo_documents_store where collection='bio_profiles' and data @> jsonb_build_object('telegram_id',p_telegram_id);
  if g is null or g->>'enabled'<>'true' or p is null or not coalesce(p->'group_ids' @> jsonb_build_array(m->>'group_id'),false) then return jsonb_build_object('ok',false,'reason','membership'); end if;
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_attempts',0));
  select data into a from public.enzo_documents_store where collection='bio_attempts' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  if a is null or p_nonce is null or a->>'nonce'<>p_nonce then return jsonb_build_object('ok',false,'reason','stale'); end if;
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_submissions',0));
  select data into old from public.enzo_documents_store where collection='bio_submissions' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  if a->>'state'='submitted' then
    if old->>'attempt_nonce'=p_nonce and old->'answers'=p_answers then return jsonb_build_object('ok',true,'duplicate',true,'correct',old->'correct','total',old->'total','percent',old->'percent'); end if;
    return jsonb_build_object('ok',false,'reason','already');
  end if;
  n:=(m->>'count')::integer;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'Invalid answers'; end if;
  if jsonb_array_length(p_answers)<>n or exists(select 1 from jsonb_array_elements_text(p_answers) x where x not in ('A','B','C','D','-') or x is null) then raise exception 'Invalid answers'; end if;
  if jsonb_array_length(m->'answer_key')<>n then raise exception 'Invalid key'; end if;
  select count(*) filter(where x=m->'answer_key'->(i::integer-1)),count(*) filter(where x='"-"'::jsonb),
    coalesce(jsonb_agg(i order by i) filter(where x<>m->'answer_key'->(i::integer-1)),'[]') into correct,blanks,mistakes from jsonb_array_elements(p_answers) with ordinality q(x,i);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  r:=jsonb_build_object('_id',coalesce(old->>'_id',p_new_id),'mock_id',p_mock_id,'external_mock_id',coalesce(m->>'external_mock_id',m->>'code'),'version',coalesce((m->>'version')::integer,1),
    'group_id',m->>'group_id','telegram_id',p_telegram_id,'name',p->>'name','answers',p_answers,'question_ids',coalesce(m->'question_ids','[]'),
    'correct',correct,'total',n,'blank',blanks,'mistakes',mistakes,'percent',round(correct*100.0/n,1),'started_at',a->>'started_at','submitted_at',stamp,
    'finished_at',stamp,'attempt_nonce',p_nonce,'generation',a->'generation');
  -- Keep earlier permitted attempts for admin audit; the current result drives ranking.
  if old is not null then r:=r||jsonb_build_object('history',coalesce(old->'history','[]')||jsonb_build_array(old-'history')); end if;
  insert into public.enzo_documents_store values('bio_submissions',r->>'_id',r) on conflict(collection,id) do update set data=excluded.data;
  update public.enzo_documents_store set data=data||jsonb_build_object('state','submitted','retake_allowed',false) where collection='bio_attempts' and id=a->>'_id';
  if not coalesce(m->'roster' @> jsonb_build_array(p_telegram_id),false) then update public.enzo_documents_store set data=jsonb_set(data,'{roster}',coalesce(data->'roster','[]')||jsonb_build_array(p_telegram_id)) where collection='bio_mocks' and id=p_mock_id; end if;
  return jsonb_build_object('ok',true,'replaced',old is not null,'correct',correct,'total',n,'percent',round(correct*100.0/n,1));
end; $$;
revoke all on function public.bio_submit_v2(text,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.bio_submit_v2(text,bigint,jsonb,text,text) to service_role;
-- Disable the obsolete overwrite path; old runtimes get a retriable clear refusal.
create or replace function public.bio_submit(p_mock_id text,p_telegram_id bigint,p_answers jsonb,p_new_id text)
returns jsonb language sql security invoker set search_path='' as $$ select jsonb_build_object('ok',false,'reason','stale') $$;

create or replace function public.enzo_runtime_settings() returns jsonb
language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(substring(name from 6),decrypted_secret),'{}'::jsonb)
  from vault.decrypted_secrets where name in ('enzo_BOT_TOKEN','enzo_GEMINI_API_KEY','enzo_ADMIN_IDS','enzo_GEMINI_SCREENSHOT_MODEL','enzo_WEBHOOK_SECRET','enzo_CRON_SECRET','enzo_MINIAPP_URL');
$$;
