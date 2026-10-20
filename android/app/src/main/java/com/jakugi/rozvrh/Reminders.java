package com.jakugi.rozvrh;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Reminders the page hands over (events, connections, work blocks, leaving for a gig), kept as
 * alarms so they come even when the app is closed. Each one is shown once (by its key).
 */
final class Reminders {
    static final String CHANNEL = "reminders";
    private static final String PREFS = "reminders";
    private static final int MAX = 64;

    private Reminders() {}

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return c.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static synchronized void schedule(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("items", json).apply();
        arm(c);
    }

    /** (Re)sets the alarms from the stored list, also after a reboot. Reminders already due are shown now. */
    static synchronized void arm(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        int before = prefs.getInt("count", 0);
        for (int i = 0; i < before; i++) alarms.cancel(alarm(c, i, null));

        List<JSONObject> items = new ArrayList<>();
        try {
            JSONArray all = new JSONArray(prefs.getString("items", "[]"));
            for (int i = 0; i < all.length() && items.size() < MAX; i++) items.add(all.getJSONObject(i));
        } catch (JSONException ignored) {
            // nothing usable stored
        }

        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
        long now = System.currentTimeMillis();
        int count = 0;
        for (JSONObject item : items) {
            long at = item.optLong("at");
            String key = item.optString("key");
            if (key.isEmpty()) continue;
            if (at <= now) {
                show(c, key, item.optString("title"), item.optString("body"));
                continue;
            }
            PendingIntent pi = alarm(c, count++, item);
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
        prefs.edit().putInt("count", count).apply();
    }

    private static PendingIntent alarm(Context c, int slot, JSONObject item) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction("com.jakugi.rozvrh.REMIND");
        if (item != null) {
            i.putExtra("key", item.optString("key"));
            i.putExtra("title", item.optString("title"));
            i.putExtra("body", item.optString("body"));
        }
        return PendingIntent.getBroadcast(c, slot, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static synchronized void show(Context c, String key, String title, String body) {
        if (key == null || key.isEmpty() || !canNotify(c)) return;
        SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> fired = new HashSet<>(prefs.getStringSet("fired", new HashSet<>()));
        if (fired.contains(key)) return;
        if (fired.size() > 300) fired.clear();
        fired.add(key);
        prefs.edit().putStringSet("fired", fired).apply();

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, c.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(c.getString(R.string.channel_reminders_desc));
        nm.createNotificationChannel(channel);

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(c.getColor(R.color.pen))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build();
        nm.notify(key.hashCode(), n);
    }
}
