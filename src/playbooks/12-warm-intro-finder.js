import { loadRequest } from '../load.js';

const spec = loadRequest('12-warm-intro-finder');
const C = spec.cutoffs;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  check(a, facts, record) {
    const values = { path: a.path_to_buyer.choice, strength: a.intro_strength.score };
    // Jev sees titles only. A connection you never messaged is a cold intro whatever the title says.
    if (record.message_count === 0) return { action: 'intro_path', fired: 'never_messaged', values: { ...values, strength: Math.min(values.strength, C.never_messaged_cap) } };
    return { action: 'intro_path', fired: 'intro_strength', values };
  },
};
