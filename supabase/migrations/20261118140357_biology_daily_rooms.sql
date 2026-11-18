-- Additive Biology import and attempts. Existing mocks/results are preserved.
alter table public.enzo_documents_store drop constraint enzo_documents_store_collection_check;
alter table public.enzo_documents_store add constraint enzo_documents_store_collection_check check (collection in ('bot_students','bot_attendances','bot_tg_links','bot_tests','bot_attempts','bot_groups','bot_job_logs','bot_sessions','bot_link_codes','bot_screenshot_results','bot_attendance_reports','bio_profiles','bio_groups','bio_mocks','bio_submissions','bio_packages','bio_attempts','bio_rooms'));
create or replace function public.enzo_documents(
  p_collection text, p_operation text, p_filter jsonb default '{}', p_update jsonb default '{}',
  p_sort jsonb default '{}', p_limit integer default 0, p_options jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare old jsonb; doc jsonb; rows jsonb; r record; k text; v jsonb;
  ordering text := ''; n integer := 0; changed integer := 0; simple jsonb := '{}';
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  stmt text;
begin
  if p_collection not in ('bot_students','bot_attendances','bot_tg_links','bot_tests','bot_attempts','bot_groups','bot_job_logs','bot_sessions','bot_link_codes','bot_screenshot_results','bot_attendance_reports','bio_profiles','bio_groups','bio_mocks','bio_submissions','bio_packages','bio_attempts','bio_rooms') then raise exception 'Unknown collection'; end if;
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


-- The database clock is authoritative; the client cannot supply it.
create or replace function enzo_private.bio_now() returns timestamptz
language sql volatile security invoker set search_path='' as $$ select clock_timestamp() $$;
create or replace function enzo_private.bio_window(m jsonb, at_time timestamptz)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select case when m->>'status'='daily' then jsonb_build_object(
 'starts_at', ((at_time at time zone 'Asia/Tashkent')::date+time '07:00') at time zone 'Asia/Tashkent',
 'ends_at', ((at_time at time zone 'Asia/Tashkent')::date+time '22:00') at time zone 'Asia/Tashkent',
 'available_at', ((at_time at time zone 'Asia/Tashkent')::date+time '22:10') at time zone 'Asia/Tashkent')
 else jsonb_build_object('starts_at',m->'starts_at','ends_at',m->'ends_at',
 'available_at',coalesce(m->'available_at',m->'ends_at')) end
$$;
create unique index bio_room_code on public.enzo_documents_store ((data->>'code')) where collection='bio_rooms';
create index bio_submission_package_user on public.enzo_documents_store ((data->>'package_id'),(data->>'telegram_id')) where collection='bio_submissions';
create or replace function public.bio_begin(p_mock_id text,p_telegram_id bigint,p_new_id text,p_nonce text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb; p jsonb; g jsonb; a jsonb; s jsonb; stamp text; w jsonb; r jsonb; at_time timestamptz := enzo_private.bio_now(); allowed_retake boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_mocks',0));
  select data into m from public.enzo_documents_store where collection='bio_mocks' and id=p_mock_id;
  w:=enzo_private.bio_window(m,at_time);
  if m is null or m->>'status' not in ('open','daily') or at_time<(w->>'starts_at')::timestamptz or at_time>=(w->>'ends_at')::timestamptz then return jsonb_build_object('ok',false,'reason','closed'); end if;
  if m ? 'room_id' then
    select data into r from public.enzo_documents_store where collection='bio_rooms' and id=m->>'room_id';
    if r is null or r->>'state'<>'active' or not (r->'members' @> jsonb_build_array(p_telegram_id)) then return jsonb_build_object('ok',false,'reason','room'); end if;
  end if;
  select data into g from public.enzo_documents_store where collection='bio_groups' and id=m->>'group_id';
  select data into p from public.enzo_documents_store where collection='bio_profiles' and data @> jsonb_build_object('telegram_id',p_telegram_id);
  if g is null or g->>'enabled'<>'true' or p is null or not coalesce(p->'group_ids' @> jsonb_build_array(m->>'group_id'),false) then return jsonb_build_object('ok',false,'reason','membership'); end if;
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_attempts',0));
  select data into a from public.enzo_documents_store where collection='bio_attempts' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  select data into s from public.enzo_documents_store where collection='bio_submissions' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  if s is not null and not coalesce((a->>'retake_allowed')::boolean,false) and (a is null or a->>'state'<>'active') then return jsonb_build_object('ok',false,'reason','already'); end if;
  allowed_retake:=coalesce((a->>'retake_allowed')::boolean,false);
  if not(m ? 'room_id') and exists(select 1 from public.enzo_documents_store other where other.collection='bio_mocks'
    and other.data ? 'room_id' and other.data->>'status'='open' and (other.data->>'ends_at')::timestamptz>at_time
    and other.data->'roster' @> jsonb_build_array(p_telegram_id) and m ? 'package_id' and other.data->>'package_id'=m->>'package_id'
    and exists(select 1 from public.enzo_documents_store rr where rr.collection='bio_rooms' and rr.id=other.data->>'room_id' and rr.data->>'state'='active')) then
    return jsonb_build_object('ok',false,'reason','busy'); end if;

  if m->>'status'='daily' or m ? 'room_id' then
    if not allowed_retake and exists(select 1 from public.enzo_documents_store s join public.enzo_documents_store other on other.collection='bio_mocks' and other.id=s.data->>'mock_id'
      where s.collection='bio_submissions' and s.data->>'telegram_id'=p_telegram_id::text and other.id<>p_mock_id and m ? 'package_id' and other.data->>'package_id'=m->>'package_id') then
      return jsonb_build_object('ok',false,'reason','already'); end if;
    if exists(select 1 from public.enzo_documents_store a2 join public.enzo_documents_store other on other.collection='bio_mocks' and other.id=a2.data->>'mock_id'
      where a2.collection='bio_attempts' and a2.data->>'telegram_id'=p_telegram_id::text and a2.data->>'state'='active' and other.id<>p_mock_id
      and m ? 'package_id' and other.data->>'package_id'=m->>'package_id' and coalesce((a2.data->>'ends_at')::timestamptz,(other.data->>'ends_at')::timestamptz)>at_time) then
      return jsonb_build_object('ok',false,'reason','busy'); end if;
  end if;
  if a is null or a->>'state'<>'active' or (a->>'ends_at')::timestamptz<=at_time then
    stamp:=to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    a:=jsonb_build_object('_id',coalesce(a->>'_id',p_new_id),'mock_id',p_mock_id,'telegram_id',p_telegram_id,'nonce',p_nonce,
      'generation',coalesce((a->>'generation')::integer,0)+1,'started_at',stamp,'ends_at',w->'ends_at','available_at',w->'available_at','state','active','retake_allowed',false,'draft','{}'::jsonb);
    insert into public.enzo_documents_store values('bio_attempts',a->>'_id',a) on conflict(collection,id) do update set data=excluded.data;
  end if;
  return jsonb_build_object('ok',true,'nonce',a->>'nonce','started_at',a->>'started_at','ends_at',w->'ends_at','available_at',w->'available_at');
end; $$;
revoke all on function public.bio_begin(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.bio_begin(text,bigint,text,text) to service_role;

create or replace function public.bio_submit_v2(p_mock_id text,p_telegram_id bigint,p_answers jsonb,p_new_id text,p_nonce text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb; p jsonb; g jsonb; a jsonb; old jsonb; r jsonb; n integer; correct integer; blanks integer; mistakes jsonb; stamp text; w jsonb; room jsonb; at_time timestamptz := enzo_private.bio_now();
begin
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_mocks',0));
  select data into m from public.enzo_documents_store where collection='bio_mocks' and id=p_mock_id;
  w:=enzo_private.bio_window(m,at_time);
  if m is null or m->>'status' not in ('open','daily') or at_time<(w->>'starts_at')::timestamptz or at_time>=(w->>'ends_at')::timestamptz then return jsonb_build_object('ok',false,'reason','closed'); end if;
  if m ? 'room_id' then
    select data into room from public.enzo_documents_store where collection='bio_rooms' and id=m->>'room_id';
    if room is null or room->>'state' not in ('active','finished') or not (room->'members' @> jsonb_build_array(p_telegram_id)) then return jsonb_build_object('ok',false,'reason','room'); end if;
  end if;
  select data into g from public.enzo_documents_store where collection='bio_groups' and id=m->>'group_id';
  select data into p from public.enzo_documents_store where collection='bio_profiles' and data @> jsonb_build_object('telegram_id',p_telegram_id);
  if g is null or g->>'enabled'<>'true' or p is null or not coalesce(p->'group_ids' @> jsonb_build_array(m->>'group_id'),false) then return jsonb_build_object('ok',false,'reason','membership'); end if;
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_attempts',0));
  select data into a from public.enzo_documents_store where collection='bio_attempts' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  if a is null or p_nonce is null or a->>'nonce'<>p_nonce then return jsonb_build_object('ok',false,'reason','stale'); end if;
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_submissions',0));
  select data into old from public.enzo_documents_store where collection='bio_submissions' and data @> jsonb_build_object('mock_id',p_mock_id,'telegram_id',p_telegram_id);
  if a->>'state'='submitted' then
    if old->>'attempt_nonce'=p_nonce and old->'answers'=p_answers then return jsonb_build_object('ok',true,'duplicate',true,'available_at',coalesce(old->'available_at',m->'ends_at'),'correct',old->'correct','total',old->'total','percent',old->'percent'); end if;
    return jsonb_build_object('ok',false,'reason','already');
  end if;
  if (a->>'ends_at')::timestamptz<=at_time then return jsonb_build_object('ok',false,'reason','stale'); end if;
  n:=(m->>'count')::integer;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'Invalid answers'; end if;
  if jsonb_array_length(p_answers)<>n or exists(select 1 from jsonb_array_elements_text(p_answers) x where x not in ('A','B','C','D','-') or x is null) then raise exception 'Invalid answers'; end if;
  if jsonb_array_length(m->'answer_key')<>n then raise exception 'Invalid key'; end if;
  select count(*) filter(where x=m->'answer_key'->(i::integer-1)),count(*) filter(where x='"-"'::jsonb),
    coalesce(jsonb_agg(i order by i) filter(where x<>m->'answer_key'->(i::integer-1)),'[]') into correct,blanks,mistakes from jsonb_array_elements(p_answers) with ordinality q(x,i);
  stamp:=to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  r:=jsonb_build_object('_id',coalesce(old->>'_id',p_new_id),'mock_id',p_mock_id,'external_mock_id',coalesce(m->>'external_mock_id',m->>'code'),'version',coalesce((m->>'version')::integer,1),
    'package_id',m->>'package_id','room_id',m->>'room_id','available_at',coalesce(a->'available_at',w->'available_at'),'group_id',m->>'group_id','telegram_id',p_telegram_id,'name',p->>'name','answers',p_answers,'question_ids',coalesce(m->'question_ids','[]'),
    'correct',correct,'total',n,'blank',blanks,'mistakes',mistakes,'percent',round(correct*100.0/n,1),'started_at',a->>'started_at','submitted_at',stamp,
    'finished_at',stamp,'attempt_nonce',p_nonce,'generation',a->'generation');
  -- Keep earlier permitted attempts for admin audit; the current result drives ranking.
  if old is not null then r:=r||jsonb_build_object('history',coalesce(old->'history','[]')||jsonb_build_array(old-'history')); end if;
  insert into public.enzo_documents_store values('bio_submissions',r->>'_id',r) on conflict(collection,id) do update set data=excluded.data;
  update public.enzo_documents_store set data=data||jsonb_build_object('state','submitted','retake_allowed',false) where collection='bio_attempts' and id=a->>'_id';
  if not coalesce(m->'roster' @> jsonb_build_array(p_telegram_id),false) then update public.enzo_documents_store set data=jsonb_set(data,'{roster}',coalesce(data->'roster','[]')||jsonb_build_array(p_telegram_id)) where collection='bio_mocks' and id=p_mock_id; end if;
  if m ? 'room_id' and (select count(*) from public.enzo_documents_store where collection='bio_submissions' and data->>'mock_id'=p_mock_id)>=jsonb_array_length(room->'members') then
    update public.enzo_documents_store set data=data||jsonb_build_object('state','finished','finished_at',stamp) where collection='bio_rooms' and id=m->>'room_id';
  end if;
  return jsonb_build_object('ok',true,'available_at',coalesce(a->'available_at',w->'available_at'),'replaced',old is not null,'correct',correct,'total',n,'percent',round(correct*100.0/n,1));
end; $$;
revoke all on function public.bio_submit_v2(text,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.bio_submit_v2(text,bigint,jsonb,text,text) to service_role;

-- Room mutations use the same leading lock as begin/submit/delete. Capacity,
-- membership, eligibility and the chosen paper are checked in one transaction.
create or replace function public.bio_room_action(p_user bigint,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; p jsonb; g jsonb; m jsonb; n integer; uid bigint; at_time timestamptz:=enzo_private.bio_now(); stamp text; deadline timestamptz; run_id text; budget integer; budget_slot text;
begin
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_mocks',0));
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_rooms',0));
  stamp:=to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  select data into p from public.enzo_documents_store where collection='bio_profiles' and data->>'telegram_id'=p_user::text;
  if p is null then return jsonb_build_object('ok',false,'reason','membership'); end if;
  if p_action in ('create','join') then
    budget_slot:=to_char(at_time at time zone 'UTC','YYYY-MM-DD HH24');
    budget:=case when p->>'room_budget_slot'=budget_slot then coalesce((p->>'room_budget')::integer,0) else 0 end;
    if budget>=40 then return jsonb_build_object('ok',false,'reason','rate'); end if;
    update public.enzo_documents_store set data=data||jsonb_build_object('room_budget_slot',budget_slot,'room_budget',budget+1) where collection='bio_profiles' and data->>'telegram_id'=p_user::text;
  end if;
  if p_action='create' then
    select data into g from public.enzo_documents_store where collection='bio_groups' and id=p_payload->>'group_id';
    n:=(p_payload->>'capacity')::integer;
    if g is null or g->>'enabled'<>'true' or not(p->'group_ids' @> jsonb_build_array(g->>'_id')) then return jsonb_build_object('ok',false,'reason','membership'); end if;
    if n not in (2,3) then return jsonb_build_object('ok',false,'reason','capacity'); end if;
    if exists(select 1 from public.enzo_documents_store where collection='bio_rooms' and data->'members' @> jsonb_build_array(p_user)
      and (data->>'state'='waiting' and (data->>'expires_at')::timestamptz>at_time or data->>'state'='active' and (data->>'ends_at')::timestamptz>at_time)) then
      return jsonb_build_object('ok',false,'reason','busy'); end if;
    r:=jsonb_build_object('_id',p_payload->>'new_id','code',p_payload->>'code','host_id',p_user,'group_id',g->>'_id',
      'capacity',n,'members',jsonb_build_array(p_user),'state','waiting','created_at',stamp,'expires_at',at_time+interval '30 minutes');
    insert into public.enzo_documents_store values('bio_rooms',r->>'_id',r);
  else
    select data into r from public.enzo_documents_store where collection='bio_rooms' and
      (p_action='join' and data->>'code'=upper(p_payload->>'code') or p_action<>'join' and id=p_payload->>'room_id');
    if r is null then return jsonb_build_object('ok',false,'reason','missing'); end if;
    select data into g from public.enzo_documents_store where collection='bio_groups' and id=r->>'group_id';
    if g is null or g->>'enabled'<>'true' or not(p->'group_ids' @> jsonb_build_array(r->>'group_id')) then return jsonb_build_object('ok',false,'reason','membership'); end if;
    if p_action='join' then
      if r->>'state'<>'waiting' or (r->>'expires_at')::timestamptz<=at_time then return jsonb_build_object('ok',false,'reason','closed'); end if;
      if r->'members' @> jsonb_build_array(p_user) then return jsonb_build_object('ok',true,'room',r); end if;
      if jsonb_array_length(r->'members')>=(r->>'capacity')::integer then return jsonb_build_object('ok',false,'reason','full'); end if;
      if exists(select 1 from public.enzo_documents_store where collection='bio_rooms' and id<>r->>'_id' and data->'members' @> jsonb_build_array(p_user)
        and (data->>'state'='waiting' and (data->>'expires_at')::timestamptz>at_time or data->>'state'='active' and (data->>'ends_at')::timestamptz>at_time)) then return jsonb_build_object('ok',false,'reason','busy'); end if;
      r:=jsonb_set(r,'{members}',r->'members'||jsonb_build_array(p_user));
    elsif p_action='leave' then
      if r->>'state'<>'waiting' or not(r->'members' @> jsonb_build_array(p_user)) then return jsonb_build_object('ok',false,'reason','closed'); end if;
      if (r->>'host_id')::bigint=p_user then r:=r||jsonb_build_object('state','cancelled');
      else r:=jsonb_set(r,'{members}',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(r->'members') where value<>to_jsonb(p_user))); end if;
    elsif p_action='start' then
      if (r->>'host_id')::bigint<>p_user then return jsonb_build_object('ok',false,'reason','owner'); end if;
      if r->>'state'='active' then return jsonb_build_object('ok',true,'room',r); end if;
      if r->>'state'<>'waiting' or (r->>'expires_at')::timestamptz<=at_time then return jsonb_build_object('ok',false,'reason','closed'); end if;
      if jsonb_array_length(r->'members')<>(r->>'capacity')::integer then return jsonb_build_object('ok',false,'reason','waiting'); end if;
      if (at_time at time zone 'Asia/Tashkent')::time<time '07:00' or (at_time at time zone 'Asia/Tashkent')::time>=time '22:00' then return jsonb_build_object('ok',false,'reason','hours'); end if;
      select data into m from public.enzo_documents_store where collection='bio_mocks' and id=p_payload->>'run_id';
      if m is null or m->>'status'<>'daily' or not(m ? 'questions') or m->>'group_id'<>r->>'group_id' then return jsonb_build_object('ok',false,'reason','paper'); end if;
      perform pg_advisory_xact_lock(hashtextextended('enzo:bio_attempts',0));
      perform pg_advisory_xact_lock(hashtextextended('enzo:bio_submissions',0));
      for uid in select value::bigint from jsonb_array_elements_text(r->'members') loop
        if not exists(select 1 from public.enzo_documents_store where collection='bio_profiles' and data->>'telegram_id'=uid::text and data->'group_ids' @> jsonb_build_array(r->>'group_id')) then return jsonb_build_object('ok',false,'reason','membership'); end if;
        if exists(select 1 from public.enzo_documents_store s join public.enzo_documents_store other on other.collection='bio_mocks' and other.id=s.data->>'mock_id'
          where s.collection in ('bio_submissions','bio_attempts') and s.data->>'telegram_id'=uid::text
          and (other.id=m->>'_id' or m ? 'package_id' and other.data->>'package_id'=m->>'package_id')
          and (s.collection='bio_submissions' or s.data->>'state'='active' and coalesce((s.data->>'ends_at')::timestamptz,(other.data->>'ends_at')::timestamptz)>at_time)) then return jsonb_build_object('ok',false,'reason','used'); end if;
      end loop;
      run_id:=p_payload->>'new_id';
      deadline:=least(at_time+interval '60 minutes',((at_time at time zone 'Asia/Tashkent')::date+time '22:00') at time zone 'Asia/Tashkent');
      m:=(m-'announcement_id'-'reported'-'report_text'-'daily_text'-'weekly_text')||jsonb_build_object('_id',run_id,'code',p_payload->>'run_code','status','open','kind','room','room_id',r->>'_id','roster',r->'members',
        'starts_at',stamp,'ends_at',deadline,'available_at',((at_time at time zone 'Asia/Tashkent')::date+time '22:10') at time zone 'Asia/Tashkent','createdAt',stamp);
      insert into public.enzo_documents_store values('bio_mocks',run_id,m);
      r:=r||jsonb_build_object('state','active','run_id',run_id,'package_id',m->>'package_id','title',m->>'title','starts_at',stamp,'ends_at',deadline);
    else return jsonb_build_object('ok',false,'reason','action'); end if;
    update public.enzo_documents_store set data=r where collection='bio_rooms' and id=r->>'_id';
  end if;
  return jsonb_build_object('ok',true,'room',r);
end $$;
revoke all on function public.bio_room_action(bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.bio_room_action(bigint,text,jsonb) to service_role;
revoke all on function enzo_private.bio_now(),enzo_private.bio_window(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function enzo_private.bio_now(),enzo_private.bio_window(jsonb,timestamptz) to service_role;

-- Preserve historic scores and their original release times. Existing published
-- interactive papers become available daily; deleted/cancelled papers stay hidden.
update public.enzo_documents_store s set data=s.data||jsonb_build_object('available_at',coalesce(s.data->'available_at',m.data->'ends_at'),'package_id',m.data->'package_id')
from public.enzo_documents_store m where s.collection='bio_submissions' and m.collection='bio_mocks' and m.id=s.data->>'mock_id';
update public.enzo_documents_store set data=data||jsonb_build_object('daily_mode',true,'weekly_enabled',false) where collection='bio_groups';
update public.enzo_documents_store set data=data||jsonb_build_object('status','daily','kind','daily','legacy_status',data->>'status')
where collection='bio_mocks' and data ? 'questions' and data->>'status' in ('queued','scheduled','opening','open','closed','missed');

-- Deleting a catalogue MOCK also removes all saved student answers/results.
-- Keep only tombstones so old links, scheduled jobs and retries stay disabled.
create or replace function public.bio_delete_package(p_package_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; mock_ids text[]; group_ids text[]; submissions integer; attempts integer; stamp text;
begin
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_packages',0));
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_mocks',0));
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_attempts',0));
  perform pg_advisory_xact_lock(hashtextextended('enzo:bio_submissions',0));
  select data into p from public.enzo_documents_store where collection='bio_packages' and id=p_package_id;
  if p is null then return jsonb_build_object('ok',false,'reason','missing'); end if;
  select coalesce(array_agg(id),'{}'),coalesce(array_agg(distinct data->>'group_id'),'{}') into mock_ids,group_ids
    from public.enzo_documents_store where collection='bio_mocks' and data->>'package_id'=p_package_id;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  update public.enzo_documents_store set data=(data-'questions'-'answer_key')||jsonb_build_object('status','deleted','deleted_at',stamp)
    where collection='bio_packages' and id=p_package_id;
  update public.enzo_documents_store set data=(data-'questions'-'answer_key'-'materials'-'roster'-'report_text'-'weekly_text'-'daily_text')||jsonb_build_object('status','deleted','reported',true,'deleted_at',stamp)
    where collection='bio_mocks' and id=any(mock_ids);
  delete from public.enzo_documents_store where collection='bio_submissions' and data->>'mock_id'=any(mock_ids);
  get diagnostics submissions=row_count;
  delete from public.enzo_documents_store where collection='bio_attempts' and data->>'mock_id'=any(mock_ids);
  get diagnostics attempts=row_count;
  update public.enzo_documents_store set data=data-'pending' where collection='bio_profiles' and data#>>'{pending,mock_id}'=any(mock_ids);
  delete from public.enzo_documents_store where collection='bot_sessions' and
    (data#>>'{data,data,mock_id}'=any(mock_ids) or data#>>'{data,data,package_id}'=p_package_id or data#>>'{data,data,edit_id}'=p_package_id);
  -- Cached totals must not carry a deleted result into a future retry.
  update public.enzo_documents_store set data=data-'weekly_text'-'daily_text'
    where collection='bio_mocks' and data->>'group_id'=any(group_ids);
  delete from public.enzo_documents_store where collection='bio_rooms' and (data->>'run_id'=any(mock_ids) or data->>'package_id'=p_package_id);
  return jsonb_build_object('ok',true,'mocks',cardinality(mock_ids),'submissions',submissions,'attempts',attempts);
end; $$;
revoke all on function public.bio_delete_package(text) from public,anon,authenticated;
grant execute on function public.bio_delete_package(text) to service_role;

