// TV page. Opened with ?cast=1 it runs as the Google Cast receiver; otherwise it is a plain web page.
import { drawTitle, hasTeams } from './core.js';
import { configured, serverNow, watch } from './api.js';
import { endHeader, lineColumns, loadLogos, paintClock, teamRow } from './view.js';

const $ = (selector) => document.querySelector(selector);
const LOGO_REFRESH_MS = 5 * 60000;
let draw = null;
let shown = '';
let eventId = '';

// The Cast receiver has to stay on this page, so the bonspiel page opens in a frame over the scoreboard.
function showEvent(id) {
  if (id === eventId) return;
  eventId = id;
  const frame = $('#tv-event');
  frame.hidden = !id;
  frame.src = id ? `event.html?id=${encodeURIComponent(id)}&tv=1` : 'about:blank';
}

function sheetHtml(game, columns) {
  const label = `<div class="tv-label"><small>Sheet</small><b>${game.sheet}</b></div>`;
  if (!hasTeams(game)) return `<section class="tv-sheet tv-empty">${label}<div class="tv-lines"><span>No game</span></div></section>`;
  const status = game.final ? 'Final' : `End ${game.ends.length + 1}`;
  return `<section class="tv-sheet ${game.final ? 'tv-final' : ''}">${label}
    <div class="tv-lines">
      ${endHeader(columns, game).replace('<span class="head-label"></span>', `<span class="head-label">${status}</span>`)}
      ${teamRow(game, 0, columns)}
      ${teamRow(game, 1, columns)}
    </div>
  </section>`;
}

function render() {
  const next = JSON.stringify(draw);
  if (next === shown) return;
  shown = next;
  $('#tv-title').textContent = draw ? drawTitle(draw) : 'Almonte Curling Club';
  $('#tv-clock').hidden = !draw?.showTimer;
  if (!draw) {
    $('#tv-sheets').innerHTML = '<p class="tv-idle">Next draw coming up</p>';
    return;
  }
  const columns = lineColumns(draw);
  document.documentElement.style.setProperty('--ends', columns);
  $('#tv-sheets').innerHTML = draw.games.map((game) => sheetHtml(game, columns)).join('');
}

function startReceiver() {
  const script = document.createElement('script');
  script.src = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
  script.onload = () => {
    const options = new cast.framework.CastReceiverOptions();
    options.disableIdleTimeout = true; // Keep showing after the phone that started it leaves.
    cast.framework.CastReceiverContext.getInstance().start(options);
  };
  document.head.append(script);
}

async function start() {
  if (new URLSearchParams(location.search).has('cast')) startReceiver();
  if (!configured) {
    $('#tv-sheets').innerHTML = '<p class="tv-idle">Scoreboard isn\'t connected yet</p>';
    return;
  }
  await loadLogos().catch(() => {});
  setInterval(() => loadLogos().then(() => { shown = ''; render(); }).catch(() => {}), LOGO_REFRESH_MS);
  watch(
    (next, { tv }) => {
      draw = next;
      render();
      showEvent(tv || '');
    },
    (online) => $('#tv-offline').toggleAttribute('hidden', online),
  );
  setInterval(() => {
    if (draw) paintClock($('#tv-clock'), draw, serverNow());
  }, 250);
}

start();
