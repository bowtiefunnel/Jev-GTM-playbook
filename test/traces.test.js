import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRequest, symbolicCases } from '../src/load.js';
import { tracePlaybook } from '../src/trace.js';
import { PLAYBOOKS } from '../src/playbooks/index.js';
import { renderDoc, renderIndex } from '../src/docs.js';

const saved = (id) => JSON.parse(readFileSync(new URL(`../playbooks-JEv/responses/${id}.json`, import.meta.url), 'utf8'));
const STEPS = ['0_filter_and_cache', '1_judge', '2_check', '3_write', '4_act'];

test('every request file is laid out as the five steps, and its cutoffs are numbers the code reads', () => {
  for (const id of Object.keys(PLAYBOOKS)) {
    const spec = loadRequest(id);
    assert.deepEqual(Object.keys(spec).slice(0, 13), ['playbook', 'title', 'about', 'shape', ...STEPS, 'cases', 'symbolic_cases', 'lessons', 'limits'], id);
    assert.deepEqual(STEPS.map((s) => spec[s]?.who ?? null), ['code', 'jev', 'code', spec['3_write'] ? 'llm' : null, 'code'], id);
    assert.equal(Boolean(spec['3_write']), spec.shape === 'decision, then a draft', id);
  }
});

test('every saved response is the trace the code produces today', async () => {
  for (const playbook of Object.values(PLAYBOOKS)) {
    assert.deepEqual(await tracePlaybook(playbook), saved(playbook.id), `${playbook.id}: run "node src/trace.js --write" after changing a rule or a cutoff`);
  }
});

test('every symbolic case ends in the action its request file expects', () => {
  for (const id of Object.keys(PLAYBOOKS)) {
    for (const c of symbolicCases(id)) assert.equal(saved(id)[c.record.key]['4_act'].action, c.expect, `${id} / ${c.record.key}`);
  }
});

test('the Jev answers inside the traces are the real saved ones, untouched', () => {
  const res = saved('04-inbound-lead-routing')['Qualified and urgent']['1_judge'].response;
  assert.deepEqual([res.model, res.answers.route.confidence, res.answers.urgency.score, res.answers.is_vendor_pitch.noul, res.ms], ['jev-1.13.0', 1, 2.97, 0.03, 194]);
});

test('moving a cutoff in the request file changes the decision with no new Jev call', async () => {
  const { default: inbound } = await import('../src/playbooks/04-inbound-lead-routing.js');
  const answers = saved(inbound.id)['Agency pitching us']['1_judge'].response.answers; // vendor pitch 0.93, route 0.63
  const record = { state: loadRequest(inbound.id).cases[1].state };
  assert.equal(inbound.check(answers, {}, record).action, 'partner_inbox');
  const cutoffs = loadRequest(inbound.id).cutoffs;
  assert.equal(cutoffs.is_vendor_pitch, 0.85);
  assert.ok(answers.is_vendor_pitch.noul >= cutoffs.is_vendor_pitch && answers.route.confidence < cutoffs.route_confidence);
});

test('every playbook page is what the request file and the traces produce today', () => {
  const page = (name) => readFileSync(new URL(`../playbooks-JEv/${name}`, import.meta.url), 'utf8');
  const hint = 'run "node src/docs.js --write"';
  assert.equal(page('README.md'), renderIndex(), hint);
  for (const id of Object.keys(PLAYBOOKS)) assert.equal(page(`${id}.md`), renderDoc(id), `${id}: ${hint}`);
});

test('the example records and facts run through playbook 04 as the README says', async () => {
  const { runAll } = await import('../src/spine.js');
  const { openStore } = await import('../src/store.js');
  const { replayJev } = await import('../src/load.js');
  const read = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8'));
  const store = openStore(':memory:');
  for (const [key, data] of Object.entries(read('facts.example.json'))) store.mergeFact(key, data);
  const rows = await runAll(PLAYBOOKS['04-inbound-lead-routing'], read('inbound.records.json'), { store, jev: replayJev(), model: 'replay' });
  assert.deepEqual(rows.map((r) => r.action), ['ae_now', 'partner_inbox', 'route_to_csm', 'discard']);
});
