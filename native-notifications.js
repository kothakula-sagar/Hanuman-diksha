// Native (Android app) daily reminders. Does nothing in a normal browser.
// Schedules repeating notifications ON THE PHONE, so they fire with the app closed and no internet.
(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  // Capacitor 8 exposes registered plugins on window.Capacitor.Plugins (proxy created on first access)
  let LN = null;
  try { LN = (Cap.Plugins && Cap.Plugins.LocalNotifications) || (Cap.registerPlugin && Cap.registerPlugin("LocalNotifications")); } catch (e) {}
  if (!LN) { console.warn("LocalNotifications plugin not available"); return; }

  const CHANNEL = "hanuman-disha-reminders";
  const idFor = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (Math.abs(h) % 2000000000) + 1; };
  const parse = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? { hour: +m[1], minute: +m[2] } : null; };

  async function ensurePermission() {
    let p = await LN.checkPermissions();
    if (p.display !== "granted") p = await LN.requestPermissions();
    return p.display === "granted";
  }

  // items: [{key, title, body, time:"HH:MM"}]
  async function scheduleAll(items) {
    try {
      if (!(await ensurePermission())) return { ok: false, reason: "permission-denied" };
      await LN.createChannel({ id: CHANNEL, name: "Daily sadhana reminders", description: "JAI SRI RAM, SITA RAM, exercises and tasks", importance: 5, visibility: 1, vibration: true });

      // Replace everything we scheduled before, so edits and deletions stay in sync
      const pending = await LN.getPending();
      if (pending.notifications && pending.notifications.length)
        await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });

      const list = [];
      for (const it of items) {
        const t = parse(it.time); if (!t) continue;
        list.push({
          id: idFor(it.key), title: it.title, body: it.body, channelId: CHANNEL,
          smallIcon: "ic_stat_icon",
          schedule: { on: { hour: t.hour, minute: t.minute }, repeats: true, allowWhileIdle: true },
        });
      }
      if (list.length) await LN.schedule({ notifications: list });
      return { ok: true, count: list.length };
    } catch (err) {
      console.error("Notification scheduling failed", err);
      return { ok: false, reason: String(err && err.message || err) };
    }
  }

  async function exactAlarmStatus() { try { return (await LN.checkExactNotificationSetting()).exact_alarm; } catch { return "unknown"; } }
  async function openExactAlarmSettings() { try { await LN.changeExactNotificationSetting(); } catch {} }

  window.HanumanNative = { scheduleAll, exactAlarmStatus, openExactAlarmSettings, isNative: true };
})();
