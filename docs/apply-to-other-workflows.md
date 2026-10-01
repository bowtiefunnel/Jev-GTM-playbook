# Apply the architecture to another AI workflow

![How a Jev GTM workflow runs](how-it-works-updated-2.svg)

[how-it-works-updated-2.svg](how-it-works-updated-2.svg) shows one workflow (inbound lead routing) as five steps, three stores and one worked example. This plan turns that picture into a procedure: take any other AI workflow, decide whether the pattern fits, fill in the same boxes, build it, and redraw the diagram for it.

Background: the [README](../README.md) for the five steps and the request format, and the [playbooks index](../playbooks-JEv/README.md) for 14 workflows already built this way.

The rule the diagram encodes, and the one thing that must stay true in every copy: **code owns the facts and the final decision, the model supplies a judgment, and the LLM writes only from what code approved.** Only the Check step can release an action.

---

## Step 1. Decide whether the pattern fits, and which shape

Answer three questions about the workflow.

| Question | If no |
|---|---|
| A. Does it judge unstructured text into a fixed set of labels, a rating, or a yes/no? | Stop. There is no Judge step, so this diagram does not apply. A report or summary workflow stays a plain pipeline with a ledger. |
| B. Is a wrong judgment costly enough to need a check against hard data? | Keep it as code → model → code with a cutoff. Add the ledger, skip the facts layer. |
| C. Does the workflow end in prose (an email, memo, reply)? | Decision only. Step 3 (Write) is not used. |

That gives one of three shapes:

| Shape | Steps used | Examples |
|---|---|---|
| **Decision only** | 0 → 1 → 2 → 4 | ICP scoring, connection-request intent, pick the follow-up |
| **Decision, then a draft** (the full diagram) | 0 → 1 → 2 → 3 → back to 2 → 4 | Inbound lead routing, reply classification, job changes |
| **Guard on a draft** | A draft already exists; 1 and 2 check it | Personalization fact-check, first-message scoring |

Most workflows are decision only. Do not add Step 3 because the diagram has it.

If the judge is not Jev (another classifier, or an LLM with a strict schema), the pattern still holds as long as the answers are typed and stored. Free-text model output cannot be checked by Step 2, so a workflow whose model step returns prose fails question A.

---

## Step 2. Fill in the worksheet

One row per box in the diagram. Write these down before any code; the answers become the workflow's config and the text in its diagram.

| Box | Write down | Rules |
|---|---|---|
| **0 Filter and cache** | What code drops without a model call (blanks, tests, blocked records, anything out of scope). Which fields make up the fingerprint. | Fingerprint = judged fields + policy version + question version. Dates, counts and arithmetic are decided here, never by the model. |
| **1 Judge** | Each question, with its type: `choice` (labels and a description for each), `score` (ordered levels, lowest first), or `noul` (one yes/no proposition). | One narrow question per thing you would act on differently. All questions for a record in one request. Never ask a question and its opposite. No extraction: names and addresses come from regex or a list match. Strip or quote untrusted text before it goes in. |
| **2 Check** | The hard data that overrules the model, and where it comes from. One cutoff per question. What counts as "unsure". | Cutoffs are set by what a wrong answer costs: high for compliance actions, lower where missing a buyer is the bigger loss. Two questions that disagree go to a person. |
| **3 Write** (if used) | What the draft is. The exact checked values it is allowed to use. | The LLM never sees raw input. The draft goes back through Check before anything is sent. Cap rewrites at two, then a person takes it. |
| **4 Act** | Every action the workflow can take. Which ones are hard to undo. | Hard-to-undo actions need a person's approval. Every action is logged. |
| **Answer store** | Where answers are kept and the fingerprint key. | Changing a cutoff must re-score from stored answers with no new model calls. Bump the question version when wording changes. |
| **Facts** | The systems Check reads (CRM, enrichment, suppression list, or this workflow's equivalent). | If a fact source does not exist yet, the veto that depends on it does not exist either. Say so in the diagram instead of drawing it. |
| **Ledger** | The fields recorded per record: input, answers, which check fired, action, human override. | Overrides are what you tune cutoffs from. |
| **Worked example** | One real record followed through every step, with the real answers and the real cutoffs. | Use a saved model response. Mark anything illustrative as illustrative. |

---

## Step 3. Build it

1. **Spine first, once.** Answer store, facts, ledger. In this repo they already exist (`src/store.js`, `src/spine.js`), so a new workflow reuses them.
2. **Questions.** Write them from the worksheet and run them on 10 to 20 records whose right answer you already know. Save the responses.
3. **Cutoffs.** Set each one from those saved responses. Until there is data, start at: act at 0.85 and above, send to a person from 0.60 to 0.84, drop below 0.60.
4. **Check.** One function: hard-data vetoes first, then cutoffs, then the unsure path. Leave one test that fails if a veto stops overruling the model.
5. **Write and its guard** (only for the full shape). The draft step takes checked values only; its output goes through the fact-check and message-score questions before a person sees it.
6. **Act.** Wire the actions, with approval on anything hard to undo.

---

## Step 4. Redraw the diagram

Copy [how-it-works-updated-2.svg](how-it-works-updated-2.svg) to `<workflow>-how-it-works.svg` and change text only. Layout, colours and arrows stay. The file is sectioned by comments; edit in this order:

| Section in the SVG | Change |
|---|---|
| `<title>`, `<desc>`, the two header lines | Workflow name and one-sentence summary |
| Legend pills (CODE / JEV / LLM) and the `JEV · NEURAL` label on card 1 | Only if the judge is not Jev |
| `<!-- 0 -->` to `<!-- 4 -->` | The four body lines and the OUT line of each card, from the worksheet |
| The two pills under the cards (APPROVED / UNSURE) | Only if this workflow names its outcomes differently |
| `<!-- stores -->` | What each store holds for this workflow, and which steps use it |
| `<!-- worked example -->` | The five boxes, from the worksheet's worked example |
| Last `<text>` line | Which numbers are real and where they came from |

Text is not wrapped automatically, so keep to the existing line lengths: about 24 characters per line and four lines in a step card, 24 characters and four lines in an example box, 43 characters and two lines in a store.

For a decision-only workflow, keep card 3 and its example box in place, set `opacity="0.35"` on both, and replace the body with "Not used. The decision is the output." Removing the card leaves a hole unless every x coordinate to its right is shifted.

Open the file in a browser and check that no line runs past its card.

---

## Step 5. Done when

- [ ] Shape chosen in Step 1 and written at the top of the worksheet
- [ ] Every worksheet row filled, or marked "does not exist yet"
- [ ] Questions run on 10 to 20 known records, responses saved
- [ ] Changing a cutoff re-scores stored answers with no new model calls
- [ ] A hard fact that contradicts the model wins, and a test proves it
- [ ] No action is reachable except through Check
- [ ] Hard-to-undo actions wait for a person
- [ ] The diagram's worked example uses real answers, and the footer says which parts are illustrative
- [ ] Human overrides are counted per question (above 5% means rewrite the question or move its cutoff)

---

## Where to start

The 14 playbooks in the [playbooks index](../playbooks-JEv/README.md) are already sorted into shapes. Copy the one closest to your workflow.
