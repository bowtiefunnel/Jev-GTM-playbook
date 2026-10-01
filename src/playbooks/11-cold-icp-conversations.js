import { loadRequest } from '../load.js';

const spec = loadRequest('11-cold-icp-conversations');
const C = spec.cutoffs;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  // record.days_quiet is computed by whoever builds the records. Jev cannot do date arithmetic.
  pre(record, facts) {
    if (!(record.days_quiet > C.quiet_days)) return { action: 'skip', fired: 'not_quiet_yet' };
    if (facts.customer) return { action: 'skip', fired: 'existing_customer' };
    return null;
  },
  check(a, facts, record) {
    if (a.topic.choice !== 'sales_conversation') return { action: 'ignore', fired: `topic_${a.topic.choice}` };
    if (a.buying_interest.noul < C.buying_interest) return { action: 'ignore', fired: 'no_buying_interest' };
    const fit = record.fit ?? facts.fit ?? null;
    if (fit !== null && fit < C.min_fit) return { action: 'ignore', fired: 'low_fit' };
    return { action: 'revive', fired: 'buying_interest', values: { i_owe_the_reply: a.who_owes_reply.choice === 'me' } };
  },
};
