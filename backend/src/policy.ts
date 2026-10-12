// Policy assembly + shared helpers. Uses the global D1Database type from @cloudflare/workers-types.

export type RuleType = 'ALLOW' | 'BLOCK' | 'LIMIT';
export type ScheduleAction = 'BLOCK_ALL' | 'ALLOW_ONLY' | 'BEDTIME';

export interface AppRule {
  package: string;
  ruleType: RuleType;
  dailyLimitMinutes: number | null;
  schedule: { startMinutes: number; endMinutes: number }[] | null;
}

export interface Schedule {
  id: number;
  name: string;
  daysMask: number;
  startMinutes: number;
  endMinutes: number;
  action: ScheduleAction;
}

export interface Policy {
  policyVersion: number;
  appRules: AppRule[];
  schedules: Schedule[];
  keywords: string[];
  wallet: { coins: number };
  chores: { id: number; title: string; coinReward: number; completed: boolean }[];
  rewards: { id: number; title: string; coinCost: number; redeemed: boolean }[];
}

export async function touchPolicy(db: D1Database, deviceId: string): Promise<void> {
  await db
    .prepare('UPDATE devices SET policy_version = policy_version + 1 WHERE device_id = ?')
    .bind(deviceId)
    .run();
}

export async function getPolicyVersion(db: D1Database, deviceId: string): Promise<number> {
  const row = await db
    .prepare('SELECT policy_version FROM devices WHERE device_id = ?')
    .bind(deviceId)
    .first<{ policy_version: number }>();
  return row?.policy_version ?? 0;
}

export async function ensureWallet(db: D1Database, deviceId: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO wallets (device_id, coins) VALUES (?, 0)')
    .bind(deviceId)
    .run();
}

export async function buildPolicy(db: D1Database, deviceId: string): Promise<Policy | null> {
  const dev = await db
    .prepare('SELECT policy_version FROM devices WHERE device_id = ?')
    .bind(deviceId)
    .first<{ policy_version: number }>();
  if (!dev) return null;

  await ensureWallet(db, deviceId);

  const [rulesRes, schedRes, kwRes, walletRes, choresRes, rewardsRes] = await Promise.all([
    db.prepare('SELECT package_name, rule_type, daily_limit_minutes, schedule_json FROM app_rules WHERE device_id = ?').bind(deviceId).all(),
    db.prepare('SELECT id, name, days_mask, start_minutes, end_minutes, action FROM schedules WHERE device_id = ?').bind(deviceId).all(),
    db.prepare('SELECT keyword FROM blocked_keywords WHERE device_id = ?').bind(deviceId).all(),
    db.prepare('SELECT coins FROM wallets WHERE device_id = ?').bind(deviceId).first(),
    db.prepare('SELECT id, title, coin_reward, completed FROM chores WHERE device_id = ?').bind(deviceId).all(),
    db.prepare('SELECT id, title, coin_cost, redeemed FROM rewards WHERE device_id = ?').bind(deviceId).all(),
  ]);

  const appRules: AppRule[] = (rulesRes.results as any[]).map((r) => ({
    package: r.package_name,
    ruleType: r.rule_type,
    dailyLimitMinutes: r.daily_limit_minutes,
    schedule: r.schedule_json ? JSON.parse(r.schedule_json) : null,
  }));

  const schedules: Schedule[] = (schedRes.results as any[]).map((s) => ({
    id: s.id,
    name: s.name,
    daysMask: s.days_mask,
    startMinutes: s.start_minutes,
    endMinutes: s.end_minutes,
    action: s.action,
  }));

  return {
    policyVersion: dev.policy_version,
    appRules,
    schedules,
    keywords: (kwRes.results as any[]).map((k) => k.keyword),
    wallet: { coins: (walletRes as any)?.coins ?? 0 },
    chores: (choresRes.results as any[]).map((c) => ({
      id: c.id,
      title: c.title,
      coinReward: c.coin_reward,
      completed: !!c.completed,
    })),
    rewards: (rewardsRes.results as any[]).map((r) => ({
      id: r.id,
      title: r.title,
      coinCost: r.coin_cost,
      redeemed: !!r.redeemed,
    })),
  };
}

export async function logAlert(
  db: D1Database,
  deviceId: string,
  type: string,
  message: string
): Promise<void> {
  await db
    .prepare('INSERT INTO alerts (device_id, type, message, created_at) VALUES (?, ?, ?, ?)')
    .bind(deviceId, type, message, Math.floor(Date.now() / 1000))
    .run();
}