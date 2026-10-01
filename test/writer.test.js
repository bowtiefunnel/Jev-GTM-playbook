import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeWriter } from '../src/writer.js';

const opts = (fetchImpl) => ({ apiKey: 'k', model: 'claude-test', baseUrl: 'https://llm.test', fetchImpl });

test('writer posts one user message to Claude and returns the trimmed text', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, key: init.headers['x-api-key'], version: init.headers['anthropic-version'], body: JSON.parse(init.body) };
    // Thinking blocks come first on current models; only the text is the draft.
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '  A short brief.\n' }] }) };
  };
  assert.equal(await claudeWriter(opts(fetchImpl))('Write a brief.'), 'A short brief.');
  assert.deepEqual(seen, { url: 'https://llm.test/v1/messages', key: 'k', version: '2023-06-01',
    body: { model: 'claude-test', max_tokens: 16000, messages: [{ role: 'user', content: 'Write a brief.' }] } });
});

test('writer surfaces a failed call or a refusal instead of returning an empty draft', async () => {
  const failed = async () => ({ ok: false, status: 402, text: async () => 'out of credits' });
  await assert.rejects(claudeWriter(opts(failed))('x'), /Writer 402: out of credits/);
  const refused = async () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) });
  await assert.rejects(claudeWriter(opts(refused))('x'), /Writer refused/);
});
