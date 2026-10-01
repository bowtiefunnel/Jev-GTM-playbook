// The draft guard: playbooks 08 and 09, run on everything the LLM writes.
import { loadRequest } from './load.js';

const FACT = loadRequest('08-personalization-fact-check');
const MESSAGE = loadRequest('09-first-message-scoring');

// Playbook 08. One sentence against the source it was written from.
export function gateFirstLine(a, c = FACT.cutoffs) {
  if (a.sounds_creepy.noul >= c.sounds_creepy) return { action: 'rewrite', fired: 'too_personal' };
  if (a.supported.choice === 'supported' && a.supported.confidence >= c.supported_confidence) return { action: 'send', fired: 'supported' };
  if (a.supported.choice === 'contradicted') return { action: 'rewrite', fired: 'wrong_fact' };
  return { action: 'human_review', fired: 'unsupported_or_unsure', unsure: true };
}

// Playbook 09. The list of things wrong with an outbound message; empty means send.
export function draftProblems(a, c = MESSAGE.cutoffs) {
  const problems = [];
  if (a.about_them.score < c.about_them) problems.push('make it about them');
  if (a.pitches_first_line.noul >= c.pitches_first_line) problems.push('do not pitch in line one');
  if (a.reads_as_template.noul >= c.reads_as_template) problems.push('reads like a template');
  if (a.clear_ask.noul < c.clear_ask) problems.push('end with one easy question');
  return problems;
}

// Free checks that need no model.
export function literalProblems(text, c = MESSAGE.cutoffs) {
  const problems = [];
  if (/\{[^{}]*\}/.test(text)) problems.push('unfilled placeholder');
  if (text.length > c.max_chars) problems.push(`longer than ${c.max_chars} characters`);
  return problems;
}

const sentences = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

// `ask(questions, state)` returns Jev's answers. Returns { ok, needsPerson, problems }.
export async function checkDraft(draft, { source, prospect }, ask) {
  const problems = literalProblems(draft);
  let needsPerson = false;
  for (const line of sentences(draft)) {
    if (line.endsWith('?')) continue; // a question claims nothing, so there is nothing to fact-check
    const gate = gateFirstLine(await ask(FACT.questions, { source, first_line: line }));
    if (gate.unsure) needsPerson = true;
    else if (gate.action === 'rewrite') problems.push(`${gate.fired}: "${line}"`);
  }
  // Playbook 09 scores messages to a prospect. An internal brief has no prospect and skips it.
  if (prospect) problems.push(...draftProblems(await ask(MESSAGE.questions, { prospect, message: draft })));
  return { ok: !needsPerson && problems.length === 0, needsPerson, problems };
}
