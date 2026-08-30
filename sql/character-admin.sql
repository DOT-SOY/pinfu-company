-- Install once in the SAME Supabase project used by this website and bot.
-- Adds RPC functions only: no new character tables, no role/RLS changes,
-- no data backfill, no action/skill usage writes, no money access.
-- Administrative writes require the bot to be stopped by the operator.
begin;

create or replace function public.pinfu_require_character_admin()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.pinfu_character_snapshot(p_character_id bigint)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_character jsonb; v_stats jsonb; v_snapshot jsonb;
begin
  perform public.pinfu_require_character_admin();
  select jsonb_build_object(
    'id', c.id::text, 'name', c.name, 'commu_profile_id', c.commu_profile_id,
    'condition', c.condition, 'base_daily_actions', c.base_daily_actions,
    'active', c.active, 'updated_at', c.updated_at
  ) into v_character from public.characters c where c.id = p_character_id;
  if v_character is null then raise exception 'CHARACTER_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'stat_id', d.id::text, 'display_name', d.display_name, 'enabled', d.enabled,
    'value', cs.value, 'updated_at', cs.updated_at
  ) order by d.id), '[]'::jsonb)
  into v_stats
  from public.stat_definitions d
  left join public.character_stats cs on cs.stat_id = d.id and cs.character_id = p_character_id;
  v_snapshot := jsonb_build_object('character', v_character, 'stats', v_stats);
  return v_snapshot || jsonb_build_object('revision', md5(v_snapshot::text));
end;
$$;

create or replace function public.admin_list_characters(
  p_search text default '', p_active boolean default null,
  p_offset integer default 0, p_limit integer default 25
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_rows jsonb; v_count bigint;
begin
  perform public.pinfu_require_character_admin();
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_PAGE';
  end if;
  select count(*) into v_count from public.characters c
  where (p_active is null or c.active = p_active)
    and position(lower(coalesce(p_search, '')) in lower(c.name)) > 0;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name, q.id::bigint), '[]'::jsonb)
  into v_rows from (
    select c.id::text as id, c.name, c.active
    from public.characters c
    where (p_active is null or c.active = p_active)
      and position(lower(coalesce(p_search, '')) in lower(c.name)) > 0
    order by c.name, c.id limit p_limit offset p_offset
  ) q;
  return jsonb_build_object('items', v_rows, 'total', v_count);
end;
$$;

create or replace function public.admin_get_character(p_character_id bigint)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_snapshot jsonb; v_skills jsonb; v_now timestamptz := statement_timestamp();
  v_day_start timestamptz; v_day_end timestamptz;
  v_week_start timestamptz; v_week_end timestamptz;
  v_used bigint; v_bonus numeric; v_limit numeric; v_bad boolean;
begin
  perform public.pinfu_require_character_admin();
  v_snapshot := public.pinfu_character_snapshot(p_character_id);
  v_day_start := date_trunc('day', v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_day_end := (date_trunc('day', v_now at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul';
  v_week_start := date_trunc('week', v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_week_end := (date_trunc('week', v_now at time zone 'Asia/Seoul') + interval '7 days') at time zone 'Asia/Seoul';

  -- Same filters as load_skill_context(client, character_id, command_id=None).
  -- Uses are counted per modifier, not per skill. No usage row is created.
  with modifiers as (
    select m.*, s.enabled as skill_enabled,
      (select count(*) from public.skill_usages u
       where u.character_id = p_character_id and u.skill_modifier_id = m.id
         and (m.period not in ('day','week') or m.period is null or
              (m.period = 'day' and u.used_at >= v_day_start and u.used_at < v_day_end) or
              (m.period = 'week' and u.used_at >= v_week_start and u.used_at < v_week_end))
      ) as used
    from public.skill_modifiers m
    join public.skills s on s.id = m.skill_id
    where exists (select 1 from public.character_skills cs
      where cs.character_id = p_character_id and cs.skill_id = s.id and cs.active)
  )
  select
    coalesce(sum(coalesce(m.value, 0)) filter (
      where m.skill_enabled and m.enabled and m.modifier_type = 'daily_action_bonus'
        and m.target_command_id is null and (m.max_uses is null or m.used < m.max_uses)
    ), 0),
    coalesce(bool_or(m.skill_enabled and m.enabled and (
      m.modifier_type not in (
        'daily_action_bonus','condition_delta_bonus','condition_cost_multiplier',
        'condition_recovery_multiplier','money_delta_bonus','money_gain_multiplier',
        'money_cost_multiplier','stat_delta_bonus','stat_gain_multiplier','stat_loss_multiplier',
        'dice_threshold_delta','dice_result_bonus','dice_reroll','repeat_penalty_delay',
        'block_negative_stat','block_condition_loss','block_money_loss'
      )
      or (m.target_command_id is null and (
        (m.params is not null and jsonb_typeof(m.params) not in ('object','null'))
        or (m.max_uses is not null and m.period is not null and m.period not in ('always','day','week'))
        or (m.modifier_type = 'daily_action_bonus' and (m.max_uses is null or m.used < m.max_uses)
            and coalesce(m.value,0) <> trunc(coalesce(m.value,0)))
      ))
    )), false)
  into v_bonus, v_bad from modifiers m;

  select count(*) into v_used from public.action_logs a
    where a.character_id = p_character_id and a.action_consumed
      and a.used_at >= v_day_start and a.used_at < v_day_end;
  v_limit := greatest(0, (v_snapshot->'character'->>'base_daily_actions')::integer + v_bonus);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id::text, 'name', s.name, 'description', s.description, 'enabled', s.enabled,
    'modifiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id::text, 'modifier_type', m.modifier_type, 'value', m.value,
        'enabled', m.enabled, 'target_command_id', m.target_command_id::text,
        'target_command', cmd.command, 'target_stat_id', m.target_stat_id::text,
        'target_stat_name', sd.display_name, 'period', m.period, 'max_uses', m.max_uses,
        'used', uses.used,
        'available', s.enabled and m.enabled and (m.max_uses is null or uses.used < m.max_uses)
      ) order by m.priority, m.id::text)
      from public.skill_modifiers m
      left join public.commands cmd on cmd.id = m.target_command_id
      left join public.stat_definitions sd on sd.id = m.target_stat_id
      cross join lateral (
        select count(*) as used from public.skill_usages u
        where u.character_id = p_character_id and u.skill_modifier_id = m.id
          and (m.period not in ('day','week') or m.period is null or
            (m.period = 'day' and u.used_at >= v_day_start and u.used_at < v_day_end) or
            (m.period = 'week' and u.used_at >= v_week_start and u.used_at < v_week_end))
      ) uses
      where m.skill_id = s.id
    ), '[]'::jsonb)
  ) order by s.name, s.id), '[]'::jsonb)
  into v_skills from public.skills s
  where exists (select 1 from public.character_skills cs
    where cs.character_id = p_character_id and cs.skill_id = s.id and cs.active);

  return v_snapshot || jsonb_build_object('skills', v_skills, 'as_of', v_now,
    'daily', jsonb_build_object('used', v_used,
      'maximum', case when v_bad then null else v_limit end,
      'remaining', case when v_bad then null else greatest(0, v_limit - v_used) end,
      'error', case when v_bad then 'INVALID_SKILL_CONFIGURATION' else null end,
      'day_start', v_day_start, 'day_end', v_day_end));
end;
$$;

create or replace function public.admin_save_character(
  p_character_id bigint, p_revision text, p_changes jsonb, p_bot_paused boolean
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_snapshot jsonb; v_item jsonb; v_key text; v_stat_id bigint;
begin
  perform public.pinfu_require_character_admin();
  if p_bot_paused is distinct from true then raise exception 'BOT_PAUSE_REQUIRED'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'INVALID_CHANGES'; end if;
  if exists (select 1 from jsonb_object_keys(p_changes) k
             where k not in ('name','condition','base_daily_actions','active','stats')) then
    raise exception 'FIELD_NOT_ALLOWED';
  end if;
  perform 1 from public.characters where id = p_character_id for update;
  perform 1 from public.character_stats where character_id = p_character_id order by stat_id for update;
  v_snapshot := public.pinfu_character_snapshot(p_character_id);
  if p_revision is null or p_revision <> v_snapshot->>'revision' then
    raise exception 'CHARACTER_CONFLICT';
  end if;
  if p_changes ? 'name' and (jsonb_typeof(p_changes->'name') <> 'string'
      or length(btrim(p_changes->>'name')) not between 1 and 200) then raise exception 'INVALID_NAME'; end if;
  foreach v_key in array array['condition','base_daily_actions'] loop
    if p_changes ? v_key and (jsonb_typeof(p_changes->v_key) <> 'number'
        or (p_changes->>v_key)::numeric <> trunc((p_changes->>v_key)::numeric)
        or (p_changes->>v_key)::numeric not between 0 and 2147483647) then
      raise exception 'INVALID_INTEGER';
    end if;
  end loop;
  if p_changes ? 'active' and jsonb_typeof(p_changes->'active') <> 'boolean' then
    raise exception 'INVALID_ACTIVE';
  end if;
  if p_changes ? 'stats' then
    if jsonb_typeof(p_changes->'stats') <> 'array' then raise exception 'INVALID_STATS'; end if;
    if (select count(*) <> count(distinct x->>'stat_id') from jsonb_array_elements(p_changes->'stats') x) then
      raise exception 'DUPLICATE_STAT';
    end if;
    for v_item in select value from jsonb_array_elements(p_changes->'stats') loop
      if jsonb_typeof(v_item) <> 'object' then raise exception 'INVALID_STATS'; end if;
      if not (v_item ? 'stat_id' and v_item ? 'value')
          or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('stat_id','value'))
          or (v_item->>'stat_id') !~ '^[1-9][0-9]*$'
          or jsonb_typeof(v_item->'value') <> 'number'
          or (v_item->>'value')::numeric <> trunc((v_item->>'value')::numeric)
          or (v_item->>'value')::numeric not between -2147483648 and 2147483647 then
        raise exception 'INVALID_STATS';
      end if;
      v_stat_id := (v_item->>'stat_id')::bigint;
      if not exists (select 1 from public.stat_definitions where id = v_stat_id) then
        raise exception 'STAT_NOT_FOUND';
      end if;
      update public.character_stats set value = (v_item->>'value')::integer, updated_at = clock_timestamp()
        where character_id = p_character_id and stat_id = v_stat_id;
      if not found then
        insert into public.character_stats(character_id, stat_id, value)
          values (p_character_id, v_stat_id, (v_item->>'value')::integer);
      end if;
    end loop;
  end if;
  -- Explicit whitelist. Fields outside this form are never written.
  update public.characters c set
    name = case when p_changes ? 'name' then btrim(p_changes->>'name') else c.name end,
    condition = case when p_changes ? 'condition' then (p_changes->>'condition')::integer else c.condition end,
    base_daily_actions = case when p_changes ? 'base_daily_actions' then (p_changes->>'base_daily_actions')::integer else c.base_daily_actions end,
    active = case when p_changes ? 'active' then (p_changes->>'active')::boolean else c.active end,
    updated_at = clock_timestamp()
  where c.id = p_character_id;
  return public.admin_get_character(p_character_id);
end;
$$;

create or replace function public.admin_search_character_skills(
  p_character_id bigint, p_search text default '', p_offset integer default 0, p_limit integer default 20
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_rows jsonb; v_total bigint;
begin
  perform public.pinfu_require_character_admin();
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_PAGE';
  end if;
  select count(*) into v_total from public.skills s where s.enabled
    and position(lower(coalesce(p_search,'')) in lower(s.name)) > 0
    and not exists (select 1 from public.character_skills cs where cs.character_id = p_character_id and cs.skill_id = s.id and cs.active);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name, q.id::bigint), '[]'::jsonb)
  into v_rows from (
    select s.id::text as id, s.name, s.description from public.skills s where s.enabled
      and position(lower(coalesce(p_search,'')) in lower(s.name)) > 0
      and not exists (select 1 from public.character_skills cs where cs.character_id = p_character_id and cs.skill_id = s.id and cs.active)
    order by s.name, s.id limit p_limit offset p_offset
  ) q;
  return jsonb_build_object('items', v_rows, 'total', v_total);
end;
$$;

create or replace function public.admin_set_character_skill(
  p_character_id bigint, p_skill_id bigint, p_active boolean, p_bot_paused boolean
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform public.pinfu_require_character_admin();
  if p_bot_paused is distinct from true then raise exception 'BOT_PAUSE_REQUIRED'; end if;
  if p_active is null then raise exception 'INVALID_ACTIVE'; end if;
  -- All admin relation mutations serialize on the same character row.
  perform 1 from public.characters where id = p_character_id for update;
  if not found then raise exception 'CHARACTER_NOT_FOUND'; end if;
  if p_active and not exists (select 1 from public.skills where id = p_skill_id and enabled) then
    raise exception 'SKILL_NOT_AVAILABLE';
  end if;
  if p_active then
    if exists (select 1 from public.character_skills where character_id = p_character_id and skill_id = p_skill_id and active) then
      raise exception 'SKILL_ALREADY_OWNED';
    end if;
    update public.character_skills set active = true where character_id = p_character_id and skill_id = p_skill_id;
    if not found then
      insert into public.character_skills(character_id, skill_id) values (p_character_id, p_skill_id);
    end if;
  else
    update public.character_skills set active = false where character_id = p_character_id and skill_id = p_skill_id;
  end if;
  return public.admin_get_character(p_character_id);
end;
$$;

-- No implicit PUBLIC/anon execute. Helpers are callable only by the RPC owner.
revoke all on function public.pinfu_require_character_admin() from public, anon, authenticated;
revoke all on function public.pinfu_character_snapshot(bigint) from public, anon, authenticated;
revoke all on function public.admin_list_characters(text,boolean,integer,integer) from public, anon, authenticated;
revoke all on function public.admin_get_character(bigint) from public, anon, authenticated;
revoke all on function public.admin_save_character(bigint,text,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.admin_search_character_skills(bigint,text,integer,integer) from public, anon, authenticated;
revoke all on function public.admin_set_character_skill(bigint,bigint,boolean,boolean) from public, anon, authenticated;
grant execute on function public.admin_list_characters(text,boolean,integer,integer) to authenticated;
grant execute on function public.admin_get_character(bigint) to authenticated;
grant execute on function public.admin_save_character(bigint,text,jsonb,boolean) to authenticated;
grant execute on function public.admin_search_character_skills(bigint,text,integer,integer) to authenticated;
grant execute on function public.admin_set_character_skill(bigint,bigint,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
