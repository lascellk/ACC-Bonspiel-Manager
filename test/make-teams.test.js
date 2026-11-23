import test from 'node:test';
import assert from 'node:assert/strict';
import { cheapestAssignment, makeTeams, teamNames } from '../docs/js/bonspiel.js';

// A repeatable stand-in for Math.random.
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const player = (name, positions = [], extra = {}) => ({ name, positions, status: 'Paid', drawTime: '', ...extra });
const where = (result) => Object.fromEntries(result.teams.flatMap((team) => Object.entries(team).map(([field, p]) => [p.name, field])));

test('the cheapest assignment is found', () => {
  assert.deepEqual(cheapestAssignment([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);
  assert.deepEqual(cheapestAssignment([[0]]), [0]);
});

test('every player gets a position they ticked when the numbers allow', () => {
  const players = ['skip', 'vice', 'second', 'lead'].flatMap((position) => [player(`${position}1`, [position]), player(`${position}2`, [position])]);
  for (const seed of [1, 2, 3, 4, 5]) {
    const result = makeTeams(players, 2, seeded(seed));
    assert.equal(result.teams.length, 2);
    assert.deepEqual(result.unplaced, []);
    const fields = where(result);
    for (const p of players) assert.equal(fields[p.name], { skip: 'skip', vice: 'third', second: 'second', lead: 'lead' }[p.positions[0]]);
  }
});

test('players with no preference fill the gaps, and two-choice players take either', () => {
  const players = [player('A', ['skip']), player('B', ['skip']), player('C', ['skip', 'lead']), player('D', ['vice']),
    player('E'), player('F'), player('G'), player('H')];
  const fields = where(makeTeams(players, 2, seeded(7)));
  assert.equal(fields.A, 'skip');
  assert.equal(fields.B, 'skip');
  assert.equal(fields.C, 'lead');
  assert.equal(fields.D, 'third');
});

test('extra players sit out, unpaid ones before paid ones', () => {
  const players = [player('A', ['skip']), player('B', ['vice']), player('C', ['second']), player('D', ['lead']),
    player('E', ['skip'], { status: 'Pending' }), player('F', ['lead'])];
  const result = makeTeams(players, 5, seeded(3));
  assert.equal(result.teams.length, 1);
  assert.equal(result.unplaced.length, 2);
  assert.ok(result.unplaced.some((p) => p.name === 'E'));
});

test('players who want the same draw time end up together', () => {
  const players = ['skip', 'vice', 'second', 'lead'].flatMap((position) => [
    player(`early-${position}`, [position], { drawTime: 'Early Draw' }), player(`late-${position}`, [position], { drawTime: 'Late Draw' })]);
  for (const seed of [1, 2, 3]) {
    const { teams } = makeTeams(players, 2, seeded(seed));
    for (const team of teams) assert.equal(new Set(['skip', 'third', 'second', 'lead'].map((field) => team[field].drawTime)).size, 1);
  }
});

test('teams are named after their skips', () => {
  const names = teamNames([{ skip: player('Ann Archer') }, { skip: player('Bob Baker') }, { skip: player('Cy Baker') }]);
  assert.deepEqual(names, ['Team Archer', 'Team Bob Baker', 'Team Cy Baker']);
});

test('a team that registered together stays together, in the positions its players ticked', () => {
  const group = ['skip', 'vice', 'second', 'lead'].map((position, i) => player(`G${i}`, [position], { group: 'Gord A' }));
  const solo = ['skip', 'vice', 'second', 'lead'].map((position, i) => player(`S${i}`, [position]));
  for (const seed of [1, 2, 3, 4]) {
    const { teams, unplaced } = makeTeams([...solo, ...group], 2, seeded(seed));
    assert.deepEqual(unplaced, []);
    const registered = teams.find((team) => team.group === 'Gord A');
    assert.deepEqual([registered.skip.name, registered.third.name, registered.second.name, registered.lead.name], ['G0', 'G1', 'G2', 'G3']);
    const other = teams.find((team) => team !== registered);
    assert.equal(other.group, '');
    assert.deepEqual([other.skip.name, other.third.name, other.second.name, other.lead.name], ['S0', 'S1', 'S2', 'S3']);
  }
});

test('two or three who registered together share a team that others fill, and a fifth joins the others', () => {
  const pair = [player('P1', ['skip'], { group: 'Pat' }), player('P2', ['skip'], { group: 'Pat' })];
  const five = ['skip', 'vice', 'second', 'lead', 'lead'].map((position, i) => player(`F${i}`, [position], { group: 'Five' }));
  const solo = [player('S1', ['vice']), player('S2', ['second']), player('S3', ['lead'])];
  for (const seed of [1, 2, 3]) {
    const { teams, unplaced } = makeTeams([...pair, ...five, ...solo], 5, seeded(seed));
    assert.equal(teams.length, 2);
    assert.equal(unplaced.length, 2);
    const withPair = teams.find((team) => Object.values(team).some((p) => p?.name === 'P1'));
    assert.ok(Object.values(withPair).some((p) => p?.name === 'P2'));
    const withFive = teams.filter((team) => Object.values(team).filter((p) => p?.group === 'Five').length === 4);
    assert.equal(withFive.length, 1);
  }
});

test('registered teams never sit out, even unpaid', () => {
  const group = ['skip', 'vice', 'second', 'lead'].map((position, i) => player(`G${i}`, [position], { group: 'G', status: 'Pending' }));
  const solo = ['skip', 'vice', 'second', 'lead', 'lead'].map((position, i) => player(`S${i}`, [position]));
  const { teams, unplaced } = makeTeams([...group, ...solo], 1, seeded(5));
  assert.equal(teams[0].group, 'G');
  assert.equal(unplaced.length, 5);
});
