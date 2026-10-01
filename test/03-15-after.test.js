import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecord } from '../src/spine.js';
import { caseRecords } from '../src/load.js';
import { findPlaybook } from '../src/playbooks/index.js';
import { deps, run } from './helpers.js';

test('03 replies: removal always wins, the referral address comes from code, opt-outs feed the suppression list', async () => {
  const { got, d, rows } = await run('03', (i) => ({ email: `sender${i}@example.com` }));
  assert.deepEqual(got, [
    'book_meeting | done | intent',
    'suppress | done | wants_removal',
    'extract_contact | done | intent',
    'retry_later | done | intent',
    'snooze | done | intent',
  ]);
  assert.equal(rows[2].values.contact, 'dana@example.com');
  assert.equal(d.store.factsFor({ email: 'sender1@example.com' }).suppressed, true);
  assert.equal(d.store.factsFor({ email: 'sender0@example.com' }).suppressed, undefined);
});

test('03 replies: a blunt unsubscribe is handled by regex and never reaches Jev', async () => {
  const d = deps();
  const blunt = await runRecord(findPlaybook('03'), { key: 'blunt', email: 'x@example.com', state: { our_email: 'Hi', reply: 'UNSUBSCRIBE' } }, d);
  assert.deepEqual([blunt.action, blunt.status, blunt.fired, d.jev.calls], ['suppress', 'filtered', 'regex_unsubscribe', 0]);
  assert.equal(d.store.factsFor({ email: 'x@example.com' }).suppressed, true);
});

test('03 replies: a customer asking to be removed goes to their owner, not silently onto the list', async () => {
  const d = deps();
  d.store.mergeFact('email:vip@example.com', { customer: true });
  const optOut = caseRecords('03-reply-classification')[1];
  const row = await runRecord(findPlaybook('03'), { ...optOut, email: 'vip@example.com' }, d);
  assert.deepEqual([row.action, row.status], ['stop_and_alert_owner', 'needs_person']);
  assert.equal(d.store.factsFor({ email: 'vip@example.com' }).suppressed, undefined);
});

test('15 follow-ups: stop is always honoured, unsure goes to a person, the touch cap overrules a bump', async () => {
  const { got } = await run('15');
  assert.deepEqual(got, [
    'send:bump | done | next_step',
    'human | needs_person | low_confidence',
    'human | needs_person | answer_manually',
    'human | needs_person | low_confidence',
    'stop | done | stop',
  ]);
  const capped = await runRecord(findPlaybook('15'), { ...caseRecords('15-pick-the-follow-up')[0], touches: 4 }, deps());
  assert.deepEqual([capped.action, capped.fired], ['stop', 'max_touches']);
});

test('03 then 15: someone playbook 03 suppressed never gets a follow-up', async () => {
  const d = deps();
  const optOut = caseRecords('03-reply-classification')[1];
  await runRecord(findPlaybook('03'), { ...optOut, email: 'gone@example.com' }, d);
  const followUp = await runRecord(findPlaybook('15'), { ...caseRecords('15-pick-the-follow-up')[0], email: 'gone@example.com' }, d);
  assert.deepEqual([followUp.action, followUp.fired, followUp.status], ['skip', 'suppressed', 'filtered']);
});
