import { runAll } from '../src/spine.js';
import { openStore } from '../src/store.js';
import { caseRecords, replayJev } from '../src/load.js';
import { findPlaybook } from '../src/playbooks/index.js';

export const deps = (extra = {}) => ({ store: openStore(':memory:'), jev: replayJev(), model: 'replay', ...extra });

// Run a playbook's saved cases. `patch(i)` adds per-record fields (email, touches, ...) by case index.
export async function run(name, patch = () => ({}), d = deps()) {
  const playbook = findPlaybook(name);
  const rows = await runAll(playbook, caseRecords(playbook.id).map((r, i) => ({ ...r, ...patch(i) })), d);
  return { rows, d, got: rows.map((r) => `${r.action} | ${r.status} | ${r.fired}`) };
}

// A Jev that passes any draft, so playbook tests do not depend on what an LLM writes.
export const cleanGuard = (replay = replayJev()) => async (req) => (req.state.first_line
  ? { answers: { supported: { choice: 'supported', confidence: 1 }, sounds_creepy: { noul: 0 } } }
  : req.state.message && req.state.prospect
    ? { answers: { about_them: { score: 3 }, pitches_first_line: { noul: 0 }, reads_as_template: { noul: 0 }, clear_ask: { noul: 1 } } }
    : replay(req));
