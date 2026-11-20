-- Add 4- and 6-player rooms; preserve existing rooms, locks and service-only permissions.
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
    if n is null or n not in (2,3,4,6) then return jsonb_build_object('ok',false,'reason','capacity'); end if;
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
