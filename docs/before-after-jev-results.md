# Results: playbook 04 before Jev and after Jev

Run on 2026-10-01 with `node src/compare-before-after.js`. The plan is in [before-after-jev-test-plan.md](before-after-jev-test-plan.md).

## The short version

On this set of 50 leads, the sandwich did not make more correct decisions than either "before" arm. The LLM-only arm matched the label on 46 of 50, the code-only arm on 44, and the sandwich on 41 (40 in one run). The sandwich's misses were mostly leads it sent to a person when the label had a clear answer. It made no costly mistakes, and neither did the LLM-only arm. It cost about a hundredth of what the LLM-only arm cost and answered about twelve times faster.

By the plan's own table, this is the "less accurate than B on ordinary records" outcome: the questions or the cutoffs need work before any accuracy claim is made.

## What was compared

| Arm | What it is |
|---|---|
| Before A, code only | `armA` in `src/before-after.js`: keyword and regex rules, first match wins |
| Before B, LLM only | One prompt to `anthropic/claude-sonnet-5.5` through OpenRouter at default settings, with the policy text, the lead, the facts and the allowed actions |
| After, the sandwich | Playbook 04 unchanged, through `runRecord`, with `jev-latest` |

Each arm ran the 50 records three times. The sandwich got a new empty store for each run, so every run called Jev again; with the answer store in place, a repeat run would reuse the saved answers and could not change.

## The table

| Measure | Code only | LLM only | Sandwich |
|---|---|---|---|
| Correct of 50 (runs 1 / 2 / 3) | 44 / 44 / 44 | 46 / 46 / 46 | 41 / 41 / 40 |
| Ordinary records correct, of 30 (run 1) | 29 | 30 | 26 |
| Hard records correct, of 15 (run 1) | 10 | 11 | 10 |
| Free records correct, of 5 (run 1) | 5 | 5 | 5 |
| Costly mistakes | 1 record, in all 3 runs | 0 | 0 |
| Sent to a person (runs 1 / 2 / 3) | 4 / 4 / 4 | 3 / 3 / 3 | 10 / 10 / 11 |
| Of those, label agrees | 4 / 4 / 4 | 3 / 3 / 3 | 4 / 4 / 4 |
| Records that changed between runs | 0 | 1 (r32) | 1 (r16) |
| Cost per 1,000 records | $0 | $2.24 | $0.023 |
| Cost of this whole test | $0 | $0.336 | $0.0034 |
| Median seconds per record | 0.000 | 2.05 | 0.17 |
| Names the rule or fact | Yes, a rule name | Yes, a sentence it wrote | Yes, a rule name |

The LLM-only arm used 63,108 input tokens and 20,983 output tokens over 150 calls. The sandwich made 132 Jev calls (44 per run; code decided the other 6 records for free) and used 80,964 input tokens.

Eleven of the code-only arm's 50 decisions name the rule `default`, which means no rule matched. The LLM-only arm's reasons are its own sentences and are not checked against anything.

## Costly mistakes, one by one

| Arm | Record | What it did | Label |
|---|---|---|---|
| Code only, all 3 runs | r29: role "jjj", message "sdfkjhsdf lkjsdf" | `sdr_qualify` (no rule matched) | `discard` |

That is the only one. The LLM-only arm and the sandwich made none.

## Every miss by the sandwich

| Record | The lead | Sandwich did | Rule | Label |
|---|---|---|---|---|
| r10 | Sales Manager, 90: "Interested in your outbound service. What does it cost?" | a person | `low_confidence` | `sdr_qualify` |
| r13 | Head of Sales, 35: "Curious how you would approach our market... Maybe worth a chat sometime." | a person | `low_confidence` | `sdr_qualify` |
| r15 | VP Revenue, 110: "Saw your case study. I would like to understand how your model compares with hiring in-house." | a person | `low_confidence` | `sdr_qualify` |
| r19 | Sales Analyst, 85: "Downloaded your benchmark report. Interested in more content like that." | a person | `low_confidence` | `nurture` |
| r36 | Intern, 250: "My VP asked me to find an outbound agency. She wants to start next month..." | a person | `low_confidence` | `sdr_qualify` |
| r39 | Consultant, 1: "I am advising a 200-person SaaS client that needs outbound running by next month." | a person | `low_confidence` | `sdr_qualify` |
| r16, run 3 only | Marketing Coordinator, 40: "Putting together a list of options for 2027 planning. No rush." | a person (runs 1 and 2: `nurture`, correct) | `low_confidence` | `nurture` |
| r32 | Head of Sales, 40: "We need more leads urgently. We also run a lead gen agency ourselves and think we could white-label each other's services." | `partner_inbox` | `route` | a person |
| r34 | Founder, 9: "We need 20 meetings a month starting now. Budget is ready." | `nurture` | `route` | a person |
| r42 | Office Manager, 55: "Stop calling our front desk. Take us off your list." | `discard` | `route` | a person |

Three things stand out.

- **Seven of the ten are the `route_confidence` cutoff of 0.7 sending a lead to a person.** In six of them the lead was a plausible buyer with unclear need, authority or timing, which is what `sdr_qualify` is for. None is a costly mistake, but each one is work for a person that the other two arms did not create. The sandwich sent 10 leads to a person and the label agreed on 4.
- **r42 is the one to worry about.** An opt-out sent through the lead form was dropped as junk. `discard` was not on that record's costly list, so it is not counted above, but nothing recorded the request. The code-only arm and the LLM-only arm both sent it to a person.
- **r16 changed between runs.** Jev's route confidence sits close enough to 0.7 on this lead that one run of three fell under it.

## The disagreements, read one by one

Thirty-six records got the labelled action from all three arms in all three runs. The other fourteen:

| Record | Code only | LLM only | Sandwich | Label | Who was right, and why |
|---|---|---|---|---|---|
| r10, r13, r15 | `sdr_qualify` | `sdr_qualify` | person | `sdr_qualify` | A and B. Jev's route confidence was under 0.7. |
| r16 | `nurture` | `nurture` | `nurture`, `nurture`, person | `nurture` | A and B; the sandwich in two runs of three. |
| r19 | `nurture` | `nurture` | person | `nurture` | A and B. |
| r29 | `sdr_qualify` | `discard` | `discard` | `discard` | B and the sandwich. Code knows three test strings; this was a fourth kind of nonsense. Jev called it junk with confidence over 0.9. |
| r32 | `partner_inbox` | `sdr_qualify`, `sdr_qualify`, `partner_inbox` | `partner_inbox` | person | Nobody. A lead that is both buyer and partner; every arm picked a side. B picked a different side in run 3. |
| r33 | person | `sdr_qualify` | person | person | A and the sandwich. A had a rule for size above 500. The sandwich got there through low confidence, not through a size rule. |
| r34 | `nurture` | `sdr_qualify` | `nurture` | person | Nobody. A ready buyer with 9 people on the form; no arm escalated. |
| r36 | `sdr_qualify` | `sdr_qualify` | person | `sdr_qualify` | A and B. |
| r38 | `sdr_qualify` | `sdr_qualify` | person | person | The sandwich. Its phrase list caught "Ignore all previous instructions" before Jev was called. B noticed the instruction and said it ignored it, then routed the lead to an SDR. |
| r39 | `nurture` | `sdr_qualify` | person | `sdr_qualify` | B. A read the consultant's own size of 1 as the company size. |
| r42 | person | person | `discard` | person | A and B. See above. |
| r43 | `sdr_qualify` | `ae_now` | `ae_now` | `ae_now` | B and the sandwich. The message was in Spanish and A's timing words are English. |

Two records the arms agreed on are worth a note. On r41, where the facts mark the company as a competitor, all three arms sent the lead to a person. Arms A and B did so because of the fact. Playbook 04 does not read that fact; the sandwich got there because Jev's route confidence was low. With a more confident answer it would have followed the route. On r35, where the form says 150 people and enrichment says 7, all three arms sent it to a person, the sandwich through its headcount rule.

## What this does and does not show

Reading the plan's outcome table against these numbers:

- **Accuracy:** the sandwich is behind both "before" arms on this set, by 5 records against the LLM and 3 against code.
- **Costly mistakes:** the sandwich and the LLM-only arm are level at none. The code-only arm made one.
- **Cost, speed and repeatability:** the sandwich cost $0.023 per 1,000 records against $2.24, and took 0.17 seconds against 2.05. Each of the two model arms had one record change between runs.
- **Sent to a person:** the sandwich sent more than twice as many as either other arm, and the labels agreed with 4 of its 10. By the plan's reading, the cutoffs are too strict for this set, or the `route` question does not separate `sdr_qualify` from its neighbours well enough.
- **Against code only:** the sandwich did not beat the afternoon's worth of rules on correct actions. It beat them on the one costly mistake, on the Spanish lead and on the injected instruction.

## Limits

- **The records are fictional and were written by the same assistant that built the test, the rules in arm A and the prompt in arm B.** It also wrote the labels. The labels were not corrected by a person before the run; they were frozen as drafted.
- **Arm A's rules were written after the records.** They were not tuned against the set by running it, but their author had read every record. That favours arm A.
- **One set of 50 supports a statement about that set only.** A difference of three or five records could reverse on another set.
- **One model for arm B.** A different model, or a different prompt, could score differently in either direction.
- **Seven of the 50 labels are "a person should decide".** Each one rewards an arm for escalating; the sandwich still agreed with the label on only 4 of its 10 escalations.
- **Three of the sandwich's raw actions are not in the playbook's action list.** `account_executive`, `partner_or_vendor` and `junk` were scored as `ae_now`, `partner_inbox` and `discard`. This was fixed before the run. It affected r32 and r42 (both scored wrong either way) and several partner and junk leads scored right.
- **Jev's raw confidences were not saved with the results.** The rule that fired is recorded per record; the numbers behind `low_confidence` are not, so this page cannot say how far under 0.7 each one was.
- **Drafts were off.** No writer was passed to the sandwich, so the AE brief was not written. That does not change the action.
- **The cutoffs were not tuned on this set**, as the plan requires. Whether a lower `route_confidence` would fix the six over-escalations without releasing r33 and r41 is not tested here.

Every record's action per arm per run, with arm B's reasons, is in `data/before-after-results.json`, which is not committed.
