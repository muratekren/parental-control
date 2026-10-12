# Threat model & tamper defense

**Context:** the child previously disabled Kaspersky Safe Kids by putting the device into
the OEM "ultra/extreme power saving mode" (Samsung "Maximum Power Saving", Honor "Ultra
Power Saving"), which aggressively kills non-system apps and strips third-party admins.

Everything below is designed so that the exact same attack — and the usual escape routes —
no longer work.

## Defense layers

| # | Layer | Mechanism | What it defeats |
|---|-------|-----------|-----------------|
| 1 | **Device Owner** | `dpm set-device-owner` (one-time ADB) | Uninstall, disable, force-stop of the app; factory reset; safe boot; adding users |
| 2 | **Kiosk / lock-task** | `setLockTaskPackages` + `startLockTask` | Reaching Settings/quick-settings/power menu at all (the old bypass vector) |
| 3 | **Restrictions** | `DISALLOW_SAFE_BOOT`, `DISALLOW_FACTORY_RESET`, `DISALLOW_ADD_USER`, … | Reboot-to-safe-mode, wipe-to-remove-admin, multi-user escape |
| 4 | **Foreground service** | `startForeground` + `START_STICKY` | OEM power-saver killing the process; auto-restarts |
| 5 | **Boot + power/screen watchers** | `BootReceiver`, `ACTION_POWER_SAVE_MODE_CHANGED`, `ACTION_SCREEN_ON`, `ACTION_BATTERY_LOW`, `onTaskRemoved` | Surviving reboot, reacting the moment power-saver flips on, recovering if task is swiped |
| 6 | **Admin lifecycle callbacks** | `DeviceAdminReceiver.onDisabled/onLockTaskModeExiting` | Detecting if admin/kiosk was somehow removed → immediate alert + restart |
| 7 | **Heartbeat + tamper alerts** | 60s heartbeat + `/alert` + dashboard alert list | Parent visibility when the device goes silent or a tamper signal fires |
| 8 | **Battery-optimization exemption** | `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Doze/App-Standby throttling the guard |
| 9 | **Local-first enforcement** | policy cached in `PolicyStore`, enforced every ~10s | Keeps limits active even if the network/Wi-Fi is cut off |

## Attack → response map

| Attack | Outcome |
|--------|---------|
| Toggle ultra power-save | Kiosk hides the toggle; if it still fires, `ACTION_POWER_SAVE_MODE_CHANGED` re-asserts enforcement immediately and alerts the parent |
| Reboot into safe mode | Blocked by `DISALLOW_SAFE_BOOT` (Device Owner) |
| Factory reset to wipe the app | Blocked by `DISALLOW_FACTORY_RESET` |
| Uninstall/disable the app | Blocked (Device Owner); `onDisabled` fires + alert if somehow removed |
| Turn off Wi-Fi / airplane mode | Enforcement is local-first; limits still enforced; heartbeat gaps surface an "offline" state |
| Kill the service from recents | `START_STICKY` + `onTaskRemoved` restart it |
| Create a second user | Blocked by `DISALLOW_ADD_USER` |
| Swipe to escape kiosk | `onLockTaskModeExiting` alert + home relaunch |

## Known limitations (be honest with yourself)

- **No Android parental control is 100% un-bypassable.** A physically-able attacker with
  time can try the bootloader/recovery (requires wiping, and `DISALLOW_FACTORY_RESET`
  blocks the in-OS reset). Full protection against recovery-mode flashing is only possible
  with a locked bootloader + OEM account, which is out of scope for a home setup.
- **YouTube content filtering is best-effort** (AccessibilityService scraping on-screen
  text). YouTube changes its UI frequently; the filter needs periodic tuning. Layer it with
  the router-level Restricted Mode and, later, an always-on VPN.
- **Suspension requires Device Owner.** If you choose plain Device Admin instead (no
  factory reset), you lose `setPackagesSuspended`; enforcement degrades to the lock screen
  + foreground bounce. This is why Device Owner is strongly recommended.