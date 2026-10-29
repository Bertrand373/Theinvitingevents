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
      // ── Events ──
      if (path === '/api/event/active' && method === 'GET') return getActiveEvents(env, H);
      if (path === '/api/events' && method === 'GET') return listEvents(env, H);
      if (path === '/api/events' && method === 'POST') return createEvent(request, env, H);
      if (path.match(/^\/api\/events\/[^/]+\/toggle$/) && method === 'POST') return toggleEvent(path.split('/')[3], request, env, H);
      if (path.match(/^\/api\/events\/[^/]+$/) && method === 'DELETE') return deleteEvent(path.split('/')[3], env, H);

      // ── Guests ──
      if (path === '/api/guest/checkin' && method === 'POST') return guestCheckin(request, env, H);
      if (path === '/api/guests' && method === 'GET') return listGuests(url, env, H);

      // ── Photos ──
      if (path === '/api/photos' && method === 'GET') return listPhotos(url, env, H);
      if (path === '/api/photos/upload' && method === 'POST') return uploadPhoto(request, env, H);
      if (path.match(/^\/api\/photos\/[^/]+\/approve$/) && method === 'POST') return approvePhoto(path.split('/')[3], env, H);
      if (path.match(/^\/api\/photos\/[^/]+$/) && method === 'DELETE') return deletePhoto(path.split('/')[3], request, env, H);

      // ── Admin Upload ──
      if (path === '/api/admin/upload' && method === 'POST') return adminUpload(request, env, H);

      // ── Stats ──
      if (path === '/api/stats' && method === 'GET') return getStats(env, H);

      // ── Contact Form ──
      if (path === '/api/contact' && method === 'POST') return handleContact(request, env, H);
      if (path === '/api/contact/submissions' && method === 'GET') return listContacts(env, H);

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
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
}
function cors() { return new Response(null, { status: 204, headers: corsH() }); }

// ══════════ EVENTS ══════════
async function getActiveEvents(env, H) {
  const active = [];
  const now = new Date();

  const { results: manual } = await env.DB.prepare('SELECT * FROM events WHERE active = 1').all();
  for (const e of manual) active.push({ ...e, status: 'active' });

  const { results: timed } = await env.DB.prepare('SELECT * FROM events WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND active = 0 ORDER BY date DESC').all();
  for (const e of timed) {
    const start = new Date(e.start_time), end = new Date(e.end_time);
    const grace = (e.grace_minutes || 120) * 60000;
    let status = null;
    if (now >= start && now <= end) status = 'active';
    else if (now > end && now <= new Date(end.getTime() + grace)) status = 'grace_period';
    else if (now < start && start.toISOString().split('T')[0] === now.toISOString().split('T')[0]) status = 'upcoming';
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
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO events (id,name,date,room,estimated_guests,notes,active,start_time,end_time,timezone,grace_minutes,created_at) VALUES (?,?,?,?,?,?,0,?,?,?,?,?)'
  ).bind(id, name, date, room || 'grand', estimated_guests || 0, notes || '', start_time || null, end_time || null, 'America/New_York', grace_minutes || 120, new Date().toISOString()).run();
  return new Response(JSON.stringify({ id, name }), { status: 201, headers: H });
}

async function toggleEvent(id, request, env, H) {
  const { active } = await request.json();
  if (active) await env.DB.prepare('UPDATE events SET active = 0').run();
  await env.DB.prepare('UPDATE events SET active = ? WHERE id = ?').bind(active ? 1 : 0, id).run();
  return new Response(JSON.stringify({ id, active }), { headers: H });
}

async function deleteEvent(id, env, H) {
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ deleted: true }), { headers: H });
}

// ══════════ GUESTS ══════════
async function guestCheckin(request, env, H) {
  const { name, email, event_id } = await request.json();
  if (!name || !email || !event_id) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: H });

  const existing = await env.DB.prepare('SELECT * FROM guests WHERE email = ? AND event_id = ?').bind(email, event_id).first();
  if (existing) {
    const token = await genToken(existing.id);
    return new Response(JSON.stringify({ guest_id: existing.id, token, returning: true }), { headers: H });
  }

  const id = crypto.randomUUID();
  const token = await genToken(id);
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
async function listPhotos(url, env, H) {
  const eid = url.searchParams.get('event_id');
  const gid = url.searchParams.get('guest_id');
  const status = url.searchParams.get('status');
  const dest = url.searchParams.get('dest');

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
  const mapped = results.map(p => ({ ...p, url: `/media/${p.r2_key}`, thumbnail_url: `/media/${p.r2_key}` }));
  return new Response(JSON.stringify(mapped), { headers: H });
}

async function uploadPhoto(request, env, H) {
  const fd = await request.formData();
  const file = fd.get('photo'), event_id = fd.get('event_id'), guest_id = fd.get('guest_id');
  if (!file || !event_id) return new Response(JSON.stringify({ error: 'Missing photo or event_id' }), { status: 400, headers: H });

  // Check event upload window
  if (event_id !== 'demo') {
    const evt = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(event_id).first();
    if (evt?.end_time) {
      const grace = (evt.grace_minutes || 120) * 60000;
      if (new Date() > new Date(new Date(evt.end_time).getTime() + grace))
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
  // Check ownership: guest can only delete their own, admin can delete any
  const auth = request.headers.get('Authorization') || '';
  const isAdmin = auth === 'Bearer admin';

  const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: H });

  if (!isAdmin) {
    const guestId = request.headers.get('X-Guest-Id');
    if (!guestId || photo.guest_id !== guestId) {
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

// ══════════ ADMIN UPLOAD ══════════
async function adminUpload(request, env, H) {
  const fd = await request.formData();
  const files = fd.getAll('files');
  const destination = fd.get('destination') || 'gallery';
  const uploaded = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const ext = file.name.split('.').pop().toLowerCase();
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
  const guests = await env.DB.prepare('SELECT COUNT(DISTINCT email) as c FROM guests').first();
  const contacts = await env.DB.prepare('SELECT COUNT(*) as c FROM contact_submissions').first().catch(() => ({ c: 0 }));
  return new Response(JSON.stringify({ events: events.c, photos: photos.c, guests: guests.c, contacts: contacts.c }), { headers: H });
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

// ══════════ AI CHAT ══════════
async function handleChat(request, env, H) {
  const { message, history } = await request.json();
  if (!message) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400, headers: H });

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Chat not configured' }), { status: 503, headers: H });

  const systemPrompt = `You are the virtual concierge for Inviting Events, a full-service event hall at 3485 Stone Mountain Hwy, Snellville, GA 30078 (Atlanta metro). You speak warmly and professionally, with Southern hospitality. Be concise and helpful. Never make up information. If something is not covered below, say "Robert can help you with that detail" and offer the contact page or his number.

The owner is Robert Pope (customers call him Bob or Mr. Robert). Say "reach out to Robert", never "our team". Phone: call or text (678) 517-8963. Email: contact@theinvitingevents.com. Tours are by appointment only.

When helpful, include action links in this format: [Button Text](URL), for example [Schedule a Tour](/contact/), [See Pricing](/pricing/), [Build an Estimate](/quote/), [View the Gallery](/gallery/). Only include them when naturally relevant.

SPACES (each has its own page):
- Grand Ballroom (/grand-ballroom/): main hall, 80 to 250 guests. The space can be altered to fit your vision. Connected restrooms plus a full ladies' suite with a shower and a mirror room/makeup station.
- Studio 78 (/studio-78/): our most unique hall, 50 to 80 guests, for smaller and intimate events. Connected restrooms plus a ladies' suite with a shower and a private lounge area.
- Auxiliary Ballroom (/auxiliary-ballroom/): beside the Grand Ballroom, 30 to 60 guests, lounge-style. Pool table, projector, 110 inch screen, 3 flat screen TVs and sound system. One partial restroom.
- Private Lounge & Bar (/private-lounge/): a flat-rate offer for the Auxiliary Ballroom, up to 70 guests, for game nights, comedy nights, birthdays and more.

PRICING (exact, per room, by day). Every room is offered as Bronze (room only, 8 hours), Silver (room with linens, 8 hours) or Gold (total room decor with full setup, service and clean-up, 6 hours). Prices are Mon-Thurs / Fri and Sun / Sat:
- Grand Ballroom (rates up to 150 guests, inquire for up to 250): Bronze $1,500 / $2,000 / $2,400. Silver $2,200 / $2,600 / $3,000. Gold $2,800 / $4,000 / $5,100.
- Studio 78: Bronze $1,200 / $1,600 / $2,000. Silver $1,700 / $2,100 / $2,500. Gold $2,500 / $2,900 / $3,300.
- Auxiliary Ballroom: Bronze $800 / $1,200 / $1,600. Silver $1,300 / $1,700 / $2,100. Gold $2,000 / $2,400 / $2,800.
- Private Lounge & Bar: Mon-Thurs $1,000, Fri-Sat $1,500, Sunday $1,200, for 6 hours. Includes pool table, projector screen, 3 flat screen TVs, sound system, hi-boy and cocktail tables, bar stools, chairs, 6 chafing dishes, black linens and decorative lighting. Kitchen access costs extra.
- A $300 refundable security/damage deposit is required for every booking.
- Bronze and Silver include tables, chairs/barstools, decorative lighting, dance floor and bar tables. Gold adds your choice of linens and colors, charger plates, cloth napkins, chair sashes, table runners, upscale floral, centerpieces, glass plates, silverware, wine and champagne glasses, candles, glass mirrors, table number stands, silver chafing dishes, serving trays, cake risers, drink dispensers, coffee urns, lighted bar area and the kitchen (oven, hot boxes, prep tables, refrigerator).

POLICIES AND FAQ:
- Rental time depends on the package: Bronze and Silver 8 hours, Gold 6 hours, Private Lounge 6 hours. Wedding ceremonies get 2 additional hours. Additional hours may be purchased. Suggest confirming exact timing with Robert.
- All events end no later than 1:00 AM. No hours can be bought past that.
- Guests may bring their own food and beverages, including alcohol. We do not provide catering or bartending, but we have a list of preferred vendors (DJs, photographers, bartenders).
- We provide the full setup, service and clean-up for all events.
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
  if (!obj) return new Response('Not found', { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('Cache-Control', 'public, max-age=86400');
  h.set('Access-Control-Allow-Origin', '*');
  return new Response(obj.body, { headers: h });
}

// ══════════ HELPERS ══════════
async function genToken(id) {
  const raw = `${id}-${Date.now()}-${crypto.randomUUID()}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
