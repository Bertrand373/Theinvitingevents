// ═══════════════════════════════════════════════════════
// Inviting Events — API Worker
// Cloudflare Workers + D1 + R2
// Deploy: wrangler deploy
// ═══════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') return cors();

    const headers = { 'Content-Type': 'application/json', ...corsHeaders() };

    try {
      // ── Event Routes ──
      if (path === '/api/event/active' && method === 'GET') {
        return getActiveEvent(env, headers);
      }
      if (path === '/api/events' && method === 'GET') {
        return listEvents(env, headers);
      }
      if (path === '/api/events' && method === 'POST') {
        return createEvent(request, env, headers);
      }
      if (path.startsWith('/api/events/') && path.endsWith('/toggle') && method === 'POST') {
        const id = path.split('/')[3];
        return toggleEvent(id, request, env, headers);
      }

      // ── Guest Routes ──
      if (path === '/api/guest/checkin' && method === 'POST') {
        return guestCheckin(request, env, headers);
      }
      if (path === '/api/guests' && method === 'GET') {
        return listGuests(url, env, headers);
      }

      // ── Photo Routes ──
      if (path === '/api/photos' && method === 'GET') {
        return listPhotos(url, env, headers);
      }
      if (path === '/api/photos/upload' && method === 'POST') {
        return uploadPhoto(request, env, headers);
      }
      if (path.startsWith('/api/photos/') && path.endsWith('/approve') && method === 'POST') {
        const id = path.split('/')[3];
        return approvePhoto(id, env, headers);
      }

      // ── Admin Upload ──
      if (path === '/api/admin/upload' && method === 'POST') {
        return adminUpload(request, env, headers);
      }

      // ── Stats ──
      if (path === '/api/stats' && method === 'GET') {
        return getStats(env, headers);
      }

      // ── Serve R2 images ──
      if (path.startsWith('/media/')) {
        return serveMedia(path, env);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }
};

// ══════════ CORS ══════════
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
function cors() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// ══════════ EVENTS ══════════
async function getActiveEvent(env, headers) {
  const event = await env.DB.prepare(
    'SELECT * FROM events WHERE active = 1 LIMIT 1'
  ).first();
  if (!event) return new Response(JSON.stringify({ error: 'No active event' }), { status: 404, headers });
  return new Response(JSON.stringify(event), { headers });
}

async function listEvents(env, headers) {
  const { results } = await env.DB.prepare(
    'SELECT *, (SELECT COUNT(*) FROM photos WHERE photos.event_id = events.id) as photo_count, (SELECT COUNT(*) FROM guests WHERE guests.event_id = events.id) as guest_count FROM events ORDER BY date DESC'
  ).all();
  return new Response(JSON.stringify(results), { headers });
}

async function createEvent(request, env, headers) {
  const body = await request.json();
  const { name, date, room, estimated_guests, notes } = body;
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO events (id, name, date, room, estimated_guests, notes, active, created_at) VALUES (?,?,?,?,?,?,0,?)'
  ).bind(id, name, date, room || 'grand', estimated_guests || 0, notes || '', new Date().toISOString()).run();

  return new Response(JSON.stringify({ id, name }), { status: 201, headers });
}

async function toggleEvent(id, request, env, headers) {
  const body = await request.json();
  const active = body.active ? 1 : 0;

  // Deactivate all events first
  if (active) {
    await env.DB.prepare('UPDATE events SET active = 0').run();
  }
  await env.DB.prepare('UPDATE events SET active = ? WHERE id = ?').bind(active, id).run();

  return new Response(JSON.stringify({ id, active }), { headers });
}

// ══════════ GUESTS ══════════
async function guestCheckin(request, env, headers) {
  const body = await request.json();
  const { name, email, event_id } = body;

  if (!name || !email || !event_id) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers });
  }

  // Check if guest already checked in for this event
  const existing = await env.DB.prepare(
    'SELECT * FROM guests WHERE email = ? AND event_id = ?'
  ).bind(email, event_id).first();

  if (existing) {
    const token = await generateToken(existing.id, env);
    return new Response(JSON.stringify({ guest_id: existing.id, token, returning: true }), { headers });
  }

  const id = crypto.randomUUID();
  const token = await generateToken(id, env);

  await env.DB.prepare(
    'INSERT INTO guests (id, name, email, event_id, checked_in_at) VALUES (?,?,?,?,?)'
  ).bind(id, name, email, event_id, new Date().toISOString()).run();

  return new Response(JSON.stringify({ guest_id: id, token }), { status: 201, headers });
}

async function listGuests(url, env, headers) {
  const event_id = url.searchParams.get('event_id');
  let query = 'SELECT guests.*, (SELECT COUNT(*) FROM photos WHERE photos.guest_id = guests.id) as photo_count FROM guests';
  const binds = [];

  if (event_id) {
    query += ' WHERE event_id = ?';
    binds.push(event_id);
  }
  query += ' ORDER BY checked_in_at DESC';

  const stmt = env.DB.prepare(query);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return new Response(JSON.stringify(results), { headers });
}

// ══════════ PHOTOS ══════════
async function listPhotos(url, env, headers) {
  const event_id = url.searchParams.get('event_id');
  const guest_id = url.searchParams.get('guest_id');
  const status = url.searchParams.get('status'); // pending, approved, all
  const dest = url.searchParams.get('dest'); // gallery, ballroom page, etc.

  let query = 'SELECT photos.*, guests.name as guest_name FROM photos LEFT JOIN guests ON photos.guest_id = guests.id WHERE 1=1';
  const binds = [];

  if (event_id) { query += ' AND photos.event_id = ?'; binds.push(event_id); }
  if (guest_id) { query += ' AND photos.guest_id = ?'; binds.push(guest_id); }
  if (status === 'approved') { query += ' AND photos.approved = 1'; }
  if (status === 'pending') { query += ' AND photos.approved = 0'; }
  if (dest) { query += ' AND photos.destination = ?'; binds.push(dest); }

  query += ' ORDER BY photos.uploaded_at DESC';

  const stmt = env.DB.prepare(query);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();

  // Map R2 keys to public URLs
  const mapped = results.map(p => ({
    ...p,
    url: `/media/${p.r2_key}`,
    thumbnail_url: `/media/thumb_${p.r2_key}`,
  }));

  return new Response(JSON.stringify(mapped), { headers });
}

async function uploadPhoto(request, env, headers) {
  const formData = await request.formData();
  const file = formData.get('photo');
  const event_id = formData.get('event_id');
  const guest_id = formData.get('guest_id');

  if (!file || !event_id) {
    return new Response(JSON.stringify({ error: 'Missing photo or event_id' }), { status: 400, headers });
  }

  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop().toLowerCase();
  const r2Key = `events/${event_id}/${id}.${ext}`;

  // Upload to R2
  await env.MEDIA.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { guest_id: guest_id || '', event_id },
  });

  // TODO: Generate thumbnail (can use Workers Image Resizing or do client-side)

  // Save to D1
  await env.DB.prepare(
    'INSERT INTO photos (id, event_id, guest_id, r2_key, filename, size, mime_type, approved, source, uploaded_at) VALUES (?,?,?,?,?,?,?,0,?,?)'
  ).bind(id, event_id, guest_id || null, r2Key, file.name, file.size, file.type, 'guest', new Date().toISOString()).run();

  return new Response(JSON.stringify({
    id, url: `/media/${r2Key}`, r2_key: r2Key
  }), { status: 201, headers });
}

async function approvePhoto(id, env, headers) {
  await env.DB.prepare('UPDATE photos SET approved = 1 WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ id, approved: true }), { headers });
}

// ══════════ ADMIN UPLOAD ══════════
async function adminUpload(request, env, headers) {
  const formData = await request.formData();
  const files = formData.getAll('files');
  const destination = formData.get('destination') || 'gallery';
  const watermark = formData.get('watermark') !== 'no';

  const uploaded = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const ext = file.name.split('.').pop().toLowerCase();
    const r2Key = `admin/${destination}/${id}.${ext}`;

    // TODO: Apply watermark via Workers Image Resizing or canvas
    await env.MEDIA.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { destination, watermarked: watermark ? 'true' : 'false' },
    });

    await env.DB.prepare(
      'INSERT INTO photos (id, event_id, guest_id, r2_key, filename, size, mime_type, approved, source, destination, uploaded_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)'
    ).bind(id, null, null, r2Key, file.name, file.size, file.type, 'admin', destination, new Date().toISOString()).run();

    uploaded.push({ id, url: `/media/${r2Key}` });
  }

  return new Response(JSON.stringify({ uploaded }), { status: 201, headers });
}

// ══════════ STATS ══════════
async function getStats(env, headers) {
  const events = await env.DB.prepare('SELECT COUNT(*) as c FROM events').first();
  const photos = await env.DB.prepare('SELECT COUNT(*) as c FROM photos').first();
  const guests = await env.DB.prepare('SELECT COUNT(DISTINCT email) as c FROM guests').first();

  return new Response(JSON.stringify({
    events: events.c,
    photos: photos.c,
    guests: guests.c,
  }), { headers });
}

// ══════════ SERVE MEDIA from R2 ══════════
async function serveMedia(path, env) {
  const key = path.replace('/media/', '');
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const respHeaders = new Headers();
  object.writeHttpMetadata(respHeaders);
  respHeaders.set('Cache-Control', 'public, max-age=86400');
  respHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers: respHeaders });
}

// ══════════ AUTH HELPERS ══════════
async function generateToken(guestId, env) {
  // Simple token — in production use JWT or signed tokens
  const raw = `${guestId}-${Date.now()}-${crypto.randomUUID()}`;
  const encoded = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const token = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return token;
}
