-- Install after character-admin.sql and skill-admin.sql in the SAME project.
-- Adds one admin RPC only. Existing tables, commands and rules are not migrated.
begin;
do $$ begin
  if to_regprocedure('public.pinfu_require_character_admin()') is null then
    raise exception '먼저 sql/character-admin.sql을 설치해주세요.';
  end if;
end; $$;

create or replace function public.admin_create_skill_target_command(p_definition jsonb, p_bot_paused boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_command text; v_id bigint; v_key text; v_min integer; v_max integer; v_threshold integer;
begin
  perform public.pinfu_require_character_admin();
  if p_bot_paused is distinct from true then raise exception 'BOT_PAUSE_REQUIRED'; end if;
  if p_definition is null or jsonb_typeof(p_definition) <> 'object' then raise exception 'INVALID_COMMAND'; end if;
  if not (p_definition ?& array['command','display_name','description','enabled','consumes_action','dice_enabled','dice_min','dice_max','dice_threshold'])
    or exists(select 1 from jsonb_object_keys(p_definition) k where k not in
      ('command','display_name','description','enabled','consumes_action','dice_enabled','dice_min','dice_max','dice_threshold')) then
    raise exception 'FIELD_NOT_ALLOWED';
  end if;
  if jsonb_typeof(p_definition->'command') <> 'string'
    or jsonb_typeof(p_definition->'display_name') <> 'string'
    or length(btrim(p_definition->>'display_name')) not between 1 and 200
    or jsonb_typeof(p_definition->'description') <> 'string'
    or length(p_definition->>'description') > 10000 then raise exception 'INVALID_COMMAND'; end if;
  v_command := btrim(p_definition->>'command');
  if left(v_command,1) <> '/' then v_command := '/' || v_command; end if;
  if v_command !~ '^/[[:alnum:]_-]{1,80}$' then raise exception 'INVALID_COMMAND_TEXT'; end if;
  foreach v_key in array array['enabled','consumes_action','dice_enabled'] loop
    if jsonb_typeof(p_definition->v_key) <> 'boolean' then raise exception 'INVALID_COMMAND'; end if;
  end loop;
  foreach v_key in array array['dice_min','dice_max'] loop
    if jsonb_typeof(p_definition->v_key) <> 'number' then raise exception 'INVALID_COMMAND_DICE'; end if;
    if (p_definition->>v_key)::numeric <> trunc((p_definition->>v_key)::numeric)
      or (p_definition->>v_key)::numeric not between -2147483648 and 2147483647 then raise exception 'INVALID_COMMAND_DICE'; end if;
  end loop;
  if jsonb_typeof(p_definition->'dice_threshold') not in ('number','null') then raise exception 'INVALID_COMMAND_DICE'; end if;
  if p_definition->>'dice_threshold' is not null and (
      (p_definition->>'dice_threshold')::numeric <> trunc((p_definition->>'dice_threshold')::numeric)
      or (p_definition->>'dice_threshold')::numeric not between -2147483648 and 2147483647) then raise exception 'INVALID_COMMAND_DICE'; end if;
  v_min := ((p_definition->>'dice_min')::numeric)::integer;
  v_max := ((p_definition->>'dice_max')::numeric)::integer;
  v_threshold := ((p_definition->>'dice_threshold')::numeric)::integer;
  if v_min > v_max then raise exception 'INVALID_COMMAND_DICE'; end if;
  -- A null threshold means roll only (no success/failure), exactly as the bot.
  -- When dice is disabled, store harmless defaults instead of stale hidden inputs.
  if not (p_definition->>'dice_enabled')::boolean then v_min:=1; v_max:=100; v_threshold:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('pinfu-command:' || v_command,0));
  if exists(select 1 from public.commands where command=v_command) then raise exception 'COMMAND_ALREADY_EXISTS'; end if;
  insert into public.commands(command,display_name,description,enabled,hidden,consumes_action,
      dice_enabled,dice_min,dice_max,dice_threshold,command_type,status_fields,success_message,fail_message)
    values(v_command,btrim(p_definition->>'display_name'),p_definition->>'description',
      (p_definition->>'enabled')::boolean,false,(p_definition->>'consumes_action')::boolean,
      (p_definition->>'dice_enabled')::boolean,v_min,v_max,v_threshold,'action','[]'::jsonb,null,null)
    returning id into v_id;
  return jsonb_build_object('id',v_id::text,'name',v_command,'display_name',btrim(p_definition->>'display_name'),
    'enabled',(p_definition->>'enabled')::boolean,'command_type','action');
end; $$;
revoke all on function public.admin_create_skill_target_command(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_create_skill_target_command(jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
