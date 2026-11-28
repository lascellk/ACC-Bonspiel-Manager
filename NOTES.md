# Notes

Ongoing issues and follow-ups, newest first. Kept in the repo so they're there on every computer. This repo is public: nothing sensitive here (logins, script User-Agent ids, ticket details beyond a number).

## 2026-11-26: host bot protection may block the CCM login (fix in, confirming)

The web host's Imunify360 bot protection on almontecurling.ca has been refusing some Google Apps Script requests to `/administrator/` with HTTP 403. It hit the Payment Tracker and the bar schedule on 26 Nov. The Bonspiel Manager logs in the same way (`ccmLogin` in `backend/Ccm.gs`, used to load players from Events Booking), so it can be blocked too. If that happens, `ccmLogin` says "Could not log in… Check CCM_USER and CCM_PASSWORD" even though the login is fine.

Hosting ticket #19684 asks the host to allow our Apps Script requests. The full details, including this script's User-Agent id, are in the private acc-payment-tracker repo's NOTES.md.

27 Nov: the host replied and asked for a Referer header on the login POST; `ccmFetch` now sends one on every request. The same evening, creating a bonspiel failed with "Could not log in… Check CCM_USER and CCM_PASSWORD", a few minutes after two Payment Tracker admin runs got the host's "One moment, please..." bot check. Several logins within a few minutes, from any of the club's scripts, seem to bring on that check. `ccmFetch` now names the bot check or a 403 as the host's block instead of blaming the password.

28 Nov, 10:04 a.m. AST: Paul replied that the Referer change works: the firewall hasn't flagged our requests since. The blocks after it came from Google addresses flagged before the change; he cleared them. Because Google's addresses are shared, he advised treating "One moment, please..." as try again later (about 10 minutes, 2 or 3 times). Done the same day: scheduled runs (Payment Tracker nightly import and 6 a.m. retry, bar daily sync) now set a one-off trigger to retry in 10 minutes, up to 3 times; runs started by hand say to try again in about 10 minutes. If blocks come back, send Paul the times.

To follow up:
- Waiting on the host's reply to ticket #19684.
