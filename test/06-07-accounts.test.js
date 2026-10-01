import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecord } from '../src/spine.js';
import { caseRecords } from '../src/load.js';
import { findPlaybook } from '../src/playbooks/index.js';
import { deps, run } from './helpers.js';

test('06 accounts: exclusions and headcount are hard rules, and the fit score becomes a fact', async () => {
  const { rows, d } = await run('06', (i) => ({ domain: `account${i}.test` }));
  assert.deepEqual(rows.map((r) => [r.values.fit, r.fired]), [
    [93, 'weighted_fit'], // clinic software
    [0, 'weighted_fit'], // consumer app
    [0, 'excluded'], // a competitor that scores perfectly on everything else
    [0, 'headcount_out_of_range'], // 12,000 people
  ]);
  assert.equal(d.store.factsFor({ domain: 'account0.test' }).account_fit, 93);
});

test('06 accounts: enrichment headcount and the exclusion list overrule the description', async () => {
  const d = deps();
  const [clinic] = caseRecords('06-account-icp-scoring');
  d.store.mergeFact('domain:big.test', { employees: 4000 });
  d.store.mergeFact('domain:rival.test', { competitor: true });
  assert.equal((await runRecord(findPlaybook('06'), { ...clinic, domain: 'big.test' }, d)).fired, 'headcount_out_of_range');
  const rival = await runRecord(findPlaybook('06'), { ...clinic, domain: 'rival.test' }, d);
  assert.deepEqual([rival.fired, rival.status], ['exclusion_list', 'filtered']);
});

test('07 hiring: the account-manager post is not a signal', async () => {
  assert.deepEqual((await run('07')).got, [
    'signal_strong | done | building_outbound',
    'no_signal | done | not_building_outbound',
    'signal_strong | done | building_outbound',
    'no_signal | done | not_building_outbound',
  ]);
});

test('06 then 07: a post from an account that scored as a poor fit is skipped for free', async () => {
  const d = deps();
  const consumerApp = caseRecords('06-account-icp-scoring')[1];
  await runRecord(findPlaybook('06'), { ...consumerApp, domain: 'pocketplant.test' }, d);
  const calls = d.jev.calls;
  const post = await runRecord(findPlaybook('07'), { ...caseRecords('07-hiring-signals')[0], domain: 'pocketplant.test' }, d);
  assert.deepEqual([post.fired, post.status, d.jev.calls], ['account_not_a_fit', 'filtered', calls]);
});
