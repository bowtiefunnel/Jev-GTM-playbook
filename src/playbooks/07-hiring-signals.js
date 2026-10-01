import { loadRequest } from '../load.js';

const spec = loadRequest('07-hiring-signals');
const C = spec.cutoffs;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre(record, facts) {
    // Only accounts playbook 06 scored as a fit are worth a signal. Unscored accounts pass.
    if (typeof facts.account_fit === 'number' && facts.account_fit < C.min_account_fit) return { action: 'skip', fired: 'account_not_a_fit' };
    return null;
  },
  check(a) {
    if (a.building_outbound.noul < C.building_outbound) return { action: 'no_signal', fired: 'not_building_outbound' };
    const strong = a.first_hire_in_function.noul >= C.first_hire_in_function || a.seniority_of_hire.choice !== 'individual_contributor';
    // "First hire" is read from the post's wording, so it stays a hint until enrichment confirms it.
    return { action: strong ? 'signal_strong' : 'signal_normal', fired: 'building_outbound', values: { first_hire_is_a_hint: true } };
  },
};
