// Admin page: create and edit draws, choose the live draw, manage logos, adjust the timer.
import { configured, get, post, serverNow, watch } from './api.js';
import { setupCast } from './cast.js';
import { esc, loadLogos, logoOptions, notConfiguredNotice, paintClock, requirePin, STOP_LIVE_WARNING, toast } from './view.js';

const $ = (selector) => document.querySelector(selector);
const LOGO_SIZE = 160;
const MAX_LOGO_CHARS = 45000; // Matches the limit in Code.gs.
let draws = [];
let liveId = '';
let logos = [];
let live = null;
let editing = null;

const blankGame = (sheet) => ({ sheet, team1: '', team2: '', logo1: '', logo2: '', stone: 'red', hammer: 0 });
const blankDraw = () => ({
  id: '', name: `Draw ${draws.length + 1}`, date: new Date().toLocaleDateString('en-CA'), ends: 8, minutes: 95, showTimer: true,
  games: [1, 2, 3, 4].map(blankGame),
});

async function refresh() {
  const result = await get('draws');
  draws = result.draws;
  liveId = result.liveId;
  renderDraws();
}

function matchup(game) {
  return game.team1 || game.team2 ? `${esc(game.team1 || 'TBD')} v ${esc(game.team2 || 'TBD')}` : '—';
}

function renderDraws() {
  $('#draw-list').innerHTML = draws.length ? draws.map((draw) => `<article class="draw-card ${draw.id === liveId ? 'is-live' : ''}">
    <header>
      <div><h3>${esc(draw.name)}${draw.id === liveId ? ' <span class="badge">Live</span>' : ''}</h3>
      <p>${esc(draw.date)} · ${draw.ends} ends · ${draw.minutes} min${draw.showTimer ? '' : ' (timer hidden)'}</p></div>
    </header>
    <ol>${draw.games.map((game) => `<li>${matchup(game)}</li>`).join('')}</ol>
    <footer>
      <button type="button" data-edit="${draw.id}">Edit</button>
      ${draw.id === liveId ? '<button type="button" data-stop-live="true">Take off live</button>' : `<button type="button" class="primary" data-live="${draw.id}">Make live</button>`}
      ${draw.bonspielId ? '' : `<button type="button" class="danger" data-delete="${draw.id}">Delete</button>`}
    </footer>
  </article>`).join('') : '<p class="empty">No draws yet. Create the first one.</p>';
}

function gameFields(game) {
  const s = game.sheet;
  // Bonspiel games take their teams from the schedule, so they can only be read here.
  const fixed = game.gameId ? 'disabled' : '';
  const team = (n) => `<div class="team-fields">
    <label>Team ${n} name <input name="team${n}-${s}" value="${esc(game[`team${n}`])}" maxlength="40" autocomplete="off" ${fixed}></label>
    <label>Logo <select name="logo${n}-${s}" ${fixed}>${logoOptions(logos, game[`logo${n}`])}</select></label>
  </div>`;
  return `<fieldset class="game-fields">
    <legend>Sheet ${s}</legend>
    ${team(1)}${team(2)}
    <div class="choice-row">
      <span class="choice"><b>Team 1 stones</b>
        <label><input type="radio" name="stone-${s}" value="red" ${game.stone !== 'blue' ? 'checked' : ''}> Red</label>
        <label><input type="radio" name="stone-${s}" value="blue" ${game.stone === 'blue' ? 'checked' : ''}> Blue</label>
      </span>
      <span class="choice"><b>Hammer, end 1</b>
        <label><input type="radio" name="hammer-${s}" value="0" ${game.hammer !== 1 ? 'checked' : ''}> Team 1</label>
        <label><input type="radio" name="hammer-${s}" value="1" ${game.hammer === 1 ? 'checked' : ''}> Team 2</label>
      </span>
    </div>
  </fieldset>`;
}

function openEditor(draw) {
  editing = draw;
  const dialog = $('#draw-dialog');
  dialog.innerHTML = `<form id="draw-form">
    <header><h2>${draw.id ? 'Edit draw' : 'New draw'}</h2><button type="button" class="close" aria-label="Close">×</button></header>
    <div class="draw-fields">
      <label class="grow">Draw name <input name="name" value="${esc(draw.name)}" maxlength="60" required></label>
      <label>Date <input type="date" name="date" value="${esc(draw.date)}"></label>
      <label>Ends <input type="number" name="ends" min="1" max="12" value="${draw.ends}" required></label>
      <label>Timer (minutes) <input type="number" name="minutes" min="1" max="600" value="${draw.minutes}" required></label>
      <label class="check"><input type="checkbox" name="showTimer" ${draw.showTimer ? 'checked' : ''}> Show timer</label>
    </div>
    ${draw.games.map(gameFields).join('')}
    <footer><button type="submit" class="primary">Save draw</button></footer>
  </form>`;
  dialog.showModal();
}

function readEditor(form) {
  const data = new FormData(form);
  return {
    id: editing.id,
    name: data.get('name'),
    date: data.get('date'),
    ends: Number(data.get('ends')),
    minutes: Number(data.get('minutes')),
    showTimer: data.has('showTimer'),
    games: [1, 2, 3, 4].map((sheet) => ({
      sheet,
      team1: data.get(`team1-${sheet}`),
      team2: data.get(`team2-${sheet}`),
      logo1: data.get(`logo1-${sheet}`),
      logo2: data.get(`logo2-${sheet}`),
      stone: data.get(`stone-${sheet}`),
      hammer: Number(data.get(`hammer-${sheet}`)),
    })),
  };
}

async function run(work, done) {
  try {
    await work();
    if (done) toast(done);
    await refresh();
  } catch (error) {
    toast(error.message);
  }
}

function renderLogos() {
  $('#logo-list').innerHTML = logos.map((logo) => `<li>
    <img class="logo" src="${esc(logo.data)}" alt="">
    <span>${esc(logo.name)}</span>
    <button type="button" data-rename="${esc(logo.id)}">Rename</button>
    <button type="button" class="danger" data-logo="${esc(logo.id)}">Delete</button>
  </li>`).join('') || '<li class="empty">No logos added. The ACC crest is always available.</li>';
}

// Logos are shrunk in the browser so each one fits in a single Sheet cell.
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  if (png.length <= MAX_LOGO_CHARS) return png;
  // Photos are too big as PNG. JPEG has no transparency, so give them a white backing.
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function renderLive() {
  $('#timer-panel').hidden = !live;
  if (live) $('#timer-draw').textContent = live.name;
}

$('#new-draw').addEventListener('click', () => openEditor(blankDraw()));

$('#draw-list').addEventListener('click', (event) => {
  const { edit, live: makeLive, stopLive, delete: remove } = event.target.dataset;
  if (edit) openEditor(structuredClone(draws.find((draw) => draw.id === edit)));
  if (makeLive) run(() => post('goLive', { id: makeLive }), 'Draw is live');
  if (stopLive && confirm(STOP_LIVE_WARNING)) run(() => post('stopLive'), 'Draw taken off live');
  if (remove && confirm('Delete this draw and all its scores?')) run(() => post('deleteDraw', { id: remove }), 'Draw deleted');
});

$('#draw-dialog').addEventListener('click', (event) => {
  if (event.target.classList.contains('close')) $('#draw-dialog').close();
});

$('#draw-dialog').addEventListener('submit', (event) => {
  event.preventDefault();
  const draw = readEditor(event.target);
  $('#draw-dialog').close();
  run(() => post('saveDraw', { draw }), 'Draw saved');
});

$('#logo-file').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  const name = prompt('Club name for this logo', file.name.replace(/\.[^.]+$/, ''));
  if (name === null) return;
  try {
    const data = await shrinkImage(file);
    await post('saveLogo', { name, data });
    logos = await loadLogos();
    renderLogos();
    toast('Logo added');
  } catch (error) {
    toast(`Logo not added: ${error.message}`);
  }
});

$('#logo-list').addEventListener('click', async (event) => {
  const { logo: id, rename } = event.target.dataset;
  const name = rename && prompt('Club name for this logo', logos.find((logo) => logo.id === rename).name);
  if (rename && !name) return;
  if (id && !confirm('Delete this logo? Teams using it will show their initials.')) return;
  if (!id && !rename) return;
  try {
    await (rename ? post('renameLogo', { id: rename, name }) : post('deleteLogo', { id }));
    logos = await loadLogos();
    renderLogos();
  } catch (error) {
    toast(error.message);
  }
});

$('#timer-panel').addEventListener('click', (event) => {
  const { minutes, op } = event.target.dataset;
  if (minutes) run(() => post('timer', { id: live.id, op: 'adjust', ms: Number(minutes) * 60000 }));
  if (op === 'reset' && confirm('Stop the timer and put it back to the full time?')) run(() => post('timer', { id: live.id, op }));
});

async function start() {
  if (!configured) return notConfiguredNotice();
  setupCast($('#cast-button'));
  await requirePin('admin', 'Scoreboard admin');
  logos = await loadLogos();
  renderLogos();
  await refresh();
  watch((next) => {
    live = next;
    renderLive();
  });
  setInterval(() => {
    if (live) paintClock($('#admin-clock'), live, serverNow());
  }, 500);
}

start();
