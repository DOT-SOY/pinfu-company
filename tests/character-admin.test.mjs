import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { characterId, integerInput, editChanges, changeSummary, modifierSummary, usageSummary } from '../js/character-admin-model.js';
import { createCharacterApi } from '../js/characters.js';

globalThis.window = { addEventListener() {} };
const { renderCharacterDetail } = await import('../js/pages/characters-admin.js');
delete globalThis.window;
const baseSnapshot = {
  character: { id: '1', name: '테스트', commu_profile_id: 'readonly-id', condition: 72, base_daily_actions: 5, active: true },
  stats: [{ stat_id: '1', display_name: '업무성과', value: 12 }, { stat_id: '2', display_name: '근태', value: -2 }],
  revision: 'revision', daily: { used: 3, maximum: 6, remaining: 3 }, as_of: '2026-08-30T00:00:00Z', skills: []
};

test('edit payload only contains changed whitelisted fields and dynamic stats', () => {
  const result = editChanges(baseSnapshot, { name: '테스트', condition: '80', base_daily_actions: '6', active: true, money: 1234 },
    { 1: '15', 2: '0' });
  assert.deepEqual(result, { condition: 80, base_daily_actions: 6, stats: [{ stat_id: '1', value: 15 }, { stat_id: '2', value: 0 }] });
  assert.deepEqual(changeSummary(baseSnapshot, result).map(row => row.label), ['컨디션','기본 일일 행동횟수','업무성과','근태']);
  assert.equal('money' in result, false);
  assert.equal('commu_profile_id' in result, false);
});
test('no-op edit has no writes; negative stats allowed; missing stat only inserts with explicit value', () => {
  const values = { ...baseSnapshot.character };
  assert.deepEqual(editChanges(baseSnapshot, values, { 1: '12', 2: '-2' }), {});
  const data = structuredClone(baseSnapshot);
  data.stats.push({ stat_id: '99', display_name: '새 스탯', value: null });
  assert.deepEqual(editChanges(data, values, { 1: '12', 2: '-2', 99: '' }), {});
  assert.deepEqual(editChanges(data, values, { 1: '12', 2: '-2', 99: '-3' }), { stats: [{ stat_id: '99', value: -3 }] });
});
test('invalid integers and unsafe IDs rejected without floating-point bigint corruption', () => {
  for (const value of ['', '1.5', 'NaN', '1e3', '2147483648']) assert.throws(() => integerInput(value));
  assert.throws(() => integerInput('-1', 0));
  assert.equal(integerInput('-2'), -2);
  assert.equal(characterId('9007199254740993'), '9007199254740993');
  assert.throws(() => characterId('9223372036854775808'));
});
test('skill summaries use modifier-level restrictions and correct target', () => {
  assert.match(modifierSummary({ modifier_type: 'condition_cost_multiplier', value: .8, target_command_id: '1', target_command: '/청소' }), /청소.*×0.8/);
  assert.equal(usageSummary({ period: 'day', max_uses: 1, used: 1 }), '오늘 1 / 1회 사용');
  assert.equal(usageSummary({ period: 'week', max_uses: 1, used: 0 }), '이번 주 0 / 1회 사용');
  assert.equal(usageSummary({ period: null, max_uses: 2, used: 1 }), '누적 1 / 2회 사용');
  assert.equal(usageSummary({ max_uses: null }), '횟수 제한 없음');
});
test('detail is dynamic, escaped, readonly daily counts, no excluded fields', () => {
  const data = structuredClone(baseSnapshot);
  data.character.name = '<script>bad()</script>';
  data.stats.push({ stat_id: '3', display_name: '<img src=x onerror=bad()>', value: 0 });
  const html = renderCharacterDetail(data);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('name="money"'));
  assert.ok(!html.includes('보유 금액'));
  assert.ok(!html.includes('action_logs'));
  assert.ok(!html.includes('name="remaining"'));
  assert.ok(html.includes('data-stat-id="3"'));
  assert.ok(!html.includes('name="commu_profile_id"'));
});
test('API refuses non-admin before requesting and uses shared-table RPCs', async () => {
  const calls = [];
  const api = createCharacterApi(() => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: {} }; } }), () => ({ isAdmin: true }));
  await api.save('9007199254740993', 'rev', { condition: 80 }, true);
  assert.equal(calls[0].name, 'admin_save_character');
  assert.equal(calls[0].args.p_character_id, '9007199254740993');
  await api.setSkill('1', '2', false, true);
  assert.equal(calls[1].args.p_active, false);
  const denied = createCharacterApi(() => { throw new Error('must not request'); }, () => ({ isAdmin: false }));
  await assert.rejects(denied.detail('1'), /ADMIN_REQUIRED/);
});

// Pass an installed @electric-sql/pglite/dist/index.js path as PGLITE_MODULE.
// Database is entirely local and in-memory. No Supabase credentials are used.
test('PostgreSQL integration: authorization, counts, saves, conflicts and skill relationships', async t => {
  if (!process.env.PGLITE_MODULE) { t.skip('Set PGLITE_MODULE to run isolated PostgreSQL integration'); return; }
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('./fixtures/character-schema.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../sql/character-admin.sql', import.meta.url), 'utf8'));
    const call = async (sql, values = []) => (await db.query(sql, values)).rows[0]?.result;
    const admin = '11111111-1111-1111-1111-111111111111';
    const normal = '22222222-2222-2222-2222-222222222222';
    const setUser = async id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await setUser(admin);
    await db.exec('set role authenticated');

    await t.test('list supports name and active filters; data contract never returns money', async () => {
      const list = await call('select public.admin_list_characters($1,$2,0,25) as result', ['철', true]);
      assert.equal(list.total, 1); assert.equal(list.items[0].name, '김철수');
      const detail = await call('select public.admin_get_character(1) as result');
      assert.equal(detail.character.condition, 72);
      assert.equal(detail.character.money, undefined);
      assert.equal(detail.action_logs, undefined);
      assert.equal(detail.stats.length, 3); // New definition with no value row is visible.
      assert.equal(detail.stats.find(row => row.stat_id === '3').value, null);
    });
    await t.test('Seoul day action count and available modifier bonuses match bot semantics', async () => {
      const detail = await call('select public.admin_get_character(1) as result');
      assert.equal(detail.daily.used, 3);
      assert.equal(detail.daily.maximum, 6); // 5 + active global +1; excludes targeted/disabled/exhausted bonuses.
      assert.equal(detail.daily.remaining, 3);
      const mods = detail.skills.flatMap(row => row.modifiers);
      assert.equal(mods.find(m => m.id === '2').used, 1);
      assert.equal(mods.find(m => m.id === '2').available, false);
      assert.equal(mods.find(m => m.id === '3').used, 0);
      assert.equal(detail.skills.find(s => s.id === '2').enabled, false);
    });
    await t.test('read-only display matches the actual Python skill_engine functions', async t => {
      if (!process.env.CORE_BOT_PYTHON || !process.env.CORE_BOT_DIR) {
        t.skip('Set CORE_BOT_PYTHON and CORE_BOT_DIR for cross-engine parity'); return;
      }
      const detail = await call('select public.admin_get_character(1) as result');
      const modifiers = detail.skills.filter(s => s.enabled).flatMap(s => s.modifiers.filter(m => m.enabled))
        .map(m => ({ ...m, params: {}, priority: 100 }));
      const source = [
        'import sys,json,os',
        'from datetime import datetime',
        'from unittest.mock import patch',
        "sys.path.insert(0,os.environ['CORE_BOT_DIR'])",
        'import skill_engine',
        'p=json.load(sys.stdin)',
        "now=datetime.fromisoformat(p['as_of'])",
        "counts={m['id']:m['used'] for m in p['modifiers']}",
        "with patch.object(skill_engine,'get_character_skill_modifiers',return_value=p['modifiers']), patch.object(skill_engine,'count_skill_modifier_usages',side_effect=lambda client,char,mid,start,end:counts[mid]):",
        " ctx=skill_engine.load_skill_context(object(),'1',None,now=now)",
        " maximum=skill_engine.calculate_daily_action_limit(p['base'],ctx,p['used'],mark_usage=False)",
        " print(json.dumps({'maximum':maximum,'remaining':max(0,maximum-p['used']),'day':skill_engine.period_bounds('day',now),'available':[m['id'] for m in ctx['modifiers']],'triggered':ctx['triggered']}))"
      ].join('\n');
      const output = spawnSync(process.env.CORE_BOT_PYTHON, ['-c', source], {
        input: JSON.stringify({ as_of: detail.as_of, modifiers, base: detail.character.base_daily_actions, used: detail.daily.used }),
        encoding: 'utf8'
      });
      assert.equal(output.status, 0, output.stderr);
      const python = JSON.parse(output.stdout);
      assert.equal(detail.daily.maximum, python.maximum);
      assert.equal(detail.daily.remaining, python.remaining);
      assert.equal(Date.parse(detail.daily.day_start), Date.parse(python.day[0]));
      assert.equal(Date.parse(detail.daily.day_end), Date.parse(python.day[1]));
      assert.deepEqual(modifiers.filter(m => !m.target_command_id && m.available).map(m => m.id).sort(), python.available.sort());
      assert.deepEqual(python.triggered, {});
    });
    await t.test('role spoofing cannot bypass server authorization; helper functions not public', async () => {
      await setUser(normal);
      for (const sql of [
        'select public.admin_list_characters()',
        'select public.admin_get_character(1)',
        "select public.admin_save_character(1,'x','{}',true)",
        'select public.admin_search_character_skills(1)',
        'select public.admin_set_character_skill(1,3,true,true)'
      ]) await assert.rejects(db.query(sql), /ADMIN_REQUIRED/);
      await assert.rejects(db.query('select public.pinfu_character_snapshot(1)'), /permission denied/);
      await setUser(admin);
    });
    await t.test('save updates exact existing tables atomically and detects stale edits', async () => {
      const before = await call('select public.admin_get_character(1) as result');
      await assert.rejects(db.query('select public.admin_save_character(1,$1,$2,false)', [before.revision, JSON.stringify({ condition: 80 })]), /BOT_PAUSE_REQUIRED/);
      const saved = await call('select public.admin_save_character(1,$1,$2,true) as result', [before.revision,
        JSON.stringify({ name: '새 이름', condition: 80, base_daily_actions: 6, active: false, stats: [{ stat_id: '1', value: 15 }, { stat_id: '2', value: 0 }, { stat_id: '3', value: -5 }] })]);
      assert.equal(saved.character.name, '새 이름'); assert.equal(saved.character.condition, 80);
      assert.equal(saved.character.active, false); assert.equal(saved.stats.find(s => s.stat_id === '3').value, -5);
      assert.equal(saved.daily.maximum, 7);
      await assert.rejects(db.query('select public.admin_save_character(1,$1,$2,true)', [before.revision, '{"condition":81}']), /CHARACTER_CONFLICT/);
      for (const change of [{ money: 0 }, { commu_profile_id: admin }, { condition: -1 }, { stats: [{ stat_id: '2', value: 1.5 }] }]) {
        await assert.rejects(db.query('select public.admin_save_character(1,$1,$2,true)', [saved.revision, JSON.stringify(change)]));
      }
      // An invalid later stat must roll back the earlier update as well.
      await assert.rejects(db.query('select public.admin_save_character(1,$1,$2,true)', [saved.revision, JSON.stringify({ stats: [{ stat_id: '1', value: 999 }, { stat_id: '999', value: 0 }] })]));
      const unchanged = await call('select public.admin_get_character(1) as result');
      assert.equal(unchanged.stats.find(s => s.stat_id === '1').value, 15);
    });
    await t.test('grant/revoke affects only relationship, does not reset usage or modify shared skill', async () => {
      const candidates = await call("select public.admin_search_character_skills(1,'') as result");
      assert.deepEqual(candidates.items.map(s => s.id), ['3']);
      await assert.rejects(db.query('select public.admin_set_character_skill(1,2,true,true)'), /SKILL_NOT_AVAILABLE/);
      await call('select public.admin_set_character_skill(1,3,true,true) as result');
      await assert.rejects(db.query('select public.admin_set_character_skill(1,3,true,true)'), /SKILL_ALREADY_OWNED/);
      await call('select public.admin_set_character_skill(1,1,false,true) as result');
      const other = await call('select public.admin_get_character(2) as result');
      assert.ok(other.skills.some(s => s.id === '1'));
      const regranted = await call('select public.admin_set_character_skill(1,1,true,true) as result');
      assert.equal(regranted.skills.flatMap(s => s.modifiers).find(m => m.id === '2').used, 1);
    });
    await db.exec('reset role');
    await t.test('existing money and usage history remain untouched', async () => {
      assert.equal((await db.query('select money::text as value from public.characters where id=1')).rows[0].value, '123456');
      assert.equal((await db.query('select count(*)::int as count from public.action_logs')).rows[0].count, 6);
      assert.equal((await db.query('select count(*)::int as count from public.skill_usages')).rows[0].count, 3);
      assert.equal((await db.query('select count(*)::int as count from public.character_skills where character_id=1 and skill_id=1')).rows[0].count, 1);
      assert.equal((await db.query('select name from public.skills where id=1')).rows[0].name, '요령');
    });
    await t.test('anon cannot execute any management RPC even if a subject is supplied', async () => {
      await setUser(admin);
      await db.exec('set role anon');
      await assert.rejects(db.query('select public.admin_get_character(1)'), /permission denied/);
      await db.exec('reset role');
    });
  } finally { await db.close(); }
});
