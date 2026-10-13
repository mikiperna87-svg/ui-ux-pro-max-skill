/* =============================================================
   De Caro Caffè — scroll-driven frame animation + interazioni
   Dipendenze (CDN): GSAP 3 + ScrollTrigger, Lenis.
   Fotogrammi: frames/sceneN/{desktop|mobile}/0001.webp (vedi
   tools/extract-frames.sh) descritti da frames/manifest.js.
   ============================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(max-width: 768px)').matches ||
    (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 820);
  const VARIANT = isMobile ? 'mobile' : 'desktop';
  const MANIFEST = window.FRAME_MANIFEST || {};
  const { gsap, ScrollTrigger, Lenis } = window;
  const hasGSAP = Boolean(gsap && ScrollTrigger);

  /* -----------------------------------------------------------
     1. SEQUENZE DI FOTOGRAMMI
     ----------------------------------------------------------- */
  class FrameSequence {
    constructor(id, section) {
      const meta = (MANIFEST[id] || {})[VARIANT] || { count: 0, width: 16, height: 9 };
      this.id = id;
      this.section = section;
      this.count = meta.count;
      this.width = meta.width;
      this.height = meta.height;
      this.images = new Array(this.count);
      this.requested = new Uint8Array(this.count);
      this.progress = 0; // 0..1 dallo scroll
      this.current = 0; // indice frame (float) smussato
    }
    src(i) { return `frames/${this.id}/${VARIANT}/${String(i + 1).padStart(4, '0')}.webp`; }
    load(i) {
      if (i < 0 || i >= this.count || this.requested[i]) return Promise.resolve();
      this.requested[i] = 1;
      const img = new Image();
      img.decoding = 'async';
      img.src = this.src(i);
      const done = () => { if (img.naturalWidth) this.images[i] = img; };
      return (img.decode ? img.decode() : new Promise((r, j) => { img.onload = r; img.onerror = j; }))
        .then(done, done);
    }
    /* il frame richiesto, oppure il più vicino già caricato */
    nearest(i) {
      if (this.images[i]) return this.images[i];
      for (let d = 1; d < this.count; d++) {
        if (this.images[i - d]) return this.images[i - d];
        if (this.images[i + d]) return this.images[i + d];
      }
      return null;
    }
    get target() { return this.progress * (this.count - 1); }
  }

  const sequences = $$('[data-scene]').map(el => new FrameSequence(el.dataset.scene, el));
  let active = sequences[0];

  /* Coda di caricamento con concorrenza limitata */
  function runQueue(tasks, concurrency, onEach) {
    let i = 0;
    const worker = () => (i < tasks.length ? tasks[i++]().then(() => { onEach && onEach(); return worker(); }) : Promise.resolve());
    return Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  }

  /* -----------------------------------------------------------
     2. CANVAS: disegno "cover" + interpolazione tra frame
     ----------------------------------------------------------- */
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const shadeEl = $('#stageShade');
  let cw = 0, ch = 0, dpr = 1, dirty = true, lastKey = '';

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    cw = canvas.clientWidth;
    ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.imageSmoothingQuality = 'high';
    dirty = true;
  }

  /* "object-fit: cover" per un fotogramma fw×fh. Su schermi verticali il
     ritaglio orizzontale segue data-focus-x della scena (0 = sinistra, 1 = destra),
     così il soggetto della foto resta in quadro. */
  function coverRect(fw, fh, w = cw, h = ch, fx = 0.5) {
    const s = Math.max(w / fw, h / fh);
    return { s, x: (w - fw * s) * fx, y: (h - fh * s) / 2, w: fw * s, h: fh * s };
  }

  function drawImage(img, alpha) {
    const fx = canvas.height > canvas.width ? Number(active.section.dataset.focusX || 0.5) : 0.5;
    const r = coverRect(img.naturalWidth, img.naturalHeight, canvas.width, canvas.height, fx);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    return r;
  }

  function fadeEdges(r) {
    if (r.y <= 0) return;
    const band = r.h * 0.22;
    const top = ctx.createLinearGradient(0, r.y, 0, r.y + band);
    top.addColorStop(0, '#050403'); top.addColorStop(1, 'rgba(5,4,3,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, r.y - 1, canvas.width, band + 1);
    const yb = r.y + r.h;
    const bot = ctx.createLinearGradient(0, yb - band, 0, yb);
    bot.addColorStop(0, 'rgba(5,4,3,0)'); bot.addColorStop(1, '#050403');
    ctx.fillStyle = bot;
    ctx.fillRect(0, yb - band, canvas.width, band + 1);
  }

  function render() {
    const seq = active;
    if (!seq || !seq.count) return;
    const f = clamp(seq.current, 0, seq.count - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(i0 + 1, seq.count - 1);
    const mix = f - i0;
    const key = `${seq.id}:${f.toFixed(3)}`;
    if (!dirty && key === lastKey) return;
    const a = seq.nearest(i0);
    if (!a) return;
    lastKey = key;
    dirty = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const r = drawImage(a, 1);
    // Interpolazione: dissolvenza tra frame adiacenti → movimento fluido a 60fps
    const b = seq.images[i1];
    if (mix > 0.01 && b && b !== a) drawImage(b, mix);
    ctx.globalAlpha = 1;
    fadeEdges(r);
  }

  /* Dissolvenza al nero tra una scena e l'altra + sfondo scurito dopo il fly-through */
  let contentShade = 0;
  function updateShade() {
    const p = active.progress;
    const idx = sequences.indexOf(active);
    let dip = 0;
    if (idx < sequences.length - 1) dip = Math.max(dip, smoothstep(0.86, 1, p));
    if (idx > 0) dip = Math.max(dip, 1 - smoothstep(0, 0.08, p));
    shadeEl.style.opacity = Math.max(dip * 0.92, contentShade).toFixed(3);
  }

  /* Progresso di una sezione senza ScrollTrigger (fallback se il CDN non carica) */
  function rectProgress(el) {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  }

  let lastTime = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    if (!hasGSAP) {
      sequences.forEach(s => { s.progress = rectProgress(s.section); });
      const scrollY = window.scrollY;
      active = sequences.slice().reverse().find(s => s.section.offsetTop <= scrollY + 1) || sequences[0];
      const content = $('.content');
      contentShade = 0.84 * clamp(1 - content.getBoundingClientRect().top / innerHeight);
    }
    // Inseguimento morbido del frame bersaglio (indipendente dal frame-rate)
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 11);
    sequences.forEach(s => {
      if (s !== active) { s.current = s.target; return; }
      const diff = s.target - s.current;
      s.current = Math.abs(diff) < 0.002 ? s.target : s.current + diff * k;
    });
    updateShade();
    render();
  }

  /* -----------------------------------------------------------
     3. LOADER + PRECARICAMENTO
     ----------------------------------------------------------- */
  const loader = $('#loader');
  const bar = $('#loaderBar');
  const pct = $('#loaderPct');

  function preload() {
    // Critici: l'inizio della scena 1 + un frame ogni 3 di tutte le scene
    // (i mancanti vengono sostituiti dal frame caricato più vicino)
    const critical = [];
    const rest = [];
    sequences.forEach((s, n) => {
      for (let i = 0; i < s.count; i++) {
        const task = () => s.load(i);
        if ((n === 0 && i < 24) || i % 3 === 0 || i === s.count - 1) critical.push(task); else rest.push(task);
      }
    });
    let done = 0;
    const total = critical.length || 1;
    const progress = () => {
      done++;
      const p = done / total;
      bar.style.transform = `scaleX(${p})`;
      pct.textContent = Math.round(p * 100);
      if (done === 1) dirty = true;
    };
    const minTime = new Promise(r => setTimeout(r, reduceMotion ? 0 : 900));
    const maxTime = new Promise(r => setTimeout(r, 15000)); // mai bloccare oltre 15s
    return Promise.race([Promise.all([runQueue(critical, 8, progress), minTime]), maxTime])
      .then(() => { runQueue(rest, 4); }); // il resto in background
  }

  function revealSite() {
    root.style.overflow = '';
    if (lenis) lenis.start();
    if (!hasGSAP) { loader.remove(); return; }
    const tl = gsap.timeline();
    tl.to(loader, { autoAlpha: 0, duration: reduceMotion ? 0 : 0.9, ease: 'power2.inOut', onComplete: () => loader.remove() })
      .from('.nav', { y: -24, autoAlpha: 0, duration: 1, ease: 'expo.out' }, '-=0.3')
      .from('.hero > *', { y: 50, autoAlpha: 0, duration: 1.4, stagger: 0.12, ease: 'expo.out' }, '<');
    if (reduceMotion) tl.progress(1);
  }

  /* -----------------------------------------------------------
     4. SMOOTH SCROLL (Lenis)
     ----------------------------------------------------------- */
  let lenis = null;
  if (Lenis && !reduceMotion) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.stop();
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  function scrollToTarget(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
    else (typeof target === 'number' ? window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' })
      : target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }));
  }

  /* -----------------------------------------------------------
     5. SCROLLTRIGGER: frame, testi, navbar
     ----------------------------------------------------------- */
  function setupScroll() {
    gsap.registerPlugin(ScrollTrigger);

    // Ogni sezione-scena guida la propria sequenza di frame
    sequences.forEach(seq => {
      ScrollTrigger.create({
        trigger: seq.section,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: self => { seq.progress = self.progress; },
        onToggle: self => { if (self.isActive) { active = seq; dirty = true; } },
        onRefresh: self => { seq.progress = self.progress; },
      });
    });

    // Dopo il fly-through il canvas resta come sfondo scurito
    ScrollTrigger.create({
      trigger: '.content',
      start: 'top bottom',
      end: 'top 25%',
      onUpdate: self => { contentShade = 0.84 * self.progress; },
      onLeave: () => { contentShade = 0.84; },
      onLeaveBack: () => { contentShade = 0; },
    });

    // Hero: il titolo sfuma e sale mentre la camera si avvicina al chicco
    gsap.to('.hero', {
      autoAlpha: 0, y: -80, ease: 'none',
      scrollTrigger: { trigger: '#top', start: 'top top', end: () => `+=${innerHeight * 0.75}`, scrub: true },
    });
    gsap.to('.scroll-hint', { autoAlpha: 0, scrollTrigger: { trigger: '#top', start: 'top top', end: '+=120', scrub: true } });

    // Torrefazione: i 5 passaggi si accendono uno dopo l'altro mentre la camera scorre nella tostatrice
    const steps = $$('.step');
    const roast = gsap.timeline({ scrollTrigger: { trigger: '#tostatura', start: 'top top', end: 'bottom bottom', scrub: 0.6 }, defaults: { ease: 'power2.out' } });
    roast.from('.roast__head > *', { autoAlpha: 0, y: 50, stagger: 0.03, duration: 0.08 }, 0.05);
    const span = 0.66 / steps.length;
    steps.forEach((st, i) => {
      const at = 0.14 + i * span;
      roast.fromTo(st, { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: span * 0.5 }, at)
        .fromTo(st, { '--on': 0 }, { '--on': 1, duration: span * 0.4 }, at);
      if (i < steps.length - 1) roast.to(st, { '--on': 0, duration: span * 0.4 }, at + span);
    });
    roast.from('.roast__badge', { autoAlpha: 0, y: 20, duration: 0.06 }, 0.82)
      .to('.roast', { autoAlpha: 0, duration: 0.05 }, 0.93)
      .set({}, {}, 1);

    // Storia: titolo + capitoli in sequenza
    const story = gsap.timeline({ scrollTrigger: { trigger: '#storia', start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
    story.from('.story > .eyebrow, .story > .h2', { autoAlpha: 0, y: 50, stagger: 0.03, duration: 0.1 }, 0.06);
    const chapters = $$('.chapter');
    chapters.forEach((c, i) => {
      const at = 0.18 + i * 0.25;
      story.fromTo(c, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.07 }, at);
      if (i < chapters.length - 1) story.to(c, { autoAlpha: 0, y: -30, duration: 0.06 }, at + 0.19);
    });
    story.set({}, {}, 1);

    // Testi delle sezioni: fade + slide sincronizzati allo scroll
    $$('[data-reveal]').forEach(el => {
      gsap.fromTo(el, { autoAlpha: 0, y: 60 }, {
        autoAlpha: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 94%', end: 'top 64%', scrub: 0.5 },
      });
    });


    // Link attivo
    $$('.nav__links a').forEach(a => {
      const target = $(a.getAttribute('href'));
      if (!target) return;
      ScrollTrigger.create({
        trigger: target, start: 'top 50%', end: 'bottom 50%',
        onToggle: self => a.classList.toggle('is-active', self.isActive),
      });
    });

    gsap.ticker.add(tick);
    ScrollTrigger.addEventListener('refresh', () => { dirty = true; });
  }

  function setupFallbackScroll() {
    $$('.step, .chapter').forEach(el => { el.style.opacity = 1; });
    const loop = () => { tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /* -----------------------------------------------------------
     6. CURSORE PERSONALIZZATO
     ----------------------------------------------------------- */
  function setupCursor() {
    if (reduceMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    root.classList.add('has-cursor');
    const cursor = $('.cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const ringPos = { ...pos };
    const HOVER = 'a, button, input, select, textarea, label, .gallery__item, .glass-card, .cap';
    addEventListener('mousemove', e => {
      pos.x = e.clientX; pos.y = e.clientY;
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      cursor.classList.remove('is-hidden');
    }, { passive: true });
    document.addEventListener('mouseover', e => cursor.classList.toggle('is-hover', Boolean(e.target.closest(HOVER))));
    document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
    addEventListener('mousedown', () => cursor.classList.add('is-down'));
    addEventListener('mouseup', () => cursor.classList.remove('is-down'));
    const follow = () => {
      ringPos.x += (pos.x - ringPos.x) * 0.18;
      ringPos.y += (pos.y - ringPos.y) * 0.18;
      ring.style.transform = `translate3d(${ringPos.x.toFixed(1)}px, ${ringPos.y.toFixed(1)}px, 0)`;
    };
    hasGSAP ? gsap.ticker.add(follow) : (function loop() { follow(); requestAnimationFrame(loop); })();

    // Riflesso dorato che segue il mouse sulle card in vetro
    $$('.glass-card, .cap').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* -----------------------------------------------------------
     7. NAVIGAZIONE, FORM, MAPPA
     ----------------------------------------------------------- */
  function setupNav() {
    const nav = $('#nav');
    // Navbar: trasparente in cima, sfocata appena si scorre
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const toggle = $('#navToggle');
    const setOpen = open => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
      if (lenis) open ? lenis.stop() : lenis.start();
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      setOpen(false);
      scrollToTarget(target);
      if (target && target.focus) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    });
  }

  function setupForm() {
    const form = $('#contactForm');
    const status = $('#formStatus');
    const waNumber = ($('#waButton').getAttribute('href').match(/wa\.me\/(\d+)/) || [])[1];
    const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      status.classList.remove('is-error');
      let firstInvalid = null;
      $$('[required]', form).forEach(f => {
        const bad = f.type === 'checkbox' ? !f.checked : !f.value.trim() || (f.type === 'email' && !emailOk(f.value.trim()));
        f.setAttribute('aria-invalid', String(bad));
        if (bad && !firstInvalid) firstInvalid = f;
      });
      if (firstInvalid) {
        status.textContent = firstInvalid.type === 'checkbox'
          ? 'Per continuare accetta la Privacy Policy.'
          : 'Completa i campi evidenziati per continuare.';
        status.classList.add('is-error');
        firstInvalid.focus();
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      const first = data.name.trim().split(' ')[0];

      // Con data-endpoint (es. Formspree, Make, backend) invia via POST
      if (form.dataset.endpoint) {
        try {
          const res = await fetch(form.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          if (!res.ok) throw new Error(res.status);
          form.reset();
          status.textContent = `Grazie ${first}! Ti risponderemo al più presto.`;
        } catch {
          status.textContent = 'Invio non riuscito: riprova o scrivici su WhatsApp.';
          status.classList.add('is-error');
        }
        return;
      }

      // Default: richiesta precompilata su WhatsApp
      const msg = `Ciao De Caro Caffè! Vorrei informazioni.\n\n• Nome: ${data.name}\n• Sono: ${data.type}\n• Email: ${data.email}` +
        (data.phone ? `\n• Telefono: ${data.phone}` : '') + `\n\n${data.message}`;
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      status.textContent = `Grazie ${first}! Ti abbiamo aperto WhatsApp con la richiesta pronta: premi invio e ti rispondiamo.`;
    });
    form.addEventListener('input', e => {
      const f = e.target;
      if (f.type === 'checkbox' ? f.checked : f.value) f.removeAttribute('aria-invalid');
    });
  }

  function setupMap() {
    const frame = $('iframe[data-src]');
    if (!frame) return;
    const load = () => { frame.src = frame.dataset.src; frame.removeAttribute('data-src'); };
    if (!('IntersectionObserver' in window)) return load();
    const io = new IntersectionObserver(entries => {
      if (entries.some(en => en.isIntersecting)) { load(); io.disconnect(); }
    }, { rootMargin: '400px' });
    io.observe(frame);
  }

  /* -----------------------------------------------------------
     AVVIO
     ----------------------------------------------------------- */
  $('#year').textContent = new Date().getFullYear();
  root.style.overflow = 'hidden';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  resize();
  addEventListener('resize', () => { resize(); });
  setupNav();
  setupForm();
  setupMap();
  setupCursor();
  hasGSAP ? setupScroll() : setupFallbackScroll();

  preload().then(() => {
    dirty = true;
    revealSite();
    if (hasGSAP) ScrollTrigger.refresh();
  });
})();
