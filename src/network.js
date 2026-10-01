// The network app behind playbooks 01 and 13, on the spine.
// Code keeps snapshots of a list and notices who changed. Playbook 01 scores each person;
// playbook 02 interprets each job change. Nothing here calls Jev directly.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readList, sameText } from './csv.js';
import { askJev } from './jev.js';
import { mockJev } from './mock.js';
import { fingerprint, runRecord } from './spine.js';
import { forIcp, stateFor } from './playbooks/01-linkedin-network-icp.js';
import jobChange from './playbooks/02-job-change-interpretation.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY, imported_at TEXT NOT NULL, source_file TEXT, file_hash TEXT UNIQUE, row_count INTEGER
);
-- Facts we observed. Never sent anywhere. 'judged' is the fingerprint of what playbook 01 last saw.
CREATE TABLE IF NOT EXISTS people (
  key TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, url TEXT, email TEXT,
  company TEXT, position TEXT, connected_on TEXT, company_description TEXT, company_domain TEXT,
  first_seen INTEGER, last_seen INTEGER, judged TEXT
);
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY, person_key TEXT NOT NULL, snapshot_id INTEGER NOT NULL, kind TEXT NOT NULL,
  prev_company TEXT, prev_position TEXT, new_company TEXT, new_position TEXT,
  detected_at TEXT NOT NULL, judged INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new'
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, mode TEXT,
  imported INTEGER DEFAULT 0, changes INTEGER DEFAULT 0, judged INTEGER DEFAULT 0,
  reused INTEGER DEFAULT 0, skipped INTEGER DEFAULT 0, input_tokens INTEGER DEFAULT 0, errors TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
-- What an enrichment provider returned, with a fingerprint of the parts we use, so a
-- re-enrichment that finds nothing new is recognised as "unchanged".
CREATE TABLE IF NOT EXISTS enrichments (
  id INTEGER PRIMARY KEY, person_key TEXT NOT NULL, provider TEXT NOT NULL, fetched_at TEXT NOT NULL,
  found INTEGER NOT NULL, fingerprint TEXT, result TEXT
);
CREATE INDEX IF NOT EXISTS enrichments_person ON enrichments(person_key, fetched_at);
CREATE INDEX IF NOT EXISTS changes_person ON changes(person_key);
`;

const now = () => new Date().toISOString();

// Adds the network tables to the playbook's store and returns its database handle.
export function networkDb(store) {
  store.db.exec(SCHEMA);
  return store.db;
}

export function getSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

// Store the snapshot and compare it with what we already knew.
// Pure code. No model involved in noticing that something changed.
export function importCsv(db, text, sourceFile = 'upload.csv') {
  const fileHash = createHash('sha256').update(text).digest('hex');
  if (db.prepare('SELECT id FROM snapshots WHERE file_hash = ?').get(fileHash)) {
    return { duplicate: true, imported: 0, changes: 0 };
  }
  return applySnapshot(db, readList(text), sourceFile, fileHash);
}

// Store one snapshot of rows and diff it against what we knew. Used by CSV imports
// and by enrichment, so both get the same change detection.
export function applySnapshot(db, rows, sourceFile, fileHash) {
  const isFirst = !db.prepare('SELECT id FROM snapshots LIMIT 1').get();
  const getPerson = db.prepare('SELECT * FROM people WHERE key = ?');
  const addChange = db.prepare(`INSERT INTO changes
    (person_key, snapshot_id, kind, prev_company, prev_position, new_company, new_position, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let changes = 0;

  db.exec('BEGIN');
  try {
    const snapshotId = db.prepare('INSERT INTO snapshots (imported_at, source_file, file_hash, row_count) VALUES (?, ?, ?, ?)')
      .run(now(), sourceFile, fileHash, rows.length).lastInsertRowid;

    for (const p of rows) {
      const known = getPerson.get(p.key);
      if (!known) {
        db.prepare(`INSERT INTO people (key, first_name, last_name, url, email, company, position, connected_on, first_seen, last_seen, company_description, company_domain)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(p.key, p.first_name, p.last_name, p.url, p.email, p.company, p.position, p.connected_on, snapshotId, snapshotId, p.company_description ?? null, p.company_domain ?? null);
        // Everyone is "new" in the first import, so that is a baseline, not a signal.
        if (!isFirst) { addChange.run(p.key, snapshotId, 'new_connection', null, null, p.company, p.position, now()); changes++; }
        continue;
      }
      // Enrichment can add a description or a domain; that is context, not a job change.
      if (p.company_description) db.prepare('UPDATE people SET company_description = ? WHERE key = ?').run(p.company_description, p.key);
      if (p.company_domain) db.prepare('UPDATE people SET company_domain = ? WHERE key = ?').run(p.company_domain, p.key);
      // A blank row usually means the person hid the field, not that they quit.
      const blank = !p.company && !p.position;
      const companyChanged = !blank && !sameText(known.company, p.company);
      const positionChanged = !blank && !sameText(known.position, p.position);
      if (companyChanged || positionChanged) {
        addChange.run(p.key, snapshotId, companyChanged ? 'company_change' : 'role_change',
          known.company, known.position, p.company, p.position, now());
        changes++;
        db.prepare('UPDATE people SET company = ?, position = ?, last_seen = ? WHERE key = ?')
          .run(p.company, p.position, snapshotId, p.key);
      } else {
        db.prepare('UPDATE people SET last_seen = ? WHERE key = ?').run(snapshotId, p.key);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { duplicate: false, imported: rows.length, changes };
}

// A person as a playbook 01 record. email and domain are how facts are found; neither reaches Jev.
export const personRecord = (icp, person) => ({
  key: person.key, email: person.email || undefined, domain: person.company_domain || undefined, state: stateFor(icp, person),
});

// A detected job change as a playbook 02 record. The fit score comes from playbook 01.
export const changeRecord = (icp, change, person, fit) => ({
  key: `change:${change.id}`, email: person.email || undefined, domain: person.company_domain || undefined, fit,
  state: {
    what_we_sell: icp.ideal_customer.what_we_sell,
    previous: { position: change.prev_position || 'unknown', company: change.prev_company || 'unknown' },
    current: { position: change.new_position || 'unknown', company: change.new_company || 'unknown' },
  },
});

// Made-up answers for playbook 02's questions, so the demo and tests run with no key.
const mockChange = ({ state, questions }, base) => {
  const { answers, ...rest } = mockJev({
    state: { connection: { current_position: state.current.position, current_company: state.current.company }, previous: state.previous },
    questions: { ...base, ...questions },
  });
  return { ...rest, answers: { change_type: answers.change_type, new_budget_owner: answers.new_budget_owner, current_role_buys: answers.current_role_buys } };
};

// The spine's deps for the network app. Mock answers are stored under the model name 'mock',
// so they can never be mistaken for real ones once a key is added.
export function networkDeps(store, icp, env, writer = null) {
  const scoring = forIcp(icp);
  const live = (req) => askJev({ apiKey: env.jevKey, model: env.jevModel, ...req });
  return {
    scoring,
    people: { store, model: env.mock ? 'mock' : env.jevModel, jev: env.mock ? async (req) => mockJev(req) : live },
    changes: { store, writer, model: env.mock ? 'mock' : env.jevModel, jev: env.mock ? async (req) => mockChange(req, scoring.questions) : live },
  };
}

// Score everyone whose role, company or ICP changed since they were last scored, then
// interpret each job change that has not been interpreted yet. Both go through the spine.
export async function scoreNetwork(store, icp, env, { log = () => {}, writer = null } = {}) {
  const db = networkDb(store);
  const deps = networkDeps(store, icp, env, writer);
  const stats = { judged: 0, reused: 0, skipped: 0, input_tokens: 0, errors: [] };
  deps.people.stats = deps.changes.stats = stats;
  const fits = new Map();
  let done = 0;

  const people = db.prepare('SELECT * FROM people').all();
  for (const person of people) {
    const record = personRecord(icp, person);
    const fp = fingerprint(deps.scoring.questions, deps.people.model, record.state);
    // Same role, company, ICP and questions as last time: nothing to do, and nothing new to log.
    if (person.judged === fp) { stats.reused++; continue; }
    try {
      const row = await runRecord(deps.scoring, record, deps.people);
      if (row.status === 'filtered') stats.skipped++;
      else fits.set(person.key, row.values.fit);
      db.prepare('UPDATE people SET judged = ? WHERE key = ?').run(fp, person.key);
    } catch (err) {
      stats.errors.push(err.message);
      if (err.status === 401) throw err; // a bad key fails every call, so stop early
    }
    if (++done % 25 === 0) log(`  scored ${done}`);
  }

  const person = db.prepare('SELECT * FROM people WHERE key = ?');
  for (const change of db.prepare(`SELECT * FROM changes WHERE judged = 0 AND kind != 'new_connection'`).all()) {
    try {
      await runRecord(jobChange, changeRecord(icp, change, person.get(change.person_key), fits.get(change.person_key) ?? null), deps.changes);
      db.prepare('UPDATE changes SET judged = 1 WHERE id = ?').run(change.id);
    } catch (err) {
      stats.errors.push(err.message);
      if (err.status === 401) throw err;
    }
  }
  return stats;
}

// One full pass: pick up any new CSV in data/, then score what needs scoring.
export async function runOnce(store, icp, env, { dataDir, log = () => {} } = {}) {
  const db = networkDb(store);
  const runId = db.prepare('INSERT INTO runs (started_at, mode) VALUES (?, ?)').run(now(), env.mock ? 'mock' : 'jev').lastInsertRowid;
  const totals = { imported: 0, changes: 0 };
  const errors = [];
  if (dataDir) {
    const files = readdirSync(dataDir).filter((f) => f.toLowerCase().endsWith('.csv') && !f.startsWith('scored-'))
      .map((f) => path.join(dataDir, f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    for (const file of files) {
      try {
        const result = importCsv(db, readFileSync(file, 'utf8'), path.basename(file));
        if (result.duplicate) continue;
        log(`Imported ${path.basename(file)}: ${result.imported} connections, ${result.changes} changes`);
        totals.imported += result.imported;
        totals.changes += result.changes;
      } catch (err) { errors.push(`${path.basename(file)}: ${err.message}`); }
    }
  }
  let stats = { judged: 0, reused: 0, skipped: 0, input_tokens: 0, errors: [] };
  try { stats = await scoreNetwork(store, icp, env, { log }); } catch (err) { errors.push(err.message); }
  errors.push(...stats.errors);
  db.prepare(`UPDATE runs SET finished_at = ?, imported = ?, changes = ?, judged = ?, reused = ?, skipped = ?, input_tokens = ?, errors = ? WHERE id = ?`)
    .run(now(), totals.imported, totals.changes, stats.judged, stats.reused, stats.skipped, stats.input_tokens,
      errors.length ? JSON.stringify([...new Set(errors)].slice(0, 5)) : null, runId);
  return { runId, ...totals, ...stats, errors };
}
