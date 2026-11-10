/* Femi ADHD deck – navigation, tangle/flow line system, slide animations */
(function () {
  const W = 1920, H = 1080;
  const PRINT = new URLSearchParams(location.search).has('print');
  const CAP = new URLSearchParams(location.search).has('cap');   // frame-by-frame capture for the PowerPoint export
  if (CAP) document.body.classList.add('cap');
  const SWAPS = CAP ? 2 : 6;
  if (PRINT) document.body.classList.add('print');

  // inline icons (masks/fetch are blocked on file://)
  document.querySelectorAll('.ic').forEach(el => {
    const m = (el.getAttribute('style') || '').match(/icons\/([\w-]+)\.svg/);
    if (m && window.ICONS && ICONS[m[1]]) el.innerHTML = ICONS[m[1]];
  });
  // the intro slide ("view in slide show") exists only in the PowerPoint export
  if (!CAP) document.querySelectorAll('.slide.intro').forEach(e => e.remove());
  const deck = document.getElementById('deck');
  const slides = [...document.querySelectorAll('.slide')];
  slides.forEach((s, i) => s.classList.toggle('active', i === 0));   // exactly one starting slide
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

  const VARIANT = new URLSearchParams(location.search).get('v') || 'a';

  /* ---- orthogonal "route" model: xs/ys alternate H,V,H,V… so any lerp stays orthogonal ---- */
  function orthPts(xs, ys) {
    const p = [[xs[0], ys[0]]];
    for (let i = 1; i < xs.length; i++) { p.push([xs[i], ys[i - 1]]); if (i < ys.length) p.push([xs[i], ys[i]]); }
    return p;
  }
  function rounded(pts, R = 38) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
      const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
      const r = Math.min(R, l1 / 2, l2 / 2);
      if (r < .5) { d += `L${bx.toFixed(1)},${by.toFixed(1)}`; continue; }
      const p1 = [bx - (bx - ax) / l1 * r, by - (by - ay) / l1 * r], p2 = [bx + (cx - bx) / l2 * r, by + (cy - by) / l2 * r];
      d += `L${p1[0].toFixed(1)},${p1[1].toFixed(1)}Q${bx.toFixed(1)},${by.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const z = pts[pts.length - 1]; return d + `L${z[0].toFixed(1)},${z[1].toFixed(1)}`;
  }
  /* ---- loop model: a line that makes one full turn on its way ---- */
  function loopPts(a, b, at = .5, R = 70, side = 1) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy * side, py = ux * side;
    const m = [a[0] + dx * at, a[1] + dy * at], c = [m[0] + px * R, m[1] + py * R];
    const th0 = Math.atan2(m[1] - c[1], m[0] - c[0]), pts = [a, [lerp(a[0], m[0], .55), lerp(a[1], m[1], .55)]];
    for (let k = 0; k <= 6; k++) { const th = th0 + side * k / 6 * Math.PI * 2 * (ux * py - uy * px > 0 ? 1 : -1); pts.push([c[0] + Math.cos(th) * R, c[1] + Math.sin(th) * R]); }
    pts.push([lerp(m[0], b[0], .45), lerp(m[1], b[1], .45)], b);
    return pts;
  }
  const COLORS = ['#1F9DD0', '#DD528B', '#796FB2', '#32A596'];

  /* ---------- SLIDE 1: the six pain points, tangled ---------- */
  function buildTangle(slide) {
    const svg = slide.querySelector('svg.tangle'); if (!svg) return [];
    const nodes = [...slide.querySelectorAll('[data-node]')].map(el => el.dataset.node.split(',').map(Number));
    const core = [960, 548], paths = [];
    if (VARIANT === 'b') {
      const pairs = nodes.map((n, i) => [n, core, i]).concat([[nodes[0], nodes[4], 6], [nodes[5], nodes[2], 7], [nodes[1], nodes[3], 8]]);
      pairs.forEach(([a, b, i]) => {
        const el = mkPath(svg, COLORS[i % 4], 3, .55);
        el.setAttribute('d', smooth(loopPts(a, b, i < 6 ? .5 : .3 + (i % 3) * .2, i < 6 ? 62 : 80, i % 2 ? 1 : -1), 1));
        paths.push(el);
      });
      return paths;
    }
    // A: route map – lanes between the rows, parallel offsets, crossings, a few dead ends
    const Y = [252, 455, 702, 925], X = [175, 650, 1270, 1760];
    const routes = [
      { xs: [1500, 650, 470], ys: [330, 252, 820] },
      { xs: [1590, 1760, 1270, 430], ys: [580, 925, 455, 330] },
      { xs: [1450, 1270, 175, 390], ys: [820, 702, 455, 580] },
      { xs: [470, 650, 1270, 1500], ys: [820, 925, 252, 330] },
      { xs: [390, 175, 1760, 1590], ys: [580, 925, 702, 580] },
      { xs: [430, 650, 1270, 1450], ys: [330, 702, 455, 820] },
      { xs: [1500, 1760, 1270, 650], ys: [330, 455, 925, 702], dead: 1 },
      { xs: [390, 650, 1270], ys: [580, 252, 702], dead: 1 },
      { xs: [1590, 1270, 650], ys: [580, 252, 925], dead: 1 },
    ];
    routes.forEach((rt, i) => {
      const o = ((i % 5) - 2) * 13;   // parallel offset so shared lanes read as bundles
      const xs = rt.xs.map((x, k) => (k === 0 || k === rt.xs.length - 1 && !rt.dead) ? x : x + o);
      const ys = rt.ys.map((y, k) => (k === 0 || k === rt.ys.length - 1 && !rt.dead) ? y : y + o);
      const el = mkPath(svg, COLORS[i % 4], 4, rt.dead ? .45 : .75);
      if (rt.dead) el.setAttribute('stroke-dasharray', '1 12');
      el.setAttribute('d', rounded(orthPts(xs, ys), 34));
      paths.push(el);
      if (rt.dead) {
        const z = orthPts(xs, ys).pop(), c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', z[0]); c.setAttribute('cy', z[1]); c.setAttribute('r', 7);
        c.setAttribute('fill', '#fff'); c.setAttribute('stroke', COLORS[i % 4]); c.setAttribute('stroke-width', 3);
        svg.appendChild(c);
      }
    });
    return paths;
  }

  /* ---------- SLIDE 4: tangle -> one clear path ---------- */
  const FLOW_Y = 420, KNOT_X = 1680, END_X = 200;
  function buildFlow(slide) {
    const svg = slide.querySelector('svg.flow'); if (!svg) return null;
    const r = rng(11), LINES = 7, lines = [];
    for (let i = 0; i < LINES; i++) {
      const el = mkPath(svg, COLORS[i % 4], VARIANT === 'b' ? 3 : 4, .7);
      if (VARIANT === 'b') {
        const a = [1990, 420 + i * 62], tgt = loopPts(a, [KNOT_X - 40, FLOW_Y], .5, 34 + (i % 3) * 10, i % 2 ? 1 : -1);
        tgt.push([lerp(KNOT_X - 40, END_X, .5), FLOW_Y], [END_X, FLOW_Y]);
        const chaos = loopPts(a, [200 + r() * 600, 340 + r() * 600], .5, 120 + r() * 80, i % 2 ? 1 : -1);
        chaos.push([200 + r() * 1500, 340 + r() * 600], [200 + r() * 1500, 340 + r() * 600]);
        lines.push({ el, tgt, chaos, kind: 'b' });
      } else {
        // merged: detours inside the knot zone, then one shared line
        const o = (i - 3) * 13;
        const tx = [1990, 1880 - r() * 50 + o, 1730 + r() * 60 + o, KNOT_X + 10 + o, END_X];
        const ty = [330 + i * 70, 320 + r() * 560, 340 + r() * 520, FLOW_Y];
        // chaos: the same route type spread across the slide (echo of slide 1)
        const cx = [1990, 1400 + r() * 380, 300 + r() * 700, 900 + r() * 700, 160 + r() * 400];
        const cy = [330 + i * 70, 300 + r() * 640, 300 + r() * 640, 320 + r() * 620];
        lines.push({ el, tx, ty, cx, cy, kind: 'a' });
      }
    }
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = `<linearGradient id="flowGrad" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="#1F9DD0"/><stop offset=".55" stop-color="#796FB2"/><stop offset="1" stop-color="#DD528B"/></linearGradient>`;
    svg.appendChild(defs);
    const glow = mkPath(svg, '#1F9DD0', 24, .12);
    const main = mkPath(svg, '#1F9DD0', 6, 1);
    const d = `M${KNOT_X - 40},${FLOW_Y} L${END_X},${FLOW_Y}`;
    glow.setAttribute('d', d); main.setAttribute('d', d);
    const tip = document.createElementNS(NS, 'circle');
    tip.setAttribute('cx', END_X); tip.setAttribute('cy', FLOW_Y); tip.setAttribute('r', 10); tip.setAttribute('fill', '#1F9DD0');
    svg.appendChild(tip);
    const state = { t: 1 };
    function render() {
      const e = state.t;
      lines.forEach(L => {
        if (L.kind === 'a') {
          const xs = L.tx.map((x, k) => lerp(L.cx[k], x, e)), ys = L.ty.map((y, k) => lerp(L.cy[k], y, e));
          L.el.setAttribute('d', rounded(orthPts(xs, ys), 34));
        } else {
          L.el.setAttribute('d', smooth(L.tgt.map((p, k) => [lerp(L.chaos[k][0], p[0], e), lerp(L.chaos[k][1], p[1], e)]), 1));
        }
      });
    }
    render();
    return { state, render, main, glow, tip, lines };
  }

  /* layout position of an element inside its slide (unaffected by the stage scale) */
  function pos(el) { const s = el.closest('.slide').getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / W;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }; }
  function gradDefs(svg, id, a, b, c) {
    const d = document.createElementNS(NS, 'defs');
    d.innerHTML = `<linearGradient id="${id}" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
    svg.appendChild(d);
  }

  /* ---------- SLIDE 7: one clean path that rises through six stations ---------- */
  function buildRoad(slide) {
    const svg = slide.querySelector('svg.road'); if (!svg) return null;
    const st = [...slide.querySelectorAll('.rs')], X = 1762;
    st.forEach(e => { e.style.top = (+e.dataset.y - 38) + 'px'; });
    const ys = st.map(e => +e.dataset.y).sort((p, q) => p - q), yTop = ys[0], yBot = ys[ys.length - 1];
    const d = document.createElementNS(NS, 'defs');
    d.innerHTML = '<linearGradient id="roadGrad" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + yTop + '" y2="' + yBot + '"><stop offset="0" stop-color="#1F9DD0"/><stop offset=".6" stop-color="#796FB2"/><stop offset="1" stop-color="#DD528B"/></linearGradient>';
    svg.appendChild(d);
    const path = `M${X},${yTop} L${X},${yBot}`;
    const glow = mkPath(svg, 'url(#roadGrad)', 24, .12), main = mkPath(svg, 'url(#roadGrad)', 7, 1);
    glow.setAttribute('d', path); main.setAttribute('d', path);
    return { glow, main };
  }

  /* ---------- SLIDE 9: four value cards plugged into one hub ---------- */
  function buildHub(slide) {
    const svg = slide.querySelector('svg.hub'); if (!svg) return [];
    const c = [960, 605], paths = [];
    slide.querySelectorAll('.bc').forEach((card, i) => {
      const p = pos(card), right = p.x > 960, top = p.y < 605;
      const ex = right ? p.x : p.x + p.w, ey = p.y + p.h / 2, mx = right ? c[0] + 110 : c[0] - 110;
      const el = mkPath(svg, COLORS[i % 4], 4, .7);
      el.setAttribute('d', rounded(orthPts([c[0], mx, ex], [c[1], ey]), 30));
      paths.push(el);
    });
    return paths;
  }

  /* ---------- SLIDE 10: a spine through the three impact areas ---------- */
  function buildSpine(slide) {
    const svg = slide.querySelector('svg.spine'); if (!svg) return null;
    const ic = [...slide.querySelectorAll('.bi')].map(pos).map(p => [p.x + p.w / 2, p.y + p.h / 2]);
    gradDefs(svg, 'spineGrad', '#1F9DD0', '#796FB2', '#DD528B');
    svg.querySelector('#spineGrad').setAttribute('x1', 0); svg.querySelector('#spineGrad').setAttribute('y1', 0);
    svg.querySelector('#spineGrad').setAttribute('x2', 0); svg.querySelector('#spineGrad').setAttribute('y2', 1);
    const el = mkPath(svg, 'url(#spineGrad)', 6, .9);
    el.setAttribute('d', `M${ic[0][0]},${ic[0][1] - 140} L${ic[2][0]},${ic[2][1]}`);
    return el;
  }

  /* ---------- SLIDE 6: device lineup on one rail ---------- */
  function buildRail(slide) {
    const svg = slide.querySelector('svg.rail'); if (!svg) return null;
    const pts = [];
    slide.querySelectorAll('.lb').forEach(lb => {
      const d = pos(slide.querySelector('.dv.' + lb.dataset.for)), cx = d.x + d.w / 2;
      lb.style.left = 'auto'; lb.style.right = (W - cx) + 'px';
      const p = pos(lb.querySelector('b')); pts.push([p.x + p.w / 2, p.y + p.h / 2]);
    });
    gradDefs(svg, 'railGrad', '#4FD1E8', '#796FB2', '#DD528B');
    const g = svg.querySelector('#railGrad'); g.setAttribute('gradientUnits', 'userSpaceOnUse'); g.setAttribute('x1', 1920); g.setAttribute('x2', 0);
    const y = 872, line = mkPath(svg, 'url(#railGrad)', 3, .85);
    line.setAttribute('d', `M1990,${y} L${pts[pts.length - 1][0] - 40},${y}`);
    pts.forEach(([x]) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 7);
      c.setAttribute('fill', '#0E1736'); c.setAttribute('stroke', '#4FD1E8'); c.setAttribute('stroke-width', 3); svg.appendChild(c); });
    return line;
  }

  /* ---------- per-slide animations (live mode only) ---------- */
  const built = {};
  slides.forEach((s, i) => {
    if (s.classList.contains('s1')) built[i] = { paths: buildTangle(s) };
    if (s.classList.contains('s4')) built[i] = { flow: buildFlow(s) };
  });
  // layout-dependent builders run once fonts are ready (live and print)
  const ready = document.fonts.ready.then(() => slides.forEach((s, i) => {
    const vis = s.style.visibility; s.style.visibility = 'visible';
    if (s.classList.contains('s6')) built[i] = { rail: buildRail(s) };
    if (s.classList.contains('s7')) built[i] = { road: buildRoad(s) };
    if (s.classList.contains('s9')) built[i] = { hub: buildHub(s) };
    if (s.classList.contains('s10')) built[i] = { spine: buildSpine(s) };
    s.style.visibility = vis;
  }));

  function drawIn(el, dur, delay, from = 'start') {
    const len = el.getTotalLength();
    return gsap.fromTo(el, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur, delay, ease: 'power2.inOut',
      onComplete: () => { if (!el.dataset.dash) el.style.strokeDasharray = ''; } });
  }

  function generic(s) {
    const tl = gsap.timeline();
    tl.from(s.querySelectorAll('.head > *, .t10, .toplogo'), { y: 20, opacity: 0, duration: .6, stagger: .08 })
      .from(s.querySelectorAll('.ani'), { y: 26, opacity: 0, duration: .55, stagger: .12, ease: 'power3.out' }, .3);
    return tl;
  }
  const enter = {
    s2: generic, s3: generic, s5: generic, s11: generic, s12: generic,
    s6(s, i) {
      const tl = gsap.timeline(), rail = built[i].rail;
      tl.from(s.querySelectorAll('.head > *'), { y: 20, opacity: 0, duration: .6, stagger: .08 });
      if (rail) tl.add(drawIn(rail, 2.2, 0), .4);
      ['web', 'lap', 'ph', 'doc'].forEach((k, n) => {
        tl.from(s.querySelector('.dv.' + k), { y: 50, opacity: 0, duration: .8, ease: 'power3.out' }, .5 + n * .45)
          .from(s.querySelector(`.lb[data-for="${k}"]`), { y: 16, opacity: 0, duration: .5 }, .7 + n * .45);
      });
      // screens change: questionnaire -> teacher status on the laptop, personal area -> questionnaire on the phone
      const swapAt = (el, n, t) => { const sc = [...el.querySelectorAll('.sc')], a = sc[n % sc.length], b = sc[(n + 1) % sc.length];
        tl.to(a, { opacity: 0, duration: .7, ease: 'none' }, t).to(b, { opacity: 1, duration: .7, ease: 'none' }, t); };
      s.querySelectorAll('.sc').forEach(x => gsap.set(x, { opacity: x.classList.contains('on') ? 1 : 0 }));
      for (let n = 0; n < SWAPS; n++) { swapAt(s.querySelector('.lap'), n, 4 + n * 3); swapAt(s.querySelector('.ph'), n, 5.5 + n * 3); }
      return tl;
    },
    s7(s, i) {
      const r = built[i].road, tl = gsap.timeline();
      tl.from(s.querySelector('.photo'), { x: -60, opacity: 0, duration: 1, ease: 'power3.out' })
        .from(s.querySelectorAll('.head > *'), { y: 20, opacity: 0, duration: .6, stagger: .08 }, .2)
        .add(drawIn(r.main, 2.2, 0), .5).add(drawIn(r.glow, 2.2, 0), .5)
        .from(s.querySelectorAll('.rs'), { x: -24, opacity: 0, duration: .5, stagger: .3, ease: 'power3.out' }, .7)
        .from(s.querySelectorAll('.start,.note'), { opacity: 0, duration: .6 }, .4);
      return tl;
    },
    s8(s) {
      const tl = generic(s);
      tl.from(s.querySelector('.photo8'), { x: -60, opacity: 0, duration: 1, ease: 'power3.out' }, 0);
      return tl;
    },
    s9(s, i) { const tl = generic(s); (built[i].hub || []).forEach((p, k) => tl.add(drawIn(p, .9, 0), 1.2 + k * .15)); return tl; },
    s10(s, i) { const tl = generic(s); if (built[i].spine) tl.add(drawIn(built[i].spine, 1.6, 0), .6); return tl; },
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
    window.__tl = tl;
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
    ready.then(() => go(isNaN(start) ? 0 : start));
  }
})();
