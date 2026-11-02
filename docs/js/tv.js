// TV page. Opened with ?cast=1 it runs as the Google Cast receiver; otherwise it is a plain web page.
import { drawTitle, hasTeams, spinResult, teamName, wheelSeconds, wheelSlices, wheelStop } from './core.js';
import { configured, serverNow, watch } from './api.js';
import { endHeader, esc, lineColumns, loadLogos, paintClock, teamRow } from './view.js';

const $ = (selector) => document.querySelector(selector);
const LOGO_REFRESH_MS = 5 * 60000;
const WHEEL_TURNS = 6;
const WHEEL_NAME = 15; // Characters that fit along a slice.
let draw = null;
let shown = '';
let eventId = '';
let wheelsShown = '';
let wheelRound = 0;

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

function sliceHtml(slice, index, slices, game) {
  const size = 360 / slices.length;
  const point = (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return `${(100 * Math.sin(radians)).toFixed(2)} ${(-100 * Math.cos(radians)).toFixed(2)}`;
  };
  const name = teamName(game, slice.team);
  const label = name.length > WHEEL_NAME ? `${name.slice(0, WHEEL_NAME - 1)}…` : name;
  return `<g class="slice-${slice.colour || `team${slice.team}`}">
    <path d="M0 0L${point(index * size)}A100 100 0 0 1 ${point((index + 1) * size)}Z"/>
    <text transform="rotate(${(index + 0.5) * size - 90})" x="86" text-anchor="end" dominant-baseline="central">${esc(label)}</text>
  </g>`;
}

function wheelHtml(spin, game) {
  const heading = `<h2>Sheet ${game.sheet}</h2>`;
  if (!game.open) return `<article class="spin-sheet spin-off">${heading}<div class="wheel"><p>${game.team1 && game.team2 ? 'Already started' : 'No game'}</p></div></article>`;
  const slices = wheelSlices(spin.colour);
  return `<article class="spin-sheet">${heading}
    <div class="wheel"><span class="wheel-pointer"></span>
      <div class="wheel-turn" data-sheet="${game.sheet}"><svg viewBox="-101 -101 202 202" aria-hidden="true">${slices.map((slice, index) => sliceHtml(slice, index, slices, game)).join('')}<circle r="11"/></svg></div>
    </div>
    <p class="spin-result" data-result="${game.sheet}"></p>
  </article>`;
}

// A wheel that was already on screen spins to its result. One drawn fresh, after a reload, just shows it.
function landWheels(spin, animate) {
  const slices = wheelSlices(spin.colour);
  spin.games.filter((game) => game.open).forEach((game) => {
    const wheel = $(`[data-sheet="${game.sheet}"]`);
    const result = $(`[data-result="${game.sheet}"]`);
    const stop = wheelStop(slices, game, spin.round);
    const seconds = wheelSeconds(game.sheet);
    const angle = animate ? (Math.ceil(Number(wheel.dataset.angle || 0) / 360) + WHEEL_TURNS + game.sheet) * 360 + stop : stop;
    wheel.dataset.angle = angle;
    wheel.style.transition = animate ? `transform ${seconds}s cubic-bezier(.12, .7, .1, 1)` : 'none';
    wheel.style.transform = `rotate(${angle}deg)`;
    result.textContent = animate ? '' : spinResult(spin, game);
    if (animate) setTimeout(() => { result.textContent = spinResult(spin, game); }, seconds * 1000);
  });
}

function showWheels(spin) {
  const box = $('#tv-spin');
  box.hidden = !spin;
  if (!spin) {
    wheelsShown = '';
    wheelRound = 0;
    return;
  }
  const next = JSON.stringify([spin.drawId, spin.hammer, spin.colour, spin.games.map((game) => [game.sheet, game.team1, game.team2, game.open])]);
  const fresh = next !== wheelsShown || spin.round < wheelRound;
  if (fresh) {
    wheelsShown = next;
    const choice = [spin.hammer && 'Hammer', spin.colour && 'Colour'].filter(Boolean).join(' and ');
    box.innerHTML = `<h1>${esc(spin.name)}${choice ? ` · ${choice}` : ''}</h1><div class="spin-wheels">${spin.games.map((game) => wheelHtml(spin, game)).join('')}</div>`;
  }
  if (spin.round && (fresh || spin.round !== wheelRound)) landWheels(spin, !fresh);
  wheelRound = spin.round;
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
    (next, { tv, spin }) => {
      draw = next;
      render();
      showEvent(tv || '');
      showWheels(spin);
    },
    (online) => $('#tv-offline').toggleAttribute('hidden', online),
  );
  setInterval(() => {
    if (draw) paintClock($('#tv-clock'), draw, serverNow());
  }, 250);
}

start();
