# ACC Bonspiel Manager: build plan

## Context

The scoreboard, phone scoring and casting are working. The user wants to grow it into the **ACC Bonspiel Manager**: an organiser sets up a bonspiel of up to 16 teams on four sheets, the app produces the schedule, each draw runs on the existing scoreboard, and results feed standings and brackets on a public page.

Chosen scope: pools then playoffs, fixed games ranked on points, and single or double knockout. Teams and rosters, schedule and draws, results and brackets, and a public event page. The organiser enters the teams. There is no online sign-up, payment or A/B/C events.

## Approach

This is a separate project in `D:\DEV\ACC_Apps\ACC_Bonspiel_Manager`, copied from the working Scoreboard app, which stays live and untouched. It uses the same architecture: a GitHub Pages site, an Apps Script backend bound to a Google Sheet, PINs and polling. A bonspiel **generates ordinary draws**, so scoring, the TV and casting carry over and one-off draws made by hand remain possible.

The copy has no `.clasp.json`, and `API_URL` and `CAST_APP_ID` are blank, so it can't reach the live Scoreboard. Develop locally with `npm run dev` until the first deployment.

The first deployment needs its own Sheet in the Drive Scoreboard folder or a new one, Apps Script project (`clasp --user clubmgr`), PINs, GitHub repository, and Cast app registered by the user with the new receiver address, published as before. The PIN storage key is `acc-bonspiel-pin`, because both sites share the `lascellk.github.io` browser storage.

## Data (`backend/Code.gs`)

New Sheet tabs, added to `TABS` and created by re-running `setup`:

- `Bonspiels`: id, name, startDate, format, settings (JSON: games per team, pool count, playoff size, points for win/tie/loss, ends, minutes), status.
- `Teams`: id, bonspielId, name, skip, third, second, lead, club, logo, seed, pool.

New columns, added at the end so existing rows stay valid:

- `Draws`: bonspielId, startsAt.
- `Games`: gameId, team1Id, team2Id, phase (pool, playoff, knockout), bracket position, source1, source2.

A source is a reference such as `W:<gameId>` or `L:<gameId>`, for a slot that fills when an earlier game ends.

New admin actions: `saveBonspiel`, `deleteBonspiel`, `saveTeam`, `deleteTeam`, `saveSchedule`, `seedPlayoffs`. New public GET: `?action=bonspiel&id=`, cached like the live draw.

`setFinal` gains two rules:

- A knockout or playoff game can't finish tied.
- Finishing a game fills any later game whose source points to it. Reopening a game clears those slots only if the later game hasn't started; otherwise it returns an error for the organiser to resolve.

## Rules (`docs/js/bonspiel.js`, new)

Pure functions with no DOM, in the same style as `docs/js/core.js`, reusing `totals()`:

- `roundRobin`, `fixedGames`, `singleKnockout`, `doubleKnockout`: build the games, with byes to the top seeds when the team count isn't a bracket size.
- `assignDraws`: put games into draws of up to four sheets, with no team twice in a draw, and spread rest and sheet use evenly.
- `standings`: rank by points, then head-to-head, then points-for difference. A tie that remains is flagged for the organiser, because draw-shot results aren't recorded.

Schedules are generated in the browser, previewed, and only then saved. Apps Script has no way to share these ES modules, so the only rule on the server is the small source-filling step above.

## Pages

- `docs/admin.html` and `docs/js/admin.js`: stay as the draw and logo tools, and link to the new organiser page.
- `docs/bonspiel.html` and `docs/js/bonspiel-admin.js` (new, admin PIN), with four steps:
  1. **Details:** name, dates, format, settings.
  2. **Teams:** add, edit and seed teams, with rosters, using the existing logo picker. Assign pools.
  3. **Schedule:** enter draw times, generate, preview, swap games, save.
  4. **Run:** see the draws, press **Make live** for the current one (`goLive`), and seed the playoffs when pools end.
- `docs/event.html` and `docs/js/event.js` (new, no PIN, phone-friendly): schedule, live and final scores, standings, brackets, teams. Polls more slowly than the scoreboard.
- `docs/index.html` and `docs/tv.html`: no behaviour change, except that the title shows the bonspiel name with the draw name.
- `docs/js/view.js`: reuse `esc`, `logoHtml`, `toast`, `requirePin`.
- `docs/css/app.css`: add bracket, standings and step styles.
- `README.md`: update for the new name and the setup steps.

## Default rules, all editable in settings or by the organiser

- Win 2, tie 1, loss 0. Ties are allowed only in pool and fixed-game formats.
- Double knockout finishes with one final between the two bracket winners, with no reset game.
- Team 1 gets red, and the hammer follows the setting on each game. The organiser or scorer can still change it, as they can today.

## Build order

Each stage is tested locally, then deployed backend first and website second:

1. Data model, teams and rosters, organiser page.
2. Schedule generators and the schedule step.
3. Results, standings, source filling and brackets.
4. Public event page, app rename, README.

The live Scoreboard's Sheet, backend, site and Cast app are never changed by this work.

## Verification

- `npm test`: add `test/bonspiel.test.js` covering every format at 4, 7, 8, 12, 15 and 16 teams (each game has valid teams, no team twice in a draw, every team has its game count, byes are correct), standings tie-breaks, and backend tests for source filling, reopening and tied finals.
- Browser test against `npm run dev`, as the current puppeteer scripts do: create a 16-team bonspiel, generate the schedule, score every game through the scoring page, and confirm standings, playoffs and the public page. Include a phone-width check.
- After each deployment: check the live backend response and the published Pages build, confirm the existing scoring page and TV still work, and have the user confirm a real cast.
