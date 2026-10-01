import { loadRequest } from '../load.js';
import { gateFirstLine } from '../guard.js';

const spec = loadRequest('08-personalization-fact-check');

// The same gate the spine runs on every draft, exposed as a playbook so it can be replayed and tuned.
export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  check: (a) => gateFirstLine(a),
};
