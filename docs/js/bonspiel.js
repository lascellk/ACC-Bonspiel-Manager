// Bonspiel rules: building games, placing them in draws, and ranking teams. No DOM here.
import { totals } from './core.js';

export const SHEETS = 4;
export const MAX_TEAMS = 16;
export const FORMATS = {
  pools: 'Pools then playoffs',
  fixed: 'Fixed games, ranked on points',
  single: 'Single knockout',
  double: 'Double knockout',
};
export const DEFAULT_SETTINGS = {
  gamesPerTeam: 3, poolCount: 2, playoffSize: 4, pointsWin: 2, pointsTie: 1, pointsLoss: 0, ends: 8, minutes: 95,
  trackEnds: false, pointsPerEnd: 1, scorePoints: false, maxEndPoints: 0,
};

const POOL_NAMES = ['A', 'B', 'C', 'D'];

// Seeded teams first, in seed order, then the rest as entered.
export const bySeed = (teams) => [...teams].sort((a, b) => (a.seed || Infinity) - (b.seed || Infinity));

// Pools are dealt out in a snake, so the top seeds are spread evenly.
export function assignPools(teams, poolCount) {
  const cycle = [...POOL_NAMES.slice(0, poolCount), ...POOL_NAMES.slice(0, poolCount).reverse()];
  return bySeed(teams).map((team, i) => ({ id: team.id, seed: i + 1, pool: cycle[i % cycle.length] }));
}

const blankGame = (fields) => ({ team1Id: '', team2Id: '', source1: '', source2: '', bracket: '', ...fields });

// Rotating around a fixed first team gives every pair one round. An odd count leaves one team out each round.
export function roundRobin(teams, prefix = 'p') {
  const list = bySeed(teams).map((team) => team.id);
  if (list.length % 2) list.push(null);
  const games = [];
  for (let round = 0; round < list.length - 1; round++) {
    for (let i = 0; i < list.length / 2; i++) {
      const pair = [list[i], list[list.length - 1 - i]];
      if (pair[0] === null || pair[1] === null) continue;
      if (round % 2) pair.reverse();
      games.push(blankGame({ id: `${prefix}${games.length + 1}`, team1Id: pair[0], team2Id: pair[1], phase: 'pool', round: round + 1 }));
    }
    list.splice(1, 0, list.pop());
  }
  return games;
}

// Teams sit in a circle by seed and each plays those a set distance away, so nobody meets twice.
export function fixedGames(teams, gamesPerTeam) {
  const list = bySeed(teams).map((team) => team.id);
  const n = list.length;
  if (gamesPerTeam > n - 1) throw new Error(`${n} teams can play at most ${n - 1} games each`);
  if (n % 2 && gamesPerTeam % 2) throw new Error('With an odd number of teams, games per team must be even');
  const half = Math.floor(n / 2);
  const games = [];
  const pairAt = (distance, count) => {
    for (let i = 0; i < count; i++) {
      games.push(blankGame({ id: `f${games.length + 1}`, team1Id: list[i], team2Id: list[(i + distance) % n], phase: 'pool', round: 1 }));
    }
  };
  let left = gamesPerTeam;
  if (left % 2) {
    pairAt(half, half);
    left -= 1;
  }
  const top = n % 2 ? half : half - 1;
  for (let distance = top; left > 0; distance -= 1, left -= 2) pairAt(distance, n);
  return games;
}

// Seed positions that keep the top seeds apart until the last rounds: 1 8 4 5 2 7 3 6.
function bracketOrder(size) {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, sum - seed]);
  }
  return order;
}

// A slot is {teamId} or {source}. A missing slot is a bye, and the other slot moves on without a game.
function eliminator(phase, prefix) {
  const games = [];
  const play = (a, b, label, position, round) => {
    if (!a || !b) return { winner: a || b || null, loser: null };
    const id = `${prefix}${games.length + 1}`;
    games.push(blankGame({
      id, phase, round, bracket: position ? `${label}.${position}` : label,
      team1Id: a.teamId || '', team2Id: b.teamId || '', source1: a.source || '', source2: b.source || '',
    }));
    return { winner: { source: `W:${id}` }, loser: { source: `L:${id}` } };
  };
  // Plays one round. Pairs are [a, b]. Rounds made up only of byes take no number.
  const playRound = (pairs, letter, number, round) => {
    let position = 0;
    const results = pairs.map(([a, b]) => play(a, b, `${letter}${number}`, a && b ? (position += 1) : 0, round));
    return { results, played: position > 0 };
  };
  return { games, play, playRound };
}

const adjacent = (slots) => {
  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) pairs.push([slots[i], slots[i + 1] ?? null]);
  return pairs;
};

function placeEntrants(entrants) {
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  return bracketOrder(size).map((seed) => entrants[seed - 1] || null);
}

// Winners rounds, shared by both knockouts. Returns the champion's slot and each round's losers.
function winnersBracket(builder, entrants, letter) {
  let slots = placeEntrants(entrants);
  const losers = [];
  let round = 1;
  while (slots.length > 1) {
    const { results } = builder.playRound(adjacent(slots), letter, round, round);
    slots = results.map((result) => result.winner);
    losers.push(results.map((result) => result.loser));
    round += 1;
  }
  return { champion: slots[0], losers, rounds: round - 1 };
}

const asEntrants = (teams) => bySeed(teams).map((team) => ({ teamId: team.id }));

function assertBracket(entrants) {
  if (entrants.length < 2) throw new Error('A knockout needs at least two teams');
}

export function singleKnockout(entrants, phase = 'knockout', prefix = 'k') {
  assertBracket(entrants);
  const builder = eliminator(phase, prefix);
  winnersBracket(builder, entrants, 'R');
  return builder.games;
}

// Losers of each winners round drop in against the survivors, reversed so early rematches are rarer.
// The bracket ends in one final between the two bracket winners, with no reset game.
export function doubleKnockout(entrants, phase = 'knockout', prefix = 'k') {
  assertBracket(entrants);
  const builder = eliminator(phase, prefix);
  const { champion, losers, rounds } = winnersBracket(builder, entrants, 'W');
  let number = 1;
  let round = 1;
  const losersRound = (pairs) => {
    const { results, played } = builder.playRound(pairs, 'L', number, round);
    if (played) number += 1;
    round += 1;
    return results.map((result) => result.winner);
  };
  let alive = losers[0];
  if (alive.length > 1) alive = losersRound(adjacent(alive));
  for (let dropIn = 1; dropIn < losers.length; dropIn++) {
    const dropped = dropIn % 2 ? [...losers[dropIn]].reverse() : losers[dropIn];
    alive = losersRound(alive.map((slot, i) => [slot, dropped[i]]));
    if (alive.length > 1) alive = losersRound(adjacent(alive));
  }
  builder.play(champion, alive[0], 'F', 0, Math.max(rounds, round) + 1);
  return builder.games;
}

// Playoff slots are placed by seed now and filled with teams when the organiser seeds them.
export const playoffGames = (size) =>
  singleKnockout(Array.from({ length: size }, (_, i) => ({ source: `S:${i + 1}` })), 'playoff', 'x');

export function poolNames(teams) {
  return [...new Set(teams.map((team) => team.pool).filter(Boolean))].sort();
}

// All the games for a bonspiel, in no particular draw yet.
export function buildGames(bonspiel, teams) {
  const { format, settings } = bonspiel;
  if (teams.length < 2) throw new Error('Add at least two teams first');
  if (format === 'single') return singleKnockout(asEntrants(teams));
  if (format === 'double') return doubleKnockout(asEntrants(teams));
  let games;
  if (format === 'fixed') {
    games = fixedGames(teams, settings.gamesPerTeam);
  } else {
    if (teams.some((team) => !team.pool)) throw new Error('Every team needs a pool');
    games = poolNames(teams).flatMap((pool) => {
      const members = teams.filter((team) => team.pool === pool);
      if (members.length < 2) throw new Error(`Pool ${pool} needs at least two teams`);
      return roundRobin(members, `p${pool}`);
    });
  }
  if (settings.playoffSize > teams.length) throw new Error('The playoff is larger than the number of teams');
  return settings.playoffSize >= 2 ? [...games, ...playoffGames(settings.playoffSize)] : games;
}

const sourceGame = (source) => (/^[WL]:/.test(source) ? source.slice(2) : '');
const isSeedSlot = (source) => source.startsWith('S:');

function dependsOn(game, poolIds) {
  const seeded = isSeedSlot(game.source1) || isSeedSlot(game.source2);
  return [sourceGame(game.source1), sourceGame(game.source2), ...(seeded ? poolIds : [])].filter(Boolean);
}

const gameTeams = (game) => [game.team1Id, game.team2Id].filter(Boolean);

// Fills draws one at a time from the games that are ready, earliest round first, then whoever has
// waited longest. Each game then takes the free sheet its teams have used least.
export function assignDraws(games, sheets = SHEETS) {
  const poolIds = games.filter((game) => game.phase === 'pool').map((game) => game.id);
  const order = new Map(games.map((game, i) => [game.id, i]));
  const placed = new Map();
  const lastDraw = new Map();
  const played = new Map();
  const sheetUse = new Map();
  const draws = [];
  let remaining = [...games];

  const waited = (game) => Math.min(...gameTeams(game).map((id) => lastDraw.get(id) ?? -1), Infinity);
  const gamesPlayed = (game) => gameTeams(game).reduce((sum, id) => sum + (played.get(id) || 0), 0);
  const useOf = (game, sheet) => gameTeams(game).reduce((sum, id) => sum + (sheetUse.get(`${id}/${sheet}`) || 0), 0);

  while (remaining.length) {
    const number = draws.length;
    const ready = remaining
      .filter((game) => dependsOn(game, poolIds).every((id) => placed.has(id) && placed.get(id) < number))
      .sort((a, b) => a.round - b.round || gamesPlayed(a) - gamesPlayed(b) || waited(a) - waited(b) || order.get(a.id) - order.get(b.id));
    const busy = new Set();
    const chosen = [];
    ready.forEach((game) => {
      if (chosen.length === sheets || gameTeams(game).some((id) => busy.has(id))) return;
      gameTeams(game).forEach((id) => busy.add(id));
      chosen.push(game);
    });
    const free = Array.from({ length: sheets }, (_, i) => i + 1);
    const seated = chosen.map((game) => {
      const sheet = [...free].sort((a, b) => useOf(game, a) - useOf(game, b) || a - b)[0];
      free.splice(free.indexOf(sheet), 1);
      gameTeams(game).forEach((id) => {
        sheetUse.set(`${id}/${sheet}`, (sheetUse.get(`${id}/${sheet}`) || 0) + 1);
        lastDraw.set(id, number);
        played.set(id, (played.get(id) || 0) + 1);
      });
      placed.set(game.id, number);
      return { ...game, sheet };
    });
    remaining = remaining.filter((game) => !placed.has(game.id));
    draws.push({ name: `Draw ${number + 1}`, startsAt: '', games: seated.sort((a, b) => a.sheet - b.sheet) });
  }
  return draws;
}

// 'YYYY-MM-DDTHH:mm' times. After perDay draws the next day starts at the same time as the first.
export function drawTimes(first, count, gapMinutes, perDay) {
  if (!first) return Array(count).fill('');
  const start = new Date(first);
  return Array.from({ length: count }, (_, i) => {
    const day = Math.floor(i / perDay);
    const time = new Date(start);
    time.setDate(start.getDate() + day);
    time.setMinutes(start.getMinutes() + (i % perDay) * gapMinutes);
    const pad = (value) => String(value).padStart(2, '0');
    return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}T${pad(time.getHours())}:${pad(time.getMinutes())}`;
  });
}

// Swaps whatever is at two draw and sheet positions. Either may be empty.
export function swapGames(draws, first, second) {
  const next = draws.map((draw) => ({ ...draw, games: [...draw.games] }));
  const take = ({ draw, sheet }) => {
    const index = next[draw].games.findIndex((game) => game.sheet === sheet);
    return index < 0 ? null : next[draw].games.splice(index, 1)[0];
  };
  const one = take(first);
  const two = take(second);
  if (one) next[second.draw].games.push({ ...one, sheet: second.sheet });
  if (two) next[first.draw].games.push({ ...two, sheet: first.sheet });
  next.forEach((draw) => draw.games.sort((a, b) => a.sheet - b.sheet));
  return next;
}

// Plain descriptions of anything wrong with a schedule. Empty when it can be saved.
export function scheduleProblems(draws, nameOf = (id) => id) {
  const problems = [];
  const drawOf = new Map();
  draws.forEach((draw, i) => draw.games.forEach((game) => drawOf.set(game.id, i)));
  const poolIds = draws.flatMap((draw) => draw.games).filter((game) => game.phase === 'pool').map((game) => game.id);
  draws.forEach((draw, i) => {
    const seen = new Set();
    draw.games.forEach((game) => {
      gameTeams(game).forEach((id) => {
        if (seen.has(id)) problems.push(`${nameOf(id)} is on two sheets in ${draw.name}`);
        seen.add(id);
      });
      if (dependsOn(game, poolIds).some((id) => drawOf.get(id) >= i)) {
        problems.push(`${draw.name}, Sheet ${game.sheet} needs the result of a game that comes later`);
      }
    });
  });
  return [...new Set(problems)];
}

// ----- Standings

const groupBy = (rows, key) => {
  const values = [...new Set(rows.map(key))].sort((a, b) => b - a);
  return values.map((value) => rows.filter((row) => key(row) === value));
};

function pointsFor(settings, mine, theirs) {
  if (mine > theirs) return settings.pointsWin;
  return mine === theirs ? settings.pointsTie : settings.pointsLoss;
}

const endsWon = (game, side) => game.ends.filter((end) => end.team === side && end.pts > 0).length;

// A limit of 0 counts every point. The limit never changes the game's real score.
const cappedScore = (game, side, limit) => game.ends.filter((end) => end.team === side)
  .reduce((sum, end) => sum + (limit ? Math.min(end.pts, limit) : end.pts), 0);

// Rank by points, then head-to-head among the tied teams, then points-for difference. Head-to-head
// counts only win, tie and loss points. Draw-shot results aren't recorded, so a tie that remains is
// flagged for the organiser with tied: true.
export function standings(teams, games, settings) {
  const rows = teams.map((team) => ({ team, played: 0, won: 0, tied: 0, lost: 0, points: 0, pf: 0, pa: 0, endsWon: 0, scored: 0, unresolved: false }));
  const row = new Map(rows.map((item) => [item.team.id, item]));
  const counted = games.filter((game) => game.final && game.phase === 'pool' && row.has(game.team1Id) && row.has(game.team2Id));
  counted.forEach((game) => {
    const [one, two] = totals(game);
    [[game.team1Id, one, two, 0], [game.team2Id, two, one, 1]].forEach(([id, mine, theirs, side]) => {
      const item = row.get(id);
      const ends = endsWon(game, side);
      const scored = cappedScore(game, side, settings.maxEndPoints);
      item.played += 1;
      item.pf += mine;
      item.pa += theirs;
      item.endsWon += ends;
      item.scored += scored;
      item.points += pointsFor(settings, mine, theirs);
      if (settings.trackEnds) item.points += ends * settings.pointsPerEnd;
      if (settings.scorePoints) item.points += scored;
      if (mine > theirs) item.won += 1; else if (mine < theirs) item.lost += 1; else item.tied += 1;
    });
  });

  const headToHead = (group) => {
    const ids = new Set(group.map((item) => item.team.id));
    const score = new Map(group.map((item) => [item.team.id, 0]));
    counted.filter((game) => ids.has(game.team1Id) && ids.has(game.team2Id)).forEach((game) => {
      const [one, two] = totals(game);
      score.set(game.team1Id, score.get(game.team1Id) + pointsFor(settings, one, two));
      score.set(game.team2Id, score.get(game.team2Id) + pointsFor(settings, two, one));
    });
    return score;
  };

  const ranked = groupBy(rows, (item) => item.points).flatMap((level) => {
    if (level.length === 1) return level;
    const score = headToHead(level);
    return groupBy(level, (item) => score.get(item.team.id)).flatMap((group) =>
      groupBy(group, (item) => item.pf - item.pa).flatMap((still) => {
        if (still.length > 1) still.forEach((item) => { item.unresolved = true; });
        return still;
      }));
  });
  return ranked.map((item, i) => ({ ...item, rank: i + 1, diff: item.pf - item.pa }));
}

export function poolStandings(teams, games, settings) {
  const pools = poolNames(teams);
  if (pools.length < 2) return [{ pool: pools[0] || '', rows: standings(teams, games, settings) }];
  return pools.map((pool) => ({ pool, rows: standings(teams.filter((team) => team.pool === pool), games, settings) }));
}

// Pool winners first, then runners-up and so on, each place in order of points and difference.
export function playoffSeeds(teams, games, settings, size) {
  const groups = poolStandings(teams, games, settings);
  const places = Math.max(...groups.map((group) => group.rows.length));
  const order = [];
  for (let place = 0; place < places; place++) {
    const rows = groups.map((group) => group.rows[place]).filter(Boolean);
    order.push(...rows.sort((a, b) => b.points - a.points || b.diff - a.diff));
  }
  const chosen = order.slice(0, size);
  return { teamIds: chosen.map((item) => item.team.id), tied: chosen.some((item) => item.unresolved) };
}

// ----- Brackets

export const flatGames = (draws) =>
  draws.flatMap((draw) => draw.games.filter((game) => game.gameId).map((game) => ({ ...game, draw })));

function parseBracket(label) {
  if (label === 'F') return { letter: 'F', round: 1, position: 1 };
  const match = /^([RWL])(\d+)\.(\d+)$/.exec(label);
  return match ? { letter: match[1], round: Number(match[2]), position: Number(match[3]) } : null;
}

function roundName(round, last) {
  if (round === last) return 'Final';
  if (round === last - 1) return 'Semifinal';
  return round === last - 2 ? 'Quarterfinal' : `Round ${round}`;
}

// Brackets as sections of round columns, ready to draw.
export function bracketSections(games) {
  const parsed = games.map((game) => ({ game, place: parseBracket(game.bracket) })).filter((item) => item.place);
  const section = (letters, title, name) => {
    const items = parsed.filter((item) => letters.includes(item.place.letter));
    if (!items.length) return null;
    const rounds = [...new Set(items.map((item) => item.place.round))].sort((a, b) => a - b);
    const last = rounds[rounds.length - 1];
    return {
      title,
      columns: rounds.map((round) => ({
        name: name(round, last),
        games: items.filter((item) => item.place.round === round)
          .sort((a, b) => a.place.position - b.place.position).map((item) => item.game),
      })),
    };
  };
  return [
    section('R', '', roundName),
    section('W', 'Winners bracket', (round) => `Round ${round}`),
    section('L', 'Losers bracket', (round) => `Round ${round}`),
    section('F', '', () => 'Final'),
  ].filter(Boolean);
}

export function sourceLabel(source, games) {
  if (isSeedSlot(source)) return `Seed ${source.slice(2)}`;
  const id = sourceGame(source);
  const game = id && games.find((item) => item.gameId === id);
  if (!game) return 'To be decided';
  return `${source[0] === 'W' ? 'Winner' : 'Loser'} of ${game.bracket}`;
}
