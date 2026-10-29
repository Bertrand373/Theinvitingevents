/* ══════════════════════════════════════════
   INVITING EVENTS: Global JS
   Nav state, mobile menu, reveal on scroll, YouTube facades, lightbox.
   ══════════════════════════════════════════ */
(function () {
  document.documentElement.classList.remove('no-js');

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
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
  }
  if (toggle) toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  document.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });

  // Reveal on scroll
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('is-in'));

  // Background videos: skip autoplay for reduced motion and data saver
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (navigator.connection && navigator.connection.saveData);
  document.querySelectorAll('video[data-autoplay]').forEach(v => {
    if (calm) { v.removeAttribute('autoplay'); v.pause(); return; }
    v.muted = true;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  });

  // YouTube facades: <button class="yt" data-yt="VIDEO_ID">, iframe loads on click
  document.querySelectorAll('.yt[data-yt]').forEach(el => {
    const id = el.getAttribute('data-yt');
    if (!el.querySelector('img')) {
      const img = new Image();
      img.loading = 'lazy'; img.alt = '';
      img.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
      el.prepend(img);
    }
    el.addEventListener('click', () => {
      if (el.classList.contains('is-playing')) return;
      const f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
      f.title = el.getAttribute('aria-label') || 'Video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      el.appendChild(f);
      el.classList.add('is-playing');
    });
  });

  // Lightbox: any [data-lightbox] group of links to images
  const groups = {};
  document.querySelectorAll('a[data-lightbox]').forEach(a => {
    const g = a.getAttribute('data-lightbox');
    (groups[g] = groups[g] || []).push(a);
  });
  if (Object.keys(groups).length) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.innerHTML = '<img alt=""><button class="lightbox__close" aria-label="Close">&times;</button>' +
      '<button class="lightbox__prev" aria-label="Previous">&#8592;</button>' +
      '<button class="lightbox__next" aria-label="Next">&#8594;</button><div class="lightbox__count"></div>';
    document.body.appendChild(lb);
    const img = lb.querySelector('img'), count = lb.querySelector('.lightbox__count');
    let list = [], i = 0;
    const show = n => {
      i = (n + list.length) % list.length;
      img.src = list[i].href;
      img.alt = (list[i].querySelector('img') || {}).alt || '';
      count.textContent = (i + 1) + ' / ' + list.length;
    };
    let opener = null;
    const close = () => {
      lb.classList.remove('is-open');
      document.body.classList.remove('lightbox-open');
      document.body.style.overflow = '';
      if (opener) opener.focus();
    };
    Object.values(groups).forEach(items => items.forEach((a, n) => a.addEventListener('click', e => {
      e.preventDefault(); list = items; opener = a; show(n);
      lb.classList.add('is-open');
      document.body.classList.add('lightbox-open');
      document.body.style.overflow = 'hidden';
      lb.querySelector('.lightbox__close').focus();
    })));
    lb.querySelector('.lightbox__close').onclick = close;
    lb.querySelector('.lightbox__prev').onclick = () => show(i - 1);
    lb.querySelector('.lightbox__next').onclick = () => show(i + 1);
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
  }
})();
