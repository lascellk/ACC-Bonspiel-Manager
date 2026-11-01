import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignDraws, assignPools, buildGames, doubleKnockout, drawTimes, fixedGames, playoffGames, playoffSeeds, roundRobin,
  scheduleProblems, singleKnockout, standings, swapGames, SHEETS,
} from '../docs/js/bonspiel.js';

const SIZES = [4, 7, 8, 12, 15, 16];
const makeTeams = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, seed: i + 1, pool: '' }));
const entrants = (teams) => teams.map((team) => ({ teamId: team.id }));
const settings = { gamesPerTeam: 4, poolCount: 2, playoffSize: 4, pointsWin: 2, pointsTie: 1, pointsLoss: 0 };

function assertSchedule(games) {
  const draws = assignDraws(games);
  assert.deepEqual(scheduleProblems(draws), []);
  assert.equal(draws.flatMap((draw) => draw.games).length, games.length);
  draws.forEach((draw) => {
    assert.ok(draw.games.length <= SHEETS);
    assert.equal(new Set(draw.games.map((game) => game.sheet)).size, draw.games.length);
    draw.games.forEach((game) => assert.ok(game.sheet >= 1 && game.sheet <= SHEETS));
  });
  return draws;
}

function assertValidSlots(games) {
  const ids = new Set(games.map((game) => game.id));
  assert.equal(ids.size, games.length);
  games.forEach((game) => {
    assert.ok(game.team1Id || game.source1, `${game.id} slot 1 is empty`);
    assert.ok(game.team2Id || game.source2, `${game.id} slot 2 is empty`);
    assert.ok(!game.team1Id || game.team1Id !== game.team2Id);
    [game.source1, game.source2].filter((s) => /^[WL]:/.test(s)).forEach((s) => assert.ok(ids.has(s.slice(2)), `${s} is missing`));
  });
}

const countGames = (games) => {
  const count = {};
  games.forEach((game) => [game.team1Id, game.team2Id].forEach((id) => { if (id) count[id] = (count[id] || 0) + 1; }));
  return count;
};

for (const n of SIZES) {
  test(`round robin at ${n} teams meets every pair once`, () => {
    const games = roundRobin(makeTeams(n));
    assertValidSlots(games);
    assert.equal(games.length, (n * (n - 1)) / 2);
    assert.ok(Object.values(countGames(games)).every((count) => count === n - 1));
    assert.equal(new Set(games.map((g) => [g.team1Id, g.team2Id].sort().join())).size, games.length);
    assertSchedule(games);
  });

  test(`fixed games at ${n} teams give each team its count with no rematch`, () => {
    const perTeam = n < 5 ? 2 : 4;
    const games = fixedGames(makeTeams(n), perTeam);
    assertValidSlots(games);
    const count = countGames(games);
    assert.equal(Object.keys(count).length, n);
    assert.ok(Object.values(count).every((c) => c === perTeam));
    assert.equal(new Set(games.map((g) => [g.team1Id, g.team2Id].sort().join())).size, games.length);
    assertSchedule(games);
  });

  test(`single knockout at ${n} teams gives byes to the top seeds`, () => {
    const games = singleKnockout(entrants(makeTeams(n)));
    assertValidSlots(games);
    assert.equal(games.length, n - 1);
    const size = 2 ** Math.ceil(Math.log2(n));
    const byes = size - n;
    const first = new Set(games.filter((g) => g.bracket.startsWith('R1.')).flatMap((g) => [g.team1Id, g.team2Id]));
    for (let seed = 1; seed <= byes; seed++) assert.ok(!first.has(`t${seed}`), `seed ${seed} should have a bye`);
    assert.equal(first.size, n - byes);
    assertSchedule(games);
  });

  test(`double knockout at ${n} teams needs two losses to go out`, () => {
    const games = doubleKnockout(entrants(makeTeams(n)));
    assertValidSlots(games);
    assert.equal(games.length, 2 * n - 2);
    assert.equal(games.filter((g) => g.bracket === 'F').length, 1);
    const fedByFinal = games.filter((g) => g.source1 || g.source2);
    const usedLoser = new Set(games.flatMap((g) => [g.source1, g.source2]).filter((s) => s.startsWith('L:')));
    const winners = games.filter((g) => g.bracket.startsWith('W'));
    assert.equal(usedLoser.size, winners.length, 'every winners-bracket loser drops down');
    assert.ok(fedByFinal.length > 0);
    assertSchedule(games);
  });

  test(`a played-out double knockout at ${n} teams gives every team two losses but the champion`, () => {
    const games = doubleKnockout(entrants(makeTeams(n)));
    const placed = assertSchedule(games).flatMap((draw) => draw.games);
    const result = new Map();
    const resolve = (id, source) => {
      if (id) return id;
      const before = result.get(source.slice(2));
      return source[0] === 'W' ? before.winner : before.loser;
    };
    const losses = {};
    placed.forEach((game) => {
      const one = resolve(game.team1Id, game.source1);
      const two = resolve(game.team2Id, game.source2);
      assert.notEqual(one, two);
      // The better seed wins, so the bracket is walked the way it usually falls.
      const [winner, loser] = Number(one.slice(1)) < Number(two.slice(1)) ? [one, two] : [two, one];
      result.set(game.id, { winner, loser });
      losses[loser] = (losses[loser] || 0) + 1;
    });
    assert.equal(Object.keys(losses).length, n - 1);
    assert.ok(Object.values(losses).every((count) => count === 2), JSON.stringify(losses));
  });

  test(`pools then playoffs at ${n} teams keeps the playoffs after the pools`, () => {
    const teams = makeTeams(n);
    assignPools(teams, 2).forEach(({ id, pool }) => { teams.find((t) => t.id === id).pool = pool; });
    const games = buildGames({ format: 'pools', settings }, teams);
    assertValidSlots(games);
    const draws = assertSchedule(games);
    const lastPool = Math.max(...draws.flatMap((d, i) => d.games.filter((g) => g.phase === 'pool').map(() => i)));
    const firstPlayoff = Math.min(...draws.flatMap((d, i) => d.games.filter((g) => g.phase === 'playoff').map(() => i)));
    assert.ok(firstPlayoff > lastPool);
  });
}

test('an odd team count with odd games per team is refused', () => {
  assert.throws(() => fixedGames(makeTeams(7), 3), /must be even/);
  assert.throws(() => fixedGames(makeTeams(4), 4), /at most 3/);
});
test('pools are dealt in a snake', () => {
  assert.deepEqual(assignPools(makeTeams(8), 2).map((t) => t.pool).join(''), 'ABBAABBA');
});
test('a 16-team schedule stays compact and spreads the sheets', () => {
  const teams = makeTeams(16);
  const draws = assertSchedule(fixedGames(teams, 4));
  assert.ok(draws.length <= 12, `${draws.length} draws`);
  teams.forEach((team) => {
    const sheets = draws.flatMap((d) => d.games.filter((g) => g.team1Id === team.id || g.team2Id === team.id).map((g) => g.sheet));
    assert.ok(new Set(sheets).size >= 2, `${team.id} only used ${sheets}`);
  });
});
test('playoff slots ask for seeds, with byes for the top seeds', () => {
  const games = playoffGames(6);
  assert.equal(games.length, 5);
  const seeds = games.flatMap((g) => [g.source1, g.source2]).filter((s) => s.startsWith('S:'));
  assert.equal(new Set(seeds).size, 6);
  const firstRound = games.filter((g) => g.bracket.startsWith('R1.')).flatMap((g) => [g.source1, g.source2]);
  assert.ok(!firstRound.includes('S:1') && !firstRound.includes('S:2'));
});
test('a swap that puts a team on two sheets, or a game before its source, is reported', () => {
  const draws = assignDraws(singleKnockout(entrants(makeTeams(4))));
  const last = draws.length - 1;
  const moved = swapGames(draws, { draw: 0, sheet: 1 }, { draw: last, sheet: 1 });
  assert.match(scheduleProblems(moved).join(), /comes later/);
  const game = (id, team1Id, team2Id, sheet) => ({ id, team1Id, team2Id, sheet, source1: '', source2: '', phase: 'pool' });
  const clash = swapGames(
    [{ name: 'Draw 1', games: [game('a', 't1', 't2', 1), game('b', 't3', 't4', 2)] }, { name: 'Draw 2', games: [game('c', 't1', 't3', 1)] }],
    { draw: 0, sheet: 2 }, { draw: 1, sheet: 1 },
  );
  assert.match(scheduleProblems(clash).join(), /t1 is on two sheets in Draw 1/);
});
test('swapping into an empty sheet moves the game', () => {
  const draws = [{ name: 'Draw 1', games: [{ id: 'a', sheet: 1, team1Id: 'x', team2Id: 'y', source1: '', source2: '' }] }, { name: 'Draw 2', games: [] }];
  const moved = swapGames(draws, { draw: 0, sheet: 1 }, { draw: 1, sheet: 3 });
  assert.equal(moved[0].games.length, 0);
  assert.equal(moved[1].games[0].sheet, 3);
});
test('draw times roll to the next morning', () => {
  assert.deepEqual(drawTimes('2026-11-06T09:00', 3, 150, 2), ['2026-11-06T09:00', '2026-11-06T11:30', '2026-11-07T09:00']);
  assert.deepEqual(drawTimes('', 2, 150, 2), ['', '']);
});

const played = (team1Id, team2Id, score1, score2) => ({
  final: true, phase: 'pool', team1Id, team2Id,
  ends: [{ team: 0, pts: score1 }, { team: 1, pts: score2 }].filter((end) => end.pts),
});

test('standings rank on points, then head-to-head', () => {
  const teams = makeTeams(3);
  const games = [played('t1', 't2', 5, 3), played('t2', 't3', 8, 1), played('t3', 't1', 4, 3)];
  // All have 2 points and one head-to-head win each, so point difference decides.
  const rows = standings(teams, games, settings);
  assert.deepEqual(rows.map((row) => row.team.id), ['t2', 't1', 't3']);
  assert.ok(rows.every((row) => !row.unresolved));
  const two = standings(makeTeams(2), [played('t2', 't1', 4, 3)], settings);
  assert.equal(two[0].team.id, 't2');
  assert.equal(two[0].points, 2);
});
test('head-to-head beats a better difference', () => {
  const teams = makeTeams(3);
  const rows = standings(teams, [played('t1', 't2', 3, 2), played('t2', 't3', 8, 1), played('t3', 't1', 1, 0)], { ...settings });
  // t1 2, t2 2, t3 2 and a three-way tie, so difference applies; check the two-way case instead.
  assert.equal(rows.length, 3);
  const pair = standings(makeTeams(4), [played('t1', 't2', 3, 2), played('t2', 't3', 9, 1), played('t1', 't4', 0, 1), played('t3', 't4', 1, 2)], settings);
  const t1 = pair.findIndex((row) => row.team.id === 't1');
  const t2 = pair.findIndex((row) => row.team.id === 't2');
  assert.equal(pair[t1].points, pair[t2].points);
  assert.ok(pair[t2].diff > pair[t1].diff);
  assert.ok(t1 < t2, 't1 beat t2, so t1 ranks higher');
});
test('a tie that remains is flagged, and unfinished games do not count', () => {
  const teams = makeTeams(2);
  const rows = standings(teams, [played('t1', 't2', 3, 3), { ...played('t1', 't2', 8, 0), final: false }], settings);
  assert.ok(rows.every((row) => row.unresolved && row.points === 1 && row.played === 1));
});
test('playoff games do not count in the standings', () => {
  const rows = standings(makeTeams(2), [{ ...played('t1', 't2', 3, 1), phase: 'playoff' }], settings);
  assert.equal(rows[0].played, 0);
});
test('playoff seeds take pool winners first', () => {
  const teams = makeTeams(4).map((team, i) => ({ ...team, pool: i < 2 ? 'A' : 'B' }));
  const games = [played('t1', 't2', 5, 1), played('t3', 't4', 9, 1)];
  const { teamIds, tied } = playoffSeeds(teams, games, settings, 2);
  assert.deepEqual(teamIds, ['t3', 't1']);
  assert.equal(tied, false);
});
