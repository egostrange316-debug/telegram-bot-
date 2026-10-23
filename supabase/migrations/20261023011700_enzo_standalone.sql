-- ENZO standalone storage. No student records or secrets are exposed to clients.
create schema if not exists enzo_private;
revoke all on schema enzo_private from public, anon, authenticated;
grant usage on schema enzo_private to service_role;

create table if not exists public.enzo_documents_store (
  collection text not null check (collection in ('bot_students','bot_attendances','bot_tg_links','bot_tests','bot_attempts','bot_groups','bot_job_logs','bot_sessions','bot_link_codes','bot_screenshot_results','bot_attendance_reports')),
  id text not null check (id ~ '^[0-9a-f]{24}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'_id' = id),
  primary key(collection, id)
);
alter table public.enzo_documents_store enable row level security;
revoke all on public.enzo_documents_store from public, anon, authenticated;
grant all on public.enzo_documents_store to service_role;
create policy enzo_server_only on public.enzo_documents_store to service_role using (true) with check (true);
create index enzo_docs_data on public.enzo_documents_store using gin(data jsonb_path_ops);
create index enzo_docs_expiry on public.enzo_documents_store ((data->>'expires_at')) where data ? 'expires_at';
create unique index enzo_student_telegram on public.enzo_documents_store ((data->>'telegram_id')) where collection = 'bot_students';
create unique index enzo_link_telegram on public.enzo_documents_store ((data->>'telegram_id')) where collection = 'bot_tg_links';
create unique index enzo_link_user on public.enzo_documents_store ((data->>'user')) where collection = 'bot_tg_links';
create unique index enzo_attendance_day on public.enzo_documents_store ((data->>'user'), (data->>'date')) where collection = 'bot_attendances';
create unique index enzo_group_chat on public.enzo_documents_store ((data->>'chat_id')) where collection = 'bot_groups';
create unique index enzo_job_key on public.enzo_documents_store ((data->>'key')) where collection = 'bot_job_logs';
create unique index enzo_report_key on public.enzo_documents_store ((data->>'key')) where collection = 'bot_attendance_reports';
create unique index enzo_session_telegram on public.enzo_documents_store ((data->>'telegram_id')) where collection = 'bot_sessions';
create unique index enzo_link_code_hash on public.enzo_documents_store ((data->>'hash')) where collection = 'bot_link_codes';
create unique index enzo_link_code_user on public.enzo_documents_store ((data->>'user')) where collection = 'bot_link_codes';
create unique index enzo_submission on public.enzo_documents_store ((data->>'submission_id')) where collection = 'bot_attempts';
create unique index enzo_pending_attempt on public.enzo_documents_store ((data->>'user')) where collection = 'bot_attempts' and data->>'pending' = 'true';
create unique index enzo_screenshot_file on public.enzo_documents_store ((data->>'file_unique_id')) where collection = 'bot_screenshot_results';
create unique index enzo_screenshot_hash on public.enzo_documents_store ((data->>'image_hash')) where collection = 'bot_screenshot_results';
create unique index enzo_pending_analysis on public.enzo_documents_store ((data->>'user')) where collection = 'bot_screenshot_results' and data->>'needs_analysis' = 'true';

create or replace function enzo_private.equal_value(a jsonb, b jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(a, 'null'::jsonb) = b or
    (jsonb_typeof(a) = 'array' and exists(select 1 from jsonb_array_elements(a) x where x = b));
$$;

create or replace function enzo_private.matches(doc jsonb, query jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; actual jsonb; op text; expected jsonb; item jsonb; ok boolean;
begin
  for k, v in select * from jsonb_each(query) loop
    if k in ('$or', '$and') then
      ok := k = '$and';
      for item in select * from jsonb_array_elements(v) loop
        if k = '$or' then ok := ok or enzo_private.matches(doc, item);
        else ok := ok and enzo_private.matches(doc, item); end if;
      end loop;
      if not ok then return false; end if;
    else
      if left(k, 1) = '$' then raise exception 'Unsupported query operator'; end if;
      actual := doc #> string_to_array(k, '.');
      if jsonb_typeof(v) = 'object' and exists(select 1 from jsonb_object_keys(v) x where left(x, 1) = '$') then
        for op, expected in select * from jsonb_each(v) loop
          case op
            when '$eq' then ok := enzo_private.equal_value(actual, expected);
            when '$ne' then ok := not enzo_private.equal_value(actual, expected);
            when '$gt' then ok := actual is not null and actual <> 'null'::jsonb and actual > expected;
            when '$gte' then ok := actual is not null and actual <> 'null'::jsonb and actual >= expected;
            when '$lt' then ok := actual is not null and actual <> 'null'::jsonb and actual < expected;
            when '$lte' then ok := actual is not null and actual <> 'null'::jsonb and actual <= expected;
            when '$exists' then ok := (actual is not null) = (expected = 'true'::jsonb);
            when '$in' then select exists(select 1 from jsonb_array_elements(expected) x where enzo_private.equal_value(actual, x)) into ok;
            when '$nin' then select not exists(select 1 from jsonb_array_elements(expected) x where enzo_private.equal_value(actual, x)) into ok;
            else raise exception 'Unsupported comparison';
          end case;
          if not coalesce(ok, false) then return false; end if;
        end loop;
      elsif not coalesce(enzo_private.equal_value(actual, v), false) then return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function enzo_private.patch(doc jsonb, changes jsonb, inserting boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare op text; fields jsonb; k text; v jsonb; old jsonb; arr jsonb; path text[]; cut integer;
begin
  for op, fields in select * from jsonb_each(changes) loop
    if op = '$setOnInsert' and not inserting then continue; end if;
    if op not in ('$set', '$setOnInsert', '$unset', '$inc', '$max', '$addToSet', '$pull', '$push') then raise exception 'Unsupported update'; end if;
    for k, v in select * from jsonb_each(fields) loop
      if k = '_id' then raise exception 'Immutable id'; end if;
      path := string_to_array(k, '.'); old := doc #> path;
      case op
        when '$set', '$setOnInsert' then doc := jsonb_set(doc, path, v, true);
        when '$unset' then doc := doc #- path;
        when '$inc' then doc := jsonb_set(doc, path, to_jsonb(coalesce((old #>> '{}')::numeric, 0) + (v #>> '{}')::numeric), true);
        when '$max' then if old is null or old = 'null'::jsonb or old < v then doc := jsonb_set(doc, path, v, true); end if;
        when '$addToSet' then
          arr := coalesce(old, '[]'::jsonb);
          if not exists(select 1 from jsonb_array_elements(arr) x where x = v) then arr := arr || jsonb_build_array(v); end if;
          doc := jsonb_set(doc, path, arr, true);
        when '$pull' then
          select coalesce(jsonb_agg(x), '[]'::jsonb) into arr from jsonb_array_elements(coalesce(old, '[]'::jsonb)) x where x <> v;
          doc := jsonb_set(doc, path, arr, true);
        when '$push' then
          arr := coalesce(old, '[]'::jsonb) || case when v ? '$each' then v->'$each' else jsonb_build_array(v) end;
          if v ? '$slice' then
            cut := (v->>'$slice')::integer;
            select coalesce(jsonb_agg(x order by n), '[]'::jsonb) into arr
              from jsonb_array_elements(arr) with ordinality a(x,n)
              where (cut >= 0 and n <= cut) or (cut < 0 and n > jsonb_array_length(arr) + cut);
          end if;
          doc := jsonb_set(doc, path, arr, true);
      end case;
    end loop;
  end loop;
  return doc;
end;
$$;

create or replace function public.enzo_documents(
  p_collection text, p_operation text, p_filter jsonb default '{}', p_update jsonb default '{}',
  p_sort jsonb default '{}', p_limit integer default 0, p_options jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare old jsonb; doc jsonb; rows jsonb; r record; k text; v jsonb;
  ordering text := ''; n integer := 0; changed integer := 0; simple jsonb := '{}';
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  stmt text;
begin
  if p_collection not in ('bot_students','bot_attendances','bot_tg_links','bot_tests','bot_attempts','bot_groups','bot_job_logs','bot_sessions','bot_link_codes','bot_screenshot_results','bot_attendance_reports') then raise exception 'Unknown collection'; end if;
  if p_operation not in ('find','findOne','count','create','findOneAndUpdate','updateOne','updateMany','deleteOne','findOneAndDelete') then raise exception 'Unknown operation'; end if;
  if p_operation not in ('find','findOne','count') then perform pg_advisory_xact_lock(hashtextextended('enzo:' || p_collection, 0)); end if;
  for k, v in select * from jsonb_each(p_filter) loop
    if left(k,1) <> '$' and position('.' in k) = 0 and k not in ('group_ids','report_chats') and jsonb_typeof(v) in ('string','number','boolean') then simple := simple || jsonb_build_object(k,v); end if;
  end loop;
  for k, v in select * from jsonb_each(p_sort) loop
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

create table public.enzo_updates (
  update_id bigint primary key, payload jsonb not null, state text not null default 'pending' check(state in ('pending','processing','done','failed')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), created_at timestamptz not null default now(), last_error text
);
create index enzo_updates_pending on public.enzo_updates(available_at,update_id) where state <> 'done';
create table public.enzo_worker_leases (key text primary key, owner text not null, until_at timestamptz not null);
alter table public.enzo_updates enable row level security;
alter table public.enzo_worker_leases enable row level security;
revoke all on public.enzo_updates, public.enzo_worker_leases from public, anon, authenticated;
grant all on public.enzo_updates, public.enzo_worker_leases to service_role;
create policy enzo_server_only on public.enzo_updates to service_role using(true) with check(true);
create policy enzo_server_only on public.enzo_worker_leases to service_role using(true) with check(true);

create or replace function public.enzo_lease(p_key text, p_owner text, p_release boolean default false) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare acquired text;
begin
  if p_release then delete from public.enzo_worker_leases where key=p_key and owner=p_owner; return true; end if;
  insert into public.enzo_worker_leases values(p_key,p_owner,now()+interval '120 seconds')
    on conflict(key) do update set owner=excluded.owner,until_at=excluded.until_at
    where public.enzo_worker_leases.until_at < now() or public.enzo_worker_leases.owner=p_owner
    returning owner into acquired;
  return acquired is not null;
end;
$$;

create or replace function public.enzo_queue(p_action text, p_update jsonb default '{}', p_id bigint default null, p_error text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result public.enzo_updates;
begin
  if p_action = 'enqueue' then
    if jsonb_typeof(p_update->'update_id') <> 'number' or pg_column_size(p_update) > 1048576 then raise exception 'Invalid update'; end if;
    insert into public.enzo_updates(update_id,payload) values((p_update->>'update_id')::bigint,p_update) on conflict do nothing;
    return 'true'::jsonb;
  elsif p_action = 'claim' then
    update public.enzo_updates set state='failed',last_error='retry_limit' where state='processing' and attempts>=5 and updated_at<now()-interval '120 seconds';
    select * into result from public.enzo_updates
      where state in ('pending','processing') and attempts < 5
      order by update_id for update skip locked limit 1;
    if not found then return null; end if;
    if (result.state='pending' and result.available_at>now()) or (result.state='processing' and result.updated_at>=now()-interval '120 seconds') then return null; end if;
    update public.enzo_updates set state='processing',attempts=attempts+1,updated_at=now() where update_id=result.update_id;
    return result.payload;
  elsif p_action = 'done' then
    update public.enzo_updates set state='done',updated_at=now(),payload=jsonb_build_object('update_id',update_id),last_error=null where update_id=p_id;
    return 'true'::jsonb;
  elsif p_action = 'fail' then
    update public.enzo_updates set state=case when attempts>=5 then 'failed' else 'pending' end,updated_at=now(),available_at=now()+interval '60 seconds',last_error=left(p_error,120) where update_id=p_id;
    return 'true'::jsonb;
  end if;
  raise exception 'Invalid queue action';
end;
$$;

-- Vault encrypts tokens at rest. This invoker function is callable only by service_role.
grant usage on schema vault to service_role;
grant select on vault.decrypted_secrets to service_role;
create or replace function public.enzo_runtime_settings() returns jsonb
language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(substring(name from 6),decrypted_secret),'{}'::jsonb)
  from vault.decrypted_secrets where name in ('enzo_BOT_TOKEN','enzo_GEMINI_API_KEY','enzo_ADMIN_IDS','enzo_GEMINI_SCREENSHOT_MODEL','enzo_WEBHOOK_SECRET','enzo_CRON_SECRET');
$$;

revoke all on all functions in schema enzo_private from public, anon, authenticated;
grant execute on all functions in schema enzo_private to service_role;
revoke all on function public.enzo_documents(text,text,jsonb,jsonb,jsonb,integer,jsonb), public.enzo_lease(text,text,boolean), public.enzo_queue(text,jsonb,bigint,text), public.enzo_runtime_settings() from public, anon, authenticated;
grant execute on function public.enzo_documents(text,text,jsonb,jsonb,jsonb,integer,jsonb), public.enzo_lease(text,text,boolean), public.enzo_queue(text,jsonb,bigint,text), public.enzo_runtime_settings() to service_role;
