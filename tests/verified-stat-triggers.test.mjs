import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {statDefinition} from '../js/stat-admin-model.js';
globalThis.window={addEventListener(){}};
const {renderStatEditor}=await import('../js/pages/stats-admin.js');
delete globalThis.window;

test('verified production trigger definitions and admin stat RPC integration',async t=>{
 if(!process.env.PGLITE_MODULE){t.skip('Set PGLITE_MODULE');return;}
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
 const db=new PGlite();
 try {
  await db.exec(await readFile(new URL('./fixtures/character-schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('./fixtures/verified-stat-triggers.sql',import.meta.url),'utf8'));
  for(const name of ['character-admin.sql','stat-admin.sql'])await db.exec(await readFile(new URL('../sql/'+name,import.meta.url),'utf8'));
  await db.query("select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false)");
  const owner=async f=>{await db.exec('reset role');try{return await f();}finally{await db.exec('set role authenticated');}};
  const character=(id,active)=>owner(()=>db.query("insert into characters(id,commu_profile_id,name,active) values($1,'77777777-7777-7777-7777-777777777777','Fixture',$2)",[id,active]));
  const save=async(id,revision,data)=>(await db.query('select admin_save_stat($1,$2,$3,true) as data',[id,revision,JSON.stringify(data)])).rows[0].data;
  const draft=(key,enabled=true,value=6)=>({stat_key:key,display_name:key,description:'',default_value:value,enabled});
  const rowsFor=id=>owner(async()=>(await db.query('select stat_id::text as stat_id,value from character_stats where character_id=$1 order by stat_id',[id])).rows);
  await db.exec('set role authenticated');let enabledStat,disabledStat;
  await t.test('A: new characters receive enabled stats at default_value, even when character is inactive',async()=>{
   await owner(()=>db.exec("update stat_definitions set default_value=9 where id=1;insert into stat_definitions(id,stat_key,display_name,enabled,default_value) values(4000,'disabled_fixture','disabled',false,7)"));
   await character(5001,true);await character(5002,false);
   const expected=[{stat_id:'1',value:9},{stat_id:'2',value:0},{stat_id:'3',value:0}];
   assert.deepEqual(await rowsFor(5001),expected);assert.deepEqual(await rowsFor(5002),expected);
  });
  await t.test('B: new enabled stat through admin RPC fills active characters only, with no duplicate writes',async()=>{
   enabledStat=await save(null,null,draft('enabled_fixture'));
   const rows=await owner(async()=>(await db.query('select character_id::text as character_id,value from character_stats where stat_id=$1 order by character_id',[enabledStat.stat.id])).rows);
   assert.deepEqual(rows,[{character_id:'1',value:6},{character_id:'2',value:6},{character_id:'5001',value:6}]);
   const original=(await rowsFor(1)).find(x=>x.stat_id==='1');assert.equal(original.value,12);
  });
  await t.test('disabled stat insert and later enabling do not initialize existing characters',async()=>{
   disabledStat=await save(null,null,draft('late_enabled',false,8));
   const count=()=>owner(async()=>(await db.query('select count(*)::integer as n from character_stats where stat_id=$1',[disabledStat.stat.id])).rows[0].n);
   assert.equal(await count(),0);
   disabledStat=await save(disabledStat.stat.id,disabledStat.revision,{...statDefinition(disabledStat),enabled:true});
   assert.equal(await count(),0);
  });
  await t.test('reactivating a character does not backfill the stat missed while inactive',async()=>{
   const before=await rowsFor(5002);assert.ok(!before.some(x=>x.stat_id===enabledStat.stat.id));
   await owner(()=>db.query('update characters set active=true where id=5002'));
   assert.deepEqual(await rowsFor(5002),before);
  });
  await t.test('changing default_value leaves existing values unchanged and affects future characters',async()=>{
   enabledStat=await save(enabledStat.stat.id,enabledStat.revision,{...statDefinition(enabledStat),default_value:11});
   assert.equal((await rowsFor(5001)).find(x=>x.stat_id===enabledStat.stat.id).value,6);
   await character(5003,true);
   assert.equal((await rowsFor(5003)).find(x=>x.stat_id===enabledStat.stat.id).value,11);
   assert.equal((await rowsFor(5003)).find(x=>x.stat_id===disabledStat.stat.id).value,8);
  });
  await t.test('ON CONFLICT preserves existing values when initialization is replayed in the test fixture',async()=>{
   await owner(()=>db.exec("update character_stats set value=99 where character_id=5003 and stat_id=1;create trigger test_replay_initialization after update of name on characters for each row execute function initialize_character_stats()"));
   const before=await rowsFor(5003);
   await owner(()=>db.query("update characters set name='Replay' where id=5003"));
   assert.deepEqual(await rowsFor(5003),before);
  });
 } finally {await db.close();}
});
test('stat UI reports verified creation rules and the activation/backfill caveat',()=>{
 const html=renderStatEditor({stat:{id:null,stat_key:'',display_name:'',description:'',default_value:0,enabled:true}});
 assert.ok(html.includes('확인된 DB 자동 생성'));
 assert.ok(html.includes('누락 수치가 자동 보충되지 않습니다'));
 assert.ok(!html.includes('아직 확인되지'));
});
