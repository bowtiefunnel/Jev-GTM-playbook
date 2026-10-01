// Request files (one playbook = five steps + cases) and response files (one saved trace per case).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PLAYBOOK_DIR } from './config.js';

const read = (dir, id) => JSON.parse(readFileSync(path.join(PLAYBOOK_DIR, dir, `${id}.json`), 'utf8'));

// The request file, with the two parts code reads most lifted to the top.
export function loadRequest(id) {
  const spec = read('requests', id);
  return { ...spec, questions: spec['1_judge'].questions, cutoffs: spec['2_check'].cutoffs };
}

// The judgment cases: what Jev says about each one is the point.
export const caseRecords = (id) => read('requests', id).cases.map((c) => ({ key: c.label, state: c.state, ...c.record }));

// Cases where code decides or overrules: same inputs, different facts or record fields.
export function symbolicCases(id) {
  const spec = read('requests', id);
  return spec.symbolic_cases.map((c) => ({
    expect: c.expect,
    facts: c.facts ?? {},
    record: { key: c.label, state: c.state ?? spec.cases.find((x) => x.label === c.state_from).state, ...c.record },
  }));
}

// Stands in for Jev: returns the saved answer for the exact state that produced it.
// No key, no network. `jev.calls` counts how often it was asked; `jev.peek` looks without counting.
export function replayJev() {
  const byState = new Map();
  for (const file of readdirSync(path.join(PLAYBOOK_DIR, 'responses'))) {
    const id = file.replace(/\.json$/, '');
    const saved = read('responses', id);
    for (const c of read('requests', id).cases) {
      const judged = saved[c.label]?.['1_judge'];
      const response = judged?.response ?? judged?.saved_response;
      if (response) byState.set(JSON.stringify(c.state), response);
    }
  }
  const jev = async ({ state }) => {
    jev.calls++;
    const hit = byState.get(JSON.stringify(state));
    if (!hit) throw new Error('No saved Jev answer for this state. Run it live with TYPESAFE_API_KEY set.');
    return hit;
  };
  jev.calls = 0;
  jev.peek = (state) => byState.get(JSON.stringify(state)) ?? null;
  return jev;
}
