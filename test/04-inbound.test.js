import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runRecord } from '../src/spine.js';
import { openStore } from '../src/store.js';
import { caseRecords } from '../src/load.js';
import { PLAYBOOKS, findPlaybook } from '../src/playbooks/index.js';
import { cleanGuard, deps, run } from './helpers.js';

const playbook = findPlaybook('04');
const [urgent] = caseRecords(playbook.id);

test('every registered playbook has an id, a shape, questions and a check', () => {
  for (const r of Object.values(PLAYBOOKS)) {
    assert.ok(['decision only', 'decision, then a draft', 'guard on a draft'].includes(r.shape), r.id);
    assert.ok(Object.keys(r.questions).length > 0 && typeof r.check === 'function', r.id);
  }
  assert.equal(playbook.id, '04-inbound-lead-routing');
  assert.throws(() => findPlaybook('99'), /Unknown playbook/);
});

test('04 inbound: the four saved leads, with the junk one caught before Jev', async () => {
  const { got, d } = await run('04');
  assert.deepEqual(got, [
    'ae_now | needs_person | ae_and_urgent', // no writer in this run, so a person writes the brief
    'partner_inbox | done | is_vendor_pitch', // route was only 0.63 sure; the second question was 0.93
    'sdr_review | needs_person | low_confidence',
    'discard | filtered | test_string',
  ]);
  assert.equal(d.jev.calls, 3, '"test test" never reached Jev');
});

test('04 inbound: the brief is written from checked values and waits for approval', async () => {
  const writer = async () => 'A VP Sales at a 120-person company. They need help now.';
  const briefed = await runRecord(playbook, urgent, { store: openStore(':memory:'), jev: cleanGuard(), model: 'replay', writer });
  assert.deepEqual([briefed.action, briefed.status], ['ae_now', 'needs_approval']);
  assert.deepEqual(briefed.values, { role: 'VP Sales', employees: 120, urgency: 'Needs something now, with a deadline or a pain happening today' });
});

test('04 inbound: hard data overrules Jev, and customers skip sales', async () => {
  const d = deps();
  d.store.mergeFact('domain:tiny.test', { employees: 6 });
  d.store.mergeFact('domain:client.test', { customer: true });
  const tiny = await runRecord(playbook, { ...urgent, domain: 'tiny.test' }, d);
  assert.deepEqual([tiny.action, tiny.fired, tiny.status], ['sdr_review', 'headcount_below_minimum', 'needs_person']);
  const client = await runRecord(playbook, { ...urgent, domain: 'client.test' }, d);
  assert.deepEqual([client.action, client.status], ['route_to_csm', 'filtered']);
});

test('cli replay runs with no key and prints the worked example from the diagram', () => {
  const out = execFileSync(process.execPath, ['src/cli.js', 'replay', '04'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(out, /Qualified and urgent\s+ae_now\s+needs_person\s+ae_and_urgent/);
  assert.match(out, /4 saved Jev answers replayed/);
});
