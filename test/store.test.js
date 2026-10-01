import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';

test('answers round-trip by fingerprint', () => {
  const store = openStore(':memory:');
  assert.equal(store.getAnswers('abc'), null);
  store.saveAnswers('abc', { model: 'jev-1.13.0', answers: { q: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 600 } });
  assert.deepEqual(store.getAnswers('abc'), { q: { type: 'noul', noul: 0.9 } });
});

test('facts merge company then person, and keys ignore case', () => {
  const store = openStore(':memory:');
  assert.deepEqual(store.factsFor({ email: 'ada@acme.test', domain: 'acme.test' }), {});
  store.mergeFact('domain:ACME.test', { customer: true, employees: 90 });
  store.mergeFact('email:ada@acme.test', { suppressed: true });
  store.mergeFact('domain:acme.test', { employees: 95 });
  assert.deepEqual(store.factsFor({ email: 'Ada@Acme.test', domain: 'acme.test' }), { customer: true, employees: 95, suppressed: true });
  assert.deepEqual(store.factsFor({ key: 'no email or domain' }), {});
});

test('ledger records a row, an override, and the override rate', () => {
  const store = openStore(':memory:');
  const row = { playbook: 'r', record_key: 'k', input: { key: 'k' }, facts: {}, fired: 'route', action: 'nurture', status: 'done' };
  const id = store.log(row);
  store.log({ ...row, record_key: 'k2' });
  store.log({ ...row, record_key: 'k3', status: 'filtered', fired: 'test_string', action: 'discard' });
  assert.equal(store.ledger({ playbook: 'r' }).length, 3);
  assert.equal(store.ledger({ status: 'filtered' })[0].record_key, 'k3');
  store.override(id, 'ae_now', 'they called us');
  assert.throws(() => store.override(999, 'x'), /No ledger row/);
  assert.deepEqual(store.overrideRates(), [{ playbook: 'r', decided: 2, overridden: 1, rate: 0.5 }]);
});
