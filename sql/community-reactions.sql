-- Apply after community.sql. Personal reactions stay private under RLS.
begin;
alter table public.community_posts add column like_count integer not null default 0 check (like_count >= 0);
create table public.community_post_actions (
  post_id bigint not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('like','bookmark')),
  created_at timestamptz not null default now(),
  primary key(post_id,user_id,action)
);
create index community_post_actions_user_idx on public.community_post_actions(user_id,action,post_id);
alter table public.community_post_actions enable row level security;
create policy community_actions_read on public.community_post_actions for select to authenticated using (user_id = (select auth.uid()));
create policy community_actions_create on public.community_post_actions for insert to authenticated with check (user_id = (select auth.uid()));
create policy community_actions_delete on public.community_post_actions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.community_post_actions from public,anon,authenticated;
grant select,delete on public.community_post_actions to authenticated;
grant insert(post_id,user_id,action) on public.community_post_actions to authenticated;
create function private.community_like_counter() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.action = 'like' then update public.community_posts set like_count = like_count + 1 where id = new.post_id; end if;
    return new;
  end if;
  if old.action = 'like' then update public.community_posts set like_count = greatest(0,like_count - 1) where id = old.post_id; end if;
  return old;
end;
$$;
create trigger community_actions_count after insert or delete on public.community_post_actions for each row execute function private.community_like_counter();
revoke all on function private.community_like_counter() from public,anon,authenticated;
-- Idempotent set avoids retry/double-click inversion. Per-user locks serialize requests.
create function public.set_community_post_action(p_post_id bigint,p_action text,p_active boolean) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); counter integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_action not in ('like','bookmark') or p_action is null or p_active is null then raise exception 'Invalid action' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_post_id::text || ':' || p_action,0));
  select like_count into counter from public.community_posts where id = p_post_id;
  if not found then raise exception 'Post not found' using errcode='P0002'; end if;
  if p_active then
    insert into public.community_post_actions(post_id,user_id,action) values(p_post_id,uid,p_action) on conflict do nothing;
  else
    delete from public.community_post_actions where post_id = p_post_id and user_id = uid and action = p_action;
  end if;
  select like_count into counter from public.community_posts where id = p_post_id;
  return jsonb_build_object('active',p_active,'like_count',counter);
end;
$$;
revoke all on function public.set_community_post_action(bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.set_community_post_action(bigint,text,boolean) to authenticated;
commit;
