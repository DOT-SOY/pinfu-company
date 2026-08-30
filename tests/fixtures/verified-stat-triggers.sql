-- TEST ONLY: definitions supplied in the operational audit (2026-08-31).
-- These triggers already exist in production. Do NOT run this fixture there.
CREATE OR REPLACE FUNCTION public.initialize_character_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    insert into public.character_stats (
        character_id,
        stat_id,
        value
    )
    select
        new.id,
        s.id,
        s.default_value
    from public.stat_definitions s
    where s.enabled = true
    on conflict (character_id, stat_id) do nothing;

    return new;
end;
$function$;
CREATE TRIGGER trg_initialize_character_stats AFTER INSERT ON characters FOR EACH ROW EXECUTE FUNCTION initialize_character_stats();

CREATE OR REPLACE FUNCTION public.initialize_new_stat_for_characters()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if new.enabled = true then
        insert into public.character_stats (
            character_id,
            stat_id,
            value
        )
        select
            c.id,
            new.id,
            new.default_value
        from public.characters c
        where c.active = true
        on conflict (character_id, stat_id) do nothing;
    end if;

    return new;
end;
$function$;
CREATE TRIGGER trg_initialize_new_stat_for_characters AFTER INSERT ON stat_definitions FOR EACH ROW EXECUTE FUNCTION initialize_new_stat_for_characters();
