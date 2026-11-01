// Public event page: schedule, live and final scores, standings, brackets and teams. No PIN.
// With ?tv=1 it fills a TV and moves through its tabs by itself.
import { configured, get } from './api.js';
import { FORMATS } from './bonspiel.js';
import { bracketHtml, scheduleHtml, standingsHtml, teamsHtml } from './bonspiel-view.js';
import { hasTeams } from './core.js';
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
  return ['Schedule', ...(usesStandings() ? ['Standings'] : []), ...(usesBracket() ? ['Bracket'] : []), 'Teams'];
}

// The saved schedule if there is one, otherwise the hand-made draws linked to this bonspiel.
function scheduleDraws() {
  if (data.draws.length) return data.draws;
  const when = (draw) => draw.startsAt || draw.date;
  return data.linkedDraws.filter((draw) => draw.games.some(hasTeams)).sort((a, b) => when(a).localeCompare(when(b)));
}

function body() {
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
  $('#content').innerHTML = `<section class="panel"><h2>Bonspiels</h2>${bonspiels.length ? `<div class="draw-list">${bonspiels.map((item) => `<article class="draw-card">
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

$('#tabs').addEventListener('click', (event) => {
  if (!event.target.dataset.tab) return;
  tab = event.target.dataset.tab;
  render();
});

async function start() {
  if (!configured) return notConfiguredNotice();
  await loadLogos().catch(() => {});
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    const { bonspiels } = await get('bonspiels');
    if (bonspiels.length !== 1) return renderList(bonspiels);
    return location.replace(`event.html?id=${bonspiels[0].id}`);
  }
  const onTv = new URLSearchParams(location.search).has('tv');
  document.body.classList.toggle('event-tv', onTv);
  await refresh(id);
  setInterval(() => refresh(id), POLL_MS);
  if (onTv) rotateTabs();
}

start().catch((error) => toast(error.message));
