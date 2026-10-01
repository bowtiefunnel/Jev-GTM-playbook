// Costs about a tenth of a cent. Run every playbook's own cases live and compare with the saved-answer result.
import { loadEnv } from './config.js';
import { openStore } from './store.js';
import { caseRecords, replayJev } from './load.js';
import { askJev } from './jev.js';
import { runAll } from './spine.js';
import { PLAYBOOKS } from './playbooks/index.js';

const env = loadEnv();
const extra = { '11-cold-icp-conversations': { days_quiet: 45, fit: 80 } };
const show = (r) => `${r.action} | ${r.status} | ${r.fired}`;
let tokens = 0, calls = 0, flips = 0, total = 0;
for (const playbook of Object.values(PLAYBOOKS)) {
  const records = caseRecords(playbook.id).map((r) => ({ ...r, ...extra[playbook.id] }));
  const stats = { judged: 0, reused: 0, input_tokens: 0 };
  const live = await runAll(playbook, records, { store: openStore(':memory:'), model: env.jevModel, stats,
    jev: (req) => askJev({ apiKey: env.jevKey, model: env.jevModel, ...req }) });
  const saved = await runAll(playbook, records, { store: openStore(':memory:'), model: 'replay', jev: replayJev() });
  tokens += stats.input_tokens; calls += stats.judged;
  live.forEach((row, i) => {
    total++;
    if (show(row) !== show(saved[i])) { flips++; console.log(`FLIP ${playbook.id} / ${row.record_key}\n   saved: ${show(saved[i])}\n   live:  ${show(row)}`); }
  });
}
console.log(`\n${total} cases, ${flips} changed, ${calls} Jev calls, ${tokens} input tokens, $${(tokens / 1e6 * 0.042).toFixed(5)}, model ${env.jevModel}`);
