// Reads LinkedIn's Connections.csv export. The file starts with a few "Notes:"
// lines before the real header, so we look for the header instead of assuming row 1.

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

export function readConnections(text) {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r.includes('First Name') && r.includes('Company'));
  if (headerAt === -1) {
    throw new Error('This does not look like a LinkedIn Connections.csv (no "First Name" / "Company" header found).');
  }
  const col = Object.fromEntries(rows[headerAt].map((name, i) => [clean(name), i]));
  const get = (r, name) => clean(r[col[name]]);
  const people = new Map();
  for (const r of rows.slice(headerAt + 1)) {
    const person = {
      first_name: get(r, 'First Name'),
      last_name: get(r, 'Last Name'),
      url: get(r, 'URL'),
      email: get(r, 'Email Address'),
      company: get(r, 'Company'),
      position: get(r, 'Position'),
      connected_on: get(r, 'Connected On'),
    };
    if (!person.first_name && !person.last_name && !person.url) continue;
    person.key = personKey(person);
    people.set(person.key, person);
  }
  return [...people.values()];
}

// Any other lead list (Apollo, Clay, Sales Navigator, a CRM export): find the columns by common names.
const ALIASES = {
  first_name: ['first name', 'firstname', 'first'],
  last_name: ['last name', 'lastname', 'last', 'surname'],
  full_name: ['name', 'full name', 'fullname', 'person name', 'contact name'],
  url: ['linkedin url', 'linkedin', 'linkedin profile', 'person linkedin url', 'profile url', 'url', 'linkedin_url'],
  email: ['email', 'email address', 'work email', 'business email'],
  company: ['company', 'company name', 'organization', 'organisation', 'account', 'account name', 'employer'],
  position: ['title', 'job title', 'position', 'role', 'headline'],
};

export function readList(text) {
  const rows = parseCsv(text);
  if (rows.some((r) => r.includes('First Name') && r.includes('Connected On'))) return readConnections(text);
  const norm = (h) => clean(h).toLowerCase().replace(/[_-]+/g, ' ');
  const headerAt = rows.findIndex((r) => r.some((h) => ALIASES.position.includes(norm(h))) && r.some((h) => ALIASES.company.includes(norm(h))));
  if (headerAt === -1) {
    throw new Error('Could not find a job title column and a company column. Rename them to "Title" and "Company" and try again.');
  }
  const header = rows[headerAt].map(norm);
  const col = Object.fromEntries(Object.entries(ALIASES).map(([field, names]) => [field, header.findIndex((h) => names.includes(h))]));
  const get = (r, field) => (col[field] === -1 ? '' : clean(r[col[field]]));
  const people = new Map();
  for (const r of rows.slice(headerAt + 1)) {
    let first = get(r, 'first_name'), last = get(r, 'last_name');
    if (!first && !last && get(r, 'full_name')) {
      const [f, ...rest] = get(r, 'full_name').split(' ');
      first = f; last = rest.join(' ');
    }
    const person = { first_name: first, last_name: last, url: get(r, 'url'), email: get(r, 'email'),
      company: get(r, 'company'), position: get(r, 'position'), connected_on: '' };
    if (!person.position && !person.company) continue;
    person.key = personKey(person);
    people.set(person.key, person);
  }
  return [...people.values()];
}

// The profile URL is the only stable id in the export.
export function personKey(p) {
  if (p.url) return p.url.toLowerCase().replace(/\/+$/, '');
  if (p.email) return `email:${p.email.toLowerCase()}`;
  return `name:${p.first_name}|${p.last_name}|${p.connected_on || p.company}`.toLowerCase();
}

export const sameText = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
