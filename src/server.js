import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ROOT, loadIcp } from './config.js';
import { getSetting, networkDb, runOnce, setSetting } from './network.js';
import { readList } from './csv.js';
import { listChanges, listPeople, scoredCsv, summary } from './views.js';

const MAX_UPLOAD = 25 * 1024 * 1024;

export function startServer(store, env) {
  const db = networkDb(store);
  let running = null;
  const run = () => (running ??= runOnce(store, loadIcp(), env, { dataDir: DATA_DIR, log: console.log })
    .finally(() => { running = null; }));

  const routes = {
    'GET /api/summary': () => ({ ...summary(store, loadIcp(), env), running: Boolean(running), schedule: schedule(db) }),
    'GET /api/people': () => listPeople(store, loadIcp(), env),
    'GET /api/changes': () => listChanges(store, loadIcp(), env),
    'GET /api/runs': () => db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 30').all(),
    'POST /api/run': () => run(),
    'POST /api/upload': (body) => {
      const count = readList(body).length; // throws if there is no title or company column
      const file = `connections-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      writeFileSync(path.join(DATA_DIR, file), body);
      return { saved: file, connections: count };
    },
    'POST /api/schedule': (body) => {
      const { enabled, time } = JSON.parse(body);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Time must look like 07:30');
      setSetting(db, 'schedule', { enabled: Boolean(enabled), time });
      return schedule(db);
    },
    'POST /api/change-status': (body) => {
      const { id, status } = JSON.parse(body);
      if (!['new', 'done', 'dismissed'].includes(status)) throw new Error('Unknown status');
      db.prepare('UPDATE changes SET status = ? WHERE id = ?').run(status, id);
      return { ok: true };
    },
  };

  const server = http.createServer(async (req, res) => {
    const send = (code, data, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    try {
      // DNS-rebinding guard: a hostile page that points its own domain at 127.0.0.1 still sends its own Host header.
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(403, { error: 'Forbidden' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') {
        return send(200, readFileSync(path.join(ROOT, 'public/index.html')), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/scored-connections.csv') {
        res.setHeader('Content-Disposition', 'attachment; filename="scored-connections.csv"');
        return send(200, scoredCsv(store, loadIcp(), env), 'text/csv; charset=utf-8');
      }
      // This dashboard holds your contacts. Refuse requests sent by other websites.
      const origin = req.headers.origin;
      if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(403, { error: 'Forbidden' });

      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) return send(404, { error: 'Not found' });
      send(200, await handler(req.method === 'POST' ? await readBody(req) : ''));
    } catch (err) {
      send(400, { error: err.message });
    }
  });

  // The "cron": once a minute, check whether today's run is due. Only works while this server is running.
  setInterval(() => {
    const { enabled, time } = schedule(db);
    const today = new Date().toLocaleDateString('en-CA');
    const clock = new Date().toTimeString().slice(0, 5);
    if (!enabled || clock < time || getSetting(db, 'last_scheduled_day') === today) return;
    setSetting(db, 'last_scheduled_day', today);
    console.log(`[${clock}] Scheduled run starting`);
    run().catch((err) => console.error(err.message));
  }, 60_000).unref();

  server.listen(env.port, '127.0.0.1', () => {
    console.log(`jev-gtm-playbook dashboard: http://localhost:${env.port}${env.mock ? '  (MOCK MODE: no TYPESAFE_API_KEY, answers are made up)' : ''}`);
  });
  return server;
}

const schedule = (db) => getSetting(db, 'schedule', { enabled: false, time: '07:30' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) { reject(new Error('Upload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
