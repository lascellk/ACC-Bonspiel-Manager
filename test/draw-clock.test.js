import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend } from '../dev/gas-fake.js';

const admin = (api, body) => api.post({ pin: '1234', ...body });
const scorer = (api, body) => api.post({ pin: '0000', ...body });
const clockProps = { ADMIN_PIN: '1234', SCORE_PIN: '0000', DRAW_CLOCK_URL: 'https://clock.example/exec', DRAW_CLOCK_KEY: 'k1' };
const settings = { ends: 8, minutes: 95, playoffSize: 4 };
const game = { sheet: 1, team1: 'A', team2: 'B' };

function withLinkedDraw(props = clockProps) {
  const api = loadBackend(props);
  const bonspiel = admin(api, { action: 'saveBonspiel', bonspiel: { name: 'Fall', format: 'single', settings } }).id;
  const id = admin(api, { action: 'saveDraw', draw: { name: 'Draw 3', minutes: 95, teamsFrom: bonspiel, games: [game] } }).id;
  const timer = (op, ms) => scorer(api, { action: 'timer', id, op, ms });
  return { api, id, bonspiel, timer };
}
const last = (api) => api.fetches[api.fetches.length - 1].body;

test('starting a bonspiel draw puts it on the rink clock', () => {
  const { api, id, timer } = withLinkedDraw();
  timer('start');
  assert.equal(api.fetches.length, 1);
  assert.equal(api.fetches[0].url, clockProps.DRAW_CLOCK_URL);
  const { cmd, key, arg } = last(api);
  assert.equal(cmd, 'sync');
  assert.equal(key, 'k1');
  assert.equal(arg.runId, `bsp-${id}`);
  assert.equal(arg.label, 'Draw 3');
  assert.equal(arg.status, 'running');
  assert.equal(arg.takeOver, true);
  assert.equal(arg.endsAt - arg.startedAt, 95 * 60000);
});
test('pause, adjust and reset follow without taking the clock over', () => {
  const { api, timer } = withLinkedDraw();
  timer('start');
  timer('pause');
  assert.equal(last(api).arg.status, 'paused');
  assert.equal(last(api).arg.takeOver, false);
  timer('adjust', 60000);
  assert.equal(last(api).arg.status, 'paused');
  timer('start');
  assert.equal(last(api).arg.status, 'running');
  assert.equal(last(api).arg.takeOver, true);
  timer('reset');
  assert.equal(last(api).arg.status, 'idle');
  assert.equal(last(api).arg.takeOver, false);
});
test('a hand-made draw not linked to a bonspiel leaves the rink clock alone', () => {
  const api = loadBackend(clockProps);
  const id = admin(api, { action: 'saveDraw', draw: { name: 'Practice', games: [game] } }).id;
  scorer(api, { action: 'timer', id, op: 'start' });
  assert.equal(api.fetches.length, 0);
});
test('without the Draw Clock settings nothing is sent', () => {
  const { api, timer } = withLinkedDraw({ ADMIN_PIN: '1234', SCORE_PIN: '0000' });
  timer('start');
  assert.equal(api.fetches.length, 0);
});
test('a failed or refused call never stops the scoreboard timer', () => {
  const { api, id, timer } = withLinkedDraw();
  api.fetchReply = () => { throw new Error('offline'); };
  assert.equal(timer('start').ok, true);
  assert.ok(api.get({ action: 'draws' }).draws.find((draw) => draw.id === id).startedAt > 0);
  api.fetchReply = () => '<html>error</html>';
  assert.equal(timer('pause').ok, true);
});
test('reset all results takes a used draw off the rink clock', () => {
  const { api, bonspiel, timer } = withLinkedDraw();
  admin(api, { action: 'saveDraw', draw: { name: 'Unused', teamsFrom: bonspiel, games: [game] } });
  timer('start');
  api.fetches.length = 0;
  assert.equal(admin(api, { action: 'resetResults', id: bonspiel }).ok, true);
  assert.equal(api.fetches.length, 1);
  assert.equal(last(api).arg.status, 'idle');
});
