import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDraft, literalProblems } from '../src/guard.js';
import { loadRequest, replayJev } from '../src/load.js';

const jev = replayJev();
const ask = async (questions, state) => (await jev({ state, questions })).answers;
const source = loadRequest('08-personalization-fact-check').cases[0].state.source;
const personal = loadRequest('08-personalization-fact-check').cases[3].state.source;
const prospect = loadRequest('09-first-message-scoring').cases[0].state.prospect;

test('literal checks cost nothing', () => {
  assert.deepEqual(literalProblems('Hi {first_name}, quick question.'), ['unfilled placeholder']);
  assert.deepEqual(literalProblems('x'.repeat(601)), ['longer than 600 characters']);
  assert.deepEqual(literalProblems('Congrats on the Austin office.'), []);
});

test('a supported line passes', async () => {
  assert.deepEqual(await checkDraft('Congrats on opening the new Austin office.', { source }, ask), { ok: true, needsPerson: false, problems: [] });
});

test('a contradicted line is sent back for a rewrite, naming the line', async () => {
  const g = await checkDraft('Congrats on the new Denver office.', { source }, ask);
  assert.equal(g.ok, false);
  assert.equal(g.needsPerson, false);
  assert.deepEqual(g.problems, ['wrong_fact: "Congrats on the new Denver office."']);
});

test('an invented detail goes to a person, not to a rewrite', async () => {
  const g = await checkDraft('Congrats on closing your Series B last month.', { source }, ask);
  assert.deepEqual([g.ok, g.needsPerson], [false, true]);
});

test('true but personal is rewritten', async () => {
  const g = await checkDraft("Hope your daughter's recovery from surgery is going well.", { source: personal }, ask);
  assert.match(g.problems[0], /^too_personal/);
});

test('a question is not fact-checked', async () => {
  const before = jev.calls;
  assert.equal((await checkDraft('Are the new reps building their own pipeline?', { source }, ask)).ok, true);
  assert.equal(jev.calls, before);
});

test('a message to a prospect is also scored by playbook 09', async () => {
  const message = loadRequest('09-first-message-scoring').cases[3].state.message; // specific but rambling, no ask
  const stub = async (questions, state) => (state.first_line
    ? { supported: { choice: 'supported', confidence: 1 }, sounds_creepy: { noul: 0 } }
    : ask(questions, state));
  const g = await checkDraft(message, { source, prospect }, stub);
  assert.deepEqual(g.problems, ['reads like a template', 'end with one easy question']);
});
