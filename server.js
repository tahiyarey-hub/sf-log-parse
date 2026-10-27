const http = require('http');
const fs = require('fs');
const path = require('path');
const { LogIndex } = require('./lib/index');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node server.js <folder-with-csv-files>');
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
const index = new LogIndex(dir);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function serveStatic(res, pathname) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(publicDir, path.normalize(name));
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, index.status());
    }
    if (req.method === 'POST' && url.pathname === '/api/reindex') {
      return sendJson(res, 200, await index.refresh());
    }
    if (req.method === 'GET' && url.pathname === '/api/search') {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query) return sendJson(res, 400, { error: 'Enter a search term.' });
      const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 5000);
      const file = url.searchParams.get('file') || '';
      return sendJson(res, 200, index.search({ query, file, limit }));
    }
    if (req.method === 'GET') return serveStatic(res, url.pathname);

    res.writeHead(405);
    res.end();
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

async function main() {
  const files = await index.refresh();
  const rows = files.reduce((sum, f) => sum + f.rows, 0);
  server.listen(port, '127.0.0.1', () => {
    console.log(`Indexed ${files.length} CSV files (${rows.toLocaleString()} rows) from ${index.dir}`);
    console.log(`Open http://127.0.0.1:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
