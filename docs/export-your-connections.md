# Get your Connections.csv from LinkedIn

LinkedIn lets every member download their own data. The connections file is the only input jev-gtm-playbook needs. No scraping, no browser extension, no password: this is the official export.

## Steps

1. Open LinkedIn on a desktop browser and click your photo (**Me**) → **Settings & Privacy**.
2. In the left menu choose **Data privacy**.
3. Under *How LinkedIn uses your data*, click **Get a copy of your data**.
4. Choose **Download larger data archive, including connections...**. As of September 2026, Connections is no longer offered under *Want something in particular?*, so the larger archive is the one that contains it.
5. Click **Request archive**. LinkedIn may ask for your password.
6. Wait for the email. LinkedIn says up to 24 hours; in practice the archive was ready within about 10 minutes.
7. Download the ZIP from the email (or from the same settings page). It is named like `Basic_LinkedInDataExport_<date>.zip` and holds many files; the only one you need is `Connections.csv`. Extract just that file:
   ```bash
   unzip -j ~/Downloads/Basic_LinkedInDataExport_*.zip Connections.csv -d data/
   ```

LinkedIn moves these menus around now and then. If the labels differ, search LinkedIn Help for "download your account data".

## What is in the file

```
First Name, Last Name, URL, Email Address, Company, Position, Connected On
```

- The file starts with a short *Notes:* paragraph above the header. jev-gtm-playbook skips it.
- Email addresses are mostly blank: LinkedIn only includes them for connections who allowed it.
- Company and Position are blank for people who hide their current role. jev-gtm-playbook skips those rows for free.

## What jev-gtm-playbook does with it

| Column | Stays on your machine | Sent to TypeSafe |
|---|---|---|
| First Name, Last Name | Yes | No |
| URL, Email Address | Yes | No |
| Company, Position | Yes | **Yes**, together with your ICP text |
| Connected On | Yes | No |

## Score it

```bash
npm run score -- ~/Downloads/Connections.csv
```

That imports the file, judges each distinct role once, prints a summary and writes `data/scored-connections.csv`: one row per connection with a 0–100 fit score, the persona group and each dimension as a percentage. Open it in any spreadsheet, sort by fit, and look at the top and bottom 50.

Or run `npm start`, upload the file in the *Import & schedule* tab, and use the **Download scored CSV** link. Each person goes through [playbook 01](../playbooks-JEv/01-linkedin-network-icp.md).

## Job changes

Signals need two exports to compare. Request a fresh export every week or two and score it the same way: only the people whose title or company changed are sent to Jev again, and each change is interpreted by [playbook 02](../playbooks-JEv/02-job-change-interpretation.md).
