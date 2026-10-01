import { loadRequest } from '../load.js';

const spec = loadRequest('05-connection-request-intent');
const C = spec.cutoffs;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre(record, facts) {
    if (record.direction && record.direction !== 'INCOMING') return { action: 'skip', fired: 'not_incoming' };
    if (!record.state.invitation_message?.trim()) return { action: 'skip', fired: 'no_message' };
    // A target account goes to the top whatever the message says, so it needs no judgment.
    if (facts.target_account) return { action: 'reply', fired: 'target_account' };
    return null;
  },
  check(a) {
    if (a.intent.choice === 'potential_buyer' && a.intent.confidence >= C.intent_confidence) {
      return { action: 'reply', fired: 'potential_buyer', values: { rank: a.worth_a_reply.noul } };
    }
    return { action: 'ignore', fired: `intent_${a.intent.choice}` };
  },
};
