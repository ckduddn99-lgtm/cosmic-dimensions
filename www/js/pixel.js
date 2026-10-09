/* 초공간 차원 붕괴 — 도트(픽셀아트) 렌더러
 * 모든 그림은 코드로 한 칸씩 찍는다. 저해상도 캔버스에 그린 뒤 CSS로 확대(image-rendering: pixelated)한다.
 */
(function (root) {
  'use strict';

  const CD = root.CD = root.CD || {};
  const SD = CD.sagaData;

  /* ───────────── 기본 도구 ───────────── */

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + [16, 8, 0].map(s => c(s).toString(16).padStart(2, '0')).join('');
  }

  /** 스프라이트 그리기용 붓: (x, y)를 원점으로, unit 배율, 좌우 반전 지원 */
  function brush(ctx, ox, oy, unit, flip, w) {
    return (x, y, ww, hh, col) => {
      if (!col) return;
      ctx.fillStyle = col;
      const xx = flip ? w - x - ww : x;
      ctx.fillRect(Math.round(ox + xx * unit), Math.round(oy + y * unit), ww * unit, hh * unit);
    };
  }

  /* 3×5 숫자 글꼴 (데미지 표시용) */
  const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', '-': '000000111000000' };
  function drawNumber(ctx, text, x, y, col, unit = 1) {
    let cx = x;
    for (const ch of String(text)) {
      const g = DIGITS[ch];
      if (g) for (let k = 0; k < 15; k++) if (g[k] === '1') { ctx.fillStyle = '#000'; ctx.fillRect(cx + (k % 3) * unit + unit, y + Math.floor(k / 3) * unit + unit, unit, unit); ctx.fillStyle = col; ctx.fillRect(cx + (k % 3) * unit, y + Math.floor(k / 3) * unit, unit, unit); }
      cx += 4 * unit;
    }
  }

  /* ───────────── 인물 외형 ───────────── */

  const SKINS = ['#f2c9a0', '#e0ac7e', '#c68b5f', '#8d5a3b', '#f6dcc4'];
  const HAIRS = ['#2b1d14', '#6b3f1f', '#c9a14a', '#e8e1d0', '#8a2f2f', '#3b3b6b', '#1f4d3a', '#c46ad6'];

  function personLook(p) {
    const r = rng(p.look + 7), c = SD.classes[p.cls];
    const corrupt = p.status === 'fallen' ? 100 : p.corrupt;
    let cloth = c.color, hair = HAIRS[Math.floor(r() * HAIRS.length)];
    if (corrupt >= 50) cloth = mix(cloth, '#2a0f3a', Math.min(0.75, (corrupt - 40) / 80));
    return {
      skin: SKINS[Math.floor(r() * SKINS.length)], hair, cloth, cloth2: shade(cloth, 0.7), pants: shade(cloth, 0.5), boots: '#2a1d16',
      eye: corrupt >= 60 ? '#ff2a55' : '#1a1a2a', gear: c.gear, hood: c.id === 'hunter' || c.id === 'thief' || (c.id === 'mage' && r() < 0.5),
      helmet: c.id === 'knight' || c.id === 'warrior' && r() < 0.5, longHair: r() < 0.45,
      aura: p.status === 'fallen' ? '#9b2bff' : corrupt >= 80 ? '#6a1fb0' : null
    };
  }

  const AVATARS = [
    { skin: '#e0ac7e', hair: '#3a2416', cloth: '#2f6b35', cloth2: '#1e4a24', pants: '#3b2a1c', boots: '#1d1410', eye: '#0e0e18', gear: 'bow', hood: true, cape: '#173b1e', belt3: true, glow: '#8ff0a8' },
    { skin: '#f6dcc4', hair: '#f0d27a', cloth: '#3a6fd1', cloth2: '#2a4f9a', pants: '#2a4f9a', boots: '#1e2a4a', eye: '#1a1a3a', gear: 'harp', longHair: true, robe: true, glow: '#9cc8ff' },
    { skin: '#f2c9a0', hair: '#1a1222', cloth: '#b2283c', cloth2: '#7a1626', pants: '#7a1626', boots: '#3a0e16', eye: '#1a0a12', gear: 'scepter', crown: true, longHair: true, robe: true, cape: '#5a0e1a', glow: '#ffd27a' },
    { horse: true, glow: '#d6e4ff' },
    { skin: '#f6dcc4', hair: '#f4f4ff', cloth: '#eef2ff', cloth2: '#b8c4e8', pants: '#b8c4e8', boots: '#9aa8cc', eye: '#2a3a6a', gear: 'staff', longHair: true, robe: true, feathers: true, glow: '#d8f0ff' },
    { skin: '#c68b5f', hair: '#2a0e0e', cloth: '#7a1f1f', cloth2: '#4a1010', pants: '#3a0e0e', boots: '#1a0606', eye: '#ffcc33', gear: 'sword', helmet: true, tail: true, glow: '#ff8a5a' },
    { bear: true, glow: '#ffe7a0' },
    { skin: '#f2d6e8', hair: '#b9a6ff', cloth: '#7a4fd0', cloth2: '#4e2c9a', pants: '#4e2c9a', boots: '#2e1a5a', eye: '#2a1a4a', gear: 'orb', longHair: true, robe: true, chains: true, tiara: true, glow: '#d0b0ff' }
  ];

  /* ───────────── 인간형 스프라이트 (12×18) ───────────── */

  function drawGear(px, L, pose, f) {
    const atk = pose === 'attack' && f % 2 === 1;
    const wood = '#6b4423', steel = '#cfd6e4';
    switch (L.gear) {
      case 'sword': if (atk) { px(10, 9, 7, 1, steel); px(9, 9, 1, 1, '#8a6a2a'); } else { px(10, 3, 1, 8, steel); px(9, 10, 3, 1, '#8a6a2a'); } break;
      case 'rapier': if (atk) px(10, 9, 7, 1, steel); else px(10, 4, 1, 7, steel); break;
      case 'dagger': if (atk) px(10, 9, 4, 1, steel); else px(10, 9, 1, 3, steel); break;
      case 'lance': if (atk) { px(8, 9, 10, 1, steel); px(18, 9, 1, 1, '#fff'); } else { px(10, 0, 1, 17, steel); px(10, 0, 1, 2, '#fff'); } break;
      case 'bow': px(11, 6, 1, 1, wood); px(12, 7, 1, 5, wood); px(11, 12, 1, 1, wood); px(11, 7, 1, 5, '#e8e0c8'); if (atk) px(12, 9, 5, 1, '#d8d0b8'); break;
      case 'staff': px(10, 1, 1, 16, wood); px(9, 0, 3, 2, L.cloth === '#eef2ff' ? '#9cf0ff' : '#ffd27a'); break;
      case 'scepter': px(10, 5, 1, 8, '#e8b84a'); px(9, 4, 3, 2, '#ff4a6a'); break;
      case 'orb': px(10, 8, 3, 3, '#c89cff'); px(11, 9, 1, 1, '#fff'); break;
      case 'shield': px(9, 8, 3, 6, '#8a94a8'); px(10, 9, 1, 4, '#e8c14a'); break;
      case 'book': px(9, 9, 3, 3, '#7a2a2a'); px(10, 9, 1, 3, '#f0e6c8'); break;
      case 'lute': px(8, 10, 4, 3, '#8a5a2a'); px(9, 11, 1, 1, '#2a1a0a'); px(11, 7, 1, 3, '#6b4423'); break;
      case 'harp': break;
    }
  }

  function drawHuman(ctx, x, y, L, pose = 'idle', f = 0, flip = false, unit = 1) {
    const ox = x, oy = y - 18 * unit;
    if (pose === 'dead') return drawLying(ctx, x, y, L, flip, unit);
    const px = brush(ctx, ox, oy, unit, flip, 12);
    const bob = pose === 'idle' && f % 2 === 1 ? 1 : 0;
    const sit = pose === 'sit' || pose === 'kneel';
    const dy = (sit ? 3 : 0) + bob;
    // 망토
    if (L.cape) px(2, 7 + dy, 2, sit ? 7 : 9, L.cape);
    if (L.feathers) { px(1, 7 + dy, 2, 7, '#ffffff'); px(0, 9 + dy, 1, 4, '#dfe8ff'); }
    // 다리
    if (sit) {
      px(4, 14, 6, 2, L.pants); px(9, 15, 2, 2, L.boots); px(3, 15, 2, 2, L.boots);
    } else if (pose === 'walk') {
      const st = [[0, 0], [1, -1], [0, 0], [-1, 1]][f % 4];
      px(4 + st[0], 13, 2, 4, L.pants); px(4 + st[0], 17, 2, 1, L.boots);
      px(6 + st[1], 13, 2, 4, shade(L.pants, 0.85)); px(6 + st[1], 17, 2, 1, L.boots);
    } else {
      px(4, 13, 2, 4, L.pants); px(6, 13, 2, 4, shade(L.pants, 0.85)); px(4, 17, 2, 1, L.boots); px(6, 17, 2, 1, L.boots);
    }
    // 몸통
    px(3, 7 + dy, 6, 6, L.cloth);
    if (L.robe) px(3, 12 + dy, 6, sit ? 2 : 4, L.cloth);
    px(3, 11 + dy, 6, 1, L.cloth2);
    if (L.belt3) { px(4, 11 + dy, 1, 1, '#fff'); px(6, 11 + dy, 1, 1, '#fff'); px(8, 11 + dy, 1, 1, '#fff'); }
    if (L.chains) { px(2, 10 + dy, 1, 1, '#c8c8d8'); px(9, 10 + dy, 1, 1, '#c8c8d8'); }
    // 팔
    const swing = pose === 'walk' ? [0, 1, 0, -1][f % 4] : 0;
    px(2, 7 + dy + Math.max(0, swing), 1, 4, L.cloth2); px(2, 11 + dy + Math.max(0, swing), 1, 1, L.skin);
    if (pose === 'attack' && f % 2 === 1) { px(9, 8 + dy, 2, 1, L.cloth2); px(11, 8 + dy, 1, 1, L.skin); }
    else if (pose === 'cast') { px(9, 3 + dy, 1, 4, L.cloth2); px(9, 2 + dy, 1, 1, L.skin); px(2, 3 + dy, 1, 4, L.cloth2); }
    else { px(9, 7 + dy - Math.min(0, swing), 1, 4, L.cloth2); px(9, 11 + dy - Math.min(0, swing), 1, 1, L.skin); }
    // 머리
    px(4, 2 + dy, 4, 5, L.skin);
    px(3, 1 + dy, 6, 2, L.hair); px(3, 3 + dy, 1, 2, L.hair);
    if (L.longHair) px(3, 3 + dy, 1, 5, L.hair);
    px(6, 4 + dy, 1, 1, L.eye); px(7, 4 + dy, 1, 1, L.eye);
    if (L.hood) { px(3, 0 + dy, 6, 2, L.cloth2); px(2, 1 + dy, 1, 4, L.cloth2); px(3, 2 + dy, 1, 3, L.cloth2); }
    if (L.helmet) { px(3, 0 + dy, 6, 2, '#8a94a8'); px(3, 2 + dy, 1, 2, '#8a94a8'); px(5, 0 + dy, 1, 1, '#c8d0e0'); }
    if (L.crown) { px(4, -1 + dy, 4, 1, '#f0c040'); px(4, -2 + dy, 1, 1, '#f0c040'); px(6, -2 + dy, 1, 1, '#ff4a6a'); px(7, -2 + dy, 1, 1, '#f0c040'); }
    if (L.tiara) { px(4, 0 + dy, 4, 1, '#e0e8ff'); px(5, -1 + dy, 1, 1, '#9cf0ff'); }
    if (L.tail) { px(1, 9 + dy, 1, 4, '#5a1414'); px(0, 5 + dy, 1, 5, '#5a1414'); px(0, 4 + dy, 2, 1, '#5a1414'); px(2, 3 + dy, 1, 2, '#ffcc33'); }
    if (pose === 'cast') px(5, -1 + dy, 2, 2, f % 2 ? '#fff6c8' : '#ffd27a');
    if (!sit || L.gear !== 'harp') drawGear(px, L, pose, f);
  }

  function drawLying(ctx, x, y, L, flip, unit) {
    const px = brush(ctx, x - 3 * unit, y - 5 * unit, unit, flip, 18);
    px(0, 1, 4, 4, L.skin); px(0, 0, 4, 2, L.hair); px(1, 2, 1, 1, '#1a1a2a');
    px(4, 1, 7, 4, L.cloth); px(11, 2, 5, 2, L.pants); px(16, 2, 2, 2, L.boots);
    px(5, 5, 9, 1, 'rgba(0,0,0,.35)');
  }

  /* 페가수스 (16×14) */
  function drawHorse(ctx, x, y, f, flip, unit, flying) {
    const px = brush(ctx, x, y - 14 * unit, unit, flip, 16);
    const w = '#eef2ff', s = '#c4cce8', m = '#9fdcff';
    const leg = flying ? 0 : f % 2;
    px(3, 6, 9, 4, w); px(11, 3, 3, 4, w); px(13, 2, 2, 2, w); px(14, 4, 1, 1, '#1a2240'); px(12, 1, 1, 2, m); px(10, 2, 2, 3, m);
    px(2, 6, 1, 3, m); px(1, 7, 1, 3, m);
    px(4, 10, 1, 3 + leg, s); px(6, 10, 1, 3 - leg, s); px(9, 10, 1, 3 + leg, s); px(11, 10, 1, 3 - leg, s);
    const wing = flying ? (f % 2 ? 0 : 2) : 1;
    px(5, 2 + wing, 5, 2, '#ffffff'); px(4, 1 + wing, 4, 1, '#e8f0ff'); px(3, 0 + wing * 1.5, 3, 1, '#dfe8ff');
  }

  /* 큰곰 (16×14, 앉은 자세) */
  function drawBear(ctx, x, y, f, flip, unit, sitting) {
    const px = brush(ctx, x, y - 14 * unit, unit, flip, 16);
    const b = '#7a4a2a', d = '#5a3418', l = '#c89a6a';
    const by = f % 2;
    px(3, 4 + by, 10, 8, b); px(4, 1 + by, 7, 5, b); px(4, 0 + by, 2, 2, d); px(9, 0 + by, 2, 2, d);
    px(9, 3 + by, 3, 2, l); px(11, 3 + by, 1, 1, '#1a0e08'); px(8, 2 + by, 1, 1, '#1a0e08');
    px(5, 6 + by, 6, 5, l);
    px(6, -1 + by, 2, 1, '#fff6a8');
    if (sitting) { px(2, 11, 5, 3, d); px(9, 11, 5, 3, d); }
    else { const k = f % 2; px(3, 12, 2, 2 + k, d); px(7, 12, 2, 2 - k, d); px(10, 12, 2, 2 + k, d); px(12, 12, 2, 2 - k, d); }
  }

  /* ───────────── 몬스터 ───────────── */

  function drawMonster(ctx, id, x, y, f, flip, unit, hurt) {
    const m = SD.monsters.find(q => q.id === id) || SD.monsters[0];
    const col = hurt ? '#ffffff' : m.color, dk = hurt ? '#e0e0e0' : shade(m.color, 0.6);
    if (id === 'slime') {
      const px = brush(ctx, x, y - 8 * unit, unit, flip, 12), sq = f % 2;
      px(2, 2 + sq, 8, 6 - sq, col); px(1, 4 + sq, 10, 4 - sq, col); px(3, 1 + sq, 6, 1, col); px(3, 4 + sq, 1, 1, '#fff'); px(4, 4 + sq, 1, 1, '#123'); px(7, 4 + sq, 1, 1, '#123');
    } else if (id === 'bat') {
      const px = brush(ctx, x, y - 16 * unit, unit, flip, 14), w = f % 2 ? 0 : 2;
      px(5, 4, 4, 3, col); px(6, 5, 1, 1, '#ff3a3a'); px(1, 3 + w, 4, 2, dk); px(9, 3 + w, 4, 2, dk); px(0, 4 + w, 1, 1, dk); px(13, 4 + w, 1, 1, dk);
    } else if (id === 'wolf') {
      const px = brush(ctx, x, y - 10 * unit, unit, flip, 16), k = f % 2;
      px(2, 3, 10, 4, col); px(11, 1, 4, 4, col); px(14, 3, 2, 2, col); px(12, 0, 1, 1, dk); px(13, 2, 1, 1, '#ffde3a'); px(0, 2, 2, 2, dk);
      px(3, 7, 1, 3 - k, dk); px(5, 7, 1, 2 + k, dk); px(9, 7, 1, 3 - k, dk); px(11, 7, 1, 2 + k, dk);
    } else if (id === 'skeleton') {
      drawHuman(ctx, x, y, { skin: col, hair: col, cloth: hurt ? '#fff' : '#bdb6a0', cloth2: dk, pants: dk, boots: dk, eye: '#000', gear: 'sword' }, f % 4 < 2 ? 'idle' : 'attack', f, flip, unit);
    } else if (id === 'golem') {
      const px = brush(ctx, x, y - 16 * unit, unit, flip, 14), k = f % 2;
      px(3, 2, 8, 7, col); px(1, 5 + k, 3, 6, dk); px(10, 5 - k, 3, 6, dk); px(4, 9, 6, 4, col); px(4, 13, 2, 3, dk); px(8, 13, 2, 3, dk); px(5, 4, 1, 1, '#ffb43a'); px(8, 4, 1, 1, '#ffb43a');
    } else {
      const px = brush(ctx, x, y - 15 * unit, unit, flip, 12), wv = f % 2;
      ctx.globalAlpha = 0.85;
      px(3, 1, 6, 6, col); px(2, 4, 8, 7, col); px(2 + wv, 11, 2, 2, col); px(6 - wv, 11, 2, 3, col); px(9, 11, 1, 2, col);
      px(4, 4, 1, 2, '#fff'); px(7, 4, 1, 2, '#fff');
      ctx.globalAlpha = 1;
    }
  }

  /* ───────────── 성소 배경 ───────────── */

  // 성좌별 성소: 배경(정적) + 장식(움직임) + 이동 범위와 앉을 자리
  const SANCT = [
    { name: '사냥꾼의 숲', sky: ['#050a18', '#14304a'], floor: '#1f3a22', walk: [24, 150], seat: { x: 112, y: 92, pose: 'sit' } },
    { name: '별빛 음악당', sky: ['#0a0c24', '#1c2a5a'], floor: '#d8dcec', walk: [30, 160], seat: { x: 88, y: 92, pose: 'sit' } },
    { name: '오만의 왕좌', sky: ['#14060c', '#3a0e1c'], floor: '#4a1a24', walk: [30, 160], seat: { x: 88, y: 80, pose: 'sit' } },
    { name: '구름 위의 고원', sky: ['#2a3a7a', '#f0b88a'], floor: '#ffffff', walk: [20, 150], fly: true },
    { name: '얼어붙은 호수', sky: ['#060c1c', '#1c3a5e'], floor: '#bcd4ee', walk: [24, 160], seat: { x: 140, y: 92, pose: 'kneel' } },
    { name: '피의 투기장', sky: ['#1a0608', '#7a2a1a'], floor: '#b07440', walk: [26, 160] },
    { name: '북극성 관측소', sky: ['#020814', '#0c2440'], floor: '#e4eef8', walk: [30, 150], seat: { x: 120, y: 94, pose: 'sit' } },
    { name: '사슬의 꿈 정원', sky: ['#05020e', '#2a0c46'], floor: '#3a2a5a', walk: [30, 160], float: true }
  ];
  const W = 192, H = 108, GROUND = 96;

  function gradient(c, top, bottom, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillRect(0, 0, W, h);
  }
  function stars(c, n, seed, h, col = '#ffffff') {
    const r = rng(seed);
    for (let k = 0; k < n; k++) { c.globalAlpha = 0.3 + r() * 0.7; c.fillStyle = col; c.fillRect(Math.floor(r() * W), Math.floor(r() * h), 1, 1); }
    c.globalAlpha = 1;
  }

  function buildBackground(i) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), S = SANCT[i];
    c.imageSmoothingEnabled = false;
    gradient(c, S.sky[0], S.sky[1], H);
    const r = rng(i * 99 + 3);
    switch (i) {
      case 0: // 숲: 달, 산, 침엽수, 모닥불 자리
        stars(c, 60, 1, 60);
        for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) { const d = xx * xx + yy * yy, d2 = (xx - 3) * (xx - 3) + (yy + 1) * (yy + 1); if (d <= 25 && d2 > 18) { c.fillStyle = d > 16 ? '#d8d0a8' : '#f4f0d0'; c.fillRect(155 + xx, 17 + yy, 1, 1); } }
        c.fillStyle = '#0f2232'; for (let x = 0; x < W; x += 2) c.fillRect(x, 62 - Math.floor(8 * Math.abs(Math.sin(x / 23))), 2, 40);
        for (let k = 0; k < 14; k++) { const tx = Math.floor(r() * W), th = 18 + Math.floor(r() * 20); c.fillStyle = k % 2 ? '#0c2a16' : '#123a1e'; for (let yy = 0; yy < th; yy++) { const ww = Math.floor((yy / th) * 10) + 1; c.fillRect(tx - ww / 2, GROUND - 4 - th + yy, ww, 1); } c.fillStyle = '#2a1a10'; c.fillRect(tx, GROUND - 4, 1, 4); }
        c.fillStyle = S.floor; c.fillRect(0, GROUND, W, H - GROUND);
        c.fillStyle = '#2a4a26'; for (let x = 0; x < W; x += 3) c.fillRect(x, GROUND - 1, 1, 1 + (x % 2));
        c.fillStyle = '#4a2e1a'; c.fillRect(100, 92, 18, 3);
        c.fillStyle = '#e8e0c8'; c.fillRect(40, 94, 3, 2); c.fillRect(43, 93, 1, 1);
        break;
      case 1: // 음악당: 기둥, 체크 바닥, 큰 하프
        stars(c, 40, 2, 40, '#cfe0ff');
        c.fillStyle = '#2a3460'; c.fillRect(0, 20, W, 4);
        for (let x = 12; x < W; x += 34) { c.fillStyle = '#e8ecf8'; c.fillRect(x, 24, 8, 72); c.fillStyle = '#c4cce4'; c.fillRect(x + 6, 24, 2, 72); c.fillStyle = '#ffffff'; c.fillRect(x - 2, 22, 12, 3); c.fillRect(x - 2, 92, 12, 4); }
        c.fillStyle = S.floor; c.fillRect(0, GROUND, W, H - GROUND);
        for (let x = 0; x < W; x += 8) for (let y = GROUND; y < H; y += 4) { if (((x / 8) + (y - GROUND) / 4) % 2 === 0) { c.fillStyle = '#b8c0d8'; c.fillRect(x, y, 8, 4); } }
        c.fillStyle = '#e8b84a'; c.fillRect(96, 40, 2, 50); c.fillRect(96, 40, 20, 2); for (let k = 0; k < 8; k++) c.fillRect(116 - k, 42 + k * 5, 2, 5);
        c.fillStyle = '#fff6c8'; for (let k = 0; k < 6; k++) c.fillRect(100 + k * 2, 42, 1, 46 - k * 4);
        c.fillStyle = '#6b4423'; c.fillRect(82, 90, 12, 3);
        break;
      case 2: // 왕좌: 붉은 카펫, 깃발, 왕좌, 거울
        c.fillStyle = '#220a12'; c.fillRect(0, 0, W, 70);
        for (let x = 0; x < W; x += 16) { c.fillStyle = '#2e0e18'; c.fillRect(x, 0, 8, 70); }
        for (let x = 20; x < W; x += 52) { c.fillStyle = '#8a1626'; c.fillRect(x, 8, 12, 30); c.fillStyle = '#f0c040'; c.fillRect(x + 4, 18, 4, 4); c.fillStyle = '#8a1626'; c.fillRect(x, 38, 4, 3); c.fillRect(x + 8, 38, 4, 3); }
        c.fillStyle = S.floor; c.fillRect(0, 70, W, H - 70);
        c.fillStyle = '#9a1a2a'; c.fillRect(78, 72, 36, H - 72); c.fillStyle = '#f0c040'; c.fillRect(78, 72, 1, H - 72); c.fillRect(113, 72, 1, H - 72);
        c.fillStyle = '#c89a2a'; c.fillRect(80, 46, 32, 34); c.fillStyle = '#e8c04a'; c.fillRect(82, 44, 28, 4); c.fillRect(84, 40, 4, 4); c.fillRect(94, 38, 4, 6); c.fillRect(104, 40, 4, 4);
        c.fillStyle = '#7a1626'; c.fillRect(86, 54, 20, 24);
        c.fillStyle = '#c8d4f0'; c.fillRect(160, 30, 14, 24); c.fillStyle = '#8a9ac0'; c.fillRect(162, 32, 10, 20); c.fillStyle = '#e8c04a'; c.fillRect(158, 28, 18, 2); c.fillRect(158, 54, 18, 2);
        break;
      case 3: // 구름 고원: 노을, 태양, 구름
        c.fillStyle = '#ffe2a8'; c.fillRect(30, 40, 16, 16); c.fillStyle = '#fff2cc'; c.fillRect(33, 43, 10, 10);
        for (let k = 0; k < 9; k++) { const cx = Math.floor(r() * W), cy = 20 + Math.floor(r() * 50), cw = 20 + Math.floor(r() * 30); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(cx, cy, cw, 4); c.fillRect(cx + 4, cy - 3, cw - 10, 3); }
        c.fillStyle = '#ffffff'; for (let x = 0; x < W; x += 6) c.fillRect(x, GROUND - 2 - (x % 12 === 0 ? 2 : 0), 8, 14);
        c.fillStyle = '#e8eefc'; c.fillRect(0, GROUND + 4, W, H - GROUND);
        break;
      case 4: // 얼음 호수: 산, 얼음, 갈대
        stars(c, 70, 4, 50, '#dff0ff');
        c.fillStyle = '#1a3050'; for (let x = 0; x < W; x++) c.fillRect(x, 50 + Math.floor(14 * Math.abs(Math.sin(x / 17) * Math.cos(x / 41))), 1, 40);
        c.fillStyle = '#e8f2ff'; for (let x = 0; x < W; x++) { const top = 50 + Math.floor(14 * Math.abs(Math.sin(x / 17) * Math.cos(x / 41))); if (top < 56) c.fillRect(x, top, 1, 2); }
        c.fillStyle = S.floor; c.fillRect(0, 84, W, H - 84);
        c.fillStyle = '#9cbce0'; for (let k = 0; k < 20; k++) c.fillRect(Math.floor(r() * W), 86 + Math.floor(r() * 20), 6 + Math.floor(r() * 10), 1);
        c.fillStyle = '#4a5a3a'; for (let x = 4; x < 30; x += 3) c.fillRect(x, 78 + (x % 2), 1, 8);
        break;
      case 5: // 투기장: 붉은 달, 아치 벽, 횃불
        c.fillStyle = '#ff5a3a'; c.fillRect(140, 10, 14, 14); c.fillStyle = '#ffa070'; c.fillRect(143, 13, 6, 6);
        c.fillStyle = '#5a2e1a'; c.fillRect(0, 34, W, 54);
        for (let x = 4; x < W; x += 22) { c.fillStyle = '#2a120a'; c.fillRect(x, 46, 12, 20); c.fillRect(x + 2, 43, 8, 3); }
        c.fillStyle = '#7a4428'; c.fillRect(0, 34, W, 4); c.fillRect(0, 76, W, 4);
        c.fillStyle = S.floor; c.fillRect(0, 86, W, H - 86);
        c.fillStyle = '#946032'; for (let k = 0; k < 40; k++) c.fillRect(Math.floor(r() * W), 88 + Math.floor(r() * 18), 2, 1);
        c.fillStyle = '#3a2010'; c.fillRect(20, 70, 2, 16); c.fillRect(170, 70, 2, 16);
        break;
      case 6: // 관측소: 오로라 자리, 북극성, 돔과 망원경
        stars(c, 90, 6, 70, '#e8f4ff');
        c.fillStyle = '#ffffff'; c.fillRect(150, 10, 3, 3); c.fillRect(151, 8, 1, 7); c.fillRect(148, 11, 7, 1);
        c.fillStyle = '#3a4a64'; c.fillRect(20, 60, 40, 36); c.fillStyle = '#5a6a84'; for (let k = 0; k < 20; k++) c.fillRect(20 + k, 60 - Math.floor(Math.sqrt(400 - (k - 20) * (k - 20)) / 1.4) + 4, 1, 4); for (let k = 20; k < 40; k++) c.fillRect(20 + k, 60 - Math.floor(Math.sqrt(400 - (k - 20) * (k - 20)) / 1.4) + 4, 1, 4);
        c.fillStyle = '#1a2234'; c.fillRect(36, 46, 6, 12); c.fillStyle = '#8a9ab4'; c.fillRect(42, 40, 12, 3);
        c.fillStyle = S.floor; c.fillRect(0, GROUND, W, H - GROUND);
        c.fillStyle = '#c8d8ec'; for (let x = 0; x < W; x += 5) c.fillRect(x, GROUND, 3, 1);
        c.fillStyle = '#5a3a20'; c.fillRect(112, 94, 18, 3);
        break;
      case 7: // 꿈 정원: 은하 소용돌이, 떠 있는 섬, 사슬
        stars(c, 100, 7, H, '#e8d8ff');
        for (let k = 0; k < 200; k++) { const a = k * 0.21, d = k * 0.25; c.fillStyle = k % 3 ? '#8a5ad8' : '#d8b8ff'; c.globalAlpha = 0.5; c.fillRect(Math.floor(140 + Math.cos(a) * d), Math.floor(34 + Math.sin(a) * d * 0.5), 1, 1); }
        c.globalAlpha = 1;
        [[20, 40, 26], [150, 66, 30], [70, 28, 18]].forEach(([ix, iy, iw]) => { c.fillStyle = '#4a3a6a'; c.fillRect(ix, iy, iw, 4); c.fillStyle = '#2a1a44'; for (let k = 0; k < iw / 2; k++) c.fillRect(ix + k * 2, iy + 4, 2, 6 - Math.floor(Math.abs(k - iw / 4) / 2)); c.fillStyle = '#6a8a5a'; c.fillRect(ix, iy - 1, iw, 1); });
        c.fillStyle = '#8a8aa8'; for (let y = 0; y < 50; y += 3) { c.fillRect(56, y, 2, 2); c.fillRect(132, y + 1, 2, 2); }
        c.fillStyle = S.floor; c.fillRect(0, GROUND, W, H - GROUND);
        c.fillStyle = '#5a4a8a'; for (let x = 0; x < W; x += 4) c.fillRect(x, GROUND, 2, 1);
        break;
    }
    return cv;
  }

  /* ───────────── 성소 장면 ───────────── */

  class Sanctuary {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      canvas.width = W; canvas.height = H;
      this.ctx.imageSmoothingEnabled = false;
      this.bgs = {}; this.i = -1; this.parts = []; this.visitor = null;
    }
    set(i, awake) {
      if (this.i === i && this.awake === awake) return;
      this.i = i; this.awake = awake;
      const S = SANCT[i];
      this.av = { x: (S.walk[0] + S.walk[1]) / 2, tx: 0, mode: 'idle', until: 0, flip: false, f: 0, y: GROUND + 2 };
      this.parts = [];
    }
    get name() { return SANCT[this.i].name; }
    /** 말풍선 위치(캔버스 대비 %) */
    anchor() { return { x: (this.av.x + 8) / W * 100, y: (this.av.y - (AVATARS[this.i].horse || AVATARS[this.i].bear ? 34 : 42)) / H * 100 }; }
    react(kind) { this.av.mode = kind === 'angry' ? 'angry' : 'cheer'; this.av.until = performance.now() + 1800; }
    setVisitor(p) { this.visitor = p; }

    think(t) {
      const a = this.av, S = SANCT[this.i], L = AVATARS[this.i];
      if (a.mode === 'walk') {
        const d = a.tx - a.x;
        if (Math.abs(d) < 1) {
          if (a.toSeat) { a.mode = 'sit'; a.flip = false; a.until = t + 5000 + Math.random() * 7000; }
          else { a.mode = 'idle'; a.until = t + 1500 + Math.random() * 2500; }
          a.toSeat = false;
        } else { a.x += Math.sign(d) * Math.min(Math.abs(d), L.bear ? 0.25 : L.horse ? 0.6 : 0.4); a.flip = d < 0; }
        return;
      }
      if (t < a.until) return;
      a.mode = 'walk';
      if (S.seat && Math.random() < 0.4) { a.tx = S.seat.x - 6; a.toSeat = true; }
      else a.tx = S.walk[0] + Math.random() * (S.walk[1] - S.walk[0] - 16);
    }

    render(t) {
      if (this.i < 0) return;
      const c = this.ctx, i = this.i, S = SANCT[i], L = AVATARS[i];
      if (!this.bgs[i]) this.bgs[i] = buildBackground(i);
      c.drawImage(this.bgs[i], 0, 0);
      this.ambient(c, t);
      if (!this.awake) {
        c.fillStyle = 'rgba(4,2,12,.6)'; c.fillRect(0, 0, W, H);
        c.globalAlpha = 0.35 + 0.15 * Math.sin(t / 600);
        this.drawAvatar(c, t, true);
        c.globalAlpha = 1;
        return;
      }
      this.think(t);
      if (this.visitor) {
        const vf = Math.floor(t / 400);
        drawHuman(c, 150, GROUND + 2, personLook(this.visitor), 'kneel', vf, true, 1);
      }
      this.drawAvatar(c, t, false);
      this.drawParticles(c, t);
    }

    drawAvatar(c, t, sleeping) {
      const a = this.av, L = AVATARS[this.i], S = SANCT[this.i];
      const f = Math.floor(t / (a.mode === 'walk' ? 160 : 500));
      let y = a.y;
      if (S.float) y -= 6 + Math.round(Math.sin(t / 500) * 2);
      // 발밑 빛
      c.globalAlpha = (sleeping ? 0.2 : 0.35) + 0.1 * Math.sin(t / 300);
      c.fillStyle = L.glow; c.fillRect(Math.round(a.x - 2), a.y - 1, 28, 2); c.fillRect(Math.round(a.x + 2), a.y - 2, 20, 1);
      c.globalAlpha = sleeping ? c.globalAlpha : 1;
      const sitHere = a.mode === 'sit' && S.seat;
      if (L.horse) {
        const flying = S.fly && (a.mode === 'walk' || Math.sin(t / 900) > 0.4);
        drawHorse(c, a.x, y - (flying ? 10 + Math.round(Math.sin(t / 200) * 2) : 0), f, a.flip, 2, flying);
      } else if (L.bear) {
        drawBear(c, a.x, y, f, a.flip, 2, a.mode !== 'walk');
      } else {
        const pose = sleeping ? 'idle' : a.mode === 'walk' ? 'walk' : a.mode === 'cheer' ? 'cast' : a.mode === 'angry' ? 'attack' : sitHere ? S.seat.pose : 'idle';
        const yy = sitHere ? S.seat.y + 2 : y;
        drawHuman(c, a.x, yy, L, pose, f, a.flip, 2);
        if (sitHere && L.gear === 'harp') { c.fillStyle = '#e8b84a'; c.fillRect(a.x + 20, yy - 28, 2, 26); c.fillRect(a.x + 20, yy - 28, 8, 2); c.fillStyle = '#fff6c8'; for (let k = 0; k < 3; k++) c.fillRect(a.x + 22 + k * 2, yy - 26, 1, 22); }
      }
      // 반짝이
      if (!sleeping && Math.random() < 0.25) this.parts.push({ x: a.x + Math.random() * 24, y: y - Math.random() * 36, vy: -0.15, life: 40, col: L.glow });
    }

    ambient(c, t) {
      const i = this.i;
      const r = Math.random;
      if (i === 0) { // 모닥불
        const fx = 108, fy = 92;
        for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#ffb43a' : '#ff6a2a'; const h = 3 + Math.floor(Math.abs(Math.sin(t / 90 + k)) * 5); c.fillRect(fx + k, fy - h, 1, h); }
        c.fillStyle = 'rgba(255,140,60,.12)'; c.fillRect(fx - 14, fy - 14, 34, 16);
      } else if (i === 1) { // 떠오르는 음표
        if (r() < 0.05) this.parts.push({ x: 100 + r() * 20, y: 80, vy: -0.25, life: 120, col: '#fff6c8', note: true });
      } else if (i === 2) { // 촛불 일렁임
        for (const x of [70, 120]) { c.fillStyle = '#f0e0c0'; c.fillRect(x, 64, 2, 6); c.fillStyle = Math.sin(t / 80 + x) > 0 ? '#ffd27a' : '#ff9a3a'; c.fillRect(x, 61, 2, 3); }
      } else if (i === 3) { // 흐르는 구름
        c.fillStyle = 'rgba(255,255,255,.5)';
        for (let k = 0; k < 4; k++) { const x = ((t / (60 + k * 20)) + k * 60) % (W + 40) - 40; c.fillRect(Math.floor(x), 20 + k * 12, 30, 3); c.fillRect(Math.floor(x) + 6, 17 + k * 12, 16, 3); }
      } else if (i === 4) { // 눈
        if (r() < 0.4) this.parts.push({ x: r() * W, y: 0, vy: 0.3, vx: -0.05, life: 300, col: '#ffffff' });
      } else if (i === 5) { // 횃불
        for (const x of [20, 170]) { c.fillStyle = Math.sin(t / 70 + x) > 0 ? '#ffb43a' : '#ff5a2a'; c.fillRect(x - 1, 66, 4, 4); c.fillStyle = '#ffe08a'; c.fillRect(x, 67, 2, 2); }
      } else if (i === 6) { // 오로라
        for (let x = 0; x < W; x += 2) { const y = 22 + Math.sin(x / 18 + t / 1400) * 6; c.globalAlpha = 0.18 + 0.1 * Math.sin(x / 9 + t / 700); c.fillStyle = x % 4 ? '#5af0b0' : '#7ac8ff'; c.fillRect(x, Math.floor(y), 2, 10); }
        c.globalAlpha = 1;
        c.fillStyle = Math.sin(t / 300) > 0 ? '#ffffff' : '#bfe0ff'; c.fillRect(150, 10, 3, 3);
      } else if (i === 7) { // 반짝이는 별가루
        if (r() < 0.2) this.parts.push({ x: r() * W, y: r() * 80, vy: 0, life: 40, col: r() < 0.5 ? '#ffffff' : '#d8b8ff', twinkle: true });
      }
    }

    drawParticles(c) {
      this.parts = this.parts.filter(p => p.life-- > 0);
      for (const p of this.parts) {
        p.y += p.vy; p.x += p.vx || 0;
        c.globalAlpha = Math.min(1, p.life / 30);
        c.fillStyle = p.col;
        if (p.note) { c.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2); c.fillRect(Math.floor(p.x) + 1, Math.floor(p.y) - 4, 1, 4); }
        else c.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
      }
      c.globalAlpha = 1;
    }
  }

  /* ───────────── 사도 모험 장면 ───────────── */

  const AW = 192, AH = 72, AG = 64;
  function buildRegion(ri) {
    const R = SD.regions[ri], cv = document.createElement('canvas');
    cv.width = AW * 2; cv.height = AH;
    const c = cv.getContext('2d'), r = rng(ri * 31 + 5);
    const g = c.createLinearGradient(0, 0, 0, AH); g.addColorStop(0, R.sky[0]); g.addColorStop(1, R.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, AW * 2, AH);
    for (let k = 0; k < 60; k++) { c.globalAlpha = 0.3 + r() * 0.6; c.fillStyle = '#fff'; c.fillRect(Math.floor(r() * AW * 2), Math.floor(r() * 30), 1, 1); }
    c.globalAlpha = 1;
    const far = shade(R.ground, 0.45);
    for (let x = 0; x < AW * 2; x++) {
      let hgt;
      if (R.id === 'forest') hgt = 14 + Math.floor(6 * Math.abs(Math.sin(x / 9)) + 4 * Math.sin(x / 31));
      else if (R.id === 'desert') hgt = 8 + Math.floor(8 * Math.abs(Math.sin(x / 40)));
      else if (R.id === 'ice') hgt = 10 + Math.floor(14 * Math.abs(Math.sin(x / 13) * Math.cos(x / 37)));
      else if (R.id === 'ruins') hgt = (Math.floor(x / 18) % 3 === 0) ? 22 + (x % 18 < 3 ? 4 : 0) : 6;
      else hgt = 6 + Math.floor(12 * Math.abs(Math.sin(x / 7) * Math.sin(x / 23)));
      c.fillStyle = far; c.fillRect(x, AG - hgt, 1, hgt);
    }
    if (R.id === 'abyss') for (let k = 0; k < 10; k++) { const x = Math.floor(r() * AW * 2); c.fillStyle = '#b06cff'; c.fillRect(x, AG - 10 - Math.floor(r() * 10), 2, 6); }
    c.fillStyle = R.ground; c.fillRect(0, AG, AW * 2, AH - AG);
    c.fillStyle = shade(R.ground, 1.25); for (let x = 0; x < AW * 2; x += 4) c.fillRect(x, AG, 2, 1);
    c.fillStyle = shade(R.ground, 0.75); for (let k = 0; k < 40; k++) c.fillRect(Math.floor(r() * AW * 2), AG + 2 + Math.floor(r() * 6), 2, 1);
    return cv;
  }

  class Adventure {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      canvas.width = AW; canvas.height = AH;
      this.ctx.imageSmoothingEnabled = false;
      this.bgs = {}; this.scroll = 0; this.p = null; this.seq = null; this.lastAct = 0; this.region = 0; this.nums = []; this.parts = [];
    }
    setApostle(p, glow) {
      if (!p) { this.p = null; return; }
      if (!this.p || this.p.id !== p.id) { this.seq = null; this.lastAct = p.act ? p.act.t : 0; this.region = (p.act && p.act.region) || 0; this.dead = false; }
      this.p = p; this.glow = glow || '#ffd27a';
    }
    setGrave(h) { this.grave = h; }
    play(act, t) {
      if (act.region !== undefined) this.region = act.region;
      const dur = { win: 2600, lose: 2600, rest: 3200, level: 1800, sponsor: 1800, saved: 1600, chosen: 2000, death: 99999999, fall: 2400, betray: 2200 }[act.kind];
      if (!dur) return;
      this.seq = { kind: act.kind, start: t, dur, monster: act.monster || 'slime', dmg: act.dmg || 0 };
      if (act.kind === 'death') this.dead = true;
    }
    render(t) {
      const c = this.ctx;
      const p = this.p;
      if (p && p.act && p.act.t !== this.lastAct) { this.lastAct = p.act.t; this.play(p.act, t); }
      if (!this.bgs[this.region]) this.bgs[this.region] = buildRegion(this.region);
      const walking = p && !this.dead && (!this.seq || this.seq.kind === 'level' || this.seq.kind === 'sponsor');
      if (walking) this.scroll = (this.scroll + 0.5) % AW;
      c.drawImage(this.bgs[this.region], -Math.floor(this.scroll), 0);
      if (!p) { this.drawEmpty(c, t); return; }
      const L = personLook(p), f = Math.floor(t / 150);
      let pose = walking ? 'walk' : 'idle', ax = 48, flip = false, hurt = false;
      const sq = this.seq, e = sq ? (t - sq.start) / sq.dur : 0;
      if (sq && e >= 1 && sq.kind !== 'death') this.seq = null;
      if (L.aura) { c.globalAlpha = 0.3 + 0.2 * Math.sin(t / 150); c.fillStyle = L.aura; c.fillRect(ax - 4, AG - 40, 32, 40); c.globalAlpha = 1; }
      if (sq) {
        const k = sq.kind;
        if (k === 'win' || k === 'lose') {
          const mx = e < 0.25 ? 200 - (e / 0.25) * 104 : 96;
          const fighting = e >= 0.25 && e < 0.85;
          const turn = Math.floor((t - sq.start) / 300) % 2;
          if (fighting) { pose = turn ? 'attack' : 'idle'; if (k === 'lose' && !turn) { hurt = true; ax -= 2; } }
          const mDead = k === 'win' && e >= 0.85;
          if (!mDead || Math.floor(t / 80) % 2) drawMonster(c, sq.monster, mx, AG, f, true, 2, fighting && turn && k === 'win');
          if (fighting && turn && Math.random() < 0.3) this.nums.push({ x: k === 'win' ? mx + 6 : ax + 8, y: AG - 34, v: Math.ceil(5 + Math.random() * 40), col: k === 'win' ? '#ffe08a' : '#ff5a6a', life: 30 });
          if (mDead && Math.random() < 0.5) this.parts.push({ x: mx + 10 + Math.random() * 10, y: AG - 10 - Math.random() * 14, vy: -0.4, life: 25, col: '#fff' });
          if (k === 'lose' && e >= 0.85) pose = 'sit';
        } else if (k === 'rest') {
          pose = 'sit';
          for (let n = 0; n < 5; n++) { c.fillStyle = n % 2 ? '#ffb43a' : '#ff6a2a'; const hh = 2 + Math.floor(Math.abs(Math.sin(t / 90 + n)) * 4); c.fillRect(78 + n, AG - hh, 1, hh); }
          c.fillStyle = '#5a3a20'; c.fillRect(76, AG - 1, 9, 2);
          if (Math.floor(t / 600) % 2) { c.fillStyle = '#cfe0ff'; c.fillRect(ax + 18, AG - 40, 2, 1); c.fillRect(ax + 21, AG - 44, 3, 1); }
        } else if (k === 'level' || k === 'chosen' || k === 'sponsor' || k === 'saved') {
          const col = k === 'level' ? '#ffe08a' : k === 'saved' ? '#9cf0ff' : this.glow;
          c.globalAlpha = 0.35 + 0.25 * Math.sin(t / 80);
          c.fillStyle = col; c.fillRect(ax + 4, 0, 16, AG); c.fillRect(ax + 8, 0, 8, AG);
          c.globalAlpha = 1;
          if (Math.random() < 0.6) this.parts.push({ x: ax + 4 + Math.random() * 16, y: Math.random() * AG, vy: k === 'sponsor' ? 0.6 : -0.6, life: 20, col });
          pose = k === 'chosen' ? 'kneel' : 'cast';
        } else if (k === 'death') {
          pose = 'dead';
          if (e * sq.dur > 900) { c.fillStyle = '#8a8aa0'; c.fillRect(ax + 30, AG - 14, 8, 14); c.fillRect(ax + 28, AG - 10, 12, 2); c.fillStyle = '#5a5a70'; c.fillRect(ax + 33, AG - 12, 2, 8); }
        } else if (k === 'fall') {
          if (Math.floor(t / 90) % 5 === 0) { c.fillStyle = '#d0a0ff'; for (let y = 0; y < AG - 20; y += 4) c.fillRect(ax + 10 + (y % 8 ? 2 : -2), y, 2, 4); }
          pose = e > 0.5 ? 'walk' : 'cast'; if (e > 0.5) { flip = true; ax -= (e - 0.5) * 120; }
        } else if (k === 'betray') { pose = 'walk'; flip = true; ax -= e * 90; }
      }
      drawHuman(c, ax, AG, hurt ? Object.assign({}, L, { cloth: '#ffffff', skin: '#ffffff' }) : L, pose, f, flip, 2);
      this.drawFx(c);
    }
    drawEmpty(c, t) {
      if (this.grave) {
        c.fillStyle = '#8a8aa0'; c.fillRect(88, AG - 18, 12, 18); c.fillRect(85, AG - 13, 18, 3); c.fillStyle = '#5a5a70'; c.fillRect(92, AG - 15, 4, 10);
        c.globalAlpha = 0.3 + 0.2 * Math.sin(t / 400); c.fillStyle = '#cfe0ff'; c.fillRect(92, AG - 30 - Math.sin(t / 300) * 3, 4, 6); c.globalAlpha = 1;
      }
    }
    drawFx(c) {
      this.nums = this.nums.filter(n => n.life-- > 0);
      for (const n of this.nums) { n.y -= 0.4; drawNumber(c, n.v, Math.floor(n.x), Math.floor(n.y), n.col, 1); }
      this.parts = this.parts.filter(p => p.life-- > 0);
      for (const p of this.parts) { p.y += p.vy; c.globalAlpha = Math.min(1, p.life / 15); c.fillStyle = p.col; c.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1); }
      c.globalAlpha = 1;
    }
  }

  /* ───────────── 초상 (성좌 선택 버튼용) ───────────── */

  function portrait(canvas, i, awake) {
    canvas.width = 24; canvas.height = 24;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    const S = SANCT[i], L = AVATARS[i];
    const g = c.createLinearGradient(0, 0, 0, 24); g.addColorStop(0, S.sky[0]); g.addColorStop(1, S.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, 24, 24);
    if (L.horse) drawHorse(c, 4, 22, 0, false, 1, false);
    else if (L.bear) drawBear(c, 4, 22, 0, false, 1, true);
    else drawHuman(c, 6, 24, L, 'idle', 0, false, 1);
    if (!awake) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, 24, 24); }
  }

  function personPortrait(canvas, p) {
    canvas.width = 16; canvas.height = 20;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 16, 20);
    drawHuman(c, 2, 20, personLook(p), 'idle', 0, false, 1);
  }

  CD.pixel = { Sanctuary, Adventure, portrait, personPortrait, personLook, drawHuman, drawMonster, SANCT, AVATARS, GLOW: AVATARS.map(a => a.glow) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
