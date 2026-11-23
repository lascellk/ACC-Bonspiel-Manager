# ACC Bonspiel Manager

Bonspiels and a four-sheet curling scoreboard for the Almonte Curling Club. An organiser sets up an event of up to 16 teams and the app builds the schedule. Each draw runs on the scoreboard, with phones entering scores and a TV showing all four sheets and the countdown. Results feed the standings, brackets and a public event page.

| Page | Used by | What it does |
|---|---|---|
| `bonspiel.html` | Bonspiel organiser (admin PIN) | Set the format, enter teams, generate and save the schedule, make draws live, seed the playoffs. |
| `event.html` | Anyone | The public page: schedule, live and final scores, standings, brackets and teams. |
| `admin.html` | Draw organiser (admin PIN) | Make one-off draws by hand, add logos, set stones, hammer, ends and timer minutes. Make a draw live or take it off live. Adjust or reset the timer. Choose what the TV shows. |
| `index.html` | Scorers (score PIN) | See all four sheets, start the draw, enter each end. Tap a sheet to score, correct an end, swap the hammer or finish the game. |
| `tv.html` | The TV | Four sheet strips and the countdown. Casts to a Chromecast, or open it in any TV browser. |

## How it works

- `docs/` is the website, published with GitHub Pages. There is no build step.
- `backend/` is a Google Apps Script web app bound to a Google Sheet, which holds the draws, games and logos.
- Each page asks the backend for the live draw every 4 seconds, so a score reaches the TV within about 5 seconds.
- The timer is a stored start time, so phones and the TV count down together and a page can reload without losing it.
- The TV fetches its own data. The phone that starts casting can disconnect and the TV keeps updating.

Unticking **Show timer** on a draw hides the countdown and the **Start draw** button on the TV and scoring pages.

Once a draw has started, the scoring page also has **Reset**, which puts the timer back to full time and stopped, and takes the draw off the rink clock. The admin page still shows the timer.

The hammer is worked out from the ends: the team that scores gives up the hammer, and a blank end leaves it where it was. Correcting an earlier end updates everything after it. **Swap hammer** flips who started with it, for when the setup was wrong. A new hand-made draw starts with no stone colour or hammer chosen, and can be saved that way: those stones show grey, and no team has the hammer until it is chosen in the draw, by the wheels, or on the scoring page, where **Swap hammer** becomes a button for each team. The first scored end also settles it.

If a tied game needs an extra end, keep scoring: the line score grows by itself. **Finish game** stops a sheet early and removes its hammer. Finishing a game with no ends scored asks first, because it counts as a 0-0 tie.

**Finish draw** at the bottom of the scoring page makes every game final, resets the timer and clears the rink clock. If a sheet has no ends scored, it asks whether to finish that game too, as a 0-0 tie; **Cancel** leaves it open. A tied playoff game can't finish and stays open. The page lists any sheet it left open.

## Running a bonspiel

The five steps on `bonspiel.html`:

1. **Details:** name, date, format and settings, including the game type. The game types match the rink Draw Clock: **8-End Draw** (95 min), **6-End Draw** (65 min), **Mixed Doubles** (8 ends, 90 min), or **Custom** for any ends and minutes. The draw editor on `admin.html` has the same choice. The formats are pools then playoffs, fixed games ranked on points, and single or double knockout.
2. **Players:** everyone playing, with their email, registration status and notes, and **Skip**, **Vice**, **Second** and **Lead** boxes for the positions they prefer. A ticked box saves straight away. **Copy emails** copies every address, ready to paste into an email, and a popup confirms it with the ACC rule that players are only ever sent emails as **BCC**, never To or CC. If the browser won't copy, the popup shows the addresses selected to copy by hand.
   - **Details** chooses where the players come from: **Added by hand**, or **From a CCM event's registrations**. Choosing a CCM event lists this season's Events Booking events from the club website, with seasons starting June 1 (this takes a few seconds), fills in the name and date of a new bonspiel, and gets its players when saved.
   - **Update from CCM** gets the registrations again: new ones are added, changed names, emails and statuses are updated, and cancelled ones are taken off. Ticked positions stay. Players on the waiting list are listed last. A preferred position given on the registration form is ticked when the player is first added.
   - A CCM player's name and email come from CCM, so change them there. **Add player** adds someone by hand, who can be edited or deleted here.
   - Players and their emails are only shown with the admin PIN. They're never on the public page.
3. **Teams:** add up to 16 teams with their rosters, seeds and logos. When the bonspiel has players, the **Skip**, **Third**, **Second** and **Lead** boxes offer them in a list: those who prefer that position come first (Third is the vice), and anyone already on another team is left out. Any other name can still be typed. The step also counts how many players are on a team.
   - **Make teams from players** suggests teams of four from the players not yet on a team, leaving out the waiting list unless **Include the waiting list** is ticked. As many players as possible get a position they ticked, players with nothing ticked fill the rest, and a player only gets a position they didn't tick when there's no other way. Players with the same draw time preference are put together. When the players don't divide into fours, the extras are listed as not on a team: unpaid players sit out before any paid player does. Teams are named after their skip.
   - Nothing is saved until **Save teams**. Tap two players to swap them (including someone not on a team), type over a team name, change **Teams to make**, or press **Shuffle** for another equally good set. Green marks a position the player ticked and orange one they didn't. **Assign pools** deals the seeded teams out evenly, and you can change any pool by hand.
4. **Schedule:** enter the first draw time, then generate. The preview isn't saved until you say so. Tap two games to swap them, and the page says if a swap puts a team on two sheets or a game ahead of a result it needs.
5. **Run:** press **Make live** for the current draw and score it as usual. **Take off live** clears the scoring page and TV without losing any scores or the timer. In a fixed-games event, press **Fill round** after each round. When the pools end, check the seeds and press **Fill the playoff games**.

Rules to know:

- A win is 2 points, a tie 1 and a loss 0. You can change these in the details.
- **Track ends won** adds an EW column and points for each end a team scores in, which can be 0 to track them without points. A blank end counts for nobody.
- **Add points for total score** gives a team 1 point for each point it scores. Set a limit to count only that many from any one end, so with a limit of 3, an end of 5 earns 3. The limit doesn't change the game's score or the difference.
- Changing these options updates the standings straight away, including for games already played.
- **Standings show** on the Details step takes effect as soon as it is changed, without **Save details**. It chooses a table for each pool, or all teams in one table (for pools that only split the draws, such as early and late). Playoff seeds and the standings editor follow the same choice. A pool table counts its teams' games against other pools too.
- Teams rank on points, then head-to-head wins, ties and losses, then point difference. Draw-shot results aren't recorded, so a tie that remains is marked for you to settle in the playoff seeds.
- A playoff or knockout game can't finish tied. Finishing one puts the winner and loser into their next games.
- To change the score of a finished playoff or knockout game, reopen it first. Reopening clears the next games, and is refused if one of them has started.
- In fixed games, the first round sets the top half of the seeds against the bottom half. Each later round is seeded from the standings once the round before is finished: 1st plays 2nd, 3rd plays 4th and so on, skipping a team already met unless a rematch is the only way. The organiser sees these games first and can change them.
- With an odd number of teams, games per team must be even. A team sits out each round, and those who have played least go first next round, so a short last round can follow to even up the games.
- A filled round stays as it is if an earlier score is corrected afterwards, so check the scores before pressing **Fill round**.
- Double knockout ends with one final between the two bracket winners, with no reset game.
- **Delete schedule** on the Schedule step removes the schedule and its draws, and keeps the teams.
- Once any score is entered, the schedule can't be replaced or deleted.
- On `admin.html`, a hand-made draw can be linked to a bonspiel: choose it under **Teams from**, then pick each team from the list or type any name. A picked team brings its logo. Saving a team later, for example with a new logo or name, updates the games in that bonspiel's linked draws that use its old or new name. Its finished games count in that bonspiel's standings for any team whose name matches one of the bonspiel's teams, ignoring capitals. They don't count towards seeding the next round or the playoffs.
- The Run step lists the bonspiel's own draws, then its linked hand-made draws in order of date and **Start time**, each with **Make live**.
- **Edit standings** on the Run step shows each number worked out from the games in its box. Type a number to replace it, or empty the box to go back to the games. **Use the games for all** removes every typed number. Typed numbers show on the public page and set the order: teams rank on the typed points, then head-to-head, then the typed difference. They also count when seeding the next round or the playoffs, and they stay as typed when more games finish.
- **Reset all results** in the standings editor deletes every score and final in the bonspiel and its linked hand-made draws, restarts their timers, empties games that were filled from results or seeds, and removes typed standings. Teams, the schedule, stones and hammer stay. It can't be undone.
- The public page opened with no bonspiel chosen (`event.html`, the link on the table sign) shows the bonspiel that's on: the one whose draw is live on the scoreboard, otherwise the earliest that started in the last 3 days or is still to come, otherwise the most recent. **All bonspiels** at the top lists them all, newest first. Archived bonspiels are left out of both.
- **Archive bonspiel** on the Details step is for a bonspiel that's over. It keeps its teams, draws and results, but takes it off the public page's list and choice, the admin page's TV and **Teams from** choices, and the TV if it shows it. Its own `event.html?id=` link still works. Archived bonspiels sit in a closed **Archived** list on `bonspiel.html`, and **Unarchive bonspiel** brings one back. On `admin.html`, the bonspiel's draws and the hand-made draws linked to it move to a closed **Archived draws** list, without **Make live** or **Delete**, because they hold its results; deleting a draw would remove those results for good. The backend refuses to delete one too. A draw that is live stays in the main list until it's taken off live. Unarchiving the bonspiel puts its draws back.
- The public Schedule tab shows the bonspiel's saved schedule if it has one. If not, it shows the hand-made draws linked to that bonspiel, in order of date and **Start time**.
- On `admin.html`, a bonspiel draw can have its stones, hammer and timer changed, but not its teams, and it can't be deleted there.

## Ad-hoc draws and their results

A hand-made draw with **Teams from** set to **No bonspiel** is an ad-hoc draw. Its editor has **Points for the results table**: points for a win, tie and loss, ends won and total score, the same choices as a bonspiel. A draw linked to a bonspiel scores by the bonspiel's settings instead, so the box is hidden.

- **Results** on the draw's card opens its results page (`event.html?draw=<id>`): a table of its teams ranked by those points, and a Scores tab. Only finished games count, so press **Finish draw** on the scoring page when the draw ends.
- **TV shows → Draw results** puts that page on the lounge TV, switching between the two tabs.
- **Reset results** in the results page's header clears every score and final in the draw and resets its timer. Teams, stones and hammer stay. It shows only on a device that has signed in to the scoring or admin page, never on the TV, and needs the admin PIN.

## Random hammer and colour

**Random hammer / colour** in the draw editor saves the draw and puts four wheels on the TV, whatever it was showing and whichever draw is live. Tick **Hammer**, **Colour** or both, then press **Spin**.

- Each wheel has the two team names, on red and blue if **Colour** is ticked. The team a wheel lands on gets the hammer and the colour it landed on.
- The result is saved in the draw straight away. **Close** stays off until the wheels have stopped, about 14 seconds. Spinning again replaces the result.
- A sheet with scores, or without two teams, doesn't spin and keeps its hammer and stones.
- **Close** puts the TV back. If the admin page is closed first, use **Take the wheels off the TV** under **TV shows**. After 30 minutes the wheels leave by themselves.

## Rink draw clock

The club's separate ACC Draw Clock (the big countdown on the rink TV) follows the scoreboard's draws, so the curlers on the ice and the scoreboard TV see the same time.

- **Start draw** puts the draw on the rink clock under its name, for any draw with **Show timer** ticked: a bonspiel draw, or a hand-made draw for an ad-hoc game. A draw with **Show timer** unticked leaves the rink clock alone, and unticking it on a running draw takes it off the rink clock.
- Pause, **Start draw** again, adjusting the timer and resetting it all change the rink clock to match, as long as it still shows that draw. If a member starts a league draw on the Draw Clock in the meantime, it is left alone until the next **Start draw** here.
- **Reset all results** takes the bonspiel's draws off the rink clock.
- The scoreboard timer and the rink TV both turn yellow at 15 minutes, with no sound. Only the rink TV plays start and time-up sounds.
- If the Draw Clock can't be reached, the scoreboard timer works as usual. The failure shows under **Executions** in the Apps Script project.
- On league nights the Draw Clock works on its own, as before.

## Setup

About 30 minutes, once.

### 1. Backend

This app has its own Sheet and Apps Script project, separate from the live ACC Scoreboard. Use the `clubmgr` clasp login for every clasp command.

1. Create the Sheet and script once, then push the code. `.clasp.json` already points at them, so only a fresh copy needs `clasp create-script`:
   ```
   clasp --user clubmgr push --force
   ```
2. Open the Apps Script project, choose the `setup` function and click **Run**. Approve the permissions. This creates the `Draws`, `Games`, `Logos`, `Bonspiels`, `Teams` and `Players` tabs. Run it again after a change that adds columns.
3. Under **Project Settings → Script properties**, add `ADMIN_PIN` and `SCORE_PIN`. The app refuses every change until they are set.
4. Click **Deploy → New deployment → Web app**, with *Execute as* **Me** and *Who has access* **Anyone**. Copy the `/exec` address.

5. To link the rink draw clock, add `DRAW_CLOCK_URL` (the Draw Clock's `/exec` address) and `DRAW_CLOCK_KEY` (the same text as `SYNC_KEY` in the Draw Clock's Script properties). Then choose `testDrawClock` and click **Run**: it asks once for permission to connect to an external service and logs whether the Draw Clock accepted the key. Leave both properties unset to keep the clock unlinked.
6. Choose `testLockoutEmail` and click **Run**. It asks once for permission to send email, then sends the PIN lockout email to clubmgr@almontecurling.ca so you can see it arrives. Add a `LOCKOUT_EMAIL` script property to send it to someone else.
7. To let the backend log in to the club website's admin site (Curling Club Manager, `almontecurling.ca/administrator`), add `CCM_USER` and `CCM_PASSWORD`, the same login the Payment Tracker uses. Then choose `checkCcmLogin` in `Ccm.gs` and click **Run**: it logs in, logs out and says whether it worked. The Players step uses it to read Events Booking's registrant export. It only reads the site.

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

**TV shows** on the admin page switches the TV between the scoreboard, a bonspiel's public page and an ad-hoc draw's results, within about 5 seconds and without restarting the cast. The bonspiel page moves through its tabs by itself, and slowly scrolls any tab too long for the screen. The TV stays on your choice until you change it, including when a draw goes live.

The Cast icon is at the top of the admin page. If casting can't start, tapping it says why. The scoring page has only score entry, with no Cast, TV or Admin links.

Casting from a web page works in Chrome on Android and computers, but not on iPhones or iPads. An iPhone user can still score, and someone with Android or a computer starts the cast. Until the Cast app is registered, open `tv.html` in Chrome on a computer and use Chrome's **Cast tab**.

## Logos

**Add logo** on the admin page takes a PNG, JPEG or WebP and asks for the club name, which is what the logo lists show. **Rename** changes it later. The browser shrinks the image to 160 pixels and it is saved in the `Logos` tab. The ACC crest is always available, and a team with no logo shows its initials.

**Archive** takes a logo out of the logo choices in the draw editor and team form, and moves it to a closed **Archived logos** list. Teams and games already using it keep showing it. **Unarchive** puts it back in the choices.

## Developing

```
npm test      # rules and backend tests
npm run dev   # http://localhost:8787, admin PIN 1234, score PIN 0000
```

`npm run dev` runs the real `Code.gs` against an in-memory fake of the Google services (`dev/gas-fake.js`). Its data is lost when it stops.

## Limits

- Apps Script is free but not instant. The first request after a quiet spell can take a few seconds.
- The two PINs keep casual visitors out. They are not strong security, and the scoreboard itself is public to anyone with the link.
- To stop anyone guessing a PIN, each wrong PIN takes a second to answer, and after 10 wrong PINs every PIN, even the right one, is refused for 15 minutes from the last wrong one, as in the 50/50 app. This locks out the organisers and scorers too, so if it happens during an event, open the Apps Script project, choose `clearPinLockout` and click **Run** to lift it straight away. When a lockout starts, the backend emails clubmgr@almontecurling.ca (or whoever the `LOCKOUT_EMAIL` script property names) with what to do. If someone is really guessing, change the PINs in **Project Settings → Script properties** too.
- The original artwork in `Reference/` is kept out of the repository. The site uses the smaller copies in `docs/assets/`.
