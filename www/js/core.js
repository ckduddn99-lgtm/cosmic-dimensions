/* 초공간 차원 붕괴 — 게임 규칙 (DOM 없음: 브라우저와 Node 테스트에서 함께 사용)
 * 모든 시간 값은 밀리초 타임스탬프(now)를 인자로 받아 결정적으로 동작한다.
 */
(function (root) {
  'use strict';

  const CD = root.CD = root.CD || {};
  const BigNum = CD.BigNum;
  const D = CD.data;

  const INF = new BigNum(1.79, 308);
  const VERSION = 3;
  const OFFLINE_CAP = 24 * 3600;          // 오프라인 진행 최대 24시간
  const BUFF_COOLDOWN = 60000;            // 과충전 종료 후 재사용 대기
  const COMBO_WINDOW = 1000;
  const COMBO_MAX = 50;
  const NO_TIMED = Infinity;              // 시간제 버프를 무시하고 배율을 계산할 때 쓰는 now

  let listener = null;
  let rng = Math.random;
  const rt = { autoAcc: 0, slowAcc: 0, buffNotified: 0 };

  function emit(type, payload) { if (listener) listener(type, payload || {}); }
  const saga = () => CD.saga || null;
  /** 서사 메시지용 짧은 숫자 표기 (화면 설정과 무관하게 저장된다) */
  function fmtShort(v) {
    v = big(v);
    if (!v.m) return '0';
    return v.e < 6 ? Math.floor(v.toNumber()).toLocaleString('ko-KR') : v.m.toFixed(2) + 'e' + v.e;
  }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
  function count(arr) { let n = 0; for (const v of arr) if (v) n++; return n; }
  function big(v) { return v instanceof BigNum ? v : new BigNum(v); }
  // 누적 연산 오차를 허용한 비교 (필요량을 정확히 투자했을 때 1e-15 차이로 실패하지 않도록)
  function reached(have, need) { return have.gte(need) || (need.m > 0 && have.e === need.e && have.m >= need.m * (1 - 1e-9)); }

  /* ───────────── 상태 ───────────── */

  function fresh(now = Date.now()) {
    return {
      version: VERSION,
      matter: new BigNum(10),
      ip: 0,
      shifts: 0, boosts: 0, galaxies: 0, infinities: 0,
      tickspeedPurchased: 0,
      sacrificed: new BigNum(0),
      dims: D.dims.map(() => ({ amount: new BigNum(0), bought: 0 })),
      infinityUpgrades: D.upgrades.map(() => false),
      automation: { low: true, high: true, reset: true, crunch: true },
      achievements: ACH.map(() => false),
      secretAch: SECRET.map(() => false),
      mastery: D.dims.map(() => ({ xp: 0, level: 0 })),
      buff: { endsAt: 0, readyAt: 0, used: false },
      challenges: D.challenges.map(() => false),
      activeChallenge: -1,
      challengeSnapshot: null,
      constellations: D.constellations.map(() => ({ invested: new BigNum(0), apostleFound: false, level: 0 })),
      apostles: D.apostles.map(() => ({ awake: false, skills: [0, 0, 0], lastRevelation: 0, log: [] })),
      research: D.research.map(() => 0),
      galaxyCollection: [],
      event: { id: null, endsAt: 0, nextAt: now + 4 * 60000 },
      comet: { boostEndsAt: 0 },
      tap: { combo: 0, lastAt: 0 },
      daily: { lastDay: '', streak: 0 },
      saga: saga() ? saga().fresh(now) : null,
      stats: {
        startedAt: now, playSeconds: 0, totalMatter: new BigNum(10), totalPurchases: 0, crunches: 0,
        taps: 0, comets: 0, goldenComets: 0, sacrifices: 0, bestIp: 0, totalIp: 0, maxCombo: 0, longestOffline: 0, bestStreak: 0,
        history: ['새 우주 관측 시작']
      },
      savedAt: now
    };
  }

  function record(s, text) {
    s.stats.history.push(text);
    if (s.stats.history.length > 40) s.stats.history.shift();
  }

  // 반물질은 ∞(1.79e308)에서 멈춘다 — 빅 크런치로만 넘어갈 수 있다
  function addMatter(s, gain) {
    if (gain.isZero()) return;
    const before = s.matter;
    s.matter = BigNum.min(s.matter.add(gain), INF);
    s.stats.totalMatter = s.stats.totalMatter.add(s.matter.sub(before));
  }

  /* ───────────── 배율 ───────────── */

  const unlocked = s => Math.min(8, 4 + s.shifts);
  const hasUpg = (s, i) => !!s.infinityUpgrades[i];
  const rLvl = (s, i) => s.research[i] || 0;
  const inChallenge = (s, i) => s.activeChallenge === i;
  const totalBought = s => s.dims.reduce((a, d) => a + d.bought, 0);
  const maxBought = s => Math.max(...s.dims.map(d => d.bought));

  function constLevel(s, i) { const c = s.constellations[i]; return c.apostleFound ? c.level : 0; }
  function constBonus(s, i) { return constLevel(s, i) * D.constellations[i].per; }
  function achCount(s) { return count(s.achievements) + count(s.secretAch); }
  function achBonus(s) { return 1 + achCount(s) * 0.05 * (1 + constBonus(s, 6)) * (1 + 0.1 * rLvl(s, 9)); }
  function challengeBonus(s) {
    let sum = 0;
    s.challenges.forEach((done, i) => { if (done) sum += D.challenges[i].reward; });
    return sum * (1 + constBonus(s, 5));
  }
  function blessing(s) { return s.apostles.reduce((a, ap) => a + (ap.awake ? ap.skills[0] * 0.05 : 0), 0); }
  function boostBase(s) { return 2 + (hasUpg(s, 0) ? 0.5 : 0) + 0.1 * rLvl(s, 4); }
  // 원작식 틱 배율: 은하 2개까지는 2%씩, 이후 3.5%씩 곱으로 감소 ('은하 가속'은 은하 효과 1.5배)
  function tickBase(s) {
    const g = s.galaxies * (hasUpg(s, 1) ? 1.5 : 1);
    return g < 3 ? 0.9 - 0.02 * g : 0.84 * Math.pow(0.965, g - 2);
  }
  function buffActive(s, now) { return now < s.buff.endsAt; }
  function buffPower(s) { return 2 + 0.1 * rLvl(s, 8); }
  function buffDuration(s) { return 60000 * (1 + constBonus(s, 3)); }
  function eventActive(s, id, now) { return s.event.id === id && now < s.event.endsAt; }
  function cometBoostActive(s, now) { return now < s.comet.boostEndsAt; }
  // '무거운 차원' 도전은 첫 차원이 10배 비싸므로 시작 반물질도 10배로 준다 (시작 직후 막히지 않도록)
  function startMatter(s) { return new BigNum(hasUpg(s, 4) ? 1e5 : 10).mul(inChallenge(s, 1) ? 10 : 1); }
  function setBonusBase(s) { return inChallenge(s, 5) ? 1.5 : 2; }
  function offlineMult(s) {
    const guard = s.apostles.reduce((a, ap) => a + (ap.awake ? ap.skills[1] * 0.1 : 0), 0);
    return 1 + constBonus(s, 4) + 0.5 * rLvl(s, 6) + guard;
  }

  function speed(s, now) {
    let k = (1 + constBonus(s, 1)) * (1 + 0.1 * rLvl(s, 1));
    if (eventActive(s, 'warp', now)) k *= 2;
    if (inChallenge(s, 0)) k *= 0.5;
    return BigNum.pow(1 / tickBase(s), s.tickspeedPurchased).mul(k);
  }

  function globalMult(s, now) {
    let k = achBonus(s) * (1 + constBonus(s, 0)) * (1 + challengeBonus(s)) * (1 + blessing(s)) * (1 + 0.2 * rLvl(s, 0));
    if (hasUpg(s, 3)) k *= 1 + s.infinities;
    if (buffActive(s, now)) k *= buffPower(s);
    if (eventActive(s, 'storm', now)) k *= 3;
    if (saga() && s.saga) k *= saga().prodMult(s, now);
    return BigNum.pow(boostBase(s), s.boosts).mul(k);
  }

  function dimMults(s, now) {
    const g = globalMult(s, now), sb = setBonusBase(s);
    return s.dims.map((d, i) => {
      let k = 1 + s.mastery[i].level * 0.1;
      if (i === 0) {
        if (hasUpg(s, 2)) k *= 100;
        k *= 1 + 0.5 * rLvl(s, 2);
        if (eventActive(s, 'flood', now)) k *= 4;
        if (cometBoostActive(s, now)) k *= 3;
      }
      if (i === 7) k *= sacMult(s);
      return g.mul(BigNum.pow(sb, Math.floor(d.bought / 10))).mul(k);
    });
  }

  /** 초당 반물질 생산량 */
  function production(s, now, mults) {
    mults = mults || dimMults(s, now);
    return s.dims[0].amount.mul(mults[0]).mul(speed(s, now));
  }

  /** i번째 차원이 초당 만들어내는 양 (제1차원은 반물질, 나머지는 바로 아래 차원) */
  function dimOutput(s, i, now, mults, sp) {
    mults = mults || dimMults(s, now);
    sp = sp || speed(s, now);
    const out = s.dims[i].amount.mul(mults[i]).mul(sp);
    return i === 0 ? out : out.mul(0.1);
  }

  /* ───────────── 구매 ───────────── */

  function dimCost(s, i, offset = 0) {
    const d = D.dims[i], b = s.dims[i].bought + offset;
    let c = new BigNum(1, d.costExp + d.stepExp * Math.floor(b / 10));
    if (inChallenge(s, 1)) c = c.mul(10);
    return c;
  }

  /** mode: 1 | 10 | 'max'. 같은 10개 묶음 안에서는 가격이 같으므로 묶음 단위로 계산한다. */
  function buyPlan(s, i, mode) {
    if (i >= unlocked(s)) return { count: 0, cost: new BigNum(0) };
    const target = mode === 'max' ? Infinity : Number(mode) || 1;
    let money = new BigNum(s.matter), n = 0, spent = new BigNum(0);
    while (n < target) {
      const price = dimCost(s, i, n);
      const left = 10 - ((s.dims[i].bought + n) % 10);
      const afford = money.div(price);
      const can = afford.e > 6 ? Infinity : Math.floor(afford.toNumber() * (1 + 1e-12));
      const take = Math.min(left, target - n, can);
      if (take <= 0) break;
      const cost = price.mul(take);
      money = money.sub(cost);
      spent = spent.add(cost);
      n += take;
      if (take < left) break;
    }
    return { count: n, cost: spent };
  }

  function buyDim(s, i, mode = 1) {
    const plan = buyPlan(s, i, mode);
    if (!plan.count) return 0;
    s.matter = s.matter.sub(plan.cost);
    s.dims[i].amount = s.dims[i].amount.add(plan.count);
    s.dims[i].bought += plan.count;
    s.stats.totalPurchases += plan.count;
    return plan.count;
  }

  /** 다음 구매 비용 (mode 기준, 하나도 못 사면 1개 가격) */
  function nextCost(s, i, mode) {
    const plan = buyPlan(s, i, mode);
    return plan.count ? plan.cost : dimCost(s, i);
  }

  function tickCost(s) { return new BigNum(1, 3 + s.tickspeedPurchased); }
  function tickLocked(s) { return inChallenge(s, 4); }
  function canBuyTick(s) { return !tickLocked(s) && s.matter.gte(tickCost(s)); }
  function buyTick(s) {
    if (!canBuyTick(s)) return 0;
    s.matter = s.matter.sub(tickCost(s));
    s.tickspeedPurchased++;
    return 1;
  }
  function buyTickMax(s) { let n = 0; while (canBuyTick(s) && n < 1000) n += buyTick(s); return n; }

  function buyMaxAll(s) {
    let total = 0;
    for (let i = unlocked(s) - 1; i >= 0; i--) total += buyDim(s, i, 'max');
    const ticks = buyTickMax(s);
    return { dims: total, ticks };
  }

  /* ───────────── 리셋 계열 ───────────── */

  function shiftReq() { return 20; }
  function boostReq(s) { return 20 + s.boosts * 15; }
  function galaxyReq(s) { return Math.ceil((80 + s.galaxies * 60) * (1 - 0.05 * rLvl(s, 3))); }
  const topDim = s => s.dims[unlocked(s) - 1];

  function canShift(s) { return unlocked(s) < 8 && !inChallenge(s, 2) && topDim(s).bought >= shiftReq(); }
  function canBoost(s) { return !inChallenge(s, 3) && topDim(s).bought >= boostReq(s); }
  function canGalaxy(s) { return s.shifts >= 4 && s.dims[7].bought >= galaxyReq(s); }
  function canCrunch(s) { return s.activeChallenge < 0 && s.matter.gte(INF); }

  function resetRun(s, depth) {
    s.matter = startMatter(s);
    s.dims.forEach(d => { d.amount = new BigNum(0); d.bought = 0; });
    s.tickspeedPurchased = 0;              // 원작처럼 모든 리셋이 틱스피드를 초기화
    s.sacrificed = new BigNum(0);
    if (depth !== 'dims') { s.shifts = 0; s.boosts = 0; }
    if (depth === 'crunch') s.galaxies = 0;
  }

  /* 차원 희생: 제1~7차원을 바쳐 제8차원 배율을 얻는다 (다음 리셋까지 유지) */
  function sacMultOf(total) { return total.isZero() ? 1 : Math.max(1, Math.pow(total.log10() / 10, 2)); }
  function sacMult(s) { return sacMultOf(s.sacrificed); }
  function sacrificeGain(s) { return sacMultOf(s.sacrificed.add(s.dims[0].amount)) / sacMult(s); }
  function canSacrifice(s) { return unlocked(s) >= 8 && !s.dims[7].amount.isZero() && sacrificeGain(s) > 1.0001; }
  function sacrifice(s) {
    if (!canSacrifice(s)) return 0;
    const gain = sacrificeGain(s);
    s.sacrificed = s.sacrificed.add(s.dims[0].amount);
    for (let i = 0; i < 7; i++) s.dims[i].amount = new BigNum(0);
    s.stats.sacrifices++;
    emit('sacrifice', { gain, mult: sacMult(s) });
    return gain;
  }

  function shift(s) {
    if (!canShift(s)) return false;
    s.shifts++;
    resetRun(s, 'dims');
    record(s, '제' + unlocked(s) + '차원 개방');
    emit('shift', { dim: unlocked(s) });
    return true;
  }

  function boost(s) {
    if (!canBoost(s)) return false;
    s.boosts++;
    resetRun(s, 'dims');
    record(s, '차원 부스트 #' + s.boosts);
    emit('boost', { boosts: s.boosts });
    return true;
  }

  function galaxy(s, type) {
    if (!canGalaxy(s)) return false;
    s.galaxies++;
    const name = pick(D.galaxyNames) + '-' + Math.floor(rng() * 900 + 100);
    if (!D.galaxyTypes.some(t => t.id === type)) type = pick(D.galaxyTypes).id;
    s.galaxyCollection.push({ name, type, seed: Math.floor(rng() * 1e9) });
    if (s.galaxyCollection.length > 50) s.galaxyCollection.shift();
    resetRun(s, 'galaxy');
    record(s, '반물질 은하 #' + s.galaxies + ' · ' + name);
    emit('galaxy', { galaxies: s.galaxies, name, type });
    return true;
  }

  function ipGain(s) {
    if (!s.matter.gte(INF)) return 0;
    return (1 + rLvl(s, 5)) * (hasUpg(s, 8) ? 2 : 1);
  }

  function crunch(s, now, auto = false) {
    if (!canCrunch(s)) return 0;
    const gain = ipGain(s);
    s.ip += gain;
    s.infinities++;
    s.stats.crunches++;
    s.stats.totalIp += gain;
    s.stats.bestIp = Math.max(s.stats.bestIp, gain);
    resetRun(s, 'crunch');
    record(s, '빅 크런치 #' + s.infinities + ' · +' + gain + ' IP');
    emit('crunch', { gain, auto });
    checkAchievements(s, now);
    return gain;
  }

  /* ───────────── 도전 ───────────── */

  function snapshotRun(s) {
    return {
      matter: new BigNum(s.matter), shifts: s.shifts, boosts: s.boosts, galaxies: s.galaxies,
      tickspeedPurchased: s.tickspeedPurchased, sacrificed: new BigNum(s.sacrificed),
      dims: s.dims.map(d => ({ amount: new BigNum(d.amount), bought: d.bought }))
    };
  }

  function restoreRun(s, snap) {
    if (!snap) { resetRun(s, 'crunch'); return; }
    s.matter = new BigNum(snap.matter);
    s.shifts = snap.shifts; s.boosts = snap.boosts; s.galaxies = snap.galaxies;
    s.tickspeedPurchased = snap.tickspeedPurchased;
    s.sacrificed = new BigNum(snap.sacrificed || 0);
    s.dims.forEach((d, i) => { d.amount = new BigNum(snap.dims[i].amount); d.bought = snap.dims[i].bought; });
  }

  function challengeGoal(i) { return new BigNum(1, D.challenges[i].goalExp); }

  function challengesUnlocked(s) { return s.infinities >= 1; }

  function startChallenge(s, i) {
    if (!challengesUnlocked(s)) return { ok: false, reason: 'locked' };
    if (s.activeChallenge >= 0) return { ok: false, reason: 'active' };
    if (s.challenges[i]) return { ok: false, reason: 'done' };
    s.challengeSnapshot = snapshotRun(s);
    s.activeChallenge = i;
    resetRun(s, 'crunch');
    record(s, '도전 시작 · ' + D.challenges[i].name);
    return { ok: true };
  }

  function exitChallenge(s, completed) {
    const i = s.activeChallenge;
    if (i < 0) return false;
    if (completed) s.challenges[i] = true;
    s.activeChallenge = -1;
    restoreRun(s, s.challengeSnapshot);
    s.challengeSnapshot = null;
    record(s, (completed ? '도전 완료 · ' : '도전 포기 · ') + D.challenges[i].name);
    emit(completed ? 'challengeDone' : 'challengeQuit', { i });
    return true;
  }

  function checkChallenge(s) {
    if (s.activeChallenge >= 0 && s.matter.gte(challengeGoal(s.activeChallenge))) exitChallenge(s, true);
  }

  /* ───────────── 과충전 · 탭 · 혜성 · 일일 보상 ───────────── */

  function activateBuff(s, now) {
    if (buffActive(s, now)) return { ok: false, reason: 'active' };
    if (now < s.buff.readyAt) return { ok: false, reason: 'cooldown' };
    const cost = s.matter.mul(0.1);
    if (cost.isZero()) return { ok: false, reason: 'poor' };
    s.matter = s.matter.sub(cost);
    s.buff.endsAt = now + buffDuration(s);
    s.buff.readyAt = s.buff.endsAt + BUFF_COOLDOWN;
    s.buff.used = true;
    record(s, '과충전 활성화');
    return { ok: true, seconds: Math.round(buffDuration(s) / 1000), power: buffPower(s) };
  }

  function tap(s, now) {
    s.tap.combo = now - s.tap.lastAt <= COMBO_WINDOW ? Math.min(COMBO_MAX, s.tap.combo + 1) : 1;
    s.tap.lastAt = now;
    s.stats.taps++;
    s.stats.maxCombo = Math.max(s.stats.maxCombo, s.tap.combo);
    const gain = production(s, now).mul(0.04 * (1 + s.tap.combo * 0.03)).add(1);
    addMatter(s, gain);
    return { gain, combo: s.tap.combo };
  }

  function comboLeft(s, now) { return Math.max(0, COMBO_WINDOW - (now - s.tap.lastAt)); }

  function rollComet() { const r = rng(); return r < 0.06 ? 'golden' : r < 0.36 ? 'boost' : 'matter'; }

  function claimComet(s, kind, now) {
    s.stats.comets++;
    const prod = production(s, now);
    let gain = new BigNum(0);
    if (kind === 'golden') { gain = BigNum.max(prod.mul(180), 1000); s.stats.goldenComets++; }
    else if (kind === 'boost') s.comet.boostEndsAt = Math.max(now, s.comet.boostEndsAt) + 30000;
    else gain = BigNum.max(prod.mul(30), 100);
    addMatter(s, gain);
    return { kind, gain };
  }

  function dailyInfo(s, today, yesterday) {
    const claimable = s.daily.lastDay !== today;
    const day = claimable ? (s.daily.lastDay === yesterday ? s.daily.streak % 7 + 1 : 1) : s.daily.streak;
    return { claimable, day };
  }

  function dailyReward(s, day, now) {
    const def = D.daily[day - 1];
    const prod = production(s, NO_TIMED);
    return { matter: BigNum.max(prod.mul(def.minutes * 60), 100 * day), ip: def.ip || 0, minutes: def.minutes };
  }

  function claimDaily(s, today, yesterday, now) {
    const info = dailyInfo(s, today, yesterday);
    if (!info.claimable) return null;
    const reward = dailyReward(s, info.day, now);
    addMatter(s, reward.matter);
    s.ip += reward.ip;
    s.daily.lastDay = today;
    s.daily.streak = info.day;
    s.stats.bestStreak = Math.max(s.stats.bestStreak, info.day);
    record(s, '일일 보상 ' + info.day + '일차');
    return { day: info.day, ...reward };
  }

  /* ───────────── 성좌 · 사도 ───────────── */

  // 성좌는 뒤로 갈수록 비싸다: 탐색 1e8 ~ 1e50, 후원 Lv.10은 오리온 1e48 ~ 안드로메다 1e300
  const constSearchExp = i => 8 + 6 * i;
  function constSearchNeed(i) { return new BigNum(1, constSearchExp(i)); }
  function constLevelNeed(s, i) {
    const disc = Math.max(0.5, 1 - constBonus(s, 7));
    const price = saga() && s.saga ? saga().priceMult(s, i) : 1;
    return new BigNum(1, constSearchExp(i) + (s.constellations[i].level + 1) * (4 + 3 * i)).mul(disc * price);
  }
  function constNeed(s, i) {
    const c = s.constellations[i];
    if (!c.apostleFound) return constSearchNeed(i);
    return c.level < 10 ? constLevelNeed(s, i) : null;
  }
  function constRemaining(s, i) {
    const need = constNeed(s, i);
    return need ? need.sub(s.constellations[i].invested) : null;
  }

  function makeDialogue(i, situation) {
    let t = pick(D.dialogue[situation]).replace('{name}', D.apostles[i].name);
    return t.replace('{place}', pick(D.places)).replace('{item}', pick(D.items)).replace('{skill}', pick(D.skills).name);
  }

  function apostleLog(s, i, msg, now) {
    const a = s.apostles[i];
    a.log.push({ t: now, msg });
    if (a.log.length > 20) a.log.shift();
  }

  // 최대 레벨 이후에도 공물은 받는다: 레벨은 오르지 않고 성좌의 성력(사도 후원 재원)으로만 쌓인다
  function invest(s, i, amount, now = Date.now()) {
    const max = !constNeed(s, i);
    if (max && !(saga() && s.saga)) return { ok: false, reason: 'max' };
    amount = BigNum.min(s.matter, amount);
    if (amount.isZero()) return { ok: false, reason: 'poor' };
    s.matter = s.matter.sub(amount);
    if (saga() && s.saga) {
      saga().offer(s, i, amount, now);
      // 한 성좌만 편애하면 다른 성좌들이 질투한다
      s.saga.tension.crown_war += 1.5; s.saga.tension.star_war += 1;
    }
    absorb(s, i, amount, now);
    return { ok: true, max };
  }

  /** 성좌가 받은 반물질로 각성·후원 레벨을 올린다 (플레이어 공물이든 사건 중 강탈이든) */
  function absorb(s, i, amount, now = Date.now()) {
    const c = s.constellations[i];
    if (!constNeed(s, i)) return;
    c.invested = c.invested.add(amount);
    let need;
    while ((need = constNeed(s, i)) && reached(c.invested, need)) {
      c.invested = c.invested.sub(need);
      if (!c.apostleFound) {
        c.apostleFound = true;
        const a = s.apostles[i];
        a.awake = true;
        a.lastRevelation = now;
        apostleLog(s, i, makeDialogue(i, 'greeting'), now);
        record(s, '성좌 각성 · ' + D.constellations[i].name);
        emit('apostleFound', { i });
      } else {
        c.level++;
        const j = Math.floor(rng() * 3), a = s.apostles[i];
        if (a.skills[j] < 20) a.skills[j]++;
        apostleLog(s, i, '[' + D.constellations[i].name + '의 후원] ' + makeDialogue(i, 'levelup') + ' (' + D.skills[j].name + ' Lv.' + a.skills[j] + ')', now);
        record(s, D.constellations[i].name + ' 후원 Lv.' + c.level);
        emit('constLevel', { i, level: c.level, skill: j });
      }
    }
    if (!constNeed(s, i)) c.invested = new BigNum(0);
  }

  function skillCost(s, i, j) { return new BigNum(1, constSearchExp(i) + 2 + (3 + i) * s.apostles[i].skills[j]); }
  function canFundSkill(s, i, j) { const a = s.apostles[i]; return a.awake && a.skills[j] < 20 && s.matter.gte(skillCost(s, i, j)); }
  function fundSkill(s, i, j, now = Date.now()) {
    if (!canFundSkill(s, i, j)) return false;
    const a = s.apostles[i];
    s.matter = s.matter.sub(skillCost(s, i, j));
    a.skills[j]++;
    apostleLog(s, i, makeDialogue(i, 'levelup') + ' (' + D.skills[j].name + ' Lv.' + a.skills[j] + ')', now);
    record(s, D.apostles[i].name + ' · ' + D.skills[j].name + ' Lv.' + a.skills[j]);
    return true;
  }

  function revelationInterval(lvl) { return Math.max(60, 300 - lvl * 10) * 1000; }

  function updateRevelations(s, now) {
    let prod = null;
    s.apostles.forEach((a, i) => {
      const lvl = a.skills[2];
      if (!a.awake || lvl <= 0 || now - a.lastRevelation < revelationInterval(lvl)) return;
      a.lastRevelation = now;
      prod = prod || production(s, now);
      const bonus = BigNum.max(prod.mul(10 + 5 * lvl), 10);
      addMatter(s, bonus);
      apostleLog(s, i, makeDialogue(i, 'discovery'), now);
      emit('revelation', { i, bonus });
    });
  }

  /* ───────────── 연구 · 인피니티 업그레이드 ───────────── */

  function researchCost(s, i) {
    const r = D.research[i], lvl = rLvl(s, i);
    if (lvl >= D.researchMax) return null;
    return r.currency === 'ip' ? { ip: r.cost * Math.pow(2, lvl) } : { am: new BigNum(1, r.costExp + r.stepExp * lvl) };
  }
  function researchOpen(s, i) { const r = D.research[i].req; return r < 0 || rLvl(s, r) >= 1; }
  function canResearch(s, i) {
    if (!researchOpen(s, i)) return false;
    const c = researchCost(s, i);
    return !!c && (c.ip !== undefined ? s.ip >= c.ip : s.matter.gte(c.am));
  }
  function buyResearch(s, i) {
    if (!canResearch(s, i)) return false;
    const c = researchCost(s, i);
    if (c.ip !== undefined) s.ip -= c.ip; else s.matter = s.matter.sub(c.am);
    s.research[i]++;
    record(s, '연구 · ' + D.research[i].name + ' Lv.' + s.research[i]);
    return true;
  }

  function canUpgrade(s, i) { return !s.infinityUpgrades[i] && s.ip >= D.upgrades[i].cost; }
  function buyUpgrade(s, i) {
    if (!canUpgrade(s, i)) return false;
    s.ip -= D.upgrades[i].cost;
    s.infinityUpgrades[i] = true;
    record(s, '인피니티 업그레이드 · ' + D.upgrades[i].name);
    return true;
  }

  /* ───────────── 업적 ───────────── */

  const am = exp => s => s.matter.gte(new BigNum(1, exp));
  const amProg = exp => s => ({ cur: s.matter, max: new BigNum(1, exp) });
  const n = (fn, max) => ({ check: s => fn(s) >= max, prog: s => ({ cur: fn(s), max }) });
  const researchTotal = s => s.research.reduce((a, b) => a + b, 0);
  const constTotal = s => s.constellations.reduce((a, c) => a + (c.apostleFound ? c.level : 0), 0);

  // 0~23은 이전 세이브와 인덱스가 같아야 한다
  const ACH = [
    { name: '첫 진동', desc: '제1차원 구매', ...n(totalBought, 1) },
    { name: '임계 질량', desc: '반물질 1,000 도달', check: am(3), prog: amProg(3) },
    { name: '차원 여행자', desc: '차원 교체 1회', ...n(s => s.shifts, 1) },
    { name: '은하의 지배자', desc: '반물질 은하 1개', ...n(s => s.galaxies, 1) },
    { name: '무한 너머', desc: '빅 크런치 1회', ...n(s => s.infinities, 1) },
    { name: '한 묶음', desc: '한 차원을 10개 구매', ...n(maxBought, 10) },
    { name: '다중 스펙트럼', desc: '제4차원 보유', ...n(s => (s.dims[3].amount.isZero() ? 0 : 1), 1) },
    { name: '심층 관측', desc: '제8차원 개방', ...n(unlocked, 8) },
    { name: '가속 실험', desc: '틱스피드 5회 구매', ...n(s => s.tickspeedPurchased, 5) },
    { name: '시간 설계자', desc: '틱스피드 10회 구매', ...n(s => s.tickspeedPurchased, 10) },
    { name: '부스트 점화', desc: '차원 부스트 1회', ...n(s => s.boosts, 1) },
    { name: '연쇄 반응', desc: '차원 부스트 5회', ...n(s => s.boosts, 5) },
    { name: '쌍둥이 은하', desc: '반물질 은하 2개', ...n(s => s.galaxies, 2) },
    { name: '은하단', desc: '반물질 은하 5개', ...n(s => s.galaxies, 5) },
    { name: '초거대 수', desc: '반물질 1e50 도달', check: am(50), prog: amProg(50) },
    { name: '경계 접근', desc: '반물질 1e100 도달', check: am(100), prog: amProg(100) },
    { name: '사건의 지평선', desc: '반물질 1e200 도달', check: am(200), prog: amProg(200) },
    { name: '완전한 붕괴', desc: '반물질 ∞ (1.79e308) 도달', check: s => s.matter.gte(INF), prog: s => ({ cur: s.matter, max: INF }) },
    { name: '영구 흔적', desc: '인피니티 업그레이드 1개 구매', ...n(s => count(s.infinityUpgrades), 1) },
    { name: '법칙 재작성', desc: '인피니티 업그레이드 4개 구매', ...n(s => count(s.infinityUpgrades), 4) },
    { name: '반복 우주', desc: '빅 크런치 2회', ...n(s => s.infinities, 2) },
    { name: '다중 우주', desc: '빅 크런치 5회', ...n(s => s.infinities, 5) },
    { name: '차원 수집가', desc: '차원 누적 100개 구매', ...n(s => s.stats.totalPurchases, 100) },
    { name: '인피니티', desc: '앞의 업적 23개 모두 달성', ...n(s => count(s.achievements.slice(0, 23)), 23) },
    { name: '탭 마스터', desc: '블랙홀 1,000회 터치', ...n(s => s.stats.taps, 1000) },
    { name: '유성 사냥꾼', desc: '혜성 10개 포착', ...n(s => s.stats.comets, 10) },
    { name: '개근상', desc: '7일 연속 접속 보상 수령', ...n(s => s.stats.bestStreak, 7) },
    { name: '연구의 길', desc: '연구 레벨 합계 10', ...n(researchTotal, 10) },
    { name: '박사 학위', desc: '연구 레벨 합계 30', ...n(researchTotal, 30) },
    { name: '성좌의 축복', desc: '성좌 후원 레벨 합계 10', ...n(constTotal, 10) },
    { name: '도전 정복자', desc: '도전 6개 모두 완료', ...n(s => count(s.challenges), 6) },
    { name: '자동화 시대', desc: '자동 구매기 α 구매', ...n(s => (s.infinityUpgrades[5] ? 1 : 0), 1) },
    { name: '무한의 수확', desc: '한 번에 IP 5 이상 획득', ...n(s => s.stats.bestIp, 5) },
    { name: '시간 여행자', desc: '오프라인 진행 1시간 이상', ...n(s => s.stats.longestOffline, 3600) },
    { name: '빛보다 빠르게', desc: '틱 주기 1ms 도달 (가속 ×1,000)', check: s => speed(s, NO_TIMED).gte(1000), prog: s => ({ cur: speed(s, NO_TIMED), max: new BigNum(1000) }) },
    { name: '무한 컬렉터', desc: 'IP 누적 50 획득', ...n(s => s.stats.totalIp, 50) }
  ];

  // 다음 목표 안내 순서 (진행 흐름 순)
  const GUIDE = [0, 1, 5, 6, 8, 10, 2, 9, 7, 22, 11, 3, 14, 12, 15, 13, 16, 17, 4, 18, 20, 19, 21, 23];

  const SECRET = [
    { name: '첫 과충전', desc: '과충전 1회 사용', check: s => s.buff.used },
    { name: '성좌 관측자', desc: '성좌 1개 각성', check: s => s.constellations.some(c => c.apostleFound) },
    { name: '도전자', desc: '도전 1개 완료', check: s => s.challenges.some(Boolean) },
    { name: '마스터', desc: '마스터리 레벨 합계 10', check: s => s.mastery.reduce((a, m) => a + m.level, 0) >= 10 },
    { name: '끈기', desc: '누적 1시간 플레이', check: s => s.stats.playSeconds >= 3600 },
    { name: '완벽한 조화', desc: '8개 성좌 모두 각성', check: s => s.constellations.every(c => c.apostleFound) },
    { name: '황금빛 행운', desc: '황금 혜성 포착', check: s => s.stats.goldenComets >= 1 },
    { name: '연타의 신', desc: '콤보 50 달성', check: s => s.stats.maxCombo >= COMBO_MAX },
    { name: '희생의 대가', desc: '차원 희생 배율 ×10 달성', check: s => sacMult(s) >= 10 },
    { name: '타락의 목격자', desc: '사도의 타락을 목격', check: s => !!s.saga && s.saga.stats.falls >= 1 },
    { name: '운명의 관찰자', desc: '운명 사건 10회 목격', check: s => !!s.saga && s.saga.stats.fates >= 10 },
    { name: '성좌 대전', desc: '성좌 대전에서 살아남기', check: s => !!s.saga && !!s.saga.stats.seen.star_war }
  ];

  function checkAchievements(s) {
    // '인피니티'(23)는 앞의 업적에 의존하므로 두 번 훑는다
    for (let pass = 0; pass < 2; pass++) {
      ACH.forEach((a, i) => {
        if (!s.achievements[i] && a.check(s)) { s.achievements[i] = true; emit('achievement', { i, secret: false }); }
      });
    }
    SECRET.forEach((a, i) => {
      if (!s.secretAch[i] && a.check(s)) { s.secretAch[i] = true; emit('achievement', { i, secret: true }); }
    });
  }

  function nextGoal(s) {
    for (const i of GUIDE) if (!s.achievements[i]) return i;
    const rest = ACH.findIndex((_, i) => !s.achievements[i]);
    return rest < 0 ? null : rest;
  }

  /* ───────────── 마스터리 ───────────── */

  function masteryNeed(level) { return Math.floor(60 * Math.pow(level + 1, 1.5)); }
  function masteryRate(s) { return (1 + constBonus(s, 2)) * (1 + 0.3 * rLvl(s, 7)); }
  function gainMastery(s, seconds) {
    const xp = masteryRate(s) * seconds, ups = [];
    s.mastery.forEach((m, i) => {
      if (s.dims[i].amount.isZero() || m.level >= 100) return;
      m.xp += xp;
      let up = false;
      while (m.level < 100 && m.xp >= masteryNeed(m.level)) { m.xp -= masteryNeed(m.level); m.level++; up = true; }
      if (up) ups.push(i);
    });
    if (ups.length) emit('mastery', { dims: ups, levels: ups.map(i => s.mastery[i].level) });
  }

  /* ───────────── 특수 현상 ───────────── */

  function updateEvent(s, now) {
    const ev = s.event;
    if (ev.id && now >= ev.endsAt) { emit('eventEnd', { id: ev.id }); ev.id = null; }
    if (!ev.id && now >= ev.nextAt) {
      const def = pick(D.events);
      ev.id = def.id;
      ev.endsAt = now + def.seconds * 1000;
      ev.nextAt = ev.endsAt + (8 + rng() * 8) * 60000;
      record(s, '특수 현상 · ' + def.name);
      emit('eventStart', { id: def.id });
    }
  }
  function eventDef(id) { return D.events.find(e => e.id === id) || null; }

  /* ───────────── 자동화 ───────────── */

  function runAutomation(s, now) {
    const a = s.automation;
    if (hasUpg(s, 5) && a.low) for (let i = Math.min(4, unlocked(s)) - 1; i >= 0; i--) buyDim(s, i, 'max');
    if (hasUpg(s, 6) && a.high) {
      for (let i = unlocked(s) - 1; i >= 4; i--) buyDim(s, i, 'max');
      buyTickMax(s);
    }
    if (hasUpg(s, 7) && a.reset) {
      if (!galaxy(s) && !shift(s)) boost(s);
      if (canSacrifice(s) && sacrificeGain(s) >= 2) sacrifice(s);
    }
    if (hasUpg(s, 9) && a.crunch && canCrunch(s)) crunch(s, now, true);
  }

  /* ───────────── 시간 진행 ───────────── */

  /** 실시간 한 프레임 (dt 초) */
  function tick(s, dt, now) {
    if (!(dt > 0)) return;
    s.stats.playSeconds += dt;
    const mults = dimMults(s, now), t = speed(s, now).mul(dt);
    for (let i = unlocked(s) - 1; i >= 1; i--) {
      s.dims[i - 1].amount = s.dims[i - 1].amount.add(s.dims[i].amount.mul(mults[i]).mul(t).mul(0.1));
    }
    addMatter(s, s.dims[0].amount.mul(mults[0]).mul(t));
    gainMastery(s, dt);

    rt.autoAcc += dt;
    if (rt.autoAcc >= 0.5) { rt.autoAcc = 0; runAutomation(s, now); }
    checkChallenge(s);

    rt.slowAcc += dt;
    if (rt.slowAcc >= 1) {
      rt.slowAcc = 0;
      if (s.buff.endsAt && now >= s.buff.endsAt && rt.buffNotified !== s.buff.endsAt) {
        if (now - s.buff.endsAt < 5000) emit('buffEnd', {});
        rt.buffNotified = s.buff.endsAt;
      }
      updateEvent(s, now);
      updateRevelations(s, now);
      checkAchievements(s);
    }
    if (saga() && s.saga) saga().update(s, dt, now);
  }

  /** 상수 배율 가정 하의 정확한 해 (차원 사슬의 다항식 성장). 생산된 반물질 양을 돌려준다. */
  function advanceExact(s, seconds, now) {
    const u = unlocked(s), mults = dimMults(s, now), x = speed(s, now).mul(seconds);
    const a0 = s.dims.map(d => new BigNum(d.amount));
    for (let i = 0; i < u; i++) {
      let chain = new BigNum(1), add = new BigNum(0);
      for (let j = i + 1; j < u; j++) {
        chain = chain.mul(mults[j]).mul(x).mul(0.1).div(j - i);
        add = add.add(a0[j].mul(chain));
      }
      s.dims[i].amount = s.dims[i].amount.add(add);
    }
    let chain = mults[0].mul(x), gain = a0[0].mul(chain);
    for (let j = 1; j < u; j++) {
      chain = chain.mul(mults[j]).mul(x).mul(0.1).div(j + 1);
      gain = gain.add(a0[j].mul(chain));
    }
    return gain;
  }

  /** 앱을 떠나 있던 시간만큼 진행. 시간제 버프는 적용하지 않는다. */
  function offline(s, seconds, now) {
    const used = Math.min(Math.max(0, seconds), OFFLINE_CAP);
    if (used <= 0) return { seconds: 0, gain: new BigNum(0), capped: false };
    const gain = advanceExact(s, used, NO_TIMED).mul(offlineMult(s));
    addMatter(s, gain);
    gainMastery(s, used);
    s.stats.longestOffline = Math.max(s.stats.longestOffline, used);
    const sagaSummary = saga() && s.saga ? saga().offline(s, used, now === NO_TIMED ? Date.now() : now) : null;
    checkChallenge(s);
    checkAchievements(s);
    return { seconds: used, gain, capped: seconds > OFFLINE_CAP, saga: sagaSummary };
  }

  /* ───────────── 저장 · 불러오기 ───────────── */

  function serialize(s, now = Date.now()) { s.savedAt = now; return JSON.stringify(s); }

  /** 외부 데이터(이전 버전 세이브, 사용자가 불러온 파일)를 검증해 새 상태로 만든다 */
  function revive(raw, now = Date.now()) {
    const s = fresh(now);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.dims)) throw new Error('invalid save');
    const num = (v, min = 0, max = 1e15) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min; };
    const whole = (v, min = 0, max = 1e9) => Math.floor(num(v, min, max));
    const bn = v => { try { return new BigNum(v); } catch (e) { return new BigNum(0); } };
    const bools = (arr, len) => Array.from({ length: len }, (_, i) => !!(Array.isArray(arr) && (arr[i] === true || (arr[i] && arr[i].bought === true))));
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

    s.matter = bn(raw.matter);
    s.ip = whole(raw.ip);
    s.shifts = whole(raw.shifts, 0, 4);
    s.boosts = whole(raw.boosts, 0, 1e6);
    s.galaxies = whole(raw.galaxies, 0, 1e6);
    s.infinities = whole(raw.infinities);
    s.tickspeedPurchased = whole(raw.tickspeedPurchased, 0, 10000);
    s.sacrificed = bn(raw.sacrificed);
    s.dims.forEach((d, i) => {
      const r = raw.dims[i] && typeof raw.dims[i] === 'object' ? raw.dims[i] : {};
      d.amount = bn(r.amount);
      d.bought = whole(r.bought, 0, 1e6);
    });
    s.infinityUpgrades = bools(raw.infinityUpgrades, D.upgrades.length);
    if (raw.automation && typeof raw.automation === 'object') {
      for (const k of Object.keys(s.automation)) if (typeof raw.automation[k] === 'boolean') s.automation[k] = raw.automation[k];
    }
    s.achievements = bools(raw.achievements, ACH.length);
    s.secretAch = bools(raw.secretAch, SECRET.length);
    s.mastery = s.mastery.map((_, i) => {
      const m = Array.isArray(raw.mastery) && raw.mastery[i] || {};
      return { xp: num(m.xp, 0, 1e12), level: whole(m.level, 0, 100) };
    });
    if (raw.buff && typeof raw.buff === 'object') {
      s.buff.used = raw.buff.used === true;
      s.buff.endsAt = num(raw.buff.endsAt, 0, now + 10 * 60000);
      s.buff.readyAt = num(raw.buff.readyAt, 0, now + 20 * 60000);
    }
    s.challenges = bools(raw.challenges, D.challenges.length);
    const ac = Number(raw.activeChallenge);
    if (Number.isInteger(ac) && ac >= 0 && ac < D.challenges.length && raw.challengeSnapshot && Array.isArray(raw.challengeSnapshot.dims)) {
      const sn = raw.challengeSnapshot;
      s.activeChallenge = ac;
      s.challengeSnapshot = {
        matter: bn(sn.matter), shifts: whole(sn.shifts, 0, 4), boosts: whole(sn.boosts, 0, 1e6), galaxies: whole(sn.galaxies, 0, 1e6),
        tickspeedPurchased: whole(sn.tickspeedPurchased, 0, 10000), sacrificed: bn(sn.sacrificed),
        dims: s.dims.map((_, i) => { const d = sn.dims[i] || {}; return { amount: bn(d.amount), bought: whole(d.bought, 0, 1e6) }; })
      };
    }
    s.constellations = s.constellations.map((_, i) => {
      const c = Array.isArray(raw.constellations) && raw.constellations[i] || {};
      return { invested: bn(c.invested), apostleFound: c.apostleFound === true, level: whole(c.level, 0, 10) };
    });
    s.apostles = s.apostles.map((_, i) => {
      const a = Array.isArray(raw.apostles) && raw.apostles[i] || {};
      const log = Array.isArray(a.log) ? a.log.slice(-20).map(l => {
        if (typeof l === 'string') return { t: 0, msg: l.slice(0, 160) };
        return l && typeof l.msg === 'string' ? { t: num(l.t, 0, now), msg: l.msg.slice(0, 160) } : null;
      }).filter(Boolean) : [];
      return {
        awake: a.awake === true,
        skills: [0, 1, 2].map(j => whole(Array.isArray(a.skills) ? a.skills[j] : 0, 0, 20)),
        lastRevelation: num(a.lastRevelation, 0, now),
        log
      };
    });
    s.research = s.research.map((_, i) => whole(Array.isArray(raw.research) ? raw.research[i] : 0, 0, D.researchMax));
    // 이전 버전은 이름 문자열만 저장했다
    const gTypes = D.galaxyTypes.map(t => t.id);
    s.galaxyCollection = (Array.isArray(raw.galaxyCollection) ? raw.galaxyCollection : []).map((g, k) => {
      if (typeof g === 'string') return { name: g.slice(0, 40), type: gTypes[k % gTypes.length], seed: k * 7919 + g.length };
      if (!g || typeof g.name !== 'string') return null;
      return { name: g.name.slice(0, 40), type: gTypes.includes(g.type) ? g.type : 'spiral', seed: whole(g.seed, 0, 1e9) };
    }).filter(Boolean).slice(-50);

    // 특수 현상: 이전 버전(activeEvent 문자열)은 버리고 다음 일정만 유지
    const ev = raw.event && typeof raw.event === 'object' ? raw.event : null;
    if (ev && D.events.some(e => e.id === ev.id) && num(ev.endsAt) > now) { s.event.id = ev.id; s.event.endsAt = num(ev.endsAt, 0, now + 600000); }
    const nextAt = num(ev ? ev.nextAt : raw.nextEventAt, 0, now + 30 * 60000);
    s.event.nextAt = Math.max(nextAt, now + 60000);
    if (raw.comet && typeof raw.comet === 'object') s.comet.boostEndsAt = num(raw.comet.boostEndsAt, 0, now + 600000);
    if (raw.daily && typeof raw.daily === 'object') {
      s.daily.lastDay = str(raw.daily.lastDay, 10) || '';
      s.daily.streak = whole(raw.daily.streak, 0, 7);
    }

    const rs = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    const st = s.stats;
    st.startedAt = num(rs.startedAt, 0, now) || now;
    st.playSeconds = num(rs.playSeconds, 0, 1e12);
    st.totalMatter = bn(rs.totalMatter || s.matter);
    for (const k of ['totalPurchases', 'crunches', 'taps', 'comets', 'goldenComets', 'sacrifices', 'bestIp', 'totalIp', 'maxCombo', 'bestStreak']) st[k] = whole(rs[k], 0, 1e12);
    st.longestOffline = num(rs.longestOffline, 0, 1e12);
    if (!rs.totalIp && s.infinities) st.totalIp = s.infinities;
    st.history = Array.isArray(rs.history) ? rs.history.map(h => str(h, 120)).filter(Boolean).slice(-40) : [];
    s.savedAt = num(raw.savedAt, 0, now) || now;
    if (saga()) s.saga = saga().revive(raw.saga, now);
    return s;
  }

  CD.core = {
    INF, VERSION, OFFLINE_CAP, COMBO_MAX, NO_TIMED, ACH, SECRET,
    setListener(fn) { listener = fn; },
    setRandom(fn) { rng = fn || Math.random; },
    fresh, revive, serialize, record,
    unlocked, hasUpg, inChallenge, totalBought, constLevel, constBonus, achCount, achBonus, challengeBonus,
    boostBase, tickBase, speed, globalMult, dimMults, production, dimOutput, offlineMult,
    dimCost, buyPlan, buyDim, nextCost, buyMaxAll, tickCost, tickLocked, canBuyTick, buyTick, buyTickMax,
    sacMult, sacrificeGain, canSacrifice, sacrifice,
    shiftReq, boostReq, galaxyReq, canShift, canBoost, canGalaxy, canCrunch, shift, boost, galaxy, ipGain, crunch,
    challengeGoal, challengesUnlocked, startChallenge, exitChallenge,
    buffActive, buffPower, buffDuration, activateBuff, eventActive, eventDef, cometBoostActive,
    tap, comboLeft, rollComet, claimComet, dailyInfo, dailyReward, claimDaily,
    constSearchNeed, constNeed, constRemaining, invest, skillCost, canFundSkill, fundSkill, revelationInterval,
    researchCost, researchOpen, canResearch, buyResearch, canUpgrade, buyUpgrade,
    checkAchievements, nextGoal, masteryNeed,
    tick, advanceExact, offline, big, fmtShort, absorb,
    random: () => rng(),
    emitSaga: (kind, payload) => emit('saga', Object.assign({ kind }, payload)),
    giveMatter: (s, gain) => addMatter(s, gain)
  };
  if (typeof module === 'object' && module.exports) module.exports = CD.core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
