# The playbooks

Each playbook is a go-to-market job where ordinary code needs a judgment call. All 14 run the same five steps from [the architecture diagram](../docs/how-it-works-updated-2.svg): code filters, Jev judges, code checks, an LLM writes where the output is prose, and code acts.

Every playbook has three parts:

- **A page** (`NN-name.md`): the five steps, the cutoffs, and the results. Generated from the two files below by `node src/docs.js --write`.
- **A request file** (`requests/NN-name.json`): the playbook itself, laid out as the five steps, plus its test cases.
- **Saved traces** (`responses/NN-name.json`): each case followed through all five steps, with the real Jev answer inside step 1.

| # | Playbook | Shape | Primitives | Facts that overrule Jev |
|---|---|---|---|---|
| 01 | [LinkedIn network ICP scoring](01-linkedin-network-icp.md) | decision only | Choice, Score, Noul | `customer`, `competitor`, `employees` |
| 02 | [Job-change interpretation](02-job-change-interpretation.md) | decision, then a draft | Choice, Noul | `customer`, `open_opportunity`, `fit` |
| 03 | [Cold-email reply classification](03-reply-classification.md) | decision only | Choice, Noul | `customer`, `suppressed` |
| 04 | [Inbound lead routing](04-inbound-lead-routing.md) | decision, then a draft | Choice, Score, Noul | `customer`, `employees` |
| 05 | [Connection-request intent](05-connection-request-intent.md) | decision only | Choice, Noul | `target_account` |
| 06 | [Account ICP scoring](06-account-icp-scoring.md) | decision only | Score, Choice, Noul | `customer`, `competitor`, `excluded`, `employees` |
| 07 | [Hiring signals](07-hiring-signals.md) | decision only | Noul, Choice | `account_fit` |
| 08 | [Personalization fact-check](08-personalization-fact-check.md) | guard on a draft | Choice, Noul | none |
| 09 | [First-message scoring](09-first-message-scoring.md) | guard on a draft | Score, Noul | none |
| 10 | [Learn from your own inbox](10-learn-from-inbox.md) | decision only | Score, Noul | none |
| 11 | [Cold ICP conversations](11-cold-icp-conversations.md) | decision only | Noul, Choice | `customer`, `fit` |
| 12 | [Warm-intro finder](12-warm-intro-finder.md) | decision only | Choice, Score | none |
| 14 | [Social signal triage](14-social-signal-triage.md) | decision only | Choice, Noul | `competitor`, `customer` |
| 15 | [Pick the follow-up](15-pick-the-follow-up.md) | decision only | Choice | `suppressed` |

**13 · [Any lead list and enrichment](13-any-list-and-enrichment.md)** has no questions of its own. It is how records and facts get in: any CSV becomes records for playbook 01, each detected job change becomes a record for playbook 02, and enrichment writes the headcounts that step 2 checks Jev against.

To add your own, copy [`_template.md`](_template.md) and [`requests/_template.json`](requests/_template.json), then see [CONTRIBUTING.md](../CONTRIBUTING.md).

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
