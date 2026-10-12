// Canonical runtime schema. Auto-applied on first request via ensureSchema().
// Kept in TS so the Worker can bootstrap its own D1 database (local + remote).

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id       TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  model           TEXT,
  registered_at   INTEGER NOT NULL,
  last_seen_at    INTEGER,
  policy_version  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL,
  package_name  TEXT NOT NULL,
  rule_type     TEXT NOT NULL,
  daily_limit_minutes INTEGER,
  schedule_json TEXT,
  UNIQUE(device_id, package_name)
);

CREATE TABLE IF NOT EXISTS schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  days_mask     INTEGER NOT NULL DEFAULT 127,
  start_minutes INTEGER NOT NULL,
  end_minutes   INTEGER NOT NULL,
  action        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL,
  package_name  TEXT NOT NULL,
  event_date    INTEGER NOT NULL,
  minutes       INTEGER NOT NULL,
  reported_at   INTEGER NOT NULL,
  UNIQUE(device_id, package_name, event_date)
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_keywords (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  UNIQUE(device_id, keyword)
);

CREATE TABLE IF NOT EXISTS chores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  coin_reward INTEGER NOT NULL DEFAULT 0,
  completed   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  coin_cost   INTEGER NOT NULL DEFAULT 0,
  redeemed    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL UNIQUE,
  coins       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_usage_device ON usage_events(device_id, event_date);
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);
`;