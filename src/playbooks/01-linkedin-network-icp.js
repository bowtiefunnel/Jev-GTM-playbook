import { loadRequest } from '../load.js';

const spec = loadRequest('01-linkedin-network-icp');
const C = spec.cutoffs;
const SKIP = spec['0_filter_and_cache'].skip_if_title_matches;
const topLevel = (answer) => Object.keys(answer.probabilities).length - 1;

// What Jev sees. No names, emails or profile URLs: only the role, the company and who you sell to.
export function stateFor(icp, person) {
  const connection = { current_position: person.position || 'unknown', current_company: person.company || 'unknown' };
  // Only enriched records have this. It is what lets company_fit say more than "cannot tell".
  if (person.company_description) connection.company_description = person.company_description;
  return { ideal_customer: icp.ideal_customer, connection };
}

// Each part is 0 to 1. A headcount from enrichment replaces Jev's guess about the company.
export function fitParts(a, facts = {}) {
  const sized = typeof facts.employees === 'number';
  return {
    role_fit: a.role_fit.score / topLevel(a.role_fit),
    seniority: a.seniority.score / topLevel(a.seniority),
    likely_buyer: a.likely_buyer.noul,
    company_fit: sized ? Number(facts.employees >= C.min_employees && facts.employees <= C.max_employees) : a.company_fit.probabilities.fits ?? 0,
  };
}

// 0 to 100. A weighted average, so the weights do not need to add up to 1.
export function fitScore(parts, weights = C.weights) {
  let total = 0, weightSum = 0;
  for (const [name, weight] of Object.entries(weights)) {
    if (!(name in parts)) continue;
    total += parts[name] * weight;
    weightSum += weight;
  }
  return weightSum ? Math.round((total / weightSum) * 100) : 0;
}

const base = {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  fitCutoff: C.fit,
  pre({ state }, facts) {
    const { current_position: title, current_company: company } = state.connection;
    if (title === 'unknown' && company === 'unknown') return { action: 'skip', fired: 'no role or company listed' };
    const hit = SKIP.find((word) => title.toLowerCase().includes(word.toLowerCase()));
    if (hit) return { action: 'skip', fired: `title contains "${hit}"` };
    if (facts.customer) return { action: 'excluded', fired: 'existing_customer' };
    if (facts.competitor) return { action: 'excluded', fired: 'competitor' };
    return null;
  },
  check(a, facts) {
    const parts = fitParts(a, facts);
    return {
      action: 'scored', fired: typeof facts.employees === 'number' ? 'weighted_fit_with_headcount' : 'weighted_fit',
      values: { fit: fitScore(parts), persona: a.persona.choice, persona_confidence: a.persona.confidence, parts },
    };
  },
};

export default base;

// Your own persona groups, from icp.json, replace the example ones in the persona question.
export const forIcp = (icp) => ({ ...base, questions: { ...spec.questions, persona: { ...spec.questions.persona, criteria: icp.personas } } });
