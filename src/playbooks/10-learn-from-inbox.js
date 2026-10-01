import { loadRequest } from '../load.js';

const spec = loadRequest('10-learn-from-inbox');
const C = spec.cutoffs;
const TRAITS = ['pitches_first_line', 'asks_a_question', 'references_a_trigger'];

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  // Jev only describes the opener. Whether it got a reply comes from the data, not the model.
  check(a) {
    return { action: 'described', fired: 'described', values: Object.fromEntries(TRAITS.map((t) => [t, a[t].noul])) };
  },
};

// rows: [{ replied, values }] from the ledger. Rates are arithmetic, so code does them.
export function replyRateBy(rows, trait, { cutoff = C.trait, minSample = C.min_sample } = {}) {
  const rate = (group) => (group.length >= minSample ? group.filter((r) => r.replied).length / group.length : null);
  const withIt = rows.filter((r) => r.values[trait] >= cutoff);
  const without = rows.filter((r) => r.values[trait] < cutoff);
  return { trait, with: rate(withIt), without: rate(without), n_with: withIt.length, n_without: without.length };
}
