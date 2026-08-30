import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {commandDefinition,commandSummary,mergeTargetCommands,commandError} from '../js/skill-command-model.js';
import {renderCommandDialog,bindCommandDialog} from '../js/skill-command-dialog.js';
import {createSkillApi} from '../js/skills.js';
import {skillDefinition} from '../js/skill-admin-model.js';
globalThis.window={addEventListener(){}};
const {renderSkillEditor}=await import('../js/pages/skills-admin.js');
delete globalThis.window;

const values=(command='정리')=>({command,display_name:'정리',description:'대상 명령 테스트',enabled:true,consumes_action:true,
  dice_enabled:false,dice_min:'1',dice_max:'100',dice_threshold:'50'});
test('command text normalization and dice validation follow bot-supported syntax',()=>{
  assert.equal(commandDefinition(values(' 정리 ')).command,'/정리');
  for(const text of ['/','/긴 명령','/a/b','/a!','/😀','/a.b','x'.repeat(81)]) assert.throws(()=>commandDefinition(values(text)));
  for(const text of ['/정리','/掃除','/clean-up_2','/éclair','/ㄱㄴ']) assert.equal(commandDefinition(values(text)).command,text);
  const disabled=commandDefinition({...values(),dice_min:'invalid',dice_threshold:'oops'});
  assert.equal(disabled.dice_min,1);assert.equal(disabled.dice_threshold,null);
  for(const change of [{dice_min:'101'},{dice_min:'1.5'},{dice_max:''},{dice_threshold:'0.5'}]) assert.throws(()=>commandDefinition({...values(),dice_enabled:true,...change}));
  const rollOnly=commandDefinition({...values(),dice_enabled:true,dice_threshold:''});assert.equal(rollOnly.dice_threshold,null);
  assert.match(commandSummary(rollOnly),/성공·실패 판정 없음/);
});
test('inline dialog is a separate form and target options do not modify unsaved skill values',()=>{
  const data={skill:{id:'1',skill_key:'draft',name:'미저장 이름',description:'내용',enabled:true},modifiers:[{id:'1',modifier_type:'dice_reroll',value:1,enabled:true,priority:100,target_command_id:null,target_stat_id:null,period:'day',max_uses:1,params:{}}],commands:[],stats:[],revision:'keep-this-revision',holders:0};
  const original=structuredClone(data);
  data.commands=mergeTargetCommands(data.commands,[{id:'9007199254740993',name:'/정리'}]);
  assert.equal(data.revision,original.revision);assert.deepEqual(data.skill,original.skill);assert.deepEqual(data.modifiers,original.modifiers);
  assert.equal(mergeTargetCommands(data.commands,data.commands).length,1);
  const html=renderSkillEditor(data);assert.ok(html.includes('data-new-target-command="0"'));
  assert.ok(html.indexOf('</form>')<html.indexOf('<dialog')); // never nest command registration in skill save.
  assert.ok(renderCommandDialog().includes('스킬 편집을 취소해도 등록한 명령은 남습니다'));
});
test('dialog registration preserves parent form and handles cancel, success and failed requests',async()=>{
  // Event contract test with synthetic controls; no browser or production database.
  const events=new Map();const control=(value='',checked=false)=>({value,checked,disabled:false,isConnected:true,addEventListener(type,fn){this.handlers??={};this.handlers[type]=fn;}});
  const fields={command:control('/정리'),display_name:control('정리'),description:control(''),enabled:control('true'),consumes_action:control('true'),dice_enabled:control('',false),dice_min:control('1'),dice_max:control('100'),dice_threshold:control('50'),bot_paused:control('',true)};
  const dice=control(),output={innerHTML:''},cancel=control();
  const form={elements:fields,querySelector(selector){return selector==='#skill-command-dice'?dice:cancel;},querySelectorAll(){return Object.values(fields);},addEventListener(type,fn){events.set(type,fn);},reset(){fields.command.value='';fields.bot_paused.checked=false;}};
  const dialog={opened:false,querySelector(selector){return selector==='form'?form:output;},addEventListener(type,fn){events.set('dialog:'+type,fn);},showModal(){this.opened=true;},close(){this.opened=false;}};
  const root={querySelector(){return dialog;}},page={busy:false,commandDirty:false,dirty:true};let calls=0,created=null,fail=false;
  const originalFormData=globalThis.FormData,originalConfirm=globalThis.confirm;
  globalThis.FormData=class{get(name){return fields[name]?.value ?? null;}};
  globalThis.confirm=()=>true;
  try {
    const open=bindCommandDialog({root,page,live:()=>true,createCommand:async(command,paused)=>{calls++;assert.equal(paused,true);assert.equal(command.command,'/정리');if(fail)throw {message:'COMMAND_ALREADY_EXISTS'};return {id:'9',name:'/정리'};},onCreated:(row,index)=>{created={row,index};}});
    open(2,'dice_reroll');assert.equal(dice.disabled,false);assert.equal(fields.dice_enabled.checked,true);assert.equal(fields.bot_paused.checked,false);
    fields.command.value='/정리';fields.bot_paused.checked=true;
    await events.get('submit')({preventDefault(){}});assert.equal(calls,1);assert.equal(created.index,2);assert.equal(dialog.opened,false);assert.equal(page.busy,false);assert.equal(page.dirty,true);
    open(0,'condition_cost_multiplier');assert.equal(dice.disabled,true);fields.command.value='/정리';fields.bot_paused.checked=true;fail=true;
    await events.get('submit')({preventDefault(){}});assert.equal(dialog.opened,true);assert.match(output.innerHTML,/이미 등록/);assert.equal(fields.command.disabled,false);
    events.get('input')();page.busy=true;events.get('dialog:cancel')({preventDefault(){}});assert.equal(dialog.opened,true);
    page.busy=false;events.get('dialog:cancel')({preventDefault(){}});assert.equal(dialog.opened,false);assert.equal(page.commandDirty,false);assert.equal(page.dirty,true);
  }finally{globalThis.FormData=originalFormData;if(originalConfirm===undefined)delete globalThis.confirm;else globalThis.confirm=originalConfirm;}
});
test('command create API authorization and RPC payload are isolated from skill saves',async()=>{
  const calls=[];const api=createSkillApi(()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'1'}};}}),()=>({isAdmin:true}));
  await api.createTargetCommand(commandDefinition(values()),true);
  assert.equal(calls[0].name,'admin_create_skill_target_command');assert.equal(calls[0].args.p_definition.command,'/정리');
  assert.equal('skill_id' in calls[0].args.p_definition,false);
  const denied=createSkillApi(()=>{throw new Error('must not request');},()=>({isAdmin:false}));await assert.rejects(denied.createTargetCommand({},true),/ADMIN_REQUIRED/);
  assert.match(commandError({code:'PGRST202'}),/skill-command-admin.sql/);
});

test('isolated PostgreSQL: register target command and use it without overwriting skills',async t=>{
  if(!process.env.PGLITE_MODULE){t.skip('Set PGLITE_MODULE to run isolated PostgreSQL integration');return;}
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('./fixtures/character-schema.sql',import.meta.url),'utf8'));
    for(const filename of ['character-admin.sql','skill-admin.sql','skill-command-admin.sql'])await db.exec(await readFile(new URL('../sql/'+filename,import.meta.url),'utf8'));
    const setUser=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const admin='11111111-1111-1111-1111-111111111111',normal='22222222-2222-2222-2222-222222222222';
    await setUser(admin);await db.exec('set role authenticated');
    const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
    const create=(d,paused=true)=>call('select public.admin_create_skill_target_command($1,$2) as result',[JSON.stringify(d),paused]);
    const detail=()=>call('select public.admin_skill_editor(1) as result');
    let created;
    await t.test('new Korean command has real identity ID and complete action defaults',async()=>{
      const before=await detail();created=await create(commandDefinition({...values(),dice_enabled:true}));
      assert.equal(created.name,'/정리');assert.match(created.id,/^\d+$/);
      const after=await detail();assert.equal(after.revision,before.revision);assert.deepEqual(after.modifiers,before.modifiers);assert.ok(after.commands.some(c=>c.id===created.id));
      const draft=skillDefinition(before);draft.modifiers.find(m=>m.id==='2').target_command_id=created.id;
      const saved=await call('select public.admin_save_skill(1,$1,$2,true) as result',[before.revision,JSON.stringify(draft)]);
      assert.equal(saved.modifiers.find(m=>m.id==='2').target_command_id,created.id);
      await db.exec('reset role');const row=(await db.query('select * from public.commands where id=$1',[created.id])).rows[0];
      assert.equal(row.command_type,'action');assert.deepEqual(row.status_fields,[]);assert.equal(row.hidden,false);assert.equal(row.dice_min,1);assert.equal(row.dice_max,100);assert.equal(row.dice_threshold,50);
      assert.equal(row.success_message,null);assert.equal(row.fail_message,null);await db.exec('set role authenticated');
    });
    await t.test('duplicates cannot overwrite existing command settings, including retry after timeout',async()=>{
      await assert.rejects(create({...commandDefinition(values()),consumes_action:false}),/COMMAND_ALREADY_EXISTS/);
      await assert.rejects(create(commandDefinition(values('청소'))),/COMMAND_ALREADY_EXISTS/);
      await db.exec('reset role');assert.equal((await db.query('select consumes_action,dice_enabled from public.commands where id=$1',[created.id])).rows[0].dice_enabled,true);await db.exec('set role authenticated');
    });
    await t.test('server validates command syntax, types, unknown fields, dice and permissions',async()=>{
      const base=commandDefinition(values('/invalid'));
      for(const change of [{command:'/with space'},{command:'/a/b'},{command:'/😀'},{command:'/'},{command:'/a.b'},
        {display_name:''},{enabled:'true'},{dice_min:1.5},{dice_min:101},{dice_threshold:0.5},{dice_max:2147483648},{command_type:'status'},{id:'123'}])await assert.rejects(create({...base,...change}));
      await assert.rejects(create(base,false),/BOT_PAUSE_REQUIRED/);
      await setUser(normal);await assert.rejects(create(base),/ADMIN_REQUIRED/);
      await setUser(admin);await db.exec('reset role;set role anon');await assert.rejects(create(base),/permission denied/);
      await db.exec('reset role;set role authenticated');
      await create({...base,command:'/roll_only',dice_enabled:true,dice_threshold:null});
      await create({...base,command:'/disabled_command',enabled:false,consumes_action:false});
    });
    await t.test('created command runs through the real Python action engine with a targeted reroll skill',async t=>{
      if(!process.env.CORE_BOT_PYTHON || !process.env.CORE_BOT_DIR){t.skip('Python bot path not supplied');return;}
      await db.exec('reset role');const command=(await db.query('select *,id::text as id from public.commands where id=$1',[created.id])).rows[0];await db.exec('set role authenticated');
      const source=[
        'import sys,os,json','from unittest.mock import patch',
        "sys.path.insert(0,os.environ['CORE_BOT_DIR']);sys.path.insert(0,os.path.join(os.environ['CORE_BOT_DIR'],'tests'))",
        'from test_action_engine import FakeStore,make_modifier','import action_engine',
        'command=json.load(sys.stdin)','store=FakeStore()',"store.commands[command['command']]=command",
        "store.modifiers=[make_modifier('reroll','dice_reroll',1,target_command_id=command['id'])]",
        "with patch.object(action_engine.random,'randint',side_effect=[1,100]):",
        " result=store.execute(command['command'])",
        "log=next(iter(store.logs.values()))",
        "print(json.dumps({'reply':result['should_reply'],'recognized':log['recognized'],'result':log['result'],'consumed':log['action_consumed'],'dice':log['dice_result'],'usages':len(store.usages),'condition':store.character['condition']}))"
      ].join('\n');
      const result=spawnSync(process.env.CORE_BOT_PYTHON,['-X','utf8','-c',source],{input:JSON.stringify(command),encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{reply:true,recognized:true,result:'success',consumed:true,dice:100,usages:1,condition:20});
    });
    await t.test('command token choices are compatible with Python parser; histories and ownership stay unchanged',async t=>{
      const names=['/掃除','/clean-up_2','/éclair','/ㄱㄴ'];
      for(const command of names)assert.equal((await create(commandDefinition(values(command)))).name,command);
      if(process.env.CORE_BOT_PYTHON && process.env.CORE_BOT_DIR){
        const source="import sys,os,json;sys.path.insert(0,os.environ['CORE_BOT_DIR']);from action_engine import parse_command;print(json.dumps([parse_command(x) for x in json.load(sys.stdin)]))";
        const result=spawnSync(process.env.CORE_BOT_PYTHON,['-X','utf8','-c',source],{input:JSON.stringify(names),encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),names);
      }
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int as n from skill_usages')).rows[0].n,3);
      assert.equal((await db.query('select count(*)::int as n from action_logs')).rows[0].n,6);
      assert.equal((await db.query('select count(*)::int as n from character_skills')).rows[0].n,3);
    });
  }finally{await db.close();}
});
