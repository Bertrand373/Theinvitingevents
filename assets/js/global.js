/* ══════════════════════════════════════════
   INVITING EVENTS: Global JS
   Nav state, mobile menu, reveal on scroll, background videos, YouTube facades, lightbox.
   ══════════════════════════════════════════ */
(function () {
  document.documentElement.classList.remove('no-js');

  // While a full-screen layer is open, everything else on the page is taken out of the tab order
  function isolate(keep) {
    Array.from(document.body.children).forEach(el => {
      if (el.tagName === 'SCRIPT' || keep.some(k => k && (k === el || el.contains(k)))) return;
      if (keep) el.inert = true;
    });
  }
  function release() {
    Array.from(document.body.children).forEach(el => { el.inert = false; });
  }
  function trapTab(e, root, extra) {
    if (e.key !== 'Tab') return;
    const items = Array.from(root.querySelectorAll('a[href], button:not([disabled])')).concat(extra || []);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // Nav turns solid once the page scrolls (or immediately on pages without a photo hero)
  const nav = document.querySelector('.nav');
  const alwaysSolid = nav && nav.hasAttribute('data-solid');
  function setNav() {
    if (!nav) return;
    nav.classList.toggle('is-solid', alwaysSolid || window.scrollY > 40);
  }
  setNav();
  window.addEventListener('scroll', setNav, { passive: true });

  // Mobile menu
  const toggle = document.querySelector('.nav__toggle');
  const menu = document.getElementById('menu');
  function menuOpen() { return document.body.classList.contains('menu-open'); }
  function setMenu(open, restoreFocus) {
    if (open === menuOpen()) return;
    document.body.classList.toggle('menu-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      isolate([nav, menu]);
      const first = menu && menu.querySelector('a');
      if (first) first.focus();
    } else {
      release();
      if (restoreFocus && toggle) toggle.focus();
    }
  }
  if (toggle) toggle.addEventListener('click', () => setMenu(!menuOpen(), true));
  document.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => {
    if (!menuOpen()) return;
    if (e.key === 'Escape') setMenu(false, true);
    if (menu) trapTab(e, menu, toggle ? [toggle] : []);
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });

  // Reveal on scroll, triggered a little before the block reaches the screen
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0, rootMargin: '0px 0px 60% 0px' }) : null;
  document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('is-in'));

  // Background videos: load and play only when allowed and on screen, with a pause control
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !!(navigator.connection && navigator.connection.saveData);
  document.querySelectorAll('video[data-autoplay]').forEach(v => {
    v.muted = true;
    v.removeAttribute('autoplay');
    if (calm) return;
    let userPaused = false;
    const host = v.closest('.hero, .page-hero') || v.parentElement;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'video-toggle';
    const label = () => {
      const playing = !v.paused;
      btn.setAttribute('aria-label', playing ? 'Pause background video' : 'Play background video');
      btn.classList.toggle('is-paused', !playing);
    };
    btn.addEventListener('click', () => {
      if (v.paused) { userPaused = false; v.play().catch(() => {}); }
      else { userPaused = true; v.pause(); }
    });
    v.addEventListener('play', label);
    v.addEventListener('pause', label);
    host.appendChild(btn);
    label();
    const play = () => { if (!userPaused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) play(); else v.pause(); });
      }, { threshold: 0.15 }).observe(v);
    } else play();
  });

  // YouTube facades: <button class="yt" data-yt="VIDEO_ID">. On click the button is replaced by the player.
  document.querySelectorAll('.yt[data-yt]').forEach(el => {
    const id = el.getAttribute('data-yt');
    if (!el.querySelector('img')) {
      const img = new Image();
      img.loading = 'lazy'; img.alt = '';
      img.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
      el.prepend(img);
    }
    el.addEventListener('click', () => {
      const player = document.createElement('div');
      player.className = el.className + ' is-playing';
      const f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
      f.title = (el.getAttribute('aria-label') || 'Video').replace(/^Play (the )?/i, '');
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      player.appendChild(f);
      el.replaceWith(player);
      f.focus();
    }, { once: true });
  });

  // Lightbox: any [data-lightbox] group of links to images. Clicks are delegated, so links added
  // after load (photos published from the admin) open here too.
  let lb = null, img, count, list = [], i = 0, opener = null;
  const show = n => {
    i = (n + list.length) % list.length;
    img.src = list[i].href;
    img.alt = (list[i].querySelector('img') || {}).alt || '';
    count.textContent = (i + 1) + ' / ' + list.length;
  };
  const close = () => {
    lb.classList.remove('is-open');
    document.body.classList.remove('lightbox-open');
    document.body.style.overflow = '';
    release();
    if (opener) opener.focus();
  };
  function build() {
    lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Photo viewer');
    lb.innerHTML = '<img alt=""><button class="lightbox__close" aria-label="Close">&times;</button>' +
      '<button class="lightbox__prev" aria-label="Previous photo">&#8592;</button>' +
      '<button class="lightbox__next" aria-label="Next photo">&#8594;</button><div class="lightbox__count" aria-live="polite"></div>';
    document.body.appendChild(lb);
    img = lb.querySelector('img'); count = lb.querySelector('.lightbox__count');
    lb.querySelector('.lightbox__close').onclick = close;
    lb.querySelector('.lightbox__prev').onclick = () => show(i - 1);
    lb.querySelector('.lightbox__next').onclick = () => show(i + 1);
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
  }
  if (document.querySelector('a[data-lightbox]')) build();
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-lightbox]');
    if (!a) return;
    e.preventDefault();
    if (!lb) build();
    const g = a.getAttribute('data-lightbox');
    list = Array.from(document.querySelectorAll('a[data-lightbox]')).filter(x => x.getAttribute('data-lightbox') === g);
    opener = a; show(list.indexOf(a));
    lb.classList.add('is-open');
    document.body.classList.add('lightbox-open');
    document.body.style.overflow = 'hidden';
    isolate([lb]);
    lb.querySelector('.lightbox__close').focus();
  });
  document.addEventListener('keydown', e => {
    if (!lb || !lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
    trapTab(e, lb);
  });
})();
