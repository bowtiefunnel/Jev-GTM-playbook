import { loadRequest } from '../load.js';

const spec = loadRequest('03-reply-classification');
const C = spec.cutoffs;
const UNSUBSCRIBE = /\bunsubscribe\b|\bremove me\b|\bopt[- ]?out\b/i;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre({ state }) {
    return UNSUBSCRIBE.test(state.reply) ? { action: 'suppress', fired: 'regex_unsubscribe' } : null;
  },
  check(a, facts, { state }) {
    // Removal is its own question, so no intent can override it.
    if (a.wants_removal.noul >= C.wants_removal) {
      return facts.customer
        ? { action: 'stop_and_alert_owner', fired: 'customer_asked_removal', unsure: true }
        : { action: 'suppress', fired: 'wants_removal' };
    }
    if (a.intent.confidence < C.intent_confidence) return { action: 'human_review', fired: 'low_confidence', unsure: true };
    switch (a.intent.choice) {
      case 'interested': return { action: 'book_meeting', fired: 'intent' };
      case 'not_now': return { action: 'snooze', fired: 'intent', values: { days: C.snooze_days } };
      case 'out_of_office': return { action: 'retry_later', fired: 'intent' };
      case 'objection': return { action: 'human_review', fired: 'objection', unsure: true };
      case 'referral': {
        // Jev decides whether a referral exists. Code copies the address.
        const contact = a.names_another_person.noul >= C.names_another_person ? state.reply.match(EMAIL)?.[0] : null;
        return contact ? { action: 'extract_contact', fired: 'intent', values: { contact } }
          : { action: 'human_review', fired: 'referral_without_address', unsure: true };
      }
      default: return { action: 'close', fired: 'intent' };
    }
  },
  // The suppression list is a fact every other playbook reads in step 0.
  act(row, record, store) {
    if (row.action === 'suppress' && record.email) store.mergeFact(`email:${record.email}`, { suppressed: true });
  },
};
