/* 초공간 차원 붕괴 — 절차적 은하 그리기 (시드가 같으면 항상 같은 모양) */
(function (root) {
  'use strict';

  function rand(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return (r() + r() + r() - 1.5) / 1.5; }

  const PALETTES = [
    ['#fff1d6', '#c9a0ff', '#7d9bff'],
    ['#fff4e0', '#ffad5c', '#b2459c'],
    ['#eaffff', '#6fd2ff', '#5b49e6'],
    ['#fff8e8', '#f6c35f', '#9b5cff']
  ];

  const cache = new Map();
  function model(g) {
    const key = g.type + ':' + g.seed;
    if (cache.has(key)) return cache.get(key);
    const r = rand(g.seed + 17), pal = PALETTES[g.seed % PALETTES.length], pts = [];
    const tilt = 0.45 + r() * 0.35;
    const push = (d, a, size, col, alpha) => pts.push({ d, a, size, col, alpha });
    if (g.type === 'elliptical') {
      for (let i = 0; i < 1300; i++) { const d = Math.abs(gauss(r)) * 0.55; push(d, r() * Math.PI * 2, 0.5 + r(), d < 0.18 ? pal[0] : pal[1], 0.35 + r() * 0.5); }
    } else if (g.type === 'irregular') {
      const clumps = Array.from({ length: 5 + Math.floor(r() * 4) }, () => ({ d: r() * 0.7, a: r() * Math.PI * 2, s: 0.08 + r() * 0.15 }));
      for (let i = 0; i < 1400; i++) {
        const c = clumps[i % clumps.length];
        const x = Math.cos(c.a) * c.d + gauss(r) * c.s, y = Math.sin(c.a) * c.d + gauss(r) * c.s;
        push(Math.hypot(x, y), Math.atan2(y, x), 0.5 + r() * 1.1, pal[Math.floor(r() * 3)], 0.3 + r() * 0.6);
      }
    } else if (g.type === 'ring') {
      for (let i = 0; i < 400; i++) push(Math.abs(gauss(r)) * 0.14, r() * Math.PI * 2, 0.6 + r(), pal[0], 0.6);
      for (let i = 0; i < 1300; i++) push(0.66 + gauss(r) * 0.06, r() * Math.PI * 2, 0.5 + r(), r() < 0.5 ? pal[1] : pal[2], 0.35 + r() * 0.55);
    } else {
      const arms = 2 + Math.floor(r() * 3), twist = 3.2 + r() * 2.2;
      for (let i = 0; i < 1800; i++) {
        const arm = i % arms, d = Math.pow(r(), 0.75);
        const a = arm * Math.PI * 2 / arms + d * twist + gauss(r) * 0.32 * (1.1 - d * 0.6);
        push(d * 0.95, a, 0.4 + r() * 1.2, d < 0.18 ? pal[0] : d < 0.55 ? pal[1] : pal[2], 0.3 + r() * 0.6);
      }
    }
    const m = { pts, tilt, pal };
    cache.set(key, m);
    return m;
  }

  /** ctx에 은하를 그린다. t는 회전 각(라디안). */
  function draw(ctx, w, h, g, t = 0) {
    const m = model(g), cx = w / 2, cy = h / 2, R = Math.min(w, h * 1.6) * 0.46;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#140f3a'); bg.addColorStop(1, '#05051a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
    core.addColorStop(0, m.pal[0]); core.addColorStop(0.25, 'rgba(255,200,150,.35)'); core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    for (const p of m.pts) {
      const a = p.a + t * (1.2 - p.d * 0.6);
      const x = cx + Math.cos(a) * p.d * R, y = cy + Math.sin(a) * p.d * R * m.tilt;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.col;
      const s = p.size * (w / 320);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.45, R * 0.45 * m.tilt, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const CD = root.CD = root.CD || {};
  CD.galaxyArt = { draw, rand };
})(typeof globalThis !== 'undefined' ? globalThis : this);
