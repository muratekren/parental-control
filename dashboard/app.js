// Parental Control — dashboard client (vanilla JS, no build step)
const API = '/api/admin';
let token = localStorage.getItem('pc_token') || '';
let devices = [];
let currentId = null;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function req(path, opts = {}) {
  opts.headers = Object.assign(
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    opts.headers || {}
  );
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'HTTP ' + res.status);
  }
  return res.json();
}

// ---------- auth ----------
function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); }
function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = $('#token-input').value.trim();
  localStorage.setItem('pc_token', token);
  try {
    await loadDevices();
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout').addEventListener('click', () => {
  localStorage.removeItem('pc_token');
  token = '';
  showLogin();
});

$('#refresh').addEventListener('click', async () => {
  await loadDevices();
  if (currentId) renderActiveTab();
});

// ---------- devices ----------
async function loadDevices() {
  const data = await req('/devices');
  devices = data.devices;
  renderDevices();
}

function online(ts) {
  const ago = (Date.now() / 1000) - ts;
  return Number.isFinite(ago) && ago < 180;
}

function renderDevices() {
  const el = $('#device-list');
  el.innerHTML = '';
  if (!devices.length) {
    el.innerHTML = '<p class="muted">No devices yet. Enroll one from the Android app.</p>';
    return;
  }
  devices.forEach((d) => {
    const div = document.createElement('div');
    div.className = 'device' + (d.device_id === currentId ? ' active' : '');
    const isOnline = online(d.last_seen_at);
    div.innerHTML =
      `<div>${esc(d.name)}</div>` +
      `<div class="status"><span class="dot ${isOnline ? 'online' : 'offline'}"></span>` +
      `${isOnline ? 'online' : (d.last_seen_at ? 'last seen ' + agoText(d.last_seen_at) : 'never online')}</div>`;
    div.onclick = () => { currentId = d.device_id; renderDevices(); renderActiveTab(); };
    el.appendChild(div);
  });
}

function agoText(ts) {
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  if (m < 1440) return Math.floor(m / 60) + 'h ago';
  return Math.floor(m / 1440) + 'd ago';
}

// ---------- tab switching ----------
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn || !currentId) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  renderActiveTab();
});

function renderActiveTab() {
  const tab = document.querySelector('.tab.active').dataset.tab;
  (renderers[tab] || renderers.overview)();
}

const renderers = {
  overview: renderOverview,
  rules: renderRules,
  schedules: renderSchedules,
  keywords: renderKeywords,
  chores: renderChores,
  rewards: renderRewards,
  usage: renderUsage,
};

// ---------- overview ----------
async function renderOverview() {
  const p = await req(`/devices/${currentId}/policy`);
  const alerts = await req(`/devices/${currentId}/alerts`);
  const dev = devices.find((d) => d.device_id === currentId);
  $('#dev-title').textContent = dev ? dev.name : currentId;
  $('#dev-sub').textContent = `${dev?.model || ''} · policy v${p.policyVersion} · ${dev?.last_seen_at ? agoText(dev.last_seen_at) : 'never online'}`;
  $('#wallet-chip').textContent = `🪙 ${p.wallet.coins} coins`;

  let html = '';
  if (alerts.alerts.length) {
    html += '<div class="card"><h3>⚠️ Recent alerts</h3>';
    html += alerts.alerts.slice(0, 8).map((a) =>
      `<div class="list-item alert-item"><div><strong>${esc(a.type)}</strong><br><span class="meta">${esc(a.message)}</span></div><span class="meta">${new Date(a.created_at * 1000).toLocaleString()}</span></div>`
    ).join('');
    html += '</div>';
  } else {
    html += '<div class="card"><h3>All clear ✅</h3><p class="muted">No tamper alerts. Device reporting normally.</p></div>';
  }
  html += `<div class="card"><h3>Policy summary</h3>` +
    `<p class="muted">${p.appRules.length} app rule(s) · ${p.schedules.length} schedule(s) · ${p.keywords.length} keyword(s)</p></div>`;
  $('#panel').innerHTML = html;
}

async function setHeader() {
  const dev = devices.find((d) => d.device_id === currentId);
  $('#dev-title').textContent = dev ? dev.name : currentId;
  $('#dev-sub').textContent = `${dev?.model || ''} · ${dev?.last_seen_at ? agoText(dev.last_seen_at) : 'never online'}`;
  try {
    const w = await req(`/devices/${currentId}/wallet`);
    $('#wallet-chip').textContent = `🪙 ${w.coins} coins`;
  } catch {}
}

// ---------- app rules ----------
async function renderRules() {
  await setHeader();
  const p = await req(`/devices/${currentId}/policy`);
  let html = `<div class="card"><h3>App rules</h3>
    <p class="muted">Block, allow, or set a daily time limit per app package.</p>
    <div class="row">
      <input id="rule-pkg" placeholder="com.google.android.youtube" style="flex:1"/>
      <select id="rule-type"><option value="BLOCK">Block</option><option value="LIMIT">Limit</option><option value="ALLOW">Allow</option></select>
      <input id="rule-limit" type="number" placeholder="min/day" style="width:90px"/>
      <button class="small" id="rule-add">Add</button>
    </div></div>`;
  if (p.appRules.length) {
    html += '<div class="card"><h3>Configured</h3>' + p.appRules.map((r) => `
      <div class="list-item">
        <div><strong>${esc(r.package)}</strong><br><span class="meta">${r.dailyLimitMinutes ? r.dailyLimitMinutes + ' min/day' : 'no limit'}</span></div>
        <span class="badge ${r.ruleType.toLowerCase()}">${esc(r.ruleType)}</span>
        <button class="small" data-del-pkg="${esc(r.package)}">Remove</button>
      </div>`).join('') + '</div>';
  }
  $('#panel').innerHTML = html;
  $('#rule-add').onclick = async () => {
    const pkg = $('#rule-pkg').value.trim();
    if (!pkg) return alert('Enter a package name');
    await req(`/devices/${currentId}/rules/${encodeURIComponent(pkg)}`, {
      method: 'PUT',
      body: JSON.stringify({ ruleType: $('#rule-type').value, dailyLimitMinutes: +$('#rule-limit').value || null })
    });
    renderRules();
  };
  document.querySelectorAll('[data-del-pkg]').forEach((b) =>
    (b.onclick = async () => { await req(`/devices/${currentId}/rules/${encodeURIComponent(b.dataset.delPkg)}`, { method: 'DELETE' }); renderRules(); })
  );
}

// ---------- schedules ----------
async function renderSchedules() {
  await setHeader();
  const p = await req(`/devices/${currentId}/policy`);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = `<div class="card"><h3>Schedules</h3>
    <div class="row">
      <input id="sched-name" placeholder="Bedtime" style="flex:1"/>
      <input id="sched-start" type="time" value="21:00"/>
      <input id="sched-end" type="time" value="07:00"/>
      <select id="sched-action">
        <option value="BLOCK_ALL">Block all</option>
        <option value="BEDTIME">Bedtime</option>
        <option value="ALLOW_ONLY">Allow only</option>
      </select>
    </div>
    <div class="row" id="sched-days">${days.map((d, i) => `<label style="width:auto;font-size:13px"><input type="checkbox" data-day="${i}" checked style="width:auto;margin:0 4px"/>${d}</label>`).join('')}</div>
    <div class="row"><button class="small" id="sched-add">Add schedule</button></div></div>`;
  if (p.schedules.length) {
    html += '<div class="card"><h3>Active</h3>' + p.schedules.map((s) => `
      <div class="list-item">
        <div><strong>${esc(s.name)}</strong><br><span class="meta">${s.startMinutes}–${s.endMinutes} min · ${esc(s.action)}</span></div>
        <button class="small" data-del-sched="${s.id}">Remove</button>
      </div>`).join('') + '</div>';
  }
  $('#panel').innerHTML = html;
  $('#sched-add').onclick = async () => {
    const daysMask = [...document.querySelectorAll('#sched-days input:checked')].reduce((m, c) => m | (1 << +c.dataset.day), 0);
    const toMin = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
    await req(`/devices/${currentId}/schedules`, { method: 'POST', body: JSON.stringify({
      name: $('#sched-name').value.trim() || 'Schedule',
      daysMask, startMinutes: toMin($('#sched-start').value), endMinutes: toMin($('#sched-end').value),
      action: $('#sched-action').value
    }) });
    renderSchedules();
  };
  document.querySelectorAll('[data-del-sched]').forEach((b) =>
    (b.onclick = async () => { await req(`/devices/${currentId}/schedules/${b.dataset.delSched}`, { method: 'DELETE' }); renderSchedules(); })
  );
}

// ---------- keywords ----------
async function renderKeywords() {
  await setHeader();
  const p = await req(`/devices/${currentId}/policy`);
  let html = `<div class="card"><h3>Blocked keywords</h3>
    <p class="muted">YouTube/search content keywords (device-side filter).</p>
    <div class="row"><input id="kw" placeholder="Add keyword" style="flex:1"/><button class="small" id="kw-add">Add</button></div></div>`;
  if (p.keywords.length) {
    html += '<div class="card"><h3>Keywords (' + p.keywords.length + ')</h3><div class="grid">' +
      p.keywords.map((k) => `<div class="list-item"><span>${esc(k)}</span><button class="small" data-del-kw="${esc(k)}">✕</button></div>`).join('') +
      '</div></div>';
  }
  $('#panel').innerHTML = html;
  $('#kw-add').onclick = async () => {
    const kw = $('#kw').value.trim();
    if (!kw) return;
    const res = await req(`/devices/${currentId}/keywords`, { method: 'POST', body: JSON.stringify({ keyword: kw }) }).catch((e) => ({ _e: e.message }));
    if (res._e) alert(res._e);
    renderKeywords();
  };
  document.querySelectorAll('[data-del-kw]').forEach((b) =>
    (b.onclick = async () => { await req(`/devices/${currentId}/keywords/${encodeURIComponent(b.dataset.delKw)}`, { method: 'DELETE' }); renderKeywords(); })
  );
}

// ---------- chores ----------
async function renderChores() {
  await setHeader();
  const p = await req(`/devices/${currentId}/policy`);
  let html = `<div class="card"><h3>Chores</h3>
    <div class="row"><input id="chore-title" placeholder="Empty the dishwasher" style="flex:1"/><input id="chore-coins" type="number" placeholder="coins" style="width:90px"/><button class="small" id="chore-add">Add</button></div></div>`;
  if (p.chores.length) {
    html += '<div class="card"><h3>To do</h3>' + p.chores.map((c) => `
      <div class="list-item">
        <div><strong style="${c.completed ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(c.title)}</strong><br><span class="meta">+${c.coinReward} 🪙</span></div>
        <button class="small" data-toggle-chore="${c.id}">${c.completed ? 'Undo' : 'Done'}</button>
        <button class="small" data-del-chore="${c.id}">✕</button>
      </div>`).join('') + '</div>';
  }
  $('#panel').innerHTML = html;
  $('#chore-add').onclick = async () => {
    await req(`/devices/${currentId}/chores`, { method: 'POST', body: JSON.stringify({ title: $('#chore-title').value.trim() || 'Chore', coinReward: +$('#chore-coins').value || 0 }) });
    renderChores();
  };
  document.querySelectorAll('[data-toggle-chore]').forEach((b) =>
    (b.onclick = async () => {
      const chore = p.chores.find((c) => String(c.id) === b.dataset.toggleChore);
      await req(`/devices/${currentId}/chores/${b.dataset.toggleChore}`, { method: 'PATCH', body: JSON.stringify({ completed: !chore.completed }) });
      renderChores();
    })
  );
  document.querySelectorAll('[data-del-chore]').forEach((b) =>
    (b.onclick = async () => { await req(`/devices/${currentId}/chores/${b.dataset.delChore}`, { method: 'DELETE' }); renderChores(); })
  );
}

// ---------- rewards ----------
async function renderRewards() {
  await setHeader();
  const p = await req(`/devices/${currentId}/policy`);
  let html = `<div class="card"><h3>Rewards</h3>
    <div class="row"><input id="reward-title" placeholder="30 min extra screen time" style="flex:1"/><input id="reward-cost" type="number" placeholder="coins" style="width:90px"/><button class="small" id="reward-add">Add</button></div></div>`;
  if (p.rewards.length) {
    html += '<div class="card"><h3>Redeemable</h3>' + p.rewards.map((r) => `
      <div class="list-item">
        <div><strong>${esc(r.title)}</strong><br><span class="meta">${r.coinCost} 🪙</span></div>
        ${r.redeemed ? '<span class="badge allow">redeemed</span>' : `<button class="small" data-redeem="${r.id}">Redeem</button>`}
        <button class="small" data-del-reward="${r.id}">✕</button>
      </div>`).join('') + '</div>';
  }
  $('#panel').innerHTML = html;
  $('#reward-add').onclick = async () => {
    await req(`/devices/${currentId}/rewards`, { method: 'POST', body: JSON.stringify({ title: $('#reward-title').value.trim() || 'Reward', coinCost: +$('#reward-cost').value || 0 }) });
    renderRewards();
  };
  document.querySelectorAll('[data-redeem]').forEach((b) =>
    (b.onclick = async () => {
      await req(`/devices/${currentId}/rewards/${b.dataset.redeem}`, { method: 'PATCH', body: JSON.stringify({ redeemed: true }) }).catch((e) => alert(e.message));
      renderRewards();
    })
  );
  document.querySelectorAll('[data-del-reward]').forEach((b) =>
    (b.onclick = async () => { await req(`/devices/${currentId}/rewards/${b.dataset.delReward}`, { method: 'DELETE' }); renderRewards(); })
  );
}

// ---------- usage ----------
async function renderUsage() {
  await setHeader();
  const data = await req(`/devices/${currentId}/usage`);
  let html = '<div class="card"><h3>Usage</h3>';
  if (!data.usage.length) {
    html += '<p class="muted">No usage reported yet.</p>';
  } else {
    html += '<table><tr><th>App</th><th>Day</th><th>Minutes</th></tr>' +
      data.usage.map((u) => `<tr><td>${esc(u.package_name)}</td><td>${esc(u.event_date)}</td><td>${u.minutes}</td></tr>`).join('') +
      '</table>';
  }
  html += '</div>';
  $('#panel').innerHTML = html;
}

// ---------- boot ----------
(async function init() {
  if (!token) return showLogin();
  try {
    await loadDevices();
    showApp();
  } catch {
    showLogin();
  }
})();