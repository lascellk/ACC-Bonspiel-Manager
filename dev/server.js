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
