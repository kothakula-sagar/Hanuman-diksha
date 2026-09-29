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

  async function ensureChannel() {
    await LN.createChannel({ id: CHANNEL, name: "Daily sadhana reminders", description: "JAI SRI RAM, SITA RAM, exercises, tasks and motivation", importance: 5, visibility: 1, vibration: true });
  }
  const toNotification = it => {
    const base = { id: idFor(it.key), title: it.title, body: it.body, channelId: CHANNEL, smallIcon: "ic_stat_icon", extra: { page: it.page || "" } };
    if (it.at) return { ...base, schedule: { at: new Date(it.at), allowWhileIdle: true } };           // one-off
    const t = parse(it.time); if (!t) return null;
    return { ...base, schedule: { on: { hour: t.hour, minute: t.minute }, repeats: true, allowWhileIdle: true } };  // daily
  };

  // items: [{key, title, body, page, at:msTimestamp}] (one-off) or [{..., time:"HH:MM"}] (daily repeat)
  // Replaces everything scheduled before, so edits, deletions and completed tasks stay in sync.
  async function scheduleAll(items) {
    try {
      if (!(await ensurePermission())) return { ok: false, reason: "permission-denied" };
      await ensureChannel();
      const pending = await LN.getPending();
      if (pending.notifications && pending.notifications.length)
        await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      const list = items.map(toNotification).filter(Boolean);
      if (list.length) await LN.schedule({ notifications: list });
      return { ok: true, count: list.length };
    } catch (err) {
      console.error("Notification scheduling failed", err);
      return { ok: false, reason: String(err && err.message || err) };
    }
  }

  // One test notification in ~1 minute, without touching the scheduled reminders.
  async function scheduleTest() {
    try {
      if (!(await ensurePermission())) return { ok: false, reason: "permission-denied" };
      await ensureChannel();
      await LN.schedule({ notifications: [toNotification({ key: "test:" + Date.now(), title: "Test reminder 🚩", body: "If you see this, reminders work.", page: "settings", at: Date.now() + 60000 })] });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    }
  }

  async function exactAlarmStatus() { try { return (await LN.checkExactNotificationSetting()).exact_alarm; } catch { return "unknown"; } }
  async function openExactAlarmSettings() { try { await LN.changeExactNotificationSetting(); } catch {} }

  // ---- Live progress notification (pinned, updating bar) while an exercise / JAI video runs ----
  let LP = null;
  try { LP = (Cap.Plugins && Cap.Plugins.LiveProgress) || (Cap.registerPlugin && Cap.registerPlugin("LiveProgress")); } catch (e) {}
  const live = {
    // {title, mode:"countdown"|"elapsed", startedAt, durationMs, positionMs, paused, page}
    start(opts) { return LP ? LP.start(opts).catch(err => console.warn("Live notification failed", err)) : Promise.resolve(); },
    // {doneTitle?, page?}  doneTitle shows a "completed" notification
    stop(opts) { return LP ? LP.stop(opts || {}).catch(() => {}) : Promise.resolve(); },
    // cb(page) when the user taps the notification or its Open button
    onOpen(cb) {
      if (!LP) return;
      try { LP.addListener("open", d => d && d.page && cb(d.page)); } catch (e) {}
      LP.getLaunchPage().then(r => r && r.page && cb(r.page)).catch(() => {});
    },
  };

  // cb(page) when the user taps any reminder or the live notification
  function onOpenPage(cb) {
    try { LN.addListener("localNotificationActionPerformed", a => { const p = a && a.notification && a.notification.extra && a.notification.extra.page; if (p) cb(p); }); } catch (e) {}
    live.onOpen(cb);
  }

  window.HanumanNative = { scheduleAll, scheduleTest, exactAlarmStatus, openExactAlarmSettings, live, onOpenPage, isNative: true };
})();
