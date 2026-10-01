import { loadRequest } from '../load.js';

const spec = loadRequest('15-pick-the-follow-up');
const C = spec.cutoffs;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  // record.touches is counted by whoever builds the records.
  check(a, facts, record) {
    if (a.next_step.choice === 'stop') return { action: 'stop', fired: 'stop' }; // always respect a no, however sure
    if ((record.touches ?? 0) >= C.max_touches) return { action: 'stop', fired: 'max_touches' };
    if (a.next_step.choice === 'answer_manually') return { action: 'human', fired: 'answer_manually', unsure: true };
    if (a.next_step.confidence < C.next_step_confidence) return { action: 'human', fired: 'low_confidence', unsure: true };
    return { action: `send:${a.next_step.choice}`, fired: 'next_step' }; // your template, unchanged
  },
};
