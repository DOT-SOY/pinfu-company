-- Run AFTER character-admin.sql, in the same Supabase project as the bot.
-- RPCs only. No tables, columns, skill grants, usages or history are modified by installation.
begin;

do $$ begin
  if to_regprocedure('public.pinfu_require_character_admin()') is null then
    raise exception '먼저 sql/character-admin.sql을 설치해주세요.';
  end if;
end; $$;

create or replace function public.admin_list_skills(
  p_search text default '', p_enabled boolean default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb; v_total bigint;
begin
  perform public.pinfu_require_character_admin();
  if p_offset is null or p_offset < 0 then raise exception 'INVALID_PAGE'; end if;
  select count(*) into v_total from public.skills s
    where (p_enabled is null or s.enabled = p_enabled)
      and position(lower(coalesce(p_search,'')) in lower(s.name || ' ' || s.skill_key)) > 0;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name,q.id::bigint),'[]'::jsonb) into v_items
  from (select s.id::text as id,s.skill_key,s.name,s.enabled
    from public.skills s where (p_enabled is null or s.enabled = p_enabled)
      and position(lower(coalesce(p_search,'')) in lower(s.name || ' ' || s.skill_key)) > 0
    order by s.name,s.id limit 25 offset p_offset) q;
  return jsonb_build_object('items',v_items,'total',v_total);
end; $$;

create or replace function public.admin_skill_editor(p_skill_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_skill jsonb; v_modifiers jsonb := '[]'::jsonb; v_snapshot jsonb; v_commands jsonb; v_stats jsonb; v_holders bigint := 0;
begin
  perform public.pinfu_require_character_admin();
  if p_skill_id is null then
    v_skill := jsonb_build_object('id',null,'skill_key','','name','','description','','enabled',true);
  else
    select jsonb_build_object('id',s.id::text,'skill_key',s.skill_key,'name',s.name,
      'description',s.description,'enabled',s.enabled) into v_skill from public.skills s where s.id=p_skill_id;
    if v_skill is null then raise exception 'SKILL_NOT_FOUND'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'modifier_type',m.modifier_type,
      'value',m.value,'enabled',m.enabled,'priority',m.priority,'target_command_id',m.target_command_id::text,
      'target_stat_id',m.target_stat_id::text,'period',m.period,'max_uses',m.max_uses,'params',m.params)
      order by m.priority,m.id::text),'[]'::jsonb)
      into v_modifiers from public.skill_modifiers m where m.skill_id=p_skill_id;
    select count(distinct cs.character_id) into v_holders from public.character_skills cs where cs.skill_id=p_skill_id and cs.active;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'name',c.command) order by c.command,c.id),'[]'::jsonb)
    into v_commands from public.commands c;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id::text,'name',d.display_name) order by d.id),'[]'::jsonb)
    into v_stats from public.stat_definitions d;
  v_snapshot := jsonb_build_object('skill',v_skill,'modifiers',v_modifiers);
  return v_snapshot || jsonb_build_object('revision',case when p_skill_id is null then null else md5(v_snapshot::text) end,
    'holders',v_holders,'commands',v_commands,'stats',v_stats);
end; $$;

create or replace function public.admin_save_skill(
  p_skill_id bigint, p_revision text, p_definition jsonb, p_bot_paused boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_before jsonb; v_item jsonb; v_modifier_id bigint; v_type text; v_value numeric; v_key text;
begin
  perform public.pinfu_require_character_admin();
  if p_bot_paused is distinct from true then raise exception 'BOT_PAUSE_REQUIRED'; end if;
  if p_definition is null or jsonb_typeof(p_definition) <> 'object' then raise exception 'INVALID_SKILL'; end if;
  if not (p_definition ?& array['skill_key','name','description','enabled','modifiers'])
    or exists(select 1 from jsonb_object_keys(p_definition) k where k not in ('skill_key','name','description','enabled','modifiers')) then
    raise exception 'FIELD_NOT_ALLOWED';
  end if;
  if jsonb_typeof(p_definition->'name') <> 'string' or length(btrim(p_definition->>'name')) not between 1 and 200
    or jsonb_typeof(p_definition->'skill_key') <> 'string' or length(p_definition->>'skill_key') not between 1 and 200
    or jsonb_typeof(p_definition->'description') <> 'string' or length(p_definition->>'description') > 10000
    or jsonb_typeof(p_definition->'enabled') <> 'boolean' then raise exception 'INVALID_SKILL'; end if;
  if jsonb_typeof(p_definition->'modifiers') <> 'array' then raise exception 'INVALID_MODIFIERS'; end if;
  if jsonb_array_length(p_definition->'modifiers') > 100 then raise exception 'TOO_MANY_MODIFIERS'; end if;
  v_key := p_definition->>'skill_key';
  if p_skill_id is null then
    if v_key !~ '^[a-z][a-z0-9_]{0,79}$' then raise exception 'INVALID_SKILL_KEY'; end if;
    -- Serialize creation for the same key, including a retry after a lost response.
    perform pg_advisory_xact_lock(hashtextextended('pinfu-skill:' || v_key,0));
    if exists(select 1 from public.skills where skill_key=v_key) then raise exception 'SKILL_KEY_EXISTS'; end if;
    insert into public.skills(skill_key,name,description,enabled)
      values(v_key,btrim(p_definition->>'name'),p_definition->>'description',(p_definition->>'enabled')::boolean)
      returning id into v_id;
  else
    v_id := p_skill_id;
    perform 1 from public.skills where id=v_id for update;
    if not found then raise exception 'SKILL_NOT_FOUND'; end if;
    perform 1 from public.skill_modifiers where skill_id=v_id order by id for update;
    v_before := public.admin_skill_editor(v_id);
    if p_revision is null or p_revision <> v_before->>'revision' then raise exception 'SKILL_CONFLICT'; end if;
    if v_key <> v_before->'skill'->>'skill_key' then raise exception 'SKILL_KEY_READONLY'; end if;
    if exists(select 1 from public.skill_modifiers m where m.skill_id=v_id
      and m.modifier_type not in ('money_delta_bonus','money_gain_multiplier','money_cost_multiplier','block_money_loss') and not exists(
      select 1 from jsonb_array_elements(p_definition->'modifiers') x where x->>'id'=m.id::text)) then
      raise exception 'MODIFIER_REMOVAL_NOT_ALLOWED';
    end if;
  end if;
  if (select count(x->>'id') <> count(distinct x->>'id') from jsonb_array_elements(p_definition->'modifiers') x) then
    raise exception 'DUPLICATE_MODIFIER';
  end if;
  for v_item in select value from jsonb_array_elements(p_definition->'modifiers') loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'INVALID_MODIFIERS'; end if;
    if not(v_item ?& array['id','modifier_type','value','enabled','priority','target_command_id','target_stat_id','period','max_uses'])
      or exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','modifier_type','value','enabled','priority','target_command_id','target_stat_id','period','max_uses')) then
      raise exception 'INVALID_MODIFIERS';
    end if;
    v_type := v_item->>'modifier_type';
    if v_type is null or v_type not in ('daily_action_bonus','condition_delta_bonus','condition_cost_multiplier',
      'condition_recovery_multiplier',
      'stat_delta_bonus','stat_gain_multiplier','stat_loss_multiplier','dice_threshold_delta','dice_result_bonus',
      'dice_reroll','repeat_penalty_delay','block_negative_stat','block_condition_loss') then
      raise exception 'INVALID_MODIFIER_TYPE';
    end if;
    if jsonb_typeof(v_item->'value') not in ('number','null') or jsonb_typeof(v_item->'enabled') <> 'boolean'
      or jsonb_typeof(v_item->'priority') <> 'number' then raise exception 'INVALID_MODIFIER_VALUE'; end if;
    v_value := (v_item->>'value')::numeric;
    if abs(coalesce(v_value,0)) > 2147483647 or
      (v_type in ('daily_action_bonus','dice_threshold_delta','dice_result_bonus','dice_reroll','repeat_penalty_delay')
        and coalesce(v_value,0) <> trunc(coalesce(v_value,0))) or
      ((v_type like '%multiplier' or v_type in ('dice_reroll','repeat_penalty_delay')) and v_value < 0) or
      (v_type='dice_reroll' and (v_value is null or v_value > 100)) then raise exception 'INVALID_MODIFIER_VALUE'; end if;
    if (v_item->>'priority')::numeric <> trunc((v_item->>'priority')::numeric)
      or (v_item->>'priority')::numeric not between -2147483648 and 2147483647 then raise exception 'INVALID_INTEGER'; end if;
    if jsonb_typeof(v_item->'period') not in ('string','null')
      or (v_item->>'period') not in ('day','week','always') then raise exception 'INVALID_PERIOD'; end if;
    if jsonb_typeof(v_item->'max_uses') not in ('number','null') then raise exception 'INVALID_MAX_USES'; end if;
    if (v_item->>'max_uses')::numeric <> trunc((v_item->>'max_uses')::numeric)
      or (v_item->>'max_uses')::numeric not between 0 and 2147483647 then raise exception 'INVALID_MAX_USES'; end if;
    foreach v_key in array array['id','target_command_id','target_stat_id'] loop
      if jsonb_typeof(v_item->v_key) not in ('string','null') or (v_item->>v_key) !~ '^[1-9][0-9]*$' then raise exception 'INVALID_ID'; end if;
    end loop;
    if v_item->>'target_command_id' is not null and not exists(select 1 from public.commands where id=(v_item->>'target_command_id')::bigint)
      then raise exception 'COMMAND_NOT_FOUND'; end if;
    if v_item->>'target_stat_id' is not null and not exists(select 1 from public.stat_definitions where id=(v_item->>'target_stat_id')::bigint)
      then raise exception 'STAT_NOT_FOUND'; end if;
    if v_item->>'target_stat_id' is not null and v_type not in ('stat_delta_bonus','stat_gain_multiplier','stat_loss_multiplier','block_negative_stat')
      then raise exception 'STAT_TARGET_NOT_APPLICABLE'; end if;
    v_modifier_id := (v_item->>'id')::bigint;
    if v_modifier_id is not null and exists(select 1 from public.skill_modifiers
      where id=v_modifier_id and skill_id=v_id and modifier_type in
        ('money_delta_bonus','money_gain_multiplier','money_cost_multiplier','block_money_loss')) then
      raise exception 'PROTECTED_MODIFIER';
    end if;
    if v_modifier_id is null then
      insert into public.skill_modifiers(skill_id,modifier_type,value,enabled,priority,target_command_id,target_stat_id,period,max_uses,params)
      values(v_id,v_type,v_value,(v_item->>'enabled')::boolean,(v_item->>'priority')::integer,
        (v_item->>'target_command_id')::bigint,(v_item->>'target_stat_id')::bigint,v_item->>'period',(v_item->>'max_uses')::integer,'{}'::jsonb);
    else
      if p_skill_id is null or not exists(select 1 from public.skill_modifiers where id=v_modifier_id and skill_id=v_id)
        then raise exception 'MODIFIER_NOT_OWNED'; end if;
      -- Keep modifier IDs and params. Never delete/recreate rows or reset usage.
      update public.skill_modifiers set modifier_type=v_type,value=v_value,enabled=(v_item->>'enabled')::boolean,
        priority=(v_item->>'priority')::integer,target_command_id=(v_item->>'target_command_id')::bigint,
        target_stat_id=(v_item->>'target_stat_id')::bigint,period=v_item->>'period',max_uses=(v_item->>'max_uses')::integer
        where id=v_modifier_id and skill_id=v_id;
    end if;
  end loop;
  update public.skills set name=btrim(p_definition->>'name'),description=p_definition->>'description',enabled=(p_definition->>'enabled')::boolean where id=v_id;
  return public.admin_skill_editor(v_id);
end; $$;

revoke all on function public.admin_list_skills(text,boolean,integer) from public,anon,authenticated;
revoke all on function public.admin_skill_editor(bigint) from public,anon,authenticated;
revoke all on function public.admin_save_skill(bigint,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_list_skills(text,boolean,integer) to authenticated;
grant execute on function public.admin_skill_editor(bigint) to authenticated;
grant execute on function public.admin_save_skill(bigint,text,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
