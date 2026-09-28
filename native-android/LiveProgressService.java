package com.sagar.hanumandisha;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that shows a pinned, live-updating progress notification
 * while an exercise timer or the JAI SRI RAM video is running.
 * The timer is computed from startedAt + duration, so it stays correct even if the WebView is paused.
 */
public class LiveProgressService extends Service {
    static final String ACTION_UPDATE = "com.sagar.hanumandisha.live.UPDATE";
    static final String CHANNEL = "hanuman-live-progress";
    static final int ONGOING_ID = 41080;
    static final int DONE_ID = 41081;
    static final int SAFFRON = 0xFFFF6A00;

    static volatile LiveProgressService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private String title = "Hanuman Disha";
    private String page = "dashboard";
    private String mode = "countdown";   // "countdown" (exercise) or "elapsed" (video)
    private long startedAt;
    private long durationMs;
    private long positionMs;
    private boolean paused;
    private boolean finished;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (finished) return;
            render();
            if (!finished) handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        applyParams(intent);
        ensureChannel(this);
        Notification n = build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ONGOING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(ONGOING_ID, n);
        }
        restartTicker();
        return START_NOT_STICKY;
    }

    /** Called by the plugin when the service is already running (no new service start needed). */
    void update(final Intent intent) {
        handler.post(new Runnable() {
            @Override public void run() {
                applyParams(intent);
                render();
                restartTicker();
            }
        });
    }

    /** Ends the live notification; optionally posts a "completed" notification. */
    void finish(final String doneTitle, final String donePage) {
        handler.post(new Runnable() {
            @Override public void run() {
                finished = true;
                handler.removeCallbacks(tick);
                if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
                else stopForeground(true);
                if (doneTitle != null) postDone(LiveProgressService.this, doneTitle, donePage != null ? donePage : page);
                stopSelf();
            }
        });
    }

    private void applyParams(Intent i) {
        String t = i.getStringExtra("title");
        if (t != null) title = t;
        String p = i.getStringExtra("page");
        if (p != null) page = p;
        String m = i.getStringExtra("mode");
        if (m != null) mode = m;
        startedAt = i.getLongExtra("startedAt", System.currentTimeMillis());
        durationMs = Math.max(1000L, i.getLongExtra("durationMs", 60000L));
        positionMs = i.getLongExtra("positionMs", 0L);
        paused = i.getBooleanExtra("paused", false);
        finished = false;
    }

    private void restartTicker() {
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, 1000);
    }

    private long elapsed() {
        long e = paused ? positionMs : System.currentTimeMillis() - startedAt;
        return Math.max(0L, Math.min(durationMs, e));
    }

    private void render() {
        if (finished) return;
        if ("countdown".equals(mode) && !paused && System.currentTimeMillis() - startedAt >= durationMs) {
            // Exercise timer reached zero, even if the app is in the background.
            finish("✓ " + stripIcon(title) + " completed", page);
            return;
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try { nm.notify(ONGOING_ID, build()); } catch (SecurityException ignored) { }
    }

    private Notification build() {
        long e = elapsed();
        int pct = (int) Math.min(100L, (e * 100L) / durationMs);
        String text;
        if ("countdown".equals(mode)) {
            text = clock(durationMs - e) + " left";
        } else {
            text = clock(e) + " / " + clock(durationMs) + (paused ? "  ·  Paused" : "");
        }
        PendingIntent open = openIntent(this, page, 1);
        return new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(iconRes(this))
                .setContentTitle(title)
                .setContentText(text)
                .setSubText(pct + "%")
                .setProgress(1000, (int) ((e * 1000L) / durationMs), false)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .setColor(SAFFRON)
                .setColorized(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(open)
                .addAction(0, "Open", open)
                .build();
    }

    static void postDone(Context c, String doneTitle, String page) {
        ensureChannel(c);
        PendingIntent open = openIntent(c, page, 2);
        Notification n = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(iconRes(c))
                .setContentTitle(doneTitle)
                .setContentText("Jai Shri Ram 🚩")
                .setColor(SAFFRON)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(open)
                .addAction(0, "Open", open)
                .build();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try { nm.notify(DONE_ID, n); } catch (SecurityException ignored) { }
    }

    static PendingIntent openIntent(Context c, String page, int requestCode) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction("com.sagar.hanumandisha.OPEN_PAGE");
        i.putExtra("page", page);
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Live progress", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Live timer while an exercise or JAI SRI RAM is running");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    static int iconRes(Context c) {
        int id = c.getResources().getIdentifier("ic_stat_icon", "drawable", c.getPackageName());
        return id != 0 ? id : android.R.drawable.ic_media_play;
    }

    private static String clock(long ms) {
        long s = Math.max(0L, ms / 1000L);
        long h = s / 3600L, m = (s % 3600L) / 60L, sec = s % 60L;
        return h > 0 ? String.format("%d:%02d:%02d", h, m, sec) : String.format("%02d:%02d", m, sec);
    }

    private static String stripIcon(String t) {
        // "🏃 Surya Namaskar" -> "Surya Namaskar"
        int sp = t.indexOf(' ');
        return (sp > 0 && sp <= 3) ? t.substring(sp + 1) : t;
    }
}
