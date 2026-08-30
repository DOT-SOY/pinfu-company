import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {EFFECTS,MONEY_EFFECTS,newModifier,modifierInputs,skillDefinition,validateSkill} from '../js/skill-admin-model.js';
import {newActionRule,actionDefinition,validateAction,actionChanges} from '../js/action-admin-model.js';
import {statDefinition,validateStat,statChanges} from '../js/stat-admin-model.js';
import {createStatApi} from '../js/stats.js';
globalThis.window={addEventListener(){}};
const {renderModifier,renderSkillEditor}=await import('../js/pages/skills-admin.js');
const {renderActionEditor,renderActionRule}=await import('../js/pages/actions-admin.js');
const {renderStatEditor,renderStatList}=await import('../js/pages/stats-admin.js');
delete globalThis.window;
const statDraft=()=>({stat_key:'boss_reputation',display_name:'상사평판',description:'새 동적 정의',default_value:-2,enabled:true});
const statFresh={stat:{id:null,stat_key:'',display_name:'',description:'',default_value:0,enabled:true},revision:null};
const choices={commands:[{id:'1',name:'/청소'}],stats:[{id:'1',name:'실시간 스탯',enabled:true}]};
const actionDraft=()=>({command:{command:'/검증',display_name:'검증',description:'',enabled:true,hidden:false,consumes_action:true,dice_enabled:false,dice_min:1,dice_max:100,dice_threshold:null,success_message:null,fail_message:null},rules:[]});
const skillFresh={skill:{id:null,skill_key:'',name:'',description:'',enabled:true},modifiers:[],holders:0,...choices};

test('stat list displays all definition fields dynamically and escapes names',()=>{
 const row={id:'1',...statDraft(),display_name:'<unsafe>',description:'설명'};
 const html=renderStatList({items:[row],total:1});
 for(const text of ['&lt;unsafe&gt;','boss_reputation','설명','-2','활성'])assert.ok(html.includes(text));
 assert.ok(!html.includes('<unsafe>'));assert.ok(!html.includes('업무성과'));
 assert.ok(renderStatEditor({stat:row}).includes('readonly'));assert.ok(!renderStatEditor(statFresh).includes('data-stat-id'));
});
test('stat validation keeps definition edits separate from character values',()=>{
 assert.deepEqual(validateStat(statDraft()),statDraft());
 for(const change of [{stat_key:'Invalid key'},{default_value:1.5},{default_value:2147483648},{display_name:''},{enabled:'true'},{value:9},{character_id:'1'}]){
  assert.throws(()=>validateStat({...statDraft(),...change}));
 }
 const snapshot={stat:{id:'9',...statDraft()}};
 assert.deepEqual(statDefinition(snapshot),statDraft());
 assert.equal(statChanges(snapshot,{...statDraft(),default_value:10})[0].after,'10');
});
test('stat API uses admin-only RPC, keeps bigint text and submits one definition',async()=>{
 const calls=[];const api=createStatApi(()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}}),()=>({isAdmin:true}));
 await api.save(null,null,statDraft(),true);await api.detail('9007199254740993');
 assert.equal(calls[0].name,'admin_save_stat');assert.deepEqual(calls[0].args.p_definition,statDraft());
 assert.equal(calls[1].args.p_stat_id,'9007199254740993');
 const denied=createStatApi(()=>{throw Error('not reached');},()=>({isAdmin:false}));
 await assert.rejects(denied.list(),/ADMIN_REQUIRED/);
});
test('exactly 13 editable effect options; all 4 monetary options absent',()=>{
 assert.equal(Object.keys(EFFECTS).length,13);
 const html=renderModifier(newModifier(),0,choices);
 for(const type of Object.keys(EFFECTS))assert.ok(html.includes('value="'+type+'"'));
 for(const type of MONEY_EFFECTS){assert.ok(!html.includes('value="'+type+'"'));assert.throws(()=>validateSkill({skill_key:'a',name:'A',description:'',enabled:true,modifiers:[{...newModifier(),modifier_type:type}]}));}
});
test('legacy money effects are not rendered or submitted as editable modifiers',()=>{
 const legacy=MONEY_EFFECTS.map((modifier_type,i)=>({...newModifier(),id:String(i+1),modifier_type,value:77,params:{keep:true}}));
 const data={...skillFresh,modifiers:[...legacy,newModifier()]};
 const html=renderSkillEditor(data);
 assert.ok(html.includes('기존 효과 4개'));for(const t of MONEY_EFFECTS)assert.ok(!html.includes(t));
 assert.equal(skillDefinition(data).modifiers.length,1);
});
test('each modifier exposes only engine-relevant stat and value fields',()=>{
 for(const type of Object.keys(EFFECTS)){
  const row={...newModifier(),modifier_type:type},html=renderModifier(row,0,choices),fields=modifierInputs(type);
  assert.equal(html.includes('name="target_stat_id"'),fields.stat,type);
  assert.equal(html.includes('name="value"'),fields.value,type);
  for(const field of ['target_command_id','period','max_uses','priority'])assert.ok(html.includes('name="'+field+'"'),type+' '+field);
 }
 assert.equal(modifierInputs('dice_reroll').value,true);
 assert.equal(modifierInputs('daily_action_bonus').stat,false);
});
test('requirements render conditions, omit effects and normalize payload without ignored fields',()=>{
 const rule={...newActionRule(),id:'1',rule_type:'requirement',condition_min:10,condition_delta:123,stats:[{id:'2',stat_id:'1',delta:99}]};
 const html=renderActionRule(rule,0,choices);
 for(const field of ['condition_min','condition_max','use_from','use_to','previous_command_id','dice_outcome'])assert.ok(html.includes('name="'+field+'"'));
 assert.ok(!html.includes('name="condition_delta"'));assert.ok(!html.includes('data-action-stat'));assert.ok(html.includes('보존'));
 const d=validateAction({...actionDraft(),rules:[rule]});
 assert.equal('condition_delta' in d.rules[0],false);assert.equal('stats' in d.rules[0],false);
 const snapshot={...choices,command:{id:'1',...actionDraft().command},rules:[rule]};
 assert.equal('stats' in actionDefinition(snapshot).rules[0],false);
 const switched={...rule,rule_type:'effect'};
 assert.doesNotThrow(()=>actionChanges(snapshot,validateAction({...actionDraft(),rules:[switched]})));
 assert.ok(renderActionRule(switched,0,choices).includes('data-action-stat'));
});
test('dice fields are hidden only when dice is disabled',()=>{
 const data={...choices,command:{id:null,...actionDraft().command},rules:[]};
 assert.match(renderActionEditor(data),/class="character-fields action-dice-fields" hidden/);
 data.command.dice_enabled=true;
 assert.doesNotMatch(renderActionEditor(data),/class="character-fields action-dice-fields" hidden/);
});
test('isolated SQL: stat definitions and safe preservation of legacy effects',async t=>{
 if(!process.env.PGLITE_MODULE){t.skip('Set PGLITE_MODULE');return;}
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('./fixtures/character-schema.sql',import.meta.url),'utf8'));
  for(const file of ['character-admin.sql','skill-admin.sql','action-admin.sql','stat-admin.sql'])await db.exec(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
  const admin='11111111-1111-1111-1111-111111111111';
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
  const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
  const saveStat=(id,revision,d,paused=true)=>call('select admin_save_stat($1,$2,$3,$4) as result',[id,revision,JSON.stringify(d),paused]);
  const saveSkill=(id,revision,d)=>call('select admin_save_skill($1,$2,$3,true) as result',[id,revision,JSON.stringify(d)]);
  const saveAction=(id,revision,d)=>call('select admin_save_action($1,$2,$3,true) as result',[id,revision,JSON.stringify(d)]);
  const owner=async fn=>{await db.exec('reset role');try{return await fn();}finally{await db.exec('set role authenticated');}};
  let created;
  await t.test('new stat persists exact fields with database ID and appears in all target lists',async()=>{
   const before=await owner(()=>db.query('select * from character_stats order by id'));
   created=await saveStat(null,null,statDraft());assert.match(created.stat.id,/^\d+$/);
   assert.deepEqual(statDefinition(created),statDraft());
   const list=await call("select admin_list_stats('boss',true,0) as result");assert.equal(list.total,1);assert.deepEqual(list.items[0],created.stat);
   const character=await call('select admin_get_character(1) as result');assert.ok(character.stats.some(x=>x.stat_id===created.stat.id&&x.value===null));
   for(const rpc of ['admin_skill_editor','admin_action_editor']){
    const data=await call('select '+rpc+'(null) as result');assert.ok(data.stats.some(x=>x.id===created.stat.id&&x.name==='상사평판'));
   }
   const after=await owner(()=>db.query('select * from character_stats order by id'));assert.deepEqual(after.rows,before.rows);
  });
  await t.test('edit keeps stat ID and key; does not overwrite character_stats; stale writes rejected',async()=>{
   const before=await owner(()=>db.query('select * from character_stats order by id'));
   const d={...statDraft(),display_name:'평판 수정',default_value:9,enabled:false};
   const changed=await saveStat(created.stat.id,created.revision,d);assert.equal(changed.stat.id,created.stat.id);
   await assert.rejects(saveStat(created.stat.id,created.revision,d),/STAT_CONFLICT/);
   await assert.rejects(saveStat(changed.stat.id,changed.revision,{...d,stat_key:'other'}),/STAT_KEY_READONLY/);
   const after=await owner(()=>db.query('select * from character_stats order by id'));assert.deepEqual(after.rows,before.rows);
  });
  await t.test('stat duplicate, invalid numbers, unknown fields and lack of pause rejected',async()=>{
   await assert.rejects(saveStat(null,null,statDraft()),/STAT_KEY_EXISTS/);
   await assert.rejects(saveStat(null,null,{...statDraft(),stat_key:'bad',default_value:1.5}),/INVALID_INTEGER/);
   await assert.rejects(saveStat(null,null,{...statDraft(),stat_key:'bad',character_stats:[]}),/FIELD_NOT_ALLOWED/);
   await assert.rejects(saveStat(null,null,{...statDraft(),stat_key:'bad'},false),/BOT_PAUSE_REQUIRED/);
   const list=await call("select admin_list_stats('bad',null,0) as result");assert.equal(list.total,0);
  });
  await t.test('existing DB stat trigger runs once without a second frontend/backfill insert',async()=>{
   // Test fixture only: proves the RPC respects a pre-existing trigger; not a claim about production.
   await owner(()=>db.exec(`create function test_existing_stat_trigger() returns trigger language plpgsql as $$
     begin insert into character_stats(character_id,stat_id,value) select id,new.id,new.default_value from characters where active;return new;end $$;
     create trigger test_existing_stat_trigger after insert on stat_definitions for each row execute function test_existing_stat_trigger();`));
   const row=await saveStat(null,null,{...statDraft(),stat_key:'trigger_test'});
   const values=await owner(()=>db.query('select character_id,value from character_stats where stat_id=$1 order by character_id',[row.stat.id]));
   assert.equal(values.rows.length,2);assert.ok(values.rows.every(x=>x.value===-2));
   await owner(()=>db.exec('drop trigger test_existing_stat_trigger on stat_definitions;drop function test_existing_stat_trigger()'));
  });
  await t.test('money modifier rows, params and usage survive shared skill edits exactly',async()=>{
   await owner(async()=>{
    for(const type of MONEY_EFFECTS)await db.query("insert into skill_modifiers(skill_id,modifier_type,value,params,period,max_uses) values(1,$1,77,'{\"legacy\":true}','day',1)",[type]);
   });
   const read=()=>call('select admin_skill_editor(1) as result');const data=await read();
   const protectedRows=data.modifiers.filter(x=>MONEY_EFFECTS.includes(x.modifier_type));
   const original=await owner(()=>db.query("select to_jsonb(m) as row from skill_modifiers m where modifier_type like '%money%' order by id"));
   const d=skillDefinition(data);d.name='공유 스킬 이름 변경';
   const saved=await saveSkill('1',data.revision,d);assert.equal(saved.modifiers.filter(x=>MONEY_EFFECTS.includes(x.modifier_type)).length,4);
   const after=await owner(()=>db.query("select to_jsonb(m) as row from skill_modifiers m where modifier_type like '%money%' order by id"));assert.deepEqual(after.rows,original.rows);
   const attack=skillDefinition(saved);attack.modifiers.push({...protectedRows[0],modifier_type:'condition_delta_bonus'});delete attack.modifiers.at(-1).params;
   await assert.rejects(saveSkill('1',saved.revision,attack),/PROTECTED_MODIFIER/);
   for(const type of MONEY_EFFECTS){
    const bad=skillDefinition(saved);bad.modifiers.push({...newModifier(),modifier_type:type});delete bad.modifiers.at(-1).params;
    await assert.rejects(saveSkill('1',saved.revision,bad),/INVALID_MODIFIER_TYPE/);
   }
  });
  await t.test('new requirement stores condition only, never creates a stat effect',async()=>{
   const d=validateAction({...actionDraft(),rules:[{...newActionRule(),rule_type:'requirement',condition_min:10,condition_delta:99,stats:[{id:null,stat_id:'1',delta:99}]}]});
   const data=await saveAction(null,null,d);assert.equal(data.rules[0].condition_delta,0);assert.deepEqual(data.rules[0].stats,[]);
   const bad=actionDefinition(data);bad.rules[0].stats=[];
   await assert.rejects(saveAction(data.command.id,data.revision,bad),/REQUIREMENT_EFFECTS_NOT_ALLOWED/);
  });
  await t.test('legacy requirement effect values are preserved, not silently removed or overwritten',async()=>{
   const list=await call("select admin_list_actions('/검증',null,0) as result");
   let data=await call('select admin_action_editor($1) as result',[list.items[0].id]);
   const rid=data.rules[0].id;
   await owner(async()=>{await db.query('update command_rules set condition_delta=77 where id=$1',[rid]);await db.query('insert into command_rule_stat_effects(rule_id,stat_id,delta) values($1,1,22)',[rid]);});
   data=await call('select admin_action_editor($1) as result',[data.command.id]);
   const d=actionDefinition(data);d.rules[0].condition_min=11;
   const saved=await saveAction(data.command.id,data.revision,d);
   assert.equal(saved.rules[0].condition_delta,77);assert.equal(saved.rules[0].stats[0].delta,22);assert.equal(saved.rules[0].stats[0].id,data.rules[0].stats[0].id);
   assert.equal(saved.rules[0].condition_min,11);
   assert.equal('stats' in actionDefinition(saved).rules[0],false);
  });
  await t.test('new stat RPCs enforce admin and anonymous restrictions',async()=>{
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",['22222222-2222-2222-2222-222222222222']);
   for(const sql of ['select admin_list_stats()','select admin_stat_editor(null)'])await assert.rejects(db.query(sql),/ADMIN_REQUIRED/);
   await assert.rejects(saveStat(null,null,{...statDraft(),stat_key:'forbidden'}),/ADMIN_REQUIRED/);
   await db.exec('reset role;set role anon');await assert.rejects(db.query('select admin_list_stats()'),/permission denied/);
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
  });
  await t.test('effect-to-requirement transition preserves effect rows and can safely restore them',async()=>{
   const d=actionDraft();d.command.command='/전환';
   d.rules=[{...newActionRule(),condition_delta:-3,stats:[{id:null,stat_id:'1',delta:2}]}];
   const first=await saveAction(null,null,d);
   const toRequirement=actionDefinition(first);toRequirement.rules[0].rule_type='requirement';
   const required=await saveAction(first.command.id,first.revision,validateAction(toRequirement));
   assert.equal(required.rules[0].condition_delta,-3);assert.deepEqual(required.rules[0].stats,first.rules[0].stats);
   const raw=structuredClone(required);raw.rules[0].rule_type='effect';
   const restored=await saveAction(first.command.id,required.revision,validateAction(actionDefinition(raw)));
   assert.deepEqual(restored.rules[0].stats,first.rules[0].stats);assert.equal(restored.rules[0].condition_delta,-3);
  });
  await t.test('trigger audit is read-only and inspects both directions and legacy requirement data',async()=>{
   const sql=await readFile(new URL('../sql/stat-trigger-audit.sql',import.meta.url),'utf8');
   assert.match(sql,/begin transaction read only/i);assert.match(sql,/pg_get_triggerdef/);assert.match(sql,/pg_get_functiondef/);
   await owner(async()=>{const results=await db.exec(sql);const audit=results.flatMap(x=>x.rows||[]).find(x=>x.audit_result)?.audit_result;
    assert.ok(audit);assert.ok(Array.isArray(audit.triggers));assert.equal(audit.requirements_with_ignored_effects.length,1);});
  });
 }finally{await db.close();}
});
