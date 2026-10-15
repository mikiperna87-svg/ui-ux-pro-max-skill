/* =============================================================
   De Caro Caffè — scroll-driven frame animation + interazioni
   Dipendenze (in js/vendor/): GSAP 3 + ScrollTrigger, Lenis.
   Scene: foto ad alta risoluzione animate in tempo reale (js/scenes.js),
   oppure sequenze video (tools/extract-frames.sh → frames/manifest.js).
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
     1. SCENE: foto in tempo reale (js/scenes.js) o sequenze video
     ----------------------------------------------------------- */
  const PHOTO_SCENES = window.PHOTO_SCENES || {};
  const ease = t => 0.5 - Math.cos(Math.PI * t) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  function loadImage(src) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    const ok = () => (img.naturalWidth ? img : null);
    return (img.decode ? img.decode() : new Promise((r, j) => { img.onload = r; img.onerror = j; })).then(ok, ok);
  }

  /* Camera virtuale su foto ad alta risoluzione: zoom e pan calcolati a ogni
     frame del browser, con ricampionamento della GPU (nessuno scatto). */
  class PhotoScene {
    constructor(id, section, parts) {
      this.id = id;
      this.section = section;
      this.parts = parts.map(p => ({ ...p, img: null }));
      this.progress = 0; // 0..1 dallo scroll
      this.current = 0;  // 0..1 smussato
    }
    get ready() { return this.parts.some(p => p.img); }
    tasks() {
      return this.parts.map(p => () => loadImage(p.src).then(img => {
        p.img = img;
      }));
    }
    shot(k, t, alpha, zm = 1) {
      const p = this.parts[k];
      if (!p.img) return;
      const n = this.parts.length;
      const local = ease(clamp(t * n - k));
      const [z, cxL, cy, light] = p.from.map((v, i) => lerp(v, p.to[i], local));
      const W = canvas.width, H = canvas.height;
      const cx = H > W && p.portraitX ? lerp(p.portraitX[0], p.portraitX[1], local) : cxL;
      const iw = p.img.naturalWidth, ih = p.img.naturalHeight;
      const sc = Math.max(W / iw, H / ih) * z * zm;     // pixel schermo per pixel foto
      const vw = W / sc, vh = H / sc;                     // finestra visibile sulla foto
      const x0 = clamp(cx * iw - vw / 2, 0, iw - vw);
      const y0 = clamp(cy * ih - vh / 2, 0, ih - vh);
      ctx.globalAlpha = alpha;
      ctx.drawImage(p.img, x0, y0, vw, vh, 0, 0, W, H);
      if (light < 1) { ctx.fillStyle = `rgba(5,4,3,${((1 - light) * alpha).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    }
    draw(t, a = 1, zm = 1) {
      const n = this.parts.length;
      const xf = 0.16; // durata della dissolvenza tra due inquadrature
      const seg = Math.min(Math.floor(t * n), n - 1);
      this.shot(seg, t, a, zm);
      const edge = (seg + 1) / n;
      if (seg < n - 1 && t > edge - xf / 2) this.shot(seg + 1, t, ease(clamp((t - (edge - xf / 2)) / xf)) * a, zm);
      else if (seg > 0 && t < seg / n + xf / 2) {
        const m = ease(clamp((t - (seg / n - xf / 2)) / xf));
        this.shot(seg - 1, t, a, zm);
        this.shot(seg, t, m * a, zm);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* Sequenza di fotogrammi da video (frames/manifest.js), se presente */
  class FrameSequence {
    constructor(id, section, meta) {
      this.id = id;
      this.section = section;
      this.count = meta.count;
      this.images = new Array(this.count);
      this.progress = 0;
      this.current = 0;
    }
    get ready() { return this.images.some(Boolean); }
    src(i) { return `frames/${this.id}/${VARIANT}/${String(i + 1).padStart(4, '0')}.webp`; }
    tasks() {
      // prima un frame ogni 3 (sostituisce i vicini), poi tutti gli altri
      const order = [...Array(this.count).keys()].sort((a, b) => (a % 3 === 0 ? 0 : 1) - (b % 3 === 0 ? 0 : 1));
      return order.map(i => () => loadImage(this.src(i)).then(img => { if (img) this.images[i] = img; }));
    }
    nearest(i) {
      if (this.images[i]) return this.images[i];
      for (let d = 1; d < this.count; d++) {
        if (this.images[i - d]) return this.images[i - d];
        if (this.images[i + d]) return this.images[i + d];
      }
      return null;
    }
    draw(t, alpha = 1) {
      const f = t * (this.count - 1);
      const i0 = Math.floor(f);
      const a = this.nearest(i0);
      if (!a) return;
      const fx = canvas.height > canvas.width ? Number(this.section.dataset.focusX || 0.5) : 0.5;
      const cover = img => {
        const W = canvas.width, H = canvas.height, s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        ctx.drawImage(img, (W - img.naturalWidth * s) * fx, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      };
      ctx.globalAlpha = alpha;
      cover(a);
      const b = this.images[Math.min(i0 + 1, this.count - 1)];
      if (f - i0 > 0.01 && b && b !== a) { ctx.globalAlpha = (f - i0) * alpha; cover(b); }
      ctx.globalAlpha = 1;
    }
  }

  const sequences = $$('[data-scene]').map(el => {
    const id = el.dataset.scene;
    const meta = (MANIFEST[id] || {})[VARIANT];
    return meta && meta.count ? new FrameSequence(id, el, meta) : new PhotoScene(id, el, PHOTO_SCENES[id] || []);
  });
  let active = sequences[0];

  /* Coda di caricamento con concorrenza limitata */
  function runQueue(tasks, concurrency, onEach) {
    let i = 0;
    const worker = () => (i < tasks.length ? tasks[i++]().then(() => { onEach && onEach(); return worker(); }) : Promise.resolve());
    return Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  }

  /* -----------------------------------------------------------
     2. CANVAS
     ----------------------------------------------------------- */
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const shadeEl = $('#stageShade');
  let cw = 0, ch = 0, dirty = true, lastKey = '';

  function resize() {
    // densità fino a 2x (le foto sorgente sono 2560px), ma al massimo 2400px di
    // larghezza: oltre, la differenza non si vede e costa solo lavoro alla GPU
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 2400 / Math.max(w, 1));
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (bw === canvas.width && bh === canvas.height) return; // misura invariata: niente da rifare
    cw = w; ch = h;
    canvas.width = bw;
    canvas.height = bh;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    dirty = true;
    render(); // ridisegna subito, nello stesso frame: mai un'immagine stirata a schermo
  }

  /* Passaggio tra scene ("zoom-through"): nell'ultimo tratto di una sezione
     - la camera continua ad avvicinarsi alla foto attuale,
     - la foto successiva entra in dissolvenza partendo più stretta e si allarga
       fino alla sua inquadratura iniziale (il movimento in avanti non si ferma),
     - a metà passaggio un bagliore caldo (il calore della tostatura) le unisce.
     Quando la nuova sezione inizia, la sua foto è già ferma e nitida. */
  // inizio del passaggio (frazione della sezione): di default l'ultimo 55%;
  // una sezione può anticiparlo o ritardarlo con data-xfade (es. dopo i suoi testi)
  const XFADE_FROM = 0.45;
  const xfadeOf = seq => Number(seq.section.dataset.xfade || XFADE_FROM);
  const PUSH_OUT = 0.16;  // zoom extra della foto che esce
  const PULL_IN = 0.22;   // zoom di partenza in più della foto che entra

  const nextOf = seq => sequences[sequences.indexOf(seq) + 1];
  const mixOf = seq => (nextOf(seq) ? smoothstep(xfadeOf(seq), 1, seq.current) : 0);

  function render() {
    const seq = active;
    if (!seq || !seq.ready) return;
    const t = clamp(seq.current);
    const next = nextOf(seq);
    const mix = next && next.ready ? mixOf(seq) : 0;
    const key = `${seq.id}:${t.toFixed(5)}:${mix.toFixed(4)}`;
    if (!dirty && key === lastKey) return;
    lastKey = key;
    dirty = false;
    const W = canvas.width, H = canvas.height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(0, 0, W, H);
    if (mix <= 0.001) { seq.draw(t); return; }
    if (mix >= 0.999) { next.draw(0); return; }

    seq.draw(t, 1, 1 + PUSH_OUT * mix);
    next.draw(0, mix, 1 + PULL_IN * (1 - mix));

    const peak = Math.sin(Math.PI * mix); // 0 → 1 → 0
    // Bagliore caldo, come il calore della tostatura (fusione normale: costo quasi nullo)
    const g = ctx.createRadialGradient(W * 0.6, H * 0.55, 0, W * 0.6, H * 0.55, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(255, 186, 110, 0.85)');
    g.addColorStop(0.4, 'rgba(214, 138, 60, 0.4)');
    g.addColorStop(1, 'rgba(120, 60, 20, 0)');
    ctx.globalAlpha = peak * 0.3;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* Sfumature dietro i testi (incrociate con le foto) + sfondo scurito sotto i contenuti */
  const scrims = $$('[data-scrim]');
  let contentShade = 0;
  function updateShade() {
    const next = nextOf(active);
    const mix = next ? mixOf(active) : 0;
    scrims.forEach(el => {
      const id = el.dataset.scrim;
      const w = id === active.id ? 1 - mix : next && id === next.id ? mix : 0;
      el.style.opacity = w.toFixed(3);
    });
    shadeEl.style.opacity = contentShade.toFixed(3);
  }

  /* Progresso di una sezione senza ScrollTrigger (fallback se GSAP non carica) */
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
    // Inseguimento morbido della posizione di scroll (indipendente dal frame-rate)
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 8);
    sequences.forEach(s => {
      if (s !== active) { s.current = s.progress; return; }
      const diff = s.progress - s.current;
      s.current = Math.abs(diff) < 0.00005 ? s.progress : s.current + diff * k;
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
    // Foto: tutte subito (sono poche). Video: la parte iniziale, il resto in background.
    const all = sequences.flatMap(s => s.tasks());
    const photos = sequences.every(s => s instanceof PhotoScene);
    const critical = photos ? all : all.filter((_, i) => i % 3 === 0);
    const rest = photos ? [] : all.filter((_, i) => i % 3 !== 0);
    let done = 0;
    const total = critical.length || 1;
    const progress = () => {
      done++;
      const p = done / total;
      bar.style.transform = `scaleX(${p})`;
      pct.textContent = Math.round(p * 100);
      dirty = true;
    };
    const minTime = new Promise(r => setTimeout(r, reduceMotion ? 0 : 900));
    const maxTime = new Promise(r => setTimeout(r, 15000)); // mai bloccare oltre 15s
    return Promise.race([Promise.all([runQueue(critical, 4, progress), minTime]), maxTime])
      .then(() => { if (rest.length) runQueue(rest, 4, () => { dirty = true; }); });
  }

  function revealSite() {
    root.style.overflow = '';
    if (lenis) lenis.start();
    if (!hasGSAP) { loader.remove(); return; }
    const tl = gsap.timeline();
    tl.to(loader, { autoAlpha: 0, duration: reduceMotion ? 0 : 0.9, ease: 'power2.inOut', onComplete: () => loader.remove() })
      .from('.nav', { y: -24, autoAlpha: 0, duration: 1, ease: 'expo.out', clearProps: 'transform' }, '-=0.3')
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

    // Torrefazione: un passaggio alla volta. La barra oro avanza con lo scroll,
    // il passaggio attivo si accende e il suo testo appare nel riquadro sotto.
    const steps = $$('.step');
    const stepsList = $('.steps');
    const roast = gsap.timeline({ scrollTrigger: { trigger: '#tostatura', start: 'top top', end: 'bottom bottom', scrub: 0.8 }, defaults: { ease: 'none' } });
    roast.from('.roast__head > *', { autoAlpha: 0, y: 40, stagger: 0.02, duration: 0.07, ease: 'power2.out' }, 0.02)
      .fromTo(steps, { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.015, duration: 0.06 }, 0.06) // niente transform sui <li>: il riquadro del testo è posizionato rispetto alla lista
      .fromTo(stepsList, { '--progress': 0 }, { '--progress': 1, duration: 0.52 }, 0.1);
    // i passaggi finiscono prima che la foto inizi a sfumare nella scena successiva (data-xfade="0.72")
    const span = 0.52 / steps.length;
    steps.forEach((st, i) => {
      const at = 0.1 + i * span;
      roast.fromTo(st, { '--on': 0 }, { '--on': 1, duration: span * 0.3, ease: 'power1.inOut' }, at);
      if (i < steps.length - 1) roast.to(st, { '--on': 0, duration: span * 0.3, ease: 'power1.inOut' }, at + span * 0.85);
    });
    // Numeri toccabili: portano lo scroll al centro del passaggio scelto
    steps.forEach((st, i) => {
      $('.step__num', st).addEventListener('click', () => {
        const sec = $('#tostatura');
        const p = 0.1 + i * span + span * 0.5;
        scrollToTarget(sec.offsetTop + (sec.offsetHeight - innerHeight) * p);
      });
    });
    roast.from('.steps__hint', { autoAlpha: 0, duration: 0.04 }, 0.12)
      .from('.roast__badge', { autoAlpha: 0, y: 16, duration: 0.05 }, 0.58)
      .to('.roast', { autoAlpha: 0, duration: 0.06 }, 0.7)
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

  /* Mappa Google: blocco preventivo finché l'utente non acconsente.
     La scelta "ricorda" è salvata in localStorage (archiviazione tecnica, nessun cookie). */
  const CONSENT_KEY = 'decaro-consent-maps';
  const store = {
    get() { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(CONSENT_KEY, v) : localStorage.removeItem(CONSENT_KEY); } catch { /* storage non disponibile */ } },
  };

  function setupMap() {
    const box = $('#map');
    const tpl = $('#mapTemplate');
    if (!box || !tpl) return;
    const show = () => {
      if ($('iframe', box)) return;
      box.appendChild(tpl.content.cloneNode(true));
      box.classList.add('is-loaded');
    };
    $('#mapConsent').addEventListener('click', () => {
      if ($('#mapRemember').checked) store.set('granted');
      show();
    });
    if (store.get() === 'granted') show();

    $('#resetConsent').addEventListener('click', () => {
      store.set(null);
      const frame = $('iframe', box);
      if (frame) frame.remove();
      box.classList.remove('is-loaded');
      $('#mapRemember').checked = false;
      const btn = $('#resetConsent');
      btn.textContent = 'Preferenze azzerate ✓';
      setTimeout(() => { btn.textContent = 'Preferenze cookie'; }, 2500);
    });
  }


  /* -----------------------------------------------------------
     AVVIO
     ----------------------------------------------------------- */
  $('#year').textContent = new Date().getFullYear();
  root.style.overflow = 'hidden';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  resize();
  // ResizeObserver scatta prima del disegno del frame: il canvas viene adattato
  // senza il ritardo dell'evento resize (che su iOS arriva a scroll finito)
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  addEventListener('resize', resize);
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
