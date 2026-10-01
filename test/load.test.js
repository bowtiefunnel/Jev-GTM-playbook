import test from 'node:test';
import assert from 'node:assert/strict';
import { caseRecords, loadRequest, replayJev } from '../src/load.js';

test('a request file gives questions and cases; cases become records', () => {
  assert.deepEqual(Object.keys(loadRequest('04-inbound-lead-routing').questions), ['route', 'urgency', 'is_vendor_pitch']);
  const records = caseRecords('04-inbound-lead-routing');
  assert.equal(records.length, 4);
  assert.deepEqual(Object.keys(records[0]), ['key', 'state']);
  assert.equal(records[0].key, 'Qualified and urgent');
});

test('replay returns the saved Jev answer for a state, counts calls, and refuses to invent one', async () => {
  const jev = replayJev();
  const [urgent] = caseRecords('04-inbound-lead-routing');
  const res = await jev({ state: urgent.state });
  assert.equal(res.model, 'jev-1.13.0');
  assert.equal(res.answers.urgency.score, 2.97);
  assert.equal(jev.calls, 1);
  await assert.rejects(jev({ state: { never: 'seen' } }), /No saved Jev answer/);
});
