// Local preview: serves docs/ and runs backend/Code.gs against the in-memory fake.
// Admin PIN 1234, score PIN 0000. Data is lost when it stops.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBackend } from './gas-fake.js';

const root = fileURLToPath(new URL('../docs', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const backend = loadBackend();
// The club admin site isn't reachable here, so CCM events come from these made-up registrations.
backend.context.ccmRegistrants = () => {
  const first = ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Fay', 'Gus', 'Hal', 'Ida', 'Jo', 'Kim', 'Lou', 'Max', 'Ned', 'Oli', 'Pat', 'Quin', 'Ros', 'Sam', 'Tia', 'Uma', 'Vic'];
  const wants = ['Skip', 'Mate', 'Second', 'Lead', 'No Preference', 'Skip', 'Lead', 'No Preference', 'Mate', 'Second', 'Lead'];
  const draws = ['Early Draw', 'Late Draw', 'No preference'];
  const statuses = ['Paid', 'Pending', 'Paid', 'Paid', 'Pending', 'Cancelled', 'Paid', 'Paid', 'Pending', 'Paid', 'Paid', 'Waiting List'];
  return first.map((name, i) => ({
    id: String(i + 1), eventId: '190', event: 'Sample Turkey Spiel', eventDate: '2026-11-21', name: `${name} Sample${i + 1}`,
    email: `${name.toLowerCase()}@example.com`, status: statuses[i % statuses.length], drawTime: draws[i % 3],
    group: i < 4 ? 'Ann Sample1' : i >= 6 && i < 9 ? 'Gus Sample7' : '',
    notes: i === 3 ? 'Can play with Ann' : '', positions: ({ Skip: ['skip'], Mate: ['vice'], Second: ['second'], Lead: ['lead'] })[wants[i % wants.length]] || [],
  })).concat([{ id: '99', eventId: '150', event: 'Sample Spring Spiel', eventDate: '2026-03-21', name: 'Ed Ellis', email: '', status: 'Paid', drawTime: '', notes: '', positions: [] }]);
};
const port = Number(process.env.PORT) || 8787;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const result = req.method === 'POST'
      ? backend.post(JSON.parse(body))
      : backend.get(Object.fromEntries(url.searchParams));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(result));
  }
  try {
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = await readFile(join(root, normalize(path)));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
