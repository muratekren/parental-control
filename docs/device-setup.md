# Device setup — Device Owner (tamper-proof)

The strongest enforcement uses Android's **Device Owner** mode, the same mechanism used
by enterprise MDM. Once your app is Device Owner, it **cannot be uninstalled, disabled, or
force-stopped** by the child, survives reboots, and can suspend apps + lock the device.

> ⚠️ **Important:** a device can only be made Device Owner if it has **no accounts** and
> (on most devices) only one user. In practice this means **factory-resetting the child's
> device first** and skipping the Google/setup account, then immediately running the
> command below before signing in. This is the main tradeoff: full control requires a
> clean setup.

## 1. Prepare the child device

1. Factory reset (if it has accounts/setup already completed).
2. Complete the initial setup **without** adding a Google/Samsung/Huawei account
   (choose "Skip" everywhere). Wi-Fi can be connected.
3. Enable **Developer options**: Settings → About → tap **Build number** 7 times.
4. Enable **USB debugging** under Developer options.
5. Connect the device to your computer and accept the "Allow USB debugging?" prompt.

## 2. Install the app

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 3. Grant usage access (from the PC, no tap-through)

```bash
adb shell appops set com.family.control GET_USAGE_STATS allow
```

## 4. Make it Device Owner

```bash
adb shell dpm set-device-owner com.family.control/.DeviceAdminReceiver
```

Expected output: `Success: Device owner set to package com.family.control`.

Troubleshooting:
- `Not allowed to set the device owner because there are already several users` →
  remove all accounts / factory reset, then retry.
- `Admin component ... already exists / owner already set` → it already ran.
- Huawei/Honor (EMUI/HarmonyOS): if the command is rejected, disable any existing
  device admins first, or run on a freshly reset device (recommended).

## 5. (Optional but recommended) Enable kiosk lock-task

```bash
adb shell dpm set-lock-task-packages com.family.control
```

This lets `HomeActivity` run in lock-task (kiosk) mode so the child can't escape to
Settings or the quick-settings panel (which is how the previous app was bypassed via the
power-save toggle).

## 6. Enable the YouTube filter (AccessibilityService)

Via ADB:

```bash
adb shell settings put secure enabled_accessibility_services com.family.control/com.family.control.FilterService
adb shell settings put secure accessibility_enabled 1
```

If the device ignores that, enable it manually: Settings → Accessibility → **YouTube
content filter**.

## 7. First run

Open **Family Guard** → enter your Worker URL (ending in `/api`) + `API_SECRET` → the four
setup steps → verify the status line shows `✅ device owner`. The device then appears in
your dashboard.

## Per-device notes

- **Samsung Galaxy S8 (Android 7–9):** Device Owner works. To defend against "Maximum
  power saving mode", rely on Device Owner + kiosk + the power-mode watcher (the toggle
  becomes unreachable in kiosk, and `DISALLOW_SAFE_BOOT` blocks safe-mode reboot).
- **Honor tablet (EMUI/HarmonyOS):** No Google Play Services on many Honor/Huawei devices
  — irrelevant here because we sideload and use polling, not FCM. Device Owner is
  supported on EMUI/HarmonyOS (Android base).
- **Xiaomi test phone / emulator:** same commands; emulators accept `dpm set-device-owner`
  after a boot with no accounts.

## Locking it down further (recommended)

These Device-Owner restrictions make the device effectively escape-proof — add them to the
enforcement code or via `dpm`:

- `DISALLOW_SAFE_BOOT` — blocks reboot-into-safe-mode (safe mode disables third-party apps)
- `DISALLOW_FACTORY_RESET` — blocks wiping the device to remove the admin
- `DISALLOW_APPS_CONTROL` / `DISALLOW_UNINSTALL_APPS` — blocks messing with app settings
- `DISALLOW_ADD_USER` / `DISALLOW_REMOVE_USER` — blocks creating a second Android user