// A tiny client for TypeSafe's one endpoint. See https://docs.typesafe.ai/api
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function askJev({ apiKey, model, state, questions, maxAttempts = 5 }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, model, questions }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      lastError = err; // network trouble or timeout: worth another try
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return res.json();

    const body = await res.text();
    lastError = new Error(`TypeSafe API ${res.status}: ${body.slice(0, 300)}`);
    lastError.status = res.status;
    // 401 (bad key) and 422 (bad request) will not fix themselves.
    if (!RETRY_STATUSES.has(res.status)) throw lastError;
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
  }
  throw lastError;
}

const backoff = (attempt) => Math.min(20_000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;

// Run jobs a few at a time. Jev allows far more, but a laptop does not need it.
export async function pool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(runners);
}
