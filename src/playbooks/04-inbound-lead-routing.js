import { loadRequest } from '../load.js';

const spec = loadRequest('04-inbound-lead-routing');
const C = spec.cutoffs;
const TEST_STRING = /^\s*(test|asdf|qwerty)(\s+(test|asdf|qwerty))*\s*$/i;

export default {
  id: spec.playbook,
  shape: spec.shape,
  questions: spec.questions,
  pre({ state }, facts) {
    if (TEST_STRING.test(state.lead.message)) return { action: 'discard', fired: 'test_string' };
    if (facts.customer) return { action: 'route_to_csm', fired: 'existing_customer' };
    return null;
  },
  check(a, facts, { state }) {
    // Hard data first. Enrichment headcount overrules both Jev and the size typed in the form.
    const employees = facts.employees ?? null;
    if (a.route.choice === 'account_executive' && employees !== null && employees < C.min_employees) {
      return { action: 'sdr_review', fired: 'headcount_below_minimum', unsure: true };
    }
    if (a.is_vendor_pitch.noul >= C.is_vendor_pitch) return { action: 'partner_inbox', fired: 'is_vendor_pitch' };
    if (a.route.choice === 'junk' && a.route.confidence >= C.junk_confidence) return { action: 'discard', fired: 'junk' };
    if (a.route.confidence < C.route_confidence) return { action: 'sdr_review', fired: 'low_confidence', unsure: true };
    if (a.route.choice === 'account_executive' && a.urgency.score >= C.urgency) {
      return {
        action: 'ae_now', fired: 'ae_and_urgent',
        values: { role: state.lead.role, employees: employees ?? Number(state.lead.company_size),
          urgency: spec.questions.urgency.criteria[Math.round(a.urgency.score)] },
      };
    }
    return { action: a.route.choice, fired: 'route' };
  },
  write: {
    when: (d) => d.action === spec['3_write'].when,
    ask: spec['3_write'].ask,
    source: (d) => d.values,
    // No prospect: this is an internal brief, so the message-score half of the guard does not apply.
  },
};
