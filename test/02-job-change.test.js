import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecord } from '../src/spine.js';
import { openStore } from '../src/store.js';
import { caseRecords } from '../src/load.js';
import { findPlaybook } from '../src/playbooks/index.js';
import { cleanGuard, deps, run } from './helpers.js';

const playbook = findPlaybook('02');
const [promoted] = caseRecords(playbook.id);

test('02 job change: reworded titles and non-buying roles are ignored', async () => {
  assert.deepEqual((await run('02')).got, [
    'reach_out | needs_person | current_role_buys', // no writer in this run, so a person writes
    'ignore | done | same_job_reworded',
    'reach_out | needs_person | current_role_buys',
    'ignore | done | role_does_not_buy', // senior, but engineering does not buy this
  ]);
});

test('02 job change: the outreach is drafted from checked values and scored as a message', async () => {
  const prompts = [];
  const writer = async (p) => { prompts.push(p); return 'Congrats on the move to VP of Sales at Brightloop. What are you changing first?'; };
  const row = await runRecord(playbook, promoted, { store: openStore(':memory:'), jev: cleanGuard(), model: 'replay', writer });
  assert.equal(row.status, 'needs_approval');
  assert.deepEqual(row.values, { previous_role: 'Sales Manager', new_role: 'VP of Sales', company: 'Brightloop', change: 'moved_up', just_gained_budget: true });
  assert.match(prompts[0], /"new_role": "VP of Sales"/);
});

test('02 job change: an account with an open opportunity goes to its owner, and an unchanged title costs nothing', async () => {
  const d = deps();
  d.store.mergeFact('domain:brightloop.test', { open_opportunity: true });
  const owned = await runRecord(playbook, { ...promoted, domain: 'brightloop.test' }, d);
  assert.deepEqual([owned.action, owned.fired], ['route_to_owner', 'existing_account']);

  const calls = d.jev.calls;
  const same = { key: 'same', state: { ...promoted.state, current: { position: ' sales  manager ', company: 'Brightloop' } } };
  assert.deepEqual([(await runRecord(playbook, same, d)).fired, d.jev.calls], ['no_change', calls]);
});
