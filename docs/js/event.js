// Public event page: schedule, live and final scores, standings, brackets and teams. No PIN.
import { configured, get } from './api.js';
import { FORMATS } from './bonspiel.js';
import { bracketHtml, scheduleHtml, standingsHtml, teamsHtml } from './bonspiel-view.js';
import { esc, loadLogos, notConfiguredNotice, toast } from './view.js';

const $ = (selector) => document.querySelector(selector);
const POLL_MS = 20000;
let data = null;
let liveId = '';
let tab = 'Schedule';
let shown = '';

const usesBracket = () => data.draws.some((draw) => draw.games.some((game) => game.bracket));
const usesStandings = () => ['pools', 'fixed'].includes(data.bonspiel.format);

function tabs() {
  return ['Schedule', ...(usesStandings() ? ['Standings'] : []), ...(usesBracket() ? ['Bracket'] : []), 'Teams'];
}

function body() {
  if (tab === 'Standings') return standingsHtml(data);
  if (tab === 'Bracket') return bracketHtml(data.draws);
  if (tab === 'Teams') return teamsHtml(data.teams);
  return scheduleHtml(data.draws, liveId);
}

function render() {
  const available = tabs();
  if (!available.includes(tab)) [tab] = available;
  $('#tabs').hidden = false;
  $('#tabs').innerHTML = available.map((name) => `<button type="button" data-tab="${name}" class="${name === tab ? 'on' : ''}">${name}</button>`).join('');
  $('#content').innerHTML = `<section class="panel"><h2>${esc(tab)}</h2>${body()}</section>`;
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
    const next = JSON.stringify([result.bonspiel, result.teams, result.draws, result.draw?.id]);
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
  await refresh(id);
  setInterval(() => refresh(id), POLL_MS);
}

start().catch((error) => toast(error.message));
