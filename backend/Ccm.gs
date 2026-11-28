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
    // Referer on every request, as a browser sends it: the host's firewall flags a login POST without one (ticket #19684, 2026-11-27).
    var headers = { 'User-Agent': CCM_UA, Referer: CCM_BASE };
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
    // The host's firewall answers some Google addresses with a JavaScript bot check that UrlFetchApp can't pass.
    if (code === 200 && /<title[^>]*>\s*One moment, please/i.test(res.getContentText())) {
      throw new Error('The web host\'s bot check ("One moment, please...") blocked the request to the admin site. This is on the host\'s side, not the password: try again later.');
    }
    if (code === 403) throw new Error('The admin site refused the request (HTTP 403). This is the web host\'s bot protection, not the password: try again later.');
    var location = all.Location || all.location;
    if (code < 300 || code >= 400 || !location) return res;
    url = /^https?:/i.test(location) ? location : 'https://almontecurling.ca' + (location.charAt(0) === '/' ? '' : '/administrator/') + location;
    options = {}; // A redirect is followed with a GET.
  }
  return res;
}

// ----- Events Booking registrations

var CCM_EXPORT = CCM_BASE + '?option=com_eventbooking&task=registrant.export';
var CCM_POSITIONS = { skip: 'skip', mate: 'vice', vice: 'vice', second: 'second', lead: 'lead' };

// Every registration in Events Booking's registrant export, one player each. Only reads the site.
function ccmRegistrants() {
  var session = ccmLogin();
  try {
    var res = ccmFetch(session, CCM_EXPORT, {});
    if (res.getResponseCode() !== 200) throw new Error('The admin site returned HTTP ' + res.getResponseCode() + ' for the registrant export.');
    return registrantsFromRows(xlsxRows(res.getBlob()));
  } finally {
    ccmLogout(session);
  }
}

function xlsxRows(blob) {
  blob.setContentType('application/zip');
  var files = Utilities.unzip(blob);
  var find = function (name) { return files.filter(function (f) { return f.getName() === name; })[0]; };
  var sheet = find('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('The registrant export is not the expected Excel file. Try again in a few minutes.');
  var shared = find('xl/sharedStrings.xml');
  return parseXlsxSheet(sheet.getDataAsString('UTF-8'), shared ? shared.getDataAsString('UTF-8') : '');
}

function xmlText(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// The first worksheet of an .xlsx as rows of strings.
function parseXlsxSheet(sheetXml, sharedXml) {
  var shared = [];
  (sharedXml.match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
    shared.push(xmlText((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join('')));
  });
  return (sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []).map(function (row) {
    var out = [];
    var cell = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    var m;
    while ((m = cell.exec(row))) {
      var col = m[1].split('').reduce(function (n, ch) { return n * 26 + ch.charCodeAt(0) - 64; }, 0) - 1;
      var type = (m[2].match(/t="(\w+)"/) || [])[1];
      var v = ((m[3] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
      var t = ((m[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '';
      out[col] = type === 's' ? shared[Number(v)] : type === 'inlineStr' ? xmlText(t) : xmlText(v);
    }
    for (var i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
    return out;
  });
}

// Rows of the export, with its header row first, as registrations. A missing column is left blank.
// A group entry (a team registered together) is a group row for the person who registered it, with #Registrants
// set to the group size and the fee for everyone, then a row for each player, the registrant usually among them.
// The group row is left out when its players have rows, so no one is listed twice. Each player keeps the group's
// name, which is the registrant's.
function registrantsFromRows(rows) {
  if (!rows.length) return [];
  var head = rows[0].map(function (h) { return String(h).trim(); });
  ['ID', 'Event ID', 'Event', 'Event Date', 'First Name', 'Last Name', 'Email', 'Payment Status'].forEach(function (name) {
    if (head.indexOf(name) < 0) throw new Error('The registrant export has no ' + name + ' column. Has the export changed?');
  });
  var get = function (row, name) {
    var i = head.indexOf(name);
    return i < 0 || row[i] === undefined ? '' : String(row[i]).trim();
  };
  var size = function (row) { return Number(get(row, '#Registrants')) || 1; };
  var data = rows.slice(1).filter(function (row) { return get(row, 'ID'); });
  var hasPlayers = {};
  data.forEach(function (row) {
    if (size(row) === 1 && get(row, 'Group:')) hasPlayers[get(row, 'Event ID') + '|' + get(row, 'Group:')] = true;
  });
  return data.filter(function (row) {
    return size(row) === 1 || !hasPlayers[get(row, 'Event ID') + '|' + get(row, 'Group:')];
  }).map(function (row) {
    var date = get(row, 'Event Date').match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    var preferred = CCM_POSITIONS[get(row, 'Preferred Position').toLowerCase()];
    return {
      id: get(row, 'ID'), eventId: get(row, 'Event ID'), event: get(row, 'Event').replace(/\s+/g, ' '),
      eventDate: date ? date[3] + '-' + ('0' + date[1]).slice(-2) + '-' + ('0' + date[2]).slice(-2) : '',
      name: (get(row, 'First Name') + ' ' + get(row, 'Last Name')).replace(/\s+/g, ' ').trim(),
      email: get(row, 'Email'), status: get(row, 'Payment Status'), drawTime: get(row, 'Draw Time'),
      notes: get(row, 'Notes to the Club'), positions: preferred ? [preferred] : [], group: get(row, 'Group:')
    };
  });
}
