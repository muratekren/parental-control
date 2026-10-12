# Architecture

```
┌─────────────── Android app (child device) ───────────────┐
│ PolicyService (foreground, START_STICKY)                 │
│   ├─ tick every ~10s → EnforcementEngine.enforce()        │
│   └─ heartbeat every ~60s → sync()                        │
│ EnforcementEngine                                         │
│   ├─ suspend BLOCK/LIMIT-at-limit packages (Device Owner) │
│   ├─ schedule windows (bedtime / block-all)               │
│   └─ full-screen LockActivity on violation                │
│ UsageTracker (UsageStatsManager)                          │
│ FilterService (AccessibilityService → YouTube, Phase 2)   │
│ DeviceAdminReceiver (admin/owner + tamper callbacks)      │
│ BootReceiver + power/screen watchers (resilience)         │
└────────────────────────┬──────────────────────────────────┘
                         │ HTTPS polling (no GMS/FCM needed)
┌────────────────────────▼──────────────────────────────────┐
│ Cloudflare Worker (Hono + D1)                             │
│   /api/devices/register|heartbeat|report|alert  (device)  │
│   /api/admin/*                               (dashboard)  │
│ D1 tables: devices, app_rules, schedules, usage_events,   │
│            alerts, blocked_keywords, chores, rewards,      │
│            wallets                                         │
│ Static dashboard served from the same Worker (assets)      │
└────────────────────────────────────────────────────────────┘
```

## Sync model

The device **polls** instead of using push (works on Honor/Huawei devices without
Google Play Services):

1. Every 60s the app POSTs `/heartbeat` with `{adminEnabled, powerSave, appVersion}`.
2. The Worker returns the full assembled **policy** (rules, schedules, keywords, wallet,
   chores, rewards).
3. The app stores it in `PolicyStore` and enforces it locally every 10s, so enforcement
   continues even if the network drops.
4. The app POSTs `/report` with today's per-app usage roll-up, and `/alert` for tamper events.

## Policy object

```json
{
  "policyVersion": 3,
  "appRules":    [{ "package": "com.google.android.youtube", "ruleType": "LIMIT", "dailyLimitMinutes": 120, "schedule": null }],
  "schedules":   [{ "name": "Bedtime", "daysMask": 127, "startMinutes": 1260, "endMinutes": 420, "action": "BEDTIME" }],
  "keywords":    ["screaming"],
  "wallet":      { "coins": 140 },
  "chores":      [{ "id": 1, "title": "Empty dishwasher", "coinReward": 10, "completed": false }],
  "rewards":     [{ "id": 1, "title": "30 min extra time", "coinCost": 50, "redeemed": false }]
}
```

`policyVersion` increments on any rule change so the app can cheaply skip re-processing
when nothing changed.

## Auth

- **Device → API:** `x-api-key: <API_SECRET>` header (shared secret, fine for a home setup).
- **Dashboard → API:** `Authorization: Bearer <ADMIN_TOKEN>`.

Both live as Cloudflare secrets, not in code.

## API reference (Phase 1)

| Method & path | Auth | Purpose |
|---|---|---|
| POST `/api/devices/register` | device | Enroll/refresh a device, returns policy |
| POST `/api/devices/:id/heartbeat` | device | Update liveness, return policy |
| POST `/api/devices/:id/report` | device | Upsert usage roll-up |
| POST `/api/devices/:id/alert` | device | Record a tamper/status event |
| GET/POST/PATCH/DELETE `/api/admin/...` | admin | Full CRUD for devices, rules, schedules, keywords, chores, rewards, wallet, usage, alerts |

## Data model (D1)

Defined in `backend/src/schema.ts` (auto-applied). Key tables: `devices`,
`app_rules` (one per package; `rule_type` ∈ ALLOW/BLOCK/LIMIT), `schedules`
(global windows; `days_mask` bit 0=Sun..6=Sat), `usage_events` (unique per
device+package+YYYYMMDD, upserted), `alerts`, `blocked_keywords`, `chores`,
`rewards`, `wallets`.