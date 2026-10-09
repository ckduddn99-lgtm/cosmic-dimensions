/* 초공간 차원 붕괴 — 도트(픽셀아트) 렌더러
 * 성소는 아이소메트릭 맵 위에 도트 인물과 효과를 그린다. 모험 장면은 저해상도 캔버스를 확대한다.
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
      ctx.fillRect(Math.round(ox + xx * unit), Math.round(oy + y * unit), Math.max(1, Math.round(ww * unit)), Math.max(1, Math.round(hh * unit)));
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
      skin: SKINS[Math.floor(r() * SKINS.length)], trim: ['#d3bc7a','#a7cddd','#d4a3c9','#acb998'][Math.floor(r()*4)], hair, cloth, cloth2: shade(cloth, 0.7), pants: shade(cloth, 0.5), boots: '#2a1d16',
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

  /* 사도 24×36 원화. 기존 발 위치·크기는 유지하고 도트 밀도를 두 배로 높인다. */
  function drawHuman(ctx, x, y, L, pose = 'idle', f = 0, flip = false, unit = 1) {
    if (pose === 'dead') return drawLying(ctx, x, y, L, flip, unit);
    const px = brush(ctx, x, y - 18 * unit, unit / 2, flip, 24);
    const ink = '#151724', skin = L.skin, hair = L.hair, cloth = L.cloth;
    const hi = shade(cloth, 1.35), lo = L.cloth2 || shade(cloth, .65), trim = L.trim || '#c8b88a';
    const sit = pose === 'sit' || pose === 'kneel', bob = pose === 'idle' ? f % 2 : 0, dy = sit ? 4 : bob;
    const step = pose === 'walk' ? [0, 2, 0, -2][f % 4] : 0;
    if (L.cape || L.hood || L.robe) {
      const cape = L.cape || shade(cloth, .5);
      px(4, 16 + dy, 15, sit ? 13 : 18, ink);px(5, 17 + dy, 13, sit ? 11 : 16, cape);
      px(5, 18 + dy, 2, 12, shade(cape, 1.25));px(17, 21 + dy, 2, 10, shade(cape, .75));
    }
    if (sit) {
      px(8, 29, 12, 4, L.pants);px(7, 32, 5, 3, L.boots);px(18, 32, 4, 3, L.boots);
    } else {
      for (const [xx, shift] of [[8, step], [14, -step]]) {
        px(xx + shift / 2, 26, 5, 9, ink);px(xx + shift / 2 + 1, 27, 3, 6, L.pants);
        px(xx + shift / 2, 33, 5, 3, L.boots);px(xx + shift / 2 + 1, 34, 3, 1, shade(L.boots, 1.6));
      }
    }
    px(6, 15 + dy, 14, 12, ink);px(7, 16 + dy, 12, 10, cloth);px(7, 17 + dy, 2, 8, hi);px(17, 18 + dy, 2, 8, lo);
    px(10, 15 + dy, 6, 3, '#e9dcc0');px(11, 16 + dy, 4, 1, '#9f958e');px(12, 18 + dy, 2, 8, trim);
    px(7, 24 + dy, 12, 2, lo);px(12, 24 + dy, 3, 2, trim);px(13, 24 + dy, 1, 1, '#f9e7b1');
    if (L.robe) {px(7, 26 + dy, 12, sit ? 3 : 7, cloth);for (const xx of [8, 12, 16]) px(xx, 27 + dy, 1, sit ? 2 : 5, hi);px(7, 32, 12, 1, trim);}
    if (L.helmet) {px(6, 16 + dy, 4, 5, '#9da6bd');px(16, 16 + dy, 4, 5, '#7a819c');px(8, 19 + dy, 10, 5, '#8590a8');px(9, 19 + dy, 1, 4, '#c4cede');}
    const armY = pose === 'cast' ? 10 + dy : 17 + dy;
    px(4, armY + Math.max(0, step), 3, 8, lo);px(5, armY + Math.max(0, step), 1, 6, hi);px(4, armY + 7 + Math.max(0, step), 3, 3, skin);
    if (pose === 'attack' && f % 2) {px(19, 18 + dy, 5, 3, lo);px(23, 18 + dy, 2, 3, skin);}
    else {px(19, armY - Math.min(0, step), 3, 8, lo);px(19, armY + 7 - Math.min(0, step), 3, 3, skin);}
    // 머리 외곽을 계단형으로 깎고, 눈빛·볼·앞머리에 한 도트씩 색을 나눈다.
    px(8, 3 + dy, 10, 12, ink);px(7, 5 + dy, 12, 8, ink);px(8, 3 + dy, 10, 5, hair);
    px(8, 7 + dy, 10, 6, skin);px(9, 13 + dy, 8, 2, skin);px(10, 15 + dy, 6, 1, shade(skin, .8));
    px(8, 9 + dy, 1, 4, shade(skin, .82));px(17, 9 + dy, 1, 4, shade(skin, .75));
    px(10, 9 + dy, 2, 2, L.eye || ink);px(15, 9 + dy, 2, 2, L.eye || ink);px(10, 9 + dy, 1, 1, '#f6f3ef');px(15, 9 + dy, 1, 1, '#f6f3ef');
    px(13, 11 + dy, 1, 2, shade(skin, .8));px(12, 14 + dy, 3, 1, '#a16d72');px(9, 12 + dy, 1, 1, '#c68c85');
    px(8, 4 + dy, 10, 3, hair);px(8, 6 + dy, 3, 3, hair);px(16, 6 + dy, 2, 2, hair);
    px(10, 4 + dy, 3, 1, shade(hair, 1.6));px(14, 5 + dy, 2, 1, shade(hair, 1.3));
    if (L.longHair) {px(7, 8 + dy, 2, 10, hair);px(17, 8 + dy, 2, 10, hair);px(7, 9 + dy, 1, 7, shade(hair, 1.4));}
    if (L.hood) {px(7, 3 + dy, 12, 3, lo);px(6, 6 + dy, 2, 8, lo);px(18, 6 + dy, 2, 8, lo);px(8, 3 + dy, 8, 1, hi);px(7, 5 + dy, 1, 5, trim);}
    if (L.helmet) {px(7, 3 + dy, 12, 4, '#78829a');px(9, 2 + dy, 8, 1, '#acb6c9');px(12, 3 + dy, 2, 6, '#d0d7df');px(7, 7 + dy, 2, 6, '#78829a');px(17, 7 + dy, 2, 6, '#78829a');}
    if (L.feathers) for (let k=0;k<3;k++) {px(2+k, 14+dy+k, 2, 8-k, '#f5f6ff');px(20-k, 14+dy+k, 2, 8-k, '#c6d8f0');}
    if (L.chains) for (let k=0;k<3;k++) px(3+k%2, 20+dy+k*3, 2, 1, '#b8b6d1');
    // 기존 장비 종류와 공격 모션을 고해상도 붓에 연결한다.
    drawGear((gx,gy,gw,gh,color)=>px(gx*2,gy*2+dy,gw*2,gh*2,color),L,pose,f);
    if (L.gear==='book') {px(20, 21+dy, 5, 5, '#d8c8a1');px(22, 21+dy, 1, 5, '#85657e');}
    if (L.gear==='lute') {px(18, 23+dy, 4, 1, '#efce90');px(20, 20+dy, 1, 6, '#d5b985');}
    if (L.gear==='shield') {px(20, 18+dy, 2, 10, trim);px(18, 21+dy, 6, 1, trim);}
    if (L.gear==='orb') {px(23, 18+dy, 1, 2, '#f8dcff');px(22, 19+dy, 3, 1, '#f8dcff');}
    if (pose==='cast') {px(12, 0, 1, 3, '#ffe4ae');px(11, 1, 3, 1, '#ffe4ae');}
    if (L.aura) {px(3, 16+dy, 1, 2, L.aura);px(22, 13+dy, 1, 2, L.aura);}
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

  /* 성좌 전용 32×48 도트: 사도보다 세밀한 의상·장비·실루엣 */
  function drawConstellation(c, i, x, y, pose = 'idle', f = 0, flip = false, unit = 1) {
    const L = AVATARS[i], px = brush(c, x, y - 48 * unit, unit, flip, 32);
    const dark = '#131426', gold = '#e6b96b', light = '#fff0c8';
    const moving = pose === 'walk', step = moving ? (f % 4 < 2 ? 1 : -1) : 0;
    if (i === 3) {
      // 천마: 겹겹의 깃털, 은빛 갈기, 황금 굴레와 네 다리
      px(7,28,18,9,'#94aac9');px(8,27,16,7,'#e0ebf3');px(20,18,7,13,'#c1d5e8');px(23,15,7,9,'#edf5fa');px(28,19,4,4,'#bbd1e3');px(26,14,2,4,gold);px(28,18,1,1,dark);
      for (let k=0;k<6;k++){px(6+k*2,13+k*2,3,15-k,'#627da9');px(5+k*2,11+k*2,2,15-k,'#e6eff9');px(5+k*2,11+k*2,1,8,'#fff8e4');}
      for (let k=0;k<4;k++){px(23-k,15+k*3,2,6,'#6ca7d1');px(22-k,15+k*3,1,4,'#c2f2ff');}
      px(3,29,4,10,'#7ab2d7');px(2,31,2,9,'#daeaff');
      for (const [k,xx] of [9,13,21,25].entries()){px(xx,35,2,9+(k%2?step:-step),'#acbfd8');px(xx,44+(k%2?step:-step),3,3,gold);}
      for(let k=0;k<5;k++){px(8+k*2,17+k*2,1,4,'#c1d8ed');px(10+k*2,19+k*2,1,3,'#a3bed8');}px(24,17,1,1,'#f8fbff');px(12,32,10,1,'#f3f6ef');
      px(21,24,7,1,gold);px(22,27,5,1,gold);px(14,30,6,2,'#658dbc');px(16,29,1,5,gold);return;
    }
    if (i === 6) {
      // 큰곰: 층진 털, 별빛 문양과 북극성 왕관
      px(5,20,23,22,'#4b352b');px(7,19,19,19,'#80563a');px(9,11,17,14,'#aa7b4d');px(8,10,5,6,'#50372e');px(23,10,5,6,'#50372e');px(10,11,2,3,'#c09161');px(24,11,2,3,'#c09161');
      px(12,14,13,8,'#be9867');px(20,18,7,6,'#dfbe83');px(25,19,3,2,dark);px(21,16,2,2,dark);px(21,16,1,1,light);px(11,28,12,10,'#ba8e5e');
      for(let k=0;k<8;k++){px(7+(k*7%18),22+(k*5%16),2,2,k%2?'#956b48':'#62442e');}
      px(5,40,8,7+step,'#50382d');px(22,40,8,7-step,'#50382d');px(6,46+step,6,1,'#dec397');px(23,46-step,6,1,'#dec397');
      for(let k=0;k<12;k++){const xx=6+(k*7%20),yy=22+(k*5%18);px(xx,yy,1,2,k%2?'#c29664':'#563d2c');}px(21,16,1,1,'#f7e1bd');px(22,21,4,1,'#835634');
      px(11,9,14,2,gold);px(14,7,2,3,gold);px(20,6,2,4,gold);px(17,4,2,5,light);px(15,6,6,1,light);px(15,28,6,1,light);px(17,26,2,5,light);return;
    }
    const cloth=L.cloth, mid=shade(cloth,1.35), dk=shade(cloth,.55), skin=L.skin;
    // 상체와 옷의 어두운 외곽선, 바람에 흔들리는 망토
    const cape=i===0?'#203b34':i===2?'#551d36':i===4?'#667fa8':dk;
    px(8,22,17,21,dark);px(6,24,3,19,cape);px(24,24,3,19,cape);px(5+step,38,4,7,cape);
    px(10,39,5,8+step,L.boots);px(19,39,5,8-step,L.boots);px(10,46+step,6,2,gold);px(19,46-step,6,2,gold);
    for(let yy=23;yy<42;yy++){const half=yy>31?9:7;px(17-half,yy,half*2,1,cloth);px(17-half,yy,2,1,dk);px(20,yy,2,1,mid);}
    px(14,23,6,2,light);px(16,26,2,13,gold);px(9,31,16,2,gold);px(15,31,4,2,light);
    for(let k=0;k<4;k++){px(10+k*4,37,1,4,mid);px(10+k*4,42,2,1,gold);}
    // 턱선·앞머리·홍채를 분리한 작은 얼굴. 금속이나 피부가 평평하게 보이지 않게 음영을 나눈다.
    px(12,6,10,2,dark);px(10,8,14,11,dark);px(11,19,12,2,dark);px(13,21,8,2,dark);
    px(12,7,10,3,L.hair);px(11,9,12,9,L.hair);
    px(12,11,10,7,skin);px(13,18,8,2,skin);px(14,20,6,1,shade(skin,.83));
    px(12,13,1,5,shade(skin,.8));px(21,13,1,5,shade(skin,.75));px(14,12,5,1,shade(skin,1.08));
    px(13,13,3,1,shade(L.hair,.8));px(19,13,3,1,shade(L.hair,.8));
    px(13,14,3,2,'#eee8e2');px(19,14,3,2,'#eee8e2');px(14,14,2,2,L.eye);px(20,14,2,2,L.eye);px(14,14,1,1,'#ffffff');px(20,14,1,1,'#ffffff');
    px(17,16,1,2,shade(skin,.79));px(14,17,1,1,'#d39d97');px(20,17,1,1,'#d39d97');px(16,19,3,1,'#986474');
    px(11,8,12,3,L.hair);px(11,10,3,3,L.hair);px(20,10,3,2,L.hair);px(13,8,4,1,shade(L.hair,1.5));px(18,9,2,1,shade(L.hair,1.25));
    if(L.longHair){for(const xx of [9,23]){px(xx,11,2,15,L.hair);px(xx+1,14,1,8,shade(L.hair,1.4));px(xx+1,25,2,3,shade(L.hair,.8));}}
    px(7,25,3,9+step,mid);px(25,25,3,9-step,dk);px(7,33+step,3,3,skin);px(25,33-step,3,3,skin);
    if(i===0){ // 꼬챙이 활, 화살통, 잎사귀 후드
      px(9,6,16,4,'#31523c');px(9,10,3,8,'#31523c');px(22,10,3,8,'#31523c');px(12,5,9,1,'#729269');px(24,19,3,12,'#765636');for(let k=0;k<3;k++){px(24+k,14-k,1,8,'#c9ad77');px(24+k,13-k,1,2,'#e9e3c9');}
      for(let yy=18;yy<43;yy++){const xx=3+Math.round(Math.sin((yy-18)/25*Math.PI)*4);px(xx,yy,2,1,gold);}px(4,20,1,21,'#e7dec1');px(1,30,12,1,'#bfcbd9');
    }else if(i===1){ // 금장 하프와 별빛 머리장식
      px(10,8,13,1,gold);px(19,6,2,4,light);px(17,7,6,1,light);px(23,25,2,20,gold);px(30,23,2,22,gold);px(23,23,8,2,light);px(23,44,9,2,gold);for(let xx=26;xx<30;xx++)px(xx,26,1,16,'#faf0ca');px(9,28,2,2,light);
    }else if(i===2){ // 루비 왕관, 보석 홀, 비단 망토
      px(10,6,14,3,gold);for(const xx of [11,16,21]){px(xx,2,2,5,gold);px(xx,2,1,2,'#ef6983');}px(16,7,2,2,'#fff0c8');px(28,20,2,27,gold);px(26,19,6,5,'#c93c64');px(28,18,2,2,light);px(25,39,2,4,gold);
    }else if(i===4){ // 백조의 깃털 어깨와 빙결 지팡이
      for(let k=0;k<4;k++){px(5+k,20+k,2,7-k,'#e7f7ff');px(26-k,20+k,2,7-k,'#d1e4ff');}px(29,21,1,26,'#a6c7e0');px(27,18,5,4,'#8edbed');px(29,16,1,6,'#f1ffff');px(10,8,13,1,'#c8ecff');
    }else if(i===5){ // 붉은 판금, 검, 분절된 전갈 꼬리
      px(11,7,13,5,'#79505b');px(16,12,2,4,gold);px(9,25,5,7,'#93616b');px(21,25,5,7,'#93616b');px(13,26,8,5,'#bd7c78');px(2,21,2,20,'#d4dbe2');px(1,37,5,2,gold);px(2,40,2,5,'#67432e');for(let k=0;k<5;k++){px(27+k%3,38-k*4,3,3,'#a35447');px(28+k%3,38-k*4,1,1,gold);}px(29,17,2,3,'#ffb566');
    }else if(i===7){ // 수정 왕녀, 끊어진 사슬과 심연의 보주
      px(11,7,12,1,'#d2d0eb');px(16,4,2,5,'#b78de7');px(15,5,4,1,light);for(let k=0;k<4;k++){px(5+k%2,29+k*4,3,2,'#a5a4ce');px(6+k%2,29+k*4,1,1,dark);}px(26,27,6,6,'#8c62c6');px(27,26,4,1,'#d7acff');px(28,28,2,2,'#f0d7ff');px(27,33,4,1,'#4d377b');
    }
    // 성좌마다 다른 소재와 자수: 같은 인물 틀에 색만 바꾸지 않는다.
    if(i===0){
      for(let k=0;k<9;k++){px(10+k,24+k,2,1,'#917353');px(10+k,24+k,1,1,'#c3a173');}
      px(10,29,4,5,'#304838');px(11,30,2,1,'#adc08d');px(17,35,5,3,'#563d2b');px(17,35,5,1,'#9e8252');
    }else if(i===1){
      for(let k=0;k<4;k++){px(10+k*3,36+k%2,1,3,'#90b8e7');px(10+k*3,40,2,1,gold);}
      px(12,25,1,4,light);px(11,28,3,1,light);px(19,32,1,4,gold);px(18,35,3,1,gold);px(30,23,1,2,'#b7e4f5');px(23,41,2,2,'#8ebbd0');
    }else if(i===2){
      for(let k=0;k<5;k++){px(9+k*3,23+k%2,2,2,'#d0baa4');px(11+k*2,37,1,4,gold);}
      px(16,25,3,3,'#a93759');px(17,25,1,1,'#f5b2bc');px(26,20,6,1,'#e197a3');px(27,22,2,1,'#743052');
    }else if(i===4){
      for(let yy=26;yy<40;yy+=4)for(let xx=10;xx<24;xx+=4){px(xx+(yy%8?1:0),yy,2,1,'#b8d7ed');px(xx+1,yy+1,1,2,'#f1fbff');}
      px(28,18,3,1,'#d2ffff');px(29,19,1,2,'#4876ae');
    }else if(i===5){
      for(let yy=27;yy<37;yy+=3){px(11,yy,11,1,'#4c2639');px(12,yy+1,9,1,'#ba7b79');}
      px(15,26,4,3,'#cf9867');px(16,26,1,1,'#ffde9d');px(2,22,1,13,'#f2f3f4');px(3,25,1,10,'#8193b4');
    }else if(i===7){
      for(let k=0;k<5;k++){px(10+k*3,26+(k%2)*2,1,1,'#ded5ef');px(11+k*2,38+k%2,1,1,'#b4a2e0');}
      px(17,33,1,4,'#c6b4ed');px(16,34,3,1,'#c6b4ed');px(27,28,1,1,'#bd86f2');px(30,30,1,2,'#4c337d');
    }
    if(pose==='cast'){px(15,0,4,1,light);px(16,-2,1,5,light);}else if(pose==='attack')px(0,28,5,1,'#ffcf91');
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
    } else if (id === 'hydra') {
      // 성간 히드라: 세 개의 목이 번갈아 고개를 든다
      const px = brush(ctx, x, y - 16 * unit, unit, flip, 18), k = f % 2, eye = hurt ? '#fff' : '#ffe14a';
      px(3, 9, 11, 5, col); px(4, 14, 2, 2, dk); px(11, 14, 2, 2, dk); px(0, 11, 3, 2, dk); px(5, 12, 7, 1, shade(m.color, 1.25));
      px(5, 4 + k, 2, 6 - k, col); px(3, 2 + k, 4, 3, col); px(3, 3 + k, 1, 1, eye);
      px(9, 2 + (1 - k), 2, 8 - (1 - k), col); px(9, 0 + (1 - k), 5, 3, col); px(13, 1 + (1 - k), 1, 1, eye); px(13, 2 + (1 - k), 1, 1, '#c03a3a');
      px(13, 5 + k, 2, 5 - k, col); px(14, 3 + k, 4, 3, col); px(17, 4 + k, 1, 1, eye);
    } else if (id === 'dragon') {
      // 공허의 용: 날개를 퍼덕이며 보랏빛 눈을 번뜩인다
      const px = brush(ctx, x, y - 16 * unit, unit, flip, 20), up = f % 2, eye = hurt ? '#fff' : '#ff4ad8';
      if (up) { px(6, 0, 3, 2, dk); px(5, 2, 7, 3, dk); px(7, 5, 6, 2, dk); } else { px(4, 5, 9, 2, dk); px(3, 7, 4, 2, dk); }
      px(5, 7, 10, 5, col); px(0, 9, 5, 2, col); px(0, 8, 1, 1, dk); px(6, 11, 8, 1, shade(m.color, 1.3));
      px(14, 4, 2, 5, col); px(14, 2, 5, 3, col); px(18, 4, 2, 1, col); px(17, 3, 1, 1, eye); px(15, 1, 1, 1, '#e8e0ff'); px(17, 1, 1, 1, '#e8e0ff');
      px(7, 12, 2, 4, dk); px(12, 12, 2, 4, dk);
      if (!hurt && f % 4 === 0) { px(20, 4, 1, 1, '#c070ff'); }
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
    { name: '은빛 사냥꾼의 설원', accent: '#9bbfda', sky: ['#050a18', '#14304a'], floor: '#1f3a22', walk: [24, 150], seat: { x: 112, y: 92, pose: 'sit' } },
    { name: '별빛 음악당', accent: '#bf9ce0', sky: ['#0a0c24', '#1c2a5a'], floor: '#d8dcec', walk: [30, 160], seat: { x: 88, y: 92, pose: 'sit' } },
    { name: '오만의 왕좌', accent: '#d6b987', sky: ['#14060c', '#3a0e1c'], floor: '#4a1a24', walk: [30, 160], seat: { x: 88, y: 80, pose: 'sit' } },
    { name: '구름 위의 고원', accent: '#96cdd3', sky: ['#2a3a7a', '#f0b88a'], floor: '#ffffff', walk: [20, 150], fly: true },
    { name: '얼어붙은 호수', accent: '#a9cdda', sky: ['#060c1c', '#1c3a5e'], floor: '#bcd4ee', walk: [24, 160], seat: { x: 140, y: 92, pose: 'kneel' } },
    { name: '피의 투기장', accent: '#d69672', sky: ['#1a0608', '#7a2a1a'], floor: '#b07440', walk: [26, 160] },
    { name: '북극성의 고대 요람', accent: '#c5ac73', sky: ['#020814', '#0c2440'], floor: '#e4eef8', walk: [30, 150], seat: { x: 120, y: 94, pose: 'sit' } },
    { name: '심연의 사슬 성소', accent: '#aa92d5', sky: ['#05020e', '#2a0c46'], floor: '#3a2a5a', walk: [30, 160], float: true }
  ];
  const W = 192, H = 108, GROUND = 96;
  const MAP_IDS = ['orion', 'lyra', 'cassiopeia', 'pegasus', 'cygnus', 'scorpio', 'ursa', 'andromeda'];
  const MAP_H = 128;
  // 각 맵의 앞마당 바닥 좌표. 계단·제단·절벽을 피해 짧게 거닌다.
  const MAP_LAYOUT = [
    { from: [80, 64], to: [109, 69], visitor: [102, 74] },
    { from: [77, 64], to: [108, 69], visitor: [100, 75] },
    { from: [80, 61], to: [108, 56], visitor: [97, 65] },
    { from: [80, 64], to: [110, 70], visitor: [101, 75] },
    { from: [77, 64], to: [108, 70], visitor: [101, 75] },
    { from: [78, 63], to: [109, 69], visitor: [101, 74] },
    { from: [82, 61], to: [110, 66], visitor: [99, 72] },
    { from: [78, 65], to: [109, 71], visitor: [100, 76] }
  ];

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
      this.maps = {}; this.actorSprites = new Map();
    }
    set(i, awake) {
      if (this.i === i && this.awake === awake) return;
      this.i = i; this.awake = awake;
      const S = SANCT[i];
      this.av = { x: (S.walk[0] + S.walk[1]) / 2, tx: 0, mode: 'idle', until: 0, flip: false, f: 0, y: GROUND + 2 };
      this.parts = [];
      this.mapWalk = { x: 80, y: 68, target: 0.5, progress: 0.25, until: 0, last: null };
      // 선택한 맵만 읽고, 실패하면 기존 코드 배경을 계속 사용한다.
      if (!this.maps[i]) {
        const image = new Image();
        this.maps[i] = image;
        image.src = 'img/sanctuaries/' + MAP_IDS[i] + '.webp';
      }
    }
    get name() { return SANCT[this.i].name; }
    /** 말풍선 위치(캔버스 대비 %) */
    anchor() {
      if (this.mapActive) return { x: this.mapWalk.x / W * 100, y: (this.mapWalk.y - 13) / MAP_H * 100 };
      return { x: (this.av.x + 8) / W * 100, y: (this.av.y - (AVATARS[this.i].horse || AVATARS[this.i].bear ? 34 : 42)) / H * 100 };
    }
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
      const image = this.maps[this.i];
      this.mapActive = !!(image && image.complete && image.naturalWidth);
      const width = this.mapActive ? 768 : W, height = this.mapActive ? 512 : H;
      if (this.cv.width !== width || this.cv.height !== height) {
        this.cv.width = width; this.cv.height = height;
        this.ctx.imageSmoothingEnabled = false;
      }
      this.cv.style.aspectRatio = this.mapActive ? '3 / 2' : '192 / 108';
      if (this.mapActive) return this.renderMap(t, image);
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

    renderMap(t, image) {
      const c = this.ctx, a = this.mapWalk, L = AVATARS[this.i];
      c.drawImage(image, 0, 0, this.cv.width, this.cv.height);
      c.save();
      c.scale(4, 4);
      // 작은 대각선 길을 따라 이동해 절벽 밖으로 나가지 않는다.
      const dt = a.last === null ? 0 : Math.min(0.1, Math.max(0, (t - a.last) / 1000));
      a.last = t;
      const moving = this.awake && Math.abs(a.target - a.progress) > 0.01;
      if (moving) a.progress += Math.sign(a.target - a.progress) * Math.min(Math.abs(a.target - a.progress), dt * 0.12);
      else if (this.awake && t >= a.until) { a.target = Math.random(); a.until = t + 3500 + Math.random() * 4000; }
      const layout = MAP_LAYOUT[this.i];
      a.x = layout.from[0] + a.progress * (layout.to[0] - layout.from[0]);
      a.y = layout.from[1] + a.progress * (layout.to[1] - layout.from[1]);
      const flip = a.target < a.progress, frame = Math.floor(t / (moving ? 160 : 500));
      if (!this.awake) { c.fillStyle = 'rgba(4,2,12,.64)'; c.fillRect(0, 0, W, MAP_H); }
      c.globalAlpha = this.awake ? 0.3 : 0.12;
      c.fillStyle = '#071321';
      c.fillRect(Math.round(a.x - 4), Math.round(a.y), 9, 1);
      c.fillRect(Math.round(a.x - 2), Math.round(a.y + 1), 5, 1);
      c.globalAlpha = this.awake ? 1 : 0.4;
      const react = t < this.av.until && ['cheer', 'angry'].includes(this.av.mode);
      const pose = moving ? 'walk' : react ? (this.av.mode === 'angry' ? 'attack' : 'cast') : 'idle';
      const sprite = this.mapSprite(pose, frame, flip);
      // 48 도트의 인물 키를 원본 맵에서 42px로 맞춘다 (512px 높이의 약 8%).
      c.drawImage(sprite, a.x - 7, a.y - 13.125, 14, 14);
      c.globalAlpha = 1;
      if (this.awake && this.visitor) {
        const key = this.visitor.id + ':' + this.visitor.look + ':' + this.visitor.corrupt + ':' + this.visitor.status;
        if (this.visitorSpriteKey !== key) {
          const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
          drawHuman(sprite.getContext('2d'), 20, 60, personLook(this.visitor), 'kneel', 0, true, 2);
          this.visitorSprite = sprite; this.visitorSpriteKey = key;
        }
        const [x, y] = layout.visitor;
        c.globalAlpha = .24; c.fillStyle = '#071321'; c.fillRect(x - 3, y, 7, 1); c.globalAlpha = 1;
        c.drawImage(this.visitorSprite, x - 8, y - 15, 16, 16);
      }
      if (this.awake) {
        for (let k = 0; k < 6; k++) {
          const x = 38 + (k * 37 % 115), y = 24 + (k * 19 % 67) - (t / 140 + k * 3) % 12;
          c.globalAlpha = 0.06 + 0.18 * Math.max(0, Math.sin(t / 1400 + k));
          c.fillStyle = L.glow; c.fillRect(Math.floor(x), Math.floor(y), 1, 1);
        }
      }
      c.restore();
    }

    mapSprite(pose, frame, flip) {
      const key = this.i + ':' + pose + ':' + (frame % 4) + ':' + flip;
      if (!this.actorSprites.has(key)) {
        const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
        const ctx = sprite.getContext('2d');
        drawConstellation(ctx, this.i, 16, 60, pose, frame % 4, flip, 1);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(12,24,40,.12)'; ctx.fillRect(0, 0, 64, 64);
        this.actorSprites.set(key, sprite);
      }
      return this.actorSprites.get(key);
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
      const pose = sleeping ? 'idle' : a.mode === 'walk' ? 'walk' : a.mode === 'cheer' ? 'cast' : a.mode === 'angry' ? 'attack' : 'idle';
      drawConstellation(c, this.i, a.x, y, pose, f, a.flip, 1);
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
    setParty(list) { this.allies = (list || []).slice(0, 3); }
    play(act, t) {
      if (act.region !== undefined) this.region = act.region;
      const dur = { win: 2600, lose: 2600, rest: 3200, level: 1800, sponsor: 1800, saved: 1600, chosen: 2000, death: 99999999, fall: 2400, betray: 2200 }[act.kind];
      if (!dur) return;
      this.seq = { kind: act.kind, start: t, dur, monster: act.monster || 'slime', dmg: act.dmg || 0, foe: act.foe || null, party: !!act.party, elite: !!act.elite };
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
      const allies = this.allies || [];
      let pose = walking ? 'walk' : 'idle', ax = allies.length ? 40 + allies.length * 12 : 48, flip = false, hurt = false;
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
          if (!mDead || Math.floor(t / 80) % 2) {
            if (sq.foe) {
              // 타락한 자와의 결투: 보랏빛 오라를 두른 사람
              c.globalAlpha = 0.3 + 0.2 * Math.sin(t / 120); c.fillStyle = '#9b2bff'; c.fillRect(mx - 4, AG - 40, 32, 40); c.globalAlpha = 1;
              drawHuman(c, mx, AG, personLook(sq.foe), fighting && !turn ? 'attack' : 'idle', f, true, 2);
            } else {
              if (sq.elite) { c.globalAlpha = 0.25 + 0.15 * Math.sin(t / 100); c.fillStyle = '#ff5a3a'; c.fillRect(mx - 2, AG - (sq.party ? 52 : 36), sq.party ? 60 : 36, sq.party ? 52 : 36); c.globalAlpha = 1; }
              drawMonster(c, sq.monster, mx, AG, f, true, sq.party ? 3 : 2, fighting && turn && k === 'win');
            }
          }
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
      // 파티 동료는 뒤에서 같은 동작으로 따라온다
      allies.forEach((m, k) => {
        const ap = pose === 'attack' ? (Math.floor(t / 300) + k) % 2 ? 'attack' : 'idle' : pose === 'sit' || pose === 'walk' || pose === 'cast' ? pose : 'idle';
        drawHuman(c, ax - 16 * (k + 1), AG, personLook(m), ap, f + k, flip, 2);
      });
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
    canvas.width = 48; canvas.height = 56;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.fillStyle = SANCT[i].sky[0]; c.fillRect(0, 0, 48, 56);
    c.fillStyle = SANCT[i].sky[1]; c.fillRect(3, 3, 42, 50);
    drawConstellation(c, i, 8, 53, 'idle', 0, false, 1);
    if (!awake) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, 48, 56); }
  }

  function personPortrait(canvas, p) {
    canvas.width = 40; canvas.height = 40;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 40, 40);
    drawHuman(c, 8, 38, personLook(p), 'idle', 0, false, 2);
  }

  CD.pixel = { Sanctuary, Adventure, portrait, personPortrait, personLook, drawHuman, drawConstellation, drawMonster, SANCT, AVATARS, GLOW: AVATARS.map(a => a.glow) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
