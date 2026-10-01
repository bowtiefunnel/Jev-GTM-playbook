// Step 3's LLM: Claude, through Anthropic's Messages API. Plain fetch, so the repo stays free of dependencies.
export function claudeWriter({ apiKey, model, baseUrl, fetchImpl = fetch }) {
  return async (prompt) => {
    const res = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Writer ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    // A refusal comes back as a 200 with no usable text. Say so instead of returning an empty draft.
    if (body.stop_reason === 'refusal') throw new Error('Writer refused the request');
    return body.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  };
}
