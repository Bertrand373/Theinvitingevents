# Inviting Events — New Site

## Project Structure

```
ie-site/
├── index.html              ← Homepage
├── _redirects              ← Cloudflare Pages URL redirects
├── assets/
│   ├── css/global.css      ← Shared styles (dark glass theme)
│   ├── js/global.js        ← Shared JS (nav, scroll animations)
│   └── images/
│       ├── logo.png        ← Script logo (white on transparent)
│       ├── favicon.png     ← IE favicon
│       └── grand-aux-halls.png  ← Venue photo (placeholder — replace with per-room photos)
├── contact/index.html      ← Smart contact form
├── pricing/index.html      ← (TODO) Pricing page with quote builder
├── quote/index.html        ← Interactive quote builder (standalone)
├── gallery/index.html      ← (TODO) Photo/video gallery
├── about/index.html        ← (TODO) About page
└── live/index.html         ← QR guest portal (permanent URL for table cards)
```

## Deployment to Cloudflare Pages

### First Time Setup

1. **Create a GitHub repo:**
   ```bash
   cd ie-site
   git init
   git add .
   git commit -m "Initial site build"
   ```
   Push to GitHub (public or private repo — either works).

2. **Connect to Cloudflare Pages:**
   - Log in to dash.cloudflare.com
   - Go to Workers & Pages → Create Application → Pages
   - Connect your GitHub account and select the repo
   - Build settings:
     - Build command: (leave blank — it's static HTML)
     - Build output directory: `/` (root)
   - Click Deploy

3. **Set custom domain:**
   - In Cloudflare Pages project settings → Custom Domains
   - Add `theinvitingevents.com` and `www.theinvitingevents.com`
   - Since the domain is on Namecheap with Cloudflare DNS, update
     the nameservers to Cloudflare if not already done, OR add a
     CNAME record pointing to your Pages project URL.

### Updating the Site

Just push to the GitHub repo — Cloudflare auto-deploys on every push.

```bash
git add .
git commit -m "Updated gallery photos"
git push
```

## Video Files — Moving Off YouTube

### Current video sources (hosted on WordPress):
- Hero slider 1: `SliderBanner-Images-1440-x-800-px-3.mp4`
- Hero slider 2: `SliderBanner-aux-update-1440-x-800-px.mp4`

### Current YouTube embeds:
- Grand Ballroom walkthrough: `kznJeQBwWfg`
- Decor color options: `8a4K1lXphtI`

### To self-host videos on R2:
1. Go to Cloudflare dashboard → R2 → Create Bucket → name it `ie-media`
2. Upload source MP4 files to the bucket
3. Enable public access on the bucket (R2 Settings → Public Access)
4. Update video `src` attributes in HTML to:
   `https://ie-media.<your-account>.r2.dev/filename.mp4`

### Recommended video specs:
- Hero videos: 1920x1080 MP4, H.264, 30fps, 4-6 Mbps
- Provide a poster frame (first-frame JPG) for each video
  so something shows before the video loads on slow connections

## Contact Form — Backend Setup

The contact form currently submits to `#` (no backend).
Options for making it work:

### Option A: Cloudflare Workers (recommended)
Create a Worker that:
1. Receives the form POST
2. Sends an email via Mailchannels or Resend API
3. Sends to contact@theinvitingevents.com
4. Returns a success/error response

### Option B: Formspree / Formsubmit (quickest)
Change the form `action` to a Formspree endpoint:
```html
<form action="https://formspree.io/f/YOUR_ID" method="POST">
```
Free for 50 submissions/month.

## QR Guest Portal — Next Steps

The `/live/` page is the scaffold. Full implementation needs:

1. **Cloudflare Worker API** (`/api/live-event`)
   - GET: returns current active event
   - POST: receives photo uploads, stores to R2

2. **Cloudflare D1 Database**
   - Events table (id, name, date, active flag)
   - Uploads table (id, event_id, file_url, uploaded_by, timestamp)

3. **Admin Dashboard** (`/admin/`)
   - Protected page (simple password or Cloudflare Access)
   - List upcoming events
   - Toggle which event is "live"
   - View uploaded photos per event
   - Upload branded photos

## DNS Changes (when ready to go live)

In Namecheap DNS (or Cloudflare DNS if you migrate nameservers):

1. Remove the A record pointing to Cloudways (159.203.138.227)
2. Remove the CNAME for `www` pointing to secure.cloudways.cloud
3. Add CNAME: `@` → `ie-site.pages.dev` (your Cloudflare Pages URL)
4. Add CNAME: `www` → `ie-site.pages.dev`
5. Keep the Google Workspace MX records and verification CNAMEs

**Important:** Don't change DNS until Bob has reviewed and approved
the new site. Use the free `*.pages.dev` URL for previewing.

## Brand Reference

- **Colors:** #611f1d (burgundy), #fffff0 (cream), #e6e6e6 (gray), #7ab648 (green), #000 (black)
- **Fonts:** Cardo (H1 headings), Julius Sans One (H2/labels), Questrial (body)
- **Logo:** White brush script on transparent/dark background
- **Vibe:** Dark, premium, elegant with restraint. Glassmorphism on black canvas.
