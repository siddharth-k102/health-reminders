// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  view: 'today',         // today | all | flagged | health | list:{id}
  lists: [],
  reminders: [],
  editingId: null,
  selectedColor: '#e2b714',
  flagNewReminder: false,
};

// ─── API ──────────────────────────────────────────────────────────────────────
const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = d - today;
  if (diff < 0) return { text: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), cls: 'overdue' };
  if (diff === 0) return { text: 'today', cls: 'today' };
  if (diff === 86400000) return { text: 'tomorrow', cls: '' };
  return { text: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), cls: '' };
}

function formatDuration(mins) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function calcPace(miles, minutes) {
  if (!miles || !minutes) return '—';
  const paceMin = minutes / miles;
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')} /mi`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Render Sidebar ───────────────────────────────────────────────────────────
function renderSidebar() {
  const ul = document.getElementById('user-lists');
  ul.innerHTML = '';
  state.lists.forEach(list => {
    const btn = document.createElement('button');
    btn.className = 'nav-item list-nav-item';
    btn.dataset.view = `list:${list.id}`;
    if (state.view === `list:${list.id}`) btn.classList.add('active');
    btn.innerHTML = `
      <span class="list-dot" style="background:${list.color}"></span>
      <span>${list.name.toLowerCase()}</span>
      ${list.pending_count > 0 ? `<span class="badge visible">${list.pending_count}</span>` : ''}
      <button class="delete-list-btn" data-id="${list.id}" title="Delete list">×</button>
    `;
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.delete-list-btn')) return;
      setView(`list:${list.id}`);
    });
    btn.querySelector('.delete-list-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete list "${list.name}" and all its reminders?`)) {
        api.del(`/api/lists/${list.id}`).then(loadAll);
      }
    });
    ul.appendChild(btn);
  });

  // Update nav badges
  const allIncomplete = state.reminders.filter(r => !r.completed);
  const todayItems = allIncomplete.filter(r => {
    if (!r.due_date) {
      return r.created_at?.startsWith(todayStr());
    }
    return r.due_date === todayStr();
  });
  const flagged = allIncomplete.filter(r => r.flagged);

  const setB = (id, n) => {
    const el = document.getElementById(id);
    el.textContent = n;
    el.classList.toggle('visible', n > 0);
  };
  setB('badge-today', todayItems.length);
  setB('badge-all', allIncomplete.length);
  setB('badge-flagged', flagged.length);

  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });
}

// ─── Render Reminders ─────────────────────────────────────────────────────────
function renderReminders() {
  const list = document.getElementById('reminder-list');
  const empty = document.getElementById('empty-state');
  const countEl = document.getElementById('view-count');
  list.innerHTML = '';

  const items = state.reminders;
  countEl.textContent = items.length > 0 ? `${items.length}` : '';

  if (items.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  items.forEach(r => {
    const li = document.createElement('li');
    li.className = 'reminder-item' + (r.completed ? ' completed' : '');
    li.dataset.id = r.id;

    const dateInfo = formatDate(r.due_date);
    const dateHtml = dateInfo ? `<span class="reminder-date ${dateInfo.cls}">${dateInfo.text}</span>` : '';
    const listTag = r.list_name ? `<span class="reminder-list-tag" style="color:${r.list_color}">${r.list_name.toLowerCase()}</span>` : '';
    const notesHtml = r.notes ? `<span class="reminder-notes">${escHtml(r.notes)}</span>` : '';

    li.innerHTML = `
      <div class="checkbox-wrap">
        <div class="checkbox ${r.completed ? 'checked' : ''}" data-id="${r.id}"></div>
      </div>
      <div class="reminder-content">
        <div class="reminder-title">${escHtml(r.title)}</div>
        <div class="reminder-meta">${notesHtml}${dateHtml}${listTag}</div>
      </div>
      ${r.flagged ? '<span class="reminder-flag">⚑</span>' : ''}
      <div class="reminder-actions">
        <button class="reminder-action-btn edit" data-id="${r.id}" title="Edit">✎</button>
        <button class="reminder-action-btn delete" data-id="${r.id}" title="Delete">×</button>
      </div>
    `;

    li.querySelector('.checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleComplete(r.id, !r.completed);
    });

    li.querySelector('.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(r);
    });

    li.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteReminder(r.id);
    });

    li.addEventListener('click', () => openEditModal(r));
    list.appendChild(li);
  });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Views ────────────────────────────────────────────────────────────────────
async function setView(view) {
  state.view = view;
  const titleEl = document.getElementById('view-title');
  const viewReminders = document.getElementById('view-reminders');
  const viewHealth = document.getElementById('view-health');

  if (view === 'health') {
    viewReminders.classList.remove('active');
    viewHealth.classList.add('active');
    loadHealth();
  } else {
    viewReminders.classList.add('active');
    viewHealth.classList.remove('active');

    if (view === 'today') titleEl.textContent = 'today';
    else if (view === 'all') titleEl.textContent = 'all';
    else if (view === 'flagged') titleEl.textContent = 'flagged';
    else if (view.startsWith('list:')) {
      const id = view.split(':')[1];
      const list = state.lists.find(l => l.id == id);
      titleEl.textContent = list?.name?.toLowerCase() || 'list';
    }
    await loadReminders();
  }
  renderSidebar();
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  state.lists = await api.get('/api/lists');
  await loadReminders();
  renderSidebar();
}

async function loadReminders() {
  let url = '/api/reminders?';
  if (state.view === 'today') url += 'view=today';
  else if (state.view === 'all') url += 'view=all';
  else if (state.view === 'flagged') url += 'view=flagged';
  else if (state.view.startsWith('list:')) url += `list_id=${state.view.split(':')[1]}`;
  state.reminders = await api.get(url);
  renderReminders();
}

async function loadHealth() {
  const [logs, { stats, weekly }] = await Promise.all([
    api.get('/api/health?limit=30'),
    api.get('/api/health/stats'),
  ]);
  renderHealthStats(stats);
  renderBarChart(weekly);
  renderRunLog(logs);
}

// ─── Health Rendering ─────────────────────────────────────────────────────────
function renderHealthStats(stats) {
  document.getElementById('stat-runs').textContent = stats.total_runs || 0;
  document.getElementById('stat-miles').textContent = stats.total_miles || '0';
  document.getElementById('stat-avg').textContent = stats.avg_miles || '0';
  document.getElementById('stat-best').textContent = stats.best_run || '0';
}

function renderBarChart(weekly) {
  const chart = document.getElementById('bar-chart');
  chart.innerHTML = '';
  if (!weekly.length) return;
  const max = Math.max(...weekly.map(w => w.miles), 1);
  weekly.forEach(w => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    const pct = Math.max((w.miles / max) * 100, 2);
    group.innerHTML = `
      <div class="bar" style="height:${pct}%" title="${w.miles} mi (${w.runs} run${w.runs !== 1 ? 's' : ''})"></div>
      <div class="bar-week">${w.week.split('-W')[1] ? 'wk' + w.week.split('-W')[1] : w.week}</div>
    `;
    chart.appendChild(group);
  });
}

function renderRunLog(logs) {
  const container = document.getElementById('run-log-list');
  const empty = document.getElementById('health-empty');
  container.innerHTML = '';

  if (!logs.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  logs.forEach(log => {
    const row = document.createElement('div');
    row.className = 'run-entry';
    const d = new Date(log.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    row.innerHTML = `
      <span class="run-date">${dateStr}</span>
      <span class="run-miles">${log.miles} mi</span>
      <span class="run-time">${formatDuration(log.duration_minutes)}</span>
      <span class="run-pace">${calcPace(log.miles, log.duration_minutes)}</span>
      <span class="run-notes">${log.notes ? escHtml(log.notes) : ''}</span>
      <button class="delete-run-btn" data-id="${log.id}" title="Delete">×</button>
    `;
    row.querySelector('.delete-run-btn').addEventListener('click', async () => {
      await api.del(`/api/health/${log.id}`);
      loadHealth();
    });
    container.appendChild(row);
  });
}

// ─── Reminder Actions ─────────────────────────────────────────────────────────
async function toggleComplete(id, completed) {
  await api.put(`/api/reminders/${id}`, { completed });
  await loadAll();
}

async function deleteReminder(id) {
  await api.del(`/api/reminders/${id}`);
  await loadAll();
}

function openEditModal(r) {
  state.editingId = r.id;
  document.getElementById('edit-title').value = r.title;
  document.getElementById('edit-notes').value = r.notes || '';
  document.getElementById('edit-date').value = r.due_date || '';
  populateListSelect('edit-list', r.list_id);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingId = null;
}

// ─── List Select Population ───────────────────────────────────────────────────
function populateListSelect(selectId, selectedId = null) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">no list</option>';
  state.lists.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name.toLowerCase();
    if (selectedId && l.id == selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // Add reminder form
  const formAdd = document.getElementById('form-add-reminder');
  const btnAdd = document.getElementById('btn-add-reminder');
  const btnCancel = document.getElementById('btn-cancel-reminder');
  const btnFlag = document.getElementById('btn-flag-reminder');

  btnAdd.addEventListener('click', () => {
    formAdd.classList.remove('hidden');
    const today = todayStr();
    document.getElementById('input-reminder-date').value = today;
    populateListSelect('input-reminder-list');
    document.getElementById('input-reminder-title').focus();
  });

  btnCancel.addEventListener('click', () => {
    formAdd.classList.add('hidden');
    formAdd.reset();
    state.flagNewReminder = false;
    btnFlag.classList.remove('flagged');
  });

  btnFlag.addEventListener('click', () => {
    state.flagNewReminder = !state.flagNewReminder;
    btnFlag.classList.toggle('flagged', state.flagNewReminder);
  });

  formAdd.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('input-reminder-title').value.trim();
    if (!title) return;
    await api.post('/api/reminders', {
      title,
      notes: document.getElementById('input-reminder-notes').value.trim() || null,
      due_date: document.getElementById('input-reminder-date').value || null,
      list_id: document.getElementById('input-reminder-list').value || null,
      flagged: state.flagNewReminder,
    });
    formAdd.reset();
    formAdd.classList.add('hidden');
    state.flagNewReminder = false;
    btnFlag.classList.remove('flagged');
    await loadAll();
  });

  // Edit modal
  document.getElementById('btn-close-modal').addEventListener('click', closeEditModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeEditModal();
  });

  document.getElementById('form-edit-reminder').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.editingId) return;
    await api.put(`/api/reminders/${state.editingId}`, {
      title: document.getElementById('edit-title').value.trim(),
      notes: document.getElementById('edit-notes').value.trim() || null,
      due_date: document.getElementById('edit-date').value || null,
      list_id: document.getElementById('edit-list').value || null,
    });
    closeEditModal();
    await loadAll();
  });

  document.getElementById('btn-delete-from-modal').addEventListener('click', async () => {
    if (!state.editingId) return;
    await deleteReminder(state.editingId);
    closeEditModal();
  });

  // New list
  const openNewList = () => {
    document.getElementById('modal-new-list').classList.remove('hidden');
    document.getElementById('input-list-name').focus();
  };
  document.getElementById('btn-new-list').addEventListener('click', openNewList);
  document.getElementById('btn-new-list-bottom').addEventListener('click', openNewList);
  document.getElementById('btn-close-new-list').addEventListener('click', () => {
    document.getElementById('modal-new-list').classList.add('hidden');
  });
  document.getElementById('btn-cancel-new-list').addEventListener('click', () => {
    document.getElementById('modal-new-list').classList.add('hidden');
  });
  document.getElementById('modal-new-list').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-new-list')) {
      document.getElementById('modal-new-list').classList.add('hidden');
    }
  });

  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.selectedColor = sw.dataset.color;
    });
  });

  document.getElementById('form-new-list').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('input-list-name').value.trim();
    if (!name) return;
    await api.post('/api/lists', { name, color: state.selectedColor });
    document.getElementById('modal-new-list').classList.add('hidden');
    document.getElementById('form-new-list').reset();
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    document.querySelector('.color-swatch[data-color="#e2b714"]').classList.add('active');
    state.selectedColor = '#e2b714';
    await loadAll();
  });

  // Health
  const formRun = document.getElementById('form-log-run');
  const btnLogRun = document.getElementById('btn-log-run');
  const btnCancelRun = document.getElementById('btn-cancel-run');

  btnLogRun.addEventListener('click', () => {
    formRun.classList.remove('hidden');
    document.getElementById('input-run-date').value = todayStr();
    document.getElementById('input-run-miles').focus();
  });

  btnCancelRun.addEventListener('click', () => {
    formRun.classList.add('hidden');
    formRun.reset();
  });

  formRun.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.post('/api/health', {
      date: document.getElementById('input-run-date').value,
      miles: document.getElementById('input-run-miles').value,
      duration_minutes: document.getElementById('input-run-duration').value,
      notes: document.getElementById('input-run-notes').value.trim() || null,
    });
    formRun.classList.add('hidden');
    formRun.reset();
    loadHealth();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      document.getElementById('modal-new-list').classList.add('hidden');
      document.getElementById('form-add-reminder').classList.add('hidden');
      document.getElementById('form-log-run').classList.add('hidden');
    }
  });

  // Boot
  loadAll();
});
