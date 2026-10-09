/* 초공간 차원 붕괴 — 화면 · 입력 · 연출 · 저장
 * DOM은 처음 한 번만 만들고 이후에는 텍스트/속성만 갱신한다 (터치 중 버튼이 교체되어 입력이 씹히지 않도록).
 */
(function () {
  'use strict';

  const { BigNum, data: D, core: C } = window.CD;
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
  function width(el, pct) { const v = Math.max(0, Math.min(100, pct)).toFixed(1) + '%'; if (el._w !== v) { el._w = v; el.style.width = v; } }

  /* ───────────── 상태 ───────────── */

  let S = C.fresh();
  const settings = { sound: true, haptics: true, popups: true, confirm: true, notation: 'short' };
  let buyMode = 1, tab = 'home', started = false, lastFrame = 0, lastUi = 0, lastSlowUi = 0, lastSave = 0, hiddenAt = 0;
  let nextCometAt = Date.now() + 25000, loadedSavedAt = 0, isNewGame = true, lastDailyCheck = 0, dailyPending = false;
  const subTab = { infinity: 'upgrades', records: 'ach' };
  const newAch = new Set();
  const unlockedTabs = {};

  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* 기본값 사용 */ }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 저장 불가 환경 */ } }

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
    const n = h('div', 'toast ' + tone, '<span class="toast-ico">' + icon + '</span><span>' + html + '</span>');
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
    $('#modal-icon').textContent = o.icon || '✦';
    $('#modal-title').textContent = o.title;
    $('#modal-body').innerHTML = o.body || '';
    const acts = $('#modal-actions');
    acts.innerHTML = '';
    const actions = o.actions || [{ label: '확인', cls: 'btn-gold' }];
    modalCancel = o.cancellable === false ? null : (actions.find(a => a.cancel) || { run: null });
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
    if (!settings.popups || reducedMotion || fx.childElementCount > 80 || !fx.animate) return;
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
  function flash() { if (reducedMotion || !settings.popups) return; const f = h('div', 'screen-flash'); document.body.appendChild(f); setTimeout(() => f.remove(), 950); }
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
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function applyImported(raw) {
    const s = C.revive(raw, Date.now());
    S = s;
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
        save(); break;
      case 'crunch':
        sfx.crunch(); flash();
        if (p.auto || S.infinities > 1) toast('빅 크런치! <b>+' + p.gain + ' IP</b>', '☄', 'gold');
        else modal({
          icon: '☄', title: '첫 번째 빅 크런치!',
          body: '<p>우주가 붕괴하고 새로운 우주가 태어났습니다.</p><div class="modal-big">+' + p.gain + ' IP</div><p>인피니티 포인트로 <b>무한</b> 탭에서 영구 업그레이드를 구매하세요. 이제 <b>도전</b>도 해금되었습니다.</p>',
          actions: [{ label: '무한 탭으로', cls: 'btn-gold', run: () => switchTab('infinity') }, { label: '닫기', cancel: true }]
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
        toast('<b>' + esc(D.constellations[p.i].name) + '</b>이(가) 사도 <b>' + esc(D.apostles[p.i].name) + '</b>를 찾았다!', '✨', 'gold');
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
          icon: '⚔', title: '도전 완료!',
          body: '<p><b>' + esc(D.challenges[p.i].name) + '</b>을(를) 정복했습니다.</p><div class="modal-big">생산 +' + Math.round(D.challenges[p.i].reward * 100) + '%</div><p>영구 보상이 적용되었고, 원래 우주로 돌아왔습니다.</p>',
          actions: [{ label: '좋아요', cls: 'btn-gold' }]
        });
        save(); break;
      case 'challengeQuit': toast('도전을 포기하고 원래 우주로 돌아왔습니다.', '↩'); save(); break;
    }
  }
  function flushMastery() {
    masteryTimer = 0;
    if (!pendingMastery.size) return;
    const dims = Array.from(pendingMastery).sort((a, b) => a - b);
    pendingMastery.clear();
    if (!started) return;
    toast('<b>마스터리 상승</b> · ' + dims.map(i => D.dims[i].roman).join(' · ') + ' 차원 (생산 +10%)', '✦', 'violet');
  }

  /* ───────────── 메인: 블랙홀 · 차원 · 리셋 ───────────── */

  const coreBtn = $('#core-btn');
  function doTap(x, y) {
    const r = C.tap(S, Date.now());
    sfx.tap(r.combo);
    buzz(6);
    floatText(x, y - 14, '+' + fmt(r.gain));
    burst(x, y, 4);
    coreBtn.classList.remove('hit'); void coreBtn.offsetWidth; coreBtn.classList.add('hit');
    if (r.combo === C.COMBO_MAX) { burst(x, y, 14, '#ff8a3d'); }
  }
  coreBtn.addEventListener('pointerdown', e => { e.preventDefault(); doTap(e.clientX, e.clientY); });
  coreBtn.addEventListener('click', e => { if (e.detail === 0) { const [x, y] = centerOf(coreBtn); doTap(x, y); } });
  coreBtn.addEventListener('contextmenu', e => e.preventDefault());

  const dimEls = [];
  function buildDims() {
    const list = $('#dim-list');
    D.dims.forEach((d, i) => {
      const row = h('article', 'dim-row');
      row.innerHTML = '<div class="dim-thumb"><img src="img/thumb/dim' + (i + 1) + '.webp" alt=""><span class="dim-roman">' + d.roman + '</span><span class="dim-badge hidden"></span></div>' +
        '<div class="dim-main"><div class="dim-head"><span class="dim-name">' + esc(d.name) + '</span><span class="dim-mult"></span></div>' +
        '<div class="dim-amount"></div><div class="dim-rate"></div>' +
        '<div class="dim-set"><span class="rail"><span class="rail-fill"></span></span><em></em></div></div>' +
        '<button class="buy-btn"><small></small><b></b></button>';
      const q = s => row.querySelector(s);
      const r = { row, mult: q('.dim-mult'), amount: q('.dim-amount'), rate: q('.dim-rate'), fill: q('.rail-fill'), set: q('.dim-set em'), badge: q('.dim-badge'), btn: q('.buy-btn'), small: q('.buy-btn small'), cost: q('.buy-btn b') };
      r.btn.addEventListener('click', () => buyDim(i, r.btn));
      list.appendChild(row);
      dimEls.push(r);
    });
  }
  function buyDim(i, anchor) {
    const n = C.buyDim(S, i, buyMode);
    if (!n) { sfx.error(); shake(anchor); return; }
    sfx.buy(); buzz(5);
    if (anchor) { const [x, y] = centerOf(anchor); floatText(x, y - 18, '+' + n, 'green'); }
    C.checkAchievements(S);
    update(Date.now(), true);
  }
  function updateDims(mults, sp) {
    const u = C.unlocked(S), setMul = S.activeChallenge === 5 ? '×1.5' : '×2';
    dimEls.forEach((r, i) => {
      const locked = i >= u, d = S.dims[i];
      cls(r.row, 'locked', locked);
      if (locked) {
        setHTML(r.amount, '<span class="lock-note">🔒 차원 교체로 개방</span>');
        setText(r.rate, ''); setText(r.mult, ''); setText(r.set, ''); width(r.fill, 0);
        setDisabled(r.btn, true); setText(r.small, '잠김'); setText(r.cost, fmt(C.dimCost(S, i)));
        cls(r.row, 'can', false); r.badge.classList.add('hidden');
        return;
      }
      setText(r.mult, '×' + fmt(mults[i]));
      setHTML(r.amount, fmt(d.amount) + ' <small>· 구매 ' + d.bought + '</small>');
      const out = C.dimOutput(S, i, 0, mults, sp);
      setText(r.rate, '+' + fmt(out) + (i === 0 ? ' 반물질/초' : ' ' + D.dims[i - 1].roman + '차원/초'));
      width(r.fill, (d.bought % 10) * 10);
      setText(r.set, (d.bought % 10) + '/10 → ' + setMul);
      const plan = C.buyPlan(S, i, buyMode), can = plan.count > 0;
      setDisabled(r.btn, !can);
      cls(r.row, 'can', can);
      setText(r.small, buyMode === 'max' ? (can ? 'MAX ×' + plan.count : 'MAX') : '×' + (can ? plan.count : buyMode));
      setText(r.cost, fmt(can ? plan.cost : C.dimCost(S, i)));
      const ml = S.mastery[i].level;
      cls(r.row, 'mastered', ml > 0);
      r.badge.classList.toggle('hidden', ml <= 0);
      if (ml > 0) setText(r.badge, 'M' + ml);
    });
  }

  const PRESTIGE = [
    { type: 'shift', icon: '⟡', title: '차원 교체', btn: '교체 실행' },
    { type: 'boost', icon: '⚡', title: '차원 부스트', btn: '부스트 실행' },
    { type: 'galaxy', icon: '🌌', title: '반물질 은하', btn: '은하 생성' },
    { type: 'crunch', icon: '☄', title: '빅 크런치', btn: '우주 붕괴' }
  ];
  const pEls = {};
  function buildPrestige() {
    const grid = $('#prestige-grid');
    PRESTIGE.forEach(p => {
      const c = h('article', 'pcard' + (p.type === 'crunch' ? ' crunch' : ''));
      c.innerHTML = '<div class="pcard-ico">' + p.icon + '</div><div class="pcard-title">' + p.title + '</div><div class="pcard-desc"></div>' +
        '<div class="pcard-req"><span class="req-txt"></span><span class="rail sm"><span class="rail-fill"></span></span></div><button class="btn btn-cyan">' + p.btn + '</button>';
      const r = { card: c, desc: c.querySelector('.pcard-desc'), req: c.querySelector('.req-txt'), fill: c.querySelector('.rail-fill'), btn: c.querySelector('button') };
      r.btn.addEventListener('click', () => prestige(p.type));
      grid.appendChild(c);
      pEls[p.type] = r;
    });
  }
  function updatePrestige() {
    const u = C.unlocked(S), top = S.dims[u - 1];
    const set = (type, desc, req, pct, ready, btnText) => {
      const r = pEls[type];
      setText(r.desc, desc); setText(r.req, req); width(r.fill, pct);
      cls(r.card, 'ready', ready); setDisabled(r.btn, !ready);
      if (btnText) setText(r.btn, btnText);
    };
    if (S.activeChallenge === 2) set('shift', '이 도전에서는 차원 교체가 봉인되었습니다.', '봉인됨', 0, false);
    else if (u >= 8) set('shift', '8개 차원이 모두 개방되었습니다.', '개방 완료', 100, false);
    else set('shift', '초기화 후 ' + D.dims[u].name + '을(를) 개방합니다.', '제' + u + '차원 ' + top.bought + ' / ' + C.shiftReq(), top.bought / C.shiftReq() * 100, C.canShift(S));
    const br = C.boostReq(S);
    if (S.activeChallenge === 3) set('boost', '이 도전에서는 부스트를 할 수 없습니다.', '봉인됨', 0, false);
    else set('boost', '초기화 후 모든 차원 ×' + C.boostBase(S).toFixed(1) + ' (현재 ' + S.boosts + '회)', '제' + u + '차원 ' + top.bought + ' / ' + br, top.bought / br * 100, C.canBoost(S));
    const gr = C.galaxyReq(S);
    if (C.galaxyMaxed(S)) set('galaxy', '틱스피드 강화가 최대치에 도달했습니다.', '효과 최대 · ' + S.galaxies + '개', 100, false);
    else if (S.shifts < 4) set('galaxy', '틱스피드 효율을 영구 강화합니다 (교체·부스트 초기화).', '8개 차원 개방 필요', S.shifts / 4 * 100, false);
    else set('galaxy', '틱 주기 감소 ' + Math.round((1 - C.tickBase(S)) * 100) + '% → ' + Math.round((1 - C.tickBase(S) + (C.hasUpg(S, 1) ? 0.03 : 0.02)) * 100) + '%', '제8차원 ' + S.dims[7].bought + ' / ' + gr, S.dims[7].bought / gr * 100, C.canGalaxy(S));
    const pct = Math.max(0, S.matter.log10()) / C.INF.log10() * 100;
    if (S.activeChallenge >= 0) set('crunch', '도전 중에는 빅 크런치를 할 수 없습니다.', '도전 진행 중', pct, false);
    else set('crunch', '우주를 붕괴시키고 인피니티 포인트를 얻습니다.', C.canCrunch(S) ? '보상 +' + C.ipGain(S) + ' IP' : '∞ 까지 ' + pct.toFixed(1) + '%', pct, C.canCrunch(S));
  }

  function prestige(type) {
    if (type === 'crunch') return confirmCrunch();
    const fns = { shift: C.shift, boost: C.boost, galaxy: C.galaxy };
    const can = { shift: C.canShift, boost: C.canBoost, galaxy: C.canGalaxy }[type](S);
    if (!can) { sfx.error(); return; }
    const run = () => { if (fns[type](S)) { C.checkAchievements(S); update(Date.now(), true); } };
    if (!settings.confirm) return run();
    const info = {
      shift: ['⟡', '차원 교체', '반물질과 모든 차원이 초기화되고 다음 차원이 개방됩니다.'],
      boost: ['⚡', '차원 부스트', '반물질과 모든 차원이 초기화되고, 모든 차원 생산이 ×' + C.boostBase(S).toFixed(1) + ' 강해집니다.'],
      galaxy: ['🌌', '반물질 은하', '반물질·차원·교체·부스트가 초기화되고 틱스피드가 영구적으로 강해집니다.']
    }[type];
    modal({
      icon: info[0], title: info[1] + '을(를) 실행할까요?', body: '<p>' + info[2] + '</p><p style="font-size:.72rem">설정에서 확인 창을 끌 수 있습니다.</p>',
      actions: [{ label: '취소', cancel: true }, { label: '실행', cls: 'btn-gold', run }]
    });
  }
  function confirmCrunch() {
    if (!C.canCrunch(S)) { sfx.error(); return; }
    modal({
      icon: '☄', title: '빅 크런치',
      body: '<p>현재 우주를 완전히 붕괴시킵니다. 차원·교체·부스트·은하·틱스피드가 초기화됩니다.</p><div class="modal-big">+' + C.ipGain(S) + ' IP</div><p>업적·성좌·연구·마스터리·인피니티 업그레이드는 유지됩니다.</p>',
      actions: [{ label: '취소', cancel: true }, { label: '붕괴시키기', cls: 'btn-gold', run: () => { C.crunch(S, Date.now()); update(Date.now(), true); } }]
    });
  }

  function updateHome(now, mults, sp, prod) {
    const capped = S.matter.gte(C.INF);
    const m = $('#matter'), txt = fmt(S.matter);
    if (m._t !== txt) { setText(m, txt); if (now - (m._p || 0) > 260) { m._p = now; m.classList.remove('pulse'); void m.offsetWidth; m.classList.add('pulse'); } }
    cls(m, 'capped', capped);
    setText($('#rate'), capped ? '∞ 도달 — 빅 크런치 가능' : '+' + fmt(prod) + ' /초');
    const pct = Math.max(0, S.matter.log10()) / C.INF.log10() * 100;
    width($('#inf-progress'), pct);
    setText($('#inf-pct'), pct.toFixed(1) + '%');

    const combo = S.tap.combo, left = C.comboLeft(S, now);
    cls($('#combo'), 'on', left > 0 && combo > 1);
    setText($('#combo-n'), 'COMBO ×' + combo + (combo >= C.COMBO_MAX ? ' MAX' : ''));
    width($('#combo-fill'), left / 10);
    cls($('#core-hint'), 'hidden', S.stats.taps >= 20);

    const banner = $('#crunch-banner');
    cls(banner, 'hidden', !C.canCrunch(S));
    if (C.canCrunch(S)) setText($('#crunch-reward'), '우주를 붕괴시키고 +' + C.ipGain(S) + ' IP를 획득하세요');

    const gi = C.nextGoal(S), gc = $('#goal-card');
    cls(gc, 'hidden', gi === null);
    if (gi !== null) {
      const a = C.ACH[gi];
      setText($('#goal-name'), a.name);
      setText($('#goal-desc'), a.desc);
      let ratio = 0;
      if (a.prog) {
        const p = a.prog(S);
        ratio = p.cur instanceof BigNum ? Math.max(0, p.cur.log10()) / C.big(p.max).log10() : p.cur / p.max;
      }
      width($('#goal-fill'), ratio * 100);
    }

    const bb = $('#buff-btn');
    if (C.buffActive(S, now)) { setText(bb, '⚡ 과충전 ' + clock(S.buff.endsAt - now)); setDisabled(bb, true); cls(bb, 'ready', false); }
    else if (now < S.buff.readyAt) { setText(bb, '⏳ 충전 중 ' + clock(S.buff.readyAt - now)); setDisabled(bb, true); cls(bb, 'ready', false); }
    else { setText(bb, '⚡ 과충전 ×' + C.buffPower(S).toFixed(1)); setDisabled(bb, S.matter.isZero()); cls(bb, 'ready', true); }

    const tb = $('#buy-tick');
    if (C.tickLocked(S)) { setText($('#tick-cost'), '정지됨'); setDisabled(tb, true); }
    else { setText($('#tick-cost'), fmt(C.tickCost(S))); setDisabled(tb, !C.canBuyTick(S)); }
    const per = 1 / C.tickBase(S);
    setText($('#tick-info'), '가속 ×' + fmt(sp) + ' · 구매당 ×' + per.toFixed(3) + ' · ' + S.tickspeedPurchased + '회');
    const spin = Math.max(0.6, 6 / (1 + Math.max(0, sp.log10()) / 3)).toFixed(2) + 's';
    if (tb._spin !== spin) { tb._spin = spin; $('#tick-card').style.setProperty('--tick-spin', spin); }

    updateDims(mults, sp);
    updatePrestige();
  }

  /* ───────────── 성좌 ───────────── */

  const EMBLEMS = ['🏹', '🎵', '👑', '🐎', '🦢', '🦂', '🐻', '🌌'];
  const constEls = [];
  function buildStars() {
    const grid = $('#const-grid');
    D.constellations.forEach((c, i) => {
      const card = h('article', 'card const-card');
      card.innerHTML = '<div class="const-head"><div class="const-emblem">' + EMBLEMS[i] + '</div><div><div class="const-name">' + esc(c.name) + '</div><div class="const-title">' + esc(c.title) + '</div></div><div class="const-lv"></div></div>' +
        '<div class="const-desc"></div><div class="const-status"><span class="st-a"></span><span class="st-b"></span></div><span class="rail sm"><span class="rail-fill"></span></span>' +
        '<div class="invest-row"><button class="btn btn-cyan sm inv10">10% 투자</button><button class="btn btn-gold sm invneed"></button></div>' +
        '<div class="apostle hidden"><div class="apostle-head">✦ ' + esc(D.apostles[i].name) + '<small>' + esc(D.apostles[i].title) + '</small></div><div class="apostle-pers">' + esc(D.apostles[i].personality) + '</div><div class="skills"></div><div class="apostle-log"></div></div>';
      const q = s => card.querySelector(s);
      const r = { card, lv: q('.const-lv'), desc: q('.const-desc'), a: q('.st-a'), b: q('.st-b'), fill: q('.rail-fill'), inv10: q('.inv10'), invNeed: q('.invneed'), apostle: q('.apostle'), log: q('.apostle-log'), skills: [] };
      D.skills.forEach((sk, j) => {
        const row = h('div', 'skill-row', '<div><b></b><small>' + esc(sk.desc) + '</small></div><button class="buy-btn violet"><small>강화</small><b></b></button>');
        const s = { name: row.querySelector('b'), btn: row.querySelector('button'), cost: row.querySelector('button b') };
        s.btn.addEventListener('click', () => { if (C.fundSkill(S, i, j, Date.now())) { sfx.buy(); toast('<b>' + esc(D.apostles[i].name) + '</b> ' + esc(sk.name) + ' Lv.' + S.apostles[i].skills[j], '✦', 'violet'); update(Date.now(), true); } else { sfx.error(); shake(s.btn); } });
        q('.skills').appendChild(row);
        r.skills.push(s);
      });
      r.inv10.addEventListener('click', () => investConst(i, S.matter.mul(0.1), r.inv10));
      r.invNeed.addEventListener('click', () => { const rem = C.constRemaining(S, i); if (rem) investConst(i, rem, r.invNeed); });
      grid.appendChild(card);
      constEls.push(r);
    });
  }
  function investConst(i, amount, btn) {
    const res = C.invest(S, i, amount, Date.now());
    if (!res.ok) { sfx.error(); shake(btn); return; }
    sfx.buy();
    const [x, y] = centerOf(btn);
    burst(x, y, 6, '#ffdb8a');
    update(Date.now(), true);
  }
  function updateStars() {
    constEls.forEach((r, i) => {
      const c = S.constellations[i], ap = S.apostles[i], def = D.constellations[i];
      cls(r.card, 'found', c.apostleFound);
      setText(r.lv, c.apostleFound ? 'Lv.' + c.level + ' / 10' : '탐색 중');
      setHTML(r.desc, esc(def.desc) + (c.apostleFound ? ' · 현재 <b>+' + Math.round(C.constBonus(S, i) * 100) + '%</b>' : ''));
      const need = C.constNeed(S, i);
      if (!need) {
        setText(r.a, '후원 완료'); setText(r.b, 'MAX'); width(r.fill, 100);
        setDisabled(r.inv10, true); setDisabled(r.invNeed, true); setText(r.invNeed, '최대 레벨');
      } else {
        const rem = C.constRemaining(S, i);
        setText(r.a, c.apostleFound ? '다음 후원 Lv.' + (c.level + 1) : '사도 탐색');
        setText(r.b, fmt(c.invested) + ' / ' + fmt(need));
        width(r.fill, Math.min(1, c.invested.div(need).toNumber()) * 100);
        setDisabled(r.inv10, S.matter.isZero());
        setText(r.invNeed, '필요량 투자 · ' + fmt(rem));
        setDisabled(r.invNeed, !S.matter.gte(rem));
      }
      r.apostle.classList.toggle('hidden', !ap.awake);
      if (ap.awake) {
        r.skills.forEach((s, j) => {
          setText(s.name, D.skills[j].name + ' Lv.' + ap.skills[j] + (j === 2 && ap.skills[j] > 0 ? ' · ' + Math.round(C.revelationInterval(ap.skills[j]) / 1000) + '초마다' : ''));
          if (ap.skills[j] >= 20) { setText(s.cost, 'MAX'); setDisabled(s.btn, true); }
          else { setText(s.cost, fmt(C.skillCost(S, i, j))); setDisabled(s.btn, !C.canFundSkill(S, i, j)); }
        });
        const sig = ap.log.length + ':' + (ap.log.length ? ap.log[ap.log.length - 1].msg : '');
        if (r.log._sig !== sig) {
          r.log._sig = sig;
          r.log.innerHTML = ap.log.slice(-5).reverse().map(l => '<div class="log-row">' + (l.t ? '<time>' + new Date(l.t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + '</time>' : '') + esc(l.msg) + '</div>').join('');
        }
      }
    });
  }

  /* ───────────── 연구 ───────────── */

  const researchEls = [];
  function buildResearch() {
    const grid = $('#research-grid');
    D.research.forEach((rd, i) => {
      const card = h('article', 'card rcard');
      card.innerHTML = '<div class="rcard-head"><span class="rcard-name">' + esc(rd.name) + '</span><span class="rcard-lv"></span></div><div class="rcard-desc">' + esc(rd.desc) + '</div>' +
        '<div class="rcard-pips">' + '<i></i>'.repeat(D.researchMax) + '</div><button class="buy-btn ' + (rd.currency === 'ip' ? '' : 'cyan') + '"><small class="cur-tag">' + (rd.currency === 'ip' ? 'IP' : 'AM') + '</small><b></b></button>';
      const r = { card, lv: card.querySelector('.rcard-lv'), pips: Array.from(card.querySelectorAll('.rcard-pips i')), btn: card.querySelector('button'), cost: card.querySelector('button b') };
      r.btn.addEventListener('click', () => {
        if (!C.buyResearch(S, i)) { sfx.error(); shake(r.btn); return; }
        sfx.achieve();
        const [x, y] = centerOf(r.btn); burst(x, y, 10, '#a78bfa');
        toast('<b>' + esc(rd.name) + '</b> Lv.' + S.research[i], '🔬', 'violet');
        C.checkAchievements(S);
        update(Date.now(), true);
      });
      grid.appendChild(card);
      researchEls.push(r);
    });
  }
  function updateResearch() {
    researchEls.forEach((r, i) => {
      const lvl = S.research[i], cost = C.researchCost(S, i);
      cls(r.card, 'maxed', !cost);
      setText(r.lv, 'Lv.' + lvl + ' / ' + D.researchMax);
      r.pips.forEach((p, k) => cls(p, 'on', k < lvl));
      if (!cost) { setText(r.cost, '완료'); setDisabled(r.btn, true); }
      else { setText(r.cost, cost.ip !== undefined ? cost.ip + ' IP' : fmt(cost.am)); setDisabled(r.btn, !C.canResearch(S, i)); }
    });
    const gc = $('#galaxy-collection'), n = S.galaxyCollection.length;
    setText($('#galaxy-count'), n);
    const sig = n + ':' + (S.galaxyCollection[n - 1] || '');
    if (gc._sig !== sig) {
      gc._sig = sig;
      gc.innerHTML = n ? S.galaxyCollection.slice().reverse().map(g => '<div class="galaxy-chip">🌌 ' + esc(g) + '</div>').join('') : '<div class="empty-msg">아직 탄생시킨 은하가 없습니다. 반물질 은하를 만들어 보세요.</div>';
    }
  }

  /* ───────────── 무한: 업그레이드 · 자동화 · 도전 ───────────── */

  const upgEls = [], autoEls = [], challEls = [];
  function buildInfinity() {
    const ug = $('#upgrade-grid');
    D.upgrades.forEach((u, i) => {
      const card = h('article', 'card ucard', '<div class="ucard-ico">' + u.icon + '</div><div class="ucard-main"><div class="ucard-name">' + esc(u.name) + '</div><div class="ucard-desc">' + esc(u.desc) + '</div><button class="btn btn-gold sm"></button></div>');
      const r = { card, btn: card.querySelector('button') };
      r.btn.addEventListener('click', () => {
        if (!C.buyUpgrade(S, i)) { sfx.error(); shake(r.btn); return; }
        sfx.achieve(); flash();
        toast('<b>' + esc(u.name) + '</b> 활성화', u.icon, 'gold');
        C.checkAchievements(S); save();
        update(Date.now(), true);
      });
      ug.appendChild(card);
      upgEls.push(r);
    });
    const al = $('#auto-list');
    al.innerHTML = '<h3 class="panel-title">자동화</h3><p class="panel-copy">인피니티 업그레이드로 자동화 장치를 해금하고, 여기서 켜고 끌 수 있습니다.</p>';
    D.upgrades.forEach((u, i) => {
      if (!u.auto) return;
      const row = h('div', 'auto-row', '<div class="ucard-ico">' + u.icon + '</div><div class="ucard-main"><div class="ucard-name">' + esc(u.name) + '</div><div class="ucard-desc"></div></div><button class="switch" role="switch" aria-label="' + esc(u.name) + '"></button>');
      const r = { row, i, key: u.auto, desc: row.querySelector('.ucard-desc'), sw: row.querySelector('.switch') };
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
      const card = h('article', 'card ccard', '<div class="ccard-name">' + esc(c.name) + '</div><div class="ccard-debuff">⚠ ' + esc(c.debuff) + '</div>' +
        '<div class="ccard-meta">목표: <b>' + fmt(C.challengeGoal(i)) + '</b> 반물질</div><div class="ccard-meta">보상: 모든 차원 생산 <b>+' + Math.round(c.reward * 100) + '%</b></div><div class="act"></div>');
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
      else if (state === 'active') { r.act.innerHTML = '<button class="btn btn-danger">포기하고 돌아가기</button>'; r.act.firstChild.onclick = quitChallenge; }
      else { r.act.innerHTML = '<button class="btn btn-gold"' + (state === 'ready' ? '' : ' disabled') + '>' + (state === 'locked' ? '🔒 잠김' : '도전 시작') + '</button>'; r.act.firstChild.onclick = () => startChallenge(i); }
    });
  }
  function startChallenge(i) {
    const c = D.challenges[i];
    modal({
      icon: '⚔', title: c.name,
      body: '<p>' + esc(c.debuff) + '</p><div class="modal-summary">목표 ' + fmt(C.challengeGoal(i)) + ' 반물질 · 보상 생산 +' + Math.round(c.reward * 100) + '%</div><p style="margin-top:10px">현재 우주는 안전하게 보관되며, 완료하거나 포기하면 그대로 돌아옵니다.</p>',
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
    modal({ icon: '↩', title: '도전을 포기할까요?', body: '<p>이 도전의 진행은 사라지고 원래 우주로 돌아갑니다.</p>', actions: [{ label: '계속하기', cancel: true }, { label: '포기', cls: 'btn-danger', run: () => C.exitChallenge(S, false) }] });
  }

  /* ───────────── 기록: 업적 · 통계 ───────────── */

  const achEls = { n: [], s: [] };
  function buildRecords() {
    const grid = $('#ach-grid');
    const make = (def, key) => {
      const el = h('article', 'ach locked', '<div class="ach-mark"></div><div class="ach-name"></div><div class="ach-desc"></div>');
      grid.appendChild(el);
      return { el, key, def, mark: el.querySelector('.ach-mark'), name: el.querySelector('.ach-name'), desc: el.querySelector('.ach-desc') };
    };
    C.ACH.forEach((a, i) => achEls.n.push(make(a, 'n' + i)));
    grid.appendChild(h('div', 'secret-divider', '✦ 비밀 업적 ✦'));
    C.SECRET.forEach((a, i) => achEls.s.push(make(a, 's' + i)));
    setText($('#ach-total'), '/ ' + (C.ACH.length + C.SECRET.length));
  }
  function updateRecords() {
    const paint = (r, on, secret) => {
      cls(r.el, 'unlocked', on); cls(r.el, 'locked', !on); cls(r.el, 'new', newAch.has(r.key));
      setText(r.mark, on ? '🏆' : secret ? '?' : '🔒');
      setText(r.name, on || !secret ? r.def.name : '???');
      setText(r.desc, on || !secret ? r.def.desc : '조건을 찾아보세요');
    };
    achEls.n.forEach((r, i) => paint(r, S.achievements[i], false));
    achEls.s.forEach((r, i) => paint(r, S.secretAch[i], true));
    setText($('#ach-count'), C.achCount(S));
    setText($('#ach-bonus'), '×' + C.achBonus(S).toFixed(2));
    if (subTab.records !== 'stats') return;
    const st = S.stats;
    const rows = [
      ['총 플레이 시간', fmtTime(st.playSeconds)], ['누적 반물질', fmt(st.totalMatter)], ['차원 구매', fmtInt(st.totalPurchases)], ['빅 크런치', fmtInt(S.infinities)],
      ['누적 IP', fmtInt(st.totalIp)], ['블랙홀 터치', fmtInt(st.taps)], ['최대 콤보', fmtInt(st.maxCombo)], ['혜성 포착', fmtInt(st.comets) + (st.goldenComets ? ' (황금 ' + st.goldenComets + ')' : '')],
      ['차원 교체 / 부스트', S.shifts + ' / ' + S.boosts], ['반물질 은하', fmtInt(S.galaxies)], ['생산 가속', '×' + fmt(C.speed(S, Date.now()))], ['최장 오프라인', fmtTime(st.longestOffline)],
      ['오프라인 효율', '×' + C.offlineMult(S).toFixed(2)], ['최고 연속 접속', st.bestStreak + '일'], ['도전 정복', S.challenges.filter(Boolean).length + ' / ' + D.challenges.length], ['마스터리 합계', S.mastery.reduce((a, m) => a + m.level, 0)]
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
    if (S.activeChallenge >= 0) {
      const g = C.challengeGoal(S.activeChallenge);
      chips.push({ k: 'ch' + S.activeChallenge, cls: 'chall', label: '⚔ ' + D.challenges[S.activeChallenge].name, pct: Math.max(0, S.matter.log10()) / g.log10() * 100, quit: true });
    }
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
    stars: { need: 1e7, text: '반물질 1천만 누적 시 해금' },
    infinity: { need: 1e50, text: '반물질 1e50 누적 또는 첫 빅 크런치 시 해금' }
  };
  const TAB_NAMES = { research: '차원 연구소', stars: '성좌 후원', infinity: '무한 영역' };
  function tabUnlocked(name) {
    const l = TAB_LOCKS[name];
    return !l || S.infinities > 0 || S.stats.totalMatter.gte(l.need);
  }
  function updateNav() {
    const badges = {
      home: tab !== 'home' && (C.canShift(S) || C.canBoost(S) || C.canGalaxy(S) || C.canCrunch(S)),
      stars: S.constellations.some((c, i) => { const r = C.constRemaining(S, i); return r && S.matter.gte(r); }) || S.apostles.some((a, i) => [0, 1, 2].some(j => C.canFundSkill(S, i, j))),
      research: D.research.some((_, i) => C.canResearch(S, i)),
      infinity: D.upgrades.some((_, i) => C.canUpgrade(S, i)),
      records: newAch.size
    };
    $$('.nav-btn').forEach(b => {
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
    setText($('#hud-rate'), S.matter.gte(C.INF) ? '∞ 도달' : '+' + fmt(prod) + '/s');
    setText($('#hud-ip'), fmtInt(S.ip));
  }

  function switchTab(name) {
    if (!tabUnlocked(name)) { sfx.error(); toast(TAB_LOCKS[name].text, '🔒'); return; }
    if (tab === 'records' && name !== 'records') newAch.clear();
    tab = name;
    $$('.nav-btn').forEach(b => cls(b, 'active', b.dataset.tab === name));
    cls($('#settings-btn'), 'active', name === 'settings');
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
    else if (slow) {
      if (tab === 'stars') updateStars();
      else if (tab === 'research') updateResearch();
      else if (tab === 'infinity') updateInfinity();
      else if (tab === 'records') updateRecords();
      else if (tab === 'settings') updateSettings();
    }
  }
  function resetViewCaches() {
    [$('#history-list'), $('#galaxy-collection'), effectsEl].forEach(el => { el._sig = null; });
    constEls.forEach(r => { r.log._sig = null; });
    challEls.forEach(r => { r.state = ''; });
  }
  function updateAll() { update(Date.now(), true); }

  function applyAway(seconds, showModal) {
    if (seconds < 1) return;
    const r = C.offline(S, seconds, Date.now());
    if (seconds >= 60 && showModal) {
      modal({
        icon: '🌙', title: '다시 오신 것을 환영합니다',
        body: '<p>자리를 비운 <b>' + fmtTime(seconds) + '</b> 동안 차원들이 쉬지 않고 일했습니다.</p><div class="modal-big">+' + fmt(r.gain) + '</div><p>반물질 획득</p>' +
          '<div class="modal-summary">오프라인 효율 ×' + C.offlineMult(S).toFixed(2) + (r.capped ? ' · 최대 24시간까지 적용' : '') + '</div>',
        actions: [{ label: '수령하기', cls: 'btn-gold', run: () => { sfx.achieve(); const [x, y] = centerOf(coreBtn); burst(x, y, 18); } }]
      });
    } else if (seconds >= 10 && !r.gain.isZero()) toast('자리를 비운 동안 +' + fmt(r.gain) + ' 반물질', '🌙');
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
      if (!modalOpen && !document.hidden) spawnComet();
      nextCometAt = now + (40 + Math.random() * 60) * 1000;
    }
    if (t - lastUi >= 100) { lastUi = t; update(now); }
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
    burst(x, y, kind === 'golden' ? 24 : 14, kind === 'golden' ? '#ffdb8a' : '#a8eeff');
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
    const days = D.daily.map((d, k) => '<div class="daily-day ' + (k + 1 < info.day ? 'done' : k + 1 === info.day ? 'today' : '') + '"><span>' + (k + 1 < info.day ? '✓' : d.ip ? '⭐' : '💠') + '</span>' + (k + 1) + '일</div>').join('');
    modal({
      daily: true, icon: '🎁', title: info.day + '일차 접속 보상',
      body: '<p>매일 접속하면 보상이 커집니다. 7일째에는 인피니티 포인트를 드립니다!</p><div class="daily-grid">' + days + '</div><div class="modal-big">+' + fmt(reward.matter) + '</div><p>반물질 (생산량 ' + reward.minutes + '분어치)' + (reward.ip ? ' + <b>' + reward.ip + ' IP</b>' : '') + '</p>',
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

  /* ───────────── 설정 ───────────── */

  function updateSettings() {
    $$('[data-setting]').forEach(b => { cls(b, 'on', settings[b.dataset.setting]); b.setAttribute('aria-checked', !!settings[b.dataset.setting]); });
    $$('[data-notation]').forEach(b => cls(b, 'active', b.dataset.notation === settings.notation));
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
    $$('[data-setting]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.setting;
      settings[k] = !settings[k];
      saveSettings(); sfx.click(); updateSettings();
    }));
    $$('[data-notation]').forEach(b => b.addEventListener('click', () => { settings.notation = b.dataset.notation; saveSettings(); sfx.click(); updateAll(); }));
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
      icon: '⚠', title: '정말 처음부터 시작할까요?', body: '<p>모든 진행(업적·성좌·인피니티 포함)이 삭제되며 되돌릴 수 없습니다. 필요하면 먼저 세이브 코드를 복사해 두세요.</p>',
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
      stars = Array.from({ length: Math.min(120, Math.floor(w * ht / 8000)) }, () => ({ x: Math.random() * w, y: Math.random() * ht, r: Math.random() * 1.2 + 0.2, a: Math.random() * 0.6 + 0.1, s: Math.random() * 0.25 + 0.05, tw: Math.random() * 6 }));
    }
    function draw(t) {
      requestAnimationFrame(draw);
      if (document.hidden || t - last < 33) return;
      const k = Math.min(4, (t - last) / 16.7);
      last = t;
      const boost = started ? 1 + Math.min(6, Math.max(0, C.speed(S, Date.now()).log10()) / 4) : 1;
      x.clearRect(0, 0, w, ht);
      for (const s of stars) {
        s.y += s.s * k * boost;
        if (s.y > ht) { s.y = 0; s.x = Math.random() * w; }
        const a = s.a * (0.7 + 0.3 * Math.sin(t / 900 + s.tw));
        x.fillStyle = 'rgba(170,225,255,' + a.toFixed(3) + ')';
        x.beginPath(); x.arc(s.x, s.y, s.r, 0, Math.PI * 2); x.fill();
      }
    }
    addEventListener('resize', resize, { passive: true });
    resize();
    requestAnimationFrame(draw);
  }

  /* ───────────── 입력 바인딩 ───────────── */

  function bindUi() {
    $$('.nav-btn, #settings-btn').forEach(b => b.addEventListener('click', () => { sfx.click(); switchTab(b.dataset.tab); }));
    $$('#buy-mode .seg-btn').forEach(b => b.addEventListener('click', () => {
      buyMode = b.dataset.mode === 'max' ? 'max' : Number(b.dataset.mode);
      $$('#buy-mode .seg-btn').forEach(x => cls(x, 'active', x === b));
      sfx.click(); update(Date.now(), true);
    }));
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
      const [x, y] = centerOf(e.currentTarget); burst(x, y, 16, '#ff8a3d');
      toast('<b>과충전!</b> ' + r.seconds + '초간 생산 ×' + r.power.toFixed(1), '⚡', 'gold');
      C.checkAchievements(S); update(Date.now(), true);
    });
    $('#buy-tick').addEventListener('click', e => {
      if (!C.buyTick(S)) { sfx.error(); shake(e.currentTarget); return; }
      sfx.buy();
      const [x, y] = centerOf(e.currentTarget); floatText(x, y - 18, '⏱ +1', 'green');
      C.checkAchievements(S); update(Date.now(), true);
    });
    $('#crunch-banner').addEventListener('click', confirmCrunch);
    $('#goal-card').addEventListener('click', () => {
      switchTab('records');
      const b = document.querySelector('[data-subnav="records"] [data-sub="ach"]');
      if (b) b.click();
    });
    $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) cancelModal(); });
    addEventListener('keydown', e => {
      if (!started) return;
      if (modalOpen) { if (e.key === 'Escape') cancelModal(); return; }
      if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-8]$/.test(e.key)) buyDim(Number(e.key) - 1, dimEls[Number(e.key) - 1].btn);
      else if (e.key === 'm' || e.key === 'M') $('#max-all').click();
      else if (e.key === 't' || e.key === 'T') $('#buy-tick').click();
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
    buildDims(); buildPrestige(); buildStars(); buildResearch(); buildInfinity(); buildRecords();
    bindUi();
    Object.keys(TAB_LOCKS).forEach(k => { unlockedTabs[k] = tabUnlocked(k); });
    setupStarfield();
    updateSettings();
    update(Date.now(), true);
    requestAnimationFrame(frame);

    const startBtn = $('#start-btn');
    startBtn.addEventListener('click', () => {
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
          body: '<p>당신은 반물질로 우주를 키우는 차원 설계자입니다.</p><div class="modal-summary" style="text-align:left">① 블랙홀을 <b>터치</b>해 반물질을 모으세요<br>② <b>차원</b>을 구매하면 자동으로 생산합니다<br>③ 높은 차원은 낮은 차원을 만들어냅니다<br>④ 1.79e308, <b>∞</b>에 도달해 우주를 붕괴시키세요</div>',
          actions: [{ label: '시작하기', cls: 'btn-gold' }]
        });
      } else {
        applyAway((Date.now() - loadedSavedAt) / 1000, true);
      }
      checkDaily();
      lastDailyCheck = Date.now();
      save();
      updateAll();
    });
  }

  boot();
})();
