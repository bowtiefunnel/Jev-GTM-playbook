# NN · Playbook name

This page is generated. Do not write it by hand: fill in `requests/NN-name.json`, add `src/playbooks/NN-name.js`, then run:

```bash
node src/trace.js --write   # saves each case's five-step trace to responses/
node src/docs.js --write    # writes this page from the request file and the traces
```

What the request file must answer, step by step:

| Step | Question to answer before writing any code |
|---|---|
| `about` | The GTM job, why ordinary code cannot do it alone, and what goes wrong without it. |
| `0_filter_and_cache` | What can code drop or decide for free, before Jev is called? |
| `1_judge` | Which narrow judgments are needed? One typed question each: Choice, Score or Noul. |
| `2_check` | Which hard facts overrule Jev? What is the cutoff for each question? What counts as unsure? |
| `3_write` | Does the output end in prose? If not, `null`. If so, which checked values may the LLM use? |
| `4_act` | What does each action do, and which ones are hard to undo? |
| `cases` | Fictional inputs where Jev's judgment is the point. Keep at least one hard case. |
| `symbolic_cases` | The same inputs with different facts, where code decides or overrules Jev. |
| `lessons` | What did not work at first, and the fix. |
| `limits` | What the data cannot tell Jev, and where a person should stay in the loop. Report misses honestly. |

Before starting, run the fit test in [`../docs/apply-to-other-workflows.md`](../docs/apply-to-other-workflows.md). Most workflows are "decision only".
