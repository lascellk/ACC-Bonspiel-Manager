// HTML pieces shared by the score entry, admin and TV pages.
import { currentHammer, endColumns, formatClock, stoneOf, teamLogo, teamName, timeLeft, timerPhase, totals, WARNING_MS } from './core.js';
import { get, getPin, post, setPin } from './api.js';

export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const HAMMER_ICON = `<svg class="hammer" viewBox="0 0 24 24" role="img" aria-label="Hammer"><path fill="currentColor" d="M3 5h11l3 3v3h-4l-1-1H9v2H6v-2H3zM7 12h4v9H7z"/></svg>`;

export const stoneIcon = (colour) => `<span class="stone stone-${colour}" title="${colour} stones"></span>`;

let logos = {};
export async function loadLogos() {
  const result = await get('logos');
  logos = Object.fromEntries(result.logos.map((logo) => [logo.id, logo]));
  return result.logos;
}

export const logoOptions = (list, selected) => `<option value="">Initials</option>
  <option value="acc" ${selected === 'acc' ? 'selected' : ''}>ACC crest</option>
  ${list.map((logo) => `<option value="${esc(logo.id)}" ${selected === logo.id ? 'selected' : ''}>${esc(logo.name)}</option>`).join('')}`;

export function logoHtml(ref, name) {
  const src = ref === 'acc' ? 'assets/crest.png' : logos[ref]?.data;
  if (src) return `<img class="logo" src="${esc(src)}" alt="">`;
  const letters = name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="logo logo-text" aria-hidden="true">${esc(letters)}</span>`;
}

// A line score shows each end's points in the row of the team that scored.
function endCell(game, team, column, current) {
  const end = game.ends[column];
  const isCurrent = column === current ? ' current' : '';
  const scored = end && end.team === team;
  const blank = end && end.team === null;
  const text = scored ? end.pts : blank ? '–' : '';
  return `<span class="end${isCurrent}${scored ? ' scored' : ''}">${text}</span>`;
}

export function teamRow(game, team, columns) {
  const name = teamName(game, team);
  const current = game.final ? -1 : game.ends.length;
  const hasHammer = !game.final && currentHammer(game) === team;
  const cells = Array.from({ length: columns }, (_, column) => endCell(game, team, column, current)).join('');
  return `<div class="team team-${stoneOf(game, team)}">
    ${stoneIcon(stoneOf(game, team))}
    ${logoHtml(teamLogo(game, team), name)}
    <span class="team-name">${esc(name)}</span>
    <span class="hammer-slot">${hasHammer ? HAMMER_ICON : ''}</span>
    ${cells}
    <span class="total">${totals(game)[team]}</span>
  </div>`;
}

export function endHeader(columns, game) {
  const current = game.final ? -1 : game.ends.length;
  const cells = Array.from({ length: columns }, (_, i) => `<span class="end${i === current ? ' current' : ''}">${i + 1}</span>`).join('');
  return `<div class="team head"><span class="head-label"></span>${cells}<span class="total">T</span></div>`;
}

export const lineColumns = (draw) => endColumns(draw);

export function paintClock(element, draw, now) {
  const left = timeLeft(draw, now);
  const phase = timerPhase(draw, now);
  element.textContent = phase === 'expired' ? 'TIME' : formatClock(left);
  element.dataset.phase = phase;
  element.classList.toggle('warning', phase !== 'expired' && left <= WARNING_MS);
}

export function toast(message) {
  let box = document.querySelector('.toast');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(box.timer);
  box.timer = setTimeout(() => box.classList.remove('show'), 4000);
}

// Resolves once a PIN of the needed role is held, asking for one if the saved PIN won't do.
export async function requirePin(role, title) {
  const accepted = async () => {
    if (!getPin()) return false;
    const result = await post('login');
    return role === 'score' || result.role === 'admin';
  };
  try {
    if (await accepted()) return;
  } catch (error) {
    if (error.message !== 'Wrong PIN') toast(error.message);
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'pin-dialog';
  dialog.innerHTML = `<form method="dialog">
    <img src="assets/crest.png" alt="" width="72" height="72">
    <h1>${esc(title)}</h1>
    <label>PIN <input type="password" inputmode="numeric" autocomplete="off" required></label>
    <p class="pin-error" role="alert"></p>
    <button class="primary" type="submit">Continue</button>
  </form>`;
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      setPin(dialog.querySelector('input').value.trim());
      let message = 'That PIN cannot open this page.';
      try {
        if (await accepted()) {
          dialog.close();
          dialog.remove();
          resolve();
          return;
        }
      } catch (error) {
        message = error.message;
      }
      setPin('');
      dialog.querySelector('.pin-error').textContent = message;
    });
  });
}

export function notConfiguredNotice() {
  document.body.innerHTML = `<main class="notice"><h1>Bonspiel Manager isn't connected yet</h1>
    <p>Add the Apps Script address to <code>js/config.js</code>. The README has the steps.</p></main>`;
}
