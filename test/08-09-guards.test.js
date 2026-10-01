import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './helpers.js';

test('08 fact-check replays on its own', async () => {
  assert.deepEqual((await run('08')).got, [
    'send | done | supported',
    'human_review | needs_person | unsupported_or_unsure',
    'rewrite | done | wrong_fact',
    'rewrite | done | too_personal',
  ]);
});

test('09 message score replays on its own, with the unfilled placeholder caught by code', async () => {
  const { got, d } = await run('09');
  assert.deepEqual(got, [
    'rewrite | filtered | unfilled placeholder',
    'send | done | no_problems',
    'rewrite | done | make it about them; reads like a template',
    'rewrite | done | reads like a template; end with one easy question',
  ]);
  assert.equal(d.jev.calls, 3);
});
