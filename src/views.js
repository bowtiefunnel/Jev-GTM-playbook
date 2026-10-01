// What the dashboard and the CLI show. Everything is decided again from stored answers each
// time, so a changed weight, cutoff or fact shows up at once with no new Jev call.
import { networkDb, networkDeps, personRecord, changeRecord } from './network.js';
import { preview } from './spine.js';
import jobChange from './playbooks/02-job-change-interpretation.js';

export const USD_PER_MILLION_INPUT_TOKENS = 0.042; // check https://docs.typesafe.ai/models
const name = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || '(no name)';
// The export is user-supplied text; never let it become a javascript: link in the dashboard.
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
export const usd = (tokens) => (tokens / 1_000_000) * USD_PER_MILLION_INPUT_TOKENS;

export function listPeople(store, icp, env) {
  const deps = networkDeps(store, icp, env);
  return networkDb(store).prepare('SELECT * FROM people').all().map((r) => {
    const d = preview(deps.scoring, personRecord(icp, r), deps.people);
    const scored = d && !d.filtered;
    return {
      key: r.key, name: name(r), url: safeUrl(r.url), company: r.company, position: r.position,
      connected_on: r.connected_on, skipped: d?.filtered ? d.fired : null,
      fit: scored ? d.values.fit : null,
      parts: scored ? d.values.parts : null,
      persona: scored ? d.values.persona : null,
      persona_confidence: scored ? d.values.persona_confidence : null,
    };
  }).sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));
}

const REASON = {
  no_change: () => 'Same job, nothing changed',
  same_job_reworded: () => 'Same job, title just reworded',
  existing_account: () => 'Already a customer or an open opportunity: goes to the account owner',
  low_confidence: () => 'Jev was not sure what kind of change this is',
  role_does_not_buy: (fit, pct) => `The new role does not buy this (${pct}%)`,
  low_fit: (fit, pct) => `The new role buys this (${pct}%), but fit is only ${fit}`,
  current_role_buys: (fit, pct, d) => `Fits your ICP (fit ${fit ?? 'unknown'}) and the new role buys this (${pct}%)${d.values.just_gained_budget ? ', and they just gained the budget' : ''}`,
  suppressed: () => 'On the suppression list',
};

export function listChanges(store, icp, env) {
  const deps = networkDeps(store, icp, env);
  const fits = new Map(listPeople(store, icp, env).map((p) => [p.key, p.fit]));
  const rows = networkDb(store).prepare(`SELECT c.*, p.first_name, p.last_name, p.url, p.email, p.company_domain FROM changes c
    JOIN people p ON p.key = c.person_key ORDER BY c.id DESC`).all();
  const order = { reach_out: 0, review: 1, route_to_owner: 1, pending: 2, ignore: 3, skip: 3 };
  return rows.map((r) => {
    const fit = fits.get(r.person_key) ?? null;
    let routed;
    if (r.kind === 'new_connection') {
      // A new connection is not a job change, so there is nothing for playbook 02 to interpret.
      routed = fit === null ? { action: 'ignore', reason: 'New connection, not scored' }
        : fit >= deps.scoring.fitCutoff ? { action: 'review', reason: `New connection who fits your ICP (fit ${fit})` }
        : { action: 'ignore', reason: `New connection, low fit (${fit})` };
    } else {
      const d = preview(jobChange, changeRecord(icp, r, r, fit), deps.changes);
      const pct = d?.answers ? Math.round(d.answers.current_role_buys.noul * 100) : null;
      routed = d ? { action: d.action === 'route_to_owner' ? 'review' : d.action === 'skip' ? 'ignore' : d.action,
        signal: d.answers?.current_role_buys.noul, change_type: d.answers?.change_type.choice ?? null,
        reason: (REASON[d.fired] ?? (() => d.fired))(fit, pct, d) }
        : { action: 'pending', reason: 'Not judged yet' };
    }
    return {
      id: r.id, name: name(r), url: safeUrl(r.url), kind: r.kind, status: r.status, detected_at: r.detected_at,
      from: { position: r.prev_position, company: r.prev_company },
      to: { position: r.new_position, company: r.new_company },
      change_type: null, fit, ...routed,
    };
  }).sort((a, b) => order[a.action] - order[b.action] || b.id - a.id);
}

export function summary(store, icp, env) {
  const db = networkDb(store);
  const one = (sql) => Object.values(db.prepare(sql).get())[0] ?? 0;
  const real = `FROM answers WHERE model ${env.mock ? '' : 'NOT '}LIKE 'mock%'`;
  const tokens = one(`SELECT SUM(input_tokens) ${real}`);
  const changes = listChanges(store, icp, env).filter((c) => c.status === 'new');
  return {
    mode: env.mock ? 'mock' : 'jev',
    model: env.jevModel,
    icp_source: icp.source,
    people: one('SELECT COUNT(*) FROM people'),
    skipped: listPeople(store, icp, env).filter((p) => p.skipped).length,
    snapshots: one('SELECT COUNT(*) FROM snapshots'),
    jev_calls: one(`SELECT COUNT(*) ${real}`),
    input_tokens: tokens,
    cost_usd: usd(tokens),
    reach_out: changes.filter((c) => c.action === 'reach_out').length,
    review: changes.filter((c) => c.action === 'review').length,
    last_run: db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get() ?? null,
  };
}

// A spreadsheet-friendly copy of the results. Written locally; nothing is uploaded.
export function scoredCsv(store, icp, env) {
  const pct = (v) => (v == null ? '' : Math.round(v * 100));
  // Leading = + - @ would run as a formula in Excel or Sheets, so neutralise it.
  const cell = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@]/.test(t)) t = `'${t}`;
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const header = ['Fit (0-100)', 'Name', 'Position', 'Company', 'Group', 'Role fit %', 'Seniority %',
    'Likely buyer %', 'Company fit %', 'Skipped (free)', 'Connected on', 'URL'];
  const rows = listPeople(store, icp, env).map((p) => [p.fit ?? '', p.name, p.position, p.company, p.persona ?? '',
    pct(p.parts?.role_fit), pct(p.parts?.seniority), pct(p.parts?.likely_buyer), pct(p.parts?.company_fit),
    p.skipped ?? '', p.connected_on, p.url ?? '']);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
