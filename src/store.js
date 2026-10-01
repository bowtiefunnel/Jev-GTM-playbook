// The three stores in the diagram, in one SQLite file: answers, facts, ledger.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
-- What Jev answered, saved against the fingerprint of what it was shown.
CREATE TABLE IF NOT EXISTS answers (
  fingerprint TEXT PRIMARY KEY, model TEXT, answers TEXT NOT NULL, input_tokens INTEGER, created_at TEXT NOT NULL
);
-- Hard data that overrules Jev. Keys look like "email:ada@acme.test" or "domain:acme.test".
CREATE TABLE IF NOT EXISTS facts (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
-- One row per record per run: what went in, what Jev said, which rule decided, what happened.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY, playbook TEXT NOT NULL, record_key TEXT NOT NULL, fingerprint TEXT,
  input TEXT NOT NULL, facts TEXT NOT NULL, answers TEXT, fired TEXT NOT NULL, action TEXT NOT NULL,
  status TEXT NOT NULL, draft TEXT, guard TEXT, override TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_playbook ON ledger(playbook, status);
`;

const now = () => new Date().toISOString();
const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const factKeys = (record) => [record.domain && `domain:${record.domain}`, record.email && `email:${record.email}`]
  .filter(Boolean).map((k) => k.toLowerCase());

export function openStore(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const getFact = db.prepare('SELECT data FROM facts WHERE key = ?');

  return {
    db,
    getAnswers(fingerprint) {
      const row = db.prepare('SELECT answers FROM answers WHERE fingerprint = ?').get(fingerprint);
      return row ? JSON.parse(row.answers) : null;
    },
    saveAnswers(fingerprint, res) {
      db.prepare('INSERT OR REPLACE INTO answers (fingerprint, model, answers, input_tokens, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(fingerprint, res.model ?? null, JSON.stringify(res.answers), res.usage?.input_tokens ?? 0, now());
    },
    // Company facts first, then the person's, so a person-level fact wins.
    factsFor(record) {
      return Object.assign({}, ...factKeys(record).map((k) => JSON.parse(getFact.get(k)?.data ?? '{}')));
    },
    mergeFact(key, data) {
      key = key.toLowerCase();
      const merged = { ...JSON.parse(getFact.get(key)?.data ?? '{}'), ...data };
      db.prepare('INSERT INTO facts (key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        .run(key, JSON.stringify(merged), now());
    },
    log(row) {
      return Number(db.prepare(`INSERT INTO ledger
        (playbook, record_key, fingerprint, input, facts, answers, fired, action, status, draft, guard, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.playbook, row.record_key, row.fingerprint ?? null, JSON.stringify(row.input), JSON.stringify(row.facts),
          json(row.answers), row.fired, row.action, row.status, row.draft ?? null, json(row.guard), now()).lastInsertRowid);
    },
    ledger({ playbook = null, status = null } = {}) {
      return db.prepare(`SELECT * FROM ledger WHERE (? IS NULL OR playbook = ?) AND (? IS NULL OR status = ?) ORDER BY id`)
        .all(playbook, playbook, status, status);
    },
    // A person disagreed with the result. This is the data cutoffs get tuned from.
    override(id, action, note = '') {
      const done = db.prepare('UPDATE ledger SET override = ? WHERE id = ?').run(JSON.stringify({ action, note, at: now() }), id);
      if (!done.changes) throw new Error(`No ledger row ${id}`);
    },
    // A person approved a checked draft. That is the only way a draft reaches step 4.
    approve(id) {
      const row = db.prepare('SELECT * FROM ledger WHERE id = ?').get(id);
      if (!row) throw new Error(`No ledger row ${id}`);
      if (row.status !== 'needs_approval') throw new Error(`Row ${id} is "${row.status}", not waiting for approval`);
      db.prepare("UPDATE ledger SET status = 'done' WHERE id = ?").run(id);
      return { ...row, status: 'done' };
    },
    overrideRates() {
      return db.prepare(`SELECT playbook, COUNT(*) AS decided, SUM(override IS NOT NULL) AS overridden
        FROM ledger WHERE status != 'filtered' GROUP BY playbook ORDER BY playbook`).all()
        .map((r) => ({ ...r, rate: r.overridden / r.decided }));
    },
  };
}
