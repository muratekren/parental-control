import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adminRouter } from './admin';
import { buildPolicy, logAlert } from './policy';
import { SCHEMA } from './schema';

export interface Env {
  DB: D1Database;
  API_SECRET: string;
  ADMIN_TOKEN: string;
  ASSETS?: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// Auto-create tables on first request so local dev and remote deploy need no manual migration.
let schemaApplied = false;
async function ensureSchema(db: D1Database) {
  if (schemaApplied) return;
  try {
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  } catch (err) {
    console.error('ensureSchema failed:', err);
    return;
  }
  schemaApplied = true;
}

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

app.use('*', cors());

// ---- device-side auth: shared API secret ----
function deviceAuthorized(c: any, secret: string): boolean {
  return (c.req.header('x-api-key') ?? '') === secret;
}

// ---- device routes ----
const api = new Hono<{ Bindings: Env }>();

api.post('/devices/register', async (c) => {
  if (!deviceAuthorized(c, c.env.API_SECRET)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const deviceId: string = body.device_id ?? '';
  const name: string = body.name ?? 'Unnamed device';
  const model: string = body.model ?? '';
  if (!deviceId || !/^[A-Za-z0-9._-]{4,64}$/.test(deviceId)) {
    return c.json({ error: 'invalid device_id' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'INSERT INTO devices (device_id, name, model, registered_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(device_id) DO UPDATE SET name = excluded.name, model = excluded.model, last_seen_at = excluded.last_seen_at'
  ).bind(deviceId, name, model, now, now).run();
  const policy = await buildPolicy(c.env.DB, deviceId);
  return c.json({ deviceId, name, policy });
});

api.post('/devices/:id/heartbeat', async (c) => {
  if (!deviceAuthorized(c, c.env.API_SECRET)) return c.json({ error: 'unauthorized' }, 401);
  const deviceId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE device_id = ?').bind(now, deviceId).run();

  // Tamper signals surfaced to the dashboard.
  if (body.adminEnabled === false) {
    await logAlert(c.env.DB, deviceId, 'ADMIN_DISABLED', 'Device admin was disabled on device ' + deviceId);
  }
  if (body.powerSave === true) {
    await logAlert(c.env.DB, deviceId, 'POWER_SAVE', 'Power-save mode active; OS may throttle the guard service.');
  }

  const policy = await buildPolicy(c.env.DB, deviceId);
  if (!policy) return c.json({ error: 'unknown device' }, 404);
  return c.json({ now, policy });
});

api.post('/devices/:id/report', async (c) => {
  if (!deviceAuthorized(c, c.env.API_SECRET)) return c.json({ error: 'unauthorized' }, 401);
  const deviceId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const events: { package: string; date: number; minutes: number }[] = Array.isArray(body.events) ? body.events : [];
  const now = Math.floor(Date.now() / 1000);
  const stmt = c.env.DB.prepare(
    'INSERT INTO usage_events (device_id, package_name, event_date, minutes, reported_at) ' +
    'VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(device_id, package_name, event_date) DO UPDATE SET minutes = excluded.minutes, reported_at = excluded.reported_at'
  );
  const batch = events.map((e) => stmt.bind(deviceId, e.package, e.date, Math.max(0, e.minutes | 0), now));
  if (batch.length) await c.env.DB.batch(batch);
  return c.json({ ok: true, reported: batch.length });
});

api.post('/devices/:id/alert', async (c) => {
  if (!deviceAuthorized(c, c.env.API_SECRET)) return c.json({ error: 'unauthorized' }, 401);
  const deviceId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  await logAlert(c.env.DB, deviceId, String(body.type ?? 'EVENT'), String(body.message ?? ''));
  return c.json({ ok: true });
});

app.route('/api', api);
app.route('/api/admin', adminRouter);

// Fall back to static assets (the dashboard) for everything else.
app.notFound(async (c) => {
  if (c.req.method === 'GET' && c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: 'Not found' }, 404);
});

export default app;