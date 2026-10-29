/**
 * INVITING EVENTS: Website contact form relay (Google Apps Script)
 *
 * Runs inside the contact@theinvitingevents.com Google Workspace account.
 * The website's contact form posts here, and this script emails the inquiry
 * to contact@theinvitingevents.com from that same account, with Reply-To set
 * to the customer. Bob replies in Gmail like any other email.
 *
 * Setup (one time, about 3 minutes):
 *   1. Sign in to Google as contact@theinvitingevents.com, open https://script.google.com
 *   2. New project, name it "Website contact form", replace the code with this file, Save.
 *   3. Deploy > New deployment > type "Web app".
 *      Execute as: Me (contact@theinvitingevents.com). Who has access: Anyone.
 *   4. Deploy, then Authorize access > Allow (it needs permission to send email as you).
 *   5. Copy the Web app URL (ends in /exec) into CONTACT_RELAY in /contact/index.html.
 *   6. Run testRelay() once from the editor to confirm an email arrives.
 *
 * After editing this file later: Deploy > Manage deployments > Edit > Version: New version.
 * The URL stays the same.
 */

const TO = 'contact@theinvitingevents.com';
const FROM_NAME = 'Inviting Events Website';
const DAILY_CAP = 200;          // stops a spam flood from burning the Gmail sending quota
const SEND_CONFIRMATION = false; // true = also send the customer a short "we got your message" email

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Bots: hidden "company" field filled in, or form submitted inhumanly fast. Pretend success.
    if (d.company || (d.elapsed && Number(d.elapsed) < 2500)) return json({ ok: true });

    const name = clean(d.name, 120);
    const email = clean(d.email, 160);
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Name and a valid email are required.' });

    if (!underDailyCap()) return json({ ok: false, error: 'busy' });

    const f = {
      name: name,
      email: email,
      phone: clean(d.phone, 40),
      event_type: clean(d.event_type, 60),
      event_date: clean(d.event_date, 40),
      guests: clean(d.guests, 40),
      room: clean(d.room, 60),
      message: clean(d.message, 5000),
      page: clean(d.page, 200)
    };

    // Keeps the old WordPress subject prefix so any existing Gmail filters still match
    const details = [f.event_type, prettyDate(f.event_date), f.guests && f.guests + ' guests'].filter(String).join(', ');
    const subject = 'New Message From Inviting Events: ' + f.name + (details ? ' (' + details + ')' : '');

    const rows = [
      ['Name', f.name],
      ['Email', f.email],
      ['Phone', f.phone],
      ['Event', f.event_type],
      ['Date', prettyDate(f.event_date)],
      ['Guests', f.guests],
      ['Room', f.room]
    ].filter(r => r[1]);

    const text = rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\n\n' + (f.message || '(no message)') +
      '\n\nReply to this email to answer ' + f.name + ' directly.';

    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1d1815;max-width:560px">' +
      '<p style="margin:0 0 16px;color:#611f1d;font-size:12px;letter-spacing:2px;text-transform:uppercase">New website inquiry</p>' +
      '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">' +
      rows.map(r => '<tr><td style="padding:8px 16px 8px 0;color:#7a6f68;white-space:nowrap;vertical-align:top">' + esc(r[0]) +
        '</td><td style="padding:8px 0;border-bottom:1px solid #eee">' + linkify(r[0], r[1]) + '</td></tr>').join('') +
      '</table>' +
      (f.message ? '<p style="margin:24px 0 0;white-space:pre-wrap;line-height:1.6">' + esc(f.message) + '</p>' : '') +
      '<p style="margin:28px 0 0;color:#7a6f68;font-size:13px">Hit Reply to answer ' + esc(f.name) + ' directly.</p></div>';

    MailApp.sendEmail({ to: TO, replyTo: f.email, name: FROM_NAME, subject: subject, body: text, htmlBody: html });

    if (SEND_CONFIRMATION) {
      MailApp.sendEmail({
        to: f.email,
        name: 'Inviting Events',
        replyTo: TO,
        subject: 'We received your message',
        body: 'Hi ' + f.name.split(' ')[0] + ',\n\nThank you for reaching out to Inviting Events. Robert will get back to you shortly. ' +
          'If your date is close, call or text (678) 517-8963.\n\nInviting Events\n3485 Stone Mountain Hwy, Snellville, GA 30078'
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

// Visiting the URL in a browser shows this, handy to confirm the deployment is live
function doGet() {
  return json({ ok: true, service: 'Inviting Events contact relay' });
}

// Run from the editor to send yourself a sample inquiry
function testRelay() {
  const res = doPost({ postData: { contents: JSON.stringify({
    name: 'Test Inquiry', email: TO, phone: '(678) 517-8963', event_type: 'Wedding',
    event_date: '2027-06-12', guests: '80 to 150', room: 'Grand Ballroom',
    message: 'This is a test from the new website contact form.', elapsed: 10000
  }) } });
  console.log(res.getContent());
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function linkify(label, v) {
  if (label === 'Email') return '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>';
  if (label === 'Phone') return '<a href="tel:' + esc(v.replace(/[^\d+]/g, '')) + '">' + esc(v) + '</a>';
  return esc(v);
}

function prettyDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return s || '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Utilities.formatDate(d, 'America/New_York', 'EEE, MMM d, yyyy');
}

function underDailyCap() {
  const props = PropertiesService.getScriptProperties();
  const key = 'count_' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const n = Number(props.getProperty(key) || 0);
    if (n >= DAILY_CAP) return false;
    props.setProperty(key, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}
