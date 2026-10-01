// The two "before" arms and the scoring for docs/before-after-jev-test-plan.md. Nothing here calls Jev.
import { loadRequest } from './load.js';

const spec = loadRequest('04-inbound-lead-routing');
const route = spec.questions.route.criteria;
const MIN = spec.cutoffs.min_employees;

// What an arm may answer, in the labels' words. Arm B is shown this list as written.
export const ACTIONS = {
  ae_now: `${route.account_executive}. Goes to an account executive now.`,
  sdr_qualify: `${route.sdr_qualify}.`,
  nurture: `${route.nurture}.`,
  partner_inbox: `${route.partner_or_vendor}.`,
  discard: `${route.junk}.`,
  route_to_csm: 'The facts say this company is already a customer.',
  skip: 'The facts say this contact is on the suppression list. Nothing is sent.',
  person: 'You are not sure, or the facts contradict the form. A person decides.',
};

// The sandwich can return Jev's raw route or its own word for "a person decides". Fixed before any run.
const SAME = { account_executive: 'ae_now', partner_or_vendor: 'partner_inbox', junk: 'discard', sdr_review: 'person', human_review: 'person' };
export const norm = (action) => SAME[action] ?? action;

// Arm A. The rules a careful person would write in an afternoon, first match wins.
const TEST_STRING = /^\s*(test|asdf|qwerty)(\s+(test|asdf|qwerty))*\s*$/i;
const SPAM = /gift card|click here|you have been selected|congratulations!|\bwinner\b|\bcrypto\b|\bseo backlinks?\b/i;
const STUDENT = /\b(student|thesis|class project|homework|dissertation|coursework)\b/i;
const OPT_OUT = /\bunsubscribe\b|\b(take|remove) (me|us) (off|from)\b|\bstop (calling|emailing|contacting)\b|\bdo not contact\b/i;
const PITCH_ROLE = /\b(recruit(er|ing)|talent|partnerships?|alliances?)\b/i;
const PITCH = /\bwe (provide|offer|specialize|help (agencies|companies|businesses) like yours)\b|\bi run an? [\w\s-]{0,30}(studio|agency|firm)\b|\bfree (mockup|audit|trial|consultation)\b|\bare you hiring\b|\b(referral|reseller) (partnership|program)\b|\bwhite-?label\b|\b(15|fifteen) minutes\b|\$\d+ (an|per|\/) ?hour|\bhalf the price\b|\b(listing|placement) fee\b|\bresell our\b/i;
const NOT_READY = /\bno rush\b|\bnext (fiscal )?year\b|\bno project\b|\bnewsletter\b|\bno budget\b|\bfor later\b|\b20\d\d planning\b|\bmore content\b|\bguides?\b|\bjust (looking|browsing|researching)\b|\bin a year\b/i;
const SENIOR = /\b(vp|vice president|chief|c[a-z]o|head|director|founder|owner|president|partner)\b/i;
const URGENT = /\b(now|asap|as soon as possible|urgent(ly)?|yesterday|deadline|this (week|month|quarter)|next (week|month)|by q[1-4]|end of (the )?(month|quarter)|within (the|a) (week|month)|in the next \w+ (days|weeks)|(two|three|four|six|\d+) weeks|ends on|start date)\b/i;

export function armA({ state: { lead } }, facts = {}) {
  const text = `${lead.role} ${lead.message}`;
  const as = (action, fired) => ({ action, why: fired });
  if (facts.suppressed) return as('skip', 'suppressed');
  if (TEST_STRING.test(lead.message) || !/[a-z]{3}/i.test(lead.message)) return as('discard', 'test_string');
  if (SPAM.test(lead.message)) return as('discard', 'spam_phrase');
  if (facts.customer) return as('route_to_csm', 'existing_customer');
  if (facts.competitor) return as('person', 'competitor');
  if (OPT_OUT.test(lead.message)) return as('person', 'opt_out_phrase');
  if (STUDENT.test(text)) return as('discard', 'student');
  if (PITCH_ROLE.test(lead.role) || PITCH.test(lead.message)) return as('partner_inbox', 'pitch_phrase');

  const form = lead.company_size === '' ? NaN : Number(lead.company_size);
  const real = facts.employees ?? null;
  if (real !== null && !Number.isNaN(form) && (real < MIN) !== (form < MIN)) return as('person', 'headcount_conflict');
  const size = real ?? form;
  if (size > 500) return as('person', 'above_policy_size');
  if (size < MIN) return as('nurture', 'below_policy_size');
  if (NOT_READY.test(lead.message)) return as('nurture', 'not_ready_phrase');
  if (SENIOR.test(lead.role) && URGENT.test(lead.message)) return as('ae_now', 'senior_and_urgent');
  return as('sdr_qualify', 'default');
}

// Arm B. One prompt, one call, one action. Same policy text, same facts, same allowed actions.
export const armBPrompt = ({ state }, facts = {}) => [
  'You route inbound leads from a web form. Choose exactly one action for this lead.',
  `Routing policy: ${state.routing_policy}`,
  `Lead:\n${JSON.stringify(state.lead, null, 2)}`,
  `Facts from our CRM and enrichment (these are checked; the form is not):\n${JSON.stringify(facts, null, 2)}`,
  `Allowed actions:\n${Object.entries(ACTIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
  'Reply with two lines. Line 1: the action name only. Line 2: one sentence naming the rule or fact that decided it.',
].join('\n\n');

// The first allowed action in the reply. Anything else is 'invalid' and scores as wrong.
export function parseAction(text) {
  const hit = text.toLowerCase().match(new RegExp(`\\b(${Object.keys(ACTIONS).join('|')})\\b`));
  return { action: hit?.[1] ?? 'invalid', why: text.split('\n').slice(1).join(' ').trim() };
}

export const armB = async (record, facts, llm) => parseAction(await llm(armBPrompt(record, facts)));

// runs: one array per run, each aligned with records, of { action, why, seconds }.
export function score(records, runs) {
  const per_run = runs.map((run) => {
    const person = records.filter((_, i) => run[i].action === 'person');
    return {
      correct: records.filter((r, i) => run[i].action === r.label).length,
      sent_to_person: person.length,
      person_agreed: person.filter((r) => r.label === 'person').length,
    };
  });
  // A count, not a rate: one customer sent to an AE matters.
  const costly = runs.flatMap((run, n) => records.flatMap((r, i) => (r.costly.includes(run[i].action)
    ? [{ key: r.key, run: n + 1, action: run[i].action, label: r.label }] : [])));
  const changed = records.filter((_, i) => new Set(runs.map((run) => run[i].action)).size > 1).map((r) => r.key);
  const seconds = runs.flat().map((x) => x.seconds).sort((a, b) => a - b);
  return {
    per_run, costly, changed,
    median_seconds: seconds[seconds.length >> 1] ?? 0,
    names_reason: runs.flat().every((x) => Boolean(x.why)),
  };
}
