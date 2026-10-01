# Contributing

Small, focused changes are welcome.

- Keep it zero-dependency: plain Node (22.13+), `node:sqlite`, `node:test`. No frameworks or build step.
- `npm test` must pass. Tests replay saved Jev answers and need no API key.
- Tests for the network app run in mock mode. Mock answers are stored under the model name `mock`, so they never mix with real ones.
- Never commit real exports, databases, keys, facts about real people or screenshots containing them. Use fictional data, as in `examples/`.
- Questions and cutoffs live in the request file, not in code. Editing a question re-judges automatically, because the wording is part of the fingerprint.

## Changing a rule or a cutoff

1. Edit `2_check.cutoffs` in `playbooks-JEv/requests/NN-name.json`, or the `check` function in `src/playbooks/NN-name.js`.
2. `node src/trace.js --write` rewrites the saved traces. No Jev call is made.
3. `node src/docs.js --write` rewrites the playbook's page.
4. `npm test`. Read the diff of the traces: every case whose action changed is a decision you are making.

## Adding a playbook

1. Run the fit test in [`docs/apply-to-other-workflows.md`](docs/apply-to-other-workflows.md). If the workflow has no typed judgment, it is not a playbook.
2. Copy `playbooks-JEv/requests/_template.json` to the next number and fill in all five steps. Use fictional data, and include at least one hard case and one symbolic case.
3. Add `src/playbooks/NN-name.js` with `pre`, `check`, and `write` or `act` where the request file calls for them. The file registers itself by being there.
4. `node src/trace.js --live NN` asks Jev about the new cases with your own key, saves each real answer under `1_judge.response`, and writes the traces. It never overwrites a saved answer. Then `node src/docs.js --write`.
5. Report what did not work. A playbook that shows a miss and its fix teaches more than a perfect one.
