// Organiser page: details, teams, schedule, then running the event.
import { configured, get, post } from './api.js';
import {
  assignDraws, assignPools, buildGames, bySeed, DEFAULT_SETTINGS, drawTimes, flatGames, FORMATS, MAX_TEAMS, nextRound, pairRound,
  playoffSeeds, poolStandings, scheduleProblems, SHEETS, sourceLabel, STANDING_FIELDS, standingGames, standings, swapGames,
} from './bonspiel.js';
import { bracketHtml, linkedSchedule, scheduleHtml, standingsHtml } from './bonspiel-view.js';
import { esc, loadLogos, logoHtml, logoOptions, notConfiguredNotice, requirePin, STOP_LIVE_WARNING, toast } from './view.js';

const $ = (selector) => document.querySelector(selector);
const STEPS = ['Details', 'Teams', 'Schedule', 'Run'];
let logos = [];
let list = [];
let data = null; // {bonspiel, teams, draws, linkedDraws} for the open bonspiel.
let liveId = '';
let step = 0;
let preview = null; // Generated draws, not yet saved.
let picked = null; // The {draw, sheet} chosen first for a swap.
let timing = { first: '', gap: 180, perDay: 4 };
let editingStandings = false;

const openId = () => new URLSearchParams(location.search).get('id');
const blankBonspiel = () => ({ id: '', name: '', startDate: new Date().toLocaleDateString('en-CA'), format: 'pools', settings: { ...DEFAULT_SETTINGS } });
const teamName = (id) => data.teams.find((team) => team.id === id)?.name || 'A team';

function setOpen(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  history.pushState(null, '', url);
}

async function load() {
  const id = openId();
  $('#steps').hidden = !id;
  if (!id) {
    data = null;
    list = (await get('bonspiels')).bonspiels;
    $('#page-title').textContent = 'Bonspiels';
    renderList();
    return;
  }
  const result = await get('bonspiel', { id });
  data = { bonspiel: result.bonspiel, teams: result.teams, draws: result.draws, linkedDraws: result.linkedDraws };
  liveId = result.draw?.id || '';
  $('#page-title').textContent = data.bonspiel.name;
  $('#event-link').href = `event.html?id=${id}`;
  $('#event-link').hidden = false;
  render();
}

async function run(work, done) {
  try {
    await work();
    if (done) toast(done);
    await load();
  } catch (error) {
    toast(error.message);
  }
}

function renderList() {
  $('#event-link').hidden = true;
  $('#content').innerHTML = `<section class="panel">
    <div class="panel-head"><h2>Bonspiels</h2><button type="button" class="primary" data-action="new">New bonspiel</button></div>
    ${list.length ? `<div class="draw-list">${list.map((item) => `<article class="draw-card">
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.startDate)} · ${esc(FORMATS[item.format])}</p>
      <footer><button type="button" data-open="${esc(item.id)}">Open</button></footer>
    </article>`).join('')}</div>` : '<p class="empty">No bonspiels yet. Create the first one.</p>'}
  </section>`;
}

function renderSteps() {
  $('#steps').innerHTML = STEPS.map((name, i) =>
    `<button type="button" data-step="${i}" class="${i === step ? 'on' : ''}" ${i && !data?.bonspiel.id ? 'disabled' : ''}>${i + 1}. ${name}</button>`).join('');
}

function render() {
  renderSteps();
  [renderDetails, renderTeams, renderSchedule, renderRun][step]();
}

// ----- 1. Details

function number(name, label, value, min, max, shownFor = '', needs = '') {
  return `<label data-for="${shownFor}" data-needs="${needs}">${label} <input type="number" name="${name}" min="${min}" max="${max}" value="${value}" required></label>`;
}

function checkbox(name, label, checked, shownFor) {
  return `<label class="check" data-for="${shownFor}"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;
}

function renderDetails() {
  const item = data?.bonspiel || blankBonspiel();
  const s = { ...DEFAULT_SETTINGS, ...item.settings };
  $('#content').innerHTML = `<form id="details" class="panel form-grid">
    <h2>Details</h2>
    <label class="grow">Name <input name="name" value="${esc(item.name)}" maxlength="60" required></label>
    <label>Start date <input type="date" name="startDate" value="${esc(item.startDate)}"></label>
    <label>Format <select name="format">${Object.entries(FORMATS).map(([value, label]) =>
      `<option value="${value}" ${value === item.format ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    ${number('poolCount', 'Pools', s.poolCount, 1, 4, 'pools')}
    ${number('gamesPerTeam', 'Games per team', s.gamesPerTeam, 1, 15, 'fixed')}
    ${number('playoffSize', 'Teams in playoffs (0 for none)', s.playoffSize, 0, MAX_TEAMS, 'pools fixed')}
    ${number('pointsWin', 'Points for a win', s.pointsWin, 0, 10, 'pools fixed')}
    ${number('pointsTie', 'Points for a tie', s.pointsTie, 0, 10, 'pools fixed')}
    ${number('pointsLoss', 'Points for a loss', s.pointsLoss, 0, 10, 'pools fixed')}
    ${checkbox('trackEnds', 'Track ends won', s.trackEnds, 'pools fixed')}
    ${number('pointsPerEnd', 'Points for each end won', s.pointsPerEnd, 0, 10, 'pools fixed', 'trackEnds')}
    ${checkbox('scorePoints', 'Add points for total score', s.scorePoints, 'pools fixed')}
    ${number('maxEndPoints', 'Most points an end (0 for no limit)', s.maxEndPoints, 0, 8, 'pools fixed', 'scorePoints')}
    ${number('ends', 'Ends', s.ends, 1, 12)}
    ${number('minutes', 'Timer (minutes)', s.minutes, 1, 600)}
    <div class="grow button-row">
      <button type="submit" class="primary">Save details</button>
      ${item.id ? '<button type="button" class="danger" data-action="delete-bonspiel">Delete bonspiel</button>' : ''}
    </div>
  </form>`;
  showFormatFields();
}

function showFormatFields() {
  const format = $('#details [name=format]').value;
  document.querySelectorAll('#details [data-for]').forEach((field) => {
    const { needs } = field.dataset;
    field.hidden = (Boolean(field.dataset.for) && !field.dataset.for.split(' ').includes(format))
      || (Boolean(needs) && !$(`#details [name=${needs}]`).checked);
  });
}

function saveDetails(form) {
  const values = Object.fromEntries(new FormData(form));
  const { name, startDate, format, trackEnds, scorePoints, ...numbers } = values;
  const settings = {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, Number(value)])),
    trackEnds: Boolean(trackEnds),
    scorePoints: Boolean(scorePoints),
  };
  const id = data?.bonspiel.id || '';
  run(async () => {
    const result = await post('saveBonspiel', { bonspiel: { id, name, startDate, format, settings } });
    if (!id) {
      setOpen(result.id);
      step = 1;
    }
  }, 'Saved');
}

// ----- 2. Teams

function renderTeams() {
  const { teams, bonspiel } = data;
  const usesPools = bonspiel.format === 'pools';
  $('#content').innerHTML = `<section class="panel">
    <div class="panel-head">
      <div><h2>Teams</h2><p>${teams.length} of ${MAX_TEAMS}</p></div>
      <div class="button-row">
        ${usesPools ? '<button type="button" data-action="assign-pools">Assign pools</button>' : ''}
        <button type="button" class="primary" data-action="add-team" ${teams.length >= MAX_TEAMS ? 'disabled' : ''}>Add team</button>
      </div>
    </div>
    ${teams.length ? `<ul class="team-rows">${bySeed(teams).map((team) => `<li>
      ${logoHtml(team.logo, team.name)}
      <span class="grow"><b>${team.seed ? `${team.seed}. ` : ''}${esc(team.name)}</b>
      <small>${[team.club, team.pool && `Pool ${team.pool}`].filter(Boolean).map(esc).join(' · ')}</small></span>
      <button type="button" data-team="${esc(team.id)}">Edit</button>
      <button type="button" class="danger" data-remove-team="${esc(team.id)}">Delete</button>
    </li>`).join('')}</ul>` : '<p class="empty">No teams yet.</p>'}
  </section>`;
}

function openTeam(team) {
  const dialog = $('#team-dialog');
  const field = (name, label, attrs = 'maxlength="40"') =>
    `<label>${label} <input name="${name}" value="${esc(team[name] ?? '')}" ${attrs} autocomplete="off"></label>`;
  dialog.innerHTML = `<form id="team-form">
    <header><h2>${team.id ? 'Edit team' : 'Add team'}</h2><button type="button" class="close" aria-label="Close">×</button></header>
    <input type="hidden" name="id" value="${esc(team.id || '')}">
    <div class="draw-fields two">
      ${field('name', 'Team name', 'maxlength="40" required')}
      ${field('club', 'Club', 'maxlength="60"')}
      ${field('skip', 'Skip')}${field('third', 'Third')}${field('second', 'Second')}${field('lead', 'Lead')}
      <label>Seed <input type="number" name="seed" min="1" max="${MAX_TEAMS}" value="${team.seed || ''}"></label>
      <label>Pool <input name="pool" value="${esc(team.pool || '')}" maxlength="2"></label>
      <label>Logo <select name="logo">${logoOptions(logos, team.logo || '')}</select></label>
    </div>
    <footer><button type="submit" class="primary">Save team</button></footer>
  </form>`;
  dialog.showModal();
}

// ----- 3. Schedule

function generate() {
  try {
    const draws = assignDraws(buildGames(data.bonspiel, data.teams));
    const form = new FormData($('#timing'));
    timing = { first: form.get('first'), gap: Number(form.get('gap')) || 180, perDay: Number(form.get('perDay')) || 4 };
    const times = drawTimes(timing.first, draws.length, timing.gap, timing.perDay);
    preview = draws.map((draw, i) => ({ ...draw, startsAt: times[i] }));
    picked = null;
    render();
  } catch (error) {
    toast(error.message);
  }
}

function previewSlot(draw, drawIndex, sheet) {
  const game = draw.games.find((item) => item.sheet === sheet);
  const on = picked?.draw === drawIndex && picked?.sheet === sheet;
  const all = preview.flatMap((item) => item.games).map((item) => ({ ...item, gameId: item.id }));
  const label = (slot) => (game[`team${slot}Id`] ? teamName(game[`team${slot}Id`]) : sourceLabel(game[`source${slot}`], all));
  return `<button type="button" class="slot ${on ? 'on' : ''}" data-slot="${drawIndex}/${sheet}">
    <small>Sheet ${sheet}${game?.bracket ? ` · ${esc(game.bracket)}` : ''}</small>
    ${game ? `${esc(label(1))} v ${esc(label(2))}` : '<i>Empty</i>'}
  </button>`;
}

function renderSchedule() {
  const saved = data.draws.length > 0;
  const started = flatGames(data.draws).some((game) => game.final || game.ends.length);
  const first = timing.first || (data.bonspiel.startDate ? `${data.bonspiel.startDate}T09:00` : '');
  const problems = preview ? scheduleProblems(preview, teamName) : [];
  const controls = `<form id="timing" class="panel form-grid">
    <h2>Schedule</h2>
    <label>First draw <input type="datetime-local" name="first" value="${esc(first)}"></label>
    <label>Minutes between draws <input type="number" name="gap" min="30" max="600" value="${timing.gap}"></label>
    <label>Draws per day <input type="number" name="perDay" min="1" max="12" value="${timing.perDay}"></label>
    <div class="grow button-row">
      <button type="button" class="primary" data-action="generate" ${started ? 'disabled' : ''}>${saved ? 'Generate a new schedule' : 'Generate schedule'}</button>
      ${saved ? `<button type="button" class="danger" data-action="delete-schedule" ${started ? 'disabled' : ''}>Delete schedule</button>` : ''}
    </div>
    ${started ? '<p class="note grow">Scores have been entered, so this schedule can no longer be replaced or deleted.</p>' : ''}
  </form>`;
  if (!preview) {
    $('#content').innerHTML = `${controls}<section class="panel">${scheduleHtml(data.draws, liveId)}</section>`;
    return;
  }
  $('#content').innerHTML = `${controls}<section class="panel">
    <div class="panel-head">
      <div><h2>Preview</h2><p>${preview.length} draws. Not saved yet. Tap two games to swap them.</p></div>
      <div class="button-row">
        <button type="button" data-action="add-draw">Add draw</button>
        <button type="button" data-action="discard">Discard</button>
        <button type="button" class="primary" data-action="save-schedule" ${problems.length ? 'disabled' : ''}>Save schedule</button>
      </div>
    </div>
    ${problems.length ? `<ul class="problems">${problems.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}
    <div class="preview">${preview.map((draw, i) => `<article class="draw-card">
      <h3>${esc(draw.name)}</h3>
      <label class="time">Start <input type="datetime-local" data-time="${i}" value="${esc(draw.startsAt)}"></label>
      <div class="slots">${Array.from({ length: SHEETS }, (_, sheet) => previewSlot(draw, i, sheet + 1)).join('')}</div>
    </article>`).join('')}</div>
  </section>`;
}

function saveSchedule() {
  const draws = preview.filter((draw) => draw.games.length).map((draw, i) => ({ ...draw, name: `Draw ${i + 1}` }));
  const replacing = data.draws.length > 0;
  if (replacing && !confirm('Replace the saved schedule?')) return;
  run(async () => {
    await post('saveSchedule', { id: data.bonspiel.id, draws });
    preview = null;
  }, 'Schedule saved');
}

// ----- 4. Run

function teamSelect(name, chosen) {
  return `<select name="${name}">${data.teams.map((team) => `<option value="${esc(team.id)}" ${team.id === chosen ? 'selected' : ''}>${esc(team.name)}</option>`).join('')}</select>`;
}

function roundPanel() {
  const { bonspiel, teams, draws } = data;
  const games = flatGames(draws);
  const next = nextRound(games);
  if (!next) return '';
  const { round, unfinished } = next;
  if (unfinished) return `<section class="panel"><h2>Round ${round}</h2><p class="note">${unfinished} ${unfinished === 1 ? 'game' : 'games'} to finish before seeding round ${round}.</p></section>`;
  const { teamIds, tied } = pairRound(teams, games, bonspiel.settings, next.games.length * 2);
  return `<form id="round-seeding" class="panel" data-round="${round}">
    <h2>Seed round ${round}</h2>
    ${tied ? '<p class="note">Some teams are still tied. Change the games below if a draw-shot result decides their order.</p>' : ''}
    <div class="seed-list">${next.games.map((game, i) => `<label>${esc(game.draw.name)}, Sheet ${game.sheet}${teamSelect('team', teamIds[i * 2])}</label>
      <label>against${teamSelect('team', teamIds[i * 2 + 1])}</label>`).join('')}</div>
    <button type="submit" class="primary">Fill round ${round}</button>
  </form>`;
}

function seedingPanel() {
  const { bonspiel, teams, draws } = data;
  const games = flatGames(draws);
  const playoffs = games.filter((game) => game.phase === 'playoff');
  if (!playoffs.length) return '';
  if (playoffs.some((game) => game.final || game.ends.length)) return '';
  const unfinished = games.filter((game) => game.phase === 'pool' && !game.final).length;
  if (unfinished) return `<section class="panel"><h2>Playoffs</h2><p class="note">${unfinished} pool ${unfinished === 1 ? 'game' : 'games'} to finish before seeding.</p></section>`;
  const seedCount = new Set(playoffs.flatMap((game) => [game.source1, game.source2]).filter((source) => source.startsWith('S:'))).size;
  const { teamIds, tied } = playoffSeeds(teams, games, bonspiel.settings, seedCount);
  return `<form id="seeding" class="panel">
    <h2>Seed the playoffs</h2>
    ${tied ? '<p class="note">Some teams are still tied. Enter the draw-shot result by choosing their order below.</p>' : ''}
    <div class="seed-list">${teamIds.map((chosen, i) => `<label>Seed ${i + 1}${teamSelect('seed', chosen)}</label>`).join('')}</div>
    <button type="submit" class="primary">Fill the playoff games</button>
  </form>`;
}

const RESET_WARNING = 'Delete every score in this bonspiel, including its linked hand-made draws, and all typed standings? '
  + 'Timers restart, and games filled from results or seeds wait for their teams again. This can\'t be undone.';
const STANDING_LABELS = { played: 'G', won: 'W', tied: 'T', lost: 'L', endsWon: 'EW', scored: 'Sc', points: 'Pts', diff: 'Diff' };

// Each box shows the number worked out from the games. A number typed in replaces it, and an empty box goes back to it.
function standingsForm() {
  const { settings } = data.bonspiel;
  const fields = STANDING_FIELDS.filter((field) => (field !== 'endsWon' || settings.trackEnds) && (field !== 'scored' || settings.scorePoints));
  const games = standingGames(data);
  const worked = new Map(standings(data.teams.map((team) => ({ ...team, standing: {} })), games, settings).map((row) => [row.team.id, row]));
  const order = poolStandings(data.teams, games, settings).flatMap((group) => group.rows);
  const box = (team, field) => `<td><input type="number" name="${esc(team.id)}.${field}" step="1" min="-999" max="999"
    value="${team.standing?.[field] ?? ''}" placeholder="${worked.get(team.id)[field]}" aria-label="${esc(team.name)} ${STANDING_LABELS[field]}"></td>`;
  return `<form id="standings-form" class="panel">
    <div class="panel-head">
      <div><h2>Edit standings</h2><p>Type a number to replace the one worked out from the games. Leave a box empty to use the games.</p></div>
    </div>
    <div class="table-wrap"><table class="standings edit-standings">
      <thead><tr><th class="left">Team</th>${fields.map((field) => `<th>${STANDING_LABELS[field]}</th>`).join('')}</tr></thead>
      <tbody>${order.map(({ team }) => `<tr><td class="left">${esc(team.name)}</td>${fields.map((field) => box(team, field)).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="button-row">
      <button type="button" data-action="cancel-standings">Cancel</button>
      <button type="button" class="danger" data-action="clear-standings">Use the games for all</button>
      <button type="submit" class="primary">Save standings</button>
    </div>
    <p class="note">Start again: <button type="button" class="danger" data-action="reset-results">Reset all results</button></p>
  </form>`;
}

function readStandings(form) {
  const values = new FormData(form);
  return data.teams.map((team) => ({
    id: team.id,
    standing: Object.fromEntries(STANDING_FIELDS
      .map((field) => [field, values.get(`${team.id}.${field}`) ?? ''])
      .filter(([, value]) => value !== '')
      .map(([field, value]) => [field, Number(value)])),
  }));
}

function saveStandings(teams, done) {
  run(async () => {
    await post('saveStandings', { id: data.bonspiel.id, teams });
    editingStandings = false;
  }, done);
}

function renderRun() {
  const hasStandings = ['pools', 'fixed'].includes(data.bonspiel.format);
  const standingsPanel = editingStandings ? standingsForm() : `<section class="panel">
    <div class="panel-head"><h2>Standings</h2><button type="button" data-action="edit-standings">Edit standings</button></div>
    ${standingsHtml(data)}
  </section>`;
  $('#content').innerHTML = `${roundPanel() || seedingPanel()}
    <section class="panel"><h2>Draws</h2>${scheduleHtml([...data.draws, ...linkedSchedule(data.linkedDraws)], liveId)}</section>
    ${hasStandings ? standingsPanel : ''}
    <section class="panel"><h2>Bracket</h2>${bracketHtml(data.draws)}</section>`;
  document.querySelectorAll('[data-draw-actions]').forEach((slot) => {
    const id = slot.dataset.drawActions;
    slot.innerHTML = id === liveId
      ? '<div class="button-row"><a class="top-link dark" href="index.html">Go to scoring</a><button type="button" data-stop-live="true">Take off live</button></div>'
      : `<button type="button" class="primary" data-live="${esc(id)}">Make live</button>`;
  });
}

// ----- Events

$('#steps').addEventListener('click', (event) => {
  const value = event.target.dataset.step;
  if (value === undefined) return;
  step = Number(value);
  editingStandings = false;
  load().catch((error) => toast(error.message));
});

$('#content').addEventListener('change', (event) => {
  if (['format', 'trackEnds', 'scorePoints'].includes(event.target.name)) showFormatFields();
  if (event.target.dataset.time !== undefined) preview[Number(event.target.dataset.time)].startsAt = event.target.value;
});

$('#content').addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'details') saveDetails(event.target);
  if (event.target.id === 'seeding') {
    const seeds = new FormData(event.target).getAll('seed');
    run(() => post('seedPlayoffs', { id: data.bonspiel.id, seeds }), 'Playoff games filled');
  }
  if (event.target.id === 'standings-form') saveStandings(readStandings(event.target), 'Standings saved');
  if (event.target.id === 'round-seeding') {
    const teams = new FormData(event.target).getAll('team');
    const round = Number(event.target.dataset.round);
    run(() => post('seedRound', { id: data.bonspiel.id, round, teams }), `Round ${round} filled`);
  }
});

$('#content').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const { action, open, team, removeTeam, slot, live, stopLive } = button.dataset;
  if (open) {
    setOpen(open);
    step = 0;
    load().catch((error) => toast(error.message));
  }
  if (team) openTeam(data.teams.find((item) => item.id === team));
  if (removeTeam && confirm('Delete this team?')) run(() => post('deleteTeam', { id: removeTeam }), 'Team deleted');
  if (live) run(() => post('goLive', { id: live }), 'Draw is live');
  if (stopLive && confirm(STOP_LIVE_WARNING)) run(() => post('stopLive'), 'Draw taken off live');
  if (slot) {
    const [draw, sheet] = slot.split('/').map(Number);
    if (picked && !(picked.draw === draw && picked.sheet === sheet)) {
      preview = swapGames(preview, picked, { draw, sheet });
      picked = null;
    } else {
      picked = picked ? null : { draw, sheet };
    }
    render();
  }
  if (action === 'new') {
    data = null;
    step = 0;
    $('#steps').hidden = false;
    renderSteps();
    renderDetails();
  }
  if (action === 'delete-bonspiel' && confirm('Delete this bonspiel, with its teams, draws and scores?')) {
    run(async () => {
      await post('deleteBonspiel', { id: data.bonspiel.id });
      setOpen('');
      step = 0;
    }, 'Bonspiel deleted');
  }
  if (action === 'add-team') openTeam({ logo: '', seed: data.teams.length + 1 });
  if (action === 'assign-pools') {
    const teams = assignPools(data.teams, data.bonspiel.settings.poolCount);
    run(() => post('saveSeeding', { id: data.bonspiel.id, teams }), 'Pools assigned');
  }
  if (action === 'edit-standings' || action === 'cancel-standings') {
    editingStandings = action === 'edit-standings';
    render();
  }
  if (action === 'clear-standings' && confirm('Remove every typed-in number and use the games for all teams?')) {
    saveStandings(data.teams.map((team) => ({ id: team.id, standing: {} })), 'Standings use the games again');
  }
  if (action === 'reset-results' && confirm(RESET_WARNING)) {
    run(async () => {
      await post('resetResults', { id: data.bonspiel.id });
      editingStandings = false;
    }, 'All results deleted');
  }
  if (action === 'generate') generate();
  if (action === 'save-schedule') saveSchedule();
  if (action === 'delete-schedule' && confirm('Delete this schedule and all its draws? The teams stay.')) {
    run(async () => {
      await post('deleteSchedule', { id: data.bonspiel.id });
      preview = null;
    }, 'Schedule deleted');
  }
  if (action === 'discard') {
    preview = null;
    render();
  }
  if (action === 'add-draw') {
    preview = [...preview, { name: `Draw ${preview.length + 1}`, startsAt: '', games: [] }];
    render();
  }
});

$('#team-dialog').addEventListener('click', (event) => {
  if (event.target.classList.contains('close')) $('#team-dialog').close();
});

$('#team-dialog').addEventListener('submit', (event) => {
  event.preventDefault();
  const team = { ...Object.fromEntries(new FormData(event.target)), bonspielId: data.bonspiel.id };
  $('#team-dialog').close();
  run(() => post('saveTeam', { team }), 'Team saved');
});

window.addEventListener('popstate', () => {
  step = 0;
  preview = null;
  load().catch((error) => toast(error.message));
});

async function start() {
  if (!configured) return notConfiguredNotice();
  await requirePin('admin', 'Bonspiel organiser');
  logos = await loadLogos();
  await load();
}

start().catch((error) => toast(error.message));
