import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Request and response files: one playbook = five steps + cases, one saved trace per case.
export const PLAYBOOK_DIR = path.join(ROOT, 'playbooks-JEv');
export const DATA_DIR = path.join(ROOT, 'data');
export const DB_PATH = process.env.JEV_GTM_PLAYBOOK_DB || path.join(ROOT, 'data', 'playbook.db');

export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
  return {
    jevKey: process.env.TYPESAFE_API_KEY || '',
    jevModel: process.env.JEV_MODEL || 'jev-latest',
    writerKey: process.env.OPENROUTER_API_KEY || '',
    writerModel: process.env.WRITER_MODEL || '',
    writerBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    port: Number(process.env.PORT) || 4173,
    // No key, or JEV_MOCK=1: the network commands use made-up answers so the demo runs anywhere.
    mock: process.env.JEV_MOCK === '1' || !process.env.TYPESAFE_API_KEY,
  };
}

// What Jev reads about your business: who you sell to and how you group people. Your own icp.json wins.
export function loadIcp() {
  const own = path.join(ROOT, 'icp.json');
  const file = existsSync(own) ? own : path.join(ROOT, 'icp.example.json');
  return { ...JSON.parse(readFileSync(file, 'utf8')), source: path.basename(file) };
}
