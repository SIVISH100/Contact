/* Femi ADHD deck – navigation, tangle/flow line system, slide animations */
(function () {
  const W = 1920, H = 1080;
  const PRINT = new URLSearchParams(location.search).has('print');
  if (PRINT) document.body.classList.add('print');

  // inline icons (masks/fetch are blocked on file://)
  document.querySelectorAll('.ic').forEach(el => {
    const m = (el.getAttribute('style') || '').match(/icons\/([\w-]+)\.svg/);
    if (m && window.ICONS && ICONS[m[1]]) el.innerHTML = ICONS[m[1]];
  });
  const deck = document.getElementById('deck');
  const slides = [...document.querySelectorAll('.slide')];
  slides.forEach(s => { const p = s.querySelector('.pageno'); if (p && s.dataset.n) p.textContent = String(s.dataset.n).padStart(2, '0'); });

  /* ---------- helpers ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Catmull-Rom -> cubic bezier path
  function smooth(pts, k = 1) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const PALETTE = ['#DD528B', '#796FB2', '#1F9DD0', '#32A596', '#796FB2', '#1F9DD0', '#DD528B', '#9AA3AE', '#32A596'];
  function mkPath(svg, color, w, op) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', w);
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('opacity', op);
    svg.appendChild(p); return p;
  }

  /* ---------- SLIDE 1: tangle between the six pain points ---------- */
  function buildTangle(slide) {
    const svg = slide.querySelector('svg.tangle'); if (!svg) return [];
    const r = rng(7);
    const nodes = [...slide.querySelectorAll('[data-node]')].map(el => el.dataset.node.split(',').map(Number));
    const core = [960, 548];
    const pairs = [];
    nodes.forEach((n, i) => {
      pairs.push([n, core]);
      pairs.push([n, nodes[(i + 2) % nodes.length]]);
      pairs.push([n, nodes[(i + 3) % nodes.length]]);
    });
    // a few loose ends that run off-canvas
    pairs.push([nodes[0], [1990, 120]], [nodes[3], [-60, 1000]], [nodes[5], [-60, 180]], [nodes[2], [2000, 1010]]);
    const paths = [];
    pairs.forEach(([a, b], i) => {
      const n = 2 + Math.floor(r() * 3), pts = [a];
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        pts.push([lerp(a[0], b[0], t) + (r() - .5) * 760, lerp(a[1], b[1], t) + (r() - .5) * 520]);
      }
      pts.push(b);
      pts.forEach(p => { p[0] = Math.max(-80, Math.min(2000, p[0])); p[1] = Math.max(250, Math.min(960, p[1])); });
      const el = mkPath(svg, PALETTE[i % PALETTE.length], i % 4 === 0 ? 3 : 2, i % 5 === 0 ? .32 : .5);
      if (i % 6 === 3) el.setAttribute('stroke-dasharray', '2 10');
      el.setAttribute('d', smooth(pts, 1.1));
      paths.push(el);
    });
    return paths;
  }

  /* ---------- SLIDE 4: tangle -> one clear path ---------- */
  const FLOW_Y = 610, KNOT_X = 1560, END_X = 190;
  function buildFlow(slide) {
    const svg = slide.querySelector('svg.flow'); if (!svg) return null;
    const r = rng(42), N = 14, LINES = 10;
    const lines = [];
    for (let i = 0; i < LINES; i++) {
      const tgt = [], chaos = [];
      // converged: a knot at the right that feeds one straight path
      tgt.push([1990, 380 + r() * 560]);
      for (let k = 1; k <= 5; k++) tgt.push([KNOT_X + 40 + r() * 300, 440 + r() * 400]);
      tgt.push([KNOT_X + 20, FLOW_Y + (r() - .5) * 30]);
      tgt.push([KNOT_X - 60, FLOW_Y]);
      for (let k = 1; k <= N - 8; k++) tgt.push([lerp(KNOT_X - 60, END_X, k / (N - 8)), FLOW_Y]);
      // chaos: same point count, scattered across the slide (echo of slide 1)
      chaos.push(tgt[0].slice());
      for (let k = 1; k < N; k++) chaos.push([160 + r() * 1640, 300 + r() * 680]);
      const el = mkPath(svg, PALETTE[i % PALETTE.length], 2.4, .5);
      lines.push({ el, tgt, chaos });
    }
    // the main clear path (drawn right -> left)
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = `<linearGradient id="flowGrad" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="#1F9DD0"/><stop offset=".55" stop-color="#796FB2"/><stop offset="1" stop-color="#DD528B"/></linearGradient>`;
    svg.appendChild(defs);
    const glow = mkPath(svg, 'url(#flowGrad)', 22, .14);
    const main = mkPath(svg, 'url(#flowGrad)', 7, 1);
    const d = `M${KNOT_X - 60},${FLOW_Y} L${END_X},${FLOW_Y}`;
    glow.setAttribute('d', d); main.setAttribute('d', d);
    const tip = document.createElementNS(NS, 'circle');
    tip.setAttribute('cx', END_X); tip.setAttribute('cy', FLOW_Y); tip.setAttribute('r', 12); tip.setAttribute('fill', '#DD528B');
    svg.appendChild(tip);
    const state = { t: 1 };
    function render() {
      const e = state.t;
      lines.forEach(L => {
        const pts = L.tgt.map((p, k) => [lerp(L.chaos[k][0], p[0], e), lerp(L.chaos[k][1], p[1], e)]);
        L.el.setAttribute('d', smooth(pts, 1));
        L.el.setAttribute('opacity', lerp(.5, .38, e));
      });
    }
    render();
    return { state, render, main, glow, tip, lines };
  }

  /* ---------- per-slide animations (live mode only) ---------- */
  const built = {};
  slides.forEach((s, i) => {
    if (s.classList.contains('s1')) built[i] = { paths: buildTangle(s) };
    if (s.classList.contains('s4')) built[i] = { flow: buildFlow(s) };
  });

  function drawIn(el, dur, delay, from = 'start') {
    const len = el.getTotalLength();
    return gsap.fromTo(el, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur, delay, ease: 'power2.inOut',
      onComplete: () => { if (!el.dataset.dash) el.style.strokeDasharray = ''; } });
  }

  const enter = {
    s0(s) {
      const tl = gsap.timeline();
      tl.from(s.querySelector('.girl'), { y: 40, opacity: 0, duration: 1, ease: 'power3.out' })
        .from(s.querySelectorAll('.chip'), { scale: .85, opacity: 0, duration: .6, stagger: .12, ease: 'back.out(1.6)' }, '-=.5')
        .from(s.querySelectorAll('.brand > *'), { x: -30, opacity: 0, duration: .7, stagger: .1, ease: 'power3.out' }, 0.2);
      return tl;
    },
    s1(s, i) {
      const tl = gsap.timeline();
      tl.from(s.querySelectorAll('.head > *'), { y: 20, opacity: 0, duration: .6, stagger: .08 })
        .from(s.querySelector('.core'), { scale: .8, opacity: 0, duration: .8, ease: 'back.out(1.4)' }, .2);
      built[i].paths.forEach((p, k) => { p.dataset.dash = p.getAttribute('stroke-dasharray') || ''; tl.add(drawIn(p, 1.6, 0), .5 + k * .04); });
      tl.from(s.querySelectorAll('.bub'), { scale: .7, opacity: 0, duration: .55, stagger: .12, ease: 'back.out(1.8)' }, .7)
        .from(s.querySelector('.punch'), { y: 20, opacity: 0, duration: .7 }, 2.2);
      return tl;
    },
    s4(s, i) {
      const f = built[i].flow, tl = gsap.timeline();
      f.state.t = 0; f.render();
      gsap.set([f.main, f.glow, f.tip], { opacity: 0 });
      tl.from(s.querySelectorAll('.head > *'), { y: 20, opacity: 0, duration: .6, stagger: .08 })
        .to(f.state, { t: 1, duration: 2.4, ease: 'power3.inOut', onUpdate: f.render }, .9)
        .set([f.main, f.glow], { opacity: (k, el) => el === f.glow ? .14 : 1 }, 2.9)
        .add(drawIn(f.main, 1.8, 0), 2.9).add(drawIn(f.glow, 1.8, 0), 2.9)
        .to(f.tip, { opacity: 1, duration: .3 }, 4.5)
        .from(s.querySelectorAll('.from'), { opacity: 0, duration: .5 }, 1.2)
        .from(s.querySelectorAll('.st'), { y: 30, opacity: 0, duration: .55, stagger: .32, ease: 'power3.out' }, 3.0);
      return tl;
    }
  };

  /* ---------- navigation ---------- */
  let cur = 0, tl = null;
  function fit() { const k = Math.min(innerWidth / W, innerHeight / H); deck.style.transform = `translate(-50%,-50%) scale(${k})`; }
  function go(n) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (tl) { tl.progress(1).kill(); tl = null; }
    slides[cur].classList.remove('active'); cur = n; slides[cur].classList.add('active');
    const key = [...slides[cur].classList].find(c => enter[c]);
    if (key && window.gsap) tl = enter[key](slides[cur], cur);
    history.replaceState(null, '', '#' + (cur + 1));
    document.getElementById('cnt').textContent = `${cur + 1} / ${slides.length}`;
  }
  if (!PRINT) {
    fit(); addEventListener('resize', fit);
    addEventListener('keydown', e => {
      if (['ArrowLeft', 'PageDown', ' ', 'Enter'].includes(e.key)) go(cur + 1);       // RTL: left = forward
      if (['ArrowRight', 'PageUp', 'Backspace'].includes(e.key)) go(cur - 1);
      if (e.key === 'Home') go(0); if (e.key === 'End') go(slides.length - 1);
      if (e.key === 'f') document.documentElement.requestFullscreen?.();
    });
    deck.addEventListener('click', e => go(e.clientX < innerWidth / 2 ? cur + 1 : cur - 1));
    document.getElementById('prev').onclick = () => go(cur - 1);
    document.getElementById('next').onclick = () => go(cur + 1);
    document.getElementById('fs').onclick = () => document.documentElement.requestFullscreen?.();
    const start = parseInt(location.hash.slice(1)) - 1;
    document.fonts.ready.then(() => go(isNaN(start) ? 0 : start));
  }
})();
