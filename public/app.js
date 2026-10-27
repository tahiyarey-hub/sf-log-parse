const HISTORY_KEY = 'sfLogSearch.history';
const HISTORY_MAX = 50;

const form = document.getElementById('search-form');
const queryInput = document.getElementById('query');
const fileSelect = document.getElementById('file');
const limitSelect = document.getElementById('limit');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const historyEl = document.getElementById('history');
const filesEl = document.getElementById('files');

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable: history still works for this page session.
  }
}

let history = loadHistory();

function addToHistory(query, file) {
  const entry = { query, file, at: Date.now() };
  history = [entry, ...history.filter((h) => !(h.query === query && h.file === file))].slice(0, HISTORY_MAX);
  saveHistory(history);
  renderHistory();
}

function renderHistory() {
  historyEl.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No searches yet.';
    historyEl.append(empty);
    return;
  }
  for (const entry of history) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.textContent = entry.query;

    const meta = document.createElement('span');
    meta.className = 'muted';
    meta.textContent = `${entry.file || 'All files'} · ${new Date(entry.at).toLocaleString()}`;
    button.append(meta);

    button.addEventListener('click', () => replay(entry));
    li.append(button);
    historyEl.append(li);
  }
}

function renderFiles(files) {
  filesEl.replaceChildren();
  for (const f of files) {
    const li = document.createElement('li');
    const source = f.fromCache ? 'cached' : 'parsed';
    li.textContent = `${f.name} — ${f.rows.toLocaleString()} rows, ${f.columns} columns (${source})`;
    filesEl.append(li);
  }
}

function renderStatus(files) {
  const rows = files.reduce((sum, f) => sum + f.rows, 0);
  const cached = files.filter((f) => f.fromCache).length;
  statusEl.textContent = `${files.length} CSV files · ${rows.toLocaleString()} rows · ${cached} loaded from cache`;

  const current = fileSelect.value;
  fileSelect.replaceChildren(new Option('All files', ''));
  for (const f of files) fileSelect.append(new Option(f.name, f.name));
  fileSelect.value = files.some((f) => f.name === current) ? current : '';

  renderFiles(files);
}

// Wraps every case-insensitive occurrence of query in a <mark>, building nodes so values are never parsed as HTML.
function appendHighlighted(el, text, query) {
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  let pos = 0;
  let idx = lower.indexOf(needle);
  while (idx !== -1) {
    if (idx > pos) el.append(text.slice(pos, idx));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + needle.length);
    el.append(mark);
    pos = idx + needle.length;
    idx = lower.indexOf(needle, pos);
  }
  if (pos < text.length) el.append(text.slice(pos));
}

function renderResult(result, query) {
  const card = document.createElement('article');
  card.className = 'result';

  const head = document.createElement('div');
  head.className = 'result-head';
  head.textContent = `${result.file} · row ${result.row}`;

  const list = document.createElement('dl');
  list.className = 'fields';
  for (const field of result.fields) {
    const label = document.createElement('dt');
    label.textContent = field.column;

    const value = document.createElement('dd');
    if (field.value === '') {
      value.className = 'muted';
      value.textContent = '—';
    } else {
      appendHighlighted(value, field.value, query);
    }
    list.append(label, value);
  }

  card.append(head, list);
  return card;
}

function renderResults({ query, total, shown, results }) {
  if (total === 0) {
    summaryEl.textContent = `No records contain "${query}".`;
  } else {
    const count = `${total.toLocaleString()} matching ${total === 1 ? 'record' : 'records'}`;
    summaryEl.textContent = shown < total
      ? `${count}. Showing the first ${shown.toLocaleString()}; raise the limit to see more.`
      : count;
  }
  resultsEl.replaceChildren(...results.map((r) => renderResult(r, query)));
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  summaryEl.textContent = '';
  resultsEl.replaceChildren();
}

async function runSearch(query, file) {
  errorEl.hidden = true;
  summaryEl.textContent = 'Searching…';
  try {
    const params = new URLSearchParams({ q: query, file, limit: limitSelect.value });
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Search failed.');
      return;
    }
    renderResults(data);
    addToHistory(query, file);
  } catch (err) {
    showError(`Search failed: ${err.message}`);
  }
}

function replay(entry) {
  queryInput.value = entry.query;
  fileSelect.value = [...fileSelect.options].some((o) => o.value === entry.file) ? entry.file : '';
  runSearch(entry.query, fileSelect.value);
}

async function loadStatus() {
  const res = await fetch('/api/status');
  renderStatus(await res.json());
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;
  runSearch(query, fileSelect.value);
});

document.getElementById('reindex').addEventListener('click', async () => {
  statusEl.textContent = 'Scanning…';
  const res = await fetch('/api/reindex', { method: 'POST' });
  renderStatus(await res.json());
});

document.getElementById('clear-history').addEventListener('click', () => {
  history = [];
  saveHistory(history);
  renderHistory();
});

renderHistory();
loadStatus().catch((err) => {
  statusEl.textContent = `Could not load status: ${err.message}`;
});
