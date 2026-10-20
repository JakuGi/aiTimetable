package com.jakugi.rozvrh;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** An alarm set by Reminders went off. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Reminders.show(c, i.getStringExtra("key"), i.getStringExtra("title"), i.getStringExtra("body"));
    }
}
