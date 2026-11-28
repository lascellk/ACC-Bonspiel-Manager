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
  trackEnds: false, pointsPerEnd: 1, scorePoints: false, maxEndPoints: 0, standingsView: 'pools',
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

// Round 1 sets the top half of the seeds against the bottom half. Later rounds are slots of P:<round>:<n>,
// filled from the standings when the round before ends. An odd team count leaves a team out each round.
export function fixedGames(teams, gamesPerTeam) {
  const list = bySeed(teams).map((team) => team.id);
  const n = list.length;
  if (gamesPerTeam > n - 1) throw new Error(`${n} teams can play at most ${n - 1} games each`);
  if (n % 2 && gamesPerTeam % 2) throw new Error('With an odd number of teams, games per team must be even');
  const half = Math.floor(n / 2);
  const games = [];
  const add = (fields) => games.push(blankGame({ id: `f${games.length + 1}`, phase: 'pool', ...fields }));
  for (let i = 0; i < half; i++) add({ team1Id: list[i], team2Id: list[i + half], round: 1 });
  let left = (n * gamesPerTeam) / 2 - half;
  for (let round = 2; left > 0; round++) {
    const count = Math.min(half, left);
    for (let i = 0; i < count; i++) {
      add({ source1: `P:${round}:${i * 2 + 1}`, source2: `P:${round}:${i * 2 + 2}`, round });
    }
    left -= count;
  }
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
const isPairing = (source) => source.startsWith('P:');

function dependsOn(game, games) {
  const pool = games.filter((other) => other.phase === 'pool');
  const seeded = isSeedSlot(game.source1) || isSeedSlot(game.source2);
  const earlier = isPairing(game.source1) ? pool.filter((other) => other.round < game.round) : [];
  return [sourceGame(game.source1), sourceGame(game.source2), ...(seeded ? pool : earlier).map((other) => other.id)].filter(Boolean);
}

const gameTeams = (game) => [game.team1Id, game.team2Id].filter(Boolean);

// Fills draws one at a time from the games that are ready, earliest round first, then whoever has
// waited longest. Each game then takes the free sheet its teams have used least.
export function assignDraws(games, sheets = SHEETS) {
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
      .filter((game) => dependsOn(game, games).every((id) => placed.has(id) && placed.get(id) < number))
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
  const games = draws.flatMap((draw) => draw.games);
  draws.forEach((draw, i) => {
    const seen = new Set();
    draw.games.forEach((game) => {
      gameTeams(game).forEach((id) => {
        if (seen.has(id)) problems.push(`${nameOf(id)} is on two sheets in ${draw.name}`);
        seen.add(id);
      });
      if (dependsOn(game, games).some((id) => drawOf.get(id) >= i)) {
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

const seedOrder = (team) => Number(team.seed) || Infinity;

const endsWon = (game, side) => game.ends.filter((end) => end.team === side && end.pts > 0).length;

// A limit of 0 counts every point. The limit never changes the game's real score.
const cappedScore = (game, side, limit) => game.ends.filter((end) => end.team === side)
  .reduce((sum, end) => sum + (limit ? Math.min(end.pts, limit) : end.pts), 0);

// The numbers an organiser can type over. A team's standing holds only the ones changed.
export const STANDING_FIELDS = ['played', 'won', 'tied', 'lost', 'endsWon', 'scored', 'points', 'diff'];

// Rank by points, then head-to-head among the tied teams, then points-for difference. Head-to-head
// counts only win, tie and loss points. Draw-shot results aren't recorded, so a tie that remains is
// flagged for the organiser with tied: true. opponents are the teams whose games against these teams count
// too, so a pool's table includes its teams' crossover games against other pools.
export function standings(teams, games, settings, opponents = teams) {
  const rows = teams.map((team) => ({ team, played: 0, won: 0, tied: 0, lost: 0, points: 0, pf: 0, pa: 0, endsWon: 0, scored: 0, unresolved: false }));
  const row = new Map(rows.map((item) => [item.team.id, item]));
  const known = new Set([...teams, ...opponents].map((team) => team.id));
  const counted = games.filter((game) => game.final && game.phase === 'pool' && known.has(game.team1Id) && known.has(game.team2Id)
    && (row.has(game.team1Id) || row.has(game.team2Id)));
  counted.forEach((game) => {
    const [one, two] = totals(game);
    [[game.team1Id, one, two, 0], [game.team2Id, two, one, 1]].forEach(([id, mine, theirs, side]) => {
      const item = row.get(id);
      if (!item) return;
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

  rows.forEach((item) => {
    item.diff = item.pf - item.pa;
    STANDING_FIELDS.forEach((field) => {
      if (Number.isFinite(item.team.standing?.[field])) item[field] = item.team.standing[field];
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
      groupBy(group, (item) => item.diff).flatMap((still) => {
        if (still.length > 1) still.forEach((item) => { item.unresolved = true; });
        // Still tied (every team, before any game is played): listed by seed, so the order is the organiser's.
        return still.sort((a, b) => seedOrder(a.team) - seedOrder(b.team));
      }));
  });
  return ranked.map((item, i) => ({ ...item, rank: i + 1 }));
}

// One table per pool, or one table of all teams when the organiser chose standingsView 'overall'
// (pools used only to split the draws). Playoff seeds and the standings editor follow the same choice.
export function poolStandings(teams, games, settings) {
  const pools = poolNames(teams);
  if (pools.length < 2 || settings.standingsView === 'overall') {
    return [{ pool: pools.length === 1 && settings.standingsView !== 'overall' ? pools[0] : '', rows: standings(teams, games, settings) }];
  }
  return pools.map((pool) => ({ pool, rows: standings(teams.filter((team) => team.pool === pool), games, settings, teams) }));
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

// ----- Seeded rounds

const pairingParts = (source) => source.split(':').map(Number);
const roundOf = (game) => (isPairing(game.source1) ? pairingParts(game.source1)[1] : 1);

// The first round still waiting for its teams, with its games in slot order, or null.
export function nextRound(games) {
  const open = games.filter((game) => isPairing(game.source1) && !game.team1Id);
  if (!open.length) return null;
  const round = Math.min(...open.map(roundOf));
  return {
    round,
    games: open.filter((game) => roundOf(game) === round).sort((a, b) => pairingParts(a.source1)[2] - pairingParts(b.source1)[2]),
    unfinished: games.filter((game) => game.phase === 'pool' && !game.final && roundOf(game) < round).length,
  };
}

// Pairs each team with the next one down that it hasn't met, going back a step if that strands a team.
function pairUp(ids, canMeet) {
  if (!ids.length) return [];
  const [first, ...rest] = ids;
  for (const other of rest) {
    if (!canMeet(first, other)) continue;
    const others = pairUp(rest.filter((id) => id !== other), canMeet);
    if (others) return [first, other, ...others];
  }
  return null;
}

// Team ids for slots 1, 2, 3 and so on, so 1st plays 2nd and 3rd plays 4th. The team with fewer games
// plays first, which evens up an odd team count. A rematch happens only when there is no other way.
export function pairRound(teams, games, settings, slots) {
  const chosen = standings(teams, games, settings)
    .sort((a, b) => a.played - b.played || a.rank - b.rank)
    .slice(0, slots)
    .sort((a, b) => a.rank - b.rank);
  const met = new Set(games.filter((game) => game.team1Id && game.team2Id).map((game) => [game.team1Id, game.team2Id].sort().join()));
  const ids = chosen.map((item) => item.team.id);
  const teamIds = pairUp(ids, (a, b) => !met.has([a, b].sort().join())) || pairUp(ids, () => true);
  return { teamIds, tied: chosen.some((item) => item.unresolved) };
}

// ----- Brackets

export const flatGames = (draws) =>
  draws.flatMap((draw) => draw.games.filter((game) => game.gameId).map((game) => ({ ...game, draw })));

// Games of the hand-made draws linked to a bonspiel, given its team ids by name so they count in its standings.
export function linkedGames(linkedDraws, teams) {
  const key = (name) => String(name).trim().toLowerCase();
  const ids = new Map(teams.map((team) => [key(team.name), team.id]));
  return linkedDraws.flatMap((draw) => draw.games.map((game) => ({
    ...game, team1Id: ids.get(key(game.team1)) || '', team2Id: ids.get(key(game.team2)) || '', phase: 'pool', draw,
  })));
}

export const standingGames = ({ draws, linkedDraws = [], teams }) => [...flatGames(draws), ...linkedGames(linkedDraws, teams)];

// An ad-hoc draw (no bonspiel) as a one-table event, so the standings code ranks its finished games with the
// draw's own points. Teams are the names on its sheets, matched ignoring capitals.
export function drawResults(draw) {
  const key = (name) => String(name || '').trim().toLowerCase();
  const teams = new Map();
  draw.games.forEach((game) => [[game.team1, game.logo1], [game.team2, game.logo2]].forEach(([name, logo]) => {
    if (key(name) && !teams.has(key(name))) teams.set(key(name), { id: `t:${key(name)}`, name: String(name).trim(), logo: logo || '', pool: '' });
  }));
  const settings = { ...DEFAULT_SETTINGS, ...(draw.scoring || {}), standingsView: 'overall' };
  return { bonspiel: { id: '', name: draw.name, format: 'fixed', settings }, teams: [...teams.values()], draws: [], linkedDraws: [draw] };
}

// ----- Which bonspiel is on

// A bonspiel counts as still on for this many days after its start date, for a weekend event.
export const RUNNING_DAYS = 3;

// The bonspiel the public page opens by itself (the table sign's QR code has no id): the one whose draw is live on
// the scoreboard; otherwise the earliest one started in the last few days or still to come; otherwise the most
// recent. Archived bonspiels are left out. today is 'YYYY-MM-DD' in local time. Null when there are none.
export function currentBonspiel(all, liveDraw, today) {
  const bonspiels = all.filter((b) => !b.archived);
  if (!bonspiels.length) return null;
  const owner = liveDraw && [liveDraw.bonspielId, liveDraw.teamsFrom].find((id) => id && bonspiels.some((b) => b.id === id));
  if (owner) return bonspiels.find((b) => b.id === owner);
  const dated = bonspiels.filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.startDate))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - RUNNING_DAYS);
  const from = since.toISOString().slice(0, 10);
  return dated.find((b) => b.startDate >= from) || dated[dated.length - 1] || bonspiels[0];
}

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
  if (isPairing(source)) return `Seeded after round ${pairingParts(source)[1] - 1}`;
  const id = sourceGame(source);
  const game = id && games.find((item) => item.gameId === id);
  if (!game) return 'To be decided';
  return `${source[0] === 'W' ? 'Winner' : 'Loser'} of ${game.bracket}`;
}

// ----- Making teams from players

// A team's player fields, with the position each is filled from. The third plays vice.
export const TEAM_PLACES = [['skip', 'skip'], ['third', 'vice'], ['second', 'second'], ['lead', 'lead']];
const DRAW_ORDER = (drawTime) => (/early/i.test(drawTime) ? 0 : /late/i.test(drawTime) ? 2 : 1);

// The cheapest way to give each row of a square cost matrix its own column (the Hungarian method).
// Returns the column for each row.
export function cheapestAssignment(cost) {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[column] = row, 1-based.
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const column = new Array(n);
  for (let j = 1; j <= n; j += 1) if (p[j]) column[p[j] - 1] = j - 1;
  return column;
}

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// How well a player suits a position: 0 for one they ticked, 1 when they ticked none, 10 for one they didn't tick.
const fitCost = (player, position) => (player.positions.includes(position) ? 0 : player.positions.length ? 10 : 1);

// The best positions for up to four players who play together: {skip, third, ...} with the unfilled ones left out.
function positionsFor(members, random) {
  const order = shuffled(members, random);
  const cost = [...order.map((player) => TEAM_PLACES.map(([, position]) => fitCost(player, position))),
    ...Array.from({ length: 4 - order.length }, () => [0, 0, 0, 0])];
  const column = cheapestAssignment(cost);
  return Object.fromEntries(order.map((player, i) => [TEAM_PLACES[column[i]][0], player]));
}

// Puts players ({name, positions, status, drawTime, group}) into count teams of four.
// - Players who registered together (the same group) stay together: four as a team of their own, two or three on a
//   team that others fill. A fifth or more joins the other players. Registered teams never sit out.
// - Each player gets a position they ticked where possible, then players with nothing ticked fill the rest, and
//   someone is only put where they didn't want to be when there's no other way.
// - The other players with the same draw time preference go together.
// - When the players don't divide into fours, a paid player only sits out once every unpaid one has, and then
//   whoever leaves the rest in their positions.
// random makes a different set of equally good teams each time.
// Returns {teams: [{skip, third, second, lead, group}] of players, group being '' for a made-up team, unplaced}.
export function makeTeams(players, count, random = Math.random) {
  const total = Math.max(0, Math.min(count, Math.floor(players.length / 4)));
  const groups = new Map();
  const others = [];
  shuffled(players, random).forEach((player) => {
    if (player.group) groups.set(player.group, [...(groups.get(player.group) || []), player]); else others.push(player);
  });
  const together = [];
  groups.forEach((members, group) => {
    for (let i = 0; i < members.length; i += 4) {
      const chunk = members.slice(i, i + 4);
      if (chunk.length > 1) together.push({ group, chunk }); else others.push(...chunk);
    }
  });
  // Full registered teams first, then the bigger part-teams, as far as the number of teams allows.
  together.sort((a, b) => b.chunk.length - a.chunk.length);
  together.slice(total).forEach(({ chunk }) => others.push(...chunk));
  const kept = together.slice(0, total).map(({ group, chunk }) => ({ ...positionsFor(chunk, random), group }));

  // The other players fill the part-teams' open positions and the new teams.
  const order = shuffled(others, random);
  const slots = [];
  kept.forEach((team, t) => TEAM_PLACES.forEach(([field, position]) => { if (!team[field]) slots.push({ team: t, field, position }); }));
  const fresh = total - kept.length;
  for (let t = 0; t < fresh; t += 1) TEAM_PLACES.forEach(([field, position]) => slots.push({ team: -1, field, position }));
  while (slots.length < order.length) slots.push(null); // Sitting out.
  const cost = order.map((player) => slots.map((slot) => {
    if (!slot) return /^paid$/i.test(player.status) ? 20 : 0;
    return fitCost(player, slot.position);
  }));
  const column = cheapestAssignment(cost);
  const byField = Object.fromEntries(TEAM_PLACES.map(([field]) => [field, []]));
  const unplaced = [];
  order.forEach((player, i) => {
    const slot = slots[column[i]];
    if (!slot) unplaced.push(player);
    else if (slot.team >= 0) kept[slot.team][slot.field] = player;
    else byField[slot.field].push(player);
  });
  // Sorting each position by draw time (a stable sort keeps the shuffle otherwise) lines up the early players.
  Object.values(byField).forEach((list) => list.sort((a, b) => DRAW_ORDER(a.drawTime) - DRAW_ORDER(b.drawTime)));
  const made = Array.from({ length: fresh }, (_, t) => ({
    ...Object.fromEntries(TEAM_PLACES.map(([field]) => [field, byField[field][t]])), group: '',
  }));
  return { teams: [...kept, ...made], unplaced };
}

// "Team <skip's last name>", or the skip's full name when two skips share a last name.
export function teamNames(teams) {
  const last = (team) => String(team.skip?.name || '').trim().split(/\s+/).pop();
  return teams.map((team) => {
    const clash = teams.filter((other) => last(other).toLowerCase() === last(team).toLowerCase()).length > 1;
    return `Team ${clash ? team.skip.name : last(team)}`;
  });
}
