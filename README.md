# Inviting Events: website

Static site for theinvitingevents.com. No build step. Every push to `main` deploys to Cloudflare Pages
(preview: https://theinvitingevents.pages.dev, on the contact@theinvitingevents.com Cloudflare account).

## Structure

```
index.html                 Home
grand-ballroom/            Room pages (same URLs as the old WordPress site, so Google rankings carry over)
studio-78/
auxiliary-ballroom/
private-lounge/
gallery/  pricing/  quote/  about/  contact/
live/  admin/              QR guest photo portal and the admin (see Admin below)
assets/css/global.css      Design system: tokens, type, components
assets/js/global.js        Nav, mobile menu, reveal, YouTube facades, lightbox
assets/js/chat.js          Concierge chat widget (talks to workers/api /api/chat)
assets/media/              All photos (webp, sm/ = thumbnails), hero videos, logo, favicons, og image
tools/contact-relay.gs     Google Apps Script that emails contact form inquiries to contact@
workers/api/               ie-api Worker: events, guest photos, contact backup, chat
functions/reviews-worker.js  Google reviews Worker source (deployed separately)
```

Design: Cormorant Garamond (display) and Inter (text). Warm black `#0d0b0a`, ivory `#f3ede3`,
paper `#f2ece2`, wine `#611f1d` for actions, champagne `#c9a978` for fine detail. No em dashes in copy.

## Contact form → Gmail

The form on /contact/ does two things:

1. Posts to the Apps Script relay, which emails **contact@theinvitingevents.com** from that same Google
   Workspace account, with Reply-To set to the customer. The subject starts with
   "New Message From Inviting Events" like the old WordPress form, so existing Gmail filters keep working.
2. Saves a backup copy to the ie-api database (`/api/contact`, visible in /admin/).

The form only shows "Message sent" when the email went out. If it fails, the visitor sees the phone number and email.

**Setup (one time):** follow the steps at the top of `tools/contact-relay.gs` while signed in as
contact@theinvitingevents.com, then paste the `/exec` URL into `CONTACT_RELAY` in `contact/index.html`.
Until that is set, the form saves to the backup database only.

## Admin

`/admin/` is Bob's back office, built for his iPhone: inquiries from the contact form (call, text or email in
one tap; opening one marks it read, with Mark as unread), events for the QR guest photo page (create, edit,
go live, text the guest link to the hosts, print table cards), guest photo review (approve one, a selection or
all of an event; take a photo back off the website without deleting it), the guest list (Download guest list,
which opens the share sheet on iPhone), and uploads to the website gallery (with Retry the ones that failed).

**Signing in.** Bob uses his admin password. The page sends it as `Authorization: Bearer <password>` on every
admin call, and the Worker checks it against the `ADMIN_PASSWORD` secret. The password never goes in this repo.
The session lasts until the tab is closed or Bob taps Sign out. If he ticks "Keep me signed in on this iPhone",
the key is also kept in that device's localStorage for 30 days; Sign out (or a rejected key) clears both.

**Home screen.** `admin/manifest.webmanifest` plus the Apple meta tags let Bob add the admin to his home screen
(Share, Add to Home Screen). It opens full screen as "IE Admin" and respects the notch and home bar.

**Appearance.** The Menu (or the sidebar on a computer) has Appearance: Match my phone (default), Light (the
site's paper palette) or Dark. Saved on the device only. The photo viewer stays dark in both, like the Photos
app. iPhone reads the status bar style when a home screen app launches, so after switching appearance there the
status bar text matches from the next launch.

**Table cards.** Each event has Print table cards (`#events/<id>/cards`), and the Events page has general cards
(`#events/cards`). Sizes: 4x6 and 5x7 table cards, 8x10 entrance or bar sign, printed at true size with CSS
`@page`. "This event only" codes open `https://theinvitingevents.com/live/?event=<id>`; "Whichever event is
live" codes open `/live/`, so those cards can stay on the tables. The optional Wi-Fi name and password are saved
on the device. A full-size card page that needs no sign-in (everything comes from the link), for previews and
screenshots:

```
/admin/#card?size=4x6&event=<event id>&name=<event name>&wifi=<network>&password=<wifi password>
/admin/#card?size=5x7                 (general card: "Share your photos from tonight")
/admin/#card?size=8x10&event=<id>&name=<name>
```

Printing that page (its Print button, or the browser's own Print) prints only the card, on paper of that size.

**Works before and after the Worker deploy.** Routes added in this version answer 200 (or 404 with their own
message), so the admin reads the old Worker's generic 404 as "not available yet": Edit and Take off the website
stay hidden on the old Worker, inquiries are marked read on the device, and the x on a website photo falls back
to Delete with a clear confirm.

New and changed Worker routes in this version:

- `PUT /api/events/:id` (admin): edit name, date, room, estimated_guests, notes, start_time, end_time.
- `POST /api/photos/:id/unapprove` (admin): take a photo off the website; guest photos go back to review.
- `POST /api/contact/:id/unread` (admin): mark an inquiry unread.
- `GET /api/event/active`: an event switched on by hand is ignored once its end time plus the grace period has
  passed, so a forgotten switch never shows last week's event to guests.
- `POST /api/guest/checkin`: emails are compared and stored lowercased and trimmed.
- `GET /api/photos?event_id=` (public guest feed): guest names are first name plus last initial.

**Set the secrets and deploy the Worker** (logged in to the contact@ Cloudflare account):

```
cd workers/api
npx wrangler secret put ADMIN_PASSWORD   # paste Bob's admin password when asked
npx wrangler secret put GUEST_SECRET     # paste a long random string, e.g. from: openssl rand -hex 32
npx wrangler deploy
```

Set the secrets first. Without `ADMIN_PASSWORD` the Worker refuses every admin call (503) and the admin shows
"Sign-in is still being set up". `GUEST_SECRET` signs the guest tokens from the QR check-in; if it is
missing the Worker falls back to `ADMIN_PASSWORD`, so changing the admin password would then sign every guest
out of an event in progress. Check it worked: `curl -i https://ie-api.fancy-brook-a8e8.workers.dev/api/stats`
should answer 401.

**Changing the password.** Run `npx wrangler secret put ADMIN_PASSWORD` again. Once the updated Worker is live,
the admin accepts whatever password the Worker accepts. `PW_HASH` in `admin/index.html` is only a fallback for
the older open Worker; its hash is public, so after the deploy it is worth moving Bob to a new, longer password
and deleting `PW_HASH`.

## Domain and DNS

Live on theinvitingevents.com since 2026-10-30. The domain stays registered at Namecheap (renews April 2027),
with its nameservers pointed to Cloudflare (`brenda.ns.cloudflare.com`, `hal.ns.cloudflare.com`). DNS lives in the
contact@ Cloudflare account, next to the Pages project.

- Website: the Pages project has `theinvitingevents.com` and `www.theinvitingevents.com` as custom domains. A
  Redirect Rule sends www to the bare domain with a 301, keeping the path and query string.
- Mail: the five Google MX records, SPF `v=spf1 include:_spf.google.com ~all`, DKIM `google._domainkey`
  (generated in Google Admin under Apps > Google Workspace > Gmail > Authenticate email, signing on) and DMARC
  `_dmarc` at `p=none`.

The old WordPress host (Cloudways) no longer serves anything and can be cancelled.

## Media

Photos are local WebP files (`assets/media/photos/NAME.webp`, about 1800px, plus `sm/NAME.webp`, about 820px).
To add photos, convert with `cwebp -q 74 -resize 1800 0 in.jpg -o NAME.webp` (and `-q 70 -resize 820 0` into `sm/`).
Hero videos are 1440x800 H.264 at the source's 30 fps with no audio (about 2.7 MB each, under the Pages 25 MB file limit).

## Reviews

The homepage tries the reviews Worker (`worker-lingering-heart-0510`) for live Google reviews. It currently
returns `REQUEST_DENIED` from the Google Places API (key issue), so the page shows seven real Google reviews
saved in index.html instead.
