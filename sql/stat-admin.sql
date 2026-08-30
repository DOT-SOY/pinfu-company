-- Existing stat_definitions only. Install after character-admin.sql.
-- No trigger or character_stats changes are made by this installer/RPC.
begin;
do $$ begin
  if to_regprocedure('public.pinfu_require_character_admin()') is null then
    raise exception '먼저 sql/character-admin.sql을 설치해주세요.';
  end if;
end; $$;
create or replace function public.admin_list_stats(p_search text default '',p_enabled boolean default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total bigint;
begin
  perform public.pinfu_require_character_admin();
  if p_offset is null or p_offset<0 then raise exception 'INVALID_PAGE';end if;
  select count(*) into total from public.stat_definitions d
    where (p_enabled is null or d.enabled=p_enabled) and position(lower(coalesce(p_search,'')) in lower(d.display_name||' '||d.stat_key))>0;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.display_name,q.id::bigint),'[]'::jsonb) into items from (
    select d.id::text as id,d.stat_key,d.display_name,d.description,d.default_value,d.enabled
    from public.stat_definitions d where (p_enabled is null or d.enabled=p_enabled)
      and position(lower(coalesce(p_search,'')) in lower(d.display_name||' '||d.stat_key))>0
    order by d.display_name,d.id limit 25 offset p_offset) q;
  return jsonb_build_object('items',items,'total',total);
end; $$;
create or replace function public.admin_stat_editor(p_stat_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb;
begin
  perform public.pinfu_require_character_admin();
  if p_stat_id is null then
    d:=jsonb_build_object('id',null,'stat_key','','display_name','','description','','default_value',0,'enabled',true);
  else
    select jsonb_build_object('id',s.id::text,'stat_key',s.stat_key,'display_name',s.display_name,'description',s.description,
      'default_value',s.default_value,'enabled',s.enabled) into d from public.stat_definitions s where s.id=p_stat_id;
    if d is null then raise exception 'STAT_NOT_FOUND';end if;
  end if;
  return jsonb_build_object('stat',d,'revision',case when p_stat_id is null then null else md5(d::text) end);
end; $$;
create or replace function public.admin_save_stat(p_stat_id bigint,p_revision text,p_definition jsonb,p_bot_paused boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid bigint; old jsonb; k text;
begin
  perform public.pinfu_require_character_admin();
  if p_bot_paused is distinct from true then raise exception 'BOT_PAUSE_REQUIRED';end if;
  if p_definition is null or jsonb_typeof(p_definition)<>'object' then raise exception 'INVALID_STAT';end if;
  if not(p_definition ?& array['stat_key','display_name','description','default_value','enabled']) or exists(
    select 1 from jsonb_object_keys(p_definition) x where x not in ('stat_key','display_name','description','default_value','enabled')) then raise exception 'FIELD_NOT_ALLOWED';end if;
  if jsonb_typeof(p_definition->'stat_key')<>'string' or length(p_definition->>'stat_key') not between 1 and 200
    or jsonb_typeof(p_definition->'display_name')<>'string' or length(btrim(p_definition->>'display_name')) not between 1 and 200
    or jsonb_typeof(p_definition->'description') not in ('string','null') or length(p_definition->>'description')>10000
    or jsonb_typeof(p_definition->'enabled')<>'boolean' or jsonb_typeof(p_definition->'default_value')<>'number' then raise exception 'INVALID_STAT';end if;
  if (p_definition->>'default_value')::numeric<>trunc((p_definition->>'default_value')::numeric)
    or (p_definition->>'default_value')::numeric not between -2147483648 and 2147483647 then raise exception 'INVALID_INTEGER';end if;
  k:=p_definition->>'stat_key';
  if p_stat_id is null then
    if k !~ '^[a-z][a-z0-9_]{0,79}$' then raise exception 'INVALID_STAT_KEY';end if;
    perform pg_advisory_xact_lock(hashtextextended('pinfu-stat:'||k,0));
    if exists(select 1 from public.stat_definitions where stat_key=k) then raise exception 'STAT_KEY_EXISTS';end if;
    -- Existing trigger functions may use unqualified public table names.
    -- Catalog first, temp last; no caller-controlled schema in this path.
    perform set_config('search_path','pg_catalog, public, pg_temp',true);
    insert into public.stat_definitions(stat_key,display_name,description,default_value,enabled)
      values(k,btrim(p_definition->>'display_name'),p_definition->>'description',(p_definition->>'default_value')::integer,(p_definition->>'enabled')::boolean)
      returning id into sid;
    perform set_config('search_path','',true);
  else
    sid:=p_stat_id;perform 1 from public.stat_definitions where id=sid for update;
    if not found then raise exception 'STAT_NOT_FOUND';end if;
    old:=public.admin_stat_editor(sid);
    if p_revision is null or p_revision<>old->>'revision' then raise exception 'STAT_CONFLICT';end if;
    if k<>old->'stat'->>'stat_key' then raise exception 'STAT_KEY_READONLY';end if;
    update public.stat_definitions set display_name=btrim(p_definition->>'display_name'),description=p_definition->>'description',
      default_value=(p_definition->>'default_value')::integer,enabled=(p_definition->>'enabled')::boolean where id=sid;
  end if;
  return public.admin_stat_editor(sid);
end; $$;
revoke all on function public.admin_list_stats(text,boolean,integer) from public,anon,authenticated;
revoke all on function public.admin_stat_editor(bigint) from public,anon,authenticated;
revoke all on function public.admin_save_stat(bigint,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_list_stats(text,boolean,integer) to authenticated;
grant execute on function public.admin_stat_editor(bigint) to authenticated;
grant execute on function public.admin_save_stat(bigint,text,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
