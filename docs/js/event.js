// Public event page: schedule, live and final scores, standings, brackets and teams. No PIN.
// With ?tv=1 it fills a TV and moves through its tabs by itself.
import { configured, get } from './api.js';
import { currentBonspiel, drawResults, FORMATS } from './bonspiel.js';
import { bracketHtml, linkedSchedule, scheduleHtml, standingsHtml, teamsHtml } from './bonspiel-view.js';
import { esc, loadLogos, notConfiguredNotice, toast } from './view.js';

const $ = (selector) => document.querySelector(selector);
const POLL_MS = 20000;
const TAB_MS = 12000;
const SCROLL_STEP_MS = 40;
const SCROLL_STEP_PX = 1.5;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let data = null;
let liveId = '';
let tab = 'Schedule';
let shown = '';

const usesBracket = () => data.draws.some((draw) => draw.games.some((game) => game.bracket));
const usesStandings = () => ['pools', 'fixed'].includes(data.bonspiel.format);

function tabs() {
  if (data.adHoc) return ['Results', 'Scores'];
  return ['Schedule', ...(usesStandings() ? ['Standings'] : []), ...(usesBracket() ? ['Bracket'] : []), 'Teams'];
}

// The saved schedule if there is one, otherwise the hand-made draws linked to this bonspiel.
function scheduleDraws() {
  return data.draws.length ? data.draws : linkedSchedule(data.linkedDraws);
}

function body() {
  if (tab === 'Results') return standingsHtml(data);
  if (tab === 'Scores') return scheduleHtml(data.linkedDraws, liveId);
  if (tab === 'Standings') return standingsHtml(data);
  if (tab === 'Bracket') return bracketHtml(data.draws);
  if (tab === 'Teams') return teamsHtml(data.teams);
  return scheduleHtml(scheduleDraws(), liveId);
}

function render() {
  const available = tabs();
  if (!available.includes(tab)) [tab] = available;
  $('#tabs').hidden = false;
  $('#tabs').innerHTML = available.map((name) => `<button type="button" data-tab="${name}" class="${name === tab ? 'on' : ''}">${name}</button>`).join('');
  $('#content').innerHTML = `<section class="panel"><h2>${esc(tab)}</h2>${body()}</section>`;
}

// Slowly shows anything too long for the screen. True if there was anything to scroll.
async function scrollToEnd(box) {
  let position = 0;
  while (position < box.scrollHeight - box.clientHeight) {
    position += SCROLL_STEP_PX;
    box.scrollTop = position;
    await wait(SCROLL_STEP_MS);
  }
  return position > 0;
}

async function rotateTabs() {
  const box = $('#content');
  for (;;) {
    await wait(TAB_MS);
    if (!data) continue;
    if (await scrollToEnd(box)) await wait(TAB_MS / 2);
    const available = tabs();
    tab = available[(available.indexOf(tab) + 1) % available.length];
    render();
    box.scrollTop = 0;
  }
}

function renderList(bonspiels) {
  const newestFirst = [...bonspiels].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  $('#content').innerHTML = `<section class="panel"><h2>Bonspiels</h2>${bonspiels.length ? `<div class="draw-list">${newestFirst.map((item) => `<article class="draw-card">
    <h3><a href="event.html?id=${esc(item.id)}">${esc(item.name)}</a></h3>
    <p>${esc(item.startDate)} · ${esc(FORMATS[item.format] || '')}</p>
  </article>`).join('')}</div>` : '<p class="empty">No bonspiels yet.</p>'}</section>`;
}

async function refresh(id) {
  if (document.visibilityState === 'hidden') return;
  try {
    const result = await get('bonspiel', { id });
    $('#offline').hidden = true;
    const next = JSON.stringify([result.bonspiel, result.teams, result.draws, result.linkedDraws, result.draw?.id]);
    if (next === shown) return;
    shown = next;
    data = result;
    liveId = result.draw?.id || '';
    $('#event-title').textContent = data.bonspiel.name;
    document.title = data.bonspiel.name;
    render();
  } catch {
    $('#offline').hidden = false;
  }
}

// An ad-hoc draw's results (?draw=<id>): a table ranked by the draw's own points, and its scores.
async function refreshDraw(id) {
  if (document.visibilityState === 'hidden') return;
  try {
    const result = await get('draws');
    $('#offline').hidden = true;
    const found = result.draws.find((item) => item.id === id);
    const next = JSON.stringify([found, result.liveId]);
    if (next === shown) return;
    shown = next;
    if (!found) {
      data = null;
      $('#tabs').hidden = true;
      $('#content').innerHTML = '<section class="panel"><p class="empty">This draw no longer exists.</p></section>';
      return;
    }
    data = { ...drawResults(found), adHoc: true };
    liveId = result.liveId;
    $('#event-title').textContent = `${found.name} results`;
    document.title = `${found.name} results`;
    render();
  } catch {
    $('#offline').hidden = false;
  }
}

$('#tabs').addEventListener('click', (event) => {
  if (!event.target.dataset.tab) return;
  tab = event.target.dataset.tab;
  render();
});

async function start() {
  if (!configured) return notConfiguredNotice();
  await loadLogos().catch(() => {});
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const drawId = params.get('draw');
  if (drawId) {
    document.body.classList.toggle('event-tv', params.has('tv'));
    await refreshDraw(drawId);
    setInterval(() => refreshDraw(drawId), POLL_MS);
    if (params.has('tv')) rotateTabs();
    return;
  }
  if (!id) {
    // The table sign links here with no id: open the bonspiel that's on. ?list=1 shows them all.
    const [{ bonspiels }, live] = await Promise.all([get('bonspiels'), get()]);
    const current = params.has('list') ? null : currentBonspiel(bonspiels, live.draw, new Date().toLocaleDateString('en-CA'));
    if (!current) return renderList(bonspiels);
    return location.replace(`event.html?id=${current.id}`);
  }
  const onTv = params.has('tv');
  document.body.classList.toggle('event-tv', onTv);
  $('#all-link').hidden = onTv;
  await refresh(id);
  setInterval(() => refresh(id), POLL_MS);
  if (onTv) rotateTabs();
}

start().catch((error) => toast(error.message));
