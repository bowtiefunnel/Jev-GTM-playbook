import test from 'node:test';
import assert from 'node:assert/strict';
import { openRouterWriter } from '../src/writer.js';

test('writer posts one user message and returns the trimmed text', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '  A short brief.\n' } }] }) };
  };
  const write = openRouterWriter({ apiKey: 'k', model: 'some/model', baseUrl: 'https://llm.test/v1', fetchImpl });
  assert.equal(await write('Write a brief.'), 'A short brief.');
  assert.deepEqual(seen, { url: 'https://llm.test/v1/chat/completions', auth: 'Bearer k',
    body: { model: 'some/model', messages: [{ role: 'user', content: 'Write a brief.' }] } });
});

test('writer surfaces a failed call instead of returning an empty draft', async () => {
  const fetchImpl = async () => ({ ok: false, status: 402, text: async () => 'out of credits' });
  await assert.rejects(openRouterWriter({ apiKey: 'k', model: 'm', baseUrl: 'https://llm.test/v1', fetchImpl })('x'), /Writer 402: out of credits/);
});
