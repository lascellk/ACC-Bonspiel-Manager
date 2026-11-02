# ACC Bonspiel Manager

Read `README.md` for what the app does and how it is set up, and `PLAN.md` for the original design.

This file is the project memory that follows the repo between computers. Claude's own memory stays on one computer, so record anything needed on every computer here, commit it and push it.

## Working on it

- `npm test` runs the rules and backend tests. `npm run dev` serves http://localhost:8787 with admin PIN 1234 and score PIN 0000.
- There is no build step, and `npm install` is not needed. The tests use only Node.
- `docs/` is published by GitHub Pages from `main`, so a push to `main` goes live. Don't put private notes there.
- A `backend/` change only reaches the live app after `clasp --user clubmgr push --force`, then **Deploy → Manage deployments → Edit → New version**, so the `/exec` address stays the same. Deploy the backend first, then the website.
- Tests must not depend on timing: this code can run two writes within a millisecond on a fast computer.

## Each computer needs

- Git, Node LTS and `npm install -g @google/clasp`.
- `clasp login --user clubmgr`. The login is stored per computer and is never committed.
- `Reference/` holds the original artwork and is not in the repository.
- Pull before starting and push when finished.

## Rules

- This app is separate from the live ACC Scoreboard. Never change that app's Sheet, backend, site or Cast app.
- The PIN storage key is `acc-bonspiel-pin`, because both sites share the `lascellk.github.io` browser storage.
