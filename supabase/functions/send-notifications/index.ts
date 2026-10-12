// Sends Web Push notifications.
//  - POST {"tick":true} with header x-cron-secret: called every minute by pg_cron
//  - POST {"test":true} with the user's access token: a test notification to all their devices
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { dueNotifications, WINDOW_MS, type Note, type NotifyProfile } from './due.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = (() => {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return keys.default ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
})() ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

// VAPID keys and the cron secret live in Vault; read once per warm instance
let config: Promise<{ cronSecret: string }> | null = null;
function loadConfig() {
  config ??= (async () => {
    const { data, error } = await db.rpc('push_config');
    if (error || !data?.vapid_public_key || !data?.vapid_private_key) {
      config = null;
      throw new Error(`push config missing: ${error?.message ?? 'no Vault secrets'}`);
    }
    webpush.setVapidDetails('https://ai-timetable-delta.vercel.app', data.vapid_public_key, data.vapid_private_key);
    return { cronSecret: data.push_cron_secret ?? '' };
  })();
  return config;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

interface Sub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Push one note to every device of the user; forget devices the push service no longer knows. */
async function deliver(subs: Sub[], note: Pick<Note, 'title' | 'body' | 'url'> & { tag?: string }) {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(note),
          { TTL: 60 * 60, urgency: 'high' },
        );
        sent++;
        await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id);
      } catch (err) {
        failed++;
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
        else console.error('push failed', code, (err as Error).message);
      }
    }),
  );
  return { sent, failed };
}

async function tick() {
  const now = new Date();
  const { data: subs, error } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (error) throw error;
  if (!subs?.length) return { users: 0, sent: 0 };

  const byUser = new Map<string, Sub[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const userIds = [...byUser.keys()];

  const from = new Date(now.getTime() - WINDOW_MS).toISOString();
  const weekAhead = new Date(now.getTime() + 8 * 24 * 3600_000).toISOString();
  const dayAhead = new Date(now.getTime() + 36 * 3600_000).toISOString();

  // only rows that can possibly be due soon, for users who have a device
  const [profiles, events, sessions, gigs, tasks] = await Promise.all([
    db.from('profiles').select('*').in('id', userIds),
    db.from('events').select('id, user_id, title, kind, starts_at, all_day, location, remind_minutes_before')
      .in('user_id', userIds).gte('starts_at', from).lte('starts_at', weekAhead),
    db.from('sessions').select('id, user_id, kind, task_id, starts_at, ends_at, status')
      .in('user_id', userIds).gte('starts_at', from).lte('starts_at', dayAhead),
    db.from('gigs').select('id, user_id, title, mode, status, starts_at, location, prep_minutes, travel_minutes')
      .in('user_id', userIds).gte('starts_at', from).lte('starts_at', dayAhead),
    db.from('tasks').select('id, user_id, title, status, deadline').in('user_id', userIds).eq('status', 'todo'),
  ]);
  for (const r of [profiles, events, sessions, gigs, tasks]) if (r.error) throw r.error;

  let sent = 0;
  for (const p of profiles.data ?? []) {
    const mine = <T extends { user_id: string }>(rows: T[] | null) => (rows ?? []).filter((r) => r.user_id === p.id);
    const notes = dueNotifications({
      now,
      profile: p as NotifyProfile,
      events: mine(events.data),
      sessions: mine(sessions.data),
      gigs: mine(gigs.data),
      tasks: mine(tasks.data),
    });
    if (!notes.length) continue;

    // claim the keys first: whatever was already logged is skipped, so nothing is sent twice
    const { data: fresh, error: logErr } = await db
      .from('notification_log')
      .upsert(notes.map((n) => ({ user_id: p.id, key: n.key })), { onConflict: 'user_id,key', ignoreDuplicates: true })
      .select('key');
    if (logErr) throw logErr;
    const freshKeys = new Set((fresh ?? []).map((f) => f.key));

    for (const n of notes) {
      if (!freshKeys.has(n.key)) continue;
      const r = await deliver(byUser.get(p.id) ?? [], { title: n.title, body: n.body, url: n.url, tag: n.key });
      sent += r.sent;
    }
  }

  // keep the log small
  if (now.getUTCMinutes() === 0) {
    await db.from('notification_log').delete().lt('sent_at', new Date(now.getTime() - 14 * 24 * 3600_000).toISOString());
  }
  return { users: userIds.length, sent };
}

async function test(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Chýba prihlásenie.' }, 401);
  const { data: user, error } = await db.auth.getUser(token);
  if (error || !user.user) return json({ error: 'Neplatné prihlásenie.' }, 401);

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('user_id', user.user.id);
  if (!subs?.length) return json({ sent: 0, failed: 0, devices: 0 });

  const r = await deliver(subs, {
    title: 'Testovacia notifikácia',
    body: 'Ak toto vidíš, upozornenia z Rozvrhu na tomto zariadení fungujú.',
    url: '/settings',
    tag: `test:${Date.now()}`,
  });
  return json({ ...r, devices: subs.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    const { cronSecret } = await loadConfig();
    if (body.test) return await test(req);
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'Forbidden' }, 403);
    return json(await tick());
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
