# Test plan: before Jev and after Jev

## The question

Does putting Jev in the middle of a workflow, with code on both sides, make better decisions than the way the same workflow would run without it? "Better" means fewer wrong actions, fewer costly mistakes, lower cost, and the same answer when run twice.

Nothing in the repo answers this today. The saved cases show that the sandwich works; they do not show what it beats.

## What is compared

The same records go through three arms. Two are "before", one is "after".

| Arm | What it is | Why it is in the test |
|---|---|---|
| **Before A: code only** | Keyword and regex rules, the way this was done before any model | The cheapest baseline. Shows what judgment adds. |
| **Before B: LLM only** | One prompt to a general LLM that returns the action directly | The usual way AI workflows are built. Shows what the sandwich adds. |
| **After: the sandwich** | The playbook as built: code filters, Jev judges, code checks | The thing being tested |

Arm B is the comparison that matters most. Arm A is quick to build and keeps the test honest about how much of the result is Jev and how much is ordinary code.

## Which playbooks

Three, chosen because each has a different kind of costly mistake.

| Playbook | The costly mistake | Why it is a good test |
|---|---|---|
| 04 Inbound lead routing | A customer or a vendor sent to an AE; a real buyer sent to nurture | Uses every part of the sandwich: free filter, three questions, facts, cutoffs |
| 03 Reply classification | Someone who asked to be removed gets emailed again | The mistake is a compliance problem, so being unsure has to be handled well |
| 07 Hiring signals | A false signal ("Account Manager" read as an outbound hire) | The known trap for keyword rules |

Start with 04 alone. Add 03 and 07 only if the result on 04 is worth extending.

## The test set

The saved cases are too few to compare anything: four or five per playbook. A real comparison needs a labelled set.

- **Size:** 50 records per playbook. Enough to see a difference of a few records; small enough to label in an hour.
- **Source:** real records where possible (form fills, replies, job posts), with names and emails removed. Fictional records only if real ones cannot be used.
- **Mix:** about 30 ordinary records, 15 hard ones (vague, mixed signals, pitches that look like buyers), 5 that code should catch for free (tests, existing customers, suppressed contacts).
- **Facts:** for the records that need them, a facts file saying who is a customer, a competitor, or what the real headcount is.
- **Labels:** a person writes the correct action for each record, and marks the costly-mistake actions for it, **before any arm is run**. Records where the person is honestly unsure are labelled "a person should decide".

The labels are the answer key. If they are written after seeing results, the test is worthless.

## What is measured

| Measure | How it is counted |
|---|---|
| Correct action | Arm's action matches the label. For "a person should decide" records, sending it to a person is the correct action. |
| Costly mistakes | Arm took an action the label marks as costly for that record. Reported as a count, not a rate: one emailed opt-out matters. |
| Sent to a person | How many, and how many of those the label agrees were unclear. A high number with low agreement means the arm is just avoiding decisions. |
| Same answer twice | Each arm runs the set three times. Count the records whose action changed between runs. |
| Cost | Dollars per 1,000 records, from tokens used. |
| Time | Seconds per record, median. |
| Can it say why | Whether each decision names the rule or fact that produced it. Yes or no per arm. |

## Rules that keep it fair

- All three arms see the same records and the same policy text.
- Arm A gets a real effort: the rules a careful person would write in an afternoon, not a strawman.
- Arm B gets the same policy text, the same list of allowed actions, and the same facts in its prompt. It is told it may answer "send to a person".
- Arm B uses a current mid-priced model at its default settings. The model is named in the results.
- The sandwich runs with the cutoffs it has today. No tuning on the test set.
- Every miss by the sandwich is reported, with the record.

## Steps

1. **Collect and label** 50 records for playbook 04, plus the facts file. Freeze the labels.
2. **Write arm A**: one function of keyword and regex rules that returns an action.
3. **Write arm B**: one prompt and one call that returns an action from the allowed list.
4. **Add a comparison script** (`src/compare-before-after.js`) that reads the labelled file, runs all three arms three times, and writes one results table and one file of per-record results.
5. **Run it.** Jev cost for 50 records, three runs: under one cent. Arm B cost depends on the model; a few cents at most.
6. **Read every disagreement.** For each record where the arms differ, note which was right and why. This is where the findings are.
7. **Write it up** as a page in `docs/`, with the table, the costly mistakes listed one by one, and the misses on all sides.
8. **Decide** whether to extend to 03 and 07.

## What the result would tell us

| If the sandwich... | Then |
|---|---|
| Makes fewer costly mistakes than B and is as accurate | The architecture is doing its job. This is the claim to make publicly. |
| Is as accurate as B but far cheaper and repeatable | Still a result, but the claim is cost and consistency, not accuracy. |
| Is less accurate than B on ordinary records | The questions or cutoffs need work. Look at whether Jev was wrong or the check overruled a right answer. |
| Sends much more to a person than B | Check agreement with the labels. If the labels agree, that is correct caution. If not, the cutoffs are too strict. |
| Barely beats A | The workflow may not need a model. That is worth knowing before selling it. |

One set of 50 records supports a statement about that set. It does not support a general claim like "40% more accurate".

## What I need from you before starting

1. **The records.** Can real form fills be used with names and emails removed, or should the set be fictional?
2. **Who labels them.** It should be someone who would make the call in real life, and it must happen before anything is run.
3. **The model for arm B**, and the OpenRouter key in `.env`.
4. **Whether to start with 04 only**, as recommended, or all three.
