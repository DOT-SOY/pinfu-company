import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {actionDefinition,newActionRule,validateAction,actionChanges,actionError} from '../js/action-admin-model.js';
import {createActionApi} from '../js/actions.js';
globalThis.window={addEventListener(){}};
const {renderActionEditor}=await import('../js/pages/actions-admin.js');delete globalThis.window;
const draft=(command='/정돈')=>({command:{command,display_name:'정돈',description:'행동 테스트',enabled:true,hidden:false,consumes_action:true,
  dice_enabled:false,dice_min:1,dice_max:100,dice_threshold:null,success_message:'{display_name} 완료',fail_message:null},
  rules:[{...newActionRule(),condition_delta:-5,stats:[{id:null,stat_id:'1',delta:2}]}]});
const fresh={command:{id:null,command:'',display_name:'',description:'',enabled:true,hidden:false,consumes_action:true,dice_enabled:false,dice_min:1,dice_max:100,dice_threshold:null,success_message:null,fail_message:null},rules:[],stats:[{id:'1',name:'동적 스탯',enabled:true}],commands:[],revision:null};
test('action validation supports real fields, rule conditions and dynamic stat deltas',()=>{
  assert.deepEqual(validateAction(draft()),draft());
  for(const change of [{use_from:3,use_to:2},{condition_min:30,condition_max:20},{condition_delta:1.5},{dice_outcome:'fail'},{rule_type:'invented'},{rule_key:''}]){
    const d=draft();Object.assign(d.rules[0],change);assert.throws(()=>validateAction(d));
  }
  const d=draft();d.command.dice_enabled=true;d.command.dice_threshold=50;d.rules[0].dice_outcome='success';assert.equal(validateAction(d).rules[0].dice_outcome,'success');
  d.command.success_message='{unknown.field}';assert.throws(()=>validateAction(d));
  d.command.success_message='{{완료}} {display_name}';assert.ok(validateAction(d));
  const changes=actionChanges(fresh,draft());assert.ok(changes.some(r=>r.label.includes('동적 스탯')&&r.after==='2'));
});
test('action UI has definition/effects/condition controls without money or history editors',()=>{
  const data=structuredClone(fresh);data.command.display_name='<img src=x onerror=bad()>';data.rules=draft().rules;
  const html=renderActionEditor(data);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
  for(const name of ['condition_delta','rule_type','condition_min','condition_max','use_from','use_to','previous_command_id','dice_outcome'])assert.ok(html.includes(`name="${name}"`));
  assert.ok(html.includes('data-action-stat="1"'));assert.ok(!html.includes('name="money_delta"'));assert.ok(!html.includes('action_logs'));
  data.command.id='1';data.rules[0].id='2';const existing=renderActionEditor(data);assert.ok(existing.includes('readonly'));assert.ok(!existing.includes('data-remove-rule'));
});
test('action API rejects non-admin and submits one combined action/rules transaction',async()=>{
  const calls=[];const api=createActionApi(()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}}),()=>({isAdmin:true}));
  await api.save(null,null,draft(),true);assert.equal(calls[0].name,'admin_save_action');assert.equal(calls[0].args.p_definition.rules[0].condition_delta,-5);
  const denied=createActionApi(()=>{throw new Error('must not call');},()=>({isAdmin:false}));await assert.rejects(denied.detail('1'),/ADMIN_REQUIRED/);
  assert.match(actionError({code:'PGRST202'}),/action-admin.sql/);
});

test('isolated PostgreSQL action creation/editing and actual Python execution',async t=>{
  if(!process.env.PGLITE_MODULE){t.skip('Set PGLITE_MODULE for isolated PostgreSQL');return;}
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);const db=new PGlite();
  try{
    await db.exec(await readFile(new URL('./fixtures/character-schema.sql',import.meta.url),'utf8'));
    for(const file of ['character-admin.sql','action-admin.sql'])await db.exec(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
    const setUser=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const admin='11111111-1111-1111-1111-111111111111',normal='22222222-2222-2222-2222-222222222222';
    await setUser(admin);await db.exec('set role authenticated');
    const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
    const save=(id,revision,d,paused=true)=>call('select public.admin_save_action($1,$2,$3,$4) as result',[id,revision,JSON.stringify(d),paused]);
    const detail=id=>call('select public.admin_action_editor($1) as result',[id]);let created;
    const runPython=(data,mode='normal')=>{
      const source=[
        'import os,sys,json','from unittest.mock import patch',
        "sys.path.insert(0,os.environ['CORE_BOT_DIR']);sys.path.insert(0,os.path.join(os.environ['CORE_BOT_DIR'],'tests'))",
        'from test_action_engine import FakeStore,make_modifier','import action_engine',
        'p=json.load(sys.stdin);d=p["data"];s=FakeStore();c=d["command"]',
        's.commands[c["command"]]=c;s.rules[c["id"]]=[r for r in d["rules"] if r["enabled"]]',
        's.rule_stats=[dict(e,rule_id=r["id"]) for r in d["rules"] for e in r["stats"]]',
        's.stats={"1":10,"2":5,"3":0}',
        'if p["mode"]=="normal": s.modifiers=[make_modifier("cost","condition_cost_multiplier",0.8,target_command_id=c["id"])]',
        'with patch.object(action_engine.random,"randint",return_value=1): result=s.execute(c["command"])',
        'log=next(iter(s.logs.values()))',
        'print(json.dumps({"condition":s.character["condition"],"stat":s.stats["1"],"result":log["result"],"consumed":log["action_consumed"],"recognized":log["recognized"],"reply":result["reply_content"]}))'
      ].join('\n');
      const output=spawnSync(process.env.CORE_BOT_PYTHON,['-X','utf8','-c',source],{input:JSON.stringify({data,mode}),encoding:'utf8'});
      assert.equal(output.status,0,output.stderr);return JSON.parse(output.stdout);
    };
    await t.test('creates action + rule + stat effect atomically',async()=>{
      created=await save(null,null,draft());assert.match(created.command.id,/^\d+$/);assert.match(created.rules[0].id,/^\d+$/);assert.match(created.rules[0].stats[0].id,/^\d+$/);
      assert.equal(created.rules[0].condition_delta,-5);assert.equal(created.rules[0].stats[0].delta,2);
      const list=await call("select public.admin_list_actions('정돈',true,0) as result");assert.equal(list.total,1);
      await assert.rejects(save(null,null,draft()),/COMMAND_ALREADY_EXISTS/);
    });
    await t.test('real Python engine uses base condition/stat changes and applies the targeted skill',t=>{
      if(!process.env.CORE_BOT_PYTHON||!process.env.CORE_BOT_DIR){t.skip('Python paths not set');return;}
      const result=runPython(created);assert.deepEqual(result,{condition:16,stat:12,result:'success',consumed:true,recognized:true,reply:'정돈 완료'});
    });
    await t.test('existing IDs, hidden settings, skills and histories survive edits; stale revisions fail',async()=>{
      await db.exec('reset role');await db.query('update command_rules set money_delta=77,money_min=2 where id=$1',[created.rules[0].id]);await db.exec('set role authenticated');
      const before=await detail(created.command.id);assert.equal(before.rules[0].has_preserved_settings,true);assert.equal(before.rules[0].money_delta,undefined);
      const d=actionDefinition(before);d.command.display_name='정돈 수정';d.rules[0].condition_delta=-3;d.rules[0].stats[0].delta=4;
      const saved=await save(created.command.id,before.revision,d);assert.equal(saved.rules[0].id,created.rules[0].id);assert.equal(saved.rules[0].stats[0].id,created.rules[0].stats[0].id);
      await assert.rejects(save(created.command.id,before.revision,d),/ACTION_CONFLICT/);
      await db.exec('reset role');const hidden=(await db.query('select money_delta::text as delta,money_min::text as min from command_rules where id=$1',[created.rules[0].id])).rows[0];assert.deepEqual(hidden,{delta:'77',min:'2'});await db.exec('set role authenticated');
    });
    await t.test('invalid rules roll back the whole action; cross-action writes and deletes are blocked',async()=>{
      for(const change of [{condition_delta:1.1},{rule_key:''},{use_from:4,use_to:2},{condition_min:21,condition_max:20},{dice_outcome:'fail'},{money_delta:1},{previous_command_id:'999999'}]){
        const d=draft('/rollback');Object.assign(d.rules[0],change);await assert.rejects(save(null,null,d));
      }
      const bad=draft('/rollback');bad.rules[0].stats.push({id:null,stat_id:'99999',delta:1});await assert.rejects(save(null,null,bad),/STAT_NOT_FOUND/);
      assert.equal((await call("select public.admin_list_actions('/rollback',null,0) as result")).total,0);
      const before=await detail(created.command.id);const remove=actionDefinition(before);remove.rules=[];await assert.rejects(save(created.command.id,before.revision,remove),/RULE_REMOVAL_NOT_ALLOWED/);
      const effectRemove=actionDefinition(before);effectRemove.rules[0].stats=[];await assert.rejects(save(created.command.id,before.revision,effectRemove),/EFFECT_REMOVAL_NOT_ALLOWED/);
      const foreign=draft('/foreign');foreign.rules[0].id=created.rules[0].id;await assert.rejects(save(null,null,foreign),/RULE_NOT_OWNED/);
      const badTemplate=actionDefinition(before);badTemplate.command.success_message='{invalid.field}';await assert.rejects(save(created.command.id,before.revision,badTemplate),/INVALID_ACTION_MESSAGE/);
      const rename=actionDefinition(before);rename.command.command='/renamed';await assert.rejects(save(created.command.id,before.revision,rename),/COMMAND_READONLY/);
    });
    await t.test('success/failure rules and mandatory conditions obey actual engine semantics',async t=>{
      if(!process.env.CORE_BOT_PYTHON||!process.env.CORE_BOT_DIR){t.skip('Python paths not set');return;}
      const d=draft('/분기');d.command.dice_enabled=true;d.command.dice_threshold=50;d.rules[0].dice_outcome='success';
      d.rules.push({...newActionRule(d.rules),condition_delta:-2,dice_outcome:'fail',stats:[{id:null,stat_id:'1',delta:-1}]});
      const branch=await save(null,null,d);const failed=runPython(branch,'dice');assert.equal(failed.result,'fail');assert.equal(failed.condition,18);assert.equal(failed.stat,9);
      const req=actionDefinition(branch);req.rules.push({...newActionRule(req.rules),rule_type:'requirement',condition_min:30});
      const required=await save(branch.command.id,branch.revision,validateAction(req));const blocked=runPython(required,'dice');assert.equal(blocked.result,'requirement_failed');assert.equal(blocked.condition,20);assert.equal(blocked.stat,10);assert.equal(blocked.consumed,false);
    });
    await t.test('admin/pause guards protect every RPC and status commands cannot be edited',async()=>{
      await assert.rejects(save(null,null,draft('/pause'),false),/BOT_PAUSE_REQUIRED/);await setUser(normal);
      await assert.rejects(call('select public.admin_list_actions() as result'),/ADMIN_REQUIRED/);await assert.rejects(detail(created.command.id),/ADMIN_REQUIRED/);await assert.rejects(save(null,null,draft('/denied')),/ADMIN_REQUIRED/);
      await setUser(admin);await db.exec('reset role');const status=(await db.query("insert into commands(command,command_type) values('/status','status') returning id")).rows[0].id;await db.exec('set role authenticated');
      await assert.rejects(detail(status),/ACTION_NOT_FOUND/);await assert.rejects(save(status,'x',draft('/status')),/ACTION_NOT_FOUND/);
      await db.exec('reset role;set role anon');await assert.rejects(detail(created.command.id),/permission denied/);await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int as n from skill_usages')).rows[0].n,3);assert.equal((await db.query('select count(*)::int as n from action_logs')).rows[0].n,6);assert.equal((await db.query('select count(*)::int as n from character_skills')).rows[0].n,3);
    });
  }finally{await db.close();}
});
