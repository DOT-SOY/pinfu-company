-- Existing bot tables only. Install after character-admin.sql.
begin;
do $$ begin
  if to_regprocedure('public.pinfu_require_character_admin()') is null then
    raise exception '먼저 sql/character-admin.sql을 설치해주세요.';
  end if;
end; $$;

create or replace function public.pinfu_action_integer(v jsonb, min_value integer default -2147483648, nullable boolean default false)
returns integer language plpgsql immutable set search_path = '' as $$
begin
  if nullable and v='null'::jsonb then return null; end if;
  if v is null or jsonb_typeof(v)<>'number' then raise exception 'INVALID_ACTION_NUMBER'; end if;
  if v::numeric<>trunc(v::numeric) or v::numeric not between min_value and 2147483647 then raise exception 'INVALID_ACTION_NUMBER'; end if;
  return (v::numeric)::integer;
end; $$;

create or replace function public.admin_list_actions(p_search text default '',p_enabled boolean default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare items jsonb; total bigint;
begin
  perform public.pinfu_require_character_admin();
  if p_offset is null or p_offset<0 then raise exception 'INVALID_PAGE'; end if;
  select count(*) into total from public.commands c where c.command_type='action'
    and (p_enabled is null or c.enabled=p_enabled) and position(lower(coalesce(p_search,'')) in lower(c.command||' '||coalesce(c.display_name,'')))>0;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.command,q.id::bigint),'[]'::jsonb) into items from (
    select c.id::text as id,c.command,c.display_name,c.enabled from public.commands c where c.command_type='action'
      and (p_enabled is null or c.enabled=p_enabled) and position(lower(coalesce(p_search,'')) in lower(c.command||' '||coalesce(c.display_name,'')))>0
    order by c.command,c.id limit 25 offset p_offset) q;
  return jsonb_build_object('items',items,'total',total);
end; $$;

create or replace function public.admin_action_editor(p_command_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cmd jsonb; rules jsonb:='[]'; stats jsonb; choices jsonb; snapshot jsonb; protected_data jsonb;
begin
  perform public.pinfu_require_character_admin();
  if p_command_id is null then
    cmd:=jsonb_build_object('id',null,'command','','display_name','','description','','enabled',true,'hidden',false,
      'consumes_action',true,'dice_enabled',false,'dice_min',1,'dice_max',100,'dice_threshold',null,'success_message',null,'fail_message',null);
  else
    select jsonb_build_object('id',c.id::text,'command',c.command,'display_name',c.display_name,'description',c.description,
      'enabled',c.enabled,'hidden',c.hidden,'consumes_action',c.consumes_action,'dice_enabled',c.dice_enabled,
      'dice_min',c.dice_min,'dice_max',c.dice_max,'dice_threshold',c.dice_threshold,'success_message',c.success_message,'fail_message',c.fail_message)
      into cmd from public.commands c where c.id=p_command_id and c.command_type='action';
    if cmd is null then raise exception 'ACTION_NOT_FOUND'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id::text,'rule_key',r.rule_key,'enabled',r.enabled,'priority',r.priority,
      'rule_type',r.rule_type,'description',r.description,'use_from',r.use_from,'use_to',r.use_to,
      'previous_command_id',r.previous_command_id::text,'condition_min',r.condition_min,'condition_max',r.condition_max,
      'dice_outcome',r.dice_outcome,'condition_delta',r.condition_delta,
      'has_preserved_settings',r.money_delta<>0 or r.money_min is not null or r.money_max is not null,
      'stats',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text,'stat_id',e.stat_id::text,'delta',e.delta) order by e.id)
        from public.command_rule_stat_effects e where e.rule_id=r.id),'[]'::jsonb)) order by r.priority,r.id),'[]'::jsonb)
      into rules from public.command_rules r where r.command_id=p_command_id;
    -- Fingerprint uneditable settings too, but do not return monetary values.
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into protected_data from public.command_rules r where r.command_id=p_command_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id::text,'name',d.display_name,'enabled',d.enabled) order by d.id),'[]'::jsonb)
    into stats from public.stat_definitions d;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'name',c.command) order by c.command,c.id),'[]'::jsonb)
    into choices from public.commands c where c.command_type='action';
  snapshot:=jsonb_build_object('command',cmd,'rules',rules);
  return snapshot||jsonb_build_object('stats',stats,'commands',choices,'revision',case when p_command_id is null then null
    else md5(snapshot::text||coalesce(protected_data::text,'')) end);
end; $$;

create or replace function public.admin_save_action(p_command_id bigint,p_revision text,p_definition jsonb,p_bot_paused boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c jsonb; rs jsonb; r jsonb; e jsonb; old_snapshot jsonb; cid bigint; rid bigint; eid bigint;
  key text; token text; txt text; dmin integer; dmax integer; threshold integer; lo integer; hi integer;
begin
  perform public.pinfu_require_character_admin();
  if p_bot_paused is distinct from true then raise exception 'BOT_PAUSE_REQUIRED'; end if;
  if p_definition is null or jsonb_typeof(p_definition)<>'object' then raise exception 'INVALID_ACTION'; end if;
  if not(p_definition ?& array['command','rules']) or exists(select 1 from jsonb_object_keys(p_definition) k where k not in ('command','rules')) then raise exception 'FIELD_NOT_ALLOWED'; end if;
  c:=p_definition->'command';rs:=p_definition->'rules';
  if jsonb_typeof(c)<>'object' or jsonb_typeof(rs)<>'array' then raise exception 'INVALID_ACTION'; end if;
  if not(c ?& array['command','display_name','description','enabled','hidden','consumes_action','dice_enabled','dice_min','dice_max','dice_threshold','success_message','fail_message'])
    or exists(select 1 from jsonb_object_keys(c) k where k not in ('command','display_name','description','enabled','hidden','consumes_action','dice_enabled','dice_min','dice_max','dice_threshold','success_message','fail_message')) then raise exception 'FIELD_NOT_ALLOWED'; end if;
  if jsonb_typeof(c->'command')<>'string' or jsonb_typeof(c->'display_name')<>'string' or length(btrim(c->>'display_name')) not between 1 and 200
    or jsonb_typeof(c->'description')<>'string' or length(c->>'description')>10000 then raise exception 'INVALID_ACTION'; end if;
  token:=btrim(c->>'command');if left(token,1)<>'/' then token:='/'||token;end if;
  if token !~ '^/[[:alnum:]_-]{1,80}$' then raise exception 'INVALID_COMMAND_TEXT'; end if;
  foreach key in array array['enabled','hidden','consumes_action','dice_enabled'] loop
    if jsonb_typeof(c->key)<>'boolean' then raise exception 'INVALID_ACTION';end if;
  end loop;
  dmin:=public.pinfu_action_integer(c->'dice_min');dmax:=public.pinfu_action_integer(c->'dice_max');
  threshold:=public.pinfu_action_integer(c->'dice_threshold',-2147483648,true);
  if dmin>dmax then raise exception 'INVALID_COMMAND_DICE';end if;
  if jsonb_array_length(rs)>100 then raise exception 'TOO_MANY_RULES';end if;
  if p_command_id is not null then
    cid:=p_command_id;perform 1 from public.commands where id=cid and command_type='action' for update;
    if not found then raise exception 'ACTION_NOT_FOUND';end if;
    perform 1 from public.command_rules where command_id=cid order by id for update;
    perform 1 from public.command_rule_stat_effects e where e.rule_id in(select id from public.command_rules where command_id=cid) order by e.id for update;
    old_snapshot:=public.admin_action_editor(cid);
    if p_revision is null or p_revision<>old_snapshot->>'revision' then raise exception 'ACTION_CONFLICT';end if;
    if token<>old_snapshot->'command'->>'command' then raise exception 'COMMAND_READONLY';end if;
    if exists(select 1 from public.command_rules r where r.command_id=cid and not exists(select 1 from jsonb_array_elements(rs) x where x->>'id'=r.id::text)) then raise exception 'RULE_REMOVAL_NOT_ALLOWED';end if;
  end if;
  foreach key in array array['success_message','fail_message'] loop
    if jsonb_typeof(c->key) not in ('null','string') then raise exception 'INVALID_ACTION_MESSAGE';end if;
    if length(c->>key)>10000 then raise exception 'INVALID_ACTION_MESSAGE';end if;
    if (c->key) is distinct from (old_snapshot->'command'->key) then
      txt:=replace(replace(coalesce(c->>key,''),'{{',''),'}}','');
      txt:=replace(replace(replace(txt,'{display_name}',''),'{result}',''),'{dice_result}','');
      if position('{' in txt)>0 or position('}' in txt)>0 then raise exception 'INVALID_ACTION_MESSAGE';end if;
    end if;
  end loop;
  if p_command_id is null then
    perform pg_advisory_xact_lock(hashtextextended('pinfu-command:'||token,0));
    if exists(select 1 from public.commands where command=token) then raise exception 'COMMAND_ALREADY_EXISTS';end if;
    insert into public.commands(command,display_name,description,enabled,hidden,consumes_action,dice_enabled,dice_min,dice_max,dice_threshold,command_type,status_fields,success_message,fail_message)
      values(token,btrim(c->>'display_name'),c->>'description',(c->>'enabled')::boolean,(c->>'hidden')::boolean,(c->>'consumes_action')::boolean,(c->>'dice_enabled')::boolean,dmin,dmax,threshold,'action','[]',c->>'success_message',c->>'fail_message') returning id into cid;
  end if;
  if (select count(x->>'id')<>count(distinct x->>'id') or count(*)<>count(distinct x->>'rule_key') from jsonb_array_elements(rs) x) then raise exception 'DUPLICATE_RULE';end if;
  for r in select value from jsonb_array_elements(rs) loop
    if jsonb_typeof(r)<>'object' then raise exception 'INVALID_RULE';end if;
    if not(r ?& array['id','rule_key','description','enabled','priority','rule_type','use_from','use_to','previous_command_id','condition_min','condition_max','dice_outcome'])
      or exists(select 1 from jsonb_object_keys(r) k where k not in ('id','rule_key','description','enabled','priority','rule_type','use_from','use_to','previous_command_id','condition_min','condition_max','dice_outcome','condition_delta','stats')) then raise exception 'FIELD_NOT_ALLOWED';end if;
    if jsonb_typeof(r->'rule_key')<>'string' or length(r->>'rule_key') not between 1 and 200 or jsonb_typeof(r->'description')<>'string' or length(r->>'description')>10000
      or jsonb_typeof(r->'enabled')<>'boolean' or coalesce(r->>'rule_type','') not in ('effect','repeat_penalty','requirement') then raise exception 'INVALID_RULE';end if;
    foreach key in array array['id','previous_command_id'] loop
      if jsonb_typeof(r->key) not in ('string','null') or r->>key !~ '^[1-9][0-9]*$' then raise exception 'INVALID_ID';end if;
    end loop;
    if r->>'previous_command_id' is not null and not exists(select 1 from public.commands where id=(r->>'previous_command_id')::bigint and command_type='action') then raise exception 'COMMAND_NOT_FOUND';end if;
    perform public.pinfu_action_integer(r->'priority');
    if r->>'rule_type'='requirement' then
      if r ? 'condition_delta' or r ? 'stats' then raise exception 'REQUIREMENT_EFFECTS_NOT_ALLOWED';end if;
    else
      if not(r ?& array['condition_delta','stats']) then raise exception 'INVALID_RULE';end if;
      perform public.pinfu_action_integer(r->'condition_delta');
    end if;
    lo:=public.pinfu_action_integer(r->'use_from',1,true);hi:=public.pinfu_action_integer(r->'use_to',1,true);
    if lo>hi then raise exception 'INVALID_RULE_RANGE';end if;
    lo:=public.pinfu_action_integer(r->'condition_min',-2147483648,true);hi:=public.pinfu_action_integer(r->'condition_max',-2147483648,true);
    if lo>hi then raise exception 'INVALID_RULE_RANGE';end if;
    if jsonb_typeof(r->'dice_outcome') not in ('string','null') or r->>'dice_outcome' not in ('success','fail') then raise exception 'INVALID_DICE_OUTCOME';end if;
    if (r->>'enabled')::boolean and r->>'dice_outcome' is not null and (not (c->>'dice_enabled')::boolean or threshold is null) then raise exception 'DICE_JUDGMENT_REQUIRED';end if;
    if r->>'rule_type'<>'requirement' and (jsonb_typeof(r->'stats')<>'array' or jsonb_array_length(r->'stats')>200) then raise exception 'INVALID_RULE_STATS';end if;
    rid:=(r->>'id')::bigint;
    if rid is null then
      if r->>'rule_key' !~ '^[a-z][a-z0-9_]{0,79}$' then raise exception 'INVALID_RULE_KEY';end if;
      insert into public.command_rules(command_id,rule_key,description,enabled,priority,rule_type,use_from,use_to,previous_command_id,condition_min,condition_max,dice_outcome,condition_delta,money_delta)
        values(cid,r->>'rule_key',r->>'description',(r->>'enabled')::boolean,public.pinfu_action_integer(r->'priority'),r->>'rule_type',
          public.pinfu_action_integer(r->'use_from',1,true),public.pinfu_action_integer(r->'use_to',1,true),(r->>'previous_command_id')::bigint,
          public.pinfu_action_integer(r->'condition_min',-2147483648,true),public.pinfu_action_integer(r->'condition_max',-2147483648,true),r->>'dice_outcome',
          case when r->>'rule_type'='requirement' then 0 else public.pinfu_action_integer(r->'condition_delta') end,0) returning id into rid;
    else
      if p_command_id is null or not exists(select 1 from public.command_rules where id=rid and command_id=cid) then raise exception 'RULE_NOT_OWNED';end if;
      if not exists(select 1 from public.command_rules where id=rid and rule_key=r->>'rule_key') then raise exception 'RULE_KEY_READONLY';end if;
      if r->>'rule_type'<>'requirement' and exists(select 1 from public.command_rule_stat_effects e where e.rule_id=rid and not exists(select 1 from jsonb_array_elements(r->'stats') x where x->>'id'=e.id::text)) then raise exception 'EFFECT_REMOVAL_NOT_ALLOWED';end if;
      update public.command_rules set description=r->>'description',enabled=(r->>'enabled')::boolean,priority=public.pinfu_action_integer(r->'priority'),rule_type=r->>'rule_type',
        use_from=public.pinfu_action_integer(r->'use_from',1,true),use_to=public.pinfu_action_integer(r->'use_to',1,true),previous_command_id=(r->>'previous_command_id')::bigint,
        condition_min=public.pinfu_action_integer(r->'condition_min',-2147483648,true),condition_max=public.pinfu_action_integer(r->'condition_max',-2147483648,true),dice_outcome=r->>'dice_outcome',
        condition_delta=case when r->>'rule_type'='requirement' then condition_delta else public.pinfu_action_integer(r->'condition_delta') end
        where id=rid; -- Existing money_* and all excluded columns are preserved.
    end if;
    -- Requirements never insert/update/delete stat effects, including legacy rows.
    if r->>'rule_type'='requirement' then continue;end if;
    if (select count(x->>'id')<>count(distinct x->>'id') or count(*)<>count(distinct x->>'stat_id') from jsonb_array_elements(r->'stats') x) then raise exception 'DUPLICATE_RULE_STAT';end if;
    for e in select value from jsonb_array_elements(r->'stats') loop
      if jsonb_typeof(e)<>'object' then raise exception 'INVALID_RULE_STATS';end if;
      if not(e ?& array['id','stat_id','delta']) or exists(select 1 from jsonb_object_keys(e) k where k not in ('id','stat_id','delta')) then raise exception 'FIELD_NOT_ALLOWED';end if;
      if jsonb_typeof(e->'id') not in ('string','null') or e->>'id' !~ '^[1-9][0-9]*$' or jsonb_typeof(e->'stat_id')<>'string' or e->>'stat_id' !~ '^[1-9][0-9]*$' then raise exception 'INVALID_ID';end if;
      perform public.pinfu_action_integer(e->'delta');
      if not exists(select 1 from public.stat_definitions where id=(e->>'stat_id')::bigint) then raise exception 'STAT_NOT_FOUND';end if;
      eid:=(e->>'id')::bigint;
      if eid is null then
        if exists(select 1 from public.command_rule_stat_effects where rule_id=rid and stat_id=(e->>'stat_id')::bigint) then raise exception 'DUPLICATE_RULE_STAT';end if;
        insert into public.command_rule_stat_effects(rule_id,stat_id,delta) values(rid,(e->>'stat_id')::bigint,public.pinfu_action_integer(e->'delta'));
      else
        if not exists(select 1 from public.command_rule_stat_effects where id=eid and rule_id=rid and stat_id=(e->>'stat_id')::bigint) then raise exception 'EFFECT_NOT_OWNED';end if;
        update public.command_rule_stat_effects set delta=public.pinfu_action_integer(e->'delta') where id=eid;
      end if;
    end loop;
  end loop;
  update public.commands set display_name=btrim(c->>'display_name'),description=c->>'description',enabled=(c->>'enabled')::boolean,hidden=(c->>'hidden')::boolean,
    consumes_action=(c->>'consumes_action')::boolean,dice_enabled=(c->>'dice_enabled')::boolean,dice_min=dmin,dice_max=dmax,dice_threshold=threshold,
    success_message=c->>'success_message',fail_message=c->>'fail_message' where id=cid;
  return public.admin_action_editor(cid);
end; $$;
revoke all on function public.pinfu_action_integer(jsonb,integer,boolean) from public,anon,authenticated;
revoke all on function public.admin_list_actions(text,boolean,integer) from public,anon,authenticated;
revoke all on function public.admin_action_editor(bigint) from public,anon,authenticated;
revoke all on function public.admin_save_action(bigint,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_list_actions(text,boolean,integer) to authenticated;
grant execute on function public.admin_action_editor(bigint) to authenticated;
grant execute on function public.admin_save_action(bigint,text,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
