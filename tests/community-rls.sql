-- Run as postgres in Supabase SQL Editor or execute_sql. All test data rolls back.
-- Uses existing profile identities without changing their accounts, names or roles.
begin;
do $$
declare
  owner_id uuid; other_id uuid; admin_id uuid;
  target_post bigint; comment_id bigint; n integer; edited timestamptz;
  test_nickname text := '__qa_' || substr(md5(random()::text),1,12);
begin
  select id into owner_id from public.profiles where role <> 'admin' order by id limit 1;
  select id into other_id from public.profiles where role <> 'admin' and id <> owner_id order by id limit 1;
  select id into admin_id from public.profiles where role='admin' limit 1;
  if owner_id is null or other_id is null or admin_id is null then raise exception 'Three test identities required'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  insert into public.stock_profiles(user_id,nickname,bio) values(owner_id,test_nickname,'test');
  update public.stock_profiles set bio='edited' where user_id=owner_id;
  insert into public.community_posts(board_type,author_id,title,content) values('anonymous',owner_id,'QA','content') returning id into target_post;
  update public.community_posts set title='edited' where id=target_post;
  select edited_at into edited from public.community_posts where id=target_post;
  insert into public.community_comments(post_id,user_id,content) values(target_post,owner_id,'comment') returning id into comment_id;
  update public.community_comments set content='edited' where id=comment_id;
  if (select comment_count from public.community_posts where id=target_post)<>1 then raise exception 'Counter insert'; end if;
  perform public.increment_community_post_view(target_post);
  if (select view_count from public.community_posts where id=target_post)<>1 then raise exception 'View RPC'; end if;
  if (select edited_at from public.community_posts where id=target_post) is distinct from edited then raise exception 'Counter timestamp'; end if;
  begin
    update public.community_posts set view_count=100 where id=target_post;
    raise exception 'Counter forgery allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.community_comments set post_id=target_post where id=comment_id;
    raise exception 'Comment reparent allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  update public.community_posts set title='other edit' where id=target_post;
  get diagnostics n=row_count; if n<>0 then raise exception 'Other post edit'; end if;
  update public.community_comments set content='other edit' where id=comment_id;
  get diagnostics n=row_count; if n<>0 then raise exception 'Other comment edit'; end if;
  delete from public.community_posts where id=target_post;
  get diagnostics n=row_count; if n<>0 then raise exception 'Other post delete'; end if;
  delete from public.community_comments where id=comment_id;
  get diagnostics n=row_count; if n<>0 then raise exception 'Other comment delete'; end if;
  begin
    insert into public.community_posts(board_type,author_id,title,content) values('anonymous',owner_id,'spoof','spoof');
    raise exception 'Owner spoof allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.stock_profiles(user_id,nickname) values(other_id,upper(test_nickname));
    raise exception 'Duplicate nickname allowed';
  exception when unique_violation then null; end;
  insert into public.stock_profiles(user_id,nickname) values(other_id,'v' || substr(test_nickname,2));
  begin
    update public.stock_profiles set nickname=upper(test_nickname) where user_id=other_id;
    raise exception 'Duplicate profile edit allowed';
  exception when unique_violation then null; end;
  update public.stock_profiles set bio='other edit' where user_id=owner_id;
  get diagnostics n=row_count; if n<>0 then raise exception 'Other profile edit'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  update public.community_posts set title='admin edit' where id=target_post;
  get diagnostics n=row_count; if n<>0 then raise exception 'Admin other post edit'; end if;
  update public.community_comments set content='admin edit' where id=comment_id;
  get diagnostics n=row_count; if n<>0 then raise exception 'Admin other comment edit'; end if;
  delete from public.community_comments where id=comment_id;
  get diagnostics n=row_count; if n<>1 then raise exception 'Admin comment delete'; end if;
  if (select comment_count from public.community_posts where id=target_post)<>0 then raise exception 'Counter delete'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.community_comments(post_id,user_id,content) select target_post,owner_id,'batch ' || g from generate_series(1,45) g;
  if (select comment_count from public.community_posts where id=target_post)<>45 then raise exception 'Batch comment count'; end if;
  select count(*) into n from (select id from public.community_comments where post_id=target_post order by created_at,id limit 41) q;
  if n<>41 then raise exception 'Comment lookahead window'; end if;
  delete from public.community_comments where post_id=target_post;
  if (select comment_count from public.community_posts where id=target_post)<>0 then raise exception 'Batch delete count'; end if;
  insert into public.community_comments(post_id,user_id,content) values(target_post,owner_id,'own delete') returning id into comment_id;
  delete from public.community_comments where id=comment_id;
  insert into public.community_posts(board_type,author_id,title,content) values('stock',owner_id,'stock','content') returning id into comment_id;
  delete from public.community_posts where id=comment_id;
  insert into public.community_posts(board_type,author_id,title,content) select 'anonymous',owner_id,'batch ' || g,'content' from generate_series(1,45) g;
  select count(*) into n from (select id from public.community_posts where board_type='anonymous' order by created_at desc,id desc offset 20 limit 21) q;
  if n<>21 then raise exception 'Post lookahead window'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  delete from public.community_posts where id=target_post;
  get diagnostics n=row_count; if n<>1 then raise exception 'Admin post delete'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin perform 1 from public.community_posts; raise exception 'Anon posts'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.community_comments; raise exception 'Anon comments'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.stock_profiles; raise exception 'Anon profiles'; exception when insufficient_privilege then null; end;
  begin perform public.increment_community_post_view(target_post); raise exception 'Anon RPC'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
select 'PASS: live community CRUD/RLS/uniqueness/counters/RPC' as result;
rollback;

