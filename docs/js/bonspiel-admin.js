// Organiser page: details, teams, schedule, then running the event.
import { configured, get, post } from './api.js';
import {
  assignDraws, assignPools, buildGames, bySeed, DEFAULT_SETTINGS, drawTimes, flatGames, FORMATS, makeTeams, MAX_TEAMS, nextRound, pairRound,
  playoffSeeds, poolStandings, scheduleProblems, SHEETS, sourceLabel, STANDING_FIELDS, standingGames, standings, swapGames, teamNames,
} from './bonspiel.js';
import { bracketHtml, linkedSchedule, scheduleHtml, standingsHtml } from './bonspiel-view.js';
import { applyGameType, esc, gameTypeFields, loadLogos, logoHtml, logoOptions, notConfiguredNotice, requirePin, STOP_LIVE_WARNING, toast } from './view.js';

const $ = (selector) => document.querySelector(selector);
const STEPS = ['Details', 'Players', 'Teams', 'Schedule', 'Run'];
const POSITIONS = [['skip', 'Skip'], ['vice', 'Vice'], ['second', 'Second'], ['lead', 'Lead']];
let logos = [];
let list = [];
let data = null; // {bonspiel, teams, draws, linkedDraws} for the open bonspiel.
let liveId = '';
let step = 0;
let preview = null; // Generated draws, not yet saved.
let picked = null; // The {draw, sheet} chosen first for a swap.
let timing = { first: '', gap: 180, perDay: 4 };
let editingStandings = false;
let teamPreview = null; // Teams made from the players, not yet saved: {teams: [{name, named, skip, ...}], out, count, waiting}.
let pickedPlayer = ''; // The first player tapped for a swap in the preview: 'team/field' or 'out/index'.
let ccmEventList = null; // The CCM events, once loaded from the admin site.
const ARCHIVE_WARNING = 'Archive this bonspiel? Its teams, draws and results are kept, but it leaves the public page and the admin choices, '
  + 'and the TV goes back to the scoreboard if it shows it. You can unarchive it any time.';

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
    $('#page-title').textContent = 'Almonte Curling Club Bonspiel Manager';
    renderList();
    return;
  }
  const result = await get('bonspiel', { id });
  data = { bonspiel: result.bonspiel, teams: result.teams, draws: result.draws, linkedDraws: result.linkedDraws, players: [] };
  if (step === 1 || step === 2) data.players = (await post('players', { id })).players;
  liveId = result.draw?.id || '';
  $('#page-title').textContent = data.bonspiel.name;
  $('#event-link').href = `event.html?id=${id}`;
  $('#event-link').hidden = false;
  $('#home-link').hidden = false;
  render();
}

async function run(work, done) {
  try {
    await work();
    if (done) toast(typeof done === 'function' ? done() : done);
    await load();
  } catch (error) {
    toast(error.message);
  }
}

const bonspielCards = (items) => `<div class="draw-list">${items.map((item) => `<article class="draw-card">
  <h3>${esc(item.name)}</h3>
  <p>${esc(item.startDate)} · ${esc(FORMATS[item.format])}</p>
  <footer><button type="button" data-open="${esc(item.id)}">Open</button></footer>
</article>`).join('')}</div>`;

function renderList() {
  $('#event-link').hidden = true;
  $('#home-link').hidden = true;
  const current = list.filter((item) => !item.archived);
  const archived = list.filter((item) => item.archived)
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  $('#content').innerHTML = `<section class="panel">
    <div class="panel-head"><h2>Bonspiels</h2><button type="button" class="primary" data-action="new">New bonspiel</button></div>
    ${current.length ? bonspielCards(current) : `<p class="empty">${archived.length ? 'No current bonspiels.' : 'No bonspiels yet. Create the first one.'}</p>`}
  </section>
  ${archived.length ? `<details class="panel archived-list"><summary><h2>Archived (${archived.length})</h2></summary>${bonspielCards(archived)}</details>` : ''}`;
}

function renderSteps() {
  $('#steps').innerHTML = STEPS.map((name, i) =>
    `<button type="button" data-step="${i}" class="${i === step ? 'on' : ''}" ${i && !data?.bonspiel.id ? 'disabled' : ''}>${i + 1}. ${name}</button>`).join('');
}

function render() {
  renderSteps();
  [renderDetails, renderPlayers, renderTeams, renderSchedule, renderRun][step]();
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
    ${item.archived ? '<p class="note grow">This bonspiel is archived. Its results are kept, but it is not on the public page, the TV choices or Teams from.</p>' : ''}
    <label class="grow">Name <input name="name" value="${esc(item.name)}" maxlength="60" required></label>
    <label>Start date <input type="date" name="startDate" value="${esc(item.startDate)}"></label>
    <fieldset class="choices grow"><legend>Players</legend>
      <label><input type="radio" name="source" value="manual" ${item.ccmEvent ? '' : 'checked'}> Added by hand</label>
      <label><input type="radio" name="source" value="ccm" ${item.ccmEvent ? 'checked' : ''}> From a CCM event's registrations</label>
      <select name="ccmEvent" class="grow" ${item.ccmEvent ? '' : 'hidden'}>${ccmEventOptions(item.ccmEvent)}</select>
      <span id="ccm-status" class="note"></span>
    </fieldset>
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
    <fieldset class="choices grow" data-for="pools fixed"><legend>Standings show</legend>
      ${['pools', 'overall'].map((value) => `<label><input type="radio" name="standingsView" value="${value}" ${s.standingsView === value ? 'checked' : ''}> ${value === 'pools' ? 'A table for each pool' : 'All teams in one table'}</label>`).join('')}
    </fieldset>
    ${gameTypeFields(s.ends, s.minutes)}
    <div class="grow button-row">
      <button type="submit" class="primary">Save details</button>
      ${item.id ? `<button type="button" data-action="archive-bonspiel">${item.archived ? 'Unarchive' : 'Archive'} bonspiel</button>` : ''}
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

// Standings show takes effect straight away, without Save details. Only this setting is saved, from the stored
// bonspiel, so other unsaved changes on the form are left as they are.
async function saveStandingsView(view) {
  if (!data?.bonspiel.id) return; // A new bonspiel saves it with Save details.
  const { id, name, startDate, format, settings } = data.bonspiel;
  try {
    await post('saveBonspiel', { bonspiel: { id, name, startDate, format, settings: { ...settings, standingsView: view } } });
    data.bonspiel.settings = { ...settings, standingsView: view };
    toast(view === 'overall' ? 'Standings show all teams in one table' : 'Standings show a table for each pool');
  } catch (error) {
    toast(error.message);
  }
}

// ----- CCM events

function ccmEventOptions(current) {
  const list = [...(ccmEventList || [])];
  if (current && !list.some((event) => event.id === current.id)) list.unshift(current);
  const label = (event) => `${event.date} · ${event.name}${event.players === undefined ? '' : ` (${event.players} players)`}`;
  return `<option value="">${ccmEventList ? 'Choose an event' : 'Loading CCM events…'}</option>${list.map((event) =>
    `<option value="${esc(event.id)}" data-name="${esc(event.name)}" data-date="${esc(event.date)}" ${event.id === current?.id ? 'selected' : ''}>${esc(label(event))}</option>`).join('')}`;
}

// The list comes from the club admin site, which takes several seconds, so it is loaded once and only when wanted.
async function loadCcmEvents() {
  if (ccmEventList) return;
  const status = $('#ccm-status');
  if (status) status.textContent = 'Loading events from the club website…';
  try {
    ccmEventList = (await post('ccmEvents')).events;
    if (status) status.textContent = '';
  } catch (error) {
    if (status) status.textContent = `Could not load the CCM events: ${error.message}`;
    return;
  }
  const select = $('#details [name=ccmEvent]');
  if (!select) return;
  const chosen = select.selectedOptions[0];
  select.innerHTML = ccmEventOptions(chosen?.value ? { id: chosen.value, name: chosen.dataset.name, date: chosen.dataset.date } : null);
}

function chosenCcmEvent(form) {
  if (form.elements.source.value !== 'ccm') return null;
  const option = form.elements.ccmEvent.selectedOptions[0];
  if (!option?.value) throw new Error('Choose a CCM event, or Added by hand');
  return { id: option.value, name: option.dataset.name, date: option.dataset.date };
}

async function importPlayers(id) {
  const result = await post('importPlayers', { id });
  const changes = [[result.added, 'added'], [result.updated, 'updated'], [result.removed, 'removed']]
    .filter(([count]) => count).map(([count, word]) => `${count} ${word}`);
  return changes.length ? `Players from CCM: ${changes.join(', ')}` : 'Players already match CCM';
}

function saveDetails(form) {
  let ccmEvent;
  try {
    ccmEvent = chosenCcmEvent(form);
  } catch (error) {
    toast(error.message);
    return;
  }
  const values = Object.fromEntries(new FormData(form));
  const { name, startDate, format, trackEnds, scorePoints, gameType, standingsView, source, ccmEvent: chosenId, ...numbers } = values;
  const settings = {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, Number(value)])),
    trackEnds: Boolean(trackEnds),
    scorePoints: Boolean(scorePoints),
    standingsView: standingsView || 'pools',
  };
  const id = data?.bonspiel.id || '';
  const linkChanged = (ccmEvent?.id || '') !== (data?.bonspiel.ccmEvent?.id || '');
  let done = 'Saved';
  run(async () => {
    const result = await post('saveBonspiel', { bonspiel: { id, name, startDate, format, settings, ccmEvent } });
    if (!id) {
      setOpen(result.id);
      step = 1;
    }
    if (ccmEvent && linkChanged) {
      toast('Saved. Getting the players from CCM…');
      // The bonspiel is saved either way, so a failed import is reported without stopping the page reloading it.
      done = await importPlayers(result.id).catch((error) => `Saved, but the players did not load: ${error.message}. Try Update from CCM.`);
    }
  }, () => done);
}

// ----- 2. Players

const playerOrder = (a, b) => Number(/waiting/i.test(a.status)) - Number(/waiting/i.test(b.status)) || a.name.localeCompare(b.name);

function renderPlayers() {
  const { players, bonspiel } = data;
  const event = bonspiel.ccmEvent;
  const counts = POSITIONS.map(([key, label]) => `${label} ${players.filter((player) => player.positions.includes(key)).length}`).join(' · ');
  const waiting = players.filter((player) => /waiting/i.test(player.status)).length;
  $('#content').innerHTML = `<section class="panel">
    <div class="panel-head">
      <div><h2>Players</h2><p>${players.length} ${players.length === 1 ? 'player' : 'players'}${waiting ? ` (${waiting} on the waiting list)` : ''}${event ? ` · from ${esc(event.name)}` : ''}</p>
        <p>Preferred: ${counts}</p></div>
      <div class="button-row">
        ${event ? '<button type="button" data-action="import-players">Update from CCM</button>' : ''}
        <button type="button" data-action="copy-emails" ${players.some((player) => player.email) ? '' : 'disabled'}>Copy emails</button>
        <button type="button" class="primary" data-action="add-player">Add player</button>
      </div>
    </div>
    ${players.length ? `<div class="table-scroll"><table class="standings players">
      <thead><tr><th class="left">Name</th><th class="left">Email</th><th class="left">Status</th>
        ${POSITIONS.map(([, label]) => `<th>${label}</th>`).join('')}<th class="left">Notes</th><th></th></tr></thead>
      <tbody>${[...players].sort(playerOrder).map((player) => `<tr data-player="${esc(player.id)}">
        <td class="left"><b>${esc(player.name)}</b>${player.drawTime ? `<small>${esc(player.drawTime)}</small>` : ''}</td>
        <td class="left">${player.email ? `<a href="mailto:${esc(player.email)}">${esc(player.email)}</a>` : ''}</td>
        <td class="left">${player.ccmId ? `<span class="status status-${esc(player.status.toLowerCase().replace(/\W+/g, '-'))}">${esc(player.status)}</span>` : '<span class="status">By hand</span>'}</td>
        ${POSITIONS.map(([key, label]) => `<td><input type="checkbox" data-position="${key}" aria-label="${label}" ${player.positions.includes(key) ? 'checked' : ''}></td>`).join('')}
        <td class="left notes">${esc(player.notes)}</td>
        <td class="actions">${player.ccmId ? '' : `<button type="button" data-edit-player="${esc(player.id)}">Edit</button>
          <button type="button" class="danger" data-remove-player="${esc(player.id)}">Delete</button>`}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : `<p class="empty">${event ? 'No players yet. Press Update from CCM to get the registrations.' : 'No players yet.'}</p>`}
  </section>`;
}

// Copies every player's email, then says so with the ACC rule that players are only ever sent BCC. If the
// browser refuses the clipboard, the popup shows the addresses selected, ready to copy by hand.
async function copyEmails() {
  const emails = [...new Set(data.players.map((player) => player.email).filter(Boolean))];
  const text = emails.join('; ');
  let copied = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copied = false;
  }
  const dialog = $('#team-dialog');
  dialog.innerHTML = `<form method="dialog" class="copied">
    <header><h2>${copied ? 'Emails copied' : 'Copy the emails'}</h2><button type="button" class="close" aria-label="Close">×</button></header>
    <p>${copied
      ? `${emails.length} email ${emails.length === 1 ? 'address has' : 'addresses have'} been copied to the clipboard.`
      : 'The browser would not copy them. They are selected below: press Ctrl+C (or Cmd+C) to copy them.'}</p>
    ${copied ? '' : `<textarea readonly rows="5">${esc(text)}</textarea>`}
    <div class="reminder" role="note"><b>Important:</b> paste the addresses into the <b>BCC</b> field only, never To or CC.
      ACC policy is that players are only ever BCC'd, so no one sees anyone else's email address.</div>
    <footer><button type="submit" class="primary">OK</button></footer>
  </form>`;
  dialog.showModal();
  dialog.querySelector('textarea')?.select();
}

function openPlayer(player) {
  const dialog = $('#team-dialog');
  dialog.innerHTML = `<form id="player-form">
    <header><h2>${player.id ? 'Edit player' : 'Add player'}</h2><button type="button" class="close" aria-label="Close">×</button></header>
    <input type="hidden" name="id" value="${esc(player.id || '')}">
    <div class="draw-fields two">
      <label>Name <input name="name" value="${esc(player.name || '')}" maxlength="80" required autocomplete="off"></label>
      <label>Email <input type="email" name="email" value="${esc(player.email || '')}" maxlength="120" autocomplete="off"></label>
      <label class="grow">Notes <input name="notes" value="${esc(player.notes || '')}" maxlength="500" autocomplete="off"></label>
    </div>
    <footer><button type="submit" class="primary">Save player</button></footer>
  </form>`;
  dialog.showModal();
}

// A ticked box saves straight away, without reloading the page.
async function savePositions(row) {
  const player = data.players.find((item) => item.id === row.dataset.player);
  const positions = [...row.querySelectorAll('[data-position]:checked')].map((box) => box.dataset.position);
  try {
    await post('savePlayer', { player: { ...player, bonspielId: data.bonspiel.id, positions } });
    player.positions = positions;
    renderPlayers();
  } catch (error) {
    toast(error.message);
    renderPlayers();
  }
}

// ----- 3. Teams

// The team fields that hold players, with the position each one is picked for. Third is the vice.
const TEAM_SPOTS = [['skip', 'Skip', 'skip'], ['third', 'Third', 'vice'], ['second', 'Second', 'second'], ['lead', 'Lead', 'lead']];
const nameKey = (name) => String(name || '').trim().toLowerCase();

// The names of players already on a team, other than the team being edited.
function playersOnTeams(exceptId = '') {
  return new Set(data.teams.filter((team) => team.id !== exceptId)
    .flatMap((team) => TEAM_SPOTS.map(([field]) => nameKey(team[field]))).filter(Boolean));
}

// A list of the players free for one spot: those who prefer it first, then the rest, each by name.
function playerChoices(position, taken) {
  const label = (player) => [
    player.positions.length ? `Prefers ${player.positions.map((key) => POSITIONS.find(([k]) => k === key)[1]).join(', ')}` : 'No preference',
    /waiting/i.test(player.status) ? 'waiting list' : '',
  ].filter(Boolean).join(' · ');
  return data.players.filter((player) => !taken.has(nameKey(player.name)))
    .sort((a, b) => Number(!a.positions.includes(position)) - Number(!b.positions.includes(position))
      || Number(/waiting/i.test(a.status)) - Number(/waiting/i.test(b.status)) || a.name.localeCompare(b.name))
    .map((player) => `<option value="${esc(player.name)}" label="${esc(label(player))}"></option>`).join('');
}

function renderTeams() {
  const { teams, bonspiel, players } = data;
  const usesPools = bonspiel.format === 'pools';
  const placed = players.filter((player) => playersOnTeams().has(nameKey(player.name))).length;
  const canMake = freePlayers(true).length >= 4 && teams.length < MAX_TEAMS && !teamPreview;
  $('#content').innerHTML = `<section class="panel">
    <div class="panel-head">
      <div><h2>Teams</h2><p>${teams.length} of ${MAX_TEAMS}${players.length ? ` · ${placed} of ${players.length} players on a team` : ''}</p></div>
      <div class="button-row">
        ${canMake ? '<button type="button" data-action="make-teams">Make teams from players</button>' : ''}
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
  </section>${teamPreview ? teamPreviewHtml() : ''}`;
}

// ----- Making teams from the players

// Players not yet on a team, leaving out the waiting list unless asked.
function freePlayers(waiting) {
  const taken = playersOnTeams();
  return data.players.filter((player) => !taken.has(nameKey(player.name)) && (waiting || !/waiting/i.test(player.status)));
}

const roomForTeams = () => MAX_TEAMS - data.teams.length;

function makePreview(count, waiting) {
  const players = freePlayers(waiting);
  const most = Math.min(Math.floor(players.length / 4), roomForTeams());
  const made = makeTeams(players, Math.min(count ?? most, most));
  const names = teamNames(made.teams);
  teamPreview = { teams: made.teams.map((team, i) => ({ ...team, name: names[i], named: false })), out: made.unplaced, most, waiting };
  pickedPlayer = '';
}

// Teams named after their skip follow a new skip after a swap. A typed name stays.
function renameFromSkips() {
  const names = teamNames(teamPreview.teams);
  teamPreview.teams.forEach((team, i) => { if (!team.named) team.name = names[i]; });
}

function previewPlayerHtml(player, key, position) {
  const fit = !position ? '' : player.positions.includes(position) ? 'fit' : player.positions.length ? 'misfit' : '';
  const wants = player.positions.length ? `Prefers ${player.positions.map((p) => POSITIONS.find(([k]) => k === p)[1]).join(', ')}` : 'No preference';
  const draw = /no pref/i.test(player.drawTime) ? '' : player.drawTime;
  const extra = [wants, draw, /waiting/i.test(player.status) ? 'Waiting list' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="pick ${fit} ${pickedPlayer === key ? 'on' : ''}" data-pick="${key}">${esc(player.name)}<small>${esc(extra)}</small></button>`;
}

function teamPreviewHtml() {
  const { teams, out, most, waiting } = teamPreview;
  const misfits = teams.reduce((n, team) => n + TEAM_SPOTS.filter(([field, , position]) =>
    team[field].positions.length && !team[field].positions.includes(position)).length, 0);
  return `<section class="panel">
    <div class="panel-head">
      <div><h2>Suggested teams</h2><p>Not saved yet. Tap two players to swap them. Green is a position the player ticked${misfits ? `, and orange is one they didn't (${misfits})` : ''}.</p></div>
      <div class="button-row">
        <button type="button" data-action="shuffle-teams">Shuffle</button>
        <button type="button" data-action="discard-teams">Discard</button>
        <button type="button" class="primary" data-action="save-teams" ${teams.length ? '' : 'disabled'}>Save ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}</button>
      </div>
    </div>
    <div class="button-row team-options">
      <label>Teams to make <input type="number" name="teamCount" min="1" max="${most}" value="${teams.length}"></label>
      <label class="check"><input type="checkbox" name="includeWaiting" ${waiting ? 'checked' : ''}> Include the waiting list</label>
    </div>
    ${teams.length ? `<div class="table-scroll"><table class="standings made-teams">
      <thead><tr><th class="left">Team</th>${TEAM_SPOTS.map(([, label]) => `<th class="left">${label}</th>`).join('')}</tr></thead>
      <tbody>${teams.map((team, t) => `<tr>
        <td class="left"><input name="madeName" data-team="${t}" value="${esc(team.name)}" maxlength="40" aria-label="Team name"></td>
        ${TEAM_SPOTS.map(([field, , position]) => `<td class="left">${previewPlayerHtml(team[field], `${t}/${field}`, position)}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty">Not enough players for a team.</p>'}
    ${out.length ? `<h3 class="made-out">Not on a team (${out.length})</h3><div class="button-row">${out.map((player, i) => previewPlayerHtml(player, `out/${i}`, '')).join('')}</div>` : ''}
  </section>`;
}

function madeSlot(key) {
  const [where, which] = key.split('/');
  return where === 'out' ? { list: teamPreview.out, at: Number(which) } : { list: teamPreview.teams[Number(where)], at: which };
}

function pickPreviewPlayer(key) {
  if (!pickedPlayer || pickedPlayer === key) {
    pickedPlayer = pickedPlayer === key ? '' : key;
  } else {
    const a = madeSlot(pickedPlayer);
    const b = madeSlot(key);
    [a.list[a.at], b.list[b.at]] = [b.list[b.at], a.list[a.at]];
    pickedPlayer = '';
    renameFromSkips();
  }
  renderTeams();
}

function saveMadeTeams() {
  const teams = teamPreview.teams.map((team, i) => ({
    name: team.name.trim() || team.skip.name, skip: team.skip.name, third: team.third.name, second: team.second.name,
    lead: team.lead.name, seed: data.teams.length + i + 1,
  }));
  run(async () => {
    await post('addTeams', { bonspielId: data.bonspiel.id, teams });
    teamPreview = null;
  }, `${teams.length} ${teams.length === 1 ? 'team' : 'teams'} saved`);
}

function openTeam(team) {
  const dialog = $('#team-dialog');
  const field = (name, label, attrs = 'maxlength="40"') =>
    `<label>${label} <input name="${name}" value="${esc(team[name] ?? '')}" ${attrs} autocomplete="off"></label>`;
  const taken = playersOnTeams(team.id);
  // With players, each spot offers them in a list, and any other name can still be typed.
  const spot = ([name, label, position]) => (data.players.length
    ? `<label>${label} <input name="${name}" value="${esc(team[name] ?? '')}" maxlength="40" autocomplete="off" list="players-${name}" placeholder="Choose or type a name">
      <datalist id="players-${name}">${playerChoices(position, taken)}</datalist></label>`
    : field(name, label));
  dialog.innerHTML = `<form id="team-form">
    <header><h2>${team.id ? 'Edit team' : 'Add team'}</h2><button type="button" class="close" aria-label="Close">×</button></header>
    <input type="hidden" name="id" value="${esc(team.id || '')}">
    <div class="draw-fields two">
      ${field('name', 'Team name', 'maxlength="40" required')}
      ${field('club', 'Club', 'maxlength="60"')}
      ${TEAM_SPOTS.map(spot).join('')}
      <label>Seed <input type="number" name="seed" min="1" max="${MAX_TEAMS}" value="${team.seed || ''}"></label>
      <label>Pool <input name="pool" value="${esc(team.pool || '')}" maxlength="2"></label>
      <label>Logo <select name="logo">${logoOptions(logos, team.logo || '')}</select></label>
    </div>
    <footer><button type="submit" class="primary">Save team</button></footer>
  </form>`;
  dialog.showModal();
}

// ----- 4. Schedule

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
  teamPreview = null;
  load().catch((error) => toast(error.message));
});

$('#content').addEventListener('change', (event) => {
  if (event.target.dataset.position) savePositions(event.target.closest('tr'));
  if (['teamCount', 'includeWaiting'].includes(event.target.name)) {
    const count = Number($('[name=teamCount]').value) || 1;
    makePreview(event.target.name === 'teamCount' ? count : undefined, $('[name=includeWaiting]').checked);
    renderTeams();
  }
  if (event.target.name === 'source') {
    event.target.form.elements.ccmEvent.hidden = event.target.value !== 'ccm';
    if (event.target.value === 'ccm') loadCcmEvents();
  }
  if (event.target.name === 'ccmEvent' && !data?.bonspiel.id) {
    const option = event.target.selectedOptions[0];
    if (option?.value) {
      event.target.form.elements.name.value = option.dataset.name;
      if (option.dataset.date) event.target.form.elements.startDate.value = option.dataset.date;
    }
  }
  if (['format', 'trackEnds', 'scorePoints'].includes(event.target.name)) showFormatFields();
  if (event.target.name === 'gameType') applyGameType(event.target.form);
  if (event.target.name === 'standingsView') saveStandingsView(event.target.value);
  if (event.target.dataset.time !== undefined) preview[Number(event.target.dataset.time)].startsAt = event.target.value;
});

$('#content').addEventListener('input', (event) => {
  if (event.target.name !== 'madeName') return;
  const team = teamPreview.teams[Number(event.target.dataset.team)];
  team.name = event.target.value;
  team.named = true;
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
  const { action, open, team, removeTeam, slot, live, stopLive, editPlayer, removePlayer, pick } = button.dataset;
  if (action === 'make-teams' || action === 'shuffle-teams') {
    makePreview(teamPreview ? teamPreview.teams.length : undefined, teamPreview?.waiting || false);
    renderTeams();
  }
  if (action === 'discard-teams') {
    teamPreview = null;
    renderTeams();
  }
  if (action === 'save-teams') saveMadeTeams();
  if (pick) pickPreviewPlayer(pick);
  if (action === 'import-players') {
    toast('Getting the players from CCM…');
    let done = '';
    run(async () => { done = await importPlayers(data.bonspiel.id); }, () => done);
  }
  if (action === 'copy-emails') copyEmails();
  if (action === 'add-player') openPlayer({});
  if (editPlayer) openPlayer(data.players.find((player) => player.id === editPlayer));
  if (removePlayer && confirm('Delete this player?')) {
    run(() => post('deletePlayer', { id: removePlayer }), 'Player deleted');
  }
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
    $('#home-link').hidden = false;
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
  if (action === 'archive-bonspiel') {
    const archived = !data.bonspiel.archived;
    if (!archived || confirm(ARCHIVE_WARNING)) {
      run(() => post('archiveBonspiel', { id: data.bonspiel.id, archived }), archived ? 'Bonspiel archived' : 'Bonspiel back on the public page');
    }
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
  if (event.target.classList.contains('copied')) {
    $('#team-dialog').close();
    return;
  }
  if (event.target.getAttribute('id') === 'player-form') { // Not .id: the form's id input hides it.
    const values = Object.fromEntries(new FormData(event.target));
    const old = data.players.find((player) => player.id === values.id);
    const player = { ...values, bonspielId: data.bonspiel.id, positions: old?.positions || [] };
    $('#team-dialog').close();
    run(() => post('savePlayer', { player }), 'Player saved');
    return;
  }
  const team = { ...Object.fromEntries(new FormData(event.target)), bonspielId: data.bonspiel.id };
  $('#team-dialog').close();
  run(() => post('saveTeam', { team }), 'Team saved');
});

window.addEventListener('popstate', () => {
  step = 0;
  preview = null;
  teamPreview = null;
  load().catch((error) => toast(error.message));
});

async function start() {
  if (!configured) return notConfiguredNotice();
  await requirePin('admin', 'Bonspiel organiser');
  logos = await loadLogos();
  await load();
}

start().catch((error) => toast(error.message));
