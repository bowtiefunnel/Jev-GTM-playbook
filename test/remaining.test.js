import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecord } from '../src/spine.js';
import { caseRecords } from '../src/load.js';
import { PLAYBOOKS, findPlaybook } from '../src/playbooks/index.js';
import { replyRateBy } from '../src/playbooks/10-learn-from-inbox.js';
import { deps, run } from './helpers.js';

test('all 14 playbooks are registered', () => {
  assert.deepEqual(Object.keys(PLAYBOOKS).map((id) => id.slice(0, 2)), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '14', '15']);
});

// The diagram, enforced: every playbook goes through the spine and ends in one of its four outcomes.
test('every playbook follows the diagram on every saved case', async () => {
  for (const playbook of Object.values(PLAYBOOKS)) {
    assert.equal(Boolean(playbook.write), playbook.shape === 'decision, then a draft', `${playbook.id}: step 3 must match its shape`);
    const { rows, d } = await run(playbook.id);
    for (const row of rows) {
      assert.ok(['filtered', 'done', 'needs_person', 'needs_approval'].includes(row.status), `${playbook.id}: ${row.status}`);
      assert.ok(row.action && row.fired, `${playbook.id}: every result names its action and the rule that decided`);
      assert.equal(row.status === 'filtered', !row.answers, `${playbook.id}: only step 0 decides without Jev`);
    }
    assert.equal(d.store.ledger({ playbook: playbook.id }).length, rows.length, `${playbook.id}: every record is in the ledger`);
  }
});

test('05 invitations: only confident buyers; target accounts, outgoing and empty are decided by code', async () => {
  assert.deepEqual((await run('05')).got, [
    'reply | done | potential_buyer',
    'ignore | done | intent_pitching_us',
    'ignore | done | intent_peer_or_community',
    'ignore | done | intent_unclear',
  ]);
  const playbook = findPlaybook('05');
  const [buyer] = caseRecords(playbook.id);
  const d = deps();
  d.store.mergeFact('domain:target.test', { target_account: true });
  assert.equal((await runRecord(playbook, { ...buyer, direction: 'OUTGOING' }, d)).fired, 'not_incoming');
  assert.equal((await runRecord(playbook, { key: 'empty', state: { ...buyer.state, invitation_message: ' ' } }, d)).fired, 'no_message');
  assert.equal((await runRecord(playbook, { ...buyer, domain: 'target.test' }, d)).fired, 'target_account');
  assert.equal(d.jev.calls, 0);
});

test('10 inbox: Jev describes, code counts, and a small sample reports nothing', async () => {
  const { rows } = await run('10');
  const labelled = rows.map((r, i) => ({ replied: i % 2 === 0, values: r.values })); // openers A and C got replies
  assert.deepEqual(replyRateBy(labelled, 'references_a_trigger', { minSample: 2 }),
    { trait: 'references_a_trigger', with: 1, without: 0, n_with: 2, n_without: 2 });
  assert.equal(replyRateBy(labelled, 'references_a_trigger').with, null, 'four openers are not evidence');
});

test('11 quiet conversations: dates and fit are code, and the vendor pitch is dropped by topic', async () => {
  const { got, rows } = await run('11', () => ({ days_quiet: 45, fit: 80 }));
  assert.deepEqual(got, [
    'revive | done | buying_interest',
    'ignore | done | topic_networking',
    'ignore | done | topic_pitch_to_me',
    'revive | done | buying_interest',
  ]);
  assert.deepEqual([rows[0].values.i_owe_the_reply, rows[3].values.i_owe_the_reply], [true, false]);
  const playbook = findPlaybook('11');
  const [cold] = caseRecords(playbook.id);
  const d = deps();
  assert.deepEqual([(await runRecord(playbook, { ...cold, days_quiet: 12 }, d)).fired, d.jev.calls], ['not_quiet_yet', 0]);
  assert.equal((await runRecord(playbook, { ...cold, days_quiet: 45, fit: 30 }, d)).fired, 'low_fit');
});

test('12 warm intros: a connection never messaged is ranked down whatever the title', async () => {
  const { rows } = await run('12');
  assert.deepEqual(rows.map((r) => [r.values.path, r.values.strength]),
    [['is_the_buyer', 2.94], ['same_team', 1.87], ['leads_the_buyer', 2.38], ['other_team', 0.67]]);
  const stranger = await runRecord(findPlaybook('12'), { ...caseRecords('12-warm-intro-finder')[0], message_count: 0 }, deps());
  assert.deepEqual([stranger.values.strength, stranger.fired], [1, 'never_messaged']);
});

test('14 social: job ads are free, vendors are ignored, and the unsure one goes to a person', async () => {
  const { got, d } = await run('14');
  assert.deepEqual(got, [
    'engage | done | buyer_with_a_problem',
    'ignore | done | self_promotion',
    'review | needs_person | low_confidence', // Jev said engage at 0.36; the cutoff is what catches it
    'ignore | filtered | job_ad',
  ]);
  assert.equal(d.jev.calls, 3);
});
