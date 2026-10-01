# Presentation outline: Jev GTM Playbook

Twelve slides. Written for a GTM or RevOps audience that knows what an LLM is but has not seen Jev. Every number below comes from the saved traces or the live runs recorded in the [README](../README.md), so it can be shown in the repo if someone asks.

For a 10-minute slot, use slides 1, 2, 4, 5, 6, 8, 10 and 11.

---

## 1. GTM playbooks where code decides and AI only judges

- 14 playbooks on one spine.
- Your name and the date.

**Visual:** the banner, [playbook.png](playbook.png).

## 2. AI in GTM fails in two ways

- It acts on a guess: emails someone who opted out, or routes an existing customer to sales.
- It writes something untrue: a funding round that never happened, an office in the wrong city.
- Both come from letting the model own the decision.

**Visual:** the two failures side by side, one example each.

## 3. Three kinds of work, three engines

| Engine | Good at | Cost |
|---|---|---|
| Code | Facts, dates, arithmetic, lookups | Free and predictable |
| Jev | One typed judgment with a probability | Fast and cheap |
| LLM | Prose | Slow and costly |

- Use each only for what it is good at.

**Visual:** three columns.

## 4. The sandwich

- Code filters. Jev judges. Code checks. The LLM writes. Code acts.
- Only the check can release an action.
- Three stores sit underneath: saved answers, facts, and a ledger.

**Visual:** the architecture diagram, [how-it-works-updated-2.png](how-it-works-updated-2.png).

## 5. One lead, start to finish

- A VP Sales at a 120-person company writes: "Need a partner live by next month."
- Jev: route AE at 1.00, urgency 2.97 of 3, vendor pitch 3%.
- Check: not a pitch (3% is under 85%), confident (1.00 is over 0.70), AE and urgent. The route is "AE now".

**Visual:** the bottom row of the architecture diagram, enlarged.

## 6. Hard data overrules the model

- Same lead, but enrichment says the company has 6 people: the check sends it to a person.
- Same lead, but already a customer: it goes to their CSM and never reaches Jev.
- Jev's answer did not change in either case. The facts did.

**Visual:** the two "code decides or overrules" rows from the [playbook 04 page](../playbooks-JEv/04-inbound-lead-routing.md).

## 7. Two narrow questions beat one broad one

- The agency pitch: the route question was only 0.63 sure, but the separate vendor-pitch question was 93% sure.
- Job changes: one broad question, "is this a good reason to get in touch?", scored four different cases 73, 42, 64 and 44. The narrow question, "does the current role buy this?", scored them 77, 34, 73 and 14.
- When a question gives mushy probabilities, split it.

**Visual:** two small tables, before and after.

## 8. Unsure goes to a person

- The post "Is outbound dead in 2026?" came back as "engage" at confidence 0.36.
- The answer was wrong. The confidence was low. The cutoff caught it.
- Confidence tells you whether to act on an answer, not whether it is correct.

**Visual:** that row from the [playbook 14 page](../playbooks-JEv/14-social-signal-triage.md).

## 9. The 14 playbooks

- Who to reach: network scoring, account scoring, warm intros, any list plus enrichment.
- When: job changes, hiring signals, social posts.
- What to say: message scoring, fact-check, follow-up selection.
- After they answer: reply classification, invitations, quiet conversations, inbound routing.
- Learn: which openers get replies.
- Most end at a decision. Two write a draft. Two guard drafts.

**Visual:** the banner columns, or the table in the [playbooks index](../playbooks-JEv/README.md).

## 10. What it costs and what was measured

| | |
|---|---|
| 54 | cases run on live Jev |
| 53 of 54 | gave the same result as the saved answers |
| $0.0012 | total Jev cost for that run |
| 0 calls | to re-run, because answers are stored |

- On one real network: 16,711 connections scored for $0.73.

**Visual:** four big numbers.

## 11. What is not proven, and when not to use this

- Drafts have not been measured. No writer model has been run.
- Nothing connects to a CRM, an enrichment provider's live API, or a sender yet.
- The pattern only fits workflows that contain a typed judgment. A report or summary workflow should stay a plain pipeline.

**Visual:** a short list. Keep this slide even in a sales setting; it is what makes the rest credible.

## 12. How to apply it to your own workflow

- Three fit questions: is there a typed judgment, is a wrong one costly, does the output end in prose?
- Then fill in the five boxes: what code filters, the questions, the facts and cutoffs, the draft, the action.
- Start with one workflow and 10 to 20 cases you already know the answer to.

**Visual:** the worksheet from [apply-to-other-workflows.md](apply-to-other-workflows.md).
