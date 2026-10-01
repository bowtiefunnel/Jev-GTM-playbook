# Guide: the before-Jev and after-Jev test

This guide explains what the test is, how to run it, what each of the three arms does step by step, what TypeSafe's Jev is and where it fits, and answers common questions. The plan behind the test is in [before-after-jev-test-plan.md](before-after-jev-test-plan.md) and the first set of results is in [before-after-jev-results.md](before-after-jev-results.md).

## What the test asks

Does playbook 04, inbound lead routing, make better decisions with Jev in the middle than the same workflow would make without it?

The same 50 fictional leads go through three versions of the workflow, three times each:

| Arm | What it is |
|---|---|
| Before A, code only | Keyword and regex rules. No model. |
| Before B, LLM only | One prompt to a general LLM, which picks the action itself. |
| After, the sandwich | Playbook 04 as built: code filters, Jev judges, code checks. |

Each lead has a label, written before any arm is run, saying which action is correct and which actions would be a costly mistake for that lead.

## What TypeSafe and Jev are

TypeSafe is the company; Jev is its model. TypeSafe calls Jev a "System One" model, after Daniel Kahneman's term for fast, intuitive thinking: a model built to make quick, structured decisions that software uses directly. This section is drawn from [TypeSafe's documentation](https://docs.typesafe.ai/introduction) and from how this repo uses the API.

### The problem it is built for

A large language model produces text for a person to read. When code needs a decision from it (which queue, how urgent, yes or no), you have to ask for text in a format, parse it, and hope it stays in that format. You also get no dependable number for how sure the model was.

Jev skips the text. It reads natural language the way an LLM does, but it cannot write a reply, an explanation or code. It can only answer questions whose possible answers you defined in advance.

### What you send and what comes back

One request to `POST https://api.typesafe.ai/v1/systemone` carries two things:

- **`state`:** the text to judge. A string, a JSON object or an array of text. In playbook 04 it is the routing policy and the lead's role, company size and message.
- **`questions`:** one or more typed questions about that state. Each has `instructions` (the question) and, for two of the three types, `criteria` (the possible answers, described in words).

There are three question types, which TypeSafe calls primitives:

| Primitive | What it asks | What comes back | In playbook 04 |
|---|---|---|---|
| Choice | Which one of these options? | The chosen option, a probability for every option, and a confidence | `route`: account executive, SDR, nurture, partner or junk |
| Score | Where on this ordered rubric? | A score (it can fall between levels, such as 2.97 of 3), probabilities, and a confidence | `urgency`: 0 (just browsing) to 3 (needs it now) |
| Noul | Is this statement true? | One number from 0 to 1 | `is_vendor_pitch`: 0.93 |

All the questions in a request are evaluated against the same state, in parallel and independently of each other. Adding a question barely changes the response time, and one question's answer does not colour another's.

### Confidence, and why the numbers matter

Jev is trained so that its probabilities track how often it is right: across many answers given at 0.9, about nine in ten should be correct. TypeSafe calls this calibration. It is a property of groups of answers and does not guarantee any single one.

Confidence on a Choice answer measures how far the top option stands above an even split. With five route options, a top probability of 76% gives a confidence of 0.70; an even five-way split gives 0.

This is what makes the sandwich possible. Code can say "act only at 0.7 or above; below that, a person decides", and that sentence means something because the number is trained to mean something. It also means the cutoff is a business decision you tune on your own records: in the first run of this test, 0.7 on `route` sent six clear leads to a person.

### How to ask well

- **One narrow question at a time.** TypeSafe's guidance is to ask the kind of thing a knowledgeable person could judge in a few seconds. Split a broad judgment into several questions and combine the answers in code. Playbook 04 does this: an agency pitch was only 0.63 confident on `route`, while the separate `is_vendor_pitch` question was 93% sure.
- **Put your business in the request.** Jev is not fine-tuned per customer; the same model serves every account. Your policy, your records and your edge cases go in the `state` and in each question's `criteria`.
- **Keep facts in code.** Whether a company is a customer or has 7 employees comes from your CRM or enrichment, and code makes those facts overrule Jev.

### What it is used for

Jev fits a step in a workflow where the answer has a shape you can write down before the call, and where hand-written rules are too brittle to produce it:

- **Sorting into fixed groups:** route a lead or a support ticket; classify a reply as interested, not now or unsubscribe; tag a LinkedIn invitation as buyer, peer or pitch.
- **Rating on a scale:** how urgent a lead is, how well a company fits your ideal customer, how good a first message is.
- **Yes-or-no gates:** is this a vendor pitch, is this sentence supported by the facts, does this job post mean the company is building an outbound team. A gate can also check another model's draft before it is sent.
- **Keeping or dropping many candidates cheaply:** one Noul per candidate, with a cutoff.

The repo's README lists the 14 workflows built this way.

### What it is not for

| Not for | Use instead |
|---|---|
| Writing anything: emails, summaries, explanations, code | An LLM. The repo uses one for the account executive's brief. |
| Arithmetic, counting, dates, pulling a string out of text | Code |
| Open-ended answers with no fixed set of options | An LLM |
| Images, audio or video | Convert to text first; Jev reads text only |
| Anything plain code already decides correctly | Keep the code |
| A workflow with no typed judgment in it, such as a report | See the fit test in [apply-to-other-workflows.md](apply-to-other-workflows.md) |

Jev cannot return an answer outside the options you gave it, but it can return the wrong one of them. In this test it called an opt-out request junk.

### Price, speed and limits

| | |
|---|---|
| Price | $0.042 per million input tokens; output is free |
| Speed in this test | Median 0.17 seconds per lead |
| Size limit | 64,000 tokens per request; 32,000 for the state plus the longest question |
| Language | English is where accuracy is best. Other languages work less evenly; test on your own content. |
| Model names | `jev-latest` points to the newest stable release (`jev-1.13.0` at the time of writing) and moves when a new one ships. Pin the versioned name once you have tuned cutoffs against it. |
| Your data | TypeSafe says Jev is not trained on customer requests or responses |

Prices and limits are from TypeSafe's [models page](https://docs.typesafe.ai/models) on 2026-10-01 and can change.

## How to run the test

You need Node 22.13 or newer. There is nothing to install.

1. **Check the repo is healthy.** Run `npm test` and `npm run replay -- 04`. Neither needs a key.
2. **Add keys to `.env`.** Copy `.env.example` to `.env` if you have not, then set:
   - `TYPESAFE_API_KEY`, from [console.typesafe.ai](https://console.typesafe.ai/settings/keys)
   - `OPENROUTER_API_KEY`
   - `WRITER_MODEL`, the model for arm B, for example `anthropic/claude-sonnet-5.5`
3. **Review the labels.** Open `examples/before-after/inbound.labelled.json`. Each record has a `label` (the correct action, or `person`) and `costly` (the actions that would be a costly mistake). Correct any you disagree with. Do this before step 4. Labels changed after you have seen results make the test worthless.
4. **Run it.** `node src/compare-before-after.js`. It takes about five minutes and cost about 34 cents on the first run, nearly all of it arm B.
5. **Read the output.** A table prints in the terminal, followed by each costly mistake. Every record's action for every arm and run is written to `data/before-after-results.json`, which is not committed.
6. **Read the disagreements.** For each record where the arms differ, decide which was right and why. This is where the findings are.

### The files

| File | What it holds |
|---|---|
| `examples/before-after/inbound.labelled.json` | The 50 leads, their labels and their costly actions |
| `examples/before-after/inbound.facts.json` | Which companies are customers or competitors, real headcounts, and the suppressed contact |
| `src/before-after.js` | Arm A's rules, arm B's prompt, and the scoring |
| `src/compare-before-after.js` | The script that runs all three arms and writes the results |
| `test/before-after.test.js` | Tests for arm A and the scoring; no key needed |
| `data/before-after-results.json` | Per-record results from your last run |

### What is measured

| Measure | How it is counted |
|---|---|
| Correct | The arm's action matches the label. For a `person` label, sending the lead to a person is correct. |
| Costly mistakes | The arm took an action on that record's `costly` list. Reported as a count, record by record. |
| Sent to a person | How many, and how many of those the label agrees with. |
| Changed between runs | Records whose action differed across the three runs. |
| Cost per 1,000 records | From tokens used. |
| Median seconds per record | Timed per call. |
| Names the rule or fact | Whether every decision comes with a reason. |

## The steps inside each arm

### Before A: code only

One function, `armA`. The first rule that matches decides.

1. Contact is on the suppression list: `skip`.
2. Message is a test string or has no real word in it: `discard`.
3. Message has a spam phrase ("gift card", "click here"): `discard`.
4. Facts say the company is a customer: `route_to_csm`.
5. Facts say the company is a competitor: a person decides.
6. Message asks to be removed or to stop being called: a person decides.
7. Role or message mentions a student, thesis or class project: `discard`.
8. Role or message looks like a pitch ("we offer", "free mockup", "are you hiring", "white-label", a recruiter or partnerships title): `partner_inbox`.
9. The form's size and the enrichment headcount fall on opposite sides of 10: a person decides.
10. Size above 500: a person decides. Size below 10: `nurture`.
11. Message has a not-ready phrase ("no rush", "next year", "newsletter"): `nurture`.
12. Senior title and a timing word ("this quarter", "next month", "as soon as possible"): `ae_now`.
13. Nothing matched: `sdr_qualify`.

### Before B: LLM only

One prompt, one call, one answer.

1. Code builds a prompt with the routing policy, the lead, the facts for that lead, and the eight allowed actions with a line describing each. One of the eight is `person`, for when the model is not sure.
2. The prompt goes to the model named in `WRITER_MODEL`.
3. The model replies with the action on line 1 and one sentence of reasoning on line 2.
4. Code reads the first allowed action in the reply. A reply with none is scored as wrong.

Nothing checks the model's answer. Whatever it returns is the action.

### After: the sandwich

Playbook 04, unchanged, through `runRecord` in `src/spine.js`.

**Step 0, code filters, for free.**

1. Contact is on the suppression list: `skip`.
2. Text looks like an instruction to the model ("ignore all previous instructions"): a person decides.
3. Message is only a test string: `discard`.
4. Facts say the company is a customer: `route_to_csm`.

If none of those fire, the lead goes to Jev.

**Step 1, Jev judges.** One request with three questions: `route` (choice), `urgency` (score from 0 to 3) and `is_vendor_pitch` (noul).

**Step 2, code checks.** In this order:

1. Route is account executive but enrichment says fewer than 10 employees: a person decides.
2. `is_vendor_pitch` is 0.85 or more: `partner_inbox`, whatever the route says.
3. Route is junk with confidence 0.9 or more: `discard`.
4. Route confidence is under 0.7: a person decides.
5. Route is account executive and urgency is 2 or more: `ae_now`.
6. Otherwise, follow the route.

**Steps 3 and 4** write a short brief for the account executive and act on the decision. The test turns the brief off, because it is written after the action is chosen and does not change it.

## Frequently asked questions

**What did the first run show?**
On this set, the LLM-only arm matched the label on 46 of 50 leads, the code-only arm on 44, and the sandwich on 41. The sandwich and the LLM made no costly mistakes; the code-only arm made one. The sandwich cost $0.023 per 1,000 leads against $2.24 for the LLM and answered in 0.17 seconds against 2.05. Details are in [the results page](before-after-jev-results.md).

**Why did the sandwich score lowest on correct actions?**
Seven of its ten misses were the 0.7 route-confidence cutoff sending a lead to a person when the label had a clear answer, mostly `sdr_qualify`. It sent 10 leads to a person and the label agreed with 4. That points at the cutoff or at the wording of the `route` question.

**Does that mean Jev is worse than an LLM?**
The test does not support that, or the opposite. It is one set of 50 fictional leads, one LLM, one prompt. It supports a statement about this set only.

**Are the leads real?**
No. All 50 are fictional. They were written by the same assistant that built the test, wrote arm A's rules and wrote arm B's prompt, and the labels were not corrected by a person before the first run. A set of real form fills, labelled by the person who would make the call, would be a stronger test.

**Why three runs?**
To see whether an arm gives the same answer twice. The code-only arm cannot change. Each model arm had one record change between runs.

**Why does the sandwich get an empty store for each run?**
In normal use the answer store saves Jev's answer and reuses it, so a repeat run cannot change. The test clears the store so Jev is asked again each time; otherwise the repeat-run measure would be true by construction.

**What counts as a costly mistake?**
Each record lists its own. A real buyer sent to nurture or discarded loses a deal. A vendor, a customer or a competitor sent to an account executive wastes the AE's time. A suppressed contact enrolled in anything is a compliance problem.

**What does `person` mean as a label?**
That a person should decide, because the lead is honestly unclear. The sandwich's `sdr_review` and `human_review` both count as `person`.

**The sandwich returned `account_executive`, `partner_or_vendor` and `junk`. Those are not in the playbook's action list.**
Correct. When no special rule fires, the check returns Jev's raw route. The test scores those three as `ae_now`, `partner_inbox` and `discard`. That rule was fixed before the first run.

**Can I change the arm B model?**
Yes. Set `WRITER_MODEL` in `.env` to any model OpenRouter lists. The script reads the price from OpenRouter when it runs.

**Can I change a cutoff and re-run?**
You can, in `2_check.cutoffs` in the playbook's request file. Treat the result as tuning, not as a test: a cutoff chosen after seeing these 50 leads will fit these 50 leads. Check it on a new labelled set.

**Does running the test email anyone or touch a CRM?**
No. Nothing connects to a CRM or a sender. Actions end in an in-memory ledger that is thrown away.

**What leaves my machine?**
To TypeSafe: each lead's `state`, which is the policy text plus the role, company size and message. To OpenRouter: the same, plus that lead's facts. Emails and domains stay local. The leads are fictional, so nothing private is sent.

**Do I need keys to run the tests?**
No. `npm test` uses a fake LLM and saved Jev answers. Only `node src/compare-before-after.js` needs keys.

**Will this be extended to other playbooks?**
The plan names 03 (reply classification) and 07 (hiring signals) as next, only if the result on 04 is worth extending. Neither has been built.
