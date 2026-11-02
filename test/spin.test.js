import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend } from '../dev/gas-fake.js';
import { spinResult, wheelSeconds, wheelSlices, wheelStop } from '../docs/js/core.js';

const games = [1, 2, 3, 4].map((sheet) => ({ sheet, team1: `A${sheet}`, team2: `B${sheet}`, stone: 'red', hammer: 0 }));
const admin = (api, body) => api.post({ pin: '1234', ...body });
const scorer = (api, body) => api.post({ pin: '0000', ...body });

function withDraw(list = games) {
  const api = loadBackend();
  const { id } = admin(api, { action: 'saveDraw', draw: { name: 'Draw 1', minutes: 95, ends: 8, games: list } });
  return { api, id };
}

const sliceAt = (slices, angle) => slices[Math.floor(((360 - (angle % 360)) % 360) / (360 / slices.length))];

test('every result has a slice, and the wheel stops on it', () => {
  [[true, ['red', 'blue']], [false, ['']]].forEach(([useColour, colours]) => {
    const slices = wheelSlices(useColour);
    assert.equal(slices.length, 8);
    [0, 1].forEach((pick) => colours.forEach((colour) => [0, 1, 2, 3].forEach((round) => {
      const slice = sliceAt(slices, wheelStop(slices, { sheet: 2, pick, colour }, round));
      assert.deepEqual([slice.team, slice.colour], [pick, colour]);
    })));
  });
});
test('the result reads as what was spun for', () => {
  const game = { team1: 'Ann', team2: 'Bea', pick: 1, colour: 'blue' };
  assert.equal(spinResult({ hammer: true, colour: true }, game), 'Bea has the hammer · Bea is blue');
  assert.equal(spinResult({ hammer: true, colour: false }, game), 'Bea has the hammer');
  assert.equal(spinResult({ hammer: false, colour: true }, game), 'Bea is blue');
  assert.ok(wheelSeconds(4) > wheelSeconds(1));
});
test('opening the wheels changes the TV but not the draw, and closing puts it back', () => {
  const { api, id } = withDraw();
  assert.equal(api.get().spin, null);
  assert.equal(scorer(api, { action: 'openSpin', id }).ok, false);
  assert.equal(admin(api, { action: 'openSpin', id, hammer: true, colour: false }).ok, true);
  const { spin, draw } = api.get();
  assert.deepEqual([spin.drawId, spin.name, spin.hammer, spin.colour, spin.round], [id, 'Draw 1', true, false, 0]);
  assert.deepEqual(spin.games[0].team1, 'A1');
  assert.equal(draw.games[0].hammer, 0);
  admin(api, { action: 'closeSpin' });
  assert.equal(api.get().spin, null);
});
test('a spin records the hammer and stones in the draw', () => {
  const { api, id } = withDraw();
  admin(api, { action: 'openSpin', id, hammer: true, colour: true });
  const { spin, draw } = admin(api, { action: 'spinWheels' });
  assert.equal(spin.round, 1);
  spin.games.forEach((game, index) => {
    assert.equal(draw.games[index].hammer, game.pick);
    assert.equal(draw.games[index].stone, game.pick === 0 ? game.colour : { red: 'blue', blue: 'red' }[game.colour]);
    assert.equal(draw.games[index].stone, game.stone);
  });
});
test('a spin for one option leaves the other alone', () => {
  const list = games.map((game) => ({ ...game, stone: 'blue', hammer: 1 }));
  for (let tries = 0; tries < 20; tries += 1) {
    const { api, id } = withDraw(list);
    admin(api, { action: 'openSpin', id, hammer: true, colour: false });
    assert.ok(admin(api, { action: 'spinWheels' }).draw.games.every((game) => game.stone === 'blue'));
    admin(api, { action: 'openSpin', id, hammer: false, colour: true });
    const before = api.get().draw.games.map((game) => game.hammer);
    assert.deepEqual(admin(api, { action: 'spinWheels' }).draw.games.map((game) => game.hammer), before);
  }
});
test('both results come up', () => {
  const { api, id } = withDraw();
  admin(api, { action: 'openSpin', id, hammer: true, colour: true });
  const seen = new Set();
  for (let tries = 0; tries < 50; tries += 1) admin(api, { action: 'spinWheels' }).draw.games.forEach((game) => seen.add(`${game.hammer}${game.stone}`));
  assert.equal(seen.size, 4);
});
test('a game with a score or a missing team keeps its hammer and stones', () => {
  const list = [games[0], games[1], { sheet: 3, team1: 'Only', team2: '' }, { sheet: 4 }];
  const { api, id } = withDraw(list);
  scorer(api, { action: 'setEnd', drawId: id, sheet: 2, index: 0, end: { team: 0, pts: 1 } });
  admin(api, { action: 'openSpin', id, hammer: true, colour: true });
  assert.deepEqual(api.get().spin.games.map((game) => game.open), [true, false, false, false]);
  for (let tries = 0; tries < 20; tries += 1) {
    const { draw } = admin(api, { action: 'spinWheels' });
    assert.deepEqual([draw.games[1].hammer, draw.games[1].stone], [0, 'red']);
  }
});
test('a game that starts after the wheels open is left out of the spin', () => {
  const { api, id } = withDraw();
  admin(api, { action: 'openSpin', id, hammer: true, colour: true });
  scorer(api, { action: 'setEnd', drawId: id, sheet: 1, index: 0, end: { team: 0, pts: 1 } });
  const { spin } = admin(api, { action: 'spinWheels' });
  assert.equal(spin.games[0].open, false);
  assert.equal(spin.games[0].pick, undefined);
});
test('the wheels need a game to spin and an option chosen', () => {
  const { api, id } = withDraw([{ sheet: 1 }]);
  assert.match(admin(api, { action: 'openSpin', id, hammer: true }).error, /No sheet/);
  assert.match(admin(api, { action: 'spinWheels' }).error, /no longer on the TV/);
  const other = withDraw();
  admin(other.api, { action: 'openSpin', id: other.id, hammer: false, colour: false });
  assert.match(admin(other.api, { action: 'spinWheels' }).error, /Choose hammer/);
});
test('the wheels work on a draw that is not live', () => {
  const { api } = withDraw();
  const { id } = admin(api, { action: 'saveDraw', draw: { name: 'Draw 2', minutes: 95, ends: 8, games } });
  admin(api, { action: 'openSpin', id, hammer: true, colour: false });
  const { spin, draws } = (admin(api, { action: 'spinWheels' }), { spin: api.get().spin, draws: api.get({ action: 'draws' }).draws });
  const saved = draws.find((draw) => draw.id === id);
  assert.deepEqual(saved.games.map((game) => game.hammer), spin.games.map((game) => game.pick));
  assert.notEqual(api.get().draw.id, id);
});
