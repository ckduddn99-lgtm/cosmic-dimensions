/* 초공간 차원 붕괴 — 화면 · 입력 · 연출 · 저장
 * DOM은 처음 한 번만 만들고 이후에는 텍스트/속성만 갱신한다 (터치 중 버튼이 교체되어 입력이 씹히지 않도록).
 */
(function () {
  'use strict';

  const { BigNum, data: D, core: C, galaxyArt: GA } = window.CD;
  const SAVE_KEY = 'cosmic-dimensions-autosave-v1';
  const BACKUP_KEY = SAVE_KEY + '-backup';
  const SETTINGS_KEY = 'cosmic-dimensions-settings-v1';
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function setText(el, t) { t = String(t); if (el._t !== t) { el._t = t; el.textContent = t; } }
  function setHTML(el, t) { if (el._h !== t) { el._h = t; el.innerHTML = t; } }
  function setDisabled(el, d) { d = !!d; if (el.disabled !== d) el.disabled = d; }
  function cls(el, c, on) { el.classList.toggle(c, !!on); }
  function width(el, pct) { const v = Math.max(0, Math.min(100, pct || 0)).toFixed(1) + '%'; if (el._w !== v) { el._w = v; el.style.width = v; } }
  const GEM_AM = '<i class="gem gem-am"></i>', GEM_IP = '<i class="gem gem-ip"></i>';

  /* ───────────── 상태 ───────────── */

  let S = C.fresh();
  const settings = { sound: true, haptics: true, popups: true, confirm: true, notation: 'short', quality: 'high' };
  let buyMode = 1, tab = 'home', started = false, lastFrame = 0, lastUi = 0, lastSlowUi = 0, lastSave = 0, hiddenAt = 0;
  let nextCometAt = Date.now() + 25000, loadedSavedAt = 0, isNewGame = true, lastDailyCheck = 0, dailyPending = false;
  let selDim = 0, selResearch = 0, gxIndex = -1, achFilter = 'all';
  const subTab = { infinity: 'upgrades', records: 'ach', research: 'am', stars: 'sanct' };
  const newAch = new Set();
  const unlockedTabs = {};

  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* 기본값 사용 */ }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 저장 불가 환경 */ } }
  const lowFx = () => settings.quality === 'low' || reducedMotion;

  /* ───────────── 숫자 표기 ───────────── */

  const SHORT = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const KR = ['', '만', '억', '조', '경', '해', '자', '양', '구', '간', '정', '재', '극'];
  function lead(x) { return x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.floor(x)); }
  function fmt(v) {
    v = C.big(v);
    if (!v.m) return '0';
    const e = v.e;
    if (e < 3) { const x = v.toNumber(); return Number.isInteger(x) || x >= 100 ? String(Math.floor(x)) : lead(x); }
    if (settings.notation === 'kr') {
      const g = Math.floor(e / 4);
      if (g < KR.length) { const x = v.m * Math.pow(10, e - g * 4); return (x >= 1000 ? Math.floor(x).toLocaleString('ko-KR') : lead(x)) + KR[g]; }
    } else if (e < 6) return Math.floor(v.toNumber()).toLocaleString('ko-KR');
    else if (settings.notation === 'short') {
      const g = Math.floor(e / 3);
      if (g < SHORT.length) return lead(v.m * Math.pow(10, e - g * 3)) + SHORT[g];
    }
    return v.m.toFixed(2) + 'e' + e;
  }
  const fmtInt = n => Math.floor(n).toLocaleString('ko-KR');
  const fmtX = n => (n >= 1000 ? fmt(n) : n.toFixed(2));
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), hr = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return d ? d + '일 ' + hr + '시간' : hr ? hr + '시간 ' + m + '분' : m ? m + '분 ' + s + '초' : s + '초';
  }
  const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ───────────── 사운드 · 진동 ───────────── */

  const sfx = (() => {
    let ctx = null, master = null;
    function init() {
      if (ctx) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    function tone(freq, dur = 0.12, type = 'sine', vol = 0.2, delay = 0, slide = 1.15) {
      if (!settings.sound || !ctx) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
      } catch (e) { /* 오디오 장치 없음 */ }
    }
    return {
      init,
      tap: c => tone(380 + Math.min(c, 50) * 12, 0.07, 'triangle', 0.11),
      buy: () => tone(640, 0.08, 'square', 0.05, 0, 1.35),
      error: () => tone(150, 0.16, 'sawtooth', 0.05, 0, 0.8),
      click: () => tone(880, 0.04, 'sine', 0.05),
      prestige: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.07)),
      achieve: () => { tone(880, 0.14, 'sine', 0.13); tone(1318, 0.22, 'sine', 0.11, 0.1); },
      comet: () => [1200, 1500, 1800, 2400].forEach((f, i) => tone(f, 0.1, 'sine', 0.08, i * 0.05)),
      crunch: () => [196, 262, 330, 392, 523, 784].forEach((f, i) => tone(f, 0.38, 'triangle', 0.14, i * 0.09, 1.02))
    };
  })();
  function buzz(ms) { if (settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* 미지원 */ } } }

  /* ───────────── 토스트 · 모달 · 연출 ───────────── */

  function toast(html, icon = '✦', tone = '') {
    const stack = $('#toasts');
    while (stack.children.length >= 4) stack.firstChild.remove();
    const n = h('div', 'toast ' + tone, '<span class="toast-ico">' + icon + '</span><span>' + window.CD.saga.fixJosa(html) + '</span>');
    stack.appendChild(n);
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 260); }, 2800);
  }

  const modalQueue = [];
  let modalOpen = false, modalCancel = null;
  function modal(opts) { modalQueue.push(opts); if (!modalOpen) nextModal(); }
  function nextModal() {
    const o = modalQueue.shift();
    if (!o) return;
    modalOpen = true;
    $('#modal-title').textContent = o.title;
    const art = $('#modal-art');
    art.innerHTML = o.art ? '<img src="' + o.art + '" alt="">' : '';
    cls(art, 'hidden', !o.art);
    const icon = $('#modal-icon');
    cls(icon, 'hidden', !!o.art || o.icon === false);
    icon.innerHTML = o.iconImg ? '<img src="' + o.iconImg + '" alt="" style="width:46px;height:46px;border-radius:50%">' : (o.icon || '✦');
    $('#modal-body').innerHTML = o.body || '';
    const acts = $('#modal-actions');
    acts.innerHTML = '';
    const actions = o.actions || [{ label: '확인', cls: 'btn-gold' }];
    modalCancel = o.cancellable === false ? null : (actions.find(a => a.cancel) || { run: null });
    cls($('#modal-x'), 'hidden', !modalCancel);
    actions.forEach(a => {
      const b = h('button', 'btn ' + (a.cls || 'btn-ghost'));
      b.textContent = a.label;
      b.disabled = !!a.disabled;
      b.onclick = () => {
        sfx.click();
        if (a.keep) { if (a.run) a.run(); return; }
        closeModal();
        if (a.run) a.run();
      };
      acts.appendChild(b);
    });
    $('#modal').classList.add('open');
    if (o.onOpen) o.onOpen($('#modal-body'));
    setTimeout(() => { const f = acts.querySelector('button.btn-gold:not(:disabled), button:not(:disabled)'); if (f) f.focus({ preventScroll: true }); }, 60);
  }
  function closeModal() {
    $('#modal').classList.remove('open');
    modalOpen = false;
    modalCancel = null;
    if (modalQueue.length) setTimeout(() => { if (!modalOpen) nextModal(); }, 160);
  }
  function cancelModal() { if (!modalOpen || !modalCancel) return; const run = modalCancel.run; closeModal(); if (run) run(); }

  const fx = $('#fx-layer');
  function centerOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  function floatText(x, y, text, tone = '') {
    if (!settings.popups || fx.childElementCount > 60) return;
    const n = h('div', 'float-num ' + tone);
    n.textContent = text;
    n.style.left = x + 'px'; n.style.top = y + 'px';
    fx.appendChild(n);
    setTimeout(() => n.remove(), 950);
  }
  function burst(x, y, count = 10, color) {
    if (!settings.popups || lowFx() || fx.childElementCount > 80 || !fx.animate) return;
    if (settings.quality === 'mid') count = Math.ceil(count / 2);
    if (settings.quality === 'ultra') count = Math.ceil(count * 1.5);
    for (let i = 0; i < count; i++) {
      const s = h('div', 'spark');
      if (color) { s.style.background = color; s.style.boxShadow = '0 0 10px ' + color; }
      s.style.left = x + 'px'; s.style.top = y + 'px';
      fx.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 36 + Math.random() * 70;
      s.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + Math.cos(a) * d + 'px), calc(-50% + ' + Math.sin(a) * d + 'px)) scale(.2)', opacity: 0 }
      ], { duration: 550 + Math.random() * 350, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
    }
  }
  function flash() { if (lowFx() || !settings.popups) return; const f = h('div', 'screen-flash'); document.body.appendChild(f); setTimeout(() => f.remove(), 950); }
  function shake(el) { if (el && el.animate && !reducedMotion) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 200 }); }

  /* ───────────── 저장 ───────────── */

  function save() {
    try { localStorage.setItem(SAVE_KEY, C.serialize(S, Date.now())); lastSave = Date.now(); }
    catch (e) { /* 저장 공간 부족 등 */ }
  }
  function load() {
    for (const key of [SAVE_KEY, BACKUP_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        const s = C.revive(data, Date.now());
        if (key === SAVE_KEY) { try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* 무시 */ } }
        return { s, savedAt: Number(data.savedAt) || Date.now(), fromBackup: key === BACKUP_KEY };
      } catch (e) { console.warn('세이브 읽기 실패:', key, e); }
    }
    return null;
  }
  function encodeSave() {
    const bytes = new TextEncoder().encode(C.serialize(S, Date.now()));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'CD2:' + btoa(bin);
  }
  function decodeSave(text) {
    text = String(text || '').trim();
    if (!text) throw new Error('empty');
    if (text.startsWith('{')) return JSON.parse(text);
    const b64 = text.startsWith('CD2:') ? text.slice(4) : text;
    const bin = atob(b64.replace(/\s+/g, ''));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }
  function applyImported(raw) {
    S = C.revive(raw, Date.now());
    const away = (Date.now() - (Number(raw.savedAt) || Date.now())) / 1000;
    C.record(S, '세이브 불러오기');
    resetViewCaches();
    if (away > 5) applyAway(away, true);
    save();
    updateAll();
    toast('세이브를 불러왔습니다.', '📂', 'green');
  }

  /* ───────────── 코어 이벤트 → 연출 ───────────── */

  const pendingMastery = new Set();
  let masteryTimer = 0;
  function onCoreEvent(type, p) {
    switch (type) {
      case 'shift':
        sfx.prestige(); flash();
        toast('<b>' + esc(D.dims[p.dim - 1].name) + '</b> 개방!', '🔓', 'gold');
        save(); break;
      case 'boost':
        sfx.prestige();
        toast('차원 부스트 <b>#' + p.boosts + '</b> · 모든 차원 ×' + C.boostBase(S).toFixed(1), '⚡', 'gold'); break;
      case 'galaxy':
        sfx.prestige(); flash();
        toast('새 은하 <b>' + esc(p.name) + '</b> 탄생!', '🌌', 'violet');
        gxIndex = S.galaxyCollection.length - 1;
        save(); break;
      case 'sacrifice':
        sfx.prestige();
        toast('차원 희생 · 제8차원 <b>×' + fmtX(p.mult) + '</b>', '✦', 'violet'); break;
      case 'crunch':
        sfx.crunch(); flash();
        if (p.auto || S.infinities > 1) toast('빅 크런치! <b>+' + p.gain + ' IP</b>', '☄', 'gold');
        else modal({
          art: 'img/ui/infinity-scene.webp', title: '첫 번째 인피니티!',
          body: '<p>우주가 붕괴하고 새로운 우주가 태어났습니다.</p><div class="modal-big">' + GEM_IP + '+' + p.gain + '</div><p>인피니티 포인트로 <b>무한</b> 탭에서 영구 업그레이드를 구매하세요. 이제 <b>도전</b>도 해금되었습니다.</p>',
          actions: [{ label: '닫기', cancel: true }, { label: '무한 탭으로', cls: 'btn-gold', run: () => switchTab('infinity') }]
        });
        save(); break;
      case 'achievement': {
        const def = p.secret ? C.SECRET[p.i] : C.ACH[p.i];
        newAch.add((p.secret ? 's' : 'n') + p.i);
        if (started) { sfx.achieve(); toast((p.secret ? '<b>비밀 업적</b> · ' : '<b>업적 달성</b> · ') + esc(def.name) + ' <small>(+5%)</small>', '🏆', 'gold'); }
        break;
      }
      case 'mastery':
        p.dims.forEach(i => pendingMastery.add(i));
        if (!masteryTimer) masteryTimer = setTimeout(flushMastery, 1200);
        break;
      case 'apostleFound':
        sfx.achieve(); flash();
        toast('성좌 <b>\'' + esc(D.constellations[p.i].name) + '\'</b>이(가) 깨어났습니다! 곧 사도를 고를 것입니다.', '✨', 'gold');
        save(); break;
      case 'constLevel':
        sfx.achieve();
        toast('<b>' + esc(D.constellations[p.i].name) + '</b> 후원 Lv.' + p.level + ' · ' + esc(D.skills[p.skill].name) + ' +1', '🌟', 'violet'); break;
      case 'revelation':
        if (started) { sfx.comet(); toast('<b>' + esc(D.apostles[p.i].name) + '</b>의 계시 · +' + fmt(p.bonus) + ' 반물질', '🔮', 'violet'); }
        break;
      case 'eventStart': {
        const ev = C.eventDef(p.id);
        if (started) { sfx.comet(); toast('<b>특수 현상! ' + esc(ev.name) + '</b> · ' + esc(ev.desc), ev.icon, 'violet'); }
        break;
      }
      case 'eventEnd': if (started) toast(esc(C.eventDef(p.id).name) + ' 종료', '·'); break;
      case 'buffEnd': if (started) toast('과충전이 끝났습니다. 잠시 후 다시 사용할 수 있습니다.', '⚡'); break;
      case 'challengeDone':
        sfx.crunch(); flash();
        modal({
          iconImg: 'img/ui/ach2.webp', title: '도전 완료!',
          body: '<p><b>' + esc(D.challenges[p.i].name) + '</b>을(를) 정복했습니다.</p><div class="modal-big">생산 +' + Math.round(D.challenges[p.i].reward * 100) + '%</div><p>영구 보상이 적용되었고, 원래 우주로 돌아왔습니다.</p>',
          actions: [{ label: '좋아요', cls: 'btn-gold' }]
        });
        save(); break;
      case 'challengeQuit': toast('도전을 포기하고 원래 우주로 돌아왔습니다.', '↩'); save(); break;
      case 'saga': onSaga(p); break;
    }
  }
  function flushMastery() {
    masteryTimer = 0;
    if (!pendingMastery.size) return;
    const dims = Array.from(pendingMastery).sort((a, b) => a - b);
    pendingMastery.clear();
    if (started) toast('<b>마스터리 상승</b> · ' + dims.map(i => D.dims[i].roman).join(' · ') + ' 차원 (생산 +10%)', '✦', 'violet');
  }

  /* ───────────── 1. 개요 ───────────── */

  const coreBtn = $('#core-btn');
  function doTap(x, y) {
    const r = C.tap(S, Date.now());
    sfx.tap(r.combo);
    buzz(6);
    floatText(x, y - 14, '+' + fmt(r.gain));
    burst(x, y, 4);
    coreBtn.classList.remove('hit'); void coreBtn.offsetWidth; coreBtn.classList.add('hit');
    if (r.combo === C.COMBO_MAX) burst(x, y, 14, '#ff9a3d');
  }
  coreBtn.addEventListener('pointerdown', e => { e.preventDefault(); doTap(e.clientX, e.clientY); });
  coreBtn.addEventListener('click', e => { if (e.detail === 0) { const [x, y] = centerOf(coreBtn); doTap(x, y); } });
  coreBtn.addEventListener('contextmenu', e => e.preventDefault());

  const stripEls = [];
  function buildStrip() {
    const strip = $('#dim-strip');
    D.dims.forEach((d, i) => {
      const b = h('button', 'dchip', '<span class="dchip-roman">' + d.roman + '</span><img class="dchip-img" src="img/ui/dim' + (i + 1) + '.webp" alt=""><span class="dchip-name">' + esc(d.name.replace(' 차원', '')) + '</span><span class="dchip-rate"></span><span class="dchip-lv"></span><span class="dchip-cost"></span>');
      b.setAttribute('aria-label', d.name + ' 구매');
      const r = { b, rate: b.querySelector('.dchip-rate'), lv: b.querySelector('.dchip-lv'), cost: b.querySelector('.dchip-cost') };
      b.addEventListener('click', () => buyDim(i, b));
      strip.appendChild(b);
      stripEls.push(r);
    });
  }
  function buyDim(i, anchor) {
    if (i >= C.unlocked(S)) { sfx.error(); shake(anchor); toast('차원 교체로 개방해야 합니다.', '🔒'); return; }
    const n = C.buyDim(S, i, buyMode);
    if (!n) { sfx.error(); shake(anchor); return; }
    sfx.buy(); buzz(5);
    if (anchor) { const [x, y] = centerOf(anchor); floatText(x, y - 18, '+' + n, 'green'); }
    C.checkAchievements(S);
    update(Date.now(), true);
  }
  function updateStrip(mults, sp) {
    const u = C.unlocked(S);
    stripEls.forEach((r, i) => {
      const locked = i >= u, d = S.dims[i];
      cls(r.b, 'locked', locked);
      if (locked) { setText(r.rate, '잠김'); setText(r.lv, ''); setText(r.cost, '🔒'); cls(r.b, 'can', false); return; }
      setText(r.rate, '+' + fmt(C.dimOutput(S, i, 0, mults, sp)) + '/s');
      setText(r.lv, 'Lv.' + d.bought + ' · ' + fmt(d.amount));
      const plan = C.buyPlan(S, i, buyMode), can = plan.count > 0;
      cls(r.b, 'can', can);
      setText(r.cost, (buyMode === 'max' && can ? '×' + plan.count + ' ' : '') + fmt(can ? plan.cost : C.dimCost(S, i)));
    });
  }

  const PRESTIGE = [
    { type: 'shift', art: 'img/ui/dim5.webp', title: '차원 교체', btn: '교체 실행' },
    { type: 'boost', art: 'img/ui/icon-burst.webp', title: '차원 부스트', btn: '부스트 실행' },
    { type: 'galaxy', art: 'img/ui/gx2.webp', title: '은하 생성', btn: '은하 생성' },
    { type: 'crunch', art: 'img/ui/infinity-scene.webp', title: '인피니티 리셋', btn: '빅 크런치' }
  ];
  const pEls = {};
  function buildPrestige() {
    const grid = $('#prestige-grid');
    PRESTIGE.forEach(p => {
      const c = h('article', 'frame acard', '<div class="acard-art"><img src="' + p.art + '" alt=""><div class="acard-title">' + p.title + '</div></div>' +
        '<div class="acard-body"><div class="acard-desc"></div><div class="acard-req"></div><span class="rail-bar sm"><span class="rail-bar-in"></span></span><button class="btn ' + (p.type === 'crunch' ? 'btn-gold' : 'btn-violet') + ' sm block">' + p.btn + '</button></div>');
      const r = { card: c, desc: c.querySelector('.acard-desc'), req: c.querySelector('.acard-req'), fill: c.querySelector('.rail-bar-in'), btn: c.querySelector('button') };
      r.btn.addEventListener('click', () => prestige(p.type));
      grid.appendChild(c);
      pEls[p.type] = r;
    });
  }
  function updatePrestige() {
    const u = C.unlocked(S), top = S.dims[u - 1];
    const set = (type, desc, req, pct, ready) => {
      const r = pEls[type];
      setText(r.desc, desc); setText(r.req, req); width(r.fill, pct);
      cls(r.card, 'ready', ready); setDisabled(r.btn, !ready);
    };
    if (S.activeChallenge === 2) set('shift', '이 도전에서는 차원 교체가 봉인되었습니다.', '봉인됨', 0, false);
    else if (u >= 8) set('shift', '8개 차원이 모두 개방되었습니다.', '개방 완료', 100, false);
    else set('shift', '초기화 후 ' + D.dims[u].name + '을(를) 개방합니다.', '제' + u + '차원 ' + top.bought + ' / ' + C.shiftReq(), top.bought / C.shiftReq() * 100, C.canShift(S));
    const br = C.boostReq(S);
    if (S.activeChallenge === 3) set('boost', '이 도전에서는 부스트를 할 수 없습니다.', '봉인됨', 0, false);
    else set('boost', '초기화 후 모든 차원 ×' + C.boostBase(S).toFixed(1) + ' (현재 ' + S.boosts + '회)', '제' + u + '차원 ' + top.bought + ' / ' + br, top.bought / br * 100, C.canBoost(S));
    const gr = C.galaxyReq(S);
    if (S.shifts < 4) set('galaxy', '틱스피드를 영구 강화하는 새 은하를 탄생시킵니다.', '8개 차원 개방 필요', S.shifts / 4 * 100, false);
    else set('galaxy', '틱스피드를 영구 강화하는 새 은하를 탄생시킵니다.', '제8차원 ' + S.dims[7].bought + ' / ' + gr, S.dims[7].bought / gr * 100, C.canGalaxy(S));
    const pct = Math.max(0, S.matter.log10()) / C.INF.log10() * 100;
    if (S.activeChallenge >= 0) set('crunch', '도전 중에는 빅 크런치를 할 수 없습니다.', '도전 진행 중', pct, false);
    else set('crunch', '모든 차원을 초월해 인피니티 포인트를 얻습니다.', C.canCrunch(S) ? '보상 +' + C.ipGain(S) + ' IP' : '∞ 까지 ' + pct.toFixed(1) + '%', pct, C.canCrunch(S));
  }

  function prestige(type) {
    if (type === 'crunch') return confirmCrunch();
    if (type === 'galaxy') return openGalaxyCreate();
    const fns = { shift: C.shift, boost: C.boost };
    if (!{ shift: C.canShift, boost: C.canBoost }[type](S)) { sfx.error(); return; }
    const run = () => { if (fns[type](S)) { C.checkAchievements(S); update(Date.now(), true); } };
    if (!settings.confirm) return run();
    const info = {
      shift: ['img/ui/dim' + Math.min(8, C.unlocked(S) + 1) + '.webp', '차원 교체', '반물질·차원·틱스피드가 초기화되고 다음 차원이 개방됩니다.'],
      boost: ['img/ui/icon-burst.webp', '차원 부스트', '반물질·차원·틱스피드가 초기화되고, 모든 차원 생산이 ×' + C.boostBase(S).toFixed(1) + ' 강해집니다.']
    }[type];
    modal({
      iconImg: info[0], title: info[1], body: '<p>' + info[2] + '</p><p style="font-size:.72rem">설정에서 확인 창을 끌 수 있습니다.</p>',
      actions: [{ label: '취소', cancel: true }, { label: '실행', cls: 'btn-gold', run }]
    });
  }
  function confirmCrunch() {
    if (!C.canCrunch(S)) { sfx.error(); return; }
    modal({
      art: 'img/ui/infinity-scene.webp', title: '인피니티 리셋',
      body: '<p>모든 차원을 초월하여 더 높은 차원으로 도약합니다.</p>' +
        '<div class="modal-box"><h4>획득 예정 인피니티 포인트</h4><div class="modal-big">' + GEM_IP + '+' + C.ipGain(S) + '</div></div>' +
        '<div class="modal-box"><h4>유지되는 것</h4>업적 · 성좌 · 연구 · 마스터리 · 인피니티 업그레이드 · 은하 컬렉션</div>' +
        '<div class="modal-warn">⚠ 반물질·차원·교체·부스트·은하·틱스피드는 초기화됩니다.</div>',
      actions: [{ label: '취소', cancel: true }, { label: '인피니티 리셋', cls: 'btn-gold', run: () => { C.crunch(S, Date.now()); update(Date.now(), true); } }]
    });
  }
  function doSacrifice(anchor) {
    if (!C.canSacrifice(S)) {
      sfx.error(); shake(anchor);
      toast(C.unlocked(S) < 8 ? '제8차원을 개방해야 합니다.' : S.dims[7].amount.isZero() ? '제8차원을 보유해야 합니다.' : '지금 희생해도 이득이 없습니다.', '✦');
      return;
    }
    const run = () => { if (C.sacrifice(S)) { const [x, y] = centerOf(anchor); burst(x, y, 14, '#9b7bff'); C.checkAchievements(S); update(Date.now(), true); } };
    if (!settings.confirm) return run();
    modal({
      icon: '✦', title: '차원 희생',
      body: '<p>제1~7차원의 수량을 모두 바쳐 제8차원을 강화합니다. 구매 횟수는 유지됩니다.</p><div class="modal-big">×' + fmtX(C.sacMult(S)) + ' → ×' + fmtX(C.sacMult(S) * C.sacrificeGain(S)) + '</div><p style="font-size:.72rem">희생 배율은 다음 차원 부스트·은하·빅 크런치 때 초기화됩니다.</p>',
      actions: [{ label: '취소', cancel: true }, { label: '희생', cls: 'btn-violet', run }]
    });
  }

  function updateHome(now, mults, sp, prod) {
    const capped = S.matter.gte(C.INF);
    const m = $('#matter'), txt = fmt(S.matter);
    if (m._t !== txt) { setText(m, txt); if (now - (m._p || 0) > 260) { m._p = now; m.classList.remove('pulse'); void m.offsetWidth; m.classList.add('pulse'); } }
    cls(m, 'capped', capped);
    setText($('#rate'), capped ? '∞ 도달 — 인피니티 리셋 가능' : '+' + fmt(prod) + ' / 초');
    const pct = Math.max(0, S.matter.log10()) / C.INF.log10() * 100;
    width($('#inf-progress'), pct);
    setText($('#inf-pct'), pct.toFixed(1) + '%');
    const combo = S.tap.combo, left = C.comboLeft(S, now);
    cls($('#combo'), 'on', left > 0 && combo > 1);
    setText($('#combo-n'), 'COMBO ×' + combo + (combo >= C.COMBO_MAX ? ' MAX' : ''));
    width($('#combo-fill'), left / 10);
    cls($('#core-hint'), 'hidden', S.stats.taps >= 20);
    cls($('#crunch-banner'), 'hidden', !C.canCrunch(S));
    if (C.canCrunch(S)) setText($('#crunch-reward'), '모든 차원을 초월하고 +' + C.ipGain(S) + ' IP를 획득하세요');

    const gi = C.nextGoal(S), gc = $('#goal-card');
    cls(gc, 'hidden', gi === null);
    if (gi !== null) {
      const a = C.ACH[gi];
      setText($('#goal-name'), a.name);
      setText($('#goal-desc'), a.desc);
      width($('#goal-fill'), achRatio(a) * 100);
    }
    const bb = $('#buff-btn');
    if (C.buffActive(S, now)) { setText(bb, '⚡ ' + clock(S.buff.endsAt - now)); setDisabled(bb, true); cls(bb, 'ready', false); }
    else if (now < S.buff.readyAt) { setText(bb, '⏳ ' + clock(S.buff.readyAt - now)); setDisabled(bb, true); cls(bb, 'ready', false); }
    else { setText(bb, '⚡ 과충전 ×' + C.buffPower(S).toFixed(1)); setDisabled(bb, S.matter.isZero()); cls(bb, 'ready', true); }
    setText($('#home-tick-cost'), C.tickLocked(S) ? '정지됨' : fmt(C.tickCost(S)));
    setDisabled($('#home-tick'), !C.canBuyTick(S));
    setText($('#home-sac-gain'), C.canSacrifice(S) ? '×' + fmtX(C.sacrificeGain(S)) : C.unlocked(S) < 8 ? '8차원 필요' : '—');
    setDisabled($('#home-sac'), !C.canSacrifice(S));
    updateStrip(mults, sp);
    updatePrestige();
  }

  /* ───────────── 2. 차원 ───────────── */

  const dtabEls = [];
  function buildDims() {
    const tabs = $('#dim-tabs');
    D.dims.forEach((d, i) => {
      const b = h('button', 'dtab', '<b>' + d.roman + '</b><span>' + esc(d.name.replace(' 차원', '')) + '</span>');
      b.addEventListener('click', () => { selDim = i; sfx.click(); update(Date.now(), true); });
      tabs.appendChild(b);
      dtabEls.push(b);
    });
    $('#dd-buy').addEventListener('click', e => buyDim(selDim, e.currentTarget));
    $('#buy-tick').addEventListener('click', e => buyTickBtn(e.currentTarget));
    $('#sac-btn').addEventListener('click', e => doSacrifice(e.currentTarget));
  }
  function buyTickBtn(btn) {
    if (!C.buyTick(S)) { sfx.error(); shake(btn); return; }
    sfx.buy();
    const [x, y] = centerOf(btn); floatText(x, y - 18, '⏱ +1', 'green');
    C.checkAchievements(S); update(Date.now(), true);
  }
  function statRows(el, rows) {
    if (el._rows !== rows.length) {
      el._rows = rows.length;
      el.innerHTML = rows.map(() => '<div class="stat-row"><span></span><span></span></div>').join('');
    }
    Array.from(el.children).forEach((row, k) => {
      setHTML(row.firstChild, rows[k][0]);
      setText(row.lastChild, rows[k][1]);
      cls(row, 'hl', !!rows[k][2]);
    });
  }
  function updateDims(now, mults, sp) {
    const u = C.unlocked(S), i = selDim, d = S.dims[i], def = D.dims[i], locked = i >= u;
    dtabEls.forEach((b, k) => { cls(b, 'active', k === i); cls(b, 'locked', k >= u); });
    const img = $('#dd-img'), src = 'img/thumb/dim' + (i + 1) + '.webp';
    if (img._src !== src) { img._src = src; img.src = src; }
    setText($('#dd-lv'), def.roman + ' · Lv. ' + d.bought);
    setText($('#dd-name'), def.name);
    const out = C.dimOutput(S, i, now, mults, sp);
    setText($('#dd-rate'), locked ? '🔒 차원 교체로 개방' : '+' + fmt(out) + (i === 0 ? ' 반물질/초' : ' ' + D.dims[i - 1].roman + '차원/초'));
    const plan = C.buyPlan(S, i, buyMode), can = plan.count > 0;
    setText($('#dd-buy-label'), locked ? '잠김' : '구매 ' + (buyMode === 'max' ? (can ? '×' + plan.count : 'MAX') : '×' + (can ? plan.count : buyMode)));
    setText($('#dd-buy-cost'), fmt(can ? plan.cost : C.dimCost(S, i)));
    setDisabled($('#dd-buy'), locked || !can);
    const sb = S.activeChallenge === 5 ? 1.5 : 2, sets = Math.floor(d.bought / 10), ms = S.mastery[i];
    const rows = [
      ['보유 수량', fmt(d.amount)],
      ['초당 생산', '+' + fmt(out) + '/s', true],
      ['총 배율', '×' + fmt(mults[i]), true],
      ['10개 묶음 보너스 (' + (d.bought % 10) + '/10)', '×' + fmt(BigNum.pow(sb, sets))],
      ['차원 부스트 (' + S.boosts + '회)', '×' + fmt(BigNum.pow(C.boostBase(S), S.boosts))],
      ['업적 보너스', '×' + C.achBonus(S).toFixed(2)],
      ['틱 가속', '×' + fmt(sp)],
      ['마스터리 Lv.' + ms.level + ' (' + Math.floor(ms.xp) + '/' + C.masteryNeed(ms.level) + ')', '+' + ms.level * 10 + '%']
    ];
    if (i === 7) rows.push(['차원 희생', '×' + fmtX(C.sacMult(S))]);
    statRows($('#dd-stats'), rows);
    const tb = $('#buy-tick');
    if (C.tickLocked(S)) { setText($('#tick-cost'), '정지됨'); setDisabled(tb, true); }
    else { setText($('#tick-cost'), fmt(C.tickCost(S))); setDisabled(tb, !C.canBuyTick(S)); }
    setText($('#tick-info'), '가속 ×' + fmt(sp) + ' · 구매당 ×' + (1 / C.tickBase(S)).toFixed(3) + ' · ' + S.tickspeedPurchased + '회');
    const spin = Math.max(0.6, 6 / (1 + Math.max(0, sp.log10()) / 3)).toFixed(2) + 's';
    if (tb._spin !== spin) { tb._spin = spin; $('#tick-card').style.setProperty('--tick-spin', spin); }
    setText($('#sac-info'), '현재 제8차원 ×' + fmtX(C.sacMult(S)) + ' · 리셋 시 초기화');
    setText($('#sac-gain'), C.canSacrifice(S) ? '×' + fmtX(C.sacrificeGain(S)) : '—');
    setDisabled($('#sac-btn'), !C.canSacrifice(S));
  }

  /* ───────────── 3. 은하 ───────────── */

  const GX_THUMBS = { spiral: [1, 2, 4, 6], elliptical: [5, 7], irregular: [3], ring: [8] };
  const gxThumb = g => { const l = GX_THUMBS[g.type] || GX_THUMBS.spiral; return 'img/ui/gx' + l[g.seed % l.length] + '.webp'; };
  const typeName = id => (D.galaxyTypes.find(t => t.id === id) || D.galaxyTypes[0]).name;
  const nextTickBase = () => C.tickBase({ galaxies: S.galaxies + 1, infinityUpgrades: S.infinityUpgrades });
  function gxFlavor(g, k) {
    const r = GA.rand(g.seed + 3);
    const grades = ['C', 'B', 'A', 'A+', 'S', 'S+'];
    return {
      grade: grades[Math.min(5, Math.floor(r() * 4) + Math.floor(k / 5))],
      size: (2 + r() * 18).toFixed(1) + '만 광년',
      stars: fmtInt(500 + r() * 9500) + '억 개',
      stability: Math.floor(60 + r() * 40) + '%'
    };
  }
  function buildGalaxy() {
    $('#gx-prev').addEventListener('click', () => stepGalaxy(-1));
    $('#gx-next').addEventListener('click', () => stepGalaxy(1));
    $('#gx-create').addEventListener('click', openGalaxyCreate);
  }
  function stepGalaxy(dir) {
    const n = S.galaxyCollection.length;
    if (!n) return;
    gxIndex = (gxIndex + dir + n) % n;
    sfx.click(); update(Date.now(), true);
  }
  function updateGalaxy() {
    const list = S.galaxyCollection, n = list.length;
    if (gxIndex < 0 || gxIndex >= n) gxIndex = n - 1;
    const g = list[gxIndex];
    cls($('#gx-empty'), 'hidden', !!g);
    cls($('#gx-prev'), 'hidden', n < 2); cls($('#gx-next'), 'hidden', n < 2);
    setText($('#gx-name'), g ? g.name : '');
    setText($('#gx-type'), g ? typeName(g.type) : '');
    const f = g ? gxFlavor(g, gxIndex) : null;
    statRows($('#gx-stats'), g ? [
      ['등급', f.grade, true], ['크기', f.size], ['별 개수', f.stars], ['안정도', f.stability], ['탄생 순서', '#' + (gxIndex + 1)]
    ] : [['보유 은하', '0개']]);
    setText($('#gx-count'), n + ' / 50');
    const grid = $('#gx-grid'), sig = n + ':' + (n ? list[n - 1].name : '');
    if (grid._sig !== sig) {
      grid._sig = sig;
      grid.innerHTML = '';
      list.forEach((gg, k) => {
        const b = h('button', 'gx-cell', '<img src="' + gxThumb(gg) + '" alt="" style="width:100%;height:100%;object-fit:cover"><span>' + esc(gg.name) + '</span>');
        b.addEventListener('click', () => { gxIndex = k; sfx.click(); update(Date.now(), true); });
        grid.appendChild(b);
      });
      if (!n) grid.innerHTML = '<div class="hint-line" style="grid-column:1/-1;text-align:center">아직 은하가 없습니다.</div>';
    }
    Array.from(grid.children).forEach((c, k) => cls(c, 'active', k === gxIndex));
    statRows($('#gx-req'), [
      ['8개 차원 개방', S.shifts >= 4 ? '✓ 완료' : S.shifts + ' / 4'],
      ['제8차원 구매', S.dims[7].bought + ' / ' + C.galaxyReq(S)],
      ['틱 배율 (구매당)', '×' + (1 / C.tickBase(S)).toFixed(3) + ' → ×' + (1 / nextTickBase()).toFixed(3), true],
      ['초기화', '반물질 · 차원 · 교체 · 부스트 · 틱스피드']
    ]);
    setDisabled($('#gx-create'), !C.canGalaxy(S));
  }
  let gxAnim = 0;
  function drawGalaxyStage(t) {
    const cv = $('#gx-canvas'), g = S.galaxyCollection[gxIndex], ctx = cv.getContext('2d');
    if (!g) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    GA.draw(ctx, cv.width, cv.height, g, lowFx() ? 0 : t / 9000);
  }
  function openGalaxyCreate() {
    if (!C.canGalaxy(S)) { sfx.error(); toast(S.shifts < 4 ? '8개 차원을 모두 개방해야 합니다.' : '제8차원이 ' + C.galaxyReq(S) + '개 필요합니다.', '🌌'); return; }
    let chosen = 'spiral', alive = true;
    const prevSeed = Math.floor(Math.random() * 1e9);
    modal({
      title: '새로운 은하 생성', icon: false,
      body: '<canvas id="gx-preview" width="560" height="320" style="width:100%;border-radius:12px;display:block"></canvas>' +
        '<div class="sub-title" style="margin-top:12px">은하 타입 선택</div><div class="type-grid">' +
        D.galaxyTypes.map(t => '<button class="type-btn' + (t.id === chosen ? ' active' : '') + '" data-type="' + t.id + '"><img src="' + gxThumb({ type: t.id, seed: 0 }) + '" alt="" style="width:100%;aspect-ratio:1;border-radius:8px;object-fit:cover">' + t.name + '</button>').join('') +
        '</div><div class="modal-box"><h4>효과</h4>틱 배율 (구매당) ×' + (1 / C.tickBase(S)).toFixed(3) + ' → ×' + (1 / nextTickBase()).toFixed(3) + '</div>' +
        '<div class="modal-warn">⚠ 반물질·차원·교체·부스트·틱스피드가 초기화됩니다.</div>',
      onOpen: body => {
        const cv = body.querySelector('#gx-preview'), ctx = cv.getContext('2d');
        const loop = t => {
          if (!alive || !modalOpen || !cv.isConnected) return;
          GA.draw(ctx, cv.width, cv.height, { type: chosen, seed: prevSeed }, lowFx() ? 0 : t / 6000);
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        body.querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => {
          chosen = b.dataset.type; sfx.click();
          body.querySelectorAll('.type-btn').forEach(x => cls(x, 'active', x === b));
        }));
      },
      actions: [{ label: '취소', cancel: true, run: () => { alive = false; } }, {
        label: '은하 생성하기', cls: 'btn-gold', run: () => {
          alive = false;
          if (C.galaxy(S, chosen)) { C.checkAchievements(S); update(Date.now(), true); }
        }
      }]
    });
  }

  /* ───────────── 4. 연구 ───────────── */

  const RS_ICON = ['rs1', 'rs11', 'rs5', 'rs9', 'rs10', 'rs4', 'rs2', 'rs3', 'rs6', 'rs7'];
  const rsEls = [];
  function buildResearch() {
    const tree = $('#rs-tree');
    tree.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg>';
    const svg = tree.firstChild;
    D.research.forEach((r, i) => {
      if (r.req >= 0) {
        const p = D.research[r.req], ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', p.x); ln.setAttribute('y1', p.y); ln.setAttribute('x2', r.x); ln.setAttribute('y2', r.y);
        ln.dataset.cur = r.currency; ln.dataset.i = i;
        svg.appendChild(ln);
      }
      const b = h('button', 'rs-node', '<i><img src="img/ui/' + RS_ICON[i] + '.webp" alt="" style="width:44px;height:44px;border-radius:50%"></i><em>' + esc(r.name) + '</em>');
      b.style.left = r.x + '%'; b.style.top = r.y + '%';
      b.addEventListener('click', () => { selResearch = i; sfx.click(); update(Date.now(), true); });
      tree.appendChild(b);
      rsEls.push(b);
    });
  }
  function rsEffect(i, lvl) {
    const r = D.research[i], v = r.per * lvl, sign = i === 3 ? '-' : '+';
    return r.unit === '%' ? sign + Math.round(v * 100) + '%' : r.unit === 'x' ? '+' + v.toFixed(1) : '+' + v;
  }
  function updateResearch() {
    const cur = subTab.research;
    if (D.research[selResearch].currency !== cur) selResearch = D.research.findIndex(r => r.currency === cur);
    rsEls.forEach((b, i) => {
      const r = D.research[i], lvl = S.research[i];
      b.classList.toggle('hidden', r.currency !== cur);
      b.style.setProperty('--p', lvl / D.researchMax * 100);
      cls(b, 'locked', !C.researchOpen(S, i));
      cls(b, 'maxed', lvl >= D.researchMax);
      cls(b, 'avail', C.canResearch(S, i));
      cls(b, 'sel', i === selResearch);
    });
    $$('#rs-tree line').forEach(ln => {
      ln.style.display = ln.dataset.cur === cur ? '' : 'none';
      ln.classList.toggle('on', S.research[Number(ln.dataset.i)] > 0);
    });
    const i = selResearch, r = D.research[i], lvl = S.research[i], cost = C.researchCost(S, i), open = C.researchOpen(S, i);
    const el = $('#rs-detail');
    if (!el._built) {
      el._built = true;
      el.innerHTML = '<div class="mini-ico"><img alt="" style="width:46px;height:46px;border-radius:50%"></div><div><div class="rs-name"></div><div class="rs-lv"></div></div><div class="rs-desc"></div><div class="stat-table"></div><button class="btn btn-violet lg block">연구하기</button>';
      el.querySelector('button').addEventListener('click', e => {
        const k = selResearch;
        if (!C.buyResearch(S, k)) { sfx.error(); shake(e.currentTarget); return; }
        sfx.achieve();
        const [x, y] = centerOf(rsEls[k]); burst(x, y, 12, '#9b7bff');
        toast('<b>' + esc(D.research[k].name) + '</b> Lv.' + S.research[k], '🔬', 'violet');
        C.checkAchievements(S); update(Date.now(), true);
      });
    }
    const img = el.querySelector('img'), src = 'img/ui/' + RS_ICON[i] + '.webp';
    if (img._src !== src) { img._src = src; img.src = src; }
    setText(el.querySelector('.rs-name'), r.name);
    setText(el.querySelector('.rs-lv'), 'Lv. ' + lvl + ' / ' + D.researchMax);
    setText(el.querySelector('.rs-desc'), r.desc);
    statRows(el.querySelector('.stat-table'), [
      ['현재 효과', rsEffect(i, lvl), true],
      ['다음 레벨 효과', lvl >= D.researchMax ? '최대' : rsEffect(i, lvl + 1)],
      ['선행 연구', r.req < 0 ? '없음' : D.research[r.req].name + (open ? ' ✓' : ' (Lv.1 필요)')],
      ['필요 재화', !cost ? '—' : cost.ip !== undefined ? cost.ip + ' IP' : fmt(cost.am) + ' 반물질']
    ]);
    const btn = el.querySelector('button');
    setText(btn, !cost ? '연구 완료' : !open ? '선행 연구 필요' : '연구하기');
    setDisabled(btn, !C.canResearch(S, i));
  }

  /* ───────────── 5. 무한 ───────────── */

  const upgEls = [], autoEls = [], challEls = [];
  function buildInfinity() {
    const ug = $('#upgrade-grid');
    D.upgrades.forEach((u, i) => {
      const card = h('article', 'frame tight ucard', '<div class="mini-ico">' + u.icon + '</div><div><div class="ucard-name">' + esc(u.name) + '</div><div class="ucard-desc">' + esc(u.desc) + '</div><button class="btn btn-gold sm"></button></div>');
      const r = { card, btn: card.querySelector('button') };
      r.btn.addEventListener('click', () => {
        if (!C.buyUpgrade(S, i)) { sfx.error(); shake(r.btn); return; }
        sfx.achieve(); flash();
        toast('<b>' + esc(u.name) + '</b> 활성화', u.icon, 'gold');
        C.checkAchievements(S); save(); update(Date.now(), true);
      });
      ug.appendChild(card);
      upgEls.push(r);
    });
    const al = $('#auto-list');
    al.innerHTML = '<div class="sub-title">자동화 장치</div><p class="frame-sub" style="margin:0 0 6px">인피니티 업그레이드로 해금하고 여기서 켜고 끌 수 있습니다.</p>';
    D.upgrades.forEach((u, i) => {
      if (!u.auto) return;
      const row = h('div', 'auto-row', '<div class="mini-ico">' + u.icon + '</div><div class="mini-txt"><b>' + esc(u.name) + '</b><small></small></div><button class="switch" role="switch" aria-label="' + esc(u.name) + '"></button>');
      const r = { row, i, key: u.auto, desc: row.querySelector('small'), sw: row.querySelector('.switch') };
      r.sw.addEventListener('click', () => {
        if (!S.infinityUpgrades[i]) { sfx.error(); toast('먼저 업그레이드를 구매하세요 (' + u.cost + ' IP).', '🔒'); return; }
        S.automation[u.auto] = !S.automation[u.auto];
        sfx.click(); update(Date.now(), true);
      });
      al.appendChild(row);
      autoEls.push(r);
    });
    const cg = $('#challenge-grid');
    D.challenges.forEach((c, i) => {
      const card = h('article', 'frame tight ccard', '<div class="ccard-name">⚔ ' + esc(c.name) + '</div><div class="ccard-debuff">⚠ ' + esc(c.debuff) + '</div>' +
        '<div class="ccard-meta">목표: <b>1e' + c.goalExp + '</b> 반물질</div><div class="ccard-meta">보상: 모든 차원 생산 <b>+' + Math.round(c.reward * 100) + '%</b></div><div class="act"></div>');
      const r = { card, act: card.querySelector('.act'), state: '' };
      cg.appendChild(card);
      challEls.push(r);
    });
  }
  function updateInfinity() {
    setText($('#ip-value'), fmtInt(S.ip));
    setText($('#ip-side'), '빅 크런치 ' + fmtInt(S.infinities) + '회 · 크런치당 +' + (1 + S.research[5]) * (C.hasUpg(S, 8) ? 2 : 1) + ' IP');
    upgEls.forEach((r, i) => {
      const bought = S.infinityUpgrades[i];
      cls(r.card, 'bought', bought);
      setText(r.btn, bought ? '✓ 보유 중' : D.upgrades[i].cost + ' IP');
      setDisabled(r.btn, bought || !C.canUpgrade(S, i));
    });
    autoEls.forEach(r => {
      const owned = S.infinityUpgrades[r.i], on = owned && S.automation[r.key];
      cls(r.row, 'off', !owned);
      cls(r.sw, 'on', on);
      r.sw.setAttribute('aria-checked', on);
      setText(r.desc, owned ? (on ? '작동 중' : '꺼짐') : '미해금 · ' + D.upgrades[r.i].cost + ' IP');
    });
    const unlocked = C.challengesUnlocked(S);
    setText($('#challenge-hint'), unlocked ? '도전은 별도의 우주에서 진행됩니다. 완료하거나 포기하면 원래 우주로 돌아옵니다. 보상은 영구적입니다.' : '🔒 첫 빅 크런치 후 해금됩니다.');
    challEls.forEach((r, i) => {
      const done = S.challenges[i], active = S.activeChallenge === i;
      const state = done ? 'done' : active ? 'active' : !unlocked ? 'locked' : S.activeChallenge >= 0 ? 'busy' : 'ready';
      cls(r.card, 'done', done); cls(r.card, 'active', active);
      if (r.state === state) return;
      r.state = state;
      if (state === 'done') r.act.innerHTML = '<div class="done-tag">✓ 정복 완료</div>';
      else if (state === 'active') { r.act.innerHTML = '<button class="btn btn-danger sm">포기하고 돌아가기</button>'; r.act.firstChild.onclick = quitChallenge; }
      else { r.act.innerHTML = '<button class="btn btn-gold sm"' + (state === 'ready' ? '' : ' disabled') + '>' + (state === 'locked' ? '🔒 잠김' : '도전 시작') + '</button>'; r.act.firstChild.onclick = () => startChallenge(i); }
    });
  }
  function startChallenge(i) {
    const c = D.challenges[i];
    modal({
      iconImg: 'img/ui/ach4.webp', title: c.name,
      body: '<p>' + esc(c.debuff) + '</p><div class="modal-box">목표 1e' + c.goalExp + ' 반물질 · 보상 생산 +' + Math.round(c.reward * 100) + '%</div><p style="margin-top:10px">현재 우주는 안전하게 보관되며, 완료하거나 포기하면 그대로 돌아옵니다.</p>',
      actions: [{ label: '취소', cancel: true }, {
        label: '도전 시작', cls: 'btn-gold', run: () => {
          const r = C.startChallenge(S, i);
          if (!r.ok) { toast(r.reason === 'active' ? '진행 중인 도전을 먼저 끝내세요.' : '도전을 시작할 수 없습니다.', '⚔', 'red'); return; }
          sfx.prestige(); flash(); toast('<b>' + esc(c.name) + '</b> 시작!', '⚔', 'red'); switchTab('home'); save();
        }
      }]
    });
  }
  function quitChallenge() {
    modal({ icon: '↩', title: '도전 포기', body: '<p>이 도전의 진행은 사라지고 원래 우주로 돌아갑니다.</p>', actions: [{ label: '계속하기', cancel: true }, { label: '포기', cls: 'btn-danger', run: () => C.exitChallenge(S, false) }] });
  }

  /* ───────────── 6. 성좌 (성소 · 사도 · 운명) ───────────── */

  const SG = window.CD.saga, SDX = window.CD.sagaData, PX = window.CD.pixel;
  const EMBLEMS = ['🏹', '🎵', '👑', '🐎', '🦢', '🦂', '🐻', '🌌'];
  let selConst = 0, sanct = null, adv = null, bubbleUntil = 0, lastStage = 0, skillEls = [], apEls = null, faceFor = -1;
  const pickEls = [], fateEls = {}, tensionSeen = {};
  const hhmm = t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const FEED_CLS = { fate: 'big', 'fate-fx': 'sys', death: 'bad', fall: 'bad', betray: 'bad', take: 'take', omen: 'omen', 'omen-big': 'omen big', voice: 'omen', pick: 'sys', sponsor: 'sys', save: 'sys', level: 'sys', battle: '' };
  function feedHTML(list) {
    return list.map(f => '<div class="feed-row ' + (FEED_CLS[f.kind] || '') + (f.big && f.kind !== 'omen-big' ? ' big' : '') + '"><time>' + hhmm(f.t) + '</time><span>' + esc(f.text) + '</span></div>').join('') || '<div class="empty-ap">아직 아무 일도 일어나지 않았습니다.</div>';
  }
  function renderFeed(el, list) {
    const last = list[list.length - 1], sig = list.length + ':' + (last ? last.t + last.text : '');
    if (el._sig === sig) return;
    el._sig = sig;
    el.innerHTML = feedHTML(list.slice().reverse());
  }

  function buildStars() {
    const pick = $('#const-pick');
    D.constellations.forEach((c, i) => {
      const b = h('button', 'cpick', '<canvas class="pix" width="24" height="24"></canvas><b>' + esc(c.name) + '</b><small></small><i class="badge"></i>');
      b.addEventListener('click', () => { selConst = i; sfx.click(); hideBubble(); update(Date.now(), true); });
      pick.appendChild(b);
      pickEls.push({ b, cv: b.querySelector('canvas'), small: b.querySelector('small'), badge: b.querySelector('.badge'), awake: null });
    });
    sanct = new PX.Sanctuary($('#sanct-canvas'));
    adv = new PX.Adventure($('#adv-canvas'));
    $('#inv10').addEventListener('click', e => investConst(selConst, S.matter.mul(0.1), e.currentTarget));
    $('#invneed').addEventListener('click', e => { const rem = C.constRemaining(S, selConst); if (rem) investConst(selConst, rem, e.currentTarget); });
    const sk = $('#sanct-skills');
    skillEls = D.skills.map((sd, j) => {
      const row = h('div', 'skill-row', '<div><b></b><small>' + esc(sd.desc) + '</small></div><button class="btn btn-violet sm"><span class="cost">' + GEM_AM + '<span></span></span></button>');
      sk.appendChild(row);
      const r = { name: row.querySelector('b'), btn: row.querySelector('button'), cost: row.querySelector('.cost span') };
      r.btn.addEventListener('click', () => {
        const i = selConst;
        if (C.fundSkill(S, i, j, Date.now())) { sfx.buy(); toast('<b>' + esc(D.constellations[i].name) + '</b> 권능 · ' + esc(sd.name) + ' Lv.' + S.apostles[i].skills[j], '✦', 'violet'); update(Date.now(), true); }
        else { sfx.error(); shake(r.btn); }
      });
      return r;
    });
    const ai = $('#apostle-info');
    ai.innerHTML = '<div class="ap-wrap"><div class="ap-head"><canvas class="pix" width="16" height="20"></canvas><div><div class="ap-name"></div><div class="ap-meta"></div></div></div>' +
      '<div class="bar3"><span>체력</span><span class="rail-bar hp"><span class="rail-bar-in"></span></span><b></b></div>' +
      '<div class="bar3"><span>충성</span><span class="rail-bar loy"><span class="rail-bar-in"></span></span><b></b></div>' +
      '<div class="bar3"><span>타락</span><span class="rail-bar cor"><span class="rail-bar-in"></span></span><b></b></div>' +
      '<div class="bar3"><span>경험</span><span class="rail-bar"><span class="rail-bar-in"></span></span><b></b></div>' +
      '<div class="ap-stats"></div></div><div class="empty-ap hidden"></div>';
    const bars = Array.from(ai.querySelectorAll('.bar3'));
    apEls = {
      wrap: ai.querySelector('.ap-wrap'), empty: ai.querySelector('.empty-ap'), cv: ai.querySelector('canvas'), name: ai.querySelector('.ap-name'), meta: ai.querySelector('.ap-meta'),
      bars: bars.map(b => ({ fill: b.querySelector('.rail-bar-in'), val: b.querySelector('b') })), stats: ai.querySelector('.ap-stats'), drawn: null
    };
    const fl = $('#fate-list');
    SDX.fates.forEach(f => {
      const el = h('div', 'fate', '<div class="fate-ico">' + f.icon + '</div><div class="fate-main"><div class="fate-name">' + esc(f.name) + '<span class="fate-up hidden">▲</span></div><div class="fate-desc">' + esc(f.desc) + '</div>' +
        '<div class="fate-inv">' + (f.involve === 'all' ? '✦ 모든 성좌' : f.involve === 'one' ? '✦ 사도 한 명' : f.involve.map(i => EMBLEMS[i]).join(' ')) + '</div><span class="rail-bar sm"><span class="rail-bar-in"></span></span></div><div class="fate-p"><span></span><small></small></div>');
      fl.appendChild(el);
      fateEls[f.id] = { el, up: el.querySelector('.fate-up'), fill: el.querySelector('.rail-bar-in'), p: el.querySelector('.fate-p span'), note: el.querySelector('.fate-p small'), upUntil: 0 };
    });
  }
  function investConst(i, amount, btn) {
    const res = C.invest(S, i, amount, Date.now());
    if (!res.ok) { sfx.error(); shake(btn); return; }
    sfx.buy();
    const [x, y] = centerOf(btn); burst(x, y, 6, '#ffe1a1');
    update(Date.now(), true);
  }

  function showBubble(text, mood) {
    const b = $('#sanct-bubble');
    b.textContent = text.length > 46 ? text.slice(0, 45) + '…' : text;
    b.classList.remove('hidden');
    bubbleUntil = performance.now() + 3800;
    if (sanct && mood) sanct.react(mood);
  }
  function hideBubble() { $('#sanct-bubble').classList.add('hidden'); bubbleUntil = 0; }

  function drawStage(t) {
    if (!sanct) return;
    const i = selConst, awake = S.constellations[i].apostleFound, ap = SG.apostleOf(S, i);
    sanct.set(i, awake);
    sanct.setVisitor(ap && ap.act && Date.now() - ap.act.t < 20000 && ['chosen', 'sponsor', 'level'].includes(ap.act.kind) ? ap : null);
    sanct.render(t);
    adv.setApostle(ap, PX.GLOW[i]);
    if (!ap) { const g = S.saga.hall.filter(h => h.patron === i).pop(); adv.setGrave(g && g.fate === 'dead' ? g : null); }
    adv.render(t);
    const b = $('#sanct-bubble');
    if (bubbleUntil && t > bubbleUntil) hideBubble();
    else if (bubbleUntil) { const a = sanct.anchor(); b.style.left = Math.min(80, Math.max(20, a.x)) + '%'; b.style.top = Math.max(18, a.y) + '%'; }
  }

  function updateStars(now) {
    const inf = SG.influence(S);
    pickEls.forEach((r, i) => {
      const awake = S.constellations[i].apostleFound;
      if (r.awake !== awake) { r.awake = awake; PX.portrait(r.cv, i, awake); }
      cls(r.b, 'active', i === selConst); cls(r.b, 'sleep', !awake);
      const ap = SG.apostleOf(S, i);
      setText(r.small, awake ? (inf[i] * 100).toFixed(1) + '%' : '잠듦');
      cls(r.badge, 'on', !!(ap && ap.corrupt >= 60));
    });
    const hot = SDX.fates.some(f => SG.fateReady(S, f) && SG.prob(S.saga.tension[f.id]) >= 0.3);
    cls($('[data-subnav="stars"] [data-sub="fate"] .badge'), 'on', hot && subTab.stars !== 'fate');
    if (subTab.stars === 'sanct') updateSanct(now, inf);
    else if (subTab.stars === 'fate') updateFates(inf);
    else updateWorld();
  }

  function updateSanct(now, inf) {
    const i = selConst, c = S.constellations[i], def = D.constellations[i], awake = c.apostleFound, g = S.saga;
    if (faceFor !== i + (awake ? 10 : 0)) { faceFor = i + (awake ? 10 : 0); PX.portrait($('#sanct-face'), i, awake); }
    setText($('#sanct-title'), '성좌 \'' + def.name + '\'');
    setText($('#sanct-sub'), def.title + ' · ' + PX.SANCT[i].name);
    setText($('#sanct-lv'), awake ? 'Lv.' + c.level + ' / 10' : '잠듦');
    setText($('#sanct-name'), PX.SANCT[i].name);
    statRows($('#sanct-stats'), [
      ['영향력', (inf[i] * 100).toFixed(1) + '%', true],
      ['몸값 (후원 비용 배율)', '×' + SG.priceMult(S, i).toFixed(2)],
      ['성력 (성좌의 재화)', fmt(g.power[i])],
      ['명성', Math.round(g.fame[i])],
      ['축복', def.desc + (awake ? ' · 현재 +' + Math.round(C.constBonus(S, i) * 100) + '%' : '')]
    ]);
    const need = C.constNeed(S, i);
    if (!need) {
      setText($('#sanct-prog-a'), '후원 완료'); setText($('#sanct-prog-b'), 'MAX'); width($('#sanct-fill'), 100);
      setDisabled($('#inv10'), true); setDisabled($('#invneed'), true); setText($('#invneed'), '최대 레벨');
    } else {
      const rem = C.constRemaining(S, i);
      setText($('#sanct-prog-a'), awake ? '다음 후원 Lv.' + (c.level + 1) : '성좌 각성까지');
      setText($('#sanct-prog-b'), fmt(c.invested) + ' / ' + fmt(need));
      width($('#sanct-fill'), Math.min(1, c.invested.div(need).toNumber()) * 100);
      setDisabled($('#inv10'), S.matter.isZero());
      setText($('#invneed'), (awake ? '필요량 공물 · ' : '각성시키기 · ') + fmt(rem));
      setDisabled($('#invneed'), !S.matter.gte(rem));
    }
    const powers = S.apostles[i];
    skillEls.forEach((r, j) => {
      setText(r.name, D.skills[j].name + ' Lv.' + powers.skills[j] + (j === 2 && powers.skills[j] > 0 ? ' · ' + Math.round(C.revelationInterval(powers.skills[j]) / 1000) + '초마다' : ''));
      if (!awake) { setText(r.cost, '잠듦'); setDisabled(r.btn, true); }
      else if (powers.skills[j] >= 20) { setText(r.cost, 'MAX'); setDisabled(r.btn, true); }
      else { setText(r.cost, fmt(C.skillCost(S, i, j))); setDisabled(r.btn, !C.canFundSkill(S, i, j)); }
    });
    // 사도
    const ap = SG.apostleOf(S, i);
    cls(apEls.wrap, 'hidden', !ap); cls(apEls.empty, 'hidden', !!ap);
    if (!ap) {
      const lost = g.hall.filter(hh => hh.patron === i).pop();
      setText(apEls.empty, !awake ? '성좌가 잠들어 있습니다. 공물을 바쳐 깨우거나, 운명 사건 중 성좌가 스스로 깨어나기를 기다리세요.' : lost ? '사도 ' + lost.name + '을(를) 잃었습니다. 성좌가 새 사도를 찾고 있습니다…' : '성좌가 세계를 내려다보며 사도를 고르고 있습니다…');
      setText($('#adv-sub'), ''); setText($('#adv-region'), lost && lost.fate === 'dead' ? '무덤' : '—');
    } else {
      const cl = SDX.classes[ap.cls], tr = SDX.traits[ap.trait];
      if (apEls.drawn !== ap.id + ':' + Math.floor(ap.corrupt / 20)) { apEls.drawn = ap.id + ':' + Math.floor(ap.corrupt / 20); PX.personPortrait(apEls.cv, ap); }
      setHTML(apEls.name, esc(ap.name) + (ap.title ? '<small>「' + esc(ap.title) + '」</small>' : ''));
      setText(apEls.meta, tr.name + ' ' + cl.name + ' · ' + ap.origin + ' · Lv.' + ap.lvl);
      const vals = [[ap.hp / ap.maxHp, Math.max(0, Math.round(ap.hp)) + '/' + Math.round(ap.maxHp)], [ap.loyal / 100, Math.round(ap.loyal)], [Math.min(1, ap.corrupt / 100), Math.round(Math.min(100, ap.corrupt))], [ap.xp / SG.xpNeed(ap.lvl), Math.floor(ap.xp / SG.xpNeed(ap.lvl) * 100) + '%']];
      apEls.bars.forEach((b, k) => { width(b.fill, vals[k][0] * 100); setText(b.val, vals[k][1]); });
      setHTML(apEls.stats, [['공격', ap.atk], ['방어', ap.def], ['행운', ap.luck], ['공적', ap.deeds]].map(([k, v]) => '<div>' + Math.round(v) + '<small>' + k + '</small></div>').join(''));
      setText($('#adv-sub'), '생산 +' + Math.round(ap.lvl * 2) + '%');
      const region = ap.act && ap.act.region !== undefined ? SDX.regions[ap.act.region].name : '여정';
      setText($('#adv-region'), region);
    }
    setText($('#feed-label'), D.constellations[i].name);
    renderFeed($('#sanct-feed'), g.feed.filter(f => f.c === i).slice(-30));
  }

  function fmtP(p) { return p < 0.001 ? (p * 100).toFixed(2) + '%' : p < 0.1 ? (p * 100).toFixed(2) + '%' : (p * 100).toFixed(1) + '%'; }
  function updateFates(inf) {
    const g = S.saga, nowP = performance.now();
    const order = SDX.fates.slice().sort((a, b) => (SG.fateReady(S, b) - SG.fateReady(S, a)) || (g.tension[b.id] - g.tension[a.id]));
    const fl = $('#fate-list');
    order.forEach((f, k) => {
      const r = fateEls[f.id], t = g.tension[f.id], p = SG.prob(t), ready = SG.fateReady(S, f);
      if (fl.children[k] !== r.el) fl.insertBefore(r.el, fl.children[k] || null);
      if (tensionSeen[f.id] !== undefined && t > tensionSeen[f.id] + 0.5) r.upUntil = nowP + 4000;
      tensionSeen[f.id] = t;
      cls(r.up, 'hidden', nowP > r.upUntil);
      cls(r.el, 'off', !ready); cls(r.el, 'hot', ready && p >= 0.3); cls(r.el, 'warm', ready && p >= 0.05 && p < 0.3);
      width(r.fill, p / 0.7 * 100);
      setText(r.p, fmtP(p));
      setText(r.note, !ready ? '조건 미충족' : g.stats.seen[f.id] ? g.stats.seen[f.id] + '회 발생' : '긴장도 ' + Math.round(t));
    });
    const il = $('#influence-list');
    if (!il._built) { il._built = true; il.innerHTML = D.constellations.map(c => '<div class="infl"><span>' + esc(c.name) + '</span><span class="rail-bar gold"><span class="rail-bar-in"></span></span><b></b></div>').join(''); }
    Array.from(il.children).forEach((row, i) => { width(row.querySelector('.rail-bar-in'), inf[i] / Math.max(...inf) * 100); setText(row.querySelector('b'), (inf[i] * 100).toFixed(1) + '% · ×' + SG.priceMult(S, i).toFixed(2)); });
    renderFeed($('#global-feed'), g.feed.slice(-40));
  }

  const HALL_TAG = { dead: ['사망', 'dead'], fallen: ['타락', 'fallen'], sealed: ['봉인', 'fallen'], destroyed: ['소멸', 'fallen'], vanished: ['실종', ''] };
  function personRow(p, tag, tagCls) {
    const cl = SDX.classes[p.cls], tr = SDX.traits[p.trait];
    return '<div class="person"><canvas class="pix" width="16" height="20" data-look="' + p.look + '" data-cls="' + p.cls + '" data-st="' + (tagCls === 'fallen' ? 'fallen' : 'free') + '"></canvas><div><b>' + esc(p.name) + '</b> <small>Lv.' + p.lvl + ' · ' + tr.name + ' ' + cl.name + (p.origin ? ' · ' + esc(p.origin) : '') + (p.title ? ' · 「' + esc(p.title) + '」' : '') + '</small></div><span class="tag ' + (tagCls || '') + '">' + tag + '</span></div>';
  }
  function paintPeople(el) { el.querySelectorAll('canvas[data-look]').forEach(cv => PX.personPortrait(cv, { look: Number(cv.dataset.look), cls: Number(cv.dataset.cls), corrupt: 0, status: cv.dataset.st })); }
  function updateWorld() {
    const g = S.saga;
    const set = (el, list, render) => {
      const sig = list.map(p => (p.id || p.name) + ':' + p.lvl).join(',');
      if (el._sig === sig) return;
      el._sig = sig;
      el.innerHTML = list.length ? list.map(render).join('') : '<div class="empty-ap">없음</div>';
      paintPeople(el);
    };
    set($('#free-list'), SG.free(S).slice().sort((a, b) => b.lvl - a.lvl), p => personRow(p, p.title ? '영웅' : '후보', p.title ? 'hero' : ''));
    set($('#fallen-list'), SG.fallen(S), p => personRow(p, '타락', 'fallen'));
    set($('#hall-list'), g.hall.slice().reverse(), hh => personRow(hh, (HALL_TAG[hh.fate] || ['기록', ''])[0] + (hh.patron >= 0 ? ' · ' + D.constellations[hh.patron].name : ''), (HALL_TAG[hh.fate] || ['', ''])[1]));
    statRows($('#saga-stats'), [
      ['운명 사건', fmtInt(g.stats.fates) + '회'], ['전조', fmtInt(g.stats.omens) + '회'], ['사도의 죽음', fmtInt(g.stats.deaths)], ['배신', fmtInt(g.stats.betrayals)],
      ['타락', fmtInt(g.stats.falls)], ['성좌들이 가져간 반물질', fmt(g.stats.taken), true]
    ]);
  }

  function onSaga(p) {
    if (p.kind === 'fateDone') return onFateDone(p);
    if (!started) return;
    if (p.c === selConst && tab === 'stars' && subTab.stars === 'sanct' && p.text && !['battle', 'take'].includes(p.kind)) {
      showBubble(p.kind === 'voice' ? p.text.replace(/^성좌 '[^']+'(이|가)\s*/, '') : p.text, ['death', 'fall', 'betray'].includes(p.kind) ? 'angry' : ['pick', 'level', 'sponsor', 'save'].includes(p.kind) ? 'cheer' : null);
    }
    const icon = { death: '🪦', fall: '😈', betray: '🗡', pick: '✨' }[p.kind];
    if (icon) { toast(esc(p.text), icon, p.kind === 'pick' ? 'gold' : 'red'); if (p.kind !== 'pick') sfx.error(); else sfx.achieve(); }
    else if (p.kind === 'omen-big') toast('<b>큰 전조</b> · ' + esc(p.text), '🔮', 'violet');
  }
  function onFateDone(o) {
    if (!started) return;
    const f = SDX.fates.find(x => x.id === o.id), story = (S.saga.feed.filter(e => e.kind === 'fate').pop() || {}).text || '';
    sfx.crunch(); flash(); buzz(60);
    const takenTxt = o.taken && !o.taken.isZero() ? '반물질 −' + fmt(o.taken) + ' (' + Math.round(o.frac * 100) + '%)' : '빼앗긴 반물질 없음';
    if (tab === 'stars') {
      modal({
        icon: f.icon, title: '운명 사건 · ' + f.name,
        body: '<p>' + esc(story.replace(/^【운명 사건】 [^—]+— /, '')) + '</p>' +
          '<div class="modal-box"><h4>엮인 성좌</h4>' + o.inv.map(i => EMBLEMS[i] + ' ' + esc(D.constellations[i].name)).join(' · ') + '<br><b style="color:#ffb27a">' + takenTxt + '</b></div>' +
          (o.lines.length ? '<div class="modal-box"><h4>결과</h4>' + o.lines.map(esc).join('<br>') + '</div>' : ''),
        actions: [{ label: '확인', cls: 'btn-gold' }]
      });
    } else toast('<b>운명 사건! ' + esc(f.name) + '</b> · ' + takenTxt, f.icon, 'red');
    save();
  }

  /* ───────────── 7. 업적 · 통계 ───────────── */

  const ACH_CATS = [
    { id: 'all', name: '전체' },
    { id: 'dim', name: '차원', icon: 'ach3', list: [0, 1, 5, 6, 7, 8, 9, 22, 34] },
    { id: 'reset', name: '리셋', icon: 'ach4', list: [2, 3, 10, 11, 12, 13] },
    { id: 'matter', name: '반물질', icon: 'ach1', list: [14, 15, 16, 17] },
    { id: 'inf', name: '무한', icon: 'ach2', list: [4, 18, 19, 20, 21, 23, 30, 31, 32, 35] },
    { id: 'etc', name: '수집', icon: 'ach1', list: [24, 25, 26, 27, 28, 29, 33] },
    { id: 'secret', name: '비밀', icon: 'ach2' }
  ];
  const catOf = i => ACH_CATS.find(c => c.list && c.list.includes(i)) || ACH_CATS[5];
  function achRatio(a) {
    if (!a.prog) return a.check(S) ? 1 : 0;
    const p = a.prog(S);
    return Math.min(1, p.cur instanceof BigNum ? Math.max(0, p.cur.log10()) / C.big(p.max).log10() : p.cur / p.max);
  }
  const achEls = [];
  function buildRecords() {
    const filter = $('#ach-filter');
    ACH_CATS.forEach(c => {
      const b = h('button', c.id === achFilter ? 'active' : '', c.name);
      b.addEventListener('click', () => { achFilter = c.id; sfx.click(); filter.querySelectorAll('button').forEach(x => cls(x, 'active', x === b)); update(Date.now(), true); });
      filter.appendChild(b);
    });
    const list = $('#ach-list');
    const make = (def, key, secret, cat) => {
      const el = h('div', 'ach-item', '<div class="ach-ico"><img src="img/ui/' + cat.icon + '.webp" alt="" style="width:36px;height:36px;border-radius:50%"></div><div class="ach-main"><div class="ach-name"></div><div class="ach-desc"></div><span class="rail-bar sm gold"><span class="rail-bar-in"></span></span></div><span class="pill"></span>');
      list.appendChild(el);
      achEls.push({ el, key, def, secret, cat: cat.id, name: el.querySelector('.ach-name'), desc: el.querySelector('.ach-desc'), fill: el.querySelector('.rail-bar-in'), pill: el.querySelector('.pill') });
    };
    C.ACH.forEach((a, i) => make(a, 'n' + i, false, catOf(i)));
    C.SECRET.forEach((a, i) => make(a, 's' + i, true, ACH_CATS[6]));
    setText($('#ach-total'), C.ACH.length + C.SECRET.length);
  }
  function updateRecords() {
    setText($('#ach-count'), C.achCount(S));
    setText($('#ach-bonus'), '×' + C.achBonus(S).toFixed(2));
    if (subTab.records === 'ach') {
      achEls.forEach(r => {
        const idx = Number(r.key.slice(1));
        const on = r.secret ? S.secretAch[idx] : S.achievements[idx];
        r.el.classList.toggle('hidden', achFilter !== 'all' && achFilter !== r.cat);
        cls(r.el, 'done', on); cls(r.el, 'new', newAch.has(r.key));
        const hide = r.secret && !on;
        setText(r.name, hide ? '???' : r.def.name);
        setText(r.desc, hide ? '조건을 찾아보세요' : r.def.desc);
        const ratio = on ? 1 : hide ? 0 : achRatio(r.def);
        width(r.fill, ratio * 100);
        setText(r.pill, on ? '완료' : hide ? '???' : Math.floor(ratio * 100) + '%');
        const pc = 'pill ' + (on ? 'done' : hide ? 'lock' : 'prog');
        if (r.pill.className !== pc) r.pill.className = pc;
      });
      return;
    }
    const st = S.stats;
    const rows = [
      ['총 플레이 시간', fmtTime(st.playSeconds)], ['누적 반물질', fmt(st.totalMatter)], ['차원 구매', fmtInt(st.totalPurchases)], ['빅 크런치', fmtInt(S.infinities)],
      ['누적 IP', fmtInt(st.totalIp)], ['블랙홀 터치', fmtInt(st.taps)], ['최대 콤보', fmtInt(st.maxCombo)], ['혜성 포착', fmtInt(st.comets) + (st.goldenComets ? ' (황금 ' + st.goldenComets + ')' : '')],
      ['차원 교체 / 부스트', S.shifts + ' / ' + S.boosts], ['반물질 은하', fmtInt(S.galaxies)], ['차원 희생', fmtInt(st.sacrifices) + '회 · ×' + fmtX(C.sacMult(S))], ['생산 가속', '×' + fmt(C.speed(S, Date.now()))],
      ['최장 오프라인', fmtTime(st.longestOffline)], ['오프라인 효율', '×' + C.offlineMult(S).toFixed(2)], ['도전 정복', S.challenges.filter(Boolean).length + ' / ' + D.challenges.length], ['마스터리 합계', S.mastery.reduce((a, m) => a + m.level, 0)]
    ];
    const sg = $('#stats-grid');
    if (!sg._built) { sg._built = true; sg.innerHTML = rows.map(() => '<div class="stat"><div class="stat-label"></div><div class="stat-value"></div></div>').join(''); }
    Array.from(sg.children).forEach((c, k) => { setText(c.firstChild, rows[k][0]); setText(c.lastChild, rows[k][1]); });
    const hist = st.history, hl = $('#history-list'), sig = hist.length + ':' + hist[hist.length - 1];
    if (hl._sig !== sig) {
      hl._sig = sig;
      hl.innerHTML = hist.slice(-12).reverse().map((t, k) => '<div class="history-row"><span>' + esc(t) + '</span><span>#' + (hist.length - k) + '</span></div>').join('') || '<div class="history-row"><span>기록 없음</span><span>—</span></div>';
    }
  }

  /* ───────────── HUD · 효과 칩 · 배지 · 탭 ───────────── */

  const effectsEl = $('#effects');
  function updateEffects(now) {
    const chips = [];
    if (C.buffActive(S, now)) chips.push({ k: 'buff', cls: 'buff', label: '⚡ 과충전 ×' + C.buffPower(S).toFixed(1), t: S.buff.endsAt - now });
    if (C.cometBoostActive(S, now)) chips.push({ k: 'comet', cls: 'comet', label: '☄ 혜성 가호 ×3', t: S.comet.boostEndsAt - now });
    if (S.event.id && now < S.event.endsAt) { const ev = C.eventDef(S.event.id); chips.push({ k: 'ev-' + ev.id, cls: 'event', label: ev.icon + ' ' + ev.name + ' · ' + ev.desc, t: S.event.endsAt - now }); }
    if (S.activeChallenge >= 0) chips.push({ k: 'ch' + S.activeChallenge, cls: 'chall', label: '⚔ ' + D.challenges[S.activeChallenge].name, pct: Math.max(0, S.matter.log10()) / C.challengeGoal(S.activeChallenge).log10() * 100, quit: true });
    const sig = chips.map(c => c.k).join('|');
    if (effectsEl._sig !== sig) {
      effectsEl._sig = sig;
      effectsEl.innerHTML = '';
      chips.forEach(c => {
        const el = h('div', 'fx-chip ' + c.cls, '<span>' + esc(c.label) + '</span><b></b>' + (c.quit ? '<button>포기</button>' : ''));
        if (c.quit) el.querySelector('button').onclick = quitChallenge;
        effectsEl.appendChild(el);
      });
    }
    chips.forEach((c, k) => { const b = effectsEl.children[k] && effectsEl.children[k].querySelector('b'); if (b) setText(b, c.pct !== undefined ? Math.min(100, c.pct).toFixed(0) + '%' : clock(c.t)); });
  }

  const TAB_LOCKS = {
    research: { need: 1e4, text: '반물질 1만 누적 시 해금' },
    galaxy: { need: 1e30, text: '반물질 1e30 누적 시 해금' },
    stars: { need: 1e7, text: '반물질 1천만 누적 시 해금' },
    infinity: { need: 1e50, text: '반물질 1e50 누적 또는 첫 빅 크런치 시 해금' }
  };
  const TAB_NAMES = { research: '차원 연구', galaxy: '은하 관리', stars: '성좌 후원', infinity: '무한 영역' };
  function tabUnlocked(name) {
    const l = TAB_LOCKS[name];
    return !l || S.infinities > 0 || S.galaxies > 0 || S.stats.totalMatter.gte(l.need);
  }
  function updateNav() {
    const badges = {
      home: tab !== 'home' && (C.canShift(S) || C.canBoost(S) || C.canCrunch(S)),
      galaxy: C.canGalaxy(S),
      stars: SDX.fates.some(f => SG.fateReady(S, f) && SG.prob(S.saga.tension[f.id]) >= 0.3) || S.constellations.some((c, i) => !c.apostleFound && S.matter.gte(C.constRemaining(S, i) || C.INF)),
      research: D.research.some((_, i) => C.canResearch(S, i)),
      infinity: D.upgrades.some((_, i) => C.canUpgrade(S, i)),
      records: newAch.size
    };
    $$('.rail-btn').forEach(b => {
      const name = b.dataset.tab, open = tabUnlocked(name);
      if (unlockedTabs[name] === false && open && started) { toast('새 기능 해금 · <b>' + TAB_NAMES[name] + '</b>', '🔓', 'gold'); sfx.achieve(); }
      unlockedTabs[name] = open;
      cls(b, 'locked', !open);
      const badge = b.querySelector('.badge'), v = badges[name];
      cls(badge, 'on', !!v);
      if (typeof v === 'number' && v > 0) badge.dataset.n = v > 99 ? '99+' : v; else delete badge.dataset.n;
    });
  }
  function updateHud(prod) {
    setText($('#hud-am'), fmt(S.matter));
    setText($('#hud-rate'), S.matter.gte(C.INF) ? '∞ 도달' : '+' + fmt(prod) + '/초');
    setText($('#hud-ip'), fmtInt(S.ip));
    setText($('#hud-ach'), C.achCount(S) + ' / ' + (C.ACH.length + C.SECRET.length));
  }

  function switchTab(name) {
    if (!tabUnlocked(name)) { sfx.error(); toast(TAB_LOCKS[name].text, '🔒'); return; }
    if (tab === 'records' && name !== 'records') newAch.clear();
    tab = name;
    $$('.rail-btn').forEach(b => cls(b, 'active', b.dataset.tab === name));
    $$('.pane').forEach(p => cls(p, 'active', p.id === 'pane-' + name));
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    update(Date.now(), true);
  }

  /* ───────────── 갱신 루프 ───────────── */

  function update(now, force) {
    const mults = C.dimMults(S, now), sp = C.speed(S, now), prod = S.dims[0].amount.mul(mults[0]).mul(sp);
    updateHud(prod);
    updateEffects(now);
    const slow = force || now - lastSlowUi > 400;
    if (slow) { lastSlowUi = now; updateNav(); }
    if (tab === 'home') updateHome(now, mults, sp, prod);
    else if (tab === 'dims') updateDims(now, mults, sp);
    else if (slow) {
      if (tab === 'galaxy') updateGalaxy();
      else if (tab === 'research') updateResearch();
      else if (tab === 'infinity') updateInfinity();
      else if (tab === 'stars') updateStars(now);
      else if (tab === 'records') updateRecords();
      else if (tab === 'settings') updateSettings();
    }
  }
  function resetViewCaches() {
    [$('#history-list'), $('#gx-grid'), effectsEl].forEach(el => { el._sig = null; });
    [$('#sanct-feed'), $('#global-feed'), $('#free-list'), $('#fallen-list'), $('#hall-list')].forEach(el => { el._sig = null; });
    pickEls.forEach(r => { r.awake = null; }); faceFor = -1; if (apEls) apEls.drawn = null;
    challEls.forEach(r => { r.state = ''; });
    gxIndex = -1;
  }
  function updateAll() { update(Date.now(), true); }

  function applyAway(seconds, showModal) {
    if (seconds < 1) return;
    const r = C.offline(S, seconds, Date.now());
    if (seconds >= 60 && showModal) {
      modal({
        icon: '🌙', title: '다시 오신 것을 환영합니다',
        body: '<p>자리를 비운 <b>' + fmtTime(seconds) + '</b> 동안 차원들이 쉬지 않고 일했습니다.</p><div class="modal-big">' + GEM_AM + '+' + fmt(r.gain) + '</div><p>반물질 획득</p>' +
          '<div class="modal-box">오프라인 효율 ×' + C.offlineMult(S).toFixed(2) + (r.capped ? ' · 최대 24시간까지 적용' : '') + '</div>' + sagaAwayHTML(r.saga),
        actions: [{ label: '수령하기', cls: 'btn-gold', run: () => { sfx.achieve(); const [x, y] = centerOf(coreBtn); burst(x, y, 18); } }]
      });
    } else if (seconds >= 10 && !r.gain.isZero()) toast('자리를 비운 동안 +' + fmt(r.gain) + ' 반물질', '🌙');
  }

  function sagaAwayHTML(g) {
    if (!g || !(g.fates || g.deaths || g.falls || g.betrayals || g.highlights.length)) return '';
    return '<div class="modal-box"><h4>그동안 성좌들 사이에서는…</h4>운명 사건 ' + g.fates + '회 · 사도의 죽음 ' + g.deaths + ' · 배신 ' + g.betrayals + ' · 타락 ' + g.falls +
      (g.highlights.length ? '<br><br>' + g.highlights.map(t => '· ' + esc(t)).join('<br>') : '') + '</div>';
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!started) return;
    let dt = (t - lastFrame) / 1000;
    lastFrame = t;
    if (document.hidden) return; // 백그라운드 시간은 visibilitychange에서 한 번만 정산한다
    if (!(dt > 0)) return;
    const now = Date.now();
    if (dt > 2) applyAway(dt, false);
    else while (dt > 0) { const step = Math.min(dt, 0.1); C.tick(S, step, now); dt -= step; }
    if (now >= nextCometAt) {
      if (!modalOpen) spawnComet();
      nextCometAt = now + (40 + Math.random() * 60) * 1000;
    }
    if (t - lastUi >= 100) { lastUi = t; update(now); }
    if (tab === 'galaxy' && t - gxAnim > (settings.quality === 'ultra' ? 16 : 40)) { gxAnim = t; drawGalaxyStage(t); }
    if (tab === 'stars' && subTab.stars === 'sanct' && t - lastStage > (settings.quality === 'low' ? 100 : 40)) { lastStage = t; drawStage(t); }
    if (now - lastSave > 10000) save();
    if (now - lastDailyCheck > 60000) { lastDailyCheck = now; checkDaily(); }
  }

  /* ───────────── 혜성 ───────────── */

  function spawnComet() {
    const layer = $('#comet-layer');
    if (!layer.animate || layer.childElementCount) return;
    const kind = C.rollComet();
    const el = h('button', 'comet' + (kind === 'golden' ? ' golden' : ''), '<span>' + (kind === 'golden' ? '🌟' : '✦') + '</span>');
    el.setAttribute('aria-label', '혜성 잡기');
    const W = innerWidth, H = innerHeight, ltr = Math.random() < 0.5;
    const y0 = H * (0.2 + Math.random() * 0.4), y1 = Math.min(H * 0.85, Math.max(H * 0.15, y0 + H * (Math.random() * 0.3 - 0.15)));
    const x0 = ltr ? -70 : W + 70, x1 = ltr ? W + 70 : -70;
    el.style.setProperty('--tail', (Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI) + 'deg');
    layer.appendChild(el);
    const anim = el.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px)' }, { transform: 'translate(' + x1 + 'px,' + y1 + 'px)' }], { duration: 9000 + Math.random() * 3000, easing: 'linear' });
    anim.onfinish = () => el.remove();
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      anim.cancel(); el.remove();
      catchComet(kind, e.clientX, e.clientY);
    }, { once: true });
  }
  function catchComet(kind, x, y) {
    const r = C.claimComet(S, kind, Date.now());
    sfx.comet(); buzz(25);
    burst(x, y, kind === 'golden' ? 24 : 14, kind === 'golden' ? '#ffe1a1' : '#b0ecff');
    if (kind === 'boost') { floatText(x, y, '×3!'); toast('<b>혜성 가호!</b> 30초간 반물질 획득 ×3', '☄', 'violet'); }
    else { floatText(x, y, '+' + fmt(r.gain)); toast((kind === 'golden' ? '<b>황금 혜성!</b> ' : '혜성 포착! ') + '+' + fmt(r.gain) + ' 반물질', kind === 'golden' ? '🌟' : '☄', kind === 'golden' ? 'gold' : ''); }
    C.checkAchievements(S);
  }

  /* ───────────── 일일 보상 ───────────── */

  const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function checkDaily() {
    const now = new Date(), today = dayKey(now), yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const info = C.dailyInfo(S, today, yesterday);
    if (!info.claimable || dailyPending) return;
    dailyPending = true;
    const reward = C.dailyReward(S, info.day, Date.now());
    const days = D.daily.map((d, k) => '<div class="daily-day ' + (k + 1 < info.day ? 'done' : k + 1 === info.day ? 'today' : '') + '">' + (k + 1 < info.day ? '<span>✓</span>' : d.ip ? GEM_IP : GEM_AM) + (k + 1) + '일</div>').join('');
    modal({
      iconImg: 'img/ui/icon-gift.webp', title: info.day + '일차 접속 보상',
      body: '<p>매일 접속하면 보상이 커집니다. 7일째에는 인피니티 포인트를 드립니다!</p><div class="daily-grid">' + days + '</div><div class="modal-big">' + GEM_AM + '+' + fmt(reward.matter) + '</div><p>반물질 (생산량 ' + reward.minutes + '분어치)' + (reward.ip ? ' + <b>' + reward.ip + ' IP</b>' : '') + '</p>',
      cancellable: false,
      actions: [{
        label: '보상 받기', cls: 'btn-gold', run: () => {
          dailyPending = false;
          const r = C.claimDaily(S, today, yesterday, Date.now());
          if (!r) return;
          sfx.achieve(); flash();
          toast(r.day + '일차 보상 · +' + fmt(r.matter) + ' 반물질' + (r.ip ? ' · +' + r.ip + ' IP' : ''), '🎁', 'gold');
          C.checkAchievements(S); save();
        }
      }]
    });
  }

  /* ───────────── 8. 설정 ───────────── */

  let starfield = null;
  function applyQuality() {
    ['low', 'mid', 'high', 'ultra'].forEach(q => cls(document.body, 'q-' + q, settings.quality === q));
    if (starfield) starfield.resize();
  }
  function updateSettings() {
    $$('[data-setting]').forEach(b => { cls(b, 'on', settings[b.dataset.setting]); b.setAttribute('aria-checked', !!settings[b.dataset.setting]); });
    $$('[data-notation]').forEach(b => cls(b, 'active', b.dataset.notation === settings.notation));
    $$('[data-quality]').forEach(b => cls(b, 'active', b.dataset.quality === settings.quality));
    setText($('#save-note'), lastSave ? '마지막 저장: ' + new Date(lastSave).toLocaleTimeString('ko-KR') : '마지막 저장: —');
  }
  function copyText(text) {
    const fallback = () => {
      modal({
        icon: '📋', title: '세이브 코드', body: '<p>아래 코드를 길게 눌러 전체 선택 후 복사해 두세요.</p><textarea readonly id="save-code"></textarea>',
        onOpen: body => { const ta = body.querySelector('textarea'); ta.value = text; ta.focus(); ta.select(); },
        actions: [{ label: '닫기', cls: 'btn-gold', cancel: true }]
      });
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast('세이브 코드를 클립보드에 복사했습니다.', '📋', 'green'), fallback);
    else fallback();
  }
  function openImport() {
    modal({
      icon: '📂', title: '세이브 불러오기',
      body: '<p>복사해 둔 세이브 코드를 붙여넣거나 세이브 파일(.json)을 선택하세요. 현재 진행은 덮어써집니다.</p><textarea id="import-code" placeholder="CD2:… 또는 { … }"></textarea><input type="file" id="import-file" accept="application/json,.json,.txt" hidden>',
      actions: [
        { label: '취소', cancel: true },
        { label: '파일 선택', cls: 'btn-cyan', keep: true, run: () => $('#import-file').click() },
        {
          label: '불러오기', cls: 'btn-gold', keep: true, run: () => {
            try { const raw = decodeSave($('#import-code').value); closeModal(); applyImported(raw); }
            catch (e) { sfx.error(); toast('올바른 세이브 코드가 아닙니다.', '⚠', 'red'); }
          }
        }
      ],
      onOpen: body => {
        body.querySelector('#import-file').onchange = e => {
          const f = e.target.files[0];
          if (!f) return;
          f.text().then(t => { body.querySelector('#import-code').value = t; }).catch(() => toast('파일을 읽을 수 없습니다.', '⚠', 'red'));
        };
      }
    });
  }
  function bindSettings() {
    $$('[data-setting]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.setting; settings[k] = !settings[k]; saveSettings(); sfx.click(); updateSettings(); }));
    $$('[data-notation]').forEach(b => b.addEventListener('click', () => { settings.notation = b.dataset.notation; saveSettings(); sfx.click(); updateAll(); }));
    $$('[data-quality]').forEach(b => b.addEventListener('click', () => { settings.quality = b.dataset.quality; saveSettings(); applyQuality(); sfx.click(); updateSettings(); }));
    $('#save-now').onclick = () => { save(); sfx.click(); toast('저장했습니다.', '💾', 'green'); updateSettings(); };
    $('#export-save').onclick = () => copyText(encodeSave());
    $('#import-save').onclick = openImport;
    $('#download-save').onclick = () => {
      const blob = new Blob([C.serialize(S, Date.now())], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cosmic-dimensions-' + dayKey(new Date()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('세이브 파일을 내려받았습니다. (앱에서는 \'세이브 코드 복사\'를 이용하세요)', '💾');
    };
    $('#reset-save').onclick = () => modal({
      icon: '⚠', title: '진행 초기화', body: '<p>모든 진행(업적·성좌·인피니티 포함)이 삭제되며 되돌릴 수 없습니다. 필요하면 먼저 세이브 코드를 복사해 두세요.</p>',
      actions: [{ label: '취소', cancel: true }, {
        label: '초기화', cls: 'btn-danger', run: () => {
          S = C.fresh(Date.now()); newAch.clear(); resetViewCaches(); save();
          toast('새 우주가 시작되었습니다.', '🌱'); switchTab('home');
        }
      }]
    });
  }

  /* ───────────── 별 배경 ───────────── */

  function setupStarfield() {
    const c = $('#starfield'), x = c.getContext('2d');
    if (!x || reducedMotion) return;
    let w = 0, ht = 0, stars = [], last = 0;
    function resize() {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      w = innerWidth; ht = innerHeight;
      c.width = w * d; c.height = ht * d;
      x.setTransform(d, 0, 0, d, 0, 0);
      const k = { low: 0, mid: 0.5, high: 1, ultra: 1.7 }[settings.quality] ?? 1;
      stars = Array.from({ length: Math.floor(Math.min(140, w * ht / 7000) * k) }, () => ({ x: Math.random() * w, y: Math.random() * ht, r: Math.random() * 1.2 + 0.2, a: Math.random() * 0.6 + 0.1, s: Math.random() * 0.25 + 0.05, tw: Math.random() * 6, hue: Math.random() < 0.3 ? '220,190,255' : '170,225,255' }));
      x.clearRect(0, 0, w, ht);
    }
    function draw(t) {
      requestAnimationFrame(draw);
      if (document.hidden || !stars.length || t - last < 33) return;
      const k = Math.min(4, (t - last) / 16.7);
      last = t;
      const boost = started ? 1 + Math.min(6, Math.max(0, C.speed(S, Date.now()).log10()) / 4) : 1;
      x.clearRect(0, 0, w, ht);
      for (const s of stars) {
        s.y += s.s * k * boost;
        if (s.y > ht) { s.y = 0; s.x = Math.random() * w; }
        x.fillStyle = 'rgba(' + s.hue + ',' + (s.a * (0.7 + 0.3 * Math.sin(t / 900 + s.tw))).toFixed(3) + ')';
        x.beginPath(); x.arc(s.x, s.y, s.r, 0, Math.PI * 2); x.fill();
      }
    }
    addEventListener('resize', resize, { passive: true });
    resize();
    requestAnimationFrame(draw);
    starfield = { resize };
  }

  /* ───────────── 입력 바인딩 ───────────── */

  function setBuyMode(mode) {
    buyMode = mode === 'max' ? 'max' : Number(mode);
    $$('.buy-mode .seg-btn').forEach(x => cls(x, 'active', x.dataset.mode === String(mode)));
    update(Date.now(), true);
  }
  function bindUi() {
    $$('.rail-btn').forEach(b => b.addEventListener('click', () => { sfx.click(); switchTab(b.dataset.tab); }));
    $$('.buy-mode .seg-btn').forEach(b => b.addEventListener('click', () => { sfx.click(); setBuyMode(b.dataset.mode); }));
    $$('[data-subnav]').forEach(nav => {
      const pane = nav.closest('.pane'), key = nav.dataset.subnav;
      nav.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
        subTab[key] = b.dataset.sub;
        nav.querySelectorAll('.seg-btn').forEach(x => cls(x, 'active', x === b));
        pane.querySelectorAll('.sub-pane').forEach(p => cls(p, 'active', p.dataset.subpane === b.dataset.sub));
        sfx.click(); update(Date.now(), true);
      }));
    });
    $('#max-all').addEventListener('click', e => {
      const r = C.buyMaxAll(S);
      if (!r.dims && !r.ticks) { sfx.error(); shake(e.currentTarget); toast('지금 구매할 수 있는 항목이 없습니다.', '💠'); return; }
      sfx.buy(); buzz(8);
      const [x, y] = centerOf(e.currentTarget);
      floatText(x, y - 18, '+' + r.dims + (r.ticks ? ' · ⏱' + r.ticks : ''), 'green');
      C.checkAchievements(S); update(Date.now(), true);
    });
    $('#buff-btn').addEventListener('click', e => {
      const r = C.activateBuff(S, Date.now());
      if (!r.ok) { sfx.error(); return; }
      sfx.prestige(); buzz(30);
      const [x, y] = centerOf(e.currentTarget); burst(x, y, 16, '#ff9a3d');
      toast('<b>과충전!</b> ' + r.seconds + '초간 생산 ×' + r.power.toFixed(1), '⚡', 'gold');
      C.checkAchievements(S); update(Date.now(), true);
    });
    $('#home-tick').addEventListener('click', e => buyTickBtn(e.currentTarget));
    $('#home-sac').addEventListener('click', e => doSacrifice(e.currentTarget));
    $('#crunch-banner').addEventListener('click', confirmCrunch);
    $('#goal-card').addEventListener('click', () => switchTab('records'));
    $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) cancelModal(); });
    $('#modal-x').addEventListener('click', cancelModal);
    addEventListener('keydown', e => {
      if (!started) return;
      if (modalOpen) { if (e.key === 'Escape') cancelModal(); return; }
      if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-8]$/.test(e.key)) buyDim(Number(e.key) - 1, stripEls[Number(e.key) - 1].b);
      else if (e.key === 'm' || e.key === 'M') $('#max-all').click();
      else if (e.key === 't' || e.key === 'T') buyTickBtn($('#home-tick'));
      else if (e.key === 's' || e.key === 'S') doSacrifice($('#home-sac'));
      else if (e.key === 'b' || e.key === 'B') $('#buff-btn').click();
      else if (e.key === ' ' && tab === 'home' && e.target === document.body) { e.preventDefault(); const [x, y] = centerOf(coreBtn); doTap(x, y); }
    });
    document.addEventListener('visibilitychange', () => {
      if (!started) return;
      if (document.hidden) { hiddenAt = Date.now(); save(); }
      else {
        if (hiddenAt) applyAway((Date.now() - hiddenAt) / 1000, true);
        hiddenAt = 0;
        lastFrame = performance.now();
        checkDaily();
      }
    });
    addEventListener('pagehide', save);
    bindSettings();
  }

  /* ───────────── 시작 ───────────── */

  function boot() {
    C.setListener(onCoreEvent);
    const loaded = load();
    if (loaded) {
      S = loaded.s; loadedSavedAt = loaded.savedAt; isNewGame = false;
      setText($('#splash-hint'), (loaded.fromBackup ? '백업에서 복구한 ' : '저장된 ') + '우주 발견 · 빅 크런치 ' + S.infinities + '회 · 반물질 ' + fmt(S.matter));
    } else setText($('#splash-hint'), '새로운 우주가 당신을 기다립니다');
    buildStrip(); buildPrestige(); buildDims(); buildGalaxy(); buildResearch(); buildInfinity(); buildStars(); buildRecords();
    bindUi();
    Object.keys(TAB_LOCKS).forEach(k => { unlockedTabs[k] = tabUnlocked(k); });
    applyQuality();
    setupStarfield();
    updateSettings();
    update(Date.now(), true);
    requestAnimationFrame(frame);

    $('#start-btn').addEventListener('click', () => {
      if (started) return;
      sfx.init(); sfx.prestige();
      $('#splash').classList.add('out');
      $('#app').removeAttribute('aria-hidden');
      setTimeout(() => $('#splash').remove(), 700);
      started = true;
      lastFrame = performance.now();
      if (isNewGame) {
        modal({
          icon: '🌌', title: '초공간에 오신 것을 환영합니다',
          body: '<p>당신은 반물질로 우주를 키우는 차원 설계자입니다.</p><div class="modal-box">① 블랙홀을 <b>터치</b>해 반물질을 모으세요<br>② 아래 <b>차원 아이콘</b>을 눌러 차원을 구매하세요<br>③ 높은 차원은 낮은 차원을 만들어냅니다<br>④ 1.79e308, <b>∞</b>에 도달해 우주를 붕괴시키세요</div>',
          actions: [{ label: '시작하기', cls: 'btn-gold' }]
        });
      } else applyAway((Date.now() - loadedSavedAt) / 1000, true);
      checkDaily();
      lastDailyCheck = Date.now();
      save();
      updateAll();
    });
  }

  boot();
})();
