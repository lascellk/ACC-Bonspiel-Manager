import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend } from '../dev/gas-fake.js';

const games = [1, 2, 3, 4].map((sheet) => ({
  sheet, team1: `A${sheet}`, team2: `B${sheet}`, logo1: '', logo2: '', stone: 'red', hammer: 0,
}));
const admin = (api, body) => api.post({ pin: '1234', ...body });
const scorer = (api, body) => api.post({ pin: '0000', ...body });

function withDraw() {
  const api = loadBackend();
  const { id } = admin(api, { action: 'saveDraw', draw: { name: 'Draw 1', minutes: 95, ends: 8, games } });
  return { api, id };
}

test('the first saved draw goes live with four games and a full timer', () => {
  const { api, id } = withDraw();
  const { draw } = api.get();
  assert.equal(draw.id, id);
  assert.equal(draw.games.length, 4);
  assert.equal(draw.leftMs, 95 * 60000);
});
test('the timer shows unless the draw hides it, and a timer action keeps the choice', () => {
  const { api, id } = withDraw();
  assert.equal(api.get().draw.showTimer, true);
  admin(api, { action: 'saveDraw', draw: { id, minutes: 95, ends: 8, showTimer: false, games } });
  assert.equal(api.get().draw.showTimer, false);
  scorer(api, { action: 'timer', id, op: 'start' });
  assert.equal(api.get().draw.showTimer, false);
});
test('the score PIN cannot change setup and a wrong PIN changes nothing', () => {
  const { api, id } = withDraw();
  assert.equal(scorer(api, { action: 'deleteDraw', id }).ok, false);
  assert.equal(api.post({ pin: '9', action: 'timer', id, op: 'start' }).ok, false);
  assert.equal(api.post({ action: 'timer', id, op: 'start' }).ok, false);
  assert.equal(api.get().draw.startedAt, 0);
});
test('an unset PIN never matches a blank one', () => {
  const api = loadBackend({});
  assert.equal(api.post({ pin: '', action: 'login' }).ok, false);
  assert.equal(api.post({ pin: 'null', action: 'login' }).ok, false);
});
test('repeated wrong PINs lock out even the right one', () => {
  const { api } = withDraw();
  for (let i = 0; i < 10; i++) api.post({ pin: 'x', action: 'login' });
  assert.match(api.post({ pin: '1234', action: 'login' }).error, /Too many/);
});
test('login reports which role the PIN holds', () => {
  const { api } = withDraw();
  assert.equal(admin(api, { action: 'login' }).role, 'admin');
  assert.equal(scorer(api, { action: 'login' }).role, 'score');
});
test('ends append, edit and clear', () => {
  const { api, id } = withDraw();
  const set = (index, end) => scorer(api, { action: 'setEnd', drawId: id, sheet: 2, index, end });
  set(0, { team: 0, pts: 3 });
  set(1, { team: null, pts: 0 });
  assert.deepEqual(api.get().draw.games[1].ends, [{ team: 0, pts: 3 }, { team: null, pts: 0 }]);
  set(0, { team: 1, pts: 1 });
  assert.deepEqual(api.get().draw.games[1].ends[0], { team: 1, pts: 1 });
  assert.equal(set(0, null).ok, false);
  assert.equal(set(1, null).ok, true);
  assert.equal(api.get().draw.games[1].ends.length, 1);
  assert.equal(api.get().draw.games[0].ends.length, 0);
});
test('bad ends are refused', () => {
  const { api, id } = withDraw();
  const set = (index, end) => scorer(api, { action: 'setEnd', drawId: id, sheet: 1, index, end });
  assert.equal(set(3, { team: 0, pts: 1 }).ok, false);
  assert.equal(set(0, { team: 0, pts: 9 }).ok, false);
  assert.equal(set(0, { team: 0, pts: 0 }).ok, false);
  assert.equal(set(0, { team: 2, pts: 1 }).ok, false);
});
test('editing a draw keeps its scores', () => {
  const { api, id } = withDraw();
  scorer(api, { action: 'setEnd', drawId: id, sheet: 1, index: 0, end: { team: 0, pts: 2 } });
  const changed = games.map((g) => ({ ...g, team1: `New${g.sheet}` }));
  admin(api, { action: 'saveDraw', draw: { id, name: 'Draw 1', minutes: 95, ends: 8, games: changed } });
  const { draw } = api.get();
  assert.equal(draw.games[0].team1, 'New1');
  assert.equal(draw.games[0].ends.length, 1);
});
test('changing minutes resets an unstarted timer but not a running one', () => {
  const { api, id } = withDraw();
  admin(api, { action: 'saveDraw', draw: { id, minutes: 90, ends: 8, games } });
  assert.equal(api.get().draw.leftMs, 90 * 60000);
  scorer(api, { action: 'timer', id, op: 'start' });
  admin(api, { action: 'saveDraw', draw: { id, minutes: 60, ends: 8, games } });
  assert.equal(api.get().draw.leftMs, 90 * 60000);
});
test('timer start, pause, adjust and reset', () => {
  const { api, id } = withDraw();
  const timer = (op, ms) => scorer(api, { action: 'timer', id, op, ms });
  timer('start');
  const started = api.get().draw.startedAt;
  assert.ok(started > 0);
  timer('start');
  assert.equal(api.get().draw.startedAt, started);
  timer('pause');
  assert.equal(api.get().draw.startedAt, 0);
  timer('adjust', 60000);
  assert.ok(api.get().draw.leftMs > 95 * 60000);
  timer('reset');
  assert.equal(api.get().draw.leftMs, 95 * 60000);
});
test('deleting the live draw leaves nothing live', () => {
  const { api, id } = withDraw();
  admin(api, { action: 'deleteDraw', id });
  assert.equal(api.get().draw, null);
  assert.equal(api.tabs.Games.rows.length, 1);
});
test('swap hammer and finish a game', () => {
  const { api, id } = withDraw();
  scorer(api, { action: 'swapHammer', drawId: id, sheet: 3 });
  scorer(api, { action: 'setFinal', drawId: id, sheet: 3, final: true });
  const game = api.get().draw.games[2];
  assert.equal(game.hammer, 1);
  assert.equal(game.final, true);
});
test('logos must be small images', () => {
  const { api } = withDraw();
  const good = 'data:image/png;base64,AAAA';
  const saved = admin(api, { action: 'saveLogo', name: 'x', data: good });
  assert.equal(saved.ok, true);
  assert.equal(admin(api, { action: 'renameLogo', id: saved.id, name: '  Almonte CC  ' }).ok, true);
  assert.deepEqual(api.get({ action: 'logos' }).logos.map((logo) => [logo.name, logo.data]), [['Almonte CC', good]]);
  assert.match(admin(api, { action: 'renameLogo', id: saved.id, name: ' ' }).error, /club name/);
  assert.match(admin(api, { action: 'renameLogo', id: 'nope', name: 'x' }).error, /no longer exists/);
  assert.equal(admin(api, { action: 'saveLogo', name: 'x', data: 'javascript:alert(1)' }).ok, false);
  assert.equal(admin(api, { action: 'saveLogo', name: 'x', data: good + 'A'.repeat(50000) }).ok, false);
  assert.equal(api.get({ action: 'logos' }).logos.length, 1);
});
test('stones and hammer can be left unchosen, then set by the scorer', () => {
  const api = loadBackend();
  const blank = games.map((game) => ({ ...game, stone: '', hammer: null }));
  const { id } = admin(api, { action: 'saveDraw', draw: { name: 'Draw 1', minutes: 95, ends: 8, games: blank } });
  assert.deepEqual(api.get().draw.games.map((game) => [game.stone, game.hammer]), [['', null], ['', null], ['', null], ['', null]]);
  scorer(api, { action: 'swapHammer', drawId: id, sheet: 1, hammer: 1 });
  scorer(api, { action: 'swapHammer', drawId: id, sheet: 2, hammer: 0 });
  assert.deepEqual(api.get().draw.games.slice(0, 3).map((game) => game.hammer), [1, 0, null]);
  admin(api, { action: 'saveDraw', draw: { id, name: 'Draw 1', minutes: 95, ends: 8, games: blank.map((game) => (game.sheet === 3 ? { ...game, stone: 'blue', hammer: 0 } : game)) } });
  assert.deepEqual([api.get().draw.games[2].stone, api.get().draw.games[2].hammer], ['blue', 0]);
});

test('finish draw finishes the games with ends, leaves unplayed sheets open and resets the timer', () => {
  const { api, id } = withDraw();
  scorer(api, { action: 'timer', id, op: 'start' });
  [1, 2, 3].forEach((sheet) => scorer(api, { action: 'setEnd', drawId: id, sheet, index: 0, end: { team: 0, pts: sheet } }));
  scorer(api, { action: 'setFinal', drawId: id, sheet: 3, final: true });
  const result = scorer(api, { action: 'finishDraw', id });
  assert.deepEqual(result.skipped, [{ sheet: 4, reason: 'no ends scored' }]);
  const { draw } = api.get();
  assert.deepEqual(draw.games.map((game) => game.final), [true, true, true, false]);
  assert.equal(draw.startedAt, 0);
  assert.equal(draw.leftMs, 95 * 60000);
});

test('an ad-hoc draw keeps its own points, a linked draw does not, and its results can go on the TV', () => {
  const { api, id } = withDraw();
  const scoring = { pointsWin: 10, pointsTie: 5, pointsLoss: 0, trackEnds: true, pointsPerEnd: 2, scorePoints: false, maxEndPoints: 0 };
  admin(api, { action: 'saveDraw', draw: { id, name: 'Draw 1', minutes: 95, games, scoring } });
  assert.deepEqual(api.get().draw.scoring, scoring);
  admin(api, { action: 'setTvView', drawId: id });
  assert.equal(api.get().tv, `draw:${id}`);
  admin(api, { action: 'deleteDraw', id });
  assert.equal(api.get().tv, '');
  const bonspiel = admin(api, { action: 'saveBonspiel', bonspiel: { name: 'Fall', format: 'fixed', settings: {} } }).id;
  const linked = admin(api, { action: 'saveDraw', draw: { name: 'Linked', teamsFrom: bonspiel, games, scoring } }).id;
  admin(api, { action: 'goLive', id: linked });
  assert.equal(api.get().draw.scoring, null);
});

test('finish draw also finishes unplayed games when the scorer agrees', () => {
  const { api, id } = withDraw();
  scorer(api, { action: 'setEnd', drawId: id, sheet: 1, index: 0, end: { team: 0, pts: 1 } });
  const result = scorer(api, { action: 'finishDraw', id, unplayed: true });
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(api.get().draw.games.map((game) => game.final), [true, true, true, true]);
});

test('reset draw results clears the scores of an ad-hoc draw only', () => {
  const { api, id } = withDraw();
  scorer(api, { action: 'timer', id, op: 'start' });
  scorer(api, { action: 'setEnd', drawId: id, sheet: 1, index: 0, end: { team: 0, pts: 2 } });
  scorer(api, { action: 'finishDraw', id, unplayed: true });
  assert.equal(scorer(api, { action: 'resetDrawResults', id }).ok, false);
  admin(api, { action: 'resetDrawResults', id });
  const { draw } = api.get();
  assert.deepEqual(draw.games.map((game) => [game.ends.length, game.final]), [[0, false], [0, false], [0, false], [0, false]]);
  assert.equal(draw.leftMs, 95 * 60000);
  const bonspiel = admin(api, { action: 'saveBonspiel', bonspiel: { name: 'Fall', format: 'fixed', settings: {} } }).id;
  const linked = admin(api, { action: 'saveDraw', draw: { name: 'Linked', teamsFrom: bonspiel, games } }).id;
  assert.match(admin(api, { action: 'resetDrawResults', id: linked }).error, /bonspiel/);
});

test('an archived logo is kept, still used, and can be unarchived', () => {
  const { api } = withDraw();
  const { id } = admin(api, { action: 'saveLogo', name: 'Old club', data: 'data:image/png;base64,AAAA' });
  assert.equal(api.get({ action: 'logos' }).logos[0].archived, false);
  assert.equal(scorer(api, { action: 'archiveLogo', id, archived: true }).ok, false);
  assert.match(admin(api, { action: 'archiveLogo', id: 'nope', archived: true }).error, /no longer exists/);
  assert.equal(admin(api, { action: 'archiveLogo', id, archived: true }).ok, true);
  assert.deepEqual(api.get({ action: 'logos' }).logos.map((logo) => [logo.id, logo.archived]), [[id, true]]);
  admin(api, { action: 'renameLogo', id, name: 'Older club' });
  assert.equal(api.get({ action: 'logos' }).logos[0].archived, true);
  admin(api, { action: 'archiveLogo', id, archived: false });
  assert.equal(api.get({ action: 'logos' }).logos[0].archived, false);
});
