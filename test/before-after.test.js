import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, armA, armB, armBPrompt, norm, parseAction, score } from '../src/before-after.js';
import { run } from './helpers.js';

// These leads are written for the tests. The labelled set is not read here, so no arm runs on it.
const lead = (role, company_size, message) => ({ state: { routing_policy: 'We sell to B2B companies with 10-500 employees.', lead: { role, company_size, message } } });
const a = (role, size, message, facts) => { const d = armA(lead(role, size, message), facts); return `${d.action} | ${d.why}`; };

test('arm A: facts and free filters decide before any keyword does', () => {
  assert.equal(a('VP Sales', '80', 'Need help this month.', { suppressed: true, customer: true }), 'skip | suppressed');
  assert.equal(a('qa', '1', 'qwerty test'), 'discard | test_string');
  assert.equal(a('x', '1', '?? !!'), 'discard | test_string');
  assert.equal(a('Winner', '1', 'Click here to collect your prize'), 'discard | spam_phrase');
  assert.equal(a('VP Sales', '80', 'Need help this month.', { customer: true }), 'route_to_csm | existing_customer');
  assert.equal(a('VP Sales', '80', 'Need help this month.', { competitor: true }), 'person | competitor');
  assert.equal(a('Manager', '80', 'Please remove us from your emails.'), 'person | opt_out_phrase');
  assert.equal(a('Student', '1', 'Research for my dissertation.'), 'discard | student');
});

test('arm A: pitches, company size, then role and timing', () => {
  assert.equal(a('Founder', '30', 'We offer payroll software. Free trial?'), 'partner_inbox | pitch_phrase');
  assert.equal(a('Talent Partner', '30', 'Two candidates for you.'), 'partner_inbox | pitch_phrase');
  assert.equal(a('CEO', '200', 'Need outbound next month.', { employees: 5 }), 'person | headcount_conflict');
  assert.equal(a('CEO', '4000', 'Need outbound next month.'), 'person | above_policy_size');
  assert.equal(a('CEO', '5', 'Need outbound next month.'), 'nurture | below_policy_size');
  assert.equal(a('CEO', '50', 'Just browsing, no rush.'), 'nurture | not_ready_phrase');
  assert.equal(a('Chief Revenue Officer', '50', 'We must be live by Q2 and have a deadline.'), 'ae_now | senior_and_urgent');
  assert.equal(a('Analyst', '50', 'We must start this month.'), 'sdr_qualify | default');
  assert.equal(a('CEO', '', 'Tell me more about pricing.'), 'sdr_qualify | default');
  // The word "test" inside a sentence is not a test string.
  assert.equal(a('VP Sales', '50', 'We want to test this with a pilot next month.'), 'ae_now | senior_and_urgent');
});

test('arm B: the prompt carries the policy, the facts and every allowed action; the reply is parsed', async () => {
  const record = lead('VP Sales', '80', 'Need help this month.');
  const prompt = armBPrompt(record, { employees: 6 });
  for (const part of [record.state.routing_policy, '"employees": 6', 'Need help this month.', ...Object.keys(ACTIONS)]) assert.ok(prompt.includes(part), part);
  let seen;
  const fake = async (p) => { seen = p; return 'PERSON\nEnrichment says 6 people, the form says 80.'; };
  assert.deepEqual(await armB(record, { employees: 6 }, fake), { action: 'person', why: 'Enrichment says 6 people, the form says 80.' });
  assert.equal(seen, prompt);
  assert.equal(parseAction('**ae_now**\nUrgent.').action, 'ae_now');
  assert.equal(parseAction('I would send this to sales.').action, 'invalid');
});

test('the sandwich\'s own words map onto the labels\' words', async () => {
  assert.deepEqual(['account_executive', 'partner_or_vendor', 'junk', 'sdr_review', 'human_review', 'nurture'].map(norm),
    ['ae_now', 'partner_inbox', 'discard', 'person', 'person', 'nurture']);
  // Replayed Jev, no key: the four saved leads end in label vocabulary.
  const { rows } = await run('04');
  assert.deepEqual(rows.map((r) => norm(r.action)), ['ae_now', 'partner_inbox', 'person', 'discard']);
});

test('scoring: correct, costly, sent to a person, changed between runs, median time, reasons', () => {
  const records = [
    { key: 'a', label: 'ae_now', costly: ['discard'] },
    { key: 'b', label: 'person', costly: ['ae_now'] },
    { key: 'c', label: 'nurture', costly: ['ae_now'] },
  ];
  const r = (...actions) => actions.map((action, i) => ({ action, why: 'rule', seconds: i + 1 }));
  const s = score(records, [r('ae_now', 'person', 'person'), r('discard', 'ae_now', 'nurture'), r('ae_now', 'person', 'nurture')]);
  assert.deepEqual(s.per_run, [
    { correct: 2, sent_to_person: 2, person_agreed: 1 },
    { correct: 1, sent_to_person: 0, person_agreed: 0 },
    { correct: 3, sent_to_person: 1, person_agreed: 1 },
  ]);
  assert.deepEqual(s.costly, [{ key: 'a', run: 2, action: 'discard', label: 'ae_now' }, { key: 'b', run: 2, action: 'ae_now', label: 'person' }]);
  assert.deepEqual(s.changed, ['a', 'b', 'c']);
  assert.equal(s.median_seconds, 2);
  assert.equal(s.names_reason, true);
  assert.equal(score(records, [r('ae_now', 'person', 'nurture').map((x) => ({ ...x, why: '' }))]).names_reason, false);
});
