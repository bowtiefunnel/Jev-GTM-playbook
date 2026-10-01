// Costs about 20 cents, nearly all of it arm B. The same 50 labelled leads through code only, an LLM only,
// and playbook 04, three times each. Do not run it before the labels are frozen.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, loadEnv } from './config.js';
import { openStore } from './store.js';
import { askJev } from './jev.js';
import { runRecord } from './spine.js';
import { findPlaybook } from './playbooks/index.js';
import { openRouterWriter } from './writer.js';
import { armA, armB, norm, score } from './before-after.js';

const RUNS = 3;
const JEV_PER_MILLION = 0.042; // input tokens only
const read = (name) => JSON.parse(readFileSync(path.join(ROOT, 'examples/before-after', name), 'utf8'));

const env = loadEnv();
if (!env.jevKey || !env.writerKey || !env.writerModel) {
  console.error('Needs TYPESAFE_API_KEY, OPENROUTER_API_KEY and WRITER_MODEL in .env.');
  process.exit(1);
}
const records = read('inbound.labelled.json');
const factsFile = read('inbound.facts.json');
const playbook = findPlaybook('04');

// A new store per run. With a shared one, runs 2 and 3 would reuse run 1's Jev answers and
// "same answer twice" would be true by construction.
function freshStore() {
  const store = openStore(':memory:');
  for (const [key, data] of Object.entries(factsFile)) store.mergeFact(key, data);
  return store;
}

// The writer returns text only, so token counts are read off the response on the way past.
const used = { prompt: 0, completion: 0 };
const counting = async (url, init) => {
  const res = await fetch(url, init);
  if (res.ok) {
    const u = (await res.clone().json()).usage ?? {};
    used.prompt += u.prompt_tokens ?? 0; used.completion += u.completion_tokens ?? 0;
  }
  return res;
};
const llm = openRouterWriter({ apiKey: env.writerKey, model: env.writerModel, baseUrl: env.writerBaseUrl, fetchImpl: counting });
const jevStats = { judged: 0, reused: 0, input_tokens: 0 };
const jev = (req) => askJev({ apiKey: env.jevKey, model: env.jevModel, ...req });

// A failed call is a wrong answer for that record, not a reason to lose the run.
async function timed(fn) {
  const start = performance.now();
  let out;
  try { out = await fn(); } catch (e) { out = { action: 'error', why: String(e.message).slice(0, 200) }; }
  return { ...out, seconds: (performance.now() - start) / 1000 };
}

const arms = {
  code_only: (lead, store) => armA(lead, store.factsFor(lead)),
  llm_only: (lead, store) => armB(lead, store.factsFor(lead), llm),
  // No writer: the brief is drafted after the decision and does not change the action.
  sandwich: async (lead, store) => {
    const row = await runRecord(playbook, lead, { store, jev, model: env.jevModel, stats: jevStats });
    return { action: norm(row.action), raw: row.action, why: row.fired };
  },
};

const results = {};
for (const [name, arm] of Object.entries(arms)) {
  results[name] = [];
  for (let n = 0; n < RUNS; n++) {
    const store = freshStore();
    const run = [];
    // The arm sees key, state, email and domain. Never the label.
    for (const { key, state, email, domain } of records) run.push(await timed(() => arm({ key, state, email, domain }, store)));
    results[name].push(run);
    console.error(`${name} run ${n + 1} done`);
  }
}

// OpenRouter publishes prices per token on a public endpoint.
const listed = (await (await fetch(`${env.writerBaseUrl}/models`)).json()).data?.find((m) => m.id === env.writerModel)?.pricing;
const calls = RUNS * records.length;
const cost = {
  code_only: 0,
  llm_only: listed ? used.prompt * listed.prompt + used.completion * listed.completion : null,
  sandwich: jevStats.input_tokens / 1e6 * JEV_PER_MILLION,
};

const summary = Object.fromEntries(Object.keys(arms).map((name) => [name, {
  ...score(records, results[name]),
  cost_total: cost[name],
  cost_per_1000: cost[name] === null ? null : cost[name] / calls * 1000,
}]));

const line = (label, f) => console.log(label.padEnd(30) + Object.values(summary).map((s) => String(f(s)).padEnd(22)).join(''));
const runs = (s, f) => s.per_run.map(f).join(' / ');
console.log(`\n${records.length} records, ${RUNS} runs each. Arm B: ${env.writerModel}. Jev: ${env.jevModel}.\n`);
console.log(''.padEnd(30) + Object.keys(summary).map((k) => k.padEnd(22)).join(''));
line(`correct of ${records.length} (per run)`, (s) => runs(s, (r) => r.correct));
line('costly mistakes (all runs)', (s) => s.costly.length);
line('sent to a person (per run)', (s) => runs(s, (r) => r.sent_to_person));
line('  label agrees (per run)', (s) => runs(s, (r) => r.person_agreed));
line('changed between runs', (s) => s.changed.length);
line('cost per 1,000 records', (s) => (s.cost_per_1000 === null ? 'price not listed' : `$${s.cost_per_1000.toFixed(4)}`));
line('median seconds per record', (s) => s.median_seconds.toFixed(3));
line('names the rule or fact', (s) => (s.names_reason ? 'yes' : 'no'));
for (const [name, s] of Object.entries(summary)) {
  for (const c of s.costly) console.log(`COSTLY ${name} run ${c.run}: ${c.key} took ${c.action}, label ${c.label}`);
}

mkdirSync(DATA_DIR, { recursive: true });
const out = path.join(DATA_DIR, 'before-after-results.json');
writeFileSync(out, JSON.stringify({
  ran_at: new Date().toISOString(), arm_b_model: env.writerModel, jev_model: env.jevModel,
  tokens: { llm_only: used, sandwich: { input: jevStats.input_tokens, jev_calls: jevStats.judged } },
  summary,
  records: records.map((r, i) => ({
    key: r.key, kind: r.kind, label: r.label, costly: r.costly,
    ...Object.fromEntries(Object.keys(arms).map((name) => [name, results[name].map((run) => run[i])])),
  })),
}, null, 2) + '\n');
console.log(`\nEvery record, arm and run: ${path.relative(ROOT, out)}`);
