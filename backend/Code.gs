// ACC Bonspiel Manager backend. A web app bound to the Google Sheet that holds the data.
// GET returns the live draw; POST takes {action, pin, ...} and returns the live draw.
// Schedules are built in the browser (docs/js/bonspiel.js). The only bonspiel rule here is source filling.
// PINs live in Script Properties: ADMIN_PIN (draw setup) and SCORE_PIN (score entry).

var TABS = {
  Draws: ['id', 'name', 'date', 'ends', 'minutes', 'startedAt', 'leftMs', 'showTimer', 'bonspielId', 'startsAt', 'teamsFrom'],
  Games: ['drawId', 'sheet', 'team1', 'logo1', 'team2', 'logo2', 'stone1', 'hammer', 'ends', 'final',
    'gameId', 'team1Id', 'team2Id', 'phase', 'bracket', 'source1', 'source2'],
  Logos: ['id', 'name', 'data'],
  Bonspiels: ['id', 'name', 'startDate', 'format', 'settings', 'status'],
  Teams: ['id', 'bonspielId', 'name', 'skip', 'third', 'second', 'lead', 'club', 'logo', 'seed', 'pool', 'standing']
};
var CACHE_KEY = 'live-draw';
var CACHE_VERSION = 'bonspiel-version';
var BONSPIEL_CACHE_SECONDS = 30;
var FORMATS = ['pools', 'fixed', 'single', 'double'];
var MAX_TEAMS = 16;
var SHEETS = 4;
var MAX_LOGO_CHARS = 45000; // A Sheet cell holds 50,000 characters.
var MAX_PIN_FAILURES = 10;
var STANDING_FIELDS = ['played', 'won', 'tied', 'lost', 'endsWon', 'scored', 'points', 'diff'];
var SPIN_MAX_MS = 30 * 60000; // The wheels leave the TV by themselves if the admin page goes away.

var ACTIONS = {
  login: { role: 'score', fn: function () { return {}; }, noLock: true },
  timer: { role: 'score', fn: timerAction },
  setEnd: { role: 'score', fn: setEnd },
  swapHammer: { role: 'score', fn: swapHammer },
  setFinal: { role: 'score', fn: setFinal },
  saveDraw: { role: 'admin', fn: saveDraw },
  deleteDraw: { role: 'admin', fn: deleteDraw },
  goLive: { role: 'admin', fn: goLive },
  stopLive: { role: 'admin', fn: stopLive },
  setTvView: { role: 'admin', fn: setTvView },
  openSpin: { role: 'admin', fn: openSpin },
  spinWheels: { role: 'admin', fn: spinWheels },
  closeSpin: { role: 'admin', fn: closeSpin },
  saveLogo: { role: 'admin', fn: saveLogo },
  renameLogo: { role: 'admin', fn: renameLogo },
  deleteLogo: { role: 'admin', fn: deleteLogo },
  saveBonspiel: { role: 'admin', fn: saveBonspiel },
  deleteBonspiel: { role: 'admin', fn: deleteBonspiel },
  saveTeam: { role: 'admin', fn: saveTeam },
  deleteTeam: { role: 'admin', fn: deleteTeam },
  saveSeeding: { role: 'admin', fn: saveSeeding },
  saveStandings: { role: 'admin', fn: saveStandings },
  resetResults: { role: 'admin', fn: resetResults },
  saveSchedule: { role: 'admin', fn: saveSchedule },
  deleteSchedule: { role: 'admin', fn: deleteSchedule },
  seedPlayoffs: { role: 'admin', fn: seedPlayoffs },
  seedRound: { role: 'admin', fn: seedRound }
};

// Run once from the editor to create the tabs.
function setup() {
  var book = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (name) {
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    sheet.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
    sheet.setFrozenRows(1);
  });
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  return respond(function () {
    if (params.action === 'logos') return { logos: readTab('Logos') };
    if (params.action === 'draws') return { draws: allDraws(), liveId: liveId() };
    if (params.action === 'bonspiels') return { bonspiels: readTab('Bonspiels').map(toBonspiel) };
    if (params.action === 'bonspiel') return cachedBonspiel(params.id);
    return {};
  });
}

function doPost(e) {
  return respond(function () {
    var body = JSON.parse(e.postData.contents);
    var action = ACTIONS[body.action];
    if (!action) throw new Error('Unknown action');
    var role = checkPin(body.pin, action.role);
    if (action.noLock) return { role: role };
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var result = action.fn(body) || {};
      cacheLive(buildLive());
      expireBonspiels();
      return result;
    } finally {
      lock.releaseLock();
    }
  });
}

function respond(work) {
  var out;
  try {
    out = work();
    out.ok = true;
    var live = liveState();
    out.draw = live.draw;
    out.tv = live.tv || '';
    out.spin = live.spin || null;
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  out.now = Date.now();
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkPin(pin, role) {
  var cache = CacheService.getScriptCache();
  var failures = Number(cache.get('pin-failures')) || 0;
  if (failures >= MAX_PIN_FAILURES) throw new Error('Too many wrong PINs. Try again in 5 minutes.');
  var props = PropertiesService.getScriptProperties();
  var adminPin = props.getProperty('ADMIN_PIN');
  var scorePin = props.getProperty('SCORE_PIN');
  pin = String(pin === undefined ? '' : pin);
  var held = pin && pin === adminPin ? 'admin' : pin && pin === scorePin ? 'score' : '';
  if (!held) cache.put('pin-failures', String(failures + 1), 300);
  if (!held || (role === 'admin' && held !== 'admin')) throw new Error('Wrong PIN');
  return held;
}

// ----- Sheet access. Every cell is stored as text so a team name is never run as a formula.

function readTab(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  var columns = TABS[name];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, columns.length).getValues().map(function (row, i) {
    var item = { _row: i + 2 };
    columns.forEach(function (column, c) { item[column] = row[c]; });
    return item;
  });
}

function writeRow(name, rowNumber, item) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  var columns = TABS[name];
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
  sheet.getRange(rowNumber, 1, 1, columns.length)
    .setNumberFormat('@')
    .setValues([rowValues(columns, item)]);
}

function rowValues(columns, item) {
  return columns.map(function (column) { return item[column] === undefined ? '' : String(item[column]); });
}

function appendRow(name, item) {
  writeRow(name, SpreadsheetApp.getActive().getSheetByName(name).getLastRow() + 1, item);
}

// One write for the whole set, because a schedule is too many rows to send one at a time.
function appendRows(name, items) {
  if (!items.length) return;
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  var columns = TABS[name];
  var first = sheet.getLastRow() + 1;
  var short = first + items.length - 1 - sheet.getMaxRows();
  if (short > 0) sheet.insertRowsAfter(sheet.getMaxRows(), short);
  sheet.getRange(first, 1, items.length, columns.length)
    .setNumberFormat('@')
    .setValues(items.map(function (item) { return rowValues(columns, item); }));
}

function deleteRows(name, rows) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  rows.map(function (row) { return row._row; }).sort(function (a, b) { return b - a; })
    .forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
}

// ----- Reading draws

function toGame(row) {
  return {
    sheet: Number(row.sheet), team1: String(row.team1), logo1: String(row.logo1),
    team2: String(row.team2), logo2: String(row.logo2), stone: String(row.stone1),
    hammer: row.hammer === '' ? null : Number(row.hammer), ends: JSON.parse(row.ends || '[]'), final: String(row.final) === 'true',
    gameId: String(row.gameId), team1Id: String(row.team1Id), team2Id: String(row.team2Id),
    phase: String(row.phase), bracket: String(row.bracket), source1: String(row.source1), source2: String(row.source2)
  };
}

function toDraw(row, games) {
  return {
    id: String(row.id), name: String(row.name), date: String(row.date), ends: Number(row.ends),
    minutes: Number(row.minutes), startedAt: Number(row.startedAt), leftMs: Number(row.leftMs),
    showTimer: String(row.showTimer) !== 'false', // Draws saved before this setting existed are blank.
    bonspielId: String(row.bonspielId), startsAt: String(row.startsAt), teamsFrom: String(row.teamsFrom),
    games: games.filter(function (game) { return String(game.drawId) === String(row.id); })
      .map(toGame).sort(function (a, b) { return a.sheet - b.sheet; })
  };
}

function allDraws() {
  var games = readTab('Games');
  return readTab('Draws').map(function (row) { return toDraw(row, games); });
}

function liveId() {
  return PropertiesService.getScriptProperties().getProperty('LIVE_DRAW') || '';
}

function buildLive() {
  var id = liveId();
  var row = readTab('Draws').filter(function (draw) { return String(draw.id) === id; })[0];
  if (!row) return null;
  var draw = toDraw(row, readTab('Games'));
  var bonspielId = draw.bonspielId || draw.teamsFrom;
  var bonspiel = bonspielId && readTab('Bonspiels').filter(function (item) { return String(item.id) === bonspielId; })[0];
  if (bonspiel) draw.bonspielName = String(bonspiel.name);
  return draw;
}

function liveState() {
  var hit = CacheService.getScriptCache().get(CACHE_KEY);
  return hit ? JSON.parse(hit) : cacheLive(buildLive());
}

function cacheLive(draw) {
  var state = { draw: draw, tv: tvBonspiel(), spin: tvSpin() };
  CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(state), 60);
  return state;
}

function findDraw(id) {
  var row = readTab('Draws').filter(function (draw) { return String(draw.id) === String(id); })[0];
  if (!row) throw new Error('That draw no longer exists');
  return row;
}

function findGame(drawId, sheet) {
  var row = readTab('Games').filter(function (game) {
    return String(game.drawId) === String(drawId) && Number(game.sheet) === Number(sheet);
  })[0];
  if (!row) throw new Error('That game no longer exists');
  return row;
}

// ----- Admin actions

function cleanText(value, limit) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, limit);
}

function saveDraw(body) {
  var draw = body.draw;
  var minutes = Math.min(Math.max(Number(draw.minutes) || 95, 1), 600);
  var row = draw.id ? findDraw(draw.id) : null;
  var item = row || { id: Utilities.getUuid().slice(0, 8), startedAt: 0, leftMs: minutes * 60000 };
  if (row && !Number(row.startedAt) && Number(row.leftMs) === Number(row.minutes) * 60000) item.leftMs = minutes * 60000;
  item.name = cleanText(draw.name, 60) || 'Draw';
  item.date = cleanText(draw.date, 10);
  item.ends = Math.min(Math.max(Number(draw.ends) || 8, 1), 12);
  item.minutes = minutes;
  item.showTimer = draw.showTimer !== false;
  if (draw.startsAt !== undefined) item.startsAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draw.startsAt) ? draw.startsAt : '';
  // A scheduled draw already belongs to its bonspiel, so only a hand-made draw can be linked to one.
  item.teamsFrom = item.bonspielId ? '' : cleanText(draw.teamsFrom, 8);
  if (item.teamsFrom) findBonspiel(item.teamsFrom);
  if (row) writeRow('Draws', row._row, item); else appendRow('Draws', item);

  var existing = readTab('Games').filter(function (game) { return String(game.drawId) === String(item.id); });
  for (var sheet = 1; sheet <= 4; sheet++) {
    var game = (draw.games || []).filter(function (g) { return Number(g.sheet) === sheet; })[0] || {};
    var current = existing.filter(function (g) { return Number(g.sheet) === sheet; })[0];
    var next = current || { drawId: item.id, sheet: sheet, ends: '[]', final: false };
    // A bonspiel game gets its teams from the schedule, and its standings follow them by id.
    if (!next.gameId) {
      next.team1 = cleanText(game.team1, 40);
      next.team2 = cleanText(game.team2, 40);
      next.logo1 = cleanText(game.logo1, 40);
      next.logo2 = cleanText(game.logo2, 40);
    }
    // Either can be left unchosen until the wheels or the scorer decide.
    next.stone1 = ['red', 'blue'].indexOf(game.stone) >= 0 ? game.stone : '';
    next.hammer = game.hammer === 0 || game.hammer === 1 ? game.hammer : '';
    if (current) writeRow('Games', current._row, next); else appendRow('Games', next);
  }
  // Only the very first draw goes live by itself, so a draw taken off live stays off when one is edited.
  if (!row && readTab('Draws').length === 1) PropertiesService.getScriptProperties().setProperty('LIVE_DRAW', item.id);
  return { id: item.id };
}

function deleteDraw(body) {
  if (findDraw(body.id).bonspielId) throw new Error('This draw belongs to a bonspiel. Change it on the bonspiel page.');
  deleteRows('Games', readTab('Games').filter(function (g) { return String(g.drawId) === String(body.id); }));
  deleteRows('Draws', readTab('Draws').filter(function (d) { return String(d.id) === String(body.id); }));
  if (liveId() === String(body.id)) PropertiesService.getScriptProperties().deleteProperty('LIVE_DRAW');
}

function goLive(body) {
  findDraw(body.id);
  PropertiesService.getScriptProperties().setProperty('LIVE_DRAW', String(body.id));
}

function stopLive() {
  PropertiesService.getScriptProperties().deleteProperty('LIVE_DRAW');
}

// The bonspiel whose public page is on the TV, or '' for the scoreboard.
function tvBonspiel() {
  return PropertiesService.getScriptProperties().getProperty('TV_BONSPIEL') || '';
}

function setTvView(body) {
  var props = PropertiesService.getScriptProperties();
  if (!body.bonspielId) {
    props.deleteProperty('TV_BONSPIEL');
    return;
  }
  props.setProperty('TV_BONSPIEL', String(findBonspiel(body.bonspielId).id));
}

// The wheels on the TV, or null. They can be for any draw, not only the live one, so they carry their own team names.
function tvSpin() {
  var saved = PropertiesService.getScriptProperties().getProperty('TV_SPIN');
  var spin = saved ? JSON.parse(saved) : null;
  return spin && Date.now() - spin.at < SPIN_MAX_MS ? spin : null;
}

function saveSpin(spin) {
  spin.at = Date.now();
  PropertiesService.getScriptProperties().setProperty('TV_SPIN', JSON.stringify(spin));
}

// A game that has started keeps its hammer and stones.
function canSpin(row) {
  return Boolean(row.team1 && row.team2) && !JSON.parse(row.ends || '[]').length && String(row.final) !== 'true';
}

function drawGames(id) {
  return readTab('Games').filter(function (game) { return String(game.drawId) === String(id); })
    .sort(function (a, b) { return Number(a.sheet) - Number(b.sheet); });
}

function openSpin(body) {
  var draw = findDraw(body.id);
  var games = drawGames(draw.id).map(function (row) {
    return { sheet: Number(row.sheet), team1: String(row.team1), team2: String(row.team2), open: canSpin(row) };
  });
  if (!games.some(function (game) { return game.open; })) throw new Error('No sheet has two teams and no scores yet');
  saveSpin({ drawId: String(draw.id), name: String(draw.name), hammer: body.hammer === true, colour: body.colour === true, round: 0, games: games });
}

// The backend decides, so every screen shows the same result and it is recorded before the wheels stop.
// pick is the team the wheel lands on, and colour is the colour that team gets.
function spinWheels() {
  var spin = tvSpin();
  if (!spin) throw new Error('The wheels are no longer on the TV');
  if (!spin.hammer && !spin.colour) throw new Error('Choose hammer, colour or both');
  var rows = drawGames(spin.drawId);
  spin.games.forEach(function (game) {
    var row = rows.filter(function (item) { return Number(item.sheet) === game.sheet; })[0];
    game.open = Boolean(row) && canSpin(row);
    if (!game.open) return;
    game.pick = Math.random() < 0.5 ? 0 : 1;
    game.colour = '';
    if (spin.colour) {
      game.colour = Math.random() < 0.5 ? 'red' : 'blue';
      game.stone = game.pick === 0 ? game.colour : game.colour === 'red' ? 'blue' : 'red';
      row.stone1 = game.stone;
    }
    if (spin.hammer) row.hammer = game.pick;
    writeRow('Games', row._row, row);
  });
  spin.round += 1;
  saveSpin(spin);
}

function closeSpin() {
  PropertiesService.getScriptProperties().deleteProperty('TV_SPIN');
}

function saveLogo(body) {
  var data = String(body.data || '');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('That is not a supported image');
  if (data.length > MAX_LOGO_CHARS) throw new Error('That image is too large');
  var item = { id: Utilities.getUuid().slice(0, 8), name: cleanText(body.name, 40) || 'Logo', data: data };
  appendRow('Logos', item);
  return { id: item.id };
}

function renameLogo(body) {
  var row = readTab('Logos').filter(function (logo) { return String(logo.id) === String(body.id); })[0];
  if (!row) throw new Error('That logo no longer exists');
  var name = cleanText(body.name, 40);
  if (!name) throw new Error('Enter a club name');
  row.name = name;
  writeRow('Logos', row._row, row);
}

function deleteLogo(body) {
  deleteRows('Logos', readTab('Logos').filter(function (logo) { return String(logo.id) === String(body.id); }));
}

// ----- Score entry actions

function timerAction(body) {
  var row = findDraw(body.id);
  var now = Date.now();
  var startedAt = Number(row.startedAt);
  var left = Number(row.leftMs);
  var running = startedAt > 0;
  if (body.op === 'start') {
    if (!running) startedAt = now;
  } else if (body.op === 'pause') {
    if (running) { left -= now - startedAt; startedAt = 0; }
  } else if (body.op === 'adjust') {
    left += Number(body.ms) || 0;
  } else if (body.op === 'reset') {
    left = Number(row.minutes) * 60000;
    startedAt = 0;
  } else {
    throw new Error('Unknown timer action');
  }
  row.startedAt = startedAt;
  row.leftMs = left;
  writeRow('Draws', row._row, row);
}

// An end is {team: 0|1, pts: 1-8} or, for a blank end, {team: null, pts: 0}.
// end: null removes the last end. An index equal to the end count adds the next end.
function setEnd(body) {
  var row = findGame(body.drawId, body.sheet);
  if (isElimination(row) && !hasBothTeams(row)) throw new Error('This game is still waiting for a team');
  if (isElimination(row) && String(row.final) === 'true') throw new Error('Reopen the game before changing its score');
  var ends = JSON.parse(row.ends || '[]');
  var index = Number(body.index);
  if (!(index >= 0) || index > ends.length || index >= 20) throw new Error('That end is out of order. Refresh and try again.');
  if (body.end === null) {
    if (index !== ends.length - 1) throw new Error('Only the last end can be cleared');
    ends.pop();
  } else {
    var team = body.end.team === null ? null : Number(body.end.team);
    var pts = Number(body.end.pts);
    var valid = team === null ? pts === 0 : (team === 0 || team === 1) && pts >= 1 && pts <= 8 && pts % 1 === 0;
    if (!valid) throw new Error('That is not a valid score');
    ends[index] = { team: team, pts: pts };
  }
  row.ends = JSON.stringify(ends);
  writeRow('Games', row._row, row);
}

// body.hammer gives the hammer to team 0 or 1. Without it, the hammer goes to the other team.
function swapHammer(body) {
  var row = findGame(body.drawId, body.sheet);
  row.hammer = body.hammer === 0 || body.hammer === 1 ? body.hammer : Number(row.hammer) === 1 ? 0 : 1;
  writeRow('Games', row._row, row);
}

function setFinal(body) {
  var row = findGame(body.drawId, body.sheet);
  var final = body.final === true;
  var wasFinal = String(row.final) === 'true';
  if (final && (isElimination(row) || pairingOf(row)) && !hasBothTeams(row)) throw new Error('This game is still waiting for a team');
  if (final && isElimination(row) && winnerSlot(row) === 0) throw new Error('This game can\'t finish tied. Play an extra end.');
  if (!final && wasFinal) clearLaterSlots(row);
  row.final = final;
  writeRow('Games', row._row, row);
  if (final && isElimination(row)) fillLaterSlots(row);
}

// ----- Filling later games. A source is W:<gameId>, L:<gameId>, S:<seed> or P:<round>:<slot>.

function isElimination(row) {
  return row.phase === 'playoff' || row.phase === 'knockout';
}

// The [text, round, slot] of a seeded-round source, or null for any other game.
function pairingOf(row, slot) {
  return /^P:(\d+):(\d+)$/.exec(String(row['source' + (slot || 1)]));
}

function hasBothTeams(row) {
  return Boolean(row.team1Id && row.team2Id);
}

function hasStarted(row) {
  return String(row.final) === 'true' || JSON.parse(row.ends || '[]').length > 0;
}

// 1 or 2 for the team ahead, or 0 for a tie.
function winnerSlot(row) {
  var score = [0, 0];
  JSON.parse(row.ends || '[]').forEach(function (end) {
    if (end.team !== null) score[end.team] += end.pts;
  });
  return score[0] === score[1] ? 0 : score[0] > score[1] ? 1 : 2;
}

// Each later game with a slot waiting on this game, as {game, slot, source}.
function laterSlots(row) {
  var found = [];
  if (!row.gameId) return found;
  readTab('Games').forEach(function (game) {
    [1, 2].forEach(function (slot) {
      var source = String(game['source' + slot]);
      if (source === 'W:' + row.gameId || source === 'L:' + row.gameId) found.push({ game: game, slot: slot, source: source });
    });
  });
  return found;
}

function putTeam(game, slot, team) {
  game['team' + slot] = team ? team.name : '';
  game['logo' + slot] = team ? team.logo : '';
  game['team' + slot + 'Id'] = team ? team.id : '';
}

function fillLaterSlots(row) {
  var winner = winnerSlot(row);
  var teams = readTab('Teams');
  laterSlots(row).forEach(function (later) {
    var slot = later.source.charAt(0) === 'W' ? winner : 3 - winner;
    var id = String(row['team' + slot + 'Id']);
    putTeam(later.game, later.slot, teams.filter(function (team) { return String(team.id) === id; })[0]);
    writeRow('Games', later.game._row, later.game);
  });
}

function clearLaterSlots(row) {
  var slots = laterSlots(row);
  var started = slots.filter(function (later) { return hasStarted(later.game); })[0];
  if (started) throw new Error('A later game has already started. Clear that game before reopening this one.');
  slots.forEach(function (later) {
    putTeam(later.game, later.slot, null);
    writeRow('Games', later.game._row, later.game);
  });
}

// ----- Reading a bonspiel. Its cache entries are named by a version, so one write expires them all.

function toBonspiel(row) {
  return {
    id: String(row.id), name: String(row.name), startDate: String(row.startDate), format: String(row.format),
    status: String(row.status), settings: JSON.parse(row.settings || '{}')
  };
}

function toTeam(row) {
  return {
    id: String(row.id), name: String(row.name), skip: String(row.skip), third: String(row.third), second: String(row.second),
    lead: String(row.lead), club: String(row.club), logo: String(row.logo), seed: Number(row.seed) || 0, pool: String(row.pool),
    standing: JSON.parse(row.standing || '{}')
  };
}

function teamsOf(id) {
  return readTab('Teams').filter(function (team) { return String(team.bonspielId) === String(id); });
}

function drawsOf(id) {
  return readTab('Draws').filter(function (draw) { return String(draw.bonspielId) === String(id); });
}

function gamesOf(draws) {
  var ids = draws.map(function (draw) { return String(draw.id); });
  return readTab('Games').filter(function (game) { return ids.indexOf(String(game.drawId)) >= 0; });
}

function findBonspiel(id) {
  var row = readTab('Bonspiels').filter(function (item) { return String(item.id) === String(id); })[0];
  if (!row) throw new Error('That bonspiel no longer exists');
  return row;
}

function buildBonspiel(id) {
  var draws = drawsOf(id);
  var games = gamesOf(draws);
  return {
    bonspiel: toBonspiel(findBonspiel(id)),
    teams: teamsOf(id).map(toTeam),
    draws: draws.map(function (row) { return toDraw(row, games); }),
    linkedDraws: allDraws().filter(function (draw) { return draw.teamsFrom === String(id); })
  };
}

function cachedBonspiel(id) {
  var cache = CacheService.getScriptCache();
  var key = 'bonspiel-' + (cache.get(CACHE_VERSION) || '0') + '-' + id;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var result = buildBonspiel(id);
  try {
    cache.put(key, JSON.stringify(result), BONSPIEL_CACHE_SECONDS);
  } catch (err) {
    // A cache entry holds 100 KB. A larger event is read from the Sheet each time.
  }
  return result;
}

function expireBonspiels() {
  CacheService.getScriptCache().put(CACHE_VERSION, Date.now() + '-' + Math.random(), 21600);
}

// ----- Bonspiel admin actions

function wholeNumber(value, fallback, low, high) {
  var number = Math.floor(Number(value));
  return Math.min(Math.max(isNaN(number) ? fallback : number, low), high);
}

function cleanSettings(settings) {
  var s = settings || {};
  return {
    gamesPerTeam: wholeNumber(s.gamesPerTeam, 3, 1, MAX_TEAMS - 1),
    poolCount: wholeNumber(s.poolCount, 2, 1, 4),
    playoffSize: wholeNumber(s.playoffSize, 4, 0, MAX_TEAMS),
    pointsWin: wholeNumber(s.pointsWin, 2, 0, 10),
    pointsTie: wholeNumber(s.pointsTie, 1, 0, 10),
    pointsLoss: wholeNumber(s.pointsLoss, 0, 0, 10),
    trackEnds: s.trackEnds === true,
    pointsPerEnd: wholeNumber(s.pointsPerEnd, 1, 0, 10),
    scorePoints: s.scorePoints === true,
    maxEndPoints: wholeNumber(s.maxEndPoints, 0, 0, 8),
    ends: wholeNumber(s.ends, 8, 1, 12),
    minutes: wholeNumber(s.minutes, 95, 1, 600)
  };
}

function saveBonspiel(body) {
  var input = body.bonspiel || {};
  if (FORMATS.indexOf(input.format) < 0) throw new Error('Choose a format');
  var row = input.id ? findBonspiel(input.id) : null;
  var item = row || { id: Utilities.getUuid().slice(0, 8), status: 'setup' };
  item.name = cleanText(input.name, 60) || 'Bonspiel';
  item.startDate = cleanText(input.startDate, 10);
  item.format = input.format;
  item.settings = JSON.stringify(cleanSettings(input.settings));
  if (row) writeRow('Bonspiels', row._row, item); else appendRow('Bonspiels', item);
  return { id: item.id };
}

function removeDraws(draws) {
  var ids = draws.map(function (draw) { return String(draw.id); });
  deleteRows('Games', gamesOf(draws));
  deleteRows('Draws', draws);
  if (ids.indexOf(liveId()) >= 0) PropertiesService.getScriptProperties().deleteProperty('LIVE_DRAW');
}

function deleteBonspiel(body) {
  var row = findBonspiel(body.id);
  if (tvBonspiel() === String(body.id)) setTvView({});
  removeDraws(drawsOf(body.id));
  deleteRows('Teams', teamsOf(body.id));
  deleteRows('Bonspiels', [findBonspiel(row.id)]);
}

function saveTeam(body) {
  var input = body.team || {};
  findBonspiel(input.bonspielId);
  var teams = teamsOf(input.bonspielId);
  var row = teams.filter(function (team) { return String(team.id) === String(input.id); })[0];
  if (input.id && !row) throw new Error('That team no longer exists');
  if (!row && teams.length >= MAX_TEAMS) throw new Error('A bonspiel can have up to ' + MAX_TEAMS + ' teams');
  var item = row || { id: Utilities.getUuid().slice(0, 8), bonspielId: input.bonspielId };
  item.skip = cleanText(input.skip, 40);
  item.name = cleanText(input.name, 40) || item.skip || 'Team';
  item.third = cleanText(input.third, 40);
  item.second = cleanText(input.second, 40);
  item.lead = cleanText(input.lead, 40);
  item.club = cleanText(input.club, 60);
  item.logo = cleanText(input.logo, 40);
  item.seed = input.seed ? wholeNumber(input.seed, 0, 0, MAX_TEAMS) : '';
  item.pool = cleanText(input.pool, 2);
  if (row) writeRow('Teams', row._row, item); else appendRow('Teams', item);
  // A renamed team shows its new name on games already scheduled.
  gamesOf(drawsOf(input.bonspielId)).forEach(function (game) {
    var slot = String(game.team1Id) === String(item.id) ? 1 : String(game.team2Id) === String(item.id) ? 2 : 0;
    if (!slot) return;
    putTeam(game, slot, item);
    writeRow('Games', game._row, game);
  });
  return { id: item.id };
}

function deleteTeam(body) {
  var row = readTab('Teams').filter(function (team) { return String(team.id) === String(body.id); })[0];
  if (!row) throw new Error('That team no longer exists');
  var used = gamesOf(drawsOf(row.bonspielId)).some(function (game) {
    return String(game.team1Id) === String(body.id) || String(game.team2Id) === String(body.id);
  });
  if (used) throw new Error('That team is on the schedule. Generate a new schedule first.');
  deleteRows('Teams', [row]);
}

function saveSeeding(body) {
  var teams = teamsOf(body.id);
  (body.teams || []).forEach(function (input) {
    var row = teams.filter(function (team) { return String(team.id) === String(input.id); })[0];
    if (!row) throw new Error('That team no longer exists');
    row.seed = input.seed ? wholeNumber(input.seed, 0, 0, MAX_TEAMS) : '';
    row.pool = cleanText(input.pool, 2);
    writeRow('Teams', row._row, row);
  });
}

// body.teams: [{id, standing: {points: 7, ...}}]. A blank number goes back to the one worked out from the games.
function saveStandings(body) {
  findBonspiel(body.id);
  var teams = teamsOf(body.id);
  (body.teams || []).forEach(function (input) {
    var row = teams.filter(function (team) { return String(team.id) === String(input.id); })[0];
    if (!row) throw new Error('That team no longer exists');
    var standing = {};
    STANDING_FIELDS.forEach(function (field) {
      var value = (input.standing || {})[field];
      if (value === '' || value === null || value === undefined || isNaN(Number(value))) return;
      standing[field] = wholeNumber(value, 0, -999, 999);
    });
    row.standing = Object.keys(standing).length ? JSON.stringify(standing) : '';
    writeRow('Teams', row._row, row);
  });
}

// Puts the bonspiel back as if nothing had been played: its draws and the hand-made draws linked to it lose their
// scores and timers, games filled from results or seeds wait for their teams again, and typed standings go.
function resetResults(body) {
  var row = findBonspiel(body.id);
  var id = String(body.id);
  var draws = readTab('Draws').filter(function (draw) { return String(draw.bonspielId) === id || String(draw.teamsFrom) === id; });
  draws.forEach(function (draw) {
    draw.startedAt = 0;
    draw.leftMs = Number(draw.minutes) * 60000;
    writeRow('Draws', draw._row, draw);
  });
  gamesOf(draws).forEach(function (game) {
    game.ends = '[]';
    game.final = false;
    [1, 2].forEach(function (slot) {
      if (String(game['source' + slot])) putTeam(game, slot, null);
    });
    writeRow('Games', game._row, game);
  });
  teamsOf(id).forEach(function (team) {
    team.standing = '';
    writeRow('Teams', team._row, team);
  });
  row.status = drawsOf(id).length ? 'scheduled' : 'setup';
  writeRow('Bonspiels', row._row, row);
}

// body.draws: [{name, startsAt, games: [{sheet, id, team1Id, team2Id, source1, source2, phase, bracket, hammer}]}]
function saveSchedule(body) {
  var row = findBonspiel(body.id);
  var settings = cleanSettings(JSON.parse(row.settings || '{}'));
  var teams = {};
  teamsOf(body.id).forEach(function (team) { teams[String(team.id)] = team; });
  var inputs = body.draws || [];
  if (!inputs.length) throw new Error('The schedule has no draws');
  var old = drawsOf(body.id);
  if (gamesOf(old).some(hasStarted)) throw new Error('Scores have been entered, so this schedule can\'t be replaced');

  // Game ids are only unique within a schedule, so the bonspiel id makes them unique in the tab.
  var qualify = function (id) { return id ? body.id + '.' + cleanText(id, 20) : ''; };
  var qualifySource = function (source) {
    var text = cleanText(source, 24);
    if (!text) return '';
    if (!/^(W|L|S|P):.+$/.test(text)) throw new Error('A game has a bad source');
    return /^[SP]/.test(text) ? text : text.slice(0, 2) + qualify(text.slice(2));
  };

  var drawRows = [];
  var gameRows = [];
  inputs.forEach(function (input, index) {
    var drawId = Utilities.getUuid().slice(0, 8);
    var startsAt = cleanText(input.startsAt, 16);
    var draw = {
      id: drawId, name: cleanText(input.name, 60) || 'Draw ' + (index + 1), date: startsAt.slice(0, 10), ends: settings.ends,
      minutes: settings.minutes, startedAt: 0, leftMs: settings.minutes * 60000, showTimer: true,
      bonspielId: body.id, startsAt: startsAt
    };
    drawRows.push(draw);
    var seen = {};
    for (var sheet = 1; sheet <= SHEETS; sheet++) {
      var game = (input.games || []).filter(function (g) { return Number(g.sheet) === sheet; })[0];
      var next = { drawId: drawId, sheet: sheet, stone1: 'red', hammer: 0, ends: '[]', final: false };
      if (game) {
        [1, 2].forEach(function (slot) {
          var id = String(game['team' + slot + 'Id'] || '');
          if (id && !teams[id]) throw new Error('A game has a team that isn\'t in this bonspiel');
          if (id && seen[id]) throw new Error('A team is on two sheets in ' + draw.name);
          if (id) seen[id] = true;
          putTeam(next, slot, teams[id]);
          next['source' + slot] = qualifySource(game['source' + slot]);
        });
        next.gameId = qualify(game.id);
        next.hammer = Number(game.hammer) === 1 ? 1 : 0;
        next.phase = cleanText(game.phase, 10);
        next.bracket = cleanText(game.bracket, 10);
      }
      gameRows.push(next);
    }
  });
  removeDraws(old);
  appendRows('Draws', drawRows);
  appendRows('Games', gameRows);
  row = findBonspiel(body.id);
  row.status = 'scheduled';
  writeRow('Bonspiels', row._row, row);
}

function deleteSchedule(body) {
  findBonspiel(body.id);
  var draws = drawsOf(body.id);
  if (!draws.length) throw new Error('There is no schedule to delete');
  if (gamesOf(draws).some(hasStarted)) throw new Error('Scores have been entered, so this schedule can\'t be deleted');
  removeDraws(draws);
  var row = findBonspiel(body.id);
  row.status = 'setup';
  writeRow('Bonspiels', row._row, row);
}

// body.seeds: team ids, best seed first. Fills every game slot with a source of S:<seed>.
function seedPlayoffs(body) {
  var row = findBonspiel(body.id);
  var teams = teamsOf(body.id);
  var games = gamesOf(drawsOf(body.id));
  var seeds = body.seeds || [];
  var seeded = games.filter(function (game) { return /^S:/.test(game.source1) || /^S:/.test(game.source2); });
  if (!seeded.length) throw new Error('This bonspiel has no playoff to seed');
  if (games.some(function (game) { return game.phase === 'pool' && String(game.final) !== 'true'; })) throw new Error('Finish every pool game first');
  if (games.some(function (game) { return game.phase === 'playoff' && hasStarted(game); })) throw new Error('The playoffs have already started');
  var picked = seeds.map(function (id) {
    var team = teams.filter(function (item) { return String(item.id) === String(id); })[0];
    if (!team) throw new Error('A seed isn\'t in this bonspiel');
    return team;
  });
  if (picked.some(function (team, i) { return picked.indexOf(team) !== i; })) throw new Error('A team is seeded twice');
  seeded.forEach(function (game) {
    [1, 2].forEach(function (slot) {
      var match = /^S:(\d+)$/.exec(String(game['source' + slot]));
      if (!match) return;
      var team = picked[Number(match[1]) - 1];
      if (!team) throw new Error('Choose a team for seed ' + match[1]);
      putTeam(game, slot, team);
    });
    writeRow('Games', game._row, game);
  });
  row.status = 'playoffs';
  writeRow('Bonspiels', row._row, row);
}

// body.teams: team ids for slots 1, 2, 3 and so on. Fills every game slot with a source of P:<round>:<slot>.
function seedRound(body) {
  findBonspiel(body.id);
  var round = Number(body.round);
  var teams = teamsOf(body.id);
  var games = gamesOf(drawsOf(body.id));
  var roundOf = function (game) { return pairingOf(game) ? Number(pairingOf(game)[1]) : 1; };
  var slots = games.filter(function (game) { return pairingOf(game) && roundOf(game) === round; });
  if (!slots.length) throw new Error('This bonspiel has no round to seed');
  if (games.some(function (game) { return game.phase === 'pool' && roundOf(game) < round && String(game.final) !== 'true'; })) throw new Error('Finish the earlier rounds first');
  if (slots.some(hasStarted)) throw new Error('This round has already started');
  var picked = (body.teams || []).map(function (id) {
    var team = teams.filter(function (item) { return String(item.id) === String(id); })[0];
    if (!team) throw new Error('A team isn\'t in this bonspiel');
    return team;
  });
  if (picked.some(function (team, i) { return picked.indexOf(team) !== i; })) throw new Error('A team is in two games');
  slots.forEach(function (game) {
    [1, 2].forEach(function (slot) {
      var team = picked[Number(pairingOf(game, slot)[2]) - 1];
      if (!team) throw new Error('Choose a team for every game');
      putTeam(game, slot, team);
    });
    writeRow('Games', game._row, game);
  });
}
