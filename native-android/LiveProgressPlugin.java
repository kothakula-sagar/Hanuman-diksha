package com.sagar.hanumandisha;

import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS API (window.Capacitor.Plugins.LiveProgress):
 *   start({title, mode:"countdown"|"elapsed", startedAt, durationMs, positionMs, paused, page})
 *   stop({doneTitle?, page?})
 *   getLaunchPage() -> {page}
 *   event "open" -> {page}   (user tapped the notification or its Open button)
 */
@CapacitorPlugin(name = "LiveProgress")
public class LiveProgressPlugin extends Plugin {
    private String launchPage = null;

    @Override
    public void load() {
        Intent i = getActivity() != null ? getActivity().getIntent() : null;
        if (i != null) launchPage = i.getStringExtra("page");
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;
        String page = intent.getStringExtra("page");
        if (page == null) return;
        JSObject data = new JSObject();
        data.put("page", page);
        notifyListeners("open", data, true);
    }

    @PluginMethod
    public void getLaunchPage(PluginCall call) {
        JSObject r = new JSObject();
        r.put("page", launchPage != null ? launchPage : "");
        launchPage = null;
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(ctx, LiveProgressService.class);
        i.setAction(LiveProgressService.ACTION_UPDATE);
        i.putExtra("title", call.getString("title", "Hanuman Disha"));
        i.putExtra("mode", call.getString("mode", "countdown"));
        i.putExtra("page", call.getString("page", "dashboard"));
        i.putExtra("startedAt", call.getDouble("startedAt", (double) System.currentTimeMillis()).longValue());
        i.putExtra("durationMs", call.getDouble("durationMs", 60000d).longValue());
        i.putExtra("positionMs", call.getDouble("positionMs", 0d).longValue());
        i.putExtra("paused", Boolean.TRUE.equals(call.getBoolean("paused", false)));
        try {
            LiveProgressService running = LiveProgressService.instance;
            if (running != null) running.update(i);
            else ContextCompat.startForegroundService(ctx, i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start live notification: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String doneTitle = call.getString("doneTitle");
        String page = call.getString("page", "dashboard");
        LiveProgressService running = LiveProgressService.instance;
        if (running != null) running.finish(doneTitle, page);
        else if (doneTitle != null) LiveProgressService.postDone(getContext(), doneTitle, page);
        call.resolve();
    }
}
