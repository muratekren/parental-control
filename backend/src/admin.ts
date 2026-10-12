import { Hono } from 'hono';
import type { Context } from 'hono';
import { buildPolicy, ensureWallet, touchPolicy } from './policy';

interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
}

export const adminRouter = new Hono<{ Bindings: Env }>();

const adminAuth = (c: Context<any>) =>
  (c.req.header('authorization') ?? '') === `Bearer ${c.env.ADMIN_TOKEN}`;

adminRouter.use('*', async (c, next) => {
  if (!adminAuth(c)) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

const now = () => Math.floor(Date.now() / 1000);

// ---------- devices ----------
adminRouter.get('/devices', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT device_id, name, model, registered_at, last_seen_at, policy_version FROM devices ORDER BY name'
  ).all();
  return c.json({ devices: rows.results });
});

adminRouter.patch('/devices/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if (body.name) {
    await c.env.DB.prepare('UPDATE devices SET name = ? WHERE device_id = ?').bind(body.name, id).run();
  }
  return c.json({ ok: true });
});

adminRouter.delete('/devices/:id', async (c) => {
  const id = c.req.param('id');
  for (const t of ['devices', 'app_rules', 'schedules', 'usage_events', 'alerts', 'blocked_keywords', 'chores', 'rewards', 'wallets']) {
    await c.env.DB.prepare(`DELETE FROM ${t} WHERE device_id = ?`).bind(id).run();
  }
  return c.json({ ok: true });
});

// ---------- app rules ----------
adminRouter.get('/devices/:id/rules', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(
    'SELECT package_name, rule_type, daily_limit_minutes, schedule_json FROM app_rules WHERE device_id = ? ORDER BY package_name'
  ).bind(id).all();
  return c.json({ rules: rows.results });
});

adminRouter.put('/devices/:id/rules/:package', async (c) => {
  const id = c.req.param('id');
  const pkg = decodeURIComponent(c.req.param('package'));
  const body = await c.req.json().catch(() => ({}));
  const ruleType = ['ALLOW', 'BLOCK', 'LIMIT'].includes(body.ruleType) ? body.ruleType : 'BLOCK';
  const limit = body.dailyLimitMinutes ? Math.max(0, body.dailyLimitMinutes | 0) : null;
  const schedule = JSON.stringify(Array.isArray(body.schedule) ? body.schedule : null);
  await c.env.DB.prepare(
    'INSERT INTO app_rules (device_id, package_name, rule_type, daily_limit_minutes, schedule_json) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(device_id, package_name) DO UPDATE SET rule_type = excluded.rule_type, daily_limit_minutes = excluded.daily_limit_minutes, schedule_json = excluded.schedule_json'
  ).bind(id, pkg, ruleType, limit, schedule).run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.delete('/devices/:id/rules/:package', async (c) => {
  const id = c.req.param('id');
  const pkg = decodeURIComponent(c.req.param('package'));
  await c.env.DB.prepare('DELETE FROM app_rules WHERE device_id = ? AND package_name = ?').bind(id, pkg).run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

// ---------- schedules ----------
adminRouter.get('/devices/:id/schedules', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(
    'SELECT id, name, days_mask, start_minutes, end_minutes, action FROM schedules WHERE device_id = ? ORDER BY start_minutes'
  ).bind(id).all();
  return c.json({ schedules: rows.results });
});

adminRouter.post('/devices/:id/schedules', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare(
    'INSERT INTO schedules (device_id, name, days_mask, start_minutes, end_minutes, action) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, b.name ?? 'Schedule', b.daysMask ?? 127, b.startMinutes ?? 0, b.endMinutes ?? 0, b.action ?? 'BLOCK_ALL').run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.delete('/devices/:id/schedules/:sid', async (c) => {
  await c.env.DB.prepare('DELETE FROM schedules WHERE id = ? AND device_id = ?')
    .bind(c.req.param('sid'), c.req.param('id')).run();
  await touchPolicy(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

// ---------- keywords ----------
adminRouter.get('/devices/:id/keywords', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT id, keyword FROM blocked_keywords WHERE device_id = ? ORDER BY keyword').bind(id).all();
  return c.json({ keywords: rows.results });
});

adminRouter.post('/devices/:id/keywords', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({}));
  const kw = String(b.keyword ?? '').trim();
  if (!kw) return c.json({ error: 'empty keyword' }, 400);
  await c.env.DB.prepare('INSERT OR IGNORE INTO blocked_keywords (device_id, keyword) VALUES (?, ?)').bind(id, kw).run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.delete('/devices/:id/keywords/:kid', async (c) => {
  await c.env.DB.prepare('DELETE FROM blocked_keywords WHERE id = ? AND device_id = ?')
    .bind(c.req.param('kid'), c.req.param('id')).run();
  await touchPolicy(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

// ---------- chores ----------
adminRouter.get('/devices/:id/chores', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, title, coin_reward, completed FROM chores WHERE device_id = ? ORDER BY id DESC'
  ).bind(c.req.param('id')).all();
  return c.json({ chores: rows.results });
});

adminRouter.post('/devices/:id/chores', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare('INSERT INTO chores (device_id, title, coin_reward, completed, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(id, b.title ?? 'Chore', b.coinReward ?? 0, now()).run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.patch('/devices/:id/chores/:cid', async (c) => {
  const id = c.req.param('id');
  const cid = c.req.param('cid');
  const b = await c.req.json().catch(() => ({}));
  await ensureWallet(c.env.DB, id);
  const row = await c.env.DB.prepare('SELECT completed, coin_reward FROM chores WHERE id = ? AND device_id = ?').bind(cid, id).first<any>();
  if (!row) return c.json({ error: 'not found' }, 404);
  const target = !!b.completed;
  if (target && !row.completed) {
    await c.env.DB.prepare('UPDATE chores SET completed = 1 WHERE id = ?').bind(cid).run();
    await c.env.DB.prepare('UPDATE wallets SET coins = coins + ? WHERE device_id = ?').bind(row.coin_reward ?? 0, id).run();
  } else if (!target && row.completed) {
    await c.env.DB.prepare('UPDATE chores SET completed = 0 WHERE id = ?').bind(cid).run();
    await c.env.DB.prepare('UPDATE wallets SET coins = MAX(0, coins - ?) WHERE device_id = ?').bind(row.coin_reward ?? 0, id).run();
  }
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.delete('/devices/:id/chores/:cid', async (c) => {
  await c.env.DB.prepare('DELETE FROM chores WHERE id = ? AND device_id = ?').bind(c.req.param('cid'), c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- rewards ----------
adminRouter.get('/devices/:id/rewards', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, title, coin_cost, redeemed FROM rewards WHERE device_id = ? ORDER BY coin_cost'
  ).bind(c.req.param('id')).all();
  return c.json({ rewards: rows.results });
});

adminRouter.post('/devices/:id/rewards', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare('INSERT INTO rewards (device_id, title, coin_cost, redeemed, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(id, b.title ?? 'Reward', b.coinCost ?? 0, now()).run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.patch('/devices/:id/rewards/:rid', async (c) => {
  const id = c.req.param('id');
  const rid = c.req.param('rid');
  const b = await c.req.json().catch(() => ({}));
  await ensureWallet(c.env.DB, id);
  const row = await c.env.DB.prepare('SELECT redeemed, coin_cost FROM rewards WHERE id = ? AND device_id = ?').bind(rid, id).first<any>();
  if (!row) return c.json({ error: 'not found' }, 404);
  const target = !!b.redeemed;
  if (target && !row.redeemed) {
    const wallet = await c.env.DB.prepare('SELECT coins FROM wallets WHERE device_id = ?').bind(id).first<any>();
    if ((wallet?.coins ?? 0) < (row.coin_cost ?? 0)) return c.json({ error: 'insufficient coins' }, 400);
    await c.env.DB.prepare('UPDATE rewards SET redeemed = 1 WHERE id = ?').bind(rid).run();
    await c.env.DB.prepare('UPDATE wallets SET coins = coins - ? WHERE device_id = ?').bind(row.coin_cost ?? 0, id).run();
  }
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

adminRouter.delete('/devices/:id/rewards/:rid', async (c) => {
  await c.env.DB.prepare('DELETE FROM rewards WHERE id = ? AND device_id = ?').bind(c.req.param('rid'), c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- wallet ----------
adminRouter.get('/devices/:id/wallet', async (c) => {
  await ensureWallet(c.env.DB, c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT coins FROM wallets WHERE device_id = ?').bind(c.req.param('id')).first<any>();
  return c.json({ coins: row?.coins ?? 0 });
});

adminRouter.post('/devices/:id/wallet', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({}));
  await ensureWallet(c.env.DB, id);
  await c.env.DB.prepare('UPDATE wallets SET coins = MAX(0, coins + ?) WHERE device_id = ?').bind(b.delta ?? 0, id).run();
  await touchPolicy(c.env.DB, id);
  return c.json({ ok: true });
});

// ---------- usage / alerts / policy ----------
adminRouter.get('/devices/:id/usage', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(
    'SELECT package_name, event_date, SUM(minutes) as minutes FROM usage_events WHERE device_id = ? GROUP BY package_name, event_date ORDER BY event_date DESC LIMIT 200'
  ).bind(id).all();
  return c.json({ usage: rows.results });
});

adminRouter.get('/devices/:id/alerts', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, type, message, created_at FROM alerts WHERE device_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(c.req.param('id')).all();
  return c.json({ alerts: rows.results });
});

adminRouter.get('/devices/:id/policy', async (c) => {
  const p = await buildPolicy(c.env.DB, c.req.param('id'));
  if (!p) return c.json({ error: 'not found' }, 404);
  return c.json(p);
});