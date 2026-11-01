// Talks to the Apps Script backend and keeps every page's copy of the live draw fresh.
import { API_URL } from './config.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const url = LOCAL ? '/api' : API_URL;
export const configured = Boolean(url);

let clockOffset = 0;
let bestRoundTrip = Infinity;
let writes = 0;
let listener = () => {};

// The sample with the shortest round trip gives the most accurate server time.
function learnClock(serverNow, sentAt) {
  const receivedAt = Date.now();
  const roundTrip = receivedAt - sentAt;
  if (roundTrip < bestRoundTrip) {
    bestRoundTrip = roundTrip;
    clockOffset = serverNow - (sentAt + receivedAt) / 2;
  }
}

export const serverNow = () => Date.now() + clockOffset;

async function send(path, options) {
  const sentAt = Date.now();
  const response = await fetch(url + path, options);
  const result = await response.json();
  learnClock(result.now, sentAt);
  if (!result.ok) throw new Error(result.error || 'Something went wrong');
  return result;
}

export const get = (action, params = {}) => send(action ? `?${new URLSearchParams({ action, ...params })}` : '');

// text/plain avoids the CORS preflight, which Apps Script cannot answer.
export async function post(action, data = {}) {
  writes += 1;
  const result = await send('', {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, pin: getPin(), ...data }),
  });
  writes += 1;
  listener(result.draw, result);
  return result;
}

// Polls for the live draw. A reply that left the server before our own write finished is dropped.
export function watch(onDraw, onHealth = () => {}, intervalMs = 4000) {
  listener = onDraw;
  const tick = async () => {
    if (document.visibilityState !== 'hidden') {
      const seen = writes;
      try {
        const result = await get();
        if (seen === writes) onDraw(result.draw, result);
        onHealth(true);
      } catch {
        onHealth(false);
      }
    }
    setTimeout(tick, intervalMs);
  };
  tick();
}

function stored(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key) || '';
    if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
  } catch {
    // Private windows can refuse storage. The PIN is then asked for each visit.
  }
  return value;
}

let pinInMemory = '';
export const getPin = () => pinInMemory || stored('acc-bonspiel-pin');
export function setPin(pin) {
  pinInMemory = pin;
  stored('acc-bonspiel-pin', pin);
}
