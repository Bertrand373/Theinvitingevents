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
live/  admin/              QR guest photo portal and admin dashboard (use assets/css/app.css)
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

## Go-live checklist

1. Bob approves the site on theinvitingevents.pages.dev.
2. Contact relay deployed, URL set, test inquiry received in contact@.
3. Redeploy the API worker so the chat bot has the correct prices:
   `cd workers/api && wrangler deploy` (logged in to the contact@ Cloudflare account).
4. Add theinvitingevents.com to Cloudflare (same account as the Pages project). Before switching, make sure the
   imported DNS keeps all five Google MX records. Add:
   - SPF: `TXT @ "v=spf1 include:_spf.google.com ~all"`
   - DKIM: generate in Google Admin (Apps > Google Workspace > Gmail > Authenticate email), add the
     `google._domainkey` TXT, then click Start authentication
   - DMARC: `TXT _dmarc "v=DMARC1; p=none; rua=mailto:contact@theinvitingevents.com"`
   - Do not import the old Cloudways A record (159.203.138.227) or the `www` CNAME to secure.cloudways.cloud
5. Pages project → Custom domains: add `theinvitingevents.com` and `www.theinvitingevents.com`.
6. At Namecheap, switch nameservers to the two Cloudflare nameservers. The domain stays registered at Namecheap.
7. Check the site, a test inquiry, and inbound mail to contact@. After a week with no issues, cancel Cloudways.

Today the apex record at Namecheap is a CNAME to Cloudways next to the MX records. That blocks SPF and leaves
Bob's outgoing mail unauthenticated. The DNS move above fixes it.

## Media

Photos are local WebP files (`assets/media/photos/NAME.webp`, about 1800px, plus `sm/NAME.webp`, about 820px).
To add photos, convert with `cwebp -q 74 -resize 1800 0 in.jpg -o NAME.webp` (and `-q 70 -resize 820 0` into `sm/`).
Hero videos were re-encoded to 1280px H.264 with no audio (about 6 MB each, under the Pages 25 MB file limit).

## Reviews

The homepage tries the reviews Worker (`worker-lingering-heart-0510`) for live Google reviews. It currently
returns `REQUEST_DENIED` from the Google Places API (key issue), so the page shows seven real Google reviews
saved in index.html instead.
