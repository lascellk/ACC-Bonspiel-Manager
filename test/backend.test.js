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
