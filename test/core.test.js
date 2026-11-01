import test from 'node:test';
import assert from 'node:assert/strict';
import { currentHammer, endColumns, formatClock, hammerAt, stoneOf, timeLeft, timerPhase, totals } from '../docs/js/core.js';

const game = (ends, hammer = 0, extra = {}) => ({ hammer, ends, stone: 'red', final: false, ...extra });
const score = (team, pts) => ({ team, pts });
const blank = { team: null, pts: 0 };

test('hammer team scoring passes the hammer', () => {
  assert.equal(currentHammer(game([score(0, 2)], 0)), 1);
});
test('a steal leaves the hammer with the team that had it', () => {
  assert.equal(currentHammer(game([score(1, 1)], 0)), 0);
});
test('a blank end keeps the hammer', () => {
  assert.equal(currentHammer(game([blank], 1)), 1);
});
test('hammer is worked out end by end, so a corrected end flows through', () => {
  const g = game([score(0, 1), blank, score(0, 1), score(1, 3)], 0);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => hammerAt(g, i)), [0, 1, 1, 1, 0]);
});
test('totals ignore blank ends', () => {
  assert.deepEqual(totals(game([score(0, 2), blank, score(1, 3), score(0, 1)])), [3, 3]);
});
test('team 2 throws the opposite stone', () => {
  assert.equal(stoneOf(game([], 0, { stone: 'blue' }), 1), 'red');
});
test('line score grows for an extra end but not past a finished game', () => {
  const eight = Array(8).fill(blank);
  assert.equal(endColumns({ ends: 8, games: [game(Array(7).fill(blank))] }), 8);
  assert.equal(endColumns({ ends: 8, games: [game(eight)] }), 9);
  assert.equal(endColumns({ ends: 8, games: [game(eight, 0, { final: true })] }), 8);
});
test('timer counts from the stored start time', () => {
  const draw = { startedAt: 1000, leftMs: 60000, minutes: 95 };
  assert.equal(timeLeft(draw, 11000), 50000);
  assert.equal(timerPhase(draw, 11000), 'running');
  assert.equal(timerPhase(draw, 61000), 'expired');
});
test('timer phases when stopped', () => {
  assert.equal(timerPhase({ startedAt: 0, leftMs: 5700000, minutes: 95 }, 0), 'ready');
  assert.equal(timerPhase({ startedAt: 0, leftMs: 5000000, minutes: 95 }, 0), 'paused');
});
test('clock shows minutes past the hour and never goes negative', () => {
  assert.equal(formatClock(95 * 60000), '95:00');
  assert.equal(formatClock(59001), '1:00');
  assert.equal(formatClock(-5), '0:00');
});
