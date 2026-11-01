# ACC Bonspiel Manager

Bonspiels and a four-sheet curling scoreboard for the Almonte Curling Club. An organiser sets up an event of up to 16 teams and the app builds the schedule. Each draw runs on the scoreboard, with phones entering scores and a TV showing all four sheets and the countdown. Results feed the standings, brackets and a public event page.

| Page | Used by | What it does |
|---|---|---|
| `bonspiel.html` | Bonspiel organiser (admin PIN) | Set the format, enter teams, generate and save the schedule, make draws live, seed the playoffs. |
| `event.html` | Anyone | The public page: schedule, live and final scores, standings, brackets and teams. |
| `admin.html` | Draw organiser (admin PIN) | Make one-off draws by hand, add logos, set stones, hammer, ends and timer minutes. Make a draw live or take it off live. Adjust or reset the timer. |
| `index.html` | Scorers (score PIN) | See all four sheets, start the draw, enter each end. Tap a sheet to score, correct an end, swap the hammer or finish the game. |
| `tv.html` | The TV | Four sheet strips and the countdown. Casts to a Chromecast, or open it in any TV browser. |

## How it works

- `docs/` is the website, published with GitHub Pages. There is no build step.
- `backend/` is a Google Apps Script web app bound to a Google Sheet, which holds the draws, games and logos.
- Each page asks the backend for the live draw every 4 seconds, so a score reaches the TV within about 5 seconds.
- The timer is a stored start time, so phones and the TV count down together and a page can reload without losing it.
- The TV fetches its own data. The phone that starts casting can disconnect and the TV keeps updating.

Unticking **Show timer** on a draw hides the countdown and the **Start draw** button on the TV and scoring pages. The admin page still shows the timer.

The hammer is worked out from the ends: the team that scores gives up the hammer, and a blank end leaves it where it was. Correcting an earlier end updates everything after it. **Swap hammer** flips who started with it, for when the setup was wrong.

If a tied game needs an extra end, keep scoring: the line score grows by itself. **Finish game** stops a sheet early and removes its hammer.

## Running a bonspiel

The four steps on `bonspiel.html`:

1. **Details:** name, date, format and settings. The formats are pools then playoffs, fixed games ranked on points, and single or double knockout.
2. **Teams:** add up to 16 teams with their rosters, seeds and logos. **Assign pools** deals the seeded teams out evenly, and you can change any pool by hand.
3. **Schedule:** enter the first draw time, then generate. The preview isn't saved until you say so. Tap two games to swap them, and the page says if a swap puts a team on two sheets or a game ahead of a result it needs.
4. **Run:** press **Make live** for the current draw and score it as usual. **Take off live** clears the scoring page and TV without losing any scores or the timer. In a fixed-games event, press **Fill round** after each round. When the pools end, check the seeds and press **Fill the playoff games**.

Rules to know:

- A win is 2 points, a tie 1 and a loss 0. You can change these in the details.
- **Track ends won** adds an EW column and points for each end a team scores in, which can be 0 to track them without points. A blank end counts for nobody.
- **Add points for total score** gives a team 1 point for each point it scores. Set a limit to count only that many from any one end, so with a limit of 3, an end of 5 earns 3. The limit doesn't change the game's score or the difference.
- Changing these options updates the standings straight away, including for games already played.
- Teams rank on points, then head-to-head wins, ties and losses, then point difference. Draw-shot results aren't recorded, so a tie that remains is marked for you to settle in the playoff seeds.
- A playoff or knockout game can't finish tied. Finishing one puts the winner and loser into their next games.
- To change the score of a finished playoff or knockout game, reopen it first. Reopening clears the next games, and is refused if one of them has started.
- In fixed games, the first round sets the top half of the seeds against the bottom half. Each later round is seeded from the standings once the round before is finished: 1st plays 2nd, 3rd plays 4th and so on, skipping a team already met unless a rematch is the only way. The organiser sees these games first and can change them.
- With an odd number of teams, games per team must be even. A team sits out each round, and those who have played least go first next round, so a short last round can follow to even up the games.
- A filled round stays as it is if an earlier score is corrected afterwards, so check the scores before pressing **Fill round**.
- Double knockout ends with one final between the two bracket winners, with no reset game.
- Once any score is entered, the schedule can't be replaced.
- On `admin.html`, a bonspiel draw can have its stones, hammer and timer changed, but not its teams, and it can't be deleted there.

## Setup

About 30 minutes, once.

### 1. Backend

This app has its own Sheet and Apps Script project, separate from the live ACC Scoreboard. Use the `clubmgr` clasp login for every clasp command.

1. Create the Sheet and script once, then push the code. `.clasp.json` already points at them, so only a fresh copy needs `clasp create-script`:
   ```
   clasp --user clubmgr push --force
   ```
2. Open the Apps Script project, choose the `setup` function and click **Run**. Approve the permissions. This creates the `Draws`, `Games`, `Logos`, `Bonspiels` and `Teams` tabs. Run it again after a change that adds columns.
3. Under **Project Settings → Script properties**, add `ADMIN_PIN` and `SCORE_PIN`. The app refuses every change until they are set.
4. Click **Deploy → New deployment → Web app**, with *Execute as* **Me** and *Who has access* **Anyone**. Copy the `/exec` address.

After changing `Code.gs`, push it, then use **Deploy → Manage deployments → Edit → New version** so the `/exec` address stays the same.

### 2. Website

1. Paste the `/exec` address into `API_URL` in `docs/js/config.js`.
2. Push this folder to a GitHub repository, for example `lascellk/ACC-Bonspiel-Manager`.
3. Under **Settings → Pages**, choose **Deploy from a branch**, `main`, `/docs`.

### 3. Google Cast

The Cast app is published, so it runs on any Cast device without registering test devices. To set it up again, follow `ACC_50-50/CAST_SETUP.md`. The registration fee is already paid, so only these parts differ:

- **Name:** `ACC Bonspiel Manager`
- **Receiver Application URL:** `https://lascellk.github.io/ACC-Bonspiel-Manager/tv.html?cast=1`
- Put the Application ID in `CAST_APP_ID` in `docs/js/config.js`.

The Cast icon is at the top of the scoring and admin pages. If casting can't start, tapping it says why.

Casting from a web page works in Chrome on Android and computers, but not on iPhones or iPads. An iPhone user can still score, and someone with Android or a computer starts the cast. Until the Cast app is registered, open `tv.html` in Chrome on a computer and use Chrome's **Cast tab**.

## Logos

**Add logo** on the admin page takes a PNG, JPEG or WebP. The browser shrinks it to 160 pixels and it is saved in the `Logos` tab. The ACC crest is always available, and a team with no logo shows its initials.

## Developing

```
npm test      # rules and backend tests
npm run dev   # http://localhost:8787, admin PIN 1234, score PIN 0000
```

`npm run dev` runs the real `Code.gs` against an in-memory fake of the Google services (`dev/gas-fake.js`). Its data is lost when it stops.

## Limits

- Apps Script is free but not instant. The first request after a quiet spell can take a few seconds.
- The two PINs keep casual visitors out. They are not strong security, and the scoreboard itself is public to anyone with the link.
- The original artwork in `Reference/` is kept out of the repository. The site uses the smaller copies in `docs/assets/`.
