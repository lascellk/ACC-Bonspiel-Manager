# ACC Bonspiel Manager

Read `README.md` for what the app does and how it is set up, and `PLAN.md` for the original design.

This file is the project memory that follows the repo between computers. Claude's own memory stays on one computer, so record anything needed on every computer here, commit it and push it.

Keep this file up to date without being asked. As work goes on, add any decision, rule, setup step or unfinished work that a later session would need, and remove what stops being true. Keep it short, and leave out what the code, `README.md` or git history already say. Commit and push each update with the work it belongs to, or on its own if there is no other work.

## Working on it

- `npm test` runs the rules and backend tests. `npm run dev` serves http://localhost:8787 with admin PIN 1234 and score PIN 0000.
- There is no build step, and `npm install` is not needed. The tests use only Node.
- `docs/` is published by GitHub Pages from `main`, so a push to `main` goes live. Don't put private notes there.
- A `backend/` change only reaches the live app after `clasp --user clubmgr push --force`, then **Deploy → Manage deployments → Edit → New version**, so the `/exec` address stays the same. Deploy the backend first, then the website.
- The new-version step can also be run with `clasp --user clubmgr create-deployment --deploymentId <id> --description "..."`, using the id from `API_URL` in `docs/js/config.js`. Clasp can take over a minute per command.
- Tests must not depend on timing: this code can run two writes within a millisecond on a fast computer.
- Deploy changes live without asking once `npm test` passes, backend first. If tests fail, stop and report. If `TABS` columns change, tell the user to rerun `setup` in the Apps Script editor. This doesn't cover destructive actions such as deleting data or rewriting history.
- The app is live but still a dev project with no real users, so a live fault isn't urgent.
- The user tests with Chrome's Empty cache and hard reload, so don't suggest a stale cache as the cause of a reported problem, unless it was checked within seconds of a deploy.

## Each computer needs

- Git, Node LTS and `npm install -g @google/clasp`.
- `clasp login --user clubmgr`. The login is stored per computer and is never committed.
- `Reference/` holds the original artwork and is not in the repository.
- Pull before starting and push when finished.

## Unfinished

- On 2026-11-01 about 1 in 3 backend calls hung for 2 minutes, then failed with Google's "server error occurred while reading from storage" (`DEADLINE_EXCEEDED`). The ACC Scoreboard backend was not affected, and a new deployment address hung just as often. The website now retries reads and PIN logins after 10 seconds, but saves can still hang. The user will recheck it as a likely Google problem. If it persists, copying the backend into a new Apps Script project is the next step.
- The hammer and colour wheels have been tested in Chrome but not on a real Chromecast. Check the spin is smooth there.

## Rules

- This app is separate from the live ACC Scoreboard. Never change that app's Sheet, backend, site or Cast app.
- The PIN storage key is `acc-bonspiel-pin`, because both sites share the `lascellk.github.io` browser storage.
