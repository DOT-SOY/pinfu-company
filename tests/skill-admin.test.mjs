import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {EFFECTS,MONEY_EFFECTS,newModifier,validateSkill,skillDefinition,skillChanges,skillError} from '../js/skill-admin-model.js';
import {createSkillApi} from '../js/skills.js';
globalThis.window={addEventListener(){}};
const {renderSkillEditor}=await import('../js/pages/skills-admin.js');
delete globalThis.window;
const fresh={skill:{id:null,skill_key:'',name:'',description:'',enabled:true},modifiers:[],commands:[{id:'1',name:'/청소'}],stats:[{id:'1',name:'성과'}],holders:0,revision:null};
const draft=(key='nunchi')=>({skill_key:key,name:'눈치',description:'실패 시 하루 한 번 재굴림',enabled:true,
  modifiers:[{...skillDefinition({...fresh,modifiers:[newModifier()]}).modifiers[0],modifier_type:'dice_reroll',value:1,period:'day',max_uses:1}]});

test('skill editor renders shared definition and actual supported conditions, safely escaped',()=>{
  const data=structuredClone(fresh);data.skill.name='<img src=x onerror=bad()>';data.modifiers=[newModifier()];
  const html=renderSkillEditor(data);
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
  for(const field of ['target_command_id','period','max_uses','priority','modifier_type'])assert.ok(html.includes(`name="${field}"`));
  assert.ok(!html.includes('name="target_stat_id"'));
  assert.ok(!html.includes('name="condition_min"'));assert.ok(!html.includes('name="money"'));
  assert.ok(html.includes('모든 캐릭터'));assert.ok(html.includes('봇 실행을 일시 중지'));
  data.skill.id='1';data.modifiers[0].id='1';
  const existing=renderSkillEditor(data);assert.ok(existing.includes('readonly'));assert.ok(!existing.includes('data-remove-modifier'));
});
test('validation: modifier constraints, usage periods, numeric limits, bigint and preview',()=>{
  assert.deepEqual(validateSkill(draft()),draft());
  for(const change of [{value:1.5},{value:-1},{value:101},{value:null},{value:Infinity},{period:'month'},{max_uses:-1},{max_uses:1.5},
    {modifier_type:'custom_condition'},{target_stat_id:'1'},{target_command_id:'9223372036854775808'},{priority:''}]){
    const d=draft();Object.assign(d.modifiers[0],change);assert.throws(()=>validateSkill(d));
  }
  const d=draft();d.modifiers[0].max_uses=0;assert.equal(validateSkill(d).modifiers[0].max_uses,0);
  d.modifiers[0].max_uses=null;d.modifiers[0].period=null;assert.equal(validateSkill(d).modifiers[0].max_uses,null);
  const snapshot={...fresh,skill:{id:'1',...draft(),modifiers:undefined},modifiers:[{id:'9',...draft().modifiers[0],params:{keep:true}}]};
  snapshot.modifiers[0].id='9';const edited=skillDefinition(snapshot);edited.modifiers[0].max_uses=2;
  assert.equal('params' in edited.modifiers[0],false);assert.ok(skillChanges(snapshot,edited).some(r=>r.label.includes('사용 한도') && r.after==='2'));
});
test('skill API checks admin and sends a single atomic definition request',async()=>{
  const calls=[];const api=createSkillApi(()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}}),()=>({isAdmin:true}));
  await api.save(null,null,draft(),true);assert.equal(calls[0].name,'admin_save_skill');assert.equal(calls[0].args.p_skill_id,null);
  await api.detail('9007199254740993');assert.equal(calls[1].args.p_skill_id,'9007199254740993');
  const denied=createSkillApi(()=>{throw new Error('must not call');},()=>({isAdmin:false}));
  await assert.rejects(denied.list(),/ADMIN_REQUIRED/);
  assert.match(skillError({code:'PGRST202'}),/skill-admin.sql/);
});
test('all effect types match the actual Python engine',t=>{
  if(!process.env.CORE_BOT_PYTHON || !process.env.CORE_BOT_DIR){t.skip('Python bot path not supplied');return;}
  const result=spawnSync(process.env.CORE_BOT_PYTHON,['-c',"import os,sys,json;sys.path.insert(0,os.environ['CORE_BOT_DIR']);from skill_engine import SUPPORTED_MODIFIER_TYPES;print(json.dumps(sorted(SUPPORTED_MODIFIER_TYPES)))"],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.deepEqual([...Object.keys(EFFECTS),...MONEY_EFFECTS].sort(),JSON.parse(result.stdout));
});
test('isolated PostgreSQL skill definition lifecycle',async t=>{
  if(!process.env.PGLITE_MODULE){t.skip('Set PGLITE_MODULE to run isolated PostgreSQL integration');return;}
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('./fixtures/character-schema.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../sql/character-admin.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../sql/skill-admin.sql',import.meta.url),'utf8'));
    const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
    const setUser=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const admin='11111111-1111-1111-1111-111111111111',normal='22222222-2222-2222-2222-222222222222';
    await setUser(admin);await db.exec('set role authenticated');
    const save=(id,revision,d,paused=true)=>call('select public.admin_save_skill($1,$2,$3,$4) as result',[id,revision,JSON.stringify(d),paused]);
    const detail=id=>call('select public.admin_skill_editor($1) as result',[id]);
    let created;
    await t.test('create shared definition and modifiers with database-generated IDs; available for grants',async()=>{
      const template=await detail(null);assert.equal(template.skill.id,null);assert.equal(template.commands[0].name,'/청소');
      created=await save(null,null,draft());assert.equal(created.skill.name,'눈치');assert.match(created.skill.id,/^\d+$/);assert.match(created.modifiers[0].id,/^\d+$/);
      const list=await call("select public.admin_list_skills('nunchi',true,0) as result");assert.equal(list.total,1);
      const candidates=await call("select public.admin_search_character_skills(1,'눈치') as result");assert.ok(candidates.items.some(s=>s.id===created.skill.id));
      assert.equal(created.holders,0);
      await assert.rejects(save(null,null,draft()),/SKILL_KEY_EXISTS/);
    });
    await t.test('update preserves modifier identity, params, skill usage and other character relations',async()=>{
      await db.exec("reset role; update public.skill_modifiers set params='{\"preserve\":true}' where id=2; set role authenticated;");
      const before=await detail('1'),d=skillDefinition(before);d.name='요령 수정';d.modifiers.find(m=>m.id==='2').max_uses=2;
      const saved=await save('1',before.revision,d);assert.equal(saved.holders,2);assert.equal(saved.skill.name,'요령 수정');
      assert.deepEqual(saved.modifiers.find(m=>m.id==='2').params,{preserve:true});
      const character=await call('select public.admin_get_character(1) as result');
      assert.equal(character.skills.find(s=>s.id==='1').modifiers.find(m=>m.id==='2').used,1);
      await assert.rejects(save('1',before.revision,d),/SKILL_CONFLICT/);
      const disabled=skillDefinition(saved);disabled.modifiers.find(m=>m.id==='2').enabled=false;
      await save('1',saved.revision,disabled);
      const after=await detail('1');assert.ok(after.modifiers.some(m=>m.id==='2' && !m.enabled));
    });
    await t.test('transaction rolls back invalid definitions and rejects unsupported conditions/foreign IDs',async()=>{
      const invalids=[{modifier_type:'custom_condition'},{value:1.2},{value:101},{value:-2},{max_uses:-1},{period:'month'},
        {priority:1.5},{target_command_id:'999999'},{target_stat_id:'1'},{id:'2'},{params:{condition_min:50}}];
      for(let i=0;i<invalids.length;i++){
        const d=draft('invalid_'+i);Object.assign(d.modifiers[0],invalids[i]);await assert.rejects(save(null,null,d));
      }
      assert.equal((await call("select public.admin_list_skills('invalid_',null,0) as result")).total,0);
      const before=await detail('1');const d=skillDefinition(before);d.name='must rollback';d.modifiers.push({...draft().modifiers[0],target_command_id:'9999'});
      await assert.rejects(save('1',before.revision,d));assert.equal((await detail('1')).skill.name,before.skill.name);
      const removal=skillDefinition(before);removal.modifiers.pop();await assert.rejects(save('1',before.revision,removal),/MODIFIER_REMOVAL_NOT_ALLOWED/);
      const renameKey=skillDefinition(before);renameKey.skill_key='different';await assert.rejects(save('1',before.revision,renameKey),/SKILL_KEY_READONLY/);
      const foreign=skillDefinition(before);foreign.modifiers.push({...draft().modifiers[0],id:created.modifiers[0].id});await assert.rejects(save('1',before.revision,foreign),/MODIFIER_NOT_OWNED/);
    });
    await t.test('pause guard and server-side admin authorization cannot be bypassed',async()=>{
      await assert.rejects(save(null,null,draft('paused_check'),false),/BOT_PAUSE_REQUIRED/);
      await setUser(normal);
      for(const query of ['select public.admin_list_skills()','select public.admin_skill_editor(1)'])await assert.rejects(db.query(query),/ADMIN_REQUIRED/);
      await assert.rejects(save(null,null,draft('denied')),/ADMIN_REQUIRED/);
      await setUser(admin);await db.exec('reset role; set role anon');await assert.rejects(db.query('select public.admin_skill_editor(1)'),/permission denied/);
      await db.exec('reset role; set role authenticated');
    });
    await t.test('disabled shared skill is excluded from grants without removing existing ownership or histories',async()=>{
      const before=await detail('1');const d=skillDefinition(before);d.enabled=false;await save('1',before.revision,d);
      const candidates=await call("select public.admin_search_character_skills(2,'') as result");assert.ok(!candidates.items.some(s=>s.id==='1'));
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int as n from public.skill_usages')).rows[0].n,3);
      assert.equal((await db.query('select count(*)::int as n from public.character_skills')).rows[0].n,3);
      assert.equal((await db.query('select money::text as n from public.characters where id=1')).rows[0].n,'123456');
      assert.equal((await db.query('select count(*)::int as n from public.action_logs')).rows[0].n,6);
    });
  }finally{await db.close();}
});
