import { loadRequest } from '../load.js';

const spec = loadRequest('14-social-signal-triage');
const C = spec.cutoffs;
const JOB_AD = /\b(we'?re|we are) hiring\b|\bapply (via|now|here)\b|\bjob opening\b/i;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre({ state }, facts) {
    if (JOB_AD.test(`${state.post.title} ${state.post.body}`)) return { action: 'ignore', fired: 'job_ad' };
    if (facts.competitor) return { action: 'ignore', fired: 'competitor' };
    if (facts.customer) return { action: 'route_to_owner', fired: 'existing_customer' };
    return null;
  },
  check(a) {
    if (a.self_promotion.noul >= C.self_promotion) return { action: 'ignore', fired: 'self_promotion' };
    if (a.action.confidence < C.action_confidence) return { action: 'review', fired: 'low_confidence', unsure: true };
    if (a.action.choice === 'engage' && a.author_is_buyer.noul >= C.author_is_buyer) return { action: 'engage', fired: 'buyer_with_a_problem' };
    return { action: a.action.choice === 'ignore' ? 'ignore' : 'monitor', fired: 'action' };
  },
};
