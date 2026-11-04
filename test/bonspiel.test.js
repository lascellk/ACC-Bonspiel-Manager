import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignDraws, assignPools, buildGames, doubleKnockout, drawTimes, fixedGames, linkedGames, nextRound, pairRound, playoffGames, playoffSeeds,
  roundRobin, scheduleProblems, singleKnockout, sourceLabel, standings, swapGames, SHEETS,
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

  test(`fixed games at ${n} teams, seeded each round, give each team its count with no rematch`, () => {
    const perTeam = n < 5 ? 2 : 4;
    const teams = makeTeams(n);
    const games = assertSchedule(fixedGames(teams, perTeam)).flatMap((draw) => draw.games).map((game) => ({ ...game, final: false, ends: [] }));
    assertValidSlots(games);
    assert.equal(games.length, (n * perTeam) / 2);
    const play = (round) => games.filter((game) => game.round === round).forEach((game) => {
      // The better seed wins, so the standings separate the teams.
      const better = Number(game.team1Id.slice(1)) < Number(game.team2Id.slice(1)) ? 0 : 1;
      Object.assign(game, { final: true, ends: [{ team: better, pts: 2 }] });
    });
    play(1);
    for (let next = nextRound(games); next; next = nextRound(games)) {
      assert.equal(next.unfinished, 0);
      const { teamIds } = pairRound(teams, games, settings, next.games.length * 2);
      assert.equal(new Set(teamIds).size, next.games.length * 2);
      next.games.forEach((game, i) => {
        game.team1Id = teamIds[i * 2];
        game.team2Id = teamIds[i * 2 + 1];
      });
      play(next.round);
    }
    const count = countGames(games);
    assert.equal(Object.keys(count).length, n);
    assert.ok(Object.values(count).every((c) => c === perTeam), JSON.stringify(count));
    assert.equal(new Set(games.map((g) => [g.team1Id, g.team2Id].sort().join())).size, games.length);
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
test('only the first fixed round has teams, and each round waits for the one before', () => {
  const games = fixedGames(makeTeams(8), 3);
  assert.deepEqual(games.slice(0, 4).map((g) => [g.team1Id, g.team2Id]), [['t1', 't5'], ['t2', 't6'], ['t3', 't7'], ['t4', 't8']]);
  assert.ok(games.slice(4).every((g) => !g.team1Id && !g.team2Id));
  assert.deepEqual(games.slice(4, 6).map((g) => [g.source1, g.source2]), [['P:2:1', 'P:2:2'], ['P:2:3', 'P:2:4']]);
  assert.equal(sourceLabel('P:3:1', games), 'Seeded after round 2');
  assert.deepEqual(assertSchedule(games).map((d) => d.games.length), [4, 4, 4]);
  assert.equal(nextRound(games.map((g) => ({ ...g, final: false }))).unfinished, 4);
});
test('a swap that puts a seeded round before the round it needs is reported', () => {
  const draws = assignDraws(fixedGames(makeTeams(8), 2));
  assert.equal(scheduleProblems(swapGames(draws, { draw: 0, sheet: 1 }, { draw: 1, sheet: 1 })).length > 0, true);
});
test('seeded rounds pair by rank, and skip a team already met', () => {
  const teams = makeTeams(4);
  // Round 1 was t1 v t3 and t2 v t4, won by t1 and t2. They meet next, then t4 and t3 on difference.
  const first = [played('t1', 't3', 5, 1), played('t2', 't4', 4, 1)];
  assert.deepEqual(pairRound(teams, first, settings, 4).teamIds, ['t1', 't2', 't4', 't3']);
  // The ranking is t1, t3, t4, t2. Only t1 v t3 is new at the top, and t1 v t2 has been played.
  const rematch = [played('t1', 't4', 5, 4), played('t3', 't2', 3, 2)];
  assert.deepEqual(pairRound(teams, rematch, settings, 4).teamIds.slice(0, 2), ['t1', 't3']);
  // 1st and 2nd have met, so 1st plays 3rd.
  const met = [played('t1', 't2', 5, 1), played('t3', 't4', 2, 1)];
  assert.deepEqual(pairRound(teams, met, settings, 4).teamIds, ['t1', 't3', 't4', 't2']);
  // Only a rematch is left, so it is allowed.
  assert.deepEqual(new Set(pairRound(makeTeams(2), [played('t1', 't2', 5, 1)], settings, 2).teamIds), new Set(['t1', 't2']));
});
test('a team that sat out plays next', () => {
  const games = [played('t1', 't2', 5, 1)];
  assert.ok(pairRound(makeTeams(3), games, settings, 2).teamIds.includes('t3'));
});
test('a round-robin schedule spreads the sheets', () => {
  const teams = makeTeams(16);
  const draws = assertSchedule(roundRobin(teams));
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
test('linked hand-made games count by team name', () => {
  const game = (team1, team2, score1, score2) => ({ ...played('', '', score1, score2), team1, team2 });
  const draws = [{ games: [game(' team 1', 'Team 2', 5, 3), game('Team 2', 'Visitors', 9, 0), { ...game('Team 1', 'Team 2', 0, 4), final: false }] }];
  const { t1, t2 } = rowsById(standings(makeTeams(2), linkedGames(draws, makeTeams(2)), settings));
  assert.deepEqual([t1.played, t1.points, t2.played, t2.points], [1, 2, 1, 0]);
});
test('playoff games do not count in the standings', () => {
  const rows = standings(makeTeams(2), [{ ...played('t1', 't2', 3, 1), phase: 'playoff' }], settings);
  assert.equal(rows[0].played, 0);
});
const endsGame = {
  final: true, phase: 'pool', team1Id: 't1', team2Id: 't2',
  ends: [{ team: 0, pts: 5 }, { team: null, pts: 0 }, { team: 1, pts: 2 }, { team: 1, pts: 1 }, { team: 1, pts: 1 }],
};
const rowsById = (rows) => Object.fromEntries(rows.map((row) => [row.team.id, row]));

test('ends won and capped scores add nothing unless switched on', () => {
  const { t1, t2 } = rowsById(standings(makeTeams(2), [endsGame], { ...settings, maxEndPoints: 2 }));
  assert.deepEqual([t1.points, t2.points], [2, 0]);
  assert.deepEqual([t1.endsWon, t2.endsWon, t1.scored, t2.scored], [1, 3, 2, 4]);
});
test('each end won earns points, and a blank end earns none', () => {
  const { t1, t2 } = rowsById(standings(makeTeams(2), [endsGame], { ...settings, trackEnds: true, pointsPerEnd: 2 }));
  assert.deepEqual([t1.points, t2.points], [2 + 2, 0 + 6]);
});
test('total score earns points, with an end limit that leaves the real score alone', () => {
  const uncapped = rowsById(standings(makeTeams(2), [endsGame], { ...settings, scorePoints: true, maxEndPoints: 0 }));
  assert.deepEqual([uncapped.t1.points, uncapped.t2.points], [2 + 5, 0 + 4]);
  const capped = rowsById(standings(makeTeams(2), [endsGame], { ...settings, scorePoints: true, maxEndPoints: 2 }));
  assert.deepEqual([capped.t1.points, capped.t2.points], [2 + 2, 0 + 4]);
  assert.deepEqual([capped.t1.diff, capped.t2.diff], [1, -1]);
});
test('both options add up and can change the order', () => {
  const rows = standings(makeTeams(2), [endsGame], { ...settings, trackEnds: true, pointsPerEnd: 1, scorePoints: true, maxEndPoints: 2 });
  assert.equal(rows[0].team.id, 't2');
  assert.deepEqual(rows.map((row) => row.points), [0 + 3 + 4, 2 + 1 + 2]);
});
test('playoff seeds take pool winners first', () => {
  const teams = makeTeams(4).map((team, i) => ({ ...team, pool: i < 2 ? 'A' : 'B' }));
  const games = [played('t1', 't2', 5, 1), played('t3', 't4', 9, 1)];
  const { teamIds, tied } = playoffSeeds(teams, games, settings, 2);
  assert.deepEqual(teamIds, ['t3', 't1']);
  assert.equal(tied, false);
});
