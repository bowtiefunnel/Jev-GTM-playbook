import { loadRequest } from '../load.js';

const spec = loadRequest('06-account-icp-scoring');
const C = spec.cutoffs;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre(record, facts) {
    if (facts.customer) return { action: 'skip', fired: 'existing_customer' };
    if (facts.competitor || facts.excluded) return { action: 'excluded', fired: 'exclusion_list' };
    return null;
  },
  check(a, facts, { state }) {
    const zero = (fired) => ({ action: 'scored', fired, values: { fit: 0 } });
    if (a.excluded.noul >= C.excluded) return zero('excluded');
    // When a headcount exists, code compares it and Jev's size answer is ignored.
    const employees = facts.employees ?? state.company.employees;
    if (typeof employees === 'number') {
      if (employees < C.min_employees || employees > C.max_employees) return zero('headcount_out_of_range');
    } else if (a.size_fit.choice !== 'in_range' && a.size_fit.confidence >= C.size_fit_confidence) return zero('size_fit');
    const score = (a.sells_b2b.score / 3) * C.weights.sells_b2b + (a.needs_outbound.score / 3) * C.weights.needs_outbound;
    return { action: 'scored', fired: 'weighted_fit', values: { fit: Math.round(score * 100) } };
  },
  // Other playbooks gate on this fit score, so it becomes a fact about the account.
  act(row, record, store) {
    if (row.action === 'scored' && record.domain) store.mergeFact(`domain:${record.domain}`, { account_fit: row.values.fit });
  },
};
