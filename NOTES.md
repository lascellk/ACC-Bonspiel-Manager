# Notes

Ongoing issues and follow-ups, newest first. Kept in the repo so they're there on every computer. This repo is public: nothing sensitive here (logins, script User-Agent ids, ticket details beyond a number).

## 2026-11-26: host bot protection may block the CCM login (open)

The web host's Imunify360 bot protection on almontecurling.ca has been refusing some Google Apps Script requests to `/administrator/` with HTTP 403. It hit the Payment Tracker and the bar schedule on 26 Nov. The Bonspiel Manager logs in the same way (`ccmLogin` in `backend/Ccm.gs`, used to load players from Events Booking), so it can be blocked too. If that happens, `ccmLogin` says "Could not log in… Check CCM_USER and CCM_PASSWORD" even though the login is fine.

Hosting ticket #19684 asks the host to allow our Apps Script requests. The full details, including this script's User-Agent id, are in the private acc-payment-tracker repo's NOTES.md.

27 Nov: the host replied and asked for a Referer header on the login POST; `ccmFetch` now sends one on every request. The same evening, creating a bonspiel failed with "Could not log in… Check CCM_USER and CCM_PASSWORD", a few minutes after two Payment Tracker admin runs got the host's "One moment, please..." bot check. Several logins within a few minutes, from any of the club's scripts, seem to bring on that check. `ccmFetch` now names the bot check or a 403 as the host's block instead of blaming the password.

To follow up:
- Waiting on the host's reply to ticket #19684.
