/* ==========================================================================
   Fly Bodies Fitness — interaction runtime
   Modules: scroll physics · section snap · parallax · split reveal ·
            magnetic elements · cursor · matrix accordion · slideshows · FAQ orb · drawer ·
            live studio status · booking calendar
   ========================================================================== */
(() => {
  'use strict';

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE    = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const lerp = (a, b, t) => a + (b - a) * t;

  const STUDIO = {
    tz: 'America/New_York',
    open: 7, close: 19,           // 24h
    days: [1, 2, 3, 4, 5, 6],     // Mon–Sat
    booking: 'https://www.vagaro.com/flybodies/classes',
  };

  /* ------------------------------------------------------------------------
     1 · SCROLL PHYSICS (Lenis)
     lerp 0.085 ≈ 400ms settle; wheelMultiplier 0.9 tames trackpad inertia.
     ------------------------------------------------------------------------ */
  let lenis = null;
  let scrollY = window.scrollY;
  const chromeBar = $('.chrome');
  const onScroll = (y) => { scrollY = y; chromeBar?.classList.toggle('is-scrolled', y > 8); };   // frosted header firms up
  onScroll(scrollY);

  if (!REDUCED && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
    lenis.on('scroll', (e) => onScroll(e.scroll));
  } else {
    addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
  }

  // In-page anchors route through Lenis for eased travel
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) {
      // Menu links: the open drawer has Lenis stopped, and a stopped Lenis ignores
      // scrollTo — restart it first (the drawer closes itself right after).
      lenis.start();
      lenis.scrollTo(target, { duration: 1.4, force: true });
    } else target.scrollIntoView();
  }));

  /* ------------------------------------------------------------------------
     2 · SECTION SNAP
     After 140ms of scroll idle, settle to nearest row top if within 28% of vh.
     Rows taller than viewport snap only at their head, never mid-content.
     ------------------------------------------------------------------------ */
  const rows = $$('.row');
  let rowTops = [];
  const measureRows = () => { rowTops = rows.map((r) => r.getBoundingClientRect().top + scrollY); };

  if (lenis) {
    let idle;
    let snapping = false;
    lenis.on('scroll', () => {
      if (snapping) return;
      clearTimeout(idle);
      idle = setTimeout(() => {
        const vh = innerHeight;
        let best = null, dist = Infinity;
        rowTops.forEach((top) => {
          const d = Math.abs(top - scrollY);
          if (d < dist) { dist = d; best = top; }
        });
        if (best !== null && dist > 2 && dist < vh * 0.28) {
          snapping = true;
          lenis.scrollTo(best, { duration: 0.9, onComplete: () => { snapping = false; } });
          setTimeout(() => { snapping = false; }, 1000);
        }
      }, 140);
    });
  }

  /* ------------------------------------------------------------------------
     3 · PARALLAX — [data-speed]: translateY = (center offset) × speed
     ------------------------------------------------------------------------ */
  // Parallax off on narrow viewports: stacked layouts leave no slack for offset
  const parallax = REDUCED || innerWidth <= 860 ? [] : $$('[data-speed]').map((el) => ({ el, speed: parseFloat(el.dataset.speed), mid: 0 }));
  const measureParallax = () => parallax.forEach((p) => {
    p.el.style.transform = '';
    const r = p.el.getBoundingClientRect();
    p.mid = r.top + scrollY + r.height / 2;
  });

  /* ------------------------------------------------------------------------
     4 · SPLIT-TYPE REVEAL — words → chars, stagger 22ms, IO threshold 0.35
     ------------------------------------------------------------------------ */
  $$('[data-split]').forEach((el) => {
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.setAttribute('aria-hidden', 'true');
            [...part].forEach((ch) => {
              const c = document.createElement('span');
              c.className = 'c';
              c.style.setProperty('--i', i++);
              c.textContent = ch;
              w.append(c);
            });
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
  });

  const revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
  }), { threshold: 0.35 });
  $$('[data-split]').forEach((el) => revealIO.observe(el));

  /* ------------------------------------------------------------------------
     5 · MAGNETIC ELEMENTS — [data-magnetic]
     Radius: 30px beyond element bounds. Pull: 0.35 body / 0.6 label.
     Spring: lerp 0.18 in, 0.12 release.
     ------------------------------------------------------------------------ */
  const MAG_RADIUS = 30;
  const cursorEl = $('.cursor');
  const pointer = { x: -999, y: -999, cx: -999, cy: -999 };

  const magnets = FINE && !REDUCED ? $$('[data-magnetic]').map((el) => ({
    el,
    label: el.querySelector('.cta__label, .burger__label'),
    x: 0, y: 0, tx: 0, ty: 0, active: false,
  })) : [];

  if (FINE) {
    addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    document.addEventListener('pointerleave', () => cursorEl?.classList.add('is-hidden'));
    document.addEventListener('pointerenter', () => cursorEl?.classList.remove('is-hidden'));
  }

  const tickMagnets = () => {
    let anyActive = false;
    magnets.forEach((m) => {
      const r = m.el.getBoundingClientRect();
      if (r.width === 0) return;
      // Distance from pointer to rect edge (0 when inside)
      const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
      const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
      const inField = Math.hypot(dx, dy) <= MAG_RADIUS;

      if (inField) {
        m.tx = (pointer.x - (r.left + r.width / 2)) * 0.35;
        m.ty = (pointer.y - (r.top + r.height / 2)) * 0.35;
        anyActive = true;
      } else { m.tx = 0; m.ty = 0; }

      const k = inField ? 0.18 : 0.12;
      m.x = lerp(m.x, m.tx, k);
      m.y = lerp(m.y, m.ty, k);
      if (Math.abs(m.x) < 0.01 && Math.abs(m.y) < 0.01 && !inField) { m.x = m.y = 0; }

      m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
      if (m.label) m.label.style.transform = `translate3d(${(m.x * 0.6).toFixed(2)}px, ${(m.y * 0.6).toFixed(2)}px, 0)`;
    });
    cursorEl?.classList.toggle('is-magnet', anyActive);
  };

  /* ------------------------------------------------------------------------
     6 · MASTER rAF LOOP — one frame driver for Lenis, parallax, magnets, cursor
     ------------------------------------------------------------------------ */
  const frame = (t) => {
    lenis?.raf(t);

    const vhMid = scrollY + innerHeight / 2;
    for (const p of parallax) {
      const off = (vhMid - p.mid) * p.speed;
      p.el.style.transform = `translate3d(0, ${off.toFixed(2)}px, 0)`;
    }

    if (FINE) {
      pointer.cx = lerp(pointer.cx, pointer.x, 0.25);
      pointer.cy = lerp(pointer.cy, pointer.y, 0.25);
      if (cursorEl) cursorEl.style.transform = `translate3d(${pointer.cx}px, ${pointer.cy}px, 0)`;
      if (magnets.length) tickMagnets();
    }
    requestAnimationFrame(frame);
  };

  const measure = () => { measureRows(); measureParallax(); };   // header height is CSS-defined (--chrome-h)
  addEventListener('resize', () => requestAnimationFrame(measure));
  addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  measure();
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------------------
     7 · MATRICES — each [data-matrix]: hover (desktop) / focus + tap (all) → data-active
     Column tween handled in CSS (grid-template-columns, 900ms expo-out).
     ------------------------------------------------------------------------ */
  $$('[data-matrix]').forEach((matrix) => {
    const panels = $$('[data-panel]', matrix);
    const activate = (idx) => {
      if (matrix.dataset.active === String(idx)) return;
      matrix.dataset.active = idx;
      panels.forEach((p, i) => {
        p.classList.toggle('is-active', i === idx);
        p.setAttribute('aria-expanded', i === idx);
      });
      setTimeout(measure, 950);   // mobile accordion changes row heights
    };
    panels.forEach((p, i) => {
      if (FINE) p.addEventListener('pointerenter', () => activate(i));
      p.addEventListener('focus', () => activate(i));
      p.addEventListener('click', () => activate(i));
      p.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); panels[(i + 1) % panels.length].focus(); }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); panels[(i + panels.length - 1) % panels.length].focus(); }
      });
    });
    activate(0);
  });

  /* ------------------------------------------------------------------------
     7b · SLIDESHOWS — [data-slideshow] > [data-slide][data-dur] (s)
     Timer-driven so loop length is exact (Rehab + Kid reels = 15s). Video slides
     restart on entry; progress hairline tweens linearly over each slide.
     Runs only while its panel is open AND on screen. Reduced motion: slide 1.
     ------------------------------------------------------------------------ */
  $$('[data-slideshow]').forEach((box) => {
    const items = $$('[data-slide]', box);
    const bar = $('[data-slide-bar]', box);
    const panel = box.closest('[data-panel]');
    let idx = 0;
    let timer = null;
    let running = false;
    let onScreen = false;

    const live = () => !REDUCED && onScreen && (!panel || panel.classList.contains('is-active'));
    const isVid = (el) => el.tagName === 'VIDEO';

    const go = (n) => {
      idx = n;
      items.forEach((el, k) => {
        el.classList.toggle('is-on', k === n);
        if (isVid(el) && k !== n) el.pause();
      });
      const el = items[n];
      const ms = parseFloat(el.dataset.dur) * 1000;
      if (isVid(el)) { el.currentTime = 0; el.play().catch(() => {}); }
      if (bar) {
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        void bar.offsetWidth;
        bar.style.transition = `transform ${ms}ms linear`;
        bar.style.transform = 'scaleX(1)';
      }
      timer = setTimeout(() => go((n + 1) % items.length), ms);
    };

    const start = () => {
      if (running) return;
      running = true;
      items.forEach((el) => { if (isVid(el)) el.preload = 'auto'; });
      go(idx);
    };
    const stop = () => {
      running = false;
      clearTimeout(timer);
      items.forEach((el) => { if (isVid(el)) el.pause(); });
      if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; }
    };

    const sync = () => (live() ? start() : stop());
    if (panel) new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { threshold: 0.2 }).observe(box);
  });

  /* ------------------------------------------------------------------------
     7c · FAQ ORB — hover opens (fine pointer, 250ms close grace), tap/click
     pins it open; Esc, outside click, or opening the drawer closes it.
     Panel scrolls natively (data-lenis-prevent).
     ------------------------------------------------------------------------ */
  const faq = $('[data-faq]');
  let setFaq = () => {};
  if (faq) {
    const orb = $('[data-faq-orb]', faq);
    const panel = $('#faq-panel');
    let pinned = false;
    let closeT;
    setFaq = (open) => {
      clearTimeout(closeT);
      if (open === faq.classList.contains('is-open')) return;
      orb.setAttribute('aria-expanded', open);
      if (open) {
        panel.hidden = false;
        void panel.offsetWidth;            // commit start state so the transition runs
        faq.classList.add('is-open');
      } else {
        pinned = false;
        faq.classList.remove('is-open');
        const done = () => { if (!faq.classList.contains('is-open')) panel.hidden = true; };
        REDUCED ? done() : setTimeout(done, 450);
      }
    };
    if (FINE) {
      faq.addEventListener('pointerenter', () => setFaq(true));
      faq.addEventListener('pointerleave', () => { if (!pinned) closeT = setTimeout(() => setFaq(false), 250); });
    }
    orb.addEventListener('click', () => {
      const open = faq.classList.contains('is-open');
      if (open && pinned) { setFaq(false); return; }
      pinned = true;
      setFaq(true);
    });
    document.addEventListener('pointerdown', (e) => { if (!faq.contains(e.target)) setFaq(false); });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && faq.classList.contains('is-open')) { setFaq(false); orb.focus({ preventScroll: true }); }
    });
  }

  /* ------------------------------------------------------------------------
     8 · DRAWER — circle clip reveal, Esc/links close, focus return, scroll lock
     ------------------------------------------------------------------------ */
  const burger = $('.burger');
  const drawer = $('#drawer');
  // viaKeyboard: move focus into/out of the drawer only for keyboard users — on touch,
  // programmatic focus paints the :focus-visible ring on MENU after every close.
  const setDrawer = (open, viaKeyboard = false) => {
    burger.setAttribute('aria-expanded', open);
    burger.querySelector('.burger__label').textContent = open ? 'Close' : 'Menu';
    if (open) {
      setFaq(false);
      drawer.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('is-open')));
      lenis?.stop();
      if (viaKeyboard) drawer.querySelector('a')?.focus({ preventScroll: true });
    } else {
      drawer.classList.remove('is-open');
      lenis?.start();
      const done = () => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; };
      REDUCED ? done() : drawer.addEventListener('transitionend', done, { once: true });
      if (viaKeyboard) burger.focus({ preventScroll: true });
      else burger.blur();
    }
  };
  // e.detail === 0 → click synthesized from Enter/Space
  burger.addEventListener('click', (e) => setDrawer(burger.getAttribute('aria-expanded') !== 'true', e.detail === 0));
  $$('[data-drawer-link]').forEach((a) => a.addEventListener('click', (e) => setDrawer(false, e.detail === 0)));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') setDrawer(false, true);
  });

  /* ------------------------------------------------------------------------
     9 · LIVE STATUS — computed in studio timezone, refreshed every 30s
     ------------------------------------------------------------------------ */
  const studioNow = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: STUDIO.tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { dow, mins: +get('hour') * 60 + +get('minute') };
  };

  const fmtHour = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  const renderStatus = () => {
    const el = $('[data-status]');
    const text = $('[data-status-text]');
    if (!el) return;
    const { dow, mins } = studioNow();
    const openDay = STUDIO.days.includes(dow);
    const isOpen = openDay && mins >= STUDIO.open * 60 && mins < STUDIO.close * 60;
    el.classList.toggle('is-open', isOpen);

    if (isOpen) {
      const left = STUDIO.close * 60 - mins;
      text.textContent = left <= 60 ? `Open now · closes in ${left} min` : `Open now · until ${fmtHour(STUDIO.close)}`;
    } else if (openDay && mins < STUDIO.open * 60) {
      text.textContent = `Closed · opens today ${fmtHour(STUDIO.open)}`;
    } else {
      let next = (dow + 1) % 7;
      while (!STUDIO.days.includes(next)) next = (next + 1) % 7;
      const label = next === (dow + 1) % 7 ? 'tomorrow' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][next];
      text.textContent = `Closed · opens ${label} ${fmtHour(STUDIO.open)}`;
    }
  };
  renderStatus();
  setInterval(renderStatus, 30_000);

  /* ------------------------------------------------------------------------
     10 · BOOKING CALENDAR — rolling 14 days from current week's Monday,
     Sundays disabled, selection opens Vagaro action overlay.
     ------------------------------------------------------------------------ */
  const cal = $('[data-cal]');
  if (cal) {
    const grid = $('[data-cal-grid]', cal);
    const monthEl = $('[data-cal-month]', cal);
    const selectedEl = $('[data-cal-selected]', cal);
    const overlay = $('[data-cal-overlay]', cal);
    const bookBtn = $('[data-cal-book]', cal);
    const closeBtn = $('[data-cal-close]', cal);

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: STUDIO.tz }));
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));   // back to Monday

    const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
    const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const end = new Date(start); end.setDate(start.getDate() + 13);
    monthEl.textContent = start.getMonth() === end.getMonth()
      ? monthFmt.format(start)
      : `${start.toLocaleString('en-US', { month: 'short' })} — ${monthFmt.format(end)}`;

    const setOverlay = (open) => {
      cal.classList.toggle('is-picked', open);
      overlay.setAttribute('aria-hidden', !open);
      bookBtn.tabIndex = closeBtn.tabIndex = open ? 0 : -1;
      if (!open) $$('.cal__day', grid).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    };

    for (let i = 0; i < 14; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal__day mono';
      btn.textContent = d.getDate();
      btn.setAttribute('aria-label', longFmt.format(d));
      btn.setAttribute('aria-pressed', 'false');
      if (+d === +today) btn.setAttribute('aria-current', 'date');
      if (d < today || !STUDIO.days.includes(d.getDay())) btn.disabled = true;

      btn.addEventListener('click', () => {
        $$('.cal__day', grid).forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        selectedEl.textContent = longFmt.format(d);
        setOverlay(true);
        bookBtn.focus({ preventScroll: true });
      });
      li.append(btn);
      grid.append(li);
    }

    closeBtn.addEventListener('click', () => setOverlay(false));
    cal.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOverlay(false); });
  }

  /* ------------------------------------------------------------------------
     11 · MISC
     ------------------------------------------------------------------------ */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // Hide broken video so fallback plate shows through
  const vid = $('.hero__video');
  // Ultra-slow-motion read: 3.1s clip → 6.2s loop
  if (vid) {
    const slow = () => { vid.playbackRate = REDUCED ? 1 : 0.5; };
    vid.addEventListener('loadedmetadata', slow);
    slow();
    if (REDUCED) vid.pause();
    else {
      // iOS Low Power Mode refuses muted autoplay until the visitor interacts:
      // start the hero on the first tap/click/key so the video still shows up.
      const kick = () => { if (vid.isConnected && vid.paused) vid.play().then(slow).catch(() => {}); };
      ['touchend', 'click', 'keydown'].forEach((ev) => addEventListener(ev, kick, { once: true, passive: true }));
    }
  }
  vid?.addEventListener('error', () => vid.remove(), true);
  vid?.querySelectorAll('source').forEach((s, i, all) => s.addEventListener('error', () => {
    if (i === all.length - 1) vid.remove();
  }));
})();
