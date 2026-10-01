import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStore } from '../src/store.js';
import { parseCsv, readConnections, readList } from '../src/csv.js';
import { importCsv, networkDb, scoreNetwork } from '../src/network.js';
import { listChanges, listPeople, scoredCsv } from '../src/views.js';
import { loadIcp } from '../src/config.js';
import { fitScore } from '../src/playbooks/01-linkedin-network-icp.js';

const sample = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
const env = { mock: true, jevModel: 'jev-latest', jevKey: '' };
const icp = loadIcp();
const fresh = () => { const store = openStore(':memory:'); return { store, db: networkDb(store) }; };

test('csv: quoted commas, escaped quotes and newlines inside fields', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n'), [['a', 'b, c', 'say "hi"'], ['1', 'two\nlines', '3']]);
});

test('csv: skips the LinkedIn notes preamble and keys people by profile URL', () => {
  const people = readConnections(sample('connections.sample.csv'));
  assert.equal(people.length, 24);
  assert.equal(people[0].key, 'https://www.linkedin.com/in/sample-maya-okafor');
  assert.throws(() => readConnections('name,age\nx,1\n'), /does not look like/);
});

test('any lead list CSV is read by common column names', () => {
  const people = readList('Full Name,Job Title,Company Name,Work Email\nAda Park,Head of Sales,Thistle CRM,ada@example.com\n,,,\n');
  assert.equal(people.length, 1);
  assert.deepEqual([people[0].first_name, people[0].last_name, people[0].position, people[0].company, people[0].key],
    ['Ada', 'Park', 'Head of Sales', 'Thistle CRM', 'email:ada@example.com']);
  assert.throws(() => readList('a,b\n1,2\n'), /job title column/);
});

test('end to end: only changed people are scored again, and changes go through playbook 02', async () => {
  const { store, db } = fresh();
  const first = importCsv(db, sample('connections.sample.csv'));
  assert.equal(first.changes, 0, 'the first import is a baseline, not a signal');
  const run1 = await scoreNetwork(store, icp, env);
  assert.equal(run1.skipped, 3);
  assert.equal(run1.judged, 20, 'two people share a title and company, so they share one call');

  const run2 = await scoreNetwork(store, icp, env);
  assert.deepEqual([run2.judged, run2.reused], [0, 24], 'nothing changed, nothing to pay for');
  assert.equal(store.ledger().length, 24, 'and nothing new in the ledger');
  assert.equal(importCsv(db, sample('connections.sample.csv')).duplicate, true);

  const second = importCsv(db, sample('connections.sample.week2.csv'));
  assert.equal(second.changes, 7, '5 role changes + 2 new connections; a hidden profile is not a change');
  const run3 = await scoreNetwork(store, icp, env);
  assert.equal(run3.judged, 12, '7 people scored by playbook 01, 5 changes interpreted by playbook 02');
  assert.equal(store.ledger({ playbook: '02-job-change-interpretation' }).length, 5);

  const byName = Object.fromEntries(listChanges(store, icp, env).map((c) => [c.name, c]));
  assert.equal(byName['Maya Okafor'].action, 'reach_out');
  assert.equal(byName['Daniel Reyes'].action, 'ignore');
  assert.match(byName['Daniel Reyes'].reason, /reworded/);
  assert.equal(byName['Doug Pruitt'].action, 'ignore');
});

test('hard data overrules the score: a customer drops out of the list with no new call', async () => {
  const { store, db } = fresh();
  importCsv(db, sample('connections.sample.csv'));
  await scoreNetwork(store, icp, env);
  const maya = () => listPeople(store, icp, env).find((p) => p.name === 'Maya Okafor');
  assert.ok(maya().fit > 0);
  db.prepare("UPDATE people SET company_domain = 'brightloop.test' WHERE first_name = 'Maya'").run();
  store.mergeFact('domain:brightloop.test', { customer: true });
  assert.deepEqual([maya().fit, maya().skipped], [null, 'existing_customer']);
});

test('fitScore is a 0-100 weighted average', () => {
  assert.equal(fitScore({ role_fit: 1, seniority: 0, likely_buyer: 1, company_fit: 0 }, { role_fit: 1, seniority: 1 }), 50);
});

test('scored CSV has one row per connection and neutralises spreadsheet formulas', async () => {
  const { store, db } = fresh();
  importCsv(db, sample('connections.sample.csv').replace('Sales Manager', '=HYPERLINK("x")'));
  await scoreNetwork(store, icp, env);
  const lines = scoredCsv(store, icp, env).trim().split('\n');
  assert.equal(lines.length, 25);
  assert.match(lines[0], /^Fit \(0-100\),Name,Position/);
  assert.ok(lines.some((l) => l.includes(",'=HYPERLINK(")), 'formula-looking cell gets a leading apostrophe');
  assert.ok(!lines.some((l) => l.includes(',=HYPERLINK(')), 'no cell starts with a bare =');
});

test('dashboard rejects foreign Host and Origin headers', async () => {
  const http = await import('node:http');
  const { startServer } = await import('../src/server.js');
  const server = startServer(openStore(':memory:'), { ...env, port: 0 });
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  // node:http, not fetch: fetch silently drops a custom Host header.
  const get = (headers) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/summary', headers, agent: false }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  try {
    assert.equal(await get({}), 200);
    assert.equal(await get({ Host: 'evil.example' }), 403);
    assert.equal(await get({ Origin: 'https://evil.example' }), 403);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

// Canned responses shaped like each provider's documented API. No network.
const fakeFetch = (status, body) => async () => ({ ok: status < 400, status, json: async () => body, headers: new Headers() });
const PROVIDER_CASES = {
  prospeo: [fakeFetch(200, { person: { current_job_title: 'VP Sales' }, company: { name: 'Acme', domain: 'acme.test', description: 'B2B payroll software', employee_count: 90 } }),
    fakeFetch(400, { error: true, error_code: 'NO_MATCH' })],
  leadmagic: [fakeFetch(200, { message: 'Profile found.', professional_title: 'VP Sales at Acme', company_name: 'Acme',
    work_experience: [{ position_title: 'VP Sales', employment_period: 'Jan 2024 - Present' }] }),
    fakeFetch(200, { message: 'Profile not found or not accessible.' })],
  blitz: [fakeFetch(200, { found: true, person: { experiences: [{ job_title: 'AE', job_is_current: false }, { job_title: 'VP Sales', company_name: 'Acme', job_is_current: true }] } }),
    fakeFetch(200, { found: false, person: null })],
  moltsets: [fakeFetch(200, { status: 'found', results: { title: 'VP Sales', company: { name: 'Acme' } } }),
    fakeFetch(200, { status: 'not_found', results: null })],
};

test('each enrichment adapter reads its provider\'s documented response', async () => {
  const { PROVIDERS } = await import('../src/enrich.js');
  const person = { url: 'https://www.linkedin.com/in/x', first_name: 'A', last_name: 'B', company: 'Old Co' };
  for (const [name, [hit, miss]] of Object.entries(PROVIDER_CASES)) {
    const found = await PROVIDERS[name].lookup(person, 'k', hit);
    assert.equal(found.position, 'VP Sales', name);
    assert.equal(found.company, 'Acme', name);
    assert.equal((await PROVIDERS[name].lookup(person, 'k', miss)).found, false, `${name} miss`);
  }
});

test('enrichment becomes a snapshot and a fact: a new title is a job change, a headcount overrules Jev', async () => {
  const { enrich } = await import('../src/enrich.js');
  const { store, db } = fresh();
  importCsv(db, sample('connections.sample.csv'));
  await scoreNetwork(store, icp, env);
  const fetchImpl = async (_url, init) => {
    const promoted = JSON.parse(init.body).linkedin_url.endsWith('sample-felix-brandt');
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({
      person: { current_job_title: promoted ? 'Head of Sales' : null },
      company: promoted ? { name: 'Copperline', domain: 'https://www.copperline.test/about', employee_count: 12000 } : { name: null } }) };
  };
  const r = await enrich(store, { provider: 'prospeo', apiKey: 'k', limit: 100, fetchImpl });
  assert.equal(r.changes, 1);
  assert.deepEqual(store.factsFor({ domain: 'copperline.test' }), { employees: 12000 });
  assert.equal((await scoreNetwork(store, icp, env)).judged, 2, 'only the changed person: one playbook 01 call, one playbook 02 call');
  const felix = listChanges(store, icp, env).find((c) => c.name === 'Felix Brandt');
  assert.equal(felix.to.position, 'Head of Sales');
  assert.equal(listPeople(store, icp, env).find((p) => p.name === 'Felix Brandt').parts.company_fit, 0, '12,000 people is outside the size range');
  const again = await enrich(store, { provider: 'prospeo', apiKey: 'k', limit: 100, fetchImpl });
  assert.equal(again.candidates, 0, 'fresh enrichments are not bought twice');
});
