// Curling rules and timer maths, shared by every page. No DOM here.

export const MAX_POINTS = 8;
export const WARNING_MS = 10 * 60000;

export const otherTeam = (team) => (team === 0 ? 1 : 0);

// The team that scores gives up the hammer. A blank end keeps it where it was.
export function hammerAt(game, endIndex) {
  let hammer = game.hammer;
  game.ends.slice(0, endIndex).forEach((end) => {
    if (end.team !== null) hammer = otherTeam(end.team);
  });
  return hammer;
}

export const currentHammer = (game) => hammerAt(game, game.ends.length);

export function totals(game) {
  const score = [0, 0];
  game.ends.forEach((end) => {
    if (end.team !== null) score[end.team] += end.pts;
  });
  return score;
}

export const stoneOf = (game, team) => {
  const other = game.stone === 'red' ? 'blue' : 'red';
  return team === 0 ? game.stone : other;
};

export const teamName = (game, team) => (team === 0 ? game.team1 : game.team2) || `Team ${team + 1}`;
export const teamLogo = (game, team) => (team === 0 ? game.logo1 : game.logo2);
export const hasTeams = (game) => Boolean(game.team1 || game.team2);

// The wheels for choosing hammer and colour. The slice a wheel stops on is the team it picks, and the colour that team gets.
export function wheelSlices(useColour) {
  const pairs = [[0, 'red'], [1, 'blue'], [1, 'red'], [0, 'blue']];
  const slices = [...pairs, ...pairs];
  return slices.map(([team, colour], index) => (useColour ? { team, colour } : { team: index % 2, colour: '' }));
}

// Degrees to turn a wheel so the slice for this result sits under the pointer at the top.
export function wheelStop(slices, game, round) {
  const matches = slices.flatMap((slice, index) => (slice.team === game.pick && slice.colour === game.colour ? [index] : []));
  const index = matches[(round + game.sheet) % matches.length];
  return 360 - ((index + 0.5) * 360) / slices.length;
}

export const wheelSeconds = (sheet) => 5 + sheet;

export function spinResult(spin, game) {
  const name = teamName(game, game.pick);
  return [spin.hammer && `${name} has the hammer`, spin.colour && `${name} is ${game.colour}`].filter(Boolean).join(' · ');
}

export const drawTitle = (draw) => (draw.bonspielName ? `${draw.bonspielName} · ${draw.name}` : draw.name);

// Extra ends widen the line score past the scheduled number.
export function endColumns(draw) {
  const longest = Math.max(0, ...draw.games.map((game) => game.ends.length + (game.final ? 0 : 1)));
  return Math.max(draw.ends, longest);
}

export const timeLeft = (draw, now) =>
  draw.startedAt > 0 ? draw.leftMs - (now - draw.startedAt) : draw.leftMs;

export function timerPhase(draw, now) {
  if (timeLeft(draw, now) <= 0) return 'expired';
  if (draw.startedAt > 0) return 'running';
  return draw.leftMs === draw.minutes * 60000 ? 'ready' : 'paused';
}

export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
