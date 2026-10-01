// Enrichment: refresh each person's current title and company from a data provider,
// then store the result as a new snapshot so the normal change detection runs on it.
// Adapters follow each provider's public API docs (links below). Bring your own key.
import { createHash } from 'node:crypto';
import { applySnapshot, networkDb } from './network.js';
import { pool } from './jev.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each adapter returns { found, position, company, company_domain, company_description, employees }.
export const PROVIDERS = {
  // https://prospeo.io/api-docs/enrich-person — 1 credit per match; misses are HTTP 400 NO_MATCH.
  prospeo: {
    env: 'PROSPEO_API_KEY',
    async lookup(person, key, fetchImpl) {
      const res = await fetchImpl('https://api.prospeo.io/enrich-person', {
        method: 'POST', headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(person.url ? { linkedin_url: person.url }
          : { first_name: person.first_name, last_name: person.last_name, company_name: person.company }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && JSON.stringify(body).includes('NO_MATCH')) return { found: false };
      check(res, body);
      return { found: true, position: body.person?.current_job_title, company: body.company?.name,
        company_domain: body.company?.domain || body.company?.website, company_description: body.company?.description,
        employees: body.company?.employee_count };
    },
  },
  // https://leadmagic.io/docs/api-reference/profile-search — needs a LinkedIn URL.
  leadmagic: {
    env: 'LEADMAGIC_API_KEY',
    async lookup(person, key, fetchImpl) {
      if (!person.url) return { found: false, reason: 'needs a LinkedIn URL' };
      const res = await fetchImpl('https://api.leadmagic.io/v1/people/profile-search', {
        method: 'POST', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_url: person.url }),
      });
      const body = await res.json().catch(() => ({}));
      if (/not found/i.test(body.message || '')) return { found: false };
      check(res, body);
      // professional_title can be a headline ("VP Sales at X"); prefer the current role.
      const current = (body.work_experience || []).find((w) => /present/i.test(w.employment_period || ''));
      return { found: true, position: current?.position_title || body.professional_title, company: body.company_name,
        company_domain: body.company_website };
    },
  },
  // https://docs.blitz-api.ai/api-reference/people-enrichment/person-enrichment.md — needs a LinkedIn URL.
  blitz: {
    env: 'BLITZ_API_KEY',
    async lookup(person, key, fetchImpl) {
      if (!person.url) return { found: false, reason: 'needs a LinkedIn URL' };
      const res = await fetchImpl('https://api.blitz-api.ai/v2/enrichment/person', {
        method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_linkedin_url: person.url }),
      });
      const body = await res.json().catch(() => ({}));
      check(res, body);
      if (body.found === false || !body.person) return { found: false };
      const current = (body.person.experiences || []).find((e) => e.job_is_current);
      return { found: true, position: current?.job_title || body.person.headline, company: current?.company_name,
        company_domain: current?.company_domain };
    },
  },
  // https://developer.moltsets.com/api-reference/reverse-lookups/reverse-linkedin-lookup — needs a LinkedIn URL.
  moltsets: {
    env: 'MOLTSETS_API_KEY',
    async lookup(person, key, fetchImpl) {
      if (!person.url) return { found: false, reason: 'needs a LinkedIn URL' };
      const res = await fetchImpl('https://api.moltsets.com/api/v1/tools/reverse_linkedin_lookup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'jev-gtm-playbook' },
        body: JSON.stringify({ linkedin_url: person.url }),
      });
      const body = await res.json().catch(() => ({}));
      check(res, body);
      if (body.status === 'not_found' || !body.results) return { found: false };
      return { found: true, position: body.results.title, company: body.results.company?.name,
        company_domain: body.results.company?.website_url };
    },
  },
};

function check(res, body) {
  if (res.ok) return;
  const err = new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  err.status = res.status;
  err.retryAfter = Number(res.headers.get('retry-after')) || 0;
  throw err;
}

async function withRetry(fn, attempts = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (err) {
      if (i >= attempts || ![429, 500, 502, 503, 504].includes(err.status)) throw err;
      await sleep(err.retryAfter ? err.retryAfter * 1000 : 1000 * 2 ** i);
    }
  }
}

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const enrichmentFingerprint = (r) =>
  createHash('sha256').update(JSON.stringify([norm(r.position), norm(r.company), norm(r.company_description)])).digest('hex').slice(0, 24);

// Enrich people whose last enrichment is older than maxAgeDays (credits cost money, so
// fresh ones are skipped), then apply what was found as one snapshot.
// What the provider knows about the company becomes a fact: the hard data step 2 checks Jev against.
const host = (u) => (u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

export async function enrich(store, { provider, apiKey, limit = 100, maxAgeDays = 30, minFit = null, fitOf = null, concurrency = 2, fetchImpl = fetch, log = () => {} }) {
  const db = networkDb(store);
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider "${provider}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`);
  if (!apiKey) throw new Error(`Set ${p.env} in .env to use ${provider}.`);
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const lastFor = db.prepare('SELECT fetched_at, fingerprint FROM enrichments WHERE person_key = ? AND provider = ? ORDER BY fetched_at DESC LIMIT 1');
  let people = db.prepare('SELECT * FROM people').all().filter((x) => { const l = lastFor.get(x.key, provider); return !l || l.fetched_at < cutoff; });
  if (minFit !== null && fitOf) people = people.filter((x) => (fitOf(x) ?? 0) >= minFit);   // spend credits on likely fits first
  people = people.slice(0, limit);

  const stats = { looked_up: 0, found: 0, not_found: 0, unchanged: 0, errors: [] };
  const rows = [];
  const save = db.prepare('INSERT INTO enrichments (person_key, provider, fetched_at, found, fingerprint, result) VALUES (?, ?, ?, ?, ?, ?)');
  await pool(people, concurrency, async (person) => {
    try {
      const r = await withRetry(() => p.lookup(person, apiKey, fetchImpl));
      stats.looked_up++;
      if (!r.found || (!r.position && !r.company)) { stats.not_found++; save.run(person.key, provider, new Date().toISOString(), 0, null, null); return; }
      stats.found++;
      const fp = enrichmentFingerprint(r);
      if (lastFor.get(person.key, provider)?.fingerprint === fp) stats.unchanged++;
      save.run(person.key, provider, new Date().toISOString(), 1, fp, JSON.stringify(r));
      const domain = host(r.company_domain);
      if (domain && typeof r.employees === 'number') store.mergeFact(`domain:${domain}`, { employees: r.employees });
      rows.push({ ...person, position: r.position || person.position, company: r.company || person.company,
        company_description: r.company_description || null, company_domain: domain || null });
    } catch (err) {
      stats.errors.push(err.message);
      if (err.status === 401 || err.status === 403) throw err;   // bad key: stop instead of burning through the list
    }
    if (stats.looked_up % 25 === 0) log(`  enriched ${stats.looked_up}/${people.length}`);
  });
  const snapshot = rows.length
    ? applySnapshot(db, rows, `enrich:${provider}`, createHash('sha256').update(new Date().toISOString() + JSON.stringify(rows.map((r) => [r.key, r.position, r.company]))).digest('hex'))
    : { changes: 0 };
  return { ...stats, candidates: people.length, changes: snapshot.changes };
}
