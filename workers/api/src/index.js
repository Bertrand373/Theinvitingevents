// ═══════════════════════════════════════════════════════
// Inviting Events : API Worker v2
// Cloudflare Workers + D1 + R2
// Endpoints: events, guests, photos, contact, chat
// ═══════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return cors();
    const H = { 'Content-Type': 'application/json', ...corsH() };

    try {
      // Admin routes need "Authorization: Bearer <ADMIN_PASSWORD>". requireAdmin returns an error
      // response (401, or 503 when the secret is not set) or null when the caller is the admin.
      const admin = () => requireAdmin(request, env, H);

      // ── Events ──
      if (path === '/api/event/active' && method === 'GET') return getActiveEvents(env, H);
      if (path === '/api/events' && method === 'GET') return (await admin()) || listEvents(env, H);
      if (path === '/api/events' && method === 'POST') return (await admin()) || createEvent(request, env, H);
      if (path.match(/^\/api\/events\/[^/]+\/toggle$/) && method === 'POST') return (await admin()) || toggleEvent(path.split('/')[3], request, env, H);
      if (path.match(/^\/api\/events\/[^/]+$/) && method === 'PUT') return (await admin()) || updateEvent(path.split('/')[3], request, env, H);
      if (path.match(/^\/api\/events\/[^/]+$/) && method === 'DELETE') return (await admin()) || deleteEvent(path.split('/')[3], env, H);

      // ── Guests ──
      if (path === '/api/guest/checkin' && method === 'POST') return guestCheckin(request, env, H);
      if (path === '/api/guests' && method === 'GET') return (await admin()) || listGuests(url, env, H);

      // ── Photos ──
      if (path === '/api/photos' && method === 'GET') return listPhotos(url, request, env, H);
      if (path === '/api/photos/upload' && method === 'POST') return uploadPhoto(request, env, H);
      if (path.match(/^\/api\/photos\/[^/]+\/approve$/) && method === 'POST') return (await admin()) || approvePhoto(path.split('/')[3], env, H);
      if (path.match(/^\/api\/photos\/[^/]+\/unapprove$/) && method === 'POST') return (await admin()) || unapprovePhoto(path.split('/')[3], env, H);
      if (path.match(/^\/api\/photos\/[^/]+$/) && method === 'DELETE') return deletePhoto(path.split('/')[3], request, env, H);

      // ── Admin Upload ──
      if (path === '/api/admin/upload' && method === 'POST') return (await admin()) || adminUpload(request, env, H);

      // ── Stats ──
      if (path === '/api/stats' && method === 'GET') return (await admin()) || getStats(env, H);

      // ── Contact Form ──
      if (path === '/api/contact' && method === 'POST') return handleContact(request, env, H);
      if (path === '/api/contact/submissions' && method === 'GET') return (await admin()) || listContacts(env, H);
      if (path.match(/^\/api\/contact\/[^/]+\/read$/) && method === 'POST') return (await admin()) || markContactRead(path.split('/')[3], env, H);
      if (path.match(/^\/api\/contact\/[^/]+\/unread$/) && method === 'POST') return (await admin()) || markContactUnread(path.split('/')[3], env, H);
      if (path.match(/^\/api\/contact\/[^/]+$/) && method === 'DELETE') return (await admin()) || deleteContact(path.split('/')[3], env, H);

      // ── AI Chat ──
      if (path === '/api/chat' && method === 'POST') return handleChat(request, env, H);

      // ── Media ──
      if (path.startsWith('/media/')) return serveMedia(path, env);

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: H });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: H });
    }
  }
};

// ══════════ CORS ══════════
function corsH() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Guest-Id' };
}
function cors() { return new Response(null, { status: 204, headers: corsH() }); }
function json(data, status, H) { return new Response(JSON.stringify(data), { status, headers: H }); }

// ══════════ ADMIN AUTH ══════════
// The admin page sends "Authorization: Bearer <password>" (URI-encoded). The password lives only in the
// ADMIN_PASSWORD secret: wrangler secret put ADMIN_PASSWORD. Never commit it.
async function adminCheck(request, env) {
  const secret = env.ADMIN_PASSWORD;
  if (!secret) return 'unset';
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return 'denied';
  let decoded = m[1];
  try { decoded = decodeURIComponent(m[1]); } catch (e) {}
  const raw = await safeEqual(m[1], secret);
  const dec = await safeEqual(decoded, secret);
  return (raw || dec) ? 'ok' : 'denied';
}

async function requireAdmin(request, env, H) {
  const r = await adminCheck(request, env);
  if (r === 'ok') return null;
  if (r === 'unset') return json({ error: 'Admin password not configured' }, 503, H);
  return json({ error: 'Unauthorized' }, 401, H);
}

// Constant-time comparison: hash both sides to a fixed length, then compare every byte.
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b)))
  ]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// ══════════ EVENT TIMES ══════════
// Times are Eastern. Older events were saved without an offset ("2026-05-02T19:00:00"), newer ones with one
// ("2026-05-02T19:00:00-04:00"). Read both as the right instant instead of as UTC.
const TZ = 'America/New_York';
function tzOffsetMs(date, tz) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
}
function eventTime(s) {
  if (!s) return null;
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s)) return new Date(s);
  const guess = new Date(s + 'Z').getTime();
  if (isNaN(guess)) return new Date(s);
  let t = guess - tzOffsetMs(new Date(guess), TZ);
  const again = guess - tzOffsetMs(new Date(t), TZ);
  if (again !== t) t = again;
  return new Date(t);
}
function easternDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// ══════════ EVENTS ══════════
async function getActiveEvents(env, H) {
  const active = [];
  const now = new Date();

  // An event switched on by hand stays live until its end time plus the grace period. After that the switch is
  // ignored, so a forgotten switch never puts last week's event in front of tonight's guests.
  const { results: manual } = await env.DB.prepare('SELECT * FROM events WHERE active = 1').all();
  for (const e of manual) {
    const end = eventTime(e.end_time);
    if (end && !isNaN(end)) {
      const closeAt = new Date(end.getTime() + (e.grace_minutes || 120) * 60000);
      if (now > closeAt) continue;
      if (now > end) { active.push({ ...e, status: 'grace_period' }); continue; }
    }
    active.push({ ...e, status: 'active' });
  }

  const { results: timed } = await env.DB.prepare('SELECT * FROM events WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND active = 0 ORDER BY date DESC').all();
  for (const e of timed) {
    const start = eventTime(e.start_time), end = eventTime(e.end_time);
    const grace = (e.grace_minutes || 120) * 60000;
    let status = null;
    if (now >= start && now <= end) status = 'active';
    else if (now > end && now <= new Date(end.getTime() + grace)) status = 'grace_period';
    else if (now < start && easternDay(start) === easternDay(now)) status = 'upcoming';
    if (status) active.push({ ...e, status });
  }

  if (!active.length) return new Response(JSON.stringify({ error: 'No active event' }), { status: 404, headers: H });
  if (active.length === 1) return new Response(JSON.stringify(active[0]), { headers: H });
  return new Response(JSON.stringify({ multiple: true, events: active }), { headers: H });
}

async function listEvents(env, H) {
  const { results } = await env.DB.prepare(
    'SELECT *, (SELECT COUNT(*) FROM photos WHERE photos.event_id = events.id) as photo_count, (SELECT COUNT(*) FROM guests WHERE guests.event_id = events.id) as guest_count FROM events ORDER BY date DESC'
  ).all();
  return new Response(JSON.stringify(results), { headers: H });
}

async function createEvent(request, env, H) {
  const { name, date, room, estimated_guests, notes, start_time, end_time, grace_minutes } = await request.json();
  if (!name || !String(name).trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return json({ error: 'Name and date required' }, 400, H);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO events (id,name,date,room,estimated_guests,notes,active,start_time,end_time,timezone,grace_minutes,created_at) VALUES (?,?,?,?,?,?,0,?,?,?,?,?)'
  ).bind(id, name, date, room || 'grand', estimated_guests || 0, notes || '', start_time || null, end_time || null, 'America/New_York', grace_minutes || 120, new Date().toISOString()).run();
  return new Response(JSON.stringify({ id, name }), { status: 201, headers: H });
}

// Edit an event. Only the fields sent are changed. A missing event answers 404 with "gone: true", so the admin
// can tell it apart from an older Worker that does not have this route yet.
async function updateEvent(id, request, env, H) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'Please check the details and try again' }, 400, H); }
  if (!b || typeof b !== 'object') return json({ error: 'Please check the details and try again' }, 400, H);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!ev) return json({ error: 'This event is no longer here', gone: true }, 404, H);

  const name = b.name !== undefined ? String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 200) : ev.name;
  const date = b.date !== undefined ? String(b.date || '') : ev.date;
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Name and date required' }, 400, H);
  const room = b.room !== undefined ? String(b.room || 'grand').slice(0, 80) : ev.room;
  const guests = b.estimated_guests !== undefined ? Number(b.estimated_guests || 0) : Number(ev.estimated_guests || 0);
  if (!Number.isInteger(guests) || guests < 0 || guests > 100000) return json({ error: 'Expected guests should be a whole number' }, 400, H);
  const notes = b.notes !== undefined ? String(b.notes || '').slice(0, 2000) : ev.notes;
  const start = b.start_time !== undefined ? (b.start_time ? String(b.start_time) : null) : ev.start_time;
  const end = b.end_time !== undefined ? (b.end_time ? String(b.end_time) : null) : ev.end_time;
  const st = eventTime(start), et = eventTime(end);
  if ((start && (!st || isNaN(st))) || (end && (!et || isNaN(et)))) return json({ error: 'Please check the start and end times' }, 400, H);
  if (st && et && et <= st) return json({ error: 'The end time needs to be after the start time' }, 400, H);

  await env.DB.prepare('UPDATE events SET name = ?, date = ?, room = ?, estimated_guests = ?, notes = ?, start_time = ?, end_time = ? WHERE id = ?')
    .bind(name, date, room, guests, notes || '', start, end, id).run();
  const row = await env.DB.prepare(
    'SELECT *, (SELECT COUNT(*) FROM photos WHERE photos.event_id = events.id) as photo_count, (SELECT COUNT(*) FROM guests WHERE guests.event_id = events.id) as guest_count FROM events WHERE id = ?'
  ).bind(id).first();
  return json(row, 200, H);
}

async function toggleEvent(id, request, env, H) {
  const { active } = await request.json();
  if (active) await env.DB.prepare('UPDATE events SET active = 0').run();
  await env.DB.prepare('UPDATE events SET active = ? WHERE id = ?').bind(active ? 1 : 0, id).run();
  return new Response(JSON.stringify({ id, active }), { headers: H });
}

async function deleteEvent(id, env, H) {
  const refs = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM guests WHERE event_id = ?) AS g, (SELECT COUNT(*) FROM photos WHERE event_id = ?) AS p').bind(id, id).first();
  if (refs && (refs.g || refs.p)) return json({ error: 'This event has guests or photos, so it is kept.' }, 409, H);
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ deleted: true }), { headers: H });
}

// ══════════ GUESTS ══════════
async function guestCheckin(request, env, H) {
  const body = (await request.json().catch(() => null)) || {};
  const name = String(body.name || '').trim(), event_id = body.event_id;
  // Emails are compared and stored lowercased, so "Jane@Mail.com" and "jane@mail.com" are the same guest.
  // lower(trim(email)) also matches guests saved before this change. Check-in stays open after an event closes,
  // because the guest page refreshes its token that way.
  const email = String(body.email || '').trim().toLowerCase();
  if (!name || !email || !event_id) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: H });

  const existing = await env.DB.prepare('SELECT * FROM guests WHERE lower(trim(email)) = lower(trim(?)) AND event_id = ? ORDER BY checked_in_at ASC').bind(email, event_id).first();
  if (existing) {
    const token = await guestToken(existing.id, env);
    return new Response(JSON.stringify({ guest_id: existing.id, token, returning: true }), { headers: H });
  }

  const id = crypto.randomUUID();
  const token = await guestToken(id, env);
  await env.DB.prepare('INSERT INTO guests (id,name,email,event_id,checked_in_at) VALUES (?,?,?,?,?)').bind(id, name, email, event_id, new Date().toISOString()).run();
  return new Response(JSON.stringify({ guest_id: id, token }), { status: 201, headers: H });
}

async function listGuests(url, env, H) {
  const eid = url.searchParams.get('event_id');
  let q = 'SELECT guests.*, (SELECT COUNT(*) FROM photos WHERE photos.guest_id = guests.id) as photo_count FROM guests';
  const b = [];
  if (eid) { q += ' WHERE event_id = ?'; b.push(eid); }
  q += ' ORDER BY checked_in_at DESC';
  const stmt = env.DB.prepare(q);
  const { results } = b.length ? await stmt.bind(...b).all() : await stmt.all();
  return new Response(JSON.stringify(results), { headers: H });
}

// ══════════ PHOTOS ══════════
async function listPhotos(url, request, env, H) {
  const eid = url.searchParams.get('event_id');
  const gid = url.searchParams.get('guest_id');
  const status = url.searchParams.get('status');
  const dest = url.searchParams.get('dest');

  // Public: the guest feed for one event, or approved photos for the website gallery. Anything else is admin.
  const isAdmin = (await adminCheck(request, env)) === 'ok';
  const publicGallery = !eid && !!dest && status === 'approved';
  if (!isAdmin && !eid && !publicGallery) return requireAdmin(request, env, H);

  let q = 'SELECT photos.*, guests.name as guest_name FROM photos LEFT JOIN guests ON photos.guest_id = guests.id WHERE 1=1';
  const b = [];
  if (eid) { q += ' AND photos.event_id = ?'; b.push(eid); }
  if (gid) { q += ' AND photos.guest_id = ?'; b.push(gid); }
  if (status === 'approved') q += ' AND photos.approved = 1';
  if (status === 'pending') q += ' AND photos.approved = 0';
  if (dest) { q += ' AND photos.destination = ?'; b.push(dest); }
  q += ' ORDER BY photos.uploaded_at DESC';

  const stmt = env.DB.prepare(q);
  const { results } = b.length ? await stmt.bind(...b).all() : await stmt.all();
  const mapped = results.map(p => {
    const row = { ...p, url: `/media/${p.r2_key}`, thumbnail_url: `/media/${p.r2_key}` };
    if (publicGallery && !isAdmin) { delete row.guest_id; delete row.guest_name; }
    else if (!isAdmin) row.guest_name = shortName(row.guest_name);  // public guest feed: "Tasha R.", never the full name
    return row;
  });
  return new Response(JSON.stringify(mapped), { headers: H });
}

// "Tasha Robinson" becomes "Tasha R." for anyone who is not the admin.
function shortName(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return null;
  if (w.length === 1) return w[0];
  return w[0] + ' ' + w[w.length - 1].charAt(0).toUpperCase() + '.';
}

const MAX_UPLOAD = 95 * 1024 * 1024;

// Reject oversized bodies before request.formData() buffers them.
function tooLarge(request, H) {
  const len = Number(request.headers.get('Content-Length') || 0);
  return len > MAX_UPLOAD + 1024 * 1024 ? json({ error: 'File too large. The limit is 95 MB.' }, 413, H) : null;
}

async function uploadPhoto(request, env, H) {
  const big = tooLarge(request, H);
  if (big) return big;
  const fd = await request.formData();
  const file = fd.get('photo'), event_id = fd.get('event_id'), guest_id = fd.get('guest_id');
  if (!file || typeof file !== 'object' || !event_id) return new Response(JSON.stringify({ error: 'Missing photo or event_id' }), { status: 400, headers: H });
  if (!/^(image|video)\//.test(file.type || '')) return json({ error: 'Photos and videos only' }, 415, H);
  if (file.size > MAX_UPLOAD) return json({ error: 'File too large. The limit is 95 MB.' }, 413, H);

  // Guests upload with the token they got at check-in. The admin password works too.
  const isAdmin = (await adminCheck(request, env)) === 'ok';
  if (!isAdmin) {
    const g = await guestCheck(request, env, guest_id);
    if (g === 'denied') return json({ error: 'Please check in again' }, 401, H);
    if (g === 'ok') {
      const guest = await env.DB.prepare('SELECT event_id FROM guests WHERE id = ?').bind(guest_id).first();
      if (!guest || String(guest.event_id) !== String(event_id)) return json({ error: 'Please check in again' }, 401, H);
    }
  }

  // Check event upload window
  if (event_id !== 'demo') {
    const evt = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(event_id).first();
    if (evt?.end_time) {
      const grace = (evt.grace_minutes || 120) * 60000;
      if (new Date() > new Date(eventTime(evt.end_time).getTime() + grace))
        return new Response(JSON.stringify({ error: 'Event ended. Uploads closed.' }), { status: 403, headers: H });
    }
  }

  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop().toLowerCase();
  const r2Key = `events/${event_id}/${id}.${ext}`;

  await env.MEDIA.put(r2Key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { guest_id: guest_id || '', event_id } });
  await env.DB.prepare('INSERT INTO photos (id,event_id,guest_id,r2_key,filename,size,mime_type,approved,source,uploaded_at) VALUES (?,?,?,?,?,?,?,0,?,?)')
    .bind(id, event_id, guest_id || null, r2Key, file.name, file.size, file.type, 'guest', new Date().toISOString()).run();

  return new Response(JSON.stringify({ id, url: `/media/${r2Key}` }), { status: 201, headers: H });
}

async function deletePhoto(id, request, env, H) {
  // Admin can delete any photo. A guest can delete their own with the X-Guest-Id header.
  const isAdmin = (await adminCheck(request, env)) === 'ok';
  const guestId = request.headers.get('X-Guest-Id');
  if (!isAdmin && !guestId) return requireAdmin(request, env, H);

  const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: H });

  if (!isAdmin) {
    if ((await guestCheck(request, env, guestId)) === 'denied') return json({ error: 'Please check in again' }, 401, H);
    if (photo.guest_id !== guestId) {
      return new Response(JSON.stringify({ error: 'Not authorized : you can only delete your own photos' }), { status: 403, headers: H });
    }
  }

  // Delete from R2
  try { await env.MEDIA.delete(photo.r2_key); } catch (e) {}
  // Delete from D1
  await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ deleted: true }), { headers: H });
}

async function approvePhoto(id, env, H) {
  await env.DB.prepare('UPDATE photos SET approved = 1 WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ id, approved: true }), { headers: H });
}

// Takes a photo off the website without deleting it. A guest photo goes back to "to review" (and back to its event
// if it had been moved to the gallery). An admin upload keeps its gallery spot, so approving it puts it back.
// Answers 200 even when the id is gone, so a 404 here always means an older Worker.
async function unapprovePhoto(id, env, H) {
  await env.DB.prepare(
    "UPDATE photos SET approved = 0, destination = CASE WHEN COALESCE(source, 'guest') <> 'admin' AND destination = 'gallery' THEN 'event' ELSE destination END WHERE id = ?"
  ).bind(id).run();
  return json({ id, approved: false }, 200, H);
}

// ══════════ ADMIN UPLOAD ══════════
async function adminUpload(request, env, H) {
  const big = tooLarge(request, H);
  if (big) return big;
  const fd = await request.formData();
  const files = fd.getAll('files').filter(f => f && typeof f === 'object' && f.size > 0);
  const destination = fd.get('destination') || 'gallery';
  if (!['gallery', 'grand', 'auxiliary', 'studio78', 'lounge', 'homepage'].includes(destination)) return json({ error: 'Unknown destination' }, 400, H);
  if (!files.length) return json({ error: 'No files' }, 400, H);
  for (const file of files) {
    if (!/^(image|video)\//.test(file.type || '')) return json({ error: 'Photos and videos only' }, 415, H);
  }
  const uploaded = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const named = (file.name || '').split('.').pop().toLowerCase();
    const ext = /^[a-z0-9]{2,5}$/.test(named) ? named : (file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5);
    const r2Key = `admin/${destination}/${id}.${ext}`;
    await env.MEDIA.put(r2Key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { destination } });
    await env.DB.prepare('INSERT INTO photos (id,event_id,guest_id,r2_key,filename,size,mime_type,approved,source,destination,uploaded_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)')
      .bind(id, null, null, r2Key, file.name, file.size, file.type, 'admin', destination, new Date().toISOString()).run();
    uploaded.push({ id, url: `/media/${r2Key}` });
  }
  return new Response(JSON.stringify({ uploaded }), { status: 201, headers: H });
}

// ══════════ STATS ══════════
async function getStats(env, H) {
  const events = await env.DB.prepare('SELECT COUNT(*) as c FROM events').first();
  const photos = await env.DB.prepare('SELECT COUNT(*) as c FROM photos').first();
  const guests = await env.DB.prepare('SELECT COUNT(DISTINCT lower(email)) as c FROM guests').first();
  const contacts = await env.DB.prepare('SELECT COUNT(*) as c FROM contact_submissions').first().catch(() => ({ c: 0 }));
  const unread = await env.DB.prepare('SELECT COUNT(*) as c FROM contact_submissions WHERE read = 0').first().catch(() => ({ c: 0 }));
  const guestPhotos = await env.DB.prepare("SELECT COUNT(*) as c, COALESCE(SUM(CASE WHEN approved = 0 THEN 1 ELSE 0 END), 0) as p FROM photos WHERE source = 'guest'").first();
  return new Response(JSON.stringify({
    events: events.c, photos: photos.c, guests: guests.c, contacts: contacts.c,
    unread_contacts: unread.c, guest_photos: guestPhotos.c, pending_photos: guestPhotos.p
  }), { headers: H });
}

// ══════════ CONTACT FORM ══════════
async function handleContact(request, env, H) {
  const { name, email, phone, event_type, event_date, message } = await request.json();
  if (!name || !email) return new Response(JSON.stringify({ error: 'Name and email required' }), { status: 400, headers: H });

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO contact_submissions (id,name,email,phone,event_type,event_date,message,created_at,read) VALUES (?,?,?,?,?,?,?,?,0)'
  ).bind(id, name, email, phone || '', event_type || '', event_date || '', message || '', new Date().toISOString()).run();

  return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: H });
}

async function listContacts(env, H) {
  const { results } = await env.DB.prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC').all();
  return new Response(JSON.stringify(results), { headers: H });
}

// Both answer 200 even when the id is already gone, so a 404 here always means "older Worker".
async function markContactRead(id, env, H) {
  await env.DB.prepare('UPDATE contact_submissions SET read = 1 WHERE id = ?').bind(id).run();
  return json({ id, read: true }, 200, H);
}

async function markContactUnread(id, env, H) {
  await env.DB.prepare('UPDATE contact_submissions SET read = 0 WHERE id = ?').bind(id).run();
  return json({ id, read: false }, 200, H);
}

async function deleteContact(id, env, H) {
  await env.DB.prepare('DELETE FROM contact_submissions WHERE id = ?').bind(id).run();
  return json({ id, deleted: true }, 200, H);
}

// ══════════ AI CHAT ══════════
async function handleChat(request, env, H) {
  const { message, history } = await request.json();
  if (!message) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400, headers: H });

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Chat not configured' }), { status: 503, headers: H });

  const systemPrompt = `You are the virtual concierge for Inviting Events, a full-service event hall at 3485 Stone Mountain Hwy, Snellville, GA 30078 (Atlanta metro). You speak warmly and professionally, with Southern hospitality. Be concise and helpful. Never make up information. If something is not covered below, say "Robert can help you with that detail" and offer the contact page or his number.

The owner is Robert Pope (customers call him Bob or Mr. Robert). The business is run by Robert Pope and his sons, Jamal and Elijah. Never mention anyone else by name. Say "reach out to Robert", never "our team". Phone: call or text (678) 517-8963. Email: contact@theinvitingevents.com. Tours are by appointment only.

When helpful, include action links in this format: [Button Text](URL), for example [Schedule a Tour](/contact/), [See Pricing](/pricing/), [Build an Estimate](/quote/), [View the Gallery](/gallery/). Only include them when naturally relevant.

SPACES (each has its own page):
- Grand Ballroom (/grand-ballroom/): main hall, 80 to 250 guests. The space can be arranged to fit your event. Connected restrooms plus a full ladies' suite with a shower and a mirror room/makeup station.
- Studio 78 (/studio-78/): the smaller hall, 50 to 80 guests. It is in its own building, separate from the Grand and Auxiliary Ballrooms. Connected restrooms plus a ladies' suite with a shower and a private lounge area.
- Auxiliary Ballroom (/auxiliary-ballroom/): beside the Grand Ballroom, 30 to 60 guests, lounge-style. Pool table, projector with a 110-inch screen, 3 flat-screen TVs and sound system. One partial restroom.
- Private Lounge & Bar (/private-lounge/): a special flat-rate deal for the Auxiliary Ballroom, up to 60 guests, for game nights, comedy nights, birthdays and more. It is not all-inclusive.

PRICING (exact, per room, by day). Every room is offered as Bronze (room only, 8 hours), Silver (room with linens, 8 hours) or Gold (total room decor with full setup, service and cleanup, 6 hours). Bronze and Silver include 8 hours because the client handles their own setup, decorating and cleanup. Gold includes 6 hours because the staff handles setup, service and cleanup. Prices are current. Prices are Mon to Thurs / Fri and Sun / Saturday:
- Grand Ballroom (these rates are for up to 150 guests; for more than 150 guests the rate is quoted in person at a tour, so never quote a price above 150 guests): Bronze $1,500 / $2,000 / $2,400. Silver $2,200 / $2,600 / $3,000. Gold $2,800 / $4,000 / $5,100.
- Studio 78: Bronze $1,200 / $1,600 / $2,000. Silver $1,700 / $2,100 / $2,500. Gold $2,500 / $2,900 / $3,300.
- Auxiliary Ballroom: Bronze $800 / $1,200 / $1,600. Silver $1,300 / $1,700 / $2,100. Gold $2,000 / $2,400 / $2,800.
- Private Lounge & Bar (up to 60 guests, a special deal that is not all-inclusive): Mon to Thurs $1,000, Sunday $1,200, Fri and Sat $1,500, for 6 hours. Includes pool table, projector screen, 3 flat-screen TVs, sound system, highboy and cocktail tables, barstools, chairs, 6 chafing dishes, black linens and decorative lighting. Kitchen access costs extra.
- A $300 refundable security/damage deposit is required for every booking.
- Bronze and Silver include tables, chairs and barstools, decorative lighting, the dance floor and highboy tables. The Auxiliary Ballroom also has its sound system, projector, screens and pool table. Gold in every room adds full setup, service and cleanup, your choice of linens and colors, charger plates and cloth napkins, silver chafing dishes and trays, drink dispensers and coffee urns, the lighted bar area and the kitchen (oven, hot boxes, prep tables, refrigerator). In the Grand Ballroom, Gold also includes chair sashes and table runners, upscale floral centerpieces, glass plates and silverware, wine and champagne glasses, and votive and floating candles. In Studio 78 and the Auxiliary Ballroom, Gold also includes centerpieces and candles. For exact details, point people to /pricing/.

POLICIES AND FAQ:
- Rental time: Bronze and Silver include 8 hours because the client handles their own setup, decorating and cleanup. Gold includes 6 hours because the staff handles setup, service and cleanup. The Private Lounge is 6 hours. Wedding ceremonies may get two additional hours, so suggest asking Robert about ceremony time. Additional hours may be purchased.
- All events end no later than 1:00 AM. No hours can be bought past that.
- Guests may bring their own food and beverages, including alcohol. We do not provide catering or bartending, but we have a list of preferred vendors (DJs, photographers, bartenders).
- Renting without decorations and service is possible with Bronze or Silver, where the client handles setup, decorating and cleanup. With Gold, the staff provides the full setup, service and cleanup.
- Parking: yes, adequate parking.
- Linens: two warehouses with your choice of colors and decor. Lighting can be set to your colors. Balloon decor is available.

SITE PAGES: Home, Spaces (the four room pages above), Gallery, Pricing, Estimate (/quote/), About, Contact.

Keep responses to 2 or 3 sentences unless more detail is needed. Never use em dashes. If someone asks about availability or a specific date, encourage them to schedule a tour or contact Robert, since you cannot see the calendar.`;

  const messages = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages
      })
    });

    const data = await res.json();
    const reply = data.content?.[0]?.text || 'I apologize, I had trouble processing that. Could you try rephrasing?';
    return new Response(JSON.stringify({ reply }), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ reply: 'I apologize, I\'m having a moment. Please try again or reach out to us directly at theinvitingevents.com/contact/' }), { headers: H });
  }
}

// ══════════ MEDIA ══════════
async function serveMedia(path, env) {
  const key = path.replace('/media/', '');
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('Cache-Control', 'public, max-age=86400');
  h.set('Access-Control-Allow-Origin', '*');
  return new Response(obj.body, { headers: h });
}

// ══════════ HELPERS ══════════
// Guest tokens are an HMAC of the guest id, so they can be checked without storing them.
// Key: GUEST_SECRET (wrangler secret put GUEST_SECRET), else ADMIN_PASSWORD. With neither set,
// tokens are random and uploads are not checked (the old behavior), so a live event never breaks.
async function guestToken(id, env) {
  const secret = env.GUEST_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return genToken(id);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('guest:' + id));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function guestCheck(request, env, guestId) {
  if (!env.GUEST_SECRET && !env.ADMIN_PASSWORD) return 'unset';
  if (!guestId) return 'denied';
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return 'denied';
  return (await safeEqual(m[1].trim(), await guestToken(guestId, env))) ? 'ok' : 'denied';
}

async function genToken(id) {
  const raw = `${id}-${Date.now()}-${crypto.randomUUID()}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
