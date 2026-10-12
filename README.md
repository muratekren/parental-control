# Parental Control (self-hosted, home use)

A tamper-resistant Android parental control app for home use, with a Cloudflare-hosted
management backend and web dashboard.

**Features (Phase 1):** usage tracking, per-app **block / allow / daily limit**, schedules
(bedtime/homework), a full-screen "time's up" screen, coins + chores + rewards, remote
management, tamper alerts, and a heartbeat sync that stays alive through reboots and
OEM power-saving modes.

**Planned (Phase 2):** YouTube keyword filtering (AccessibilityService), an always-on VPN
for device-level network filtering, and a kiosk launcher with per-app allowlists.

## Repository layout

```
backend/      Cloudflare Worker (Hono + D1) — API + serves the dashboard
dashboard/    Static web admin UI (vanilla JS, no build step)
android/      Kotlin Android app (child device)
docs/         Architecture, device setup, threat model
```

## Quickstart

### 1. Backend (Cloudflare)

```bash
cd backend
npm install

# Create the D1 database once, then paste the returned database_id into wrangler.toml
npx wrangler d1 create parental-control

# Set the two secrets (used by the app and the dashboard respectively)
npx wrangler secret put API_SECRET      # the value the Android app uses
npx wrangler secret put ADMIN_TOKEN     # your dashboard login token

npx wrangler deploy
```

Open the deployed URL: the **dashboard** is served at `/`, the API lives under `/api`.
Tables are auto-created on first request (no manual migration).

Local development:

```bash
cd backend
cp .dev.vars.example .dev.vars   # already has dev defaults
npm run dev                      # serves dashboard + API on http://localhost:8787
```

### 2. Android app

1. Open `android/` in **Android Studio** (first sync downloads Gradle 8.7 + the SDK).
2. Build: **Build → Build APK(s)** → output at `app/build/outputs/apk/debug/app-debug.apk`.
3. Sideload the APK onto the child device and go through **Setup** in the app
   (enter your Worker URL ending in `/api` + the `API_SECRET`).
4. For tamper-proof (Device Owner) setup, follow **`docs/device-setup.md`**.

## Tamper resistance (why it beats the old approach)

The prior app was defeated by toggling the OEM "ultra/extreme power saving mode", which
kills third-party apps. See **`docs/threat-model.md`** for the full layered defense
(Device Owner + kiosk + safe-boot lock + foreground service + battery/screen watchers +
heartbeat tamper alerts).

## Docs

- [`docs/architecture.md`](docs/architecture.md) — components, data flow, API reference
- [`docs/device-setup.md`](docs/device-setup.md) — ADB Device Owner provisioning (exact commands)
- [`docs/threat-model.md`](docs/threat-model.md) — tamper layers and attack coverage