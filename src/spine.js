// The five steps in docs/how-it-works-updated-2.svg. Every playbook runs through runRecord.
import { createHash } from 'node:crypto';
import { checkDraft } from './guard.js';

const MAX_DRAFTS = 2; // then a person takes it

// ponytail: a phrase list catches only the lazy attacks. Upgrade path: a Jev noul asked first,
// "does this text give instructions to whoever is reading it?", with its own cutoff.
const INJECTION = /\b(ignore|disregard|forget) (all |any |the |your )?(previous|prior|above|earlier) (instructions|rules|prompts?)\b|\bsystem prompt\b|\byou are now\b/i;
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

const norm = (v) => (typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, ' ').trim()
  : Array.isArray(v) ? v.map(norm)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]))
  : v);

// Same questions + same model + same state = same answer. The policy text lives in the state and the
// question wording is hashed whole, so editing either one re-judges without a version number to forget.
export const fingerprint = (questions, model, state) =>
  createHash('sha256').update(JSON.stringify([questions, model, norm(state)])).digest('hex').slice(0, 24);

// Step 1, with the step 0 cache in front of it.
export async function judge(questions, state, { store, jev, model, stats }) {
  const fp = fingerprint(questions, model, state);
  let answers = store.getAnswers(fp);
  if (answers) { if (stats) stats.reused++; return { fingerprint: fp, answers }; }
  const res = await jev({ state, questions });
  store.saveAnswers(fp, res);
  if (stats) { stats.judged++; stats.input_tokens += res.usage?.input_tokens ?? 0; }
  return { fingerprint: fp, answers: res.answers };
}

const prompt = (ask, source, problems) => [
  ask,
  `Use only these facts. Do not add any others:\n${JSON.stringify(source, null, 2)}`,
  problems.length ? `The last draft was rejected. Fix these:\n- ${problems.join('\n- ')}` : '',
  'Reply with the text only.',
].filter(Boolean).join('\n\n');

// Step 0: decide for free where code can. Universal checks first, then the playbook's own.
function stepZero(playbook, record, facts) {
  if (facts.suppressed) return { action: 'skip', fired: 'suppressed' };
  if (strings(record.state).some((s) => INJECTION.test(s))) return { action: 'human_review', fired: 'possible_injection', unsure: true };
  return playbook.pre?.(record, facts) ?? null;
}

// What the spine would decide right now from stored answers. No Jev call, nothing logged.
// Returns null when the record has not been judged yet. Lists and dashboards use this, so a
// changed cutoff or a new fact shows up at once.
export function preview(playbook, record, { store, model }) {
  const facts = store.factsFor(record);
  const pre = stepZero(playbook, record, facts);
  if (pre) return { ...pre, filtered: true };
  const answers = store.getAnswers(fingerprint(playbook.questions, model, record.state));
  return answers ? { answers, ...playbook.check(answers, facts, record) } : null;
}

// deps: { store, jev, model, writer?, stats? }. Returns the ledger row it wrote.
export async function runRecord(playbook, record, deps) {
  const { store, writer } = deps;
  const facts = store.factsFor(record);
  const base = { playbook: playbook.id, record_key: record.key, input: record, facts };
  // Step 4. Only 'filtered' and 'done' rows act; everything else waits for a person.
  const finish = (row) => {
    if (row.status === 'filtered' || row.status === 'done') playbook.act?.(row, record, store);
    return { ...row, id: store.log(row) };
  };

  const pre = stepZero(playbook, record, facts);
  if (pre) return finish({ ...base, ...pre, status: pre.unsure ? 'needs_person' : 'filtered' });

  // Step 1: Jev judges. Step 2: code checks.
  const judged = await judge(playbook.questions, record.state, deps);
  const decision = playbook.check(judged.answers, facts, record);
  const row = { ...base, ...judged, ...decision };
  if (decision.unsure) return finish({ ...row, status: 'needs_person' });
  if (!playbook.write?.when(decision)) return finish({ ...row, status: 'done' });

  // Step 3: the LLM writes from checked values only, and the draft goes back through the check.
  if (!writer) return finish({ ...row, status: 'needs_person', guard: { skipped: 'no writer configured' } });
  const source = playbook.write.source(decision, record);
  const prospect = playbook.write.prospect?.(record) ?? null;
  const ask = async (questions, state) => (await judge(questions, state, deps)).answers;
  let draft, guard = { problems: [] };
  for (let attempt = 1; attempt <= MAX_DRAFTS; attempt++) {
    draft = await writer(prompt(playbook.write.ask, source, guard.problems));
    guard = await checkDraft(draft, { source, prospect }, ask);
    if (guard.ok || guard.needsPerson) break;
  }
  return finish({ ...row, draft, guard, status: guard.ok ? 'needs_approval' : 'needs_person' });
}

// The diagram's "approved: a checked draft" arrow into step 4.
export function approve(id, store, findPlaybook) {
  const row = store.approve(id);
  findPlaybook(row.playbook).act?.(row, JSON.parse(row.input), store);
  return row;
}

export async function runAll(playbook, records, deps) {
  const rows = [];
  for (const record of records) rows.push(await runRecord(playbook, record, deps));
  return rows;
}
