// Temporary: run from the editor to see the User-Agent Google sends with UrlFetch, for a hosting
// ticket about the web host's bot protection. Echo site only; it doesn't touch the club site.
function checkUserAgent() {
  console.log(UrlFetchApp.fetch('https://httpbin.org/headers').getContentText());
}
