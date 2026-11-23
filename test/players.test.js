import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend } from '../dev/gas-fake.js';

const admin = (api, body) => api.post({ pin: '1234', ...body });
const scorer = (api, body) => api.post({ pin: '0000', ...body });
const settings = { ends: 8, minutes: 95 };
const HEAD = ['ID', 'Event ID', 'Event', 'Event Date', 'First Name', 'Last Name', 'Email', 'Draw Time', 'Notes to the Club',
  'Preferred Position', 'Payment Status'];
const row = (id, event, first, status = 'Paid', extra = {}) => HEAD.map((name) => ({
  ID: id, 'Event ID': event, Event: event === '190' ? '2026-27 Turkey Spiel ' : 'Other  event', 'Event Date': '11-21-2026 9:00 am',
  'First Name': first, 'Last Name': 'Player', Email: `${first.toLowerCase()}@example.com`, 'Payment Status': status, ...extra,
}[name] ?? ''));

// Replaces the admin site download with these export rows, and counts the downloads.
function withExport(api, rows) {
  const calls = { count: 0 };
  api.context.ccmRegistrants = () => {
    calls.count += 1;
    return api.context.registrantsFromRows([HEAD, ...rows]);
  };
  return calls;
}

function linked(api) {
  const event = { id: '190', name: '2026-27 Turkey Spiel', date: '2026-11-21' };
  return admin(api, { action: 'saveBonspiel', bonspiel: { name: 'Turkey', startDate: '2026-11-21', format: 'pools', settings, ccmEvent: event } }).id;
}

test('the export is read into players, with dates, names and preferred positions', () => {
  const api = loadBackend();
  const regs = api.context.registrantsFromRows([HEAD, row('1', '190', 'Ann', 'Paid', { 'Preferred Position': 'Mate', 'Draw Time': 'Late Draw' })]);
  assert.deepEqual(JSON.parse(JSON.stringify(regs[0])), {
    id: '1', eventId: '190', event: '2026-27 Turkey Spiel', eventDate: '2026-11-21', name: 'Ann Player',
    email: 'ann@example.com', status: 'Paid', drawTime: 'Late Draw', notes: '', positions: ['vice'],
  });
  assert.throws(() => api.context.registrantsFromRows([['ID', 'Event'], ['1', 'x']]), /no Event ID column/);
});

test('CCM events are from this season, newest first, counting players who have not cancelled', () => {
  const api = loadBackend();
  const on = (date) => ({ 'Event Date': date });
  const regs = api.context.registrantsFromRows([HEAD, row('1', '190', 'Ann'), row('2', '190', 'Bob', 'Cancelled'),
    row('3', '150', 'Cy', 'Paid', on('05-30-2027 9:00 am')), row('4', '120', 'Di', 'Paid', on('06-01-2026 9:00 am')),
    row('5', '100', 'Ed', 'Paid', on('05-31-2026 9:00 am')), row('6', '200', 'Fy', 'Paid', on('06-01-2027 9:00 am'))]);
  const events = JSON.parse(JSON.stringify(api.context.ccmEventsIn(regs, '2026-11-23'))); // Out of the backend's sandbox.
  assert.deepEqual(events.events.map((event) => [event.id, event.players]), [['150', 1], ['190', 1], ['120', 1]]);
  assert.equal(events.events[1].name, '2026-27 Turkey Spiel');
  // In May the season is still the one that started the June before.
  assert.deepEqual([...api.context.ccmEventsIn(regs, '2027-05-31').events.map((event) => event.id)], ['150', '190', '120']);
  withExport(api, [row('1', '190', 'Ann')]);
  assert.equal(scorer(api, { action: 'ccmEvents' }).ok, false);
});

test('importing adds, updates and removes CCM players, keeping ticked positions and hand-added players', () => {
  const api = loadBackend();
  const id = linked(api);
  assert.equal(api.get({ action: 'bonspiel', id }).bonspiel.ccmEvent.id, '190');
  withExport(api, [row('1', '190', 'Ann'), row('2', '190', 'Bob', 'Pending'), row('3', '190', 'Cy', 'Cancelled'), row('4', '150', 'Di')]);
  const first = admin(api, { action: 'importPlayers', id });
  assert.equal(first.ok, true, first.error);
  assert.deepEqual([first.added, first.updated, first.removed], [2, 0, 0]);
  assert.deepEqual(first.players.map((player) => player.name), ['Ann Player', 'Bob Player']);

  const bob = first.players[1];
  admin(api, { action: 'savePlayer', player: { id: bob.id, bonspielId: id, name: 'Changed', positions: ['lead', 'skip', 'nope'] } });
  admin(api, { action: 'savePlayer', player: { bonspielId: id, name: ' Eve ', email: 'eve@example.com', positions: ['second'] } });

  withExport(api, [row('2', '190', 'Bob', 'Paid'), row('5', '190', 'Fay', 'Waiting List')]);
  const again = admin(api, { action: 'importPlayers', id });
  assert.deepEqual([again.added, again.updated, again.removed], [1, 1, 1]);
  const players = admin(api, { action: 'players', id }).players;
  assert.deepEqual(players.map((player) => [player.name, player.status, player.positions.join(' ')]).sort(), [
    ['Bob Player', 'Paid', 'skip lead'], ['Eve', '', 'second'], ['Fay Player', 'Waiting List', ''],
  ]);
});

test('players need the admin PIN and are never in the public bonspiel read', () => {
  const api = loadBackend();
  const id = linked(api);
  withExport(api, [row('1', '190', 'Ann')]);
  admin(api, { action: 'importPlayers', id });
  assert.equal(scorer(api, { action: 'players', id }).ok, false);
  assert.equal(api.get({ action: 'players', id }).players, undefined);
  assert.doesNotMatch(JSON.stringify(api.get({ action: 'bonspiel', id })), /ann@example/);
});

test('a CCM player cannot be deleted or renamed here, and a hand-added one can', () => {
  const api = loadBackend();
  const id = linked(api);
  withExport(api, [row('1', '190', 'Ann')]);
  const [ann] = admin(api, { action: 'importPlayers', id }).players;
  assert.match(admin(api, { action: 'deletePlayer', id: ann.id }).error, /registered through CCM/);
  assert.match(admin(api, { action: 'savePlayer', player: { bonspielId: id, name: ' ' } }).error, /name/);
  const eve = admin(api, { action: 'savePlayer', player: { bonspielId: id, name: 'Eve' } }).id;
  assert.equal(admin(api, { action: 'deletePlayer', id: eve }).ok, true);
  assert.deepEqual(admin(api, { action: 'players', id }).players.map((player) => player.name), ['Ann Player']);
});

test('saving details keeps the CCM event unless it is changed, and deleting the bonspiel removes its players', () => {
  const api = loadBackend();
  const id = linked(api);
  admin(api, { action: 'saveBonspiel', bonspiel: { id, name: 'Turkey 2', startDate: '2026-11-21', format: 'pools', settings } });
  assert.equal(api.get({ action: 'bonspiel', id }).bonspiel.ccmEvent.name, '2026-27 Turkey Spiel');
  withExport(api, [row('1', '190', 'Ann')]);
  admin(api, { action: 'importPlayers', id });
  admin(api, { action: 'saveBonspiel', bonspiel: { id, name: 'Turkey 2', startDate: '2026-11-21', format: 'pools', settings, ccmEvent: null } });
  assert.equal(api.get({ action: 'bonspiel', id }).bonspiel.ccmEvent, null);
  assert.match(admin(api, { action: 'importPlayers', id }).error, /not linked/);
  admin(api, { action: 'deleteBonspiel', id });
  assert.equal(api.tabs.Players.rows.length, 1); // Only the header row is left.
});
