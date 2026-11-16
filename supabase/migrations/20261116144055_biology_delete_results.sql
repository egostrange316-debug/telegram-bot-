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
  return jsonb_build_object('ok',true,'mocks',cardinality(mock_ids),'submissions',submissions,'attempts',attempts);
end; $$;
revoke all on function public.bio_delete_package(text) from public,anon,authenticated;
grant execute on function public.bio_delete_package(text) to service_role;

-- Apply the requested cleanup to packages previously hidden by the old delete action.
do $$ declare p record; begin
  for p in select id from public.enzo_documents_store where collection='bio_packages' and data->>'status'='deleted' loop
    perform public.bio_delete_package(p.id);
  end loop;
end $$;

-- Prevent a stale publish/start worker from reviving a deleted package.
create or replace function enzo_private.bio_live_package_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.collection='bio_mocks' and new.data ? 'package_id' and new.data->>'status'<>'deleted' and
    not exists(select 1 from public.enzo_documents_store where collection='bio_packages' and id=new.data->>'package_id' and data->>'status'<>'deleted') then
    raise exception 'MOCK package deleted' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function enzo_private.bio_live_package_guard() from public,anon,authenticated;
grant execute on function enzo_private.bio_live_package_guard() to service_role;
create trigger bio_live_package_guard before insert or update on public.enzo_documents_store
for each row execute function enzo_private.bio_live_package_guard();

