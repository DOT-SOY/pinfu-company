-- READ ONLY. Run in the operational Supabase SQL Editor and return the result.
-- No inserts, functions, triggers or schema changes.
begin transaction read only;
select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_object('table',c.table_name,'column',c.column_name,'type',c.data_type,'identity',c.is_identity,'default',c.column_default))
    from information_schema.columns c where c.table_schema='public'
    and c.table_name in ('characters','stat_definitions','character_stats')),
  'triggers', coalesce((select jsonb_agg(jsonb_build_object(
    'table',cl.relname,'name',t.tgname,'enabled',t.tgenabled,
    'trigger_definition',pg_get_triggerdef(t.oid,true),'function_definition',pg_get_functiondef(t.tgfoid)))
    from pg_trigger t join pg_class cl on cl.oid=t.tgrelid join pg_namespace ns on ns.oid=cl.relnamespace
    where ns.nspname='public' and cl.relname in ('characters','stat_definitions') and not t.tgisinternal),'[]'::jsonb),
  'related_functions',coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.prokind='f' and p.prosrc ilike '%character_stats%'),'[]'::jsonb),
  'character_stat_indexes',(select jsonb_agg(indexdef) from pg_indexes where schemaname='public' and tablename='character_stats'),
  'missing_active_character_enabled_stat_pairs',(select count(*) from public.characters c cross join public.stat_definitions d
    where c.active and d.enabled and not exists(select 1 from public.character_stats cs where cs.character_id=c.id and cs.stat_id=d.id)),
  'requirements_with_ignored_effects',coalesce((select jsonb_agg(jsonb_build_object(
    'rule_id',r.id::text,'command_id',r.command_id::text,'condition_delta',r.condition_delta,
    'stat_effect_count',(select count(*) from public.command_rule_stat_effects e where e.rule_id=r.id)))
    from public.command_rules r where r.rule_type='requirement' and
      (r.condition_delta<>0 or exists(select 1 from public.command_rule_stat_effects e where e.rule_id=r.id))),'[]'::jsonb)
) as audit_result;
rollback;
