import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend } from '../dev/gas-fake.js';

const admin = (api, body) => api.post({ pin: '1234', ...body });
const scorer = (api, body) => api.post({ pin: '0000', ...body });
const settings = { ends: 8, minutes: 95, playoffSize: 4 };
const slot = (id, sheet, fields) => ({ id, sheet, phase: 'knockout', team1Id: '', team2Id: '', source1: '', source2: '', bracket: '', ...fields });

function withBonspiel(names = ['A', 'B', 'C', 'D']) {
  const api = loadBackend();
  const { id } = admin(api, { action: 'saveBonspiel', bonspiel: { name: 'Fall', startDate: '2026-11-06', format: 'single', settings } });
  const teams = names.map((name) => admin(api, { action: 'saveTeam', team: { bonspielId: id, name, logo: `logo-${name}` } }).id);
  return { api, id, teams };
}

// A 4-team knockout: two semis in the first draw, then a final and a game for the losers.
function withBracket() {
  const context = withBonspiel();
  const { api, id, teams } = context;
  const saved = admin(api, { action: 'saveSchedule', id, draws: [
    { name: 'Draw 1', startsAt: '2026-11-06T09:00', games: [
      slot('k1', 1, { team1Id: teams[0], team2Id: teams[3], bracket: 'R1.1' }),
      slot('k2', 2, { team1Id: teams[1], team2Id: teams[2], bracket: 'R1.2' }),
    ] },
    { name: 'Draw 2', startsAt: '2026-11-06T12:00', games: [
      slot('k3', 1, { source1: 'W:k1', source2: 'W:k2', bracket: 'R2.1' }),
      slot('k4', 2, { source1: 'L:k1', source2: 'L:k2', bracket: 'L1.1' }),
    ] },
  ] });
  assert.equal(saved.ok, true, saved.error);
  const draws = () => api.get({ action: 'bonspiel', id }).draws;
  const one = draws()[0].id;
  const two = draws()[1].id;
  const score = (drawId, sheet, team, pts = 3) => scorer(api, { action: 'setEnd', drawId, sheet, index: 0, end: { team, pts } });
  const final = (drawId, sheet, value = true) => scorer(api, { action: 'setFinal', drawId, sheet, final: value });
  return { ...context, draws, one, two, score, final };
}

test('a schedule saves four sheets a draw, ready for the live scoreboard', () => {
  const { api, id, draws, one } = withBracket();
  assert.equal(draws().length, 2);
  assert.equal(draws()[0].games.length, 4);
  assert.equal(draws()[0].games[0].team1, 'A');
  assert.equal(draws()[0].games[0].logo1, 'logo-A');
  assert.equal(draws()[0].games[0].gameId, `${id}.k1`);
  assert.equal(draws()[0].games[2].gameId, '');
  assert.equal(draws()[0].date, '2026-11-06');
  admin(api, { action: 'goLive', id: one });
  assert.equal(api.get().draw.bonspielName, 'Fall');
});
test('finishing a game fills the later slots with the winner and loser', () => {
  const { draws, one, score, final } = withBracket();
  score(one, 1, 1);
  assert.equal(final(one, 1).ok, true);
  const [next, losers] = draws()[1].games;
  assert.equal(next.team1, 'D');
  assert.equal(next.logo1, 'logo-D');
  assert.equal(next.team2, '');
  assert.equal(losers.team1, 'A');
});
test('a knockout game cannot finish tied or without both teams', () => {
  const { one, two, score, final } = withBracket();
  assert.match(final(one, 1).error, /tied/);
  assert.match(final(two, 1).error, /waiting/);
  assert.match(score(two, 1, 0).error, /waiting/);
  score(one, 1, 0);
  assert.equal(final(one, 1).ok, true);
});
test('a pool game can finish tied and fills nothing', () => {
  const { api, id, teams } = withBonspiel();
  admin(api, { action: 'saveSchedule', id, draws: [{ games: [slot('p1', 1, { phase: 'pool', team1Id: teams[0], team2Id: teams[1] })] }] });
  const drawId = api.get({ action: 'bonspiel', id }).draws[0].id;
  assert.equal(scorer(api, { action: 'setFinal', drawId, sheet: 1, final: true }).ok, true);
});
test('reopening clears later slots, unless the later game has started', () => {
  const { draws, one, two, score, final } = withBracket();
  score(one, 1, 0);
  score(one, 2, 0);
  final(one, 1);
  final(one, 2);
  assert.equal(draws()[1].games[0].team2, 'B');
  assert.equal(final(one, 2, false).ok, true);
  assert.equal(draws()[1].games[0].team2, '');
  assert.equal(draws()[1].games[0].team2Id, '');
  assert.equal(draws()[1].games[0].team1, 'A');
  final(one, 2);
  score(two, 1, 0);
  assert.match(final(one, 2, false).error, /already started/);
  assert.equal(draws()[0].games[1].final, true);
});
test('a finished knockout game must be reopened before its score changes', () => {
  const { one, score, final } = withBracket();
  score(one, 1, 0);
  final(one, 1);
  assert.match(score(one, 1, 1).error, /Reopen/);
  final(one, 1, false);
  assert.equal(score(one, 1, 1).ok, true);
});
test('a schedule with scores cannot be replaced, and one without can', () => {
  const { api, id, one, score } = withBracket();
  const again = [{ games: [slot('k1', 1, { phase: 'pool' })] }];
  score(one, 1, 0);
  assert.match(admin(api, { action: 'saveSchedule', id, draws: again }).error, /Scores/);
  scorer(api, { action: 'setEnd', drawId: one, sheet: 1, index: 0, end: null });
  assert.equal(admin(api, { action: 'saveSchedule', id, draws: again }).ok, true);
  assert.equal(api.get({ action: 'bonspiel', id }).draws.length, 1);
});
test('a schedule cannot use outside teams or put a team on two sheets', () => {
  const { api, id, teams } = withBonspiel();
  const save = (games) => admin(api, { action: 'saveSchedule', id, draws: [{ games }] });
  assert.match(save([slot('a', 1, { team1Id: 'nobody' })]).error, /isn't in this bonspiel/);
  assert.match(save([slot('a', 1, { team1Id: teams[0] }), slot('b', 2, { team1Id: teams[0] })]).error, /two sheets/);
});
test('replacing a schedule that was live leaves nothing live', () => {
  const { api, id, one } = withBracket();
  admin(api, { action: 'goLive', id: one });
  admin(api, { action: 'saveSchedule', id, draws: [{ games: [] }] });
  assert.equal(api.get().draw, null);
});
test('seeding fills the playoff slots once the pools are done', () => {
  const { api, id, teams } = withBonspiel();
  admin(api, { action: 'saveSchedule', id, draws: [
    { games: [slot('p1', 1, { phase: 'pool', team1Id: teams[0], team2Id: teams[1] })] },
    { games: [slot('x1', 1, { phase: 'playoff', source1: 'S:1', source2: 'S:2', bracket: 'R1.1' })] },
  ] });
  const draws = () => api.get({ action: 'bonspiel', id }).draws;
  const seed = (seeds) => admin(api, { action: 'seedPlayoffs', id, seeds });
  assert.match(seed([teams[0], teams[1]]).error, /Finish every pool game/);
  scorer(api, { action: 'setFinal', drawId: draws()[0].id, sheet: 1, final: true });
  assert.match(seed([teams[0], teams[0]]).error, /twice/);
  assert.match(seed(['nobody', teams[0]]).error, /isn't in/);
  assert.match(seed([teams[0]]).error, /seed 2/);
  assert.equal(seed([teams[1], teams[0]]).ok, true);
  assert.equal(draws()[1].games[0].team1, 'B');
  assert.equal(api.get({ action: 'bonspiel', id }).bonspiel.status, 'playoffs');
  scorer(api, { action: 'setEnd', drawId: draws()[1].id, sheet: 1, index: 0, end: { team: 0, pts: 1 } });
  assert.match(seed([teams[0], teams[1]]).error, /already started/);
});
test('a bonspiel holds up to 16 teams, and scheduled teams stay', () => {
  const { api, id, teams } = withBonspiel(Array.from({ length: 16 }, (_, i) => `T${i}`));
  assert.match(admin(api, { action: 'saveTeam', team: { bonspielId: id, name: 'Extra' } }).error, /16/);
  assert.equal(admin(api, { action: 'deleteTeam', id: teams[15] }).ok, true);
  admin(api, { action: 'saveSchedule', id, draws: [{ games: [slot('a', 1, { team1Id: teams[0], team2Id: teams[1] })] }] });
  assert.match(admin(api, { action: 'deleteTeam', id: teams[0] }).error, /on the schedule/);
});
test('renaming a team updates its scheduled games', () => {
  const { api, id, draws, teams } = withBracket();
  admin(api, { action: 'saveTeam', team: { id: teams[0], bonspielId: id, name: 'New', logo: 'acc' } });
  assert.equal(draws()[0].games[0].team1, 'New');
  assert.equal(draws()[0].games[0].logo1, 'acc');
});
test('the admin draw editor keeps bonspiel teams and cannot delete the draw', () => {
  const { api, draws, one } = withBracket();
  const changed = [1, 2, 3, 4].map((sheet) => ({ sheet, team1: 'Hack', team2: 'Hack', stone: 'blue', hammer: 1 }));
  admin(api, { action: 'saveDraw', draw: { id: one, name: 'Draw 1', ends: 8, minutes: 90, games: changed } });
  assert.equal(draws()[0].games[0].team1, 'A');
  assert.equal(draws()[0].games[0].stone, 'blue');
  assert.equal(draws()[0].games[2].team1, 'Hack');
  assert.match(admin(api, { action: 'deleteDraw', id: one }).error, /belongs to a bonspiel/);
});
test('the public bonspiel read needs no PIN and updates after a write', () => {
  const { api, id, one, score } = withBracket();
  assert.equal(api.get({ action: 'bonspiels' }).bonspiels[0].name, 'Fall');
  assert.equal(api.get({ action: 'bonspiel', id }).teams.length, 4);
  score(one, 1, 0, 5);
  assert.equal(api.get({ action: 'bonspiel', id }).draws[0].games[0].ends[0].pts, 5);
});
test('deleting a bonspiel removes its teams, draws, games and live draw', () => {
  const { api, id, one } = withBracket();
  const games = [1, 2, 3, 4].map((sheet) => ({ sheet, team1: 'X', team2: 'Y' }));
  const drawn = admin(api, { action: 'saveDraw', draw: { name: 'Club night', minutes: 95, ends: 8, games } });
  admin(api, { action: 'goLive', id: one });
  admin(api, { action: 'deleteBonspiel', id });
  assert.equal(api.get().draw, null);
  assert.equal(api.get({ action: 'bonspiels' }).bonspiels.length, 0);
  assert.equal(api.tabs.Teams.rows.length, 1);
  assert.deepEqual(api.get({ action: 'draws' }).draws.map((draw) => draw.id), [drawn.id]);
  assert.equal(api.get({ action: 'bonspiel', id }).ok, false);
});
test('the score PIN cannot change a bonspiel', () => {
  const { api, id } = withBonspiel();
  assert.equal(scorer(api, { action: 'deleteBonspiel', id }).ok, false);
  assert.equal(scorer(api, { action: 'saveTeam', team: { bonspielId: id, name: 'X' } }).ok, false);
});
test('saved settings are forced into range', () => {
  const { api, id } = withBonspiel();
  admin(api, { action: 'saveBonspiel', bonspiel: { id, name: 'x', format: 'pools', settings: { ends: 99, poolCount: -1, minutes: 'a' } } });
  const { settings: saved } = api.get({ action: 'bonspiel', id }).bonspiel;
  assert.equal(saved.ends, 12);
  assert.equal(saved.poolCount, 1);
  assert.equal(saved.minutes, 95);
  assert.equal(admin(api, { action: 'saveBonspiel', bonspiel: { name: 'x', format: 'nope' } }).ok, false);
});
test('a seeded round fills from the organiser once the round before is finished', () => {
  const { api, id, teams } = withBonspiel();
  const pool = (fields) => ({ phase: 'pool', ...fields });
  const saved = admin(api, { action: 'saveSchedule', id, draws: [
    { games: [
      slot('f1', 1, pool({ team1Id: teams[0], team2Id: teams[2] })),
      slot('f2', 2, pool({ team1Id: teams[1], team2Id: teams[3] })),
    ] },
    { games: [
      slot('f3', 1, pool({ source1: 'P:2:1', source2: 'P:2:2' })),
      slot('f4', 2, pool({ source1: 'P:2:3', source2: 'P:2:4' })),
    ] },
  ] });
  assert.equal(saved.ok, true, saved.error);
  const draws = () => api.get({ action: 'bonspiel', id }).draws;
  const [one, two] = draws().map((draw) => draw.id);
  const seed = (order, round = 2) => admin(api, { action: 'seedRound', id, round, teams: order });
  assert.match(scorer(api, { action: 'setFinal', drawId: two, sheet: 1, final: true }).error, /waiting for a team/);
  assert.match(seed(teams).error, /Finish the earlier rounds/);
  scorer(api, { action: 'setFinal', drawId: one, sheet: 1, final: true });
  scorer(api, { action: 'setFinal', drawId: one, sheet: 2, final: true });
  assert.match(seed(teams, 3).error, /no round to seed/);
  assert.match(seed([teams[0], teams[0], teams[1], teams[2]]).error, /two games/);
  assert.match(seed(teams.slice(0, 3)).error, /every game/);
  assert.match(seed(['nobody', ...teams.slice(1)]).error, /isn't in this bonspiel/);
  assert.equal(admin(api, { action: 'seedRound', id, round: 2, teams }).ok, true);
  const [first, second] = draws()[1].games;
  assert.deepEqual([first.team1, first.team2, first.logo1, second.team1, second.team2], ['A', 'B', 'logo-A', 'C', 'D']);
  assert.equal(scorer(api, { action: 'setEnd', drawId: two, sheet: 1, index: 0, end: { team: 0, pts: 1 } }).ok, true);
  assert.match(seed(teams).error, /already started/);
  assert.match(scorer(api, { action: 'seedRound', id, round: 2, teams }).error, /.+/);
});
test('a schedule with no scores can be deleted, and its live draw goes with it', () => {
  const { api, id, one, score } = withBracket();
  admin(api, { action: 'goLive', id: one });
  assert.equal(scorer(api, { action: 'deleteSchedule', id }).ok, false);
  const handMade = admin(api, { action: 'saveDraw', draw: { name: 'One-off' } }).id;
  score(one, 1, 0);
  assert.match(admin(api, { action: 'deleteSchedule', id }).error, /Scores have been entered/);
  assert.equal(api.get({ action: 'bonspiel', id }).draws.length, 2);
  admin(api, { action: 'setEnd', drawId: one, sheet: 1, index: 0, end: null });
  assert.equal(admin(api, { action: 'deleteSchedule', id }).ok, true);
  const after = api.get({ action: 'bonspiel', id });
  assert.equal(after.draws.length, 0);
  assert.equal(after.teams.length, 4);
  assert.equal(after.bonspiel.status, 'setup');
  assert.equal(api.get().draw, null);
  assert.deepEqual(api.get({ action: 'draws' }).draws.map((draw) => draw.id), [handMade]);
  assert.equal(api.get({ action: 'draws' }).draws[0].games.length, 4);
  assert.match(admin(api, { action: 'deleteSchedule', id }).error, /no schedule/);
});
test('a hand-made draw links to the bonspiel chosen for it, and keeps its start time', () => {
  const { api, id, one } = withBracket();
  const other = admin(api, { action: 'saveBonspiel', bonspiel: { name: 'Other', format: 'single', settings } }).id;
  const game = { sheet: 1, team1: 'A', team2: 'Guest' };
  const draw = { name: 'One-off', date: '2026-11-07', startsAt: '2026-11-07T14:30', teamsFrom: id, games: [game] };
  const made = admin(api, { action: 'saveDraw', draw }).id;
  admin(api, { action: 'saveDraw', draw: { name: 'Unlinked', games: [game] } });
  const linked = () => api.get({ action: 'bonspiel', id }).linkedDraws;
  assert.deepEqual(linked().map((item) => [item.id, item.startsAt, item.teamsFrom, item.bonspielId]), [[made, '2026-11-07T14:30', id, '']]);
  assert.equal(api.get({ action: 'bonspiel', id: other }).linkedDraws.length, 0);
  assert.equal(api.get({ action: 'bonspiel', id }).draws.length, 2);

  admin(api, { action: 'goLive', id: made });
  assert.equal(api.get().draw.bonspielName, 'Fall');
  admin(api, { action: 'saveDraw', draw: { ...draw, id: made, startsAt: 'soon', teamsFrom: other } });
  const moved = api.get({ action: 'bonspiel', id: other }).linkedDraws[0];
  assert.deepEqual([moved.id, moved.startsAt], [made, '']);
  assert.match(admin(api, { action: 'saveDraw', draw: { ...draw, id: made, teamsFrom: 'nope' } }).error, /no longer exists/);

  // A scheduled draw belongs to its own bonspiel, and takes a new time but no link.
  admin(api, { action: 'saveDraw', draw: { id: one, name: 'Draw 1', date: '2026-11-06', startsAt: '2026-11-06T10:15', teamsFrom: other } });
  const saved = api.get({ action: 'bonspiel', id }).draws[0];
  assert.deepEqual([saved.startsAt, saved.teamsFrom, saved.bonspielId], ['2026-11-06T10:15', '', id]);
});
test('the TV can show a bonspiel page and go back to the scoreboard', () => {
  const { api, id } = withBonspiel();
  assert.equal(api.get().tv, '');
  assert.equal(scorer(api, { action: 'setTvView', bonspielId: id }).ok, false);
  assert.match(admin(api, { action: 'setTvView', bonspielId: 'nope' }).error, /no longer exists/);
  assert.equal(admin(api, { action: 'setTvView', bonspielId: id }).tv, id);
  assert.equal(api.get().tv, id);
  assert.equal(admin(api, { action: 'setTvView', bonspielId: '' }).tv, '');
  assert.equal(api.get().tv, '');
  admin(api, { action: 'setTvView', bonspielId: id });
  admin(api, { action: 'deleteBonspiel', id });
  assert.equal(api.get().tv, '');
});
test('a draw taken off live stays off until it is made live again', () => {
  const { api, one } = withBracket();
  admin(api, { action: 'goLive', id: one });
  assert.equal(scorer(api, { action: 'stopLive' }).ok, false);
  assert.equal(api.get().draw.id, one);
  assert.equal(admin(api, { action: 'stopLive' }).ok, true);
  assert.equal(api.get().draw, null);
  assert.equal(admin(api, { action: 'saveDraw', draw: { id: one, name: 'Edited' } }).ok, true);
  assert.equal(admin(api, { action: 'saveDraw', draw: { name: 'New' } }).ok, true);
  assert.equal(api.get().draw, null);
  admin(api, { action: 'goLive', id: one });
  assert.equal(api.get().draw.name, 'Edited');
});
test('end and score options are saved and forced into range', () => {
  const { api, id } = withBonspiel();
  const options = { trackEnds: true, pointsPerEnd: 3, scorePoints: true, maxEndPoints: 99 };
  admin(api, { action: 'saveBonspiel', bonspiel: { id, name: 'x', format: 'pools', settings: options } });
  const { settings: saved } = api.get({ action: 'bonspiel', id }).bonspiel;
  assert.deepEqual([saved.trackEnds, saved.pointsPerEnd, saved.scorePoints, saved.maxEndPoints], [true, 3, true, 8]);
  const fresh = withBonspiel();
  const { settings: blank } = fresh.api.get({ action: 'bonspiel', id: fresh.id }).bonspiel;
  assert.deepEqual([blank.trackEnds, blank.pointsPerEnd, blank.scorePoints, blank.maxEndPoints], [false, 1, false, 0]);
});
test('typed-in standings are saved per team, kept through a team edit, and cleared when left empty', () => {
  const { api, id, teams } = withBonspiel();
  const standing = () => api.get({ action: 'bonspiel', id }).teams.map((team) => team.standing);
  assert.equal(scorer(api, { action: 'saveStandings', id, teams: [{ id: teams[0], standing: { points: 5 } }] }).ok, false);
  admin(api, { action: 'saveStandings', id, teams: [{ id: teams[0], standing: { points: '7', diff: -3, won: '', rank: 1 } }, { id: teams[1], standing: { lost: 5000 } }] });
  assert.deepEqual(standing(), [{ points: 7, diff: -3 }, { lost: 999 }, {}, {}]);
  admin(api, { action: 'saveTeam', team: { id: teams[0], bonspielId: id, name: 'Renamed' } });
  assert.deepEqual(standing()[0], { points: 7, diff: -3 });
  admin(api, { action: 'saveStandings', id, teams: [{ id: teams[0], standing: {} }] });
  assert.deepEqual(standing()[0], {});
  assert.match(admin(api, { action: 'saveStandings', id, teams: [{ id: 'gone', standing: {} }] }).error, /no longer exists/);
});
test('resetting results clears scores, timers, filled games and typed standings, and keeps the rest', () => {
  const { api, id, teams, draws, one, two, score, final } = withBracket();
  const made = admin(api, { action: 'saveDraw', draw: { name: 'One-off', teamsFrom: id, minutes: 60, games: [{ sheet: 1, team1: 'A', team2: 'Guest' }] } }).id;
  const unlinked = admin(api, { action: 'saveDraw', draw: { name: 'Other', games: [{ sheet: 1, team1: 'X', team2: 'Y' }] } }).id;
  score(one, 1, 1);
  final(one, 1);
  score(made, 1, 0);
  final(made, 1);
  score(unlinked, 1, 0);
  admin(api, { action: 'goLive', id: made });
  assert.equal(scorer(api, { action: 'timer', id: made, op: 'start' }).ok, true);
  assert.ok(api.get().draw.startedAt > 0);
  admin(api, { action: 'saveStandings', id, teams: [{ id: teams[0], standing: { points: 9 } }] });
  assert.equal(draws()[1].games[0].team1, 'D');

  assert.equal(scorer(api, { action: 'resetResults', id }).ok, false);
  assert.equal(admin(api, { action: 'resetResults', id }).ok, true);
  const result = api.get({ action: 'bonspiel', id });
  const games = [...result.draws, ...result.linkedDraws].flatMap((draw) => draw.games);
  assert.ok(games.every((game) => !game.final && !game.ends.length));
  assert.deepEqual([draws()[0].games[0].team1, draws()[0].games[0].team2], ['A', 'D']);
  assert.deepEqual([draws()[1].games[0].team1, draws()[1].games[0].team1Id, draws()[1].games[1].team1], ['', '', '']);
  assert.equal(result.linkedDraws[0].games[0].team2, 'Guest');
  assert.deepEqual([result.linkedDraws[0].startedAt, result.linkedDraws[0].leftMs], [0, 3600000]);
  assert.ok(result.teams.every((team) => !Object.keys(team.standing).length));
  assert.equal(api.get({ action: 'draws' }).draws.find((draw) => draw.id === unlinked).games[0].ends.length, 1);
  assert.equal(two, draws()[1].id);
});
test('a team\'s new name and logo reach the games of linked hand-made draws', () => {
  const { api, id, teams } = withBonspiel();
  const game = { sheet: 1, team1: ' a ', team2: 'Guest', logo1: 'acc', logo2: 'acc' };
  admin(api, { action: 'saveDraw', draw: { name: 'One-off', teamsFrom: id, games: [game] } });
  const other = admin(api, { action: 'saveDraw', draw: { name: 'Unlinked', games: [game] } }).id;
  admin(api, { action: 'saveTeam', team: { id: teams[0], bonspielId: id, name: 'Aces', logo: 'new-logo' } });
  const linked = api.get({ action: 'bonspiel', id }).linkedDraws[0].games[0];
  assert.deepEqual([linked.team1, linked.logo1, linked.team2, linked.logo2], ['Aces', 'new-logo', 'Guest', 'acc']);
  admin(api, { action: 'saveTeam', team: { bonspielId: id, name: 'Guest', logo: 'guest-logo' } });
  assert.equal(api.get({ action: 'bonspiel', id }).linkedDraws[0].games[0].logo2, 'guest-logo');
  const unlinked = api.get({ action: 'draws' }).draws.find((draw) => draw.id === other).games[0];
  assert.deepEqual([unlinked.team1, unlinked.logo1], ['a', 'acc']);
});
