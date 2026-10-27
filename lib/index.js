const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCsv } = require('./csv');

const CACHE_DIR_NAME = '.sf-log-cache';

// Recursively collects .csv files, skipping hidden folders (including the cache folder).
async function listCsvFiles(root) {
  const found = [];
  async function walk(dir) {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) found.push(full);
    }
  }
  await walk(root);
  return found.sort();
}

// Returns the parsed file, using the on-disk cache when the file's mtime and size are unchanged.
async function loadFile(filePath, cacheDir) {
  const stat = await fs.promises.stat(filePath);
  const key = crypto.createHash('sha1').update(filePath).digest('hex');
  const cachePath = path.join(cacheDir, `${key}.json`);

  try {
    const cached = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
    if (cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return { ...cached, fromCache: true };
    }
  } catch {
    // No usable cache entry; fall through and parse the file.
  }

  const [header = [], ...rows] = parseCsv(await fs.promises.readFile(filePath, 'utf8'));
  const entry = { file: filePath, mtimeMs: stat.mtimeMs, size: stat.size, header, rows };
  try {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    await fs.promises.writeFile(cachePath, JSON.stringify(entry));
  } catch {
    // Cache is optional; the index still works without it.
  }
  return { ...entry, fromCache: false };
}

// Pairs each cell with its header so every value is labelled with its column.
function pairRow(header, row) {
  const width = Math.max(header.length, row.length);
  return Array.from({ length: width }, (_, j) => ({
    column: header[j] || `Column ${j + 1}`,
    value: row[j] ?? '',
  }));
}

class LogIndex {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.cacheDir = path.join(this.dir, CACHE_DIR_NAME);
    this.files = new Map();
  }

  async refresh() {
    const next = new Map();
    for (const filePath of await listCsvFiles(this.dir)) {
      next.set(filePath, await loadFile(filePath, this.cacheDir));
    }
    this.files = next;
    return this.status();
  }

  status() {
    return [...this.files.values()].map((entry) => ({
      name: path.relative(this.dir, entry.file),
      rows: entry.rows.length,
      columns: entry.header.length,
      fromCache: entry.fromCache,
    }));
  }

  search({ query, file = '', limit = 200 }) {
    const needle = query.toLowerCase();
    const results = [];
    let total = 0;

    for (const entry of this.files.values()) {
      const name = path.relative(this.dir, entry.file);
      if (file && name !== file) continue;

      entry.rows.forEach((row, i) => {
        if (!row.some((cell) => cell.toLowerCase().includes(needle))) return;
        total += 1;
        if (results.length < limit) {
          results.push({ file: name, row: i + 1, fields: pairRow(entry.header, row) });
        }
      });
    }

    return { query, total, shown: results.length, results };
  }
}

module.exports = { LogIndex };
