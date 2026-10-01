#!/usr/bin/env node
// One case, followed through the five steps. This is what a response file holds.
//   node src/trace.js           check that every saved trace still matches the code
//   node src/trace.js --write   rewrite playbooks-JEv/responses/ after changing a rule or a cutoff
//   node src/trace.js --live NN ask Jev about playbook NN's cases that have no saved answer yet, then --write
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYBOOK_DIR, loadEnv } from './config.js';
import { askJev } from './jev.js';
import { openStore } from './store.js';
import { caseRecords, replayJev, symbolicCases } from './load.js';
import { runRecord } from './spine.js';
import { PLAYBOOKS, findPlaybook } from './playbooks/index.js';

export async function traceCase(playbook, record, facts, jev) {
  const store = openStore(':memory:');
  for (const [key, data] of Object.entries(facts)) store.mergeFact(key, data);
  const row = await runRecord(playbook, record, { store, jev, model: 'replay' });
  const saved = jev.peek(record.state);
  const judged = Boolean(row.answers);
  const wantsDraft = judged && !row.unsure && Boolean(playbook.write?.when(row));
  return {
    '0_filter_and_cache': judged ? { decided: false } : { decided: true, facts: row.facts, fired: row.fired, action: row.action },
    '1_judge': judged ? { called: true, response: saved } : { called: false, ...(saved ? { saved_response: saved } : {}) },
    '2_check': judged ? { facts: row.facts, fired: row.fired, action: row.action, ...(row.values ? { values: row.values } : {}),
      outcome: row.unsure ? 'unsure: a person decides' : 'approved' } : null,
    '3_write': !playbook.write ? null
      : wantsDraft ? { draft: null, note: 'No draft saved. Drafts need a writer model and have not been run live.' }
      : { skipped: 'the check did not release a draft' },
    '4_act': { status: row.status, action: row.action },
  };
}

// Every case of one playbook: the judgment cases first, then the symbolic ones.
export async function tracePlaybook(playbook, jev = replayJev()) {
  const traces = {};
  for (const record of caseRecords(playbook.id)) traces[record.key] = await traceCase(playbook, record, {}, jev);
  for (const c of symbolicCases(playbook.id)) traces[c.record.key] = await traceCase(playbook, c.record, c.facts, jev);
  return traces;
}

// Real answers for a new playbook's cases. Costs a fraction of a cent; never overwrites a saved answer.
async function fetchLive(playbook) {
  const env = loadEnv();
  if (!env.jevKey) throw new Error('--live needs TYPESAFE_API_KEY in .env');
  const file = path.join(PLAYBOOK_DIR, 'responses', `${playbook.id}.json`);
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  for (const record of caseRecords(playbook.id)) {
    if (saved[record.key]?.['1_judge']?.response || saved[record.key]?.['1_judge']?.saved_response) continue;
    const started = Date.now();
    const res = await askJev({ apiKey: env.jevKey, model: env.jevModel, state: record.state, questions: playbook.questions });
    saved[record.key] = { '1_judge': { response: { ...res, ms: Date.now() - started, date: new Date().toISOString().slice(0, 10) } } };
    console.log(`  asked Jev: ${record.key}`);
  }
  writeFileSync(file, JSON.stringify(saved, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--live') { await fetchLive(findPlaybook(process.argv[3])); process.argv[2] = '--write'; }
  const jev = replayJev();
  for (const playbook of Object.values(PLAYBOOKS)) {
    const file = path.join(PLAYBOOK_DIR, 'responses', `${playbook.id}.json`);
    const traces = await tracePlaybook(playbook, jev);
    if (process.argv[2] === '--write') writeFileSync(file, JSON.stringify(traces, null, 2) + '\n');
    console.log(`${playbook.id}: ${Object.keys(traces).length} cases`);
  }
}
