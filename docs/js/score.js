// Score entry page: all four sheets, the draw timer, and end-by-end scoring.
import { drawTitle, hammerAt, hasTeams, MAX_POINTS, stoneOf, teamName, timerPhase, totals } from './core.js';
import { configured, post, serverNow, watch } from './api.js';
import { setupCast } from './cast.js';
import { endHeader, esc, HAMMER_ICON, lineColumns, notConfiguredNotice, paintClock, requirePin, stoneIcon, teamRow, toast, loadLogos } from './view.js';

const $ = (selector) => document.querySelector(selector);
let draw; // Undefined until the first reply, then null when no draw is live.
let openSheet = null;
let editIndex = null;

function renderTimer() {
  if (!draw) return;
  paintClock($('#clock'), draw, serverNow());
  const phase = timerPhase(draw, serverNow());
  const button = $('#timer-button');
  const labels = { ready: 'Start draw', running: 'Pause', paused: 'Resume' };
  button.hidden = phase === 'expired';
  button.textContent = labels[phase] || '';
  button.classList.toggle('primary', phase !== 'running');
}

function renderSheets() {
  $('#draw-name').textContent = draw ? drawTitle(draw) : 'No draw is live';
  $('#timer-bar').hidden = !draw?.showTimer;
  if (!draw) {
    $('#sheets').innerHTML = `<p class="empty">Set up a draw on the <a href="admin.html">admin page</a>.</p>`;
    return;
  }
  const columns = lineColumns(draw);
  document.documentElement.style.setProperty('--ends', columns);
  $('#sheets').innerHTML = draw.games.map((game) => {
    const status = game.final ? 'Final' : `End ${game.ends.length + 1}`;
    return `<button class="sheet ${hasTeams(game) ? '' : 'sheet-empty'}" data-sheet="${game.sheet}" type="button" ${hasTeams(game) ? '' : 'disabled'}>
      <span class="sheet-title"><b>Sheet ${game.sheet}</b><span>${hasTeams(game) ? status : 'No game'}</span></span>
      ${hasTeams(game) ? endHeader(columns, game) + teamRow(game, 0, columns) + teamRow(game, 1, columns) : ''}
    </button>`;
  }).join('');
}

const pointsGrid = (game, team) => `<div class="points" style="--team:var(--${stoneOf(game, team)})">
  ${Array.from({ length: MAX_POINTS }, (_, i) => `<button type="button" data-team="${team}" data-pts="${i + 1}">${i + 1}</button>`).join('')}
</div>`;

function renderDialog() {
  const dialog = $('#end-dialog');
  const game = draw?.games.find((g) => g.sheet === openSheet);
  if (!game) {
    if (dialog.open) dialog.close();
    return;
  }
  const index = editIndex ?? game.ends.length;
  const editing = index < game.ends.length;
  const [score1, score2] = totals(game);
  const scoringOpen = editing || !game.final;
  const was = editing ? describeEnd(game, game.ends[index]) : '';
  const column = (team) => `<section>
    <h3>${stoneIcon(stoneOf(game, team))} ${esc(teamName(game, team))}</h3>
    ${pointsGrid(game, team)}
  </section>`;
  const endChips = game.ends.map((end, i) => {
    const colour = end.team === null ? 'blank' : stoneOf(game, end.team);
    return `<button type="button" data-edit="${i}" class="chip chip-${colour}${i === index ? ' on' : ''}" aria-label="End ${i + 1}: ${esc(describeEnd(game, end))}"><small>${i + 1}</small>${end.team === null ? '–' : end.pts}</button>`;
  }).join('');

  dialog.innerHTML = `<form method="dialog">
    <header>
      <div>
        <h2>Sheet ${game.sheet} · ${editing ? `Correct end ${index + 1}` : game.final ? 'Final' : `End ${index + 1}`}</h2>
        <p>${esc(teamName(game, 0))} ${score1} – ${score2} ${esc(teamName(game, 1))}</p>
      </div>
      <button class="close" aria-label="Close">×</button>
    </header>
    ${scoringOpen ? `
      <p class="hammer-line">${HAMMER_ICON} ${esc(teamName(game, hammerAt(game, index)))} ${editing ? 'had' : 'has'} the hammer${was ? ` · recorded: ${esc(was)}` : ''}</p>
      <div class="score-columns">${column(0)}${column(1)}</div>
      <button type="button" class="wide" data-blank>Blank end (nobody scored)</button>` : ''}
    ${game.ends.length ? `<div class="chips"><span>Ends so far, tap to correct:</span>${endChips}${editing ? `<button type="button" class="chip" data-edit="">Back</button>` : ''}</div>` : ''}
    <footer>
      <button type="button" data-undo ${game.ends.length ? '' : 'disabled'}>Undo last end</button>
      <button type="button" data-swap>Swap hammer</button>
      <button type="button" data-final>${game.final ? 'Reopen game' : 'Finish game'}</button>
    </footer>
  </form>`;
  if (!dialog.open) dialog.showModal();
}

function describeEnd(game, end) {
  return end.team === null ? 'blank end' : `${teamName(game, end.team)} ${end.pts}`;
}

function render() {
  renderSheets();
  renderTimer();
  if (openSheet !== null) renderDialog();
}

function run(action, data) {
  post(action, data).catch((error) => {
    toast(`Not saved: ${error.message}`);
    render();
  });
}

function saveEnd(game, index, end) {
  game.ends[index] = end;
  if (end === null) game.ends.pop();
  editIndex = null;
  run('setEnd', { drawId: draw.id, sheet: game.sheet, index, end });
  if (end !== null) closeDialog(); else render();
}

function closeDialog() {
  openSheet = null;
  editIndex = null;
  $('#end-dialog').close();
  render();
}

$('#sheets').addEventListener('click', (event) => {
  const card = event.target.closest('[data-sheet]');
  if (!card) return;
  openSheet = Number(card.dataset.sheet);
  editIndex = null;
  renderDialog();
});

$('#end-dialog').addEventListener('click', (event) => {
  const game = draw.games.find((g) => g.sheet === openSheet);
  const button = event.target.closest('button');
  if (!button || !game) return;
  const data = button.dataset;
  const index = editIndex ?? game.ends.length;
  if (button.classList.contains('close')) {
    event.preventDefault();
    closeDialog();
  } else if (data.pts) {
    saveEnd(game, index, { team: Number(data.team), pts: Number(data.pts) });
  } else if ('blank' in data) {
    saveEnd(game, index, { team: null, pts: 0 });
  } else if ('edit' in data) {
    editIndex = data.edit === '' ? null : Number(data.edit);
    renderDialog();
  } else if ('undo' in data) {
    if (confirm(`Remove end ${game.ends.length} from Sheet ${game.sheet}?`)) saveEnd(game, game.ends.length - 1, null);
  } else if ('swap' in data) {
    game.hammer = game.hammer === 1 ? 0 : 1;
    run('swapHammer', { drawId: draw.id, sheet: game.sheet });
    render();
  } else if ('final' in data) {
    game.final = !game.final;
    run('setFinal', { drawId: draw.id, sheet: game.sheet, final: game.final });
    render();
  }
});

$('#end-dialog').addEventListener('close', () => {
  openSheet = null;
  editIndex = null;
});

$('#timer-button').addEventListener('click', () => {
  const running = timerPhase(draw, serverNow()) === 'running';
  if (running && !confirm('Pause the draw timer?')) return;
  const now = serverNow();
  if (running) {
    draw.leftMs -= now - draw.startedAt;
    draw.startedAt = 0;
  } else {
    draw.startedAt = now;
  }
  run('timer', { id: draw.id, op: running ? 'pause' : 'start' });
  render();
});

async function start() {
  if (!configured) return notConfiguredNotice();
  setupCast($('#cast-button'));
  await requirePin('score', 'Score entry');
  await loadLogos().catch(() => {});
  watch(
    (next) => {
      // Redrawing replaces the buttons, so only do it for a real change or a tap could be lost.
      if (JSON.stringify(next) === JSON.stringify(draw)) return;
      draw = next;
      render();
    },
    (online) => $('#offline').toggleAttribute('hidden', online),
  );
  setInterval(renderTimer, 500);
}

start();
