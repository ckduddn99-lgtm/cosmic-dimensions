/* 초공간 차원 붕괴 — 성좌 서사 엔진 (DOM 없음)
 * 성좌가 사도를 고르고, 사도는 스스로 모험하며 죽거나 배신하거나 타락한다.
 * 전조(작은 사건)가 쌓이면 운명 사건의 확률이 0.01%에서 70%까지 오르고,
 * 사건이 터지면 엮인 성좌들이 플레이어의 반물질을 마음대로 가져간다.
 */
(function (root) {
  'use strict';

  const CD = root.CD = root.CD || {};
  const BigNum = CD.BigNum;
  const SD = CD.sagaData;
  const core = () => CD.core;

  const TICK = 15;                // 서사 한 걸음 (초)
  const MOMENTUM = 80;
  const COOLDOWN = 60;            // 사건 직후 긴장도를 −60으로 내려 같은 사건이 바로 반복되지 않게 한다
  const P_BASE = 0.0001, P_MAX = 0.7, P_MID = 110, P_W = 8, CHECK_EVERY = 4;
  const MAX_FREE = 10, MAX_FEED = 140, MAX_HALL = 30, MAX_FALLEN = 5;
  const TRIBUTE = 0.1;             // 앱을 꺼 둔 동안 성좌들이 거둬 가는 몫 (오프라인 획득량 대비)
  const PARTY_MAX = 4;
  const rnd = () => core().random();
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cname = i => SD.voices[i].name;

  // '이(가)' 같은 겸용 조사를 앞 글자의 받침에 맞춰 고른다 (따옴표·태그·괄호는 건너뛴다)
  const BATCHIM_DIGIT = { 0: 1, 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1, 9: 0 };
  function hasBatchim(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 !== 0;
    if (ch >= '0' && ch <= '9') return !!BATCHIM_DIGIT[ch];
    return false;
  }
  const PAIRS = { '이(가)': ['이', '가'], '을(를)': ['을', '를'], '은(는)': ['은', '는'], '와(과)': ['과', '와'], '과(와)': ['과', '와'], '(으)로': ['으로', '로'] };
  function fixJosa(text) {
    return String(text).replace(/([가-힣0-9])((?:<\/?b>|['」』)\]])*)(이\(가\)|을\(를\)|은\(는\)|와\(과\)|과\(와\))/g,
      (m, ch, mid, p) => ch + mid + PAIRS[p][hasBatchim(ch) ? 0 : 1]);
  }

  /* ───────────── 상태 ───────────── */

  function fresh(now) {
    return {
      people: [], nextId: 1,
      patrons: [0, 0, 0, 0, 0, 0, 0, 0],
      power: Array.from({ length: 8 }, () => new BigNum(0)),
      fame: [0, 0, 0, 0, 0, 0, 0, 0],
      tension: Object.fromEntries(SD.fates.map(f => [f.id, 0])),
      feed: [], hall: [],
      acc: 0, omenAt: now + 20000,
      buff: { mult: 1, endsAt: 0 },
      parties: [], nextParty: 1,
      stats: { deaths: 0, betrayals: 0, falls: 0, fates: 0, omens: 0, redeemed: 0, parties: 0, taken: new BigNum(0), tribute: new BigNum(0), seen: {} }
    };
  }

  function feed(s, kind, text, c = -1, now = Date.now(), extra) {
    const f = s.saga.feed;
    text = fixJosa(text);
    f.push(Object.assign({ t: now, kind, text, c }, extra || {}));
    if (f.length > MAX_FEED) f.splice(0, f.length - MAX_FEED);
    core().emitSaga(kind, { text, c, ...extra });
  }

  const FATE = Object.fromEntries(SD.fates.map(f => [f.id, f]));
  const awake = (s, i) => s.constellations[i].apostleFound;
  const person = (s, id) => (id ? s.saga.people.find(p => p.id === id) || null : null);
  const apostleOf = (s, i) => { const p = person(s, s.saga.patrons[i]); return p && p.status === 'apostle' ? p : null; };
  const livingApostles = s => s.saga.people.filter(p => p.status === 'apostle');
  const fallen = s => s.saga.people.filter(p => p.status === 'fallen');
  const free = s => s.saga.people.filter(p => p.status === 'free');
  const clsOf = p => SD.classes[p.cls];
  const traitOf = p => SD.traits[p.trait];
  function label(p) { return traitOf(p).name + ' ' + clsOf(p).name + ' ' + p.name; }

  /* ───────────── 타락의 원인 ───────────── */

  // 타락도는 어디서 왔는지 함께 기록한다. 타락하는 순간 가장 크게 쌓인 원인이 그 사람의 이야기가 된다.
  const CAUSE = {
    neglect: { text: '성좌의 후원이 끊긴 사이, 버림받았다고 믿었습니다.', short: '후원이 끊겨', grudge: 3 },
    dark: { text: '어둠의 땅에서 너무 오래 싸웠습니다.', short: '어둠에 오래 머물러', grudge: 2 },
    fear: { text: '죽음의 문턱을 몇 번이나 넘으며 마음이 꺾였습니다.', short: '죽음의 공포로', grudge: 2 },
    whisper: { text: '타락한 자의 속삭임에 넘어갔습니다.', short: '속삭임에 넘어가', grudge: 1 },
    fate: { text: '운명의 소용돌이가 마음을 검게 물들였습니다.', short: '운명에 휩쓸려', grudge: 1 },
    trial: { text: '시련에서 무너진 뒤 다시 일어서지 못했습니다.', short: '시련에 무너져', grudge: 2 },
    recruit: { text: '타락한 자를 따라 어둠으로 걸어 들어갔습니다.', short: '추종자가 되어', grudge: 1 }
  };
  function corruptBy(p, amount, src, by) {
    p.corrupt += amount;
    if (amount <= 0) return;
    p.cs = p.cs || {};
    p.cs[src] = (p.cs[src] || 0) + amount;
    if (by) p.csBy = by;
  }
  function mainCause(p) {
    let best = 'dark', v = -1;
    for (const k in p.cs || {}) if (CAUSE[k] && p.cs[k] > v) { v = p.cs[k]; best = k; }
    return best;
  }

  /** 사도가 자기 성좌를 어떻게 여기는지 (카드에 한 줄로 보여 준다) */
  function faith(s, p, now = Date.now()) {
    if (p.status !== 'apostle') return '';
    const c = '\'' + cname(p.patron) + '\'';
    if (p.corrupt >= 70) return '어둠의 목소리가 ' + c + '보다 크게 들립니다';
    if (now - p.sponsorAt > TICK * 1000 * 8) return '성좌 ' + c + '이(가) 자신을 잊었다고 생각합니다';
    if (p.loyal >= 85) return '성좌 ' + c + '을(를) 온전히 믿습니다';
    if (p.loyal >= 50) return '성좌 ' + c + '을(를) 따릅니다';
    return '성좌 ' + c + '을(를) 의심하고 있습니다';
  }

  /* ───────────── 인물 ───────────── */

  function spawn(s, now, opts = {}) {
    const ci = opts.cls !== undefined ? opts.cls : Math.floor(rnd() * SD.classes.length);
    const c = SD.classes[ci], lvl = opts.lvl || 1 + Math.floor(rnd() * 3);
    const g = 1 + (lvl - 1) * 0.08;
    const used = new Set(s.saga.people.map(p => p.name));
    let name = pick(SD.names);
    for (let k = 0; k < 6 && used.has(name); k++) name = pick(SD.names);
    const p = {
      id: s.saga.nextId++, name, cls: ci, trait: opts.trait !== undefined ? opts.trait : Math.floor(rnd() * SD.traits.length),
      origin: opts.origin || pick(SD.origins), lvl, xp: 0,
      maxHp: Math.round(c.hp * g * (0.9 + rnd() * 0.2)), atk: Math.round(c.atk * g * (0.9 + rnd() * 0.2)),
      def: Math.round(c.def * g * (0.9 + rnd() * 0.2)), luck: Math.round(c.luck * (0.8 + rnd() * 0.4)),
      corrupt: Math.floor(rnd() * 10), loyal: 50, status: 'free', patron: -1, title: opts.title || '', deeds: 0,
      sponsorAt: 0, born: now, act: { kind: 'idle', t: now }, look: Math.floor(rnd() * 1e6), cs: {}, party: 0
    };
    p.hp = p.maxHp;
    s.saga.people.push(p);
    return p;
  }

  function ensureWorld(s, now) {
    while (free(s).length < MAX_FREE) spawn(s, now);
  }

  function toHall(s, p, fate, now) {
    s.saga.hall.push({ name: p.name, cls: p.cls, trait: p.trait, lvl: p.lvl, title: p.title, patron: p.patron, fate, t: now, look: p.look });
    if (s.saga.hall.length > MAX_HALL) s.saga.hall.shift();
    s.saga.people = s.saga.people.filter(x => x !== p);
    if (p.patron >= 0 && s.saga.patrons[p.patron] === p.id) s.saga.patrons[p.patron] = 0;
  }

  function affinity(p, i) {
    const c = clsOf(p), t = traitOf(p);
    return (c.likes.includes(i) ? 3 : 0) + (t.likes.includes(i) ? 2 : 0) + p.lvl * 0.3 + rnd() * 2;
  }

  function choose(s, i, now) {
    const cands = free(s);
    if (!cands.length) return;
    let best = cands[0], score = -1;
    for (const p of cands) { const a = affinity(p, i); if (a > score) { score = a; best = p; } }
    best.status = 'apostle'; best.patron = i; best.party = 0; best.loyal = 55 + Math.floor(rnd() * 25);
    s.saga.patrons[i] = best.id;
    best.act = { kind: 'chosen', t: now };
    feed(s, 'pick', '성좌 \'' + cname(i) + '\'이(가) ' + best.origin + '의 ' + label(best) + '을(를) 사도로 선택했습니다.', i, now, { a: best.id });
  }

  function levelUp(s, p, now) {
    let ups = 0;
    while (p.xp >= xpNeed(p.lvl)) {
      p.xp -= xpNeed(p.lvl); p.lvl++; ups++;
      const c = clsOf(p);
      p.maxHp += Math.round(c.hp * 0.08); p.atk += Math.max(1, Math.round(c.atk * 0.08)); p.def += Math.max(1, Math.round(c.def * 0.08));
      p.hp = p.maxHp;
    }
    if (ups) {
      p.act = { kind: 'level', t: now };
      if (p.status === 'apostle' && (p.lvl % 5 === 0 || ups > 1)) feed(s, 'level', p.name + '이(가) Lv.' + p.lvl + '에 도달했습니다.', p.patron, now, { a: p.id });
    }
  }
  function xpNeed(lvl) { return Math.floor(40 * Math.pow(lvl, 1.4)); }
  function power(p) { return p.atk * 2 + p.def + p.lvl * 3 + p.luck; }

  /* ───────────── 영향력 · 몸값 ───────────── */

  // 깨어난 성좌끼리 성좌 레벨, 성력, 사도 레벨, 명성으로 점수를 매겨 합이 1이 되도록 나눈다 (잠든 성좌는 0)
  function influence(s) {
    const g = s.saga;
    const score = s.constellations.map((c, i) => {
      if (!c.apostleFound) return 0;
      const ap = apostleOf(s, i);
      return 3 + c.level * 2 + Math.max(0, g.power[i].log10()) * 0.08 + (ap ? ap.lvl * 0.35 : 0) + Math.max(0, g.fame[i]) * 0.25;
    });
    const sum = score.reduce((a, b) => a + b, 0);
    return score.map(v => (sum ? v / sum : 0));
  }
  /** 몸값: 영향력이 평균(12.5%)이면 ×1, 클수록 비싸다 */
  function priceMult(s, i) { return 0.5 + 4 * influence(s)[i]; }
  function addFame(s, i, v) { if (i >= 0) s.saga.fame[i] = clamp(s.saga.fame[i] + v, -50, 500); }

  /* ───────────── 성력 (성좌의 재화) ───────────── */

  /** 성좌에게 반물질이 흘러 들어간다 (플레이어 공물 또는 사건 중 강탈). 각성·레벨 진행에도 쓰인다. */
  function offer(s, i, amount, now) {
    if (amount.isZero()) return;
    s.saga.power[i] = s.saga.power[i].add(amount);
  }

  function sponsor(s, p, now) {
    const i = p.patron, pool = s.saga.power[i];
    if (pool.isZero()) return false;
    const amount = pool.mul(0.12);
    s.saga.power[i] = pool.sub(amount);
    const bonus = Math.max(1, Math.round((1 + Math.floor(Math.max(0, amount.log10()) / 40)) * priceMult(s, i)));
    addFame(s, i, 0.5);
    p.atk += bonus; p.maxHp += 4 * bonus; p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3));
    p.loyal = clamp(p.loyal + 7 * traitOf(p).loyal, 0, 100);
    p.corrupt = Math.max(0, p.corrupt - 2);
    p.sponsorAt = now;
    p.act = { kind: 'sponsor', t: now };
    feed(s, 'sponsor', '성좌 \'' + cname(i) + '\'이(가) 사도 ' + p.name + '에게 ' + core().fmtShort(amount) + ' 성력을 후원했습니다.', i, now, { a: p.id });
    return true;
  }

  /* ───────────── 사도의 하루 ───────────── */

  function regionFor(p) {
    if (p.corrupt > 70 && rnd() < 0.5) return 4;
    if (p.lvl < 5) return 0;
    if (p.lvl < 10) return rnd() < 0.5 ? 1 : 3;
    if (p.lvl < 18) return rnd() < 0.6 ? 2 : 3;
    return rnd() < 0.3 ? 4 : Math.floor(rnd() * 4);
  }

  function battle(s, p, now) {
    const region = regionFor(p), reg = SD.regions[region];
    const pool = SD.monsters.filter(m => !m.party && m.lvl <= p.lvl / 2 + 1 && (!m.dark || reg.dark || rnd() < 0.15));
    const m = pick(pool.length ? pool : SD.monsters.slice(0, 2));
    const mLvl = Math.max(1, p.lvl + Math.floor(rnd() * 6) - 2);
    const mPow = (10 + mLvl * 7) * (1 + m.lvl * 0.12) * (reg.dark ? 1.25 : 1);
    const win = rnd() < clamp(power(p) / (power(p) + mPow) + 0.18, 0.12, 0.95);
    const dmg = Math.round(p.maxHp * (win ? 0.04 + rnd() * 0.16 : 0.25 + rnd() * 0.3));
    p.hp -= dmg;
    if (m.dark || reg.dark) corruptBy(p, (2 + rnd() * 3) * traitOf(p).corrupt, 'dark');
    if (win) {
      p.xp += 8 + mLvl * 5; p.deeds++;
      p.act = { kind: 'win', t: now, monster: m.id, region, dmg };
      if (rnd() < 0.18) feed(s, 'battle', p.name + '이(가) ' + reg.name + '에서 Lv.' + mLvl + ' ' + m.name + '을(를) 쓰러뜨렸습니다.', p.patron, now, { a: p.id });
    } else {
      p.act = { kind: 'lose', t: now, monster: m.id, region, dmg };
      feed(s, 'battle', p.name + '이(가) ' + reg.name + '에서 ' + m.name + '에게 밀려 큰 부상을 입었습니다.', p.patron, now, { a: p.id });
    }
    if (p.hp <= 0) nearDeath(s, p, now, m.name);
    else levelUp(s, p, now);
  }

  function nearDeath(s, p, now, cause) {
    const i = p.patron, pool = s.saga.power[i];
    if (i >= 0 && !pool.isZero() && rnd() < 0.75) {
      s.saga.power[i] = pool.mul(0.6);
      p.hp = Math.round(p.maxHp * 0.3);
      p.act = { kind: 'saved', t: now };
      feed(s, 'save', '성좌 \'' + cname(i) + '\'이(가) 쓰러지는 ' + p.name + '에게 성력을 쏟아부어 목숨을 붙잡았습니다.', i, now, { a: p.id });
      return;
    }
    if (rnd() < 0.35) { die(s, p, now, cause); return; }
    p.hp = 1;
    corruptBy(p, 10 * traitOf(p).corrupt, 'fear');
    feed(s, 'battle', p.name + '이(가) 죽음의 문턱에서 간신히 살아 돌아왔습니다. 눈빛이 변했습니다.', i, now, { a: p.id });
  }

  function die(s, p, now, cause) {
    const i = p.patron;
    p.act = { kind: 'death', t: now };
    s.saga.stats.deaths++;
    addFame(s, i, -6);
    feed(s, 'death', '사도 ' + p.name + '(Lv.' + p.lvl + ')이(가) ' + (cause ? cause + '에게 ' : '') + '쓰러졌습니다. 그의 이름이 명예의 전당에 새겨집니다.', i, now, { a: p.id, big: true });
    if (i >= 0) feed(s, 'voice', SD.voices[i].angry, i, now);
    toHall(s, p, 'dead', now);
  }

  function fall(s, p, now) {
    const i = p.patron;
    s.saga.stats.falls++;
    addFame(s, i, -10);
    const cause = mainCause(p);
    p.status = 'fallen'; p.act = { kind: 'fall', t: now }; p.title = '타락한 ' + clsOf(p).name;
    p.cause = cause; p.grudge = CAUSE[cause].grudge; p.party = 0;
    if (i >= 0 && s.saga.patrons[i] === p.id) s.saga.patrons[i] = 0;
    const why = cause === 'whisper' && p.csBy ? '타락한 ' + p.csBy + '의 속삭임에 넘어갔습니다.' : CAUSE[cause].text;
    feed(s, 'fall', '사도 ' + p.name + '이(가) 심연에 삼켜져 타락했습니다! ' + why + ' 성좌 \'' + (i >= 0 ? cname(i) : '???') + '\'의 이름을 저주하며 떠납니다.', i, now, { a: p.id, big: true });
    s.saga.tension.rebellion += 20;
    s.saga.hall.push({ name: p.name, cls: p.cls, trait: p.trait, lvl: p.lvl, title: p.title, patron: i, fate: 'fallen', cause, t: now, look: p.look });
    if (s.saga.hall.length > MAX_HALL) s.saga.hall.shift();
    const fs = fallen(s);
    if (fs.length > MAX_FALLEN) toHall(s, fs[0], 'vanished', now);
  }

  function betray(s, p, now, toList) {
    const from = p.patron, t = traitOf(p);
    const targets = (toList || [0, 1, 2, 3, 4, 5, 6, 7]).filter(i => i !== from && awake(s, i) && !apostleOf(s, i));
    s.saga.stats.betrayals++;
    addFame(s, from, -6);
    if (from >= 0 && s.saga.patrons[from] === p.id) s.saga.patrons[from] = 0;
    if (targets.length) {
      const to = targets.sort((a, b) => affinity(p, b) - affinity(p, a))[0];
      p.patron = to; s.saga.patrons[to] = p.id; p.loyal = 50 + Math.floor(rnd() * 20);
      p.act = { kind: 'betray', t: now };
      feed(s, 'betray', '사도 ' + p.name + '이(가) 성좌 \'' + cname(from) + '\'을(를) 배신하고 성좌 \'' + cname(to) + '\'의 손을 잡았습니다!', from, now, { a: p.id, big: true, to });
      feed(s, 'voice', SD.voices[from].angry, from, now);
    } else {
      p.status = 'free'; p.patron = -1; p.loyal = 40;
      feed(s, 'betray', '사도 ' + p.name + '이(가) 성좌 \'' + cname(from) + '\'의 곁을 떠났습니다. ' + (t.betray > 1 ? '뒤도 돌아보지 않았습니다.' : '눈물을 흘리며.'), from, now, { a: p.id, big: true });
    }
  }

  function adventure(s, p, now) {
    if (p.hp < p.maxHp * 0.5) {
      p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.45));
      p.act = { kind: 'rest', t: now, region: regionFor(p) };
    } else battle(s, p, now);
  }
  function act(s, p, now) {
    adventure(s, p, now);
    life(s, p, now);
  }
  /** 성좌와의 관계: 후원, 충성, 방치, 타락, 배신 */
  function life(s, p, now) {
    if (p.status !== 'apostle') return;
    const neglected = now - p.sponsorAt > TICK * 1000 * 8;
    if (neglected) { p.loyal -= 0.6 / traitOf(p).loyal; corruptBy(p, 0.3 * traitOf(p).corrupt, 'neglect'); }
    else p.corrupt = Math.max(0, p.corrupt - 0.3);
    if (now - p.sponsorAt > TICK * 1000 * 4 && rnd() < 0.5) sponsor(s, p, now);
    p.loyal = clamp(p.loyal, 0, 100);
    if (p.corrupt >= 100) { fall(s, p, now); return; }
    if (p.loyal < 25 && rnd() < 0.04 * traitOf(p).betray) betray(s, p, now);
  }

  /* ───────────── 타락한 자: 옛 주인에게 원한을 품고 움직인다 ───────────── */

  const GRUDGE_MAX = 3;
  function fallenAct(s, p, now) {
    const g = s.saga, i = p.patron, grudge = p.grudge || 1;
    if (rnd() > 0.04 + 0.015 * grudge) return null;
    const aps = livingApostles(s), canSteal = i >= 0 && awake(s, i) && !g.power[i].isZero();
    const canRecruit = fallen(s).length < MAX_FALLEN && free(s).length > 0 && p.cause !== 'recruit';
    const w = { steal: canSteal ? 0.3 + 0.15 * grudge : 0, whisper: aps.length ? 0.4 : 0, recruit: canRecruit ? 0.15 : 0 };
    let r = rnd() * (w.steal + w.whisper + w.recruit), kind = null;
    for (const k in w) { r -= w[k]; if (r < 0 && w[k] > 0) { kind = k; break; } }
    if (!kind) return null;
    g.tension.rebellion += 1;
    if (kind === 'steal') {
      const amt = g.power[i].mul(0.05 * grudge);
      g.power[i] = g.power[i].sub(amt);
      addFame(s, i, -1);
      feed(s, 'shadow', '타락한 ' + p.name + '이(가) 옛 주인 \'' + cname(i) + '\'의 성소에 숨어들어 성력을 ' + core().fmtShort(amt) + '만큼 훔쳤습니다.', i, now, { a: p.id });
    } else if (kind === 'whisper') {
      const t = aps.slice().sort((a, b) => a.loyal - b.loyal).slice(0, 2);
      const v = pick(t), amt = (6 + 2 * grudge) * traitOf(v).corrupt;
      corruptBy(v, amt, 'whisper', p.name);
      v.loyal = clamp(v.loyal - 3, 0, 100);
      feed(s, 'shadow', '타락한 ' + p.name + '이(가) 사도 ' + v.name + '의 꿈속에서 속삭입니다. (타락 ' + Math.floor(Math.min(100, v.corrupt)) + ')', v.patron, now, { a: v.id });
      if (v.corrupt >= 100) fall(s, v, now);
    } else {
      const q = free(s).slice().sort((a, b) => b.corrupt - a.corrupt)[0];
      q.status = 'fallen'; q.patron = i; q.cause = 'recruit'; q.grudge = 1; q.corrupt = 100; q.title = p.name + '의 추종자';
      corruptBy(q, 0, 'recruit');
      g.tension.rebellion += 4;
      feed(s, 'shadow', q.origin + '의 ' + q.name + '이(가) 타락한 ' + p.name + '을(를) 따라 어둠으로 걸어 들어갔습니다.', i, now, { a: q.id });
    }
    return kind;
  }

  /** 성좌는 잃은 사도를 쫓는다: 사도(파티째로)를 보내 구원하거나 없앤다 */
  function hunt(s, now) {
    const fs = fallen(s);
    if (!fs.length) return null;
    for (const f of fs.slice().sort(() => rnd() - 0.5)) {
      const own = f.patron >= 0 ? apostleOf(s, f.patron) : null;
      const hunter = own && rnd() < 0.035 ? own : rnd() < 0.012 ? pick(livingApostles(s).filter(p => p.hp > p.maxHp * 0.5)) : null;
      if (!hunter) continue;
      return clash(s, hunter, f, now);
    }
    return null;
  }
  function clash(s, hunter, f, now) {
    const team = partyMembers(s, hunter);
    const isOwn = hunter.patron === f.patron;
    const T = team.reduce((a, p) => a + power(p), 0) * (1 + 0.08 * (team.length - 1));
    const F = power(f) * (1 + 0.15 * (f.grudge || 1)) * 1.6;
    const win = rnd() < clamp(T / (T + F) + 0.1, 0.1, 0.92);
    const who = team.length > 1 ? '파티 \'' + partyOf(s, hunter).name + '\'' : '사도 ' + hunter.name;
    const foe = { look: f.look, cls: f.cls, corrupt: 100, status: 'fallen' };
    team.forEach(p => {
      p.act = { kind: win ? 'win' : 'lose', t: now, region: 4, foe, dmg: Math.round(p.maxHp * (win ? 0.15 : 0.4)) };
      p.hp -= Math.round(p.maxHp * (win ? 0.1 + rnd() * 0.15 : 0.3 + rnd() * 0.2));
    });
    const extra = { a: f.id, cs: team.map(p => p.patron) };
    let out;
    if (win) {
      team.forEach(p => { p.xp += xpNeed(p.lvl) * 0.8; p.deeds += 2; levelUp(s, p, now); });
      addFame(s, hunter.patron, isOwn ? 8 : 5);
      const redeem = rnd() < (f.cause === 'recruit' ? 0.6 : isOwn ? 0.55 : 0.25) + (f.cause === 'neglect' && isOwn ? 0.1 : 0);
      if (redeem) {
        const from = f.patron;
        f.status = 'free'; f.patron = -1; f.corrupt = 15; f.loyal = 45; f.title = '구원받은 자'; f.grudge = 0; f.cause = ''; f.cs = {}; f.hp = f.maxHp;
        s.saga.stats.redeemed++;
        feed(s, 'redeem', isOwn
          ? '성좌 \'' + cname(hunter.patron) + '\'이(가) ' + who + '을(를) 보내 잃었던 ' + f.name + '을(를) 되찾았습니다. ' + f.name + '은(는) 다시 세계로 돌아갑니다.'
          : who + '이(가) 타락한 ' + f.name + '을(를) 꺾고 구원했습니다. ' + (from >= 0 ? '성좌 \'' + cname(from) + '\'의 옛 사도였습니다.' : ''), hunter.patron, now, Object.assign(extra, { big: true }));
        feed(s, 'voice', SD.voices[hunter.patron].like, hunter.patron, now);
        out = 'redeem';
      } else {
        feed(s, 'hunt', who + '이(가) 타락한 ' + f.name + '을(를) 쓰러뜨렸습니다. 검은 별빛이 흩어져 사라집니다.', hunter.patron, now, Object.assign(extra, { big: true }));
        toHall(s, f, 'destroyed', now);
        out = 'destroy';
      }
    } else {
      f.grudge = Math.min(GRUDGE_MAX, (f.grudge || 1) + 1); f.lvl += 1; f.atk += 2;
      team.forEach(p => corruptBy(p, 5 * traitOf(p).corrupt, 'fear'));
      feed(s, 'hunt', who + '이(가) 타락한 ' + f.name + '을(를) 쫓았지만 놓쳤습니다. ' + f.name + '의 원한이 깊어집니다.', hunter.patron, now, extra);
      out = 'escape';
    }
    team.forEach(p => { if (p.status === 'apostle' && p.hp <= 0) nearDeath(s, p, now, f.name); if (p.status === 'apostle' && p.corrupt >= 100) fall(s, p, now); });
    return out;
  }

  /* ───────────── 파티: 사도들끼리 뭉쳐 더 강한 몬스터를 상대한다 ───────────── */

  const RIVALS = [[0, 5], [2, 7], [5, 4]];
  const rivals = (a, b) => RIVALS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
  const partyOf = (s, p) => (p && p.party ? s.saga.parties.find(q => q.id === p.party) || null : null);
  function partyMembers(s, p) {
    const q = partyOf(s, p);
    return q ? q.members.map(id => person(s, id)).filter(m => m && m.status === 'apostle') : [p];
  }
  function compat(a, b) {
    return 1 + (traitOf(a).likes.includes(b.patron) ? 0.4 : 0) + (traitOf(b).likes.includes(a.patron) ? 0.4 : 0) + (a.cls !== b.cls ? 0.3 : 0) - (rivals(a.patron, b.patron) ? 1 : 0) - (a.corrupt + b.corrupt) / 200 + rnd() * 0.4;
  }
  function names(list) { return list.map(p => p.name).join(', '); }
  function cleanParties(s, now) {
    const g = s.saga;
    g.parties = g.parties.filter(q => {
      q.members = q.members.filter(id => { const m = person(s, id); const ok = m && m.status === 'apostle' && m.party === q.id; if (m && !ok && m.party === q.id) m.party = 0; return ok; });
      const corrupt = q.members.map(id => person(s, id)).find(m => m.corrupt >= 60);
      if (corrupt && q.members.length > 2 && rnd() < 0.03) {
        q.members = q.members.filter(id => id !== corrupt.id); corrupt.party = 0;
        feed(s, 'party', corrupt.name + '의 눈빛이 변하자 파티 \'' + q.name + '\'의 동료들이 그를 내보냈습니다.', corrupt.patron, now, { a: corrupt.id });
      }
      const split = q.members.length >= 2 && rnd() < 0.0015;
      if (q.members.length >= 2 && !split) return true;
      q.members.forEach(id => { const m = person(s, id); if (m) m.party = 0; });
      feed(s, 'party', '파티 \'' + q.name + '\'이(가) ' + (split ? '서로 갈 길을 정하고 ' : '') + '해산했습니다. (승리 ' + q.wins + '회)', -1, now);
      return false;
    });
  }
  function formParty(s, now) {
    const g = s.saga;
    const loose = livingApostles(s).filter(p => !p.party && p.hp > p.maxHp * 0.5);
    // 자리가 빈 파티에 합류
    if (loose.length && rnd() < 0.03) {
      const q = g.parties.filter(x => x.members.length < PARTY_MAX)[0];
      if (q) {
        const lead = person(s, q.leader) || person(s, q.members[0]);
        const p = loose.slice().sort((a, b) => compat(b, lead) - compat(a, lead))[0];
        if (compat(p, lead) > 0.8) {
          q.members.push(p.id); p.party = q.id;
          feed(s, 'party', '사도 ' + p.name + '이(가) 파티 \'' + q.name + '\'에 합류했습니다.', p.patron, now, { a: p.id, cs: partyMembers(s, p).map(m => m.patron) });
          return q;
        }
      }
    }
    if (loose.length < 2 || rnd() > 0.06) return null;
    const lead = pick(loose);
    const want = 2 + Math.floor(rnd() * 3);
    const mates = loose.filter(p => p !== lead).map(p => [p, compat(lead, p)]).filter(([, c]) => c > 0.8).sort((a, b) => b[1] - a[1]).slice(0, want - 1).map(([p]) => p);
    if (!mates.length) return null;
    const used = new Set(g.parties.map(q => q.name));
    const name = SD.partyNames.find(n => !used.has(n) && rnd() < 0.5) || SD.partyNames.find(n => !used.has(n)) || lead.name + '의 원정대';
    const q = { id: g.nextParty++, name, leader: lead.id, members: [lead.id, ...mates.map(p => p.id)], formed: now, wins: 0 };
    g.parties.push(q);
    g.stats.parties++;
    const all = [lead, ...mates];
    all.forEach(p => { p.party = q.id; });
    feed(s, 'party', '사도 ' + names(all) + '이(가) 파티 \'' + name + '\'을(를) 결성했습니다.', lead.patron, now, { a: lead.id, cs: all.map(p => p.patron) });
    return q;
  }
  /** 파티 전투: 인원과 평균 레벨에 맞춰 더 강한 몬스터를 부른다. 승률은 혼자 싸울 때와 비슷하게, 보상은 크게. */
  function partyBattle(s, q, now) {
    const ms = q.members.map(id => person(s, id)).filter(m => m && m.status === 'apostle');
    const n = ms.length;
    if (n < 2) return null;
    if (ms.reduce((a, p) => a + p.hp / p.maxHp, 0) / n < 0.5) {
      const region = ms[0].act && ms[0].act.region !== undefined ? ms[0].act.region : 0;
      ms.forEach(p => { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.45)); p.act = { kind: 'rest', t: now, region, party: q.id }; });
      return 'rest';
    }
    const avgLvl = ms.reduce((a, p) => a + p.lvl, 0) / n;
    const region = regionFor({ lvl: avgLvl + 3 * n, corrupt: Math.max(...ms.map(p => p.corrupt)) }), reg = SD.regions[region];
    const pool = SD.monsters.filter(m => m.lvl <= avgLvl / 2 + 1 + n && (!m.dark || reg.dark || rnd() < 0.2)).sort((a, b) => b.lvl - a.lvl).slice(0, 3);
    const m = pick(pool.length ? pool : SD.monsters.slice(0, 3));
    const elite = rnd() < 0.12;
    const mLvl = Math.max(1, Math.round(avgLvl + 1 + 1.5 * n + rnd() * 5));
    const mPow = (10 + mLvl * 7) * (1 + m.lvl * 0.12) * (reg.dark ? 1.25 : 1) * n * 0.75 * (elite ? 1.6 : 1);
    const P = ms.reduce((a, p) => a + power(p), 0) * (1 + 0.08 * (n - 1));
    const win = rnd() < clamp(P / (P + mPow) + 0.18, 0.12, 0.95);
    ms.forEach(p => {
      const dmg = Math.round(p.maxHp * (win ? 0.03 + rnd() * 0.12 : 0.2 + rnd() * 0.22));
      p.hp -= dmg;
      if (m.dark || reg.dark) corruptBy(p, (1.5 + rnd() * 2) * traitOf(p).corrupt, 'dark');
      p.act = { kind: win ? 'win' : 'lose', t: now, monster: m.id, region, dmg, party: q.id, elite };
      if (win) { p.xp += (8 + mLvl * 5) * (elite ? 2 : 1); p.deeds++; }
    });
    const tag = '파티 \'' + q.name + '\'(' + n + '인)';
    const extra = { a: q.leader, cs: ms.map(p => p.patron), big: elite && win };
    const c = (person(s, q.leader) || ms[0]).patron;
    if (win) {
      q.wins++;
      if (elite || rnd() < 0.1) feed(s, 'party', tag + '이(가) ' + reg.name + '에서 ' + (elite ? '정예 ' : '') + 'Lv.' + mLvl + ' ' + m.name + '을(를) 쓰러뜨렸습니다.', c, now, extra);
    } else if (rnd() < 0.2) feed(s, 'party', tag + '이(가) ' + reg.name + '에서 Lv.' + mLvl + ' ' + m.name + '에게 밀려 물러났습니다.', c, now, extra);
    ms.forEach(p => { if (p.hp <= 0) nearDeath(s, p, now, m.name); else levelUp(s, p, now); });
    return win ? 'win' : 'lose';
  }

  /* ───────────── 공물: 앱을 꺼 둔 동안 성좌들이 알아서 거둬 간다 ───────────── */

  function tribute(s, gain, now) {
    const list = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => awake(s, i));
    if (!list.length || !gain || gain.isZero()) return null;
    const total = BigNum.min(s.matter, gain.mul(TRIBUTE));
    if (total.isZero()) return null;
    const inf = influence(s);
    s.matter = s.matter.sub(total);
    s.saga.stats.tribute = s.saga.stats.tribute.add(total);
    const parts = list.map(i => ({ i, amount: total.mul(inf[i]) })).sort((a, b) => inf[b.i] - inf[a.i]);
    parts.forEach(x => offer(s, x.i, x.amount, now));
    feed(s, 'tribute', '자리를 비운 사이 성좌들이 공물을 거둬 갔습니다: ' + parts.map(x => cname(x.i) + ' ' + core().fmtShort(x.amount)).join(' · '), -1, now, { cs: list });
    return { total, frac: TRIBUTE, parts };
  }

  /* ───────────── 전조와 운명 사건 ───────────── */

  // 이름 받침에 맞춰 조사를 고른다 (카엘이 / 루나가)
  const JOSA = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] };
  function josa(word, p) {
    const c = word.charCodeAt(word.length - 1), pair = JOSA[p];
    if (!pair) return p;
    return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0 ? pair[0] : pair[1];
  }
  /** {A}·{F} 자리에 이름을 넣는다. 앞에 '사도'·'타락한' 수식어가 없으면 prefix를 붙인다. */
  function fillName(text, key, name, prefix) {
    const re = new RegExp('(사도\\s*|타락한\\s*(?:사도\\s*|자\\s*)?)?\\{' + key + '\\}(이|가|은|는|을|를|과|와)?', 'g');
    return text.replace(re, (m, pre, p) => (pre || prefix) + name + (p ? josa(name, p) : ''));
  }

  // 긴장도가 낮을 땐 거의 0.01%에 머물다가, 전조가 충분히 쌓이면 가파르게 70%까지 치솟는다
  const logistic = t => 1 / (1 + Math.exp(-(t - P_MID) / P_W));
  const L0 = logistic(0);
  function prob(t) { return P_BASE + (P_MAX - P_BASE) * Math.max(0, (logistic(Math.max(0, t)) - L0) / (1 - L0)); }

  // 사건에 실제로 엮이는 건 깨어난 성좌뿐이다
  function involvedOf(s, f) {
    if (f.involve === 'all') return [0, 1, 2, 3, 4, 5, 6, 7].filter(i => awake(s, i));
    if (f.involve === 'one') { const c = livingApostles(s).map(p => p.patron); return c.length ? [pick(c)] : []; }
    return f.involve.slice();
  }

  function fateReady(s, f) {
    const inv = f.involve === 'one' ? livingApostles(s).map(p => p.patron) : involvedOf(s, f);
    const awakeN = inv.filter(i => awake(s, i)).length;
    // 이름이 박힌 사건은 그 성좌들이 모두 깨어 있어야 일어난다
    if (Array.isArray(f.involve) && awakeN < f.involve.length) return false;
    if (awakeN < (f.minInvolved || 1)) return false;
    if (f.need === 'fallen' && !fallen(s).length) return false;
    if (f.involve === 'one' && !inv.length) return false;
    return true;
  }

  // 문장에 등장하는 성좌가 모두 깨어 있어야 그 문장을 쓸 수 있다 (잠든 성좌가 말하거나 움직이지 않게)
  const NAME_RE = ['오리온', '(?<![가-힣])리라', '카시오페이아', '페가수스', '백조', '전갈', '큰곰', '안드로메다'].map(n => new RegExp(n));
  const textNeedCache = new Map();
  function textNeeds(text) {
    let r = textNeedCache.get(text);
    if (!r) {
      const set = new Set();
      NAME_RE.forEach((re, i) => { if (re.test(text)) set.add(i); });
      if (/사대성좌|네 성좌/.test(text)) [0, 2, 4, 6].forEach(i => set.add(i));
      const min = /성좌들|모든 성좌|다른 성좌|성좌 하나/.test(text) ? 2 : 0;
      r = { set: [...set], min };
      textNeedCache.set(text, r);
    }
    return r;
  }
  function textOk(s, text) {
    const r = textNeeds(text);
    return r.set.every(i => awake(s, i)) && s.constellations.filter(c => c.apostleFound).length >= r.min;
  }

  function omenReady(s, o) {
    if (o.c >= 0 && !awake(s, o.c)) return false;
    // 단계형 빌드업: 앞 단계 전조로 긴장도가 충분히 쌓여야 다음 단계 전조가 등장한다
    if (o.min) for (const id in o.min) if ((s.saga.tension[id] || 0) < o.min[id]) return false;
    if (o.need === 'apostle' && !livingApostles(s).length) return false;
    if (o.need === 'two' && livingApostles(s).length < 2) return false;
    if (o.need === 'corrupt' && !livingApostles(s).some(p => p.corrupt >= 30)) return false;
    if (o.need === 'fallen' && !fallen(s).length) return false;
    // 이 전조가 주로 쌓는 사건이 아직 일어날 수 없으면(엮인 성좌가 잠듦) 나오지 않는다
    const main = FATE[Object.keys(o.add).sort((a, b) => o.add[b] - o.add[a])[0]];
    if (!main || !fateReady(s, main)) return false;
    return textOk(s, o.text);
  }

  function omen(s, now) {
    const list = SD.omens.filter(o => omenReady(s, o));
    if (!list.length) return;
    // 빌드업: 이미 긴장이 쌓인 사건의 전조일수록 더 자주 일어난다 (눈덩이처럼 굴러간다)
    const T = s.saga.tension;
    const weight = o => (o.big ? 0.22 : 1) * (1 + Object.keys(o.add).reduce((a, id) => a + o.add[id] * Math.max(0, T[id] || 0), 0) / MOMENTUM);
    let total = 0;
    for (const o of list) total += weight(o);
    let r = rnd() * total, o = list[0];
    for (const x of list) { r -= weight(x); if (r <= 0) { o = x; break; } }
    let text = o.text, target = null;
    if (text.includes('{A}')) {
      const cand = o.need === 'corrupt' ? livingApostles(s).filter(p => p.corrupt >= 30) : livingApostles(s);
      target = pick(cand);
      text = fillName(text, 'A', target.name, '사도 ');
    }
    if (text.includes('{F}')) text = fillName(text, 'F', pick(fallen(s)).name, '타락한 ');
    if (target && o.fx) {
      if (o.fx.corrupt) corruptBy(target, o.fx.corrupt * traitOf(target).corrupt, 'fate');
      if (o.fx.loyalty) target.loyal = clamp(target.loyal + o.fx.loyalty, 0, 100);
      if (o.fx.xp) { target.xp += o.fx.xp; levelUp(s, target, now); }
      if (o.fx.hp) target.hp = Math.max(1, target.hp + Math.round(target.maxHp * o.fx.hp / 100));
    }
    for (const id in o.add) if (FATE[id] && fateReady(s, FATE[id])) s.saga.tension[id] = (s.saga.tension[id] || 0) + o.add[id];
    s.saga.stats.omens++;
    const top = Object.keys(o.add).sort((a, b) => o.add[b] - o.add[a])[0];
    feed(s, o.big ? 'omen-big' : 'omen', text, o.c >= 0 ? o.c : (target ? target.patron : -1), now, { fate: top, big: !!o.big, a: target ? target.id : undefined });
    if (o.c >= 0 && rnd() < 0.3) feed(s, 'voice', SD.voices[o.c].watch, o.c, now);
  }

  function checkFates(s, now) {
    const ready = SD.fates.filter(f => fateReady(s, f));
    // 확률이 높은 사건부터 굴린다 (한 걸음에 하나만)
    ready.sort((a, b) => s.saga.tension[b.id] - s.saga.tension[a.id]);
    for (const f of ready) {
      if (rnd() < prob(s.saga.tension[f.id])) { resolve(s, f, now); return f; }
    }
    return null;
  }

  function resolve(s, f, now) {
    const inv = involvedOf(s, f);
    const st = s.saga.stats;
    st.fates++;
    st.seen[f.id] = (st.seen[f.id] || 0) + 1;
    const before = s.saga.tension[f.id];
    // 막 일어난 사건은 한동안 잠잠하다: 긴장도를 0보다 아래로 내려 다시 쌓는 데 시간이 걸리게 한다
    s.saga.tension[f.id] = -COOLDOWN;
    feed(s, 'fate', '【운명 사건】 ' + f.name + ' — ' + pick(f.story.filter(t => textOk(s, t)).length ? f.story.filter(t => textOk(s, t)) : f.story), -1, now, { fate: f.id, big: true, inv, p: prob(before) });

    // 엮인 성좌가 많을수록, 그 성좌들의 영향력이 클수록 많이 가져간다 (최대 60%)
    const inf = influence(s), infSum = inv.reduce((a, i) => a + inf[i], 0);
    const frac = takeFraction(inv.length, infSum);
    const taken = s.matter.mul(frac);
    if (!taken.isZero()) {
      s.matter = s.matter.sub(taken);
      st.taken = st.taken.add(taken);
      inv.slice().sort((a, b) => inf[b] - inf[a]).forEach(i => {
        const share = taken.mul(inf[i] / infSum);
        offer(s, i, share, now);
        core().absorb(s, i, share, now);
        feed(s, 'take', '성좌 \'' + cname(i) + '\'(영향력 ' + (inf[i] * 100).toFixed(1) + '%)이(가) 당신의 우주에서 반물질을 ' + core().fmtShort(share) + '만큼 가져갔습니다.', i, now, { fate: f.id });
      });
    }
    inv.forEach(i => addFame(s, i, 3));
    const out = { id: f.id, inv, taken, frac, lines: [] };
    for (const e of f.effects) applyEffect(s, f, e, inv, now, out);
    // 사건은 다른 사건을 부른다
    const others = SD.fates.filter(x => x.id !== f.id && fateReady(s, x));
    if (others.length) { const o = pick(others); s.saga.tension[o.id] += 3 + Math.floor(rnd() * 6); }
    core().emitSaga('fateDone', out);
    return out;
  }

  function takeFraction(n, infSum) { return Math.min(0.6, 0.03 * Math.pow(n, 1.5) * (0.6 + 2 * infSum)); }

  function apostlesIn(s, inv) { return inv.map(i => apostleOf(s, i)).filter(Boolean); }

  function fight(s, a, b, now, deathChance, f) {
    const wa = power(a) * (0.7 + rnd() * 0.6), wb = power(b) * (0.7 + rnd() * 0.6);
    const [w, l] = wa >= wb ? [a, b] : [b, a];
    w.xp += xpNeed(w.lvl) * 1.5; w.deeds += 3; levelUp(s, w, now);
    if (w.status === 'apostle') addFame(s, w.patron, 6);
    w.act = { kind: 'win', t: now, rival: l.id };
    feed(s, 'fate-fx', w.name + '이(가) ' + l.name + '을(를) 꺾었습니다.', w.patron, now, { a: w.id, fate: f.id });
    if (rnd() < deathChance) { if (l.status === 'fallen') { feed(s, 'fate-fx', '타락한 ' + l.name + '이(가) 소멸했습니다.', -1, now, { fate: f.id }); toHall(s, l, 'destroyed', now); return w; } die(s, l, now, w.name); }
    else { l.hp = Math.max(1, Math.round(l.maxHp * 0.1)); corruptBy(l, 8 * traitOf(l).corrupt, 'fear'); l.act = { kind: 'lose', t: now }; }
    return w;
  }

  function applyEffect(s, f, e, inv, now, out) {
    const aps = apostlesIn(s, inv);
    switch (e.type) {
      case 'buff': {
        const b = s.saga.buff;
        b.mult = now < b.endsAt ? Math.max(b.mult, e.mult) : e.mult;
        b.endsAt = Math.max(b.endsAt, now) + e.minutes * 60000;
        feed(s, 'fate-fx', '하늘의 잔향이 남았습니다: ' + e.minutes + '분간 모든 생산 ×' + e.mult, -1, now, { fate: f.id });
        out.lines.push(e.minutes + '분간 생산 ×' + e.mult);
        break;
      }
      case 'matter': {
        const gain = core().production(s, now).mul(e.minutes * 60);
        core().giveMatter(s, gain);
        feed(s, 'fate-fx', '별들이 남긴 조각을 주웠습니다: 반물질 +' + core().fmtShort(gain), -1, now, { fate: f.id });
        out.lines.push('반물질 +' + core().fmtShort(gain));
        break;
      }
      case 'ip':
        s.ip += e.amount;
        feed(s, 'fate-fx', '인피니티 포인트 +' + e.amount, -1, now, { fate: f.id });
        out.lines.push('IP +' + e.amount);
        break;
      case 'bless':
        aps.forEach(p => { p.hp = p.maxHp; p.xp += xpNeed(p.lvl); p.loyal = clamp(p.loyal + 15, 0, 100); p.corrupt = Math.max(0, p.corrupt - 10); levelUp(s, p, now); p.act = { kind: 'level', t: now }; });
        if (aps.length) { feed(s, 'fate-fx', aps.map(p => p.name).join(', ') + '이(가) 축복을 받았습니다.', -1, now, { fate: f.id }); out.lines.push('사도 ' + aps.length + '명 축복'); }
        break;
      case 'duel': {
        let a = e.a !== undefined ? apostleOf(s, e.a) : null, b = e.b !== undefined ? apostleOf(s, e.b) : null;
        const pool = aps.length > 1 ? aps : livingApostles(s);
        if (!a) a = pick(pool.filter(p => p !== b)) || null;
        if (!b) b = pick(pool.filter(p => p !== a)) || null;
        if (a && b && a !== b) { const w = fight(s, a, b, now, 0.5, f); out.lines.push('결투 승자: ' + w.name); }
        else out.lines.push('결투 상대가 없어 별들이 실망했습니다');
        break;
      }
      case 'arena': {
        const list = (aps.length > 1 ? aps : livingApostles(s)).slice().sort(() => rnd() - 0.5);
        const wins = [];
        for (let k = 0; k + 1 < list.length; k += 2) if (list[k].status === 'apostle' && list[k + 1].status === 'apostle') wins.push(fight(s, list[k], list[k + 1], now, 0.25, f).name);
        out.lines.push(wins.length ? '승자: ' + wins.join(', ') : '투기장에 설 사도가 부족했습니다');
        break;
      }
      case 'trial': {
        const p = e.c !== undefined && apostleOf(s, e.c) ? apostleOf(s, e.c) : pick(aps.length ? aps : livingApostles(s));
        if (!p) { out.lines.push('시험을 치를 사도가 없었습니다'); break; }
        const ok = rnd() < clamp(0.35 + p.lvl * 0.025 * e.power + p.luck * 0.01, 0.15, 0.9);
        if (ok) {
          p.lvl += 3; p.atk = Math.round(p.atk * 1.2); p.maxHp = Math.round(p.maxHp * 1.2); p.hp = p.maxHp;
          p.title = pick(SD.titles); p.deeds += 5; p.act = { kind: 'level', t: now };
          addFame(s, p.patron, 10);
          feed(s, 'fate-fx', p.name + '이(가) 시련을 통과하고 \'' + p.title + '\'의 칭호를 얻었습니다!', p.patron, now, { a: p.id, fate: f.id, big: true });
          out.lines.push(p.name + ' 시련 통과');
        } else if (rnd() < 0.65) { die(s, p, now, '시련'); out.lines.push(p.name + ' 시련 중 사망'); }
        else { corruptBy(p, 30 * traitOf(p).corrupt, 'trial'); p.hp = 1; feed(s, 'fate-fx', p.name + '이(가) 시련에서 무너졌습니다. 마음 한구석이 검게 물들었습니다.', p.patron, now, { a: p.id, fate: f.id }); out.lines.push(p.name + ' 시련 실패'); if (p.corrupt >= 100) fall(s, p, now); }
        break;
      }
      case 'corrupt': {
        const list = e.one ? [pick(aps.length ? aps : livingApostles(s))].filter(Boolean) : aps;
        list.forEach(p => {
          corruptBy(p, e.amount * traitOf(p).corrupt, 'fate');
          feed(s, 'fate-fx', p.name + '의 영혼이 어둠에 물들었습니다 (타락도 ' + Math.floor(Math.min(100, p.corrupt)) + ').', p.patron, now, { a: p.id, fate: f.id });
          if (p.corrupt >= 100) fall(s, p, now);
        });
        out.lines.push(list.length ? '사도 ' + list.length + '명 타락 진행' : '어둠이 갈 곳을 잃었습니다');
        break;
      }
      case 'purify': {
        livingApostles(s).forEach(p => { p.corrupt = Math.max(0, p.corrupt - e.amount); });
        fallen(s).forEach(p => {
          if (rnd() < 0.5) {
            p.status = 'free'; p.patron = -1; p.corrupt = 20; p.loyal = 40; p.title = '구원받은 자';
            feed(s, 'fate-fx', '타락했던 ' + p.name + '이(가) 얼음 속에서 정화되어 세계로 돌아왔습니다.', -1, now, { a: p.id, fate: f.id, big: true });
          } else { feed(s, 'fate-fx', '타락한 ' + p.name + '이(가) 심판받아 얼음 속에 봉인되었습니다.', -1, now, { fate: f.id }); toHall(s, p, 'sealed', now); }
        });
        out.lines.push('타락 정화');
        break;
      }
      case 'betray': {
        const cand = aps.filter(p => e.to === undefined || p.patron !== e.to).sort((a, b) => a.loyal - b.loyal)[0] || livingApostles(s).sort((a, b) => a.loyal - b.loyal)[0];
        if (cand && cand.loyal < 70) { betray(s, cand, now, e.to !== undefined ? [e.to] : inv); out.lines.push(cand.name + ' 배신'); }
        else out.lines.push('모든 사도가 충성을 지켰습니다');
        break;
      }
      case 'rebellion': {
        const fs = fallen(s);
        if (!fs.length) break;
        const villain = fs[fs.length - 1];
        villain.lvl += 2; villain.atk += 4;
        const targets = livingApostles(s).sort(() => rnd() - 0.5).slice(0, 3);
        let defeated = false;
        for (const t of targets) { if (villain.status !== 'fallen') break; const w = fight(s, t, villain, now, 0.45, f); if (w === t && villain.status !== 'fallen') { defeated = true; break; } }
        if (defeated || !s.saga.people.includes(villain)) {
          const gain = core().production(s, now).mul(15 * 60);
          core().giveMatter(s, gain);
          out.lines.push('반란 진압 · 반물질 +' + core().fmtShort(gain));
        } else out.lines.push(villain.name + '의 반란이 계속됩니다');
        break;
      }
      case 'wed': {
        const a = apostleOf(s, 1) || pick(aps), b = apostleOf(s, 3) || pick(livingApostles(s).filter(p => p !== a));
        if (a && b && a !== b) {
          [a, b].forEach(p => { p.loyal = 100; p.hp = p.maxHp; p.corrupt = Math.max(0, p.corrupt - 30); p.title = '별의 연인'; p.act = { kind: 'level', t: now }; });
          feed(s, 'fate-fx', a.name + '와(과) ' + b.name + '이(가) 별빛 아래에서 맺어졌습니다.', -1, now, { fate: f.id, big: true });
          out.lines.push(a.name + ' ♥ ' + b.name);
        } else out.lines.push('신랑 신부가 나타나지 않았습니다');
        break;
      }
      case 'hero': {
        const p = spawn(s, now, { lvl: 8 + Math.floor(rnd() * 5), title: '작은곰의 아이', trait: 2 });
        p.luck += 10;
        feed(s, 'fate-fx', p.origin + '에서 비범한 아이 ' + p.name + '이(가) 태어났습니다. 성좌들이 눈독을 들입니다.', 6, now, { a: p.id, fate: f.id, big: true });
        out.lines.push('영웅 ' + p.name + ' 탄생');
        break;
      }
    }
  }

  /* ───────────── 진행 ───────────── */

  function step(s, now) {
    ensureWorld(s, now);
    for (let i = 0; i < 8; i++) if (awake(s, i) && !apostleOf(s, i) && rnd() < 0.35) choose(s, i, now);
    cleanParties(s, now);
    formParty(s, now);
    for (const q of s.saga.parties.slice()) partyBattle(s, q, now);
    for (const p of livingApostles(s)) { if (!p.party) adventure(s, p, now); life(s, p, now); }
    for (const p of fallen(s)) { p.xp += 10; levelUp(s, p, now); fallenAct(s, p, now); }
    hunt(s, now);
    for (const id in s.saga.tension) s.saga.tension[id] *= 0.995;
    for (let i = 0; i < 8; i++) s.saga.fame[i] *= 0.999;
    s.saga.ticks = (s.saga.ticks || 0) + 1;
    return s.saga.ticks % CHECK_EVERY === 0 ? checkFates(s, now) : null;
  }

  /** 실시간 진행 */
  function update(s, dt, now) {
    if (!s.constellations.some(c => c.apostleFound)) return;
    const g = s.saga;
    g.acc += dt;
    while (g.acc >= TICK) { g.acc -= TICK; step(s, now); }
    if (now >= g.omenAt) { omen(s, now); g.omenAt = now + (20 + rnd() * 25) * 1000; }
  }

  /** 자리를 비운 동안: 최대 2시간 분량의 사건만 재생하고 요약을 돌려준다 */
  function offline(s, seconds, now) {
    if (!s.constellations.some(c => c.apostleFound)) return null;
    const steps = Math.min(Math.floor(seconds / TICK), 480);
    const st = s.saga.stats;
    const before = { deaths: st.deaths, betrayals: st.betrayals, falls: st.falls, fates: st.fates, redeemed: st.redeemed, parties: st.parties, feed: s.saga.feed.length };
    const startFeed = s.saga.feed[s.saga.feed.length - 1];
    const start = now - steps * TICK * 1000;
    for (let k = 0; k < steps; k++) {
      const t = start + k * TICK * 1000;
      step(s, t);
      if (k % 2 === 1) omen(s, t);
    }
    s.saga.omenAt = now + 20000;
    const idx = startFeed ? s.saga.feed.indexOf(startFeed) : -1;
    const fresh = s.saga.feed.slice(idx + 1).filter(f => f.big);
    return {
      steps, deaths: s.saga.stats.deaths - before.deaths, betrayals: s.saga.stats.betrayals - before.betrayals,
      falls: st.falls - before.falls, fates: st.fates - before.fates, redeemed: st.redeemed - before.redeemed, parties: st.parties - before.parties,
      highlights: fresh.slice(-6).map(f => f.text)
    };
  }

  function prodMult(s, now) {
    // 사도 레벨 합 1당 +0.5%, 최대 ×2 (파티로 레벨이 빨리 올라도 게임 속도가 무너지지 않게)
    let k = 1 + Math.min(1, livingApostles(s).reduce((a, p) => a + p.lvl, 0) * 0.005);
    if (now < s.saga.buff.endsAt) k *= s.saga.buff.mult;
    return k;
  }

  /* ───────────── 저장 검증 ───────────── */

  function revive(raw, now) {
    const g = fresh(now);
    if (!raw || typeof raw !== 'object') return g;
    const num = (v, a = 0, b = 1e9) => { const x = Number(v); return Number.isFinite(x) ? clamp(x, a, b) : a; };
    const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
    const ids = new Set();
    g.people = (Array.isArray(raw.people) ? raw.people : []).slice(0, 40).map(p => {
      if (!p || typeof p !== 'object') return null;
      const status = ['free', 'apostle', 'fallen'].includes(p.status) ? p.status : 'free';
      const q = {
        id: Math.floor(num(p.id, 1, 1e9)), name: str(p.name, 20) || '이름 없는 자', cls: Math.floor(num(p.cls, 0, SD.classes.length - 1)), trait: Math.floor(num(p.trait, 0, SD.traits.length - 1)),
        origin: str(p.origin, 30), lvl: Math.floor(num(p.lvl, 1, 999)), xp: num(p.xp, 0, 1e9), hp: num(p.hp, 0, 1e9), maxHp: num(p.maxHp, 1, 1e9), atk: num(p.atk, 1, 1e9), def: num(p.def, 0, 1e9), luck: num(p.luck, 0, 1e6),
        corrupt: num(p.corrupt, 0, 200), loyal: num(p.loyal, 0, 100), status, patron: Math.floor(num(p.patron, -1, 7)), title: str(p.title, 30), deeds: Math.floor(num(p.deeds, 0, 1e9)),
        sponsorAt: num(p.sponsorAt, 0, now), born: num(p.born, 0, now), act: { kind: 'idle', t: now }, look: Math.floor(num(p.look, 0, 1e9)),
        cs: {}, party: Math.floor(num(p.party, 0, 1e9))
      };
      if (p.cs && typeof p.cs === 'object') for (const k in CAUSE) if (p.cs[k]) q.cs[k] = num(p.cs[k], 0, 1e6);
      if (typeof p.csBy === 'string') q.csBy = p.csBy.slice(0, 20);
      if (status === 'fallen') { q.cause = CAUSE[p.cause] ? p.cause : 'dark'; q.grudge = Math.floor(num(p.grudge, 1, GRUDGE_MAX)); }
      if (ids.has(q.id)) return null;
      ids.add(q.id);
      return q;
    }).filter(Boolean);
    g.nextId = Math.max(num(raw.nextId, 1, 1e9), ...g.people.map(p => p.id + 1), 1);
    g.patrons = g.patrons.map((_, i) => {
      const id = Array.isArray(raw.patrons) ? Math.floor(num(raw.patrons[i], 0, 1e9)) : 0;
      const p = g.people.find(x => x.id === id);
      return p && p.status === 'apostle' && p.patron === i ? id : 0;
    });
    g.people.forEach(p => { if (p.status === 'apostle' && g.patrons[p.patron] !== p.id) { p.status = 'free'; p.patron = -1; } });
    // 파티: 살아 있는 사도만, 한 사람은 한 파티에만, 2명 미만이면 해산
    const seat = new Map();
    g.parties = (Array.isArray(raw.parties) ? raw.parties : []).slice(0, 10).map(q => {
      if (!q || typeof q !== 'object') return null;
      const id = Math.floor(num(q.id, 1, 1e9));
      const members = (Array.isArray(q.members) ? q.members : []).map(x => Math.floor(num(x, 0, 1e9)))
        .filter(x => { const m = g.people.find(pp => pp.id === x); return m && m.status === 'apostle' && m.party === id && !seat.has(x); }).slice(0, PARTY_MAX);
      if (members.length < 2) return null;
      members.forEach(x => seat.set(x, id));
      return { id, name: str(q.name, 20) || '이름 없는 원정대', leader: members.includes(q.leader) ? q.leader : members[0], members, formed: num(q.formed, 0, now), wins: Math.floor(num(q.wins, 0, 1e9)) };
    }).filter(Boolean);
    g.people.forEach(p => { p.party = seat.get(p.id) || 0; });
    g.nextParty = Math.max(num(raw.nextParty, 1, 1e9), ...g.parties.map(q => q.id + 1), 1);
    g.fame = g.fame.map((_, i) => num(Array.isArray(raw.fame) ? raw.fame[i] : 0, -50, 500));
    g.power = g.power.map((_, i) => { try { return new BigNum(Array.isArray(raw.power) ? raw.power[i] : 0); } catch (e) { return new BigNum(0); } });
    if (raw.tension && typeof raw.tension === 'object') for (const f of SD.fates) g.tension[f.id] = num(raw.tension[f.id], -COOLDOWN, 1e6);
    g.feed = (Array.isArray(raw.feed) ? raw.feed : []).slice(-MAX_FEED).map(f => f && typeof f.text === 'string' ? {
      t: num(f.t, 0, now), kind: str(f.kind, 12) || 'info', text: f.text.slice(0, 200), c: Math.floor(num(f.c, -1, 7)), big: f.big === true,
      fate: SD.fates.some(x => x.id === f.fate) ? f.fate : undefined, a: f.a !== undefined ? Math.floor(num(f.a, 0, 1e9)) : undefined,
      cs: Array.isArray(f.cs) ? f.cs.slice(0, 8).map(x => Math.floor(num(x, -1, 7))) : undefined
    } : null).filter(Boolean);
    g.hall = (Array.isArray(raw.hall) ? raw.hall : []).slice(-MAX_HALL).map(h => h && typeof h.name === 'string' ? {
      name: h.name.slice(0, 20), cls: Math.floor(num(h.cls, 0, SD.classes.length - 1)), trait: Math.floor(num(h.trait, 0, SD.traits.length - 1)), lvl: Math.floor(num(h.lvl, 1, 999)),
      title: str(h.title, 30), patron: Math.floor(num(h.patron, -1, 7)), fate: str(h.fate, 12), cause: CAUSE[h.cause] ? h.cause : undefined, t: num(h.t, 0, now), look: Math.floor(num(h.look, 0, 1e9))
    } : null).filter(Boolean);
    g.acc = num(raw.acc, 0, TICK);
    g.omenAt = Math.max(now + 15000, num(raw.omenAt, 0, now + 120000));
    if (raw.buff && typeof raw.buff === 'object') { g.buff.mult = num(raw.buff.mult, 1, 100); g.buff.endsAt = num(raw.buff.endsAt, 0, now + 3600000); }
    const rs = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    for (const k of ['deaths', 'betrayals', 'falls', 'fates', 'omens', 'redeemed', 'parties']) g.stats[k] = Math.floor(num(rs[k], 0, 1e9));
    for (const k of ['taken', 'tribute']) { try { g.stats[k] = new BigNum(rs[k] || 0); } catch (e) { g.stats[k] = new BigNum(0); } }
    if (rs.seen && typeof rs.seen === 'object') for (const f of SD.fates) if (rs.seen[f.id]) g.stats.seen[f.id] = Math.floor(num(rs.seen[f.id], 0, 1e9));
    return g;
  }

  CD.saga = {
    TICK, prob, fillName, fixJosa, influence, priceMult, takeFraction, fresh, revive, update, step, offline, prodMult, offer, omen, resolve, checkFates, fateReady, xpNeed, power,
    apostleOf, livingApostles, fallen, free, label, spawn, choose, ensureWorld,
    CAUSE, corruptBy, faith, fallenAct, hunt, clash, partyOf, partyMembers, formParty, partyBattle, tribute, fall
  };
  if (typeof module === 'object' && module.exports) module.exports = CD.saga;
})(typeof globalThis !== 'undefined' ? globalThis : this);
