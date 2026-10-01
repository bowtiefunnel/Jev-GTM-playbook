#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DB_PATH, ROOT, loadEnv, loadIcp } from './config.js';
import { importCsv, networkDb, runOnce, scoreNetwork } from './network.js';
import { listChanges, listPeople, scoredCsv, summary, usd } from './views.js';
import { PROVIDERS, enrich } from './enrich.js';
import { startServer } from './server.js';
import { openStore } from './store.js';
import { caseRecords, replayJev, symbolicCases } from './load.js';
import { askJev } from './jev.js';
import { claudeWriter } from './writer.js';
import { approve, runAll, runRecord } from './spine.js';
import { PLAYBOOKS, findPlaybook } from './playbooks/index.js';

const HELP = `jev-gtm-playbook: GTM playbooks on one spine.

  node src/cli.js replay <playbook>             Run a playbook's saved cases. No key, nothing stored.
  node src/cli.js run <playbook> <records.json> Run your records live and write the ledger.
  node src/cli.js facts <facts.json>          Load hard data: { "domain:acme.test": { "customer": true }, ... }
  node src/cli.js ledger [playbook]             Show what is waiting for a person.
  node src/cli.js approve <id>                Approve a checked draft, which releases its action.
  node src/cli.js override <id> <action> [note]   Record that a person changed a result.
  node src/cli.js overrides                   Override rate per playbook. Above 5% means retune.

Your network or any lead list (playbooks 01, 02 and 13):

  node src/cli.js demo                        Made-up connections and made-up answers. No key needed.
  node src/cli.js score <csv>                 Score a LinkedIn Connections.csv or any lead list; writes data/scored-connections.csv
  node src/cli.js import <csv>                Import a list without scoring yet.
  node src/cli.js network                     Import any new CSV in data/ and score what changed.
  node src/cli.js status                      Top fits and the latest job-change signals.
  node src/cli.js enrich <provider> [--limit 100] [--max-age-days 30] [--min-fit 60]
                                              Refresh titles from prospeo, leadmagic, blitz or moltsets, then score what changed.
  node src/cli.js serve                       The dashboard, on http://localhost:4173

Playbooks: ${Object.keys(PLAYBOOKS).join(', ')}
`;

function printRun(r) {
  console.log(`\nJev calls: ${r.judged}   unchanged, not re-scored: ${r.reused}   skipped for free: ${r.skipped}`);
  console.log(`Input tokens: ${r.input_tokens.toLocaleString()}   cost: $${usd(r.input_tokens).toFixed(4)}`);
  for (const e of new Set(r.errors)) console.log(`  error: ${e}`);
}

function printStatus(store, icp, env) {
  const s = summary(store, icp, env);
  console.log(`\n${s.people} connections, ${s.snapshots} snapshot(s), mode: ${s.mode}${s.mode === 'mock' ? ' (answers are made up)' : ''}`);
  console.log(`Total so far: ${s.jev_calls} Jev calls, $${s.cost_usd.toFixed(4)}`);
  console.log('\nTop fits:');
  for (const p of listPeople(store, icp, env).filter((p) => p.fit !== null).slice(0, 8)) {
    console.log(`  ${String(p.fit).padStart(3)}  ${p.name} - ${p.position} @ ${p.company}  [${p.persona}]`);
  }
  const signals = listChanges(store, icp, env).filter((c) => c.action !== 'ignore');
  console.log(`\nSignals (${signals.length}):`);
  for (const c of signals.slice(0, 12)) {
    const moved = c.kind === 'new_connection' ? `${c.to.position} @ ${c.to.company}`
      : `${c.from.position} @ ${c.from.company}  ->  ${c.to.position} @ ${c.to.company}`;
    console.log(`  ${c.action.toUpperCase().padEnd(9)} ${c.name}: ${moved}\n            ${c.reason}`);
  }
}

const print = (rows) => {
  for (const r of rows) {
    console.log(`${String(r.record_key).slice(0, 44).padEnd(46)}${r.action.padEnd(22)}${r.status.padEnd(16)}${r.fired}`);
    if (r.draft) console.log(`    draft: ${r.draft}`);
    if (r.guard?.problems?.length) console.log(`    guard: ${r.guard.problems.join('; ')}`);
  }
};

const [command, a, b, ...rest] = process.argv.slice(2);
const env = loadEnv();

if (command === 'replay' && a) {
  const playbook = findPlaybook(a);
  const jev = replayJev();
  const stats = { judged: 0, reused: 0, input_tokens: 0 };
  console.log('Jev judges (the judgment cases):');
  print(await runAll(playbook, caseRecords(playbook.id), { store: openStore(':memory:'), jev, model: 'replay', stats }));
  const symbolic = symbolicCases(playbook.id);
  if (symbolic.length) console.log('\nCode decides or overrules (same inputs, different facts):');
  for (const c of symbolic) {
    const store = openStore(':memory:');
    for (const [key, data] of Object.entries(c.facts)) store.mergeFact(key, data);
    print([await runRecord(playbook, c.record, { store, jev, model: 'replay', stats })]);
  }
  console.log(`\n${playbook.id} (${playbook.shape}): ${stats.judged} saved Jev answers replayed. Drafts are skipped in replay.`);
} else if (command === 'run' && a && b) {
  if (!env.jevKey) { console.log('Set TYPESAFE_API_KEY in .env, or use "replay" to try the saved cases.'); process.exit(1); }
  if (!existsSync(b)) { console.log(`No such file: ${b}`); process.exit(1); }
  const playbook = findPlaybook(a);
  const writer = env.writerKey
    ? claudeWriter({ apiKey: env.writerKey, model: env.writerModel, baseUrl: env.writerBaseUrl }) : null;
  if (playbook.write && !writer) console.log('No ANTHROPIC_API_KEY: records that need a draft go to a person.');
  const stats = { judged: 0, reused: 0, input_tokens: 0 };
  const jev = (req) => askJev({ apiKey: env.jevKey, model: env.jevModel, ...req });
  print(await runAll(playbook, JSON.parse(readFileSync(b, 'utf8')), { store: openStore(DB_PATH), jev, model: env.jevModel, writer, stats }));
  console.log(`\nJev calls: ${stats.judged}   reused: ${stats.reused}   input tokens: ${stats.input_tokens}   cost: $${(stats.input_tokens / 1e6 * 0.042).toFixed(5)}`);
} else if (command === 'demo') {
  // Two made-up exports a week apart, scored with made-up answers, in a throwaway database.
  const file = path.join(DATA_DIR, 'demo.db');
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  const store = openStore(file);
  const icp = loadIcp();
  const demoEnv = { ...env, mock: true };
  for (const name of ['connections.sample.csv', 'connections.sample.week2.csv']) {
    const result = importCsv(networkDb(store), readFileSync(path.join(ROOT, 'examples', name), 'utf8'), name);
    console.log(`\n== ${name}: ${result.imported} connections, ${result.changes} changes detected by code`);
    printRun(await scoreNetwork(store, icp, demoEnv));
  }
  printStatus(store, icp, demoEnv);
  console.log('\nThat was mock mode. Add TYPESAFE_API_KEY to .env and run "node src/cli.js network" for real answers.');
} else if (command === 'score') {
  // The shortest path: one export in, one scored spreadsheet out.
  if (!a || !existsSync(a)) { console.log('Usage: node src/cli.js score path/to/Connections.csv\nHow to get that file: docs/export-your-connections.md'); process.exit(1); }
  if (env.mock) console.log('No TYPESAFE_API_KEY found: running in MOCK MODE, answers are made up.');
  const store = openStore(DB_PATH);
  const icp = loadIcp();
  const result = importCsv(networkDb(store), readFileSync(a, 'utf8'), path.basename(a));
  console.log(result.duplicate ? 'This exact file was already imported; scoring what is there.'
    : `Imported ${result.imported} connections, ${result.changes} changes since your last import.`);
  const started = Date.now();
  printRun(await scoreNetwork(store, icp, env, { log: console.log }));
  console.log(`Time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const out = path.join(DATA_DIR, 'scored-connections.csv');
  writeFileSync(out, scoredCsv(store, icp, env));
  printStatus(store, icp, env);
  console.log(`\nScored spreadsheet: ${out}\nDashboard: npm start`);
} else if (command === 'import' && a) {
  const result = importCsv(networkDb(openStore(DB_PATH)), readFileSync(a, 'utf8'), path.basename(a));
  console.log(result.duplicate ? 'Already imported (same file).' : `Imported ${result.imported} connections, ${result.changes} changes.`);
} else if (command === 'network') {
  if (env.mock) console.log('No TYPESAFE_API_KEY found: running in MOCK MODE, answers are made up.');
  const store = openStore(DB_PATH);
  const icp = loadIcp();
  printRun(await runOnce(store, icp, env, { dataDir: DATA_DIR, log: console.log }));
  printStatus(store, icp, env);
} else if (command === 'enrich') {
  const opt = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? Number(process.argv[i + 1]) : fallback; };
  if (!PROVIDERS[a]) { console.log(`Usage: node src/cli.js enrich <${Object.keys(PROVIDERS).join('|')}> [--limit 100] [--max-age-days 30] [--min-fit 60]`); process.exit(1); }
  const store = openStore(DB_PATH);
  const icp = loadIcp();
  // With --min-fit, spend credits on people who already score well from their last title.
  const fits = new Map(listPeople(store, icp, env).map((p) => [p.key, p.fit]));
  const r = await enrich(store, { provider: a, apiKey: process.env[PROVIDERS[a].env], limit: opt('limit', 100),
    maxAgeDays: opt('max-age-days', 30), minFit: opt('min-fit', null), fitOf: (p) => fits.get(p.key), log: console.log });
  console.log(`\nLooked up ${r.looked_up} of ${r.candidates}: ${r.found} found (${r.unchanged} unchanged since last time), ${r.not_found} not found, ${r.changes} job changes.`);
  for (const e of new Set(r.errors)) console.log(`  error: ${e}`);
  printRun(await scoreNetwork(store, icp, env, { log: console.log }));
  printStatus(store, icp, env);
} else if (command === 'status') {
  printStatus(openStore(DB_PATH), loadIcp(), env);
} else if (command === 'serve') {
  startServer(openStore(DB_PATH), env);
} else if (command === 'facts' && a) {
  const store = openStore(DB_PATH);
  const facts = JSON.parse(readFileSync(a, 'utf8'));
  for (const [key, data] of Object.entries(facts)) store.mergeFact(key, data);
  console.log(`Loaded ${Object.keys(facts).length} facts.`);
} else if (command === 'ledger') {
  const store = openStore(DB_PATH);
  const waiting = [...store.ledger({ playbook: a ? findPlaybook(a).id : null, status: 'needs_person' }),
    ...store.ledger({ playbook: a ? findPlaybook(a).id : null, status: 'needs_approval' })];
  for (const r of waiting) console.log(`#${r.id}  ${r.playbook}  ${r.record_key}  ${r.action}  ${r.status}  ${r.fired}${r.draft ? `\n    draft: ${r.draft}` : ''}`);
  console.log(`\n${waiting.length} waiting for a person.`);
} else if (command === 'approve' && a) {
  const row = approve(Number(a), openStore(DB_PATH), findPlaybook);
  console.log(`Approved: row ${row.id}, "${row.action}" released.`);
} else if (command === 'override' && a && b) {
  openStore(DB_PATH).override(Number(a), b, rest.join(' '));
  console.log(`Recorded: row ${a} overridden to "${b}".`);
} else if (command === 'overrides') {
  for (const r of openStore(DB_PATH).overrideRates()) {
    console.log(`${r.playbook.padEnd(34)}${String(r.overridden).padStart(4)} of ${String(r.decided).padEnd(6)}${(r.rate * 100).toFixed(1)}%${r.rate > 0.05 ? '   retune: rewrite the question or move its cutoff' : ''}`);
  }
} else {
  console.log(HELP);
}
