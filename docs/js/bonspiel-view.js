// HTML pieces shared by the organiser page and the public event page.
import { hasTeams, totals } from './core.js';
import { bracketSections, flatGames, poolStandings, sourceLabel } from './bonspiel.js';
import { esc, logoHtml } from './view.js';

export function formatTime(startsAt) {
  if (!startsAt) return 'Time to be set';
  return new Date(startsAt).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function matchRow(game, slot, games, score, won) {
  const name = game[`team${slot}`];
  const label = name || sourceLabel(game[`source${slot}`], games);
  const showScore = game.final || game.ends.length > 0;
  return `<div class="match-row ${won ? 'won' : ''} ${name ? '' : 'waiting'}">
    ${name ? logoHtml(game[`logo${slot}`], name) : '<span class="logo logo-blank"></span>'}
    <span class="match-name">${esc(label)}</span>
    <span class="match-score">${showScore ? score : ''}</span>
  </div>`;
}

export function matchCard(game, games, caption) {
  const [one, two] = totals(game);
  const status = game.final ? 'Final' : game.ends.length ? `End ${game.ends.length + 1}` : '';
  return `<div class="match">
    <div class="match-head"><span>${esc(caption)}</span><span>${status}</span></div>
    ${matchRow(game, 1, games, one, game.final && one > two)}
    ${matchRow(game, 2, games, two, game.final && two > one)}
  </div>`;
}

export function scheduleHtml(draws, liveId) {
  if (!draws.length) return '<p class="empty">The schedule has not been made yet.</p>';
  const games = flatGames(draws);
  return `<div class="draw-list">${draws.map((draw) => `<article class="draw-card ${draw.id === liveId ? 'is-live' : ''}">
    <h3>${esc(draw.name)}${draw.id === liveId ? ' <span class="badge">Live</span>' : ''}</h3>
    <p>${esc(formatTime(draw.startsAt))}</p>
    <div class="match-list">${draw.games.filter((game) => game.gameId).map((game) => matchCard(game, games, `Sheet ${game.sheet}`)).join('')}</div>
    <div class="draw-actions" data-draw-actions="${esc(draw.id)}"></div>
  </article>`).join('')}</div>`;
}

// Draws made by hand on the admin page. They have a date but no start time, and sheets may be empty.
export function otherDrawsHtml(draws, liveId) {
  const shown = draws.filter((draw) => draw.games.some(hasTeams));
  if (!shown.length) return '';
  return `<h3>Other draws</h3><div class="draw-list">${shown.map((draw) => `<article class="draw-card ${draw.id === liveId ? 'is-live' : ''}">
    <h3>${esc(draw.name)}${draw.id === liveId ? ' <span class="badge">Live</span>' : ''}</h3>
    <p>${esc(draw.date)}</p>
    <div class="match-list">${draw.games.filter(hasTeams).map((game) => matchCard(game, [], `Sheet ${game.sheet}`)).join('')}</div>
  </article>`).join('')}</div>`;
}

export function standingsHtml(data) {
  const { bonspiel, teams, draws } = data;
  if (bonspiel.format === 'single' || bonspiel.format === 'double') return '<p class="empty">This format has a bracket, not standings.</p>';
  const { trackEnds, scorePoints, maxEndPoints } = bonspiel.settings;
  const groups = poolStandings(teams, flatGames(draws), bonspiel.settings);
  const keys = [
    trackEnds && 'EW is ends won.',
    scorePoints && `Sc is points scored${maxEndPoints ? `, counting at most ${maxEndPoints} an end` : ''}.`,
  ].filter(Boolean);
  let flagged = false;
  const tables = groups.map(({ pool, rows }) => `<div class="table-wrap">
    ${pool ? `<h3>Pool ${esc(pool)}</h3>` : ''}
    <table class="standings">
      <thead><tr><th>#</th><th class="left">Team</th><th>G</th><th>W</th><th>T</th><th>L</th>${trackEnds ? '<th>EW</th>' : ''}${scorePoints ? '<th>Sc</th>' : ''}<th>Pts</th><th>Diff</th></tr></thead>
      <tbody>${rows.map((row) => {
        flagged = flagged || (row.unresolved && row.played > 0);
        return `<tr>
          <td>${row.rank}${row.unresolved && row.played > 0 ? '*' : ''}</td><td class="left">${esc(row.team.name)}</td><td>${row.played}</td>
          <td>${row.won}</td><td>${row.tied}</td><td>${row.lost}</td>${trackEnds ? `<td>${row.endsWon}</td>` : ''}${scorePoints ? `<td>${row.scored}</td>` : ''}<td><b>${row.points}</b></td><td>${row.diff > 0 ? '+' : ''}${row.diff}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`).join('');
  const note = flagged ? '<p class="note">* Still tied on points, head-to-head and difference. The organiser decides these teams\' order.</p>' : '';
  const key = keys.length ? `<p class="note">${esc(keys.join(' '))}</p>` : '';
  return `<div class="standings-grid">${tables}</div>${key}${note}`;
}

export function bracketHtml(draws) {
  const games = flatGames(draws);
  const sections = bracketSections(games);
  if (!sections.length) return '<p class="empty">No bracket in this event.</p>';
  return sections.map((section) => `<section class="bracket-section">
    ${section.title ? `<h3>${esc(section.title)}</h3>` : ''}
    <div class="bracket">${section.columns.map((column) => `<div class="bracket-round">
      <h4>${esc(column.name)}</h4>
      <div class="bracket-games">${column.games.map((game) => matchCard(game, games, `${game.bracket} · ${game.draw.name}, Sheet ${game.sheet}`)).join('')}</div>
    </div>`).join('')}</div>
  </section>`).join('');
}

export function teamsHtml(teams) {
  if (!teams.length) return '<p class="empty">No teams yet.</p>';
  return `<div class="team-list">${teams.map((team) => {
    const roster = [['Skip', team.skip], ['Third', team.third], ['Second', team.second], ['Lead', team.lead]].filter(([, name]) => name);
    return `<article class="team-card">
      <header>${logoHtml(team.logo, team.name)}<div><h3>${esc(team.name)}</h3>
      <p>${[team.club, team.pool && `Pool ${team.pool}`].filter(Boolean).map(esc).join(' · ')}</p></div></header>
      ${roster.length ? `<dl>${roster.map(([role, name]) => `<div><dt>${role}</dt><dd>${esc(name)}</dd></div>`).join('')}</dl>` : ''}
    </article>`;
  }).join('')}</div>`;
}
