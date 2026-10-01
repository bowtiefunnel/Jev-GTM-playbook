#!/usr/bin/env node
// Writes one page per playbook, and the index, from the request and response files.
//   node src/docs.js           check that every page still matches its JSON
//   node src/docs.js --write   rewrite playbooks-JEv/*.md after changing a request file or a trace
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYBOOK_DIR } from './config.js';
import { loadRequest } from './load.js';
import { PLAYBOOKS } from './playbooks/index.js';

const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const list = (items) => items.map((i) => `- ${i}`).join('\n');
const PRIMITIVE = { choice: 'Choice', score: 'Score', noul: 'Noul' };

const answer = (name, a) => (a.type === 'noul' ? `${name}: ${Math.round(a.noul * 100)}%`
  : a.type === 'choice' ? `${name}: ${a.choice} (${a.confidence.toFixed(2)})`
  : `${name}: ${a.score.toFixed(2)} of ${Object.keys(a.probabilities).length - 1}`);

function resultRow(label, trace) {
  const judged = trace['1_judge'];
  const said = judged.called ? Object.entries(judged.response.answers).map(([k, a]) => answer(k, a)).join('<br>') : 'not asked';
  const decided = trace['2_check'] ?? trace['0_filter_and_cache'];
  return [label, said, `\`${decided.fired}\``, `\`${trace['4_act'].action}\``, trace['4_act'].status];
}

export function renderDoc(id) {
  const spec = loadRequest(id);
  const traces = JSON.parse(readFileSync(path.join(PLAYBOOK_DIR, 'responses', `${id}.json`), 'utf8'));
  const [filter, check, write, act] = [spec['0_filter_and_cache'], spec['2_check'], spec['3_write'], spec['4_act']];
  const names = Object.keys(spec.questions).join(', ');
  const first = Object.values(traces).find((t) => t['1_judge'].called)['1_judge'].response;
  const flow = write
    ? `    F["0 Filter and cache<br/>code"] --> J["1 Judge<br/>Jev: ${names}"] --> C["2 Check<br/>code"]
    C -- "${write.when}" --> W["3 Write<br/>LLM"]
    W -- "draft, back to Check" --> C
    C -- approved --> A["4 Act<br/>code"]
    C -. unsure .-> P["A person decides"]`
    : `    F["0 Filter and cache<br/>code"] --> J["1 Judge<br/>Jev: ${names}"] --> C["2 Check<br/>code"]
    C -- approved --> A["4 Act<br/>code"]${check.unsure.length ? '\n    C -. unsure .-> P["A person decides"]' : ''}`;

  return `# ${id.slice(0, 2)} · ${spec.title}

${spec.about}

**Shape:** ${spec.shape}. Request file: [\`requests/${id}.json\`](requests/${id}.json). Saved traces: [\`responses/${id}.json\`](responses/${id}.json).

\`\`\`mermaid
flowchart LR
${flow}
\`\`\`

## 0 · Filter and cache (code)

${list(filter.rules)}

${filter.cache}

## 1 · Judge (Jev)

One request per record, all questions together.

${table(['Question', 'Primitive', 'What it asks'], Object.entries(spec.questions).map(([k, q]) => [`\`${k}\``, PRIMITIVE[q.type], q.instructions]))}

## 2 · Check (code)

${check.facts.length ? `**Facts that overrule Jev:** ${check.facts.map((f) => `\`${f}\``).join(', ')}.` : '**Facts that overrule Jev:** none. This playbook checks cutoffs only.'}

${table(['Cutoff', 'Value'], Object.entries(check.cutoffs).map(([k, v]) => [`\`${k}\``, typeof v === 'object' ? JSON.stringify(v) : v]))}

${list(check.rules)}

${check.unsure.length ? `**Goes to a person when:**\n\n${list(check.unsure)}` : '**Nothing goes to a person.** Every result is a ranking or a label, not an action on someone.'}

## 3 · Write (LLM)

${write ? `Only when the check releases \`${write.when}\`.

- **Asked to write:** ${write.ask}
- **From these checked values only:** ${write.from.map((f) => `\`${f}\``).join(', ')}
- **The draft goes back through:** ${write.guard.join('; ')}
- **Drafts allowed:** ${write.max_drafts}, then a person takes it. A draft that passes waits for approval.` : 'Not used. The decision is the output.'}

## 4 · Act (code)

${table(['Action', 'What happens'], Object.entries(act.actions).map(([k, v]) => [`\`${k}\``, v]))}

${act.ledger}

## Results

Jev's answers are real, from \`${first.model}\` on ${first.date}. Replay them with no key: \`npm run replay -- ${id.slice(0, 2)}\`.

**Jev judges.** The cases where the judgment is the point.

${table(['Case', 'Jev said', 'Rule that decided', 'Action', 'Status'], spec.cases.map((c) => resultRow(c.label, traces[c.label])))}
${spec.symbolic_cases.length ? `
**Code decides or overrules.** The same inputs with different facts.

${table(['Case', 'What code knows', 'Rule that decided', 'Action', 'Status'], spec.symbolic_cases.map((c) => {
    const [, , fired, action, status] = resultRow(c.label, traces[c.label]);
    return [c.label, `\`${JSON.stringify({ ...c.facts, ...c.record })}\``, fired, action, status];
  }))}
` : ''}
## What was learned

${list(spec.lessons)}

## Limits

${list(spec.limits)}
`;
}

export function renderIndex() {
  const rows = Object.keys(PLAYBOOKS).map((id) => {
    const spec = loadRequest(id);
    const primitives = [...new Set(Object.values(spec.questions).map((q) => PRIMITIVE[q.type]))].join(', ');
    return [id.slice(0, 2), `[${spec.title}](${id}.md)`, spec.shape, primitives, spec['2_check'].facts.map((f) => `\`${f}\``).join(', ') || 'none'];
  });
  return `# The playbooks

Each playbook is a go-to-market job where ordinary code needs a judgment call. All ${rows.length} run the same five steps from [the architecture diagram](../docs/how-it-works-updated-2.svg): code filters, Jev judges, code checks, an LLM writes where the output is prose, and code acts.

Every playbook has three parts:

- **A page** (\`NN-name.md\`): the five steps, the cutoffs, and the results. Generated from the two files below by \`node src/docs.js --write\`.
- **A request file** (\`requests/NN-name.json\`): the playbook itself, laid out as the five steps, plus its test cases.
- **Saved traces** (\`responses/NN-name.json\`): each case followed through all five steps, with the real Jev answer inside step 1.

${table(['#', 'Playbook', 'Shape', 'Primitives', 'Facts that overrule Jev'], rows)}

**13 · [Any lead list and enrichment](13-any-list-and-enrichment.md)** has no questions of its own. It is how records and facts get in: any CSV becomes records for playbook 01, each detected job change becomes a record for playbook 02, and enrichment writes the headcounts that step 2 checks Jev against.

To add your own, copy [\`_template.md\`](_template.md) and [\`requests/_template.json\`](requests/_template.json), then see [CONTRIBUTING.md](../CONTRIBUTING.md).

All example data is fictional. The Jev answers in the traces are real saved responses.

## Rules every playbook follows

1. **Code first.** Regexes, lookups and the suppression list run before any model call and cost nothing.
2. **One narrow question each.** Split "is this a good lead?" into the parts you would act on differently.
3. **All the questions about one record go in one request.**
4. **Hard data overrules Jev.** A fact from the CRM or enrichment wins over a probability.
5. **Cutoffs live in the request file, one per question.** Tune them on your own data; changing one makes no Jev call.
6. **Unsure goes to a person.** Confidence tells you whether to act on an answer, not whether it is correct.
7. **The LLM writes only from checked values**, and its draft goes back through the check.
8. **Everything is logged**, including each time a person overrode the result.
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pages = [['README.md', renderIndex()], ...Object.keys(PLAYBOOKS).map((id) => [`${id}.md`, renderDoc(id)])];
  let stale = 0;
  for (const [name, text] of pages) {
    const file = path.join(PLAYBOOK_DIR, name);
    if (process.argv[2] === '--write') writeFileSync(file, text);
    else if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { stale++; console.log(`stale: ${name}`); }
  }
  console.log(process.argv[2] === '--write' ? `wrote ${pages.length} pages` : `${pages.length - stale} of ${pages.length} pages match`);
  if (stale) process.exit(1);
}
