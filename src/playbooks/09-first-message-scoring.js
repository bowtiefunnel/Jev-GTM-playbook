import { loadRequest } from '../load.js';
import { draftProblems, literalProblems } from '../guard.js';

const spec = loadRequest('09-first-message-scoring');

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre({ state }) {
    const problems = literalProblems(state.message);
    return problems.length ? { action: 'rewrite', fired: problems.join('; ') } : null;
  },
  check(a) {
    const problems = draftProblems(a);
    return problems.length ? { action: 'rewrite', fired: problems.join('; ') } : { action: 'send', fired: 'no_problems' };
  },
};
