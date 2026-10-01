// Every NN-name.js file in this folder is a playbook. Adding a file registers it.
import { readdirSync } from 'node:fs';

const files = readdirSync(new URL('.', import.meta.url)).filter((f) => /^\d\d-.+\.js$/.test(f)).sort();
const loaded = await Promise.all(files.map((f) => import(`./${f}`)));

export const PLAYBOOKS = Object.fromEntries(loaded.map((m) => [m.default.id, m.default]));

// "04" or "04-inbound-lead-routing" both work.
export function findPlaybook(name) {
  const hit = Object.values(PLAYBOOKS).find((r) => r.id === name || r.id.startsWith(`${name}-`));
  if (!hit) throw new Error(`Unknown playbook "${name}". Known: ${Object.keys(PLAYBOOKS).join(', ')}`);
  return hit;
}
