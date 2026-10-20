package com.jakugi.rozvrh;

import android.graphics.Color;
import android.webkit.JavascriptInterface;

/** window.RozvrhAndroid in the page: system bars, notifications, reminders while the app is closed. */
public class AppBridge {
    private final MainActivity activity;

    AppBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String version() {
        return BuildConfig.VERSION_NAME;
    }

    /** colours as "#RRGGBB"; dark = light icons on the bars */
    @JavascriptInterface
    public void setBars(String top, String bottom, boolean dark) {
        try {
            int t = Color.parseColor(top);
            int b = Color.parseColor(bottom);
            activity.runOnUiThread(() -> activity.setBars(t, b, dark));
        } catch (IllegalArgumentException ignored) {
            // not a colour
        }
    }

    @JavascriptInterface
    public boolean canNotify() {
        return Reminders.canNotify(activity);
    }

    /** asks for the permission (Android 13+); the page hears back through the 'rozvrh-notifications' event */
    @JavascriptInterface
    public void requestNotifications() {
        activity.runOnUiThread(activity::requestNotifications);
    }

    @JavascriptInterface
    public void notify(String title, String body, String key) {
        Reminders.show(activity, key, title, body);
    }

    /** JSON array of {key, at (ms), title, body}: replaces everything scheduled before */
    @JavascriptInterface
    public void schedule(String json) {
        Reminders.schedule(activity, json);
    }

    @JavascriptInterface
    public void openExternal(String url) {
        activity.runOnUiThread(() -> activity.openExternal(url));
    }
}
