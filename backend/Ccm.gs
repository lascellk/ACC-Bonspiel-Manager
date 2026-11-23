// Logging in to the club website's admin site (Curling Club Manager, almontecurling.ca/administrator) the way a
// browser does, as the Payment Tracker does. The login comes from the CCM_USER and CCM_PASSWORD script
// properties (Project Settings > Script properties), so it is never in the code or the repo.

var CCM_BASE = 'https://almontecurling.ca/administrator/index.php';
var CCM_UA = 'Mozilla/5.0 (compatible; ACC-Bonspiel-Manager/1.0; Google Apps Script)';

// Run once from the editor after setting the script properties, to check the login works.
function checkCcmLogin() {
  var session = ccmLogin();
  ccmLogout(session);
  console.log('Logged in to the admin site as ' + PropertiesService.getScriptProperties().getProperty('CCM_USER') + ', then logged out.');
}

function ccmLogin() {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty('CCM_USER');
  var password = props.getProperty('CCM_PASSWORD');
  if (!user || !password) throw new Error('Set the CCM_USER and CCM_PASSWORD script properties (Project Settings > Script properties).');
  var session = { cookies: {} };
  // The site sometimes answers with an error or busy page, so the login page is tried once more.
  var res, page, token;
  for (var attempt = 0; attempt < 2 && !token; attempt++) {
    if (attempt) Utilities.sleep(5000);
    res = ccmFetch(session, CCM_BASE, {});
    page = res.getContentText();
    token = page.match(/name="([0-9a-f]{32})" value="1"/);
  }
  if (!token) throw new Error('The admin login page did not load as expected (HTTP ' + res.getResponseCode() + '). Try again in a few minutes.');
  var ret = page.match(/name="return" value="([^"]*)"/);
  var payload = { username: user, passwd: password, option: 'com_login', task: 'login', return: ret ? ret[1] : '' };
  payload[token[1]] = '1';
  ccmFetch(session, CCM_BASE, { method: 'post', payload: payload });
  var logout = ccmFetch(session, CCM_BASE, {}).getContentText().match(/task=logout&(?:amp;)?([0-9a-f]{32})=1/);
  if (!logout) throw new Error('Could not log in to the admin site. Check CCM_USER and CCM_PASSWORD.');
  session.logoutUrl = CCM_BASE + '?option=com_login&task=logout&' + logout[1] + '=1';
  return session;
}

function ccmLogout(session) {
  if (!session || !session.logoutUrl) return;
  try {
    ccmFetch(session, session.logoutUrl, {});
  } catch (err) {
    // The session expires on its own.
  }
}

// Fetches a page with the session's cookies, following redirects by hand so cookies set along the way are kept.
function ccmFetch(session, url, options) {
  var res;
  for (var hop = 0; hop < 5; hop++) {
    var cookie = Object.keys(session.cookies).map(function (k) { return k + '=' + session.cookies[k]; }).join('; ');
    var headers = { 'User-Agent': CCM_UA };
    if (cookie) headers.Cookie = cookie;
    res = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true, followRedirects: false, headers: headers }, options));
    var all = res.getAllHeaders();
    var set = all['Set-Cookie'] || all['set-cookie'] || [];
    if (!Array.isArray(set)) set = [set];
    set.forEach(function (c) {
      var kv = String(c).split(';')[0];
      var i = kv.indexOf('=');
      if (i <= 0) return;
      var name = kv.slice(0, i).trim();
      var value = kv.slice(i + 1).trim();
      if (!value || value === 'deleted') delete session.cookies[name]; else session.cookies[name] = value;
    });
    var code = res.getResponseCode();
    var location = all.Location || all.location;
    if (code < 300 || code >= 400 || !location) return res;
    url = /^https?:/i.test(location) ? location : 'https://almontecurling.ca' + (location.charAt(0) === '/' ? '' : '/administrator/') + location;
    options = {}; // A redirect is followed with a GET.
  }
  return res;
}
