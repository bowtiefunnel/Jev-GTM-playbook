// Step 3's LLM. Any OpenAI-compatible chat endpoint; OpenRouter and Claude by default.
export function openRouterWriter({ apiKey, model, baseUrl, fetchImpl = fetch }) {
  return async (prompt) => {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Writer ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()).choices[0].message.content.trim();
  };
}
