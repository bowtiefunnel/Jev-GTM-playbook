// Made-up answers in the same format Jev returns, so the demo and the tests run
// without a key. These come from keyword matching and are NOT real judgments.

const LEVELS = [
  [/\b(founder|owner|ceo|cro|cmo|coo|cto|chief|partner|president)\b/i, 4],
  [/\b(vp|vice president|director|head of)\b/i, 3],
  [/\b(manager|lead)\b/i, 2],
  [/\b(student|intern)\b/i, 0],
];
const TARGET = /\b(sales|revenue|growth|marketing|founder|ceo|cro|gtm|demand)\b/i;

const spread = (keys, winner, p) =>
  Object.fromEntries(keys.map((k) => [k, k === winner ? p : (1 - p) / (keys.length - 1)]));

function scoreAnswer(criteria, level, p = 0.8) {
  const keys = criteria.map((_, i) => String(i));
  const probabilities = spread(keys, String(level), p);
  const score = keys.reduce((sum, k) => sum + Number(k) * probabilities[k], 0);
  return { type: 'score', score, confidence: p, probabilities, legend: Object.fromEntries(criteria.map((c, i) => [i, c])) };
}

function choiceAnswer(criteria, choice, p = 0.8) {
  return { type: 'choice', choice, confidence: p, probabilities: spread(Object.keys(criteria), choice, p) };
}

function persona(title, personas) {
  const guess = [
    [/founder|ceo|owner/i, 'founder_or_ceo'], [/sales|cro/i, 'sales_leader'],
    [/marketing|growth|demand/i, 'marketing_or_growth_leader'], [/operations|revops/i, 'revenue_operations'],
  ].find(([re, key]) => re.test(title) && key in personas);
  return guess ? guess[1] : Object.keys(personas).at(-1);
}

export function mockJev({ state, questions }) {
  const title = state.connection.current_position;
  const level = (LEVELS.find(([re]) => re.test(title)) || [null, 1])[1];
  const onTarget = TARGET.test(title);
  const answers = {
    persona: choiceAnswer(questions.persona.criteria, persona(title, questions.persona.criteria)),
    seniority: scoreAnswer(questions.seniority.criteria, level),
    role_fit: scoreAnswer(questions.role_fit.criteria, onTarget ? (level >= 3 ? 3 : 2) : 0),
    company_fit: choiceAnswer(questions.company_fit.criteria, 'cannot_tell', 0.7),
    likely_buyer: { type: 'noul', noul: onTarget && level >= 3 ? 0.9 : onTarget ? 0.4 : 0.05 },
  };
  if (state.previous) {
    const before = (LEVELS.find(([re]) => re.test(state.previous.position)) || [null, 1])[1];
    const strip = (s) => s.toLowerCase().replace(/senior/g, 'sr').replace(/[^a-z]/g, '');
    const reworded = strip(title) === strip(state.previous.position)
      && state.previous.company === state.connection.current_company;
    const kind = reworded ? 'same_job_reworded' : level > before ? 'moved_up' : level === before ? 'moved_sideways' : 'moved_down_or_unclear';
    answers.change_type = choiceAnswer(questions.change_type.criteria, kind);
    answers.new_budget_owner = { type: 'noul', noul: level > before && onTarget ? 0.85 : 0.2 };
    answers.current_role_buys = { type: 'noul', noul: onTarget && level >= 3 ? 0.88 : onTarget ? 0.45 : 0.08 };
  }
  const input_tokens = Math.ceil(JSON.stringify({ state, questions }).length / 4);
  return { model: 'mock (not Jev)', answers, usage: { input_tokens, output_tokens: 0 } };
}
