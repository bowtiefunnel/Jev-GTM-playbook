import { loadRequest } from '../load.js';

const spec = loadRequest('02-job-change-interpretation');
const C = spec.cutoffs;
const same = (a, b) => (a || '').toLowerCase().replace(/\s+/g, ' ').trim() === (b || '').toLowerCase().replace(/\s+/g, ' ').trim();

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre({ state: { previous, current } }) {
    if (same(previous.position, current.position) && same(previous.company, current.company)) return { action: 'ignore', fired: 'no_change' };
    return null;
  },
  check(a, facts, { state, fit = facts.fit ?? null }) {
    if (facts.customer || facts.open_opportunity) return { action: 'route_to_owner', fired: 'existing_account' };
    if (a.change_type.choice === 'same_job_reworded') return { action: 'ignore', fired: 'same_job_reworded' };
    if (a.change_type.confidence < C.change_type_confidence) return { action: 'review', fired: 'low_confidence', unsure: true };
    if (a.current_role_buys.noul < C.current_role_buys) return { action: 'ignore', fired: 'role_does_not_buy' };
    if (fit !== null && fit < C.min_fit) return { action: 'ignore', fired: 'low_fit' };
    return {
      action: 'reach_out', fired: 'current_role_buys',
      values: { previous_role: state.previous.position, new_role: state.current.position, company: state.current.company,
        change: a.change_type.choice, just_gained_budget: a.new_budget_owner.noul >= C.new_budget_owner },
    };
  },
  write: {
    when: (d) => d.action === spec['3_write'].when,
    ask: spec['3_write'].ask,
    source: (d) => d.values,
    prospect: ({ state }) => ({ title: state.current.position, company: state.current.company }),
  },
};
