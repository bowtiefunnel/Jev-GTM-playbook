# Security

This tool handles other people's contact details and messages, so it is built to keep them on your machine.

- **What reaches TypeSafe:** only the `state` of each record, which is the text being judged plus your policy text. The record's `key`, `email` and `domain` are used locally to look up facts and are never sent.
- **What reaches the writer model:** only the checked values a playbook lists under `3_write.from`. The raw form message, reply or thread is never included.
- **Network scoring:** only job title, company name, company description and your ICP text reach TypeSafe. Names, emails and profile URLs never do.
- **Enrichment:** the provider you choose sees what you send it, usually the LinkedIn URL, under that provider's terms.
- **What stays local:** your keys (`.env`), your ICP (`icp.json`) and the exports, answers, facts and ledger (`data/`). All are gitignored.
- **The dashboard** listens on `127.0.0.1` only and rejects requests from other origins and hosts.
- **Instructions hidden in input:** text that looks like an instruction to the model is sent to a person in step 0. This is a short phrase list and catches only obvious attempts; do not rely on it alone for input from strangers.
- **Nothing is sent on your behalf.** Drafts wait for approval and actions end in the ledger.

If you find a way any of that can be bypassed, report it privately to the repository owner rather than opening a public issue.
