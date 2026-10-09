'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BigNum = require('../www/js/bignum.js');
require('../www/js/data.js');
const core = require('../www/js/core.js');
const { simulate } = require('./sim.js');

const B = (m, e) => new BigNum(m, e);
const NOW = 1_700_000_000_000;

test('BigNum: 정규화와 사칙연산', () => {
  assert.deepEqual(B(1234).toJSON(), { m: 1.234, e: 3 });
  assert.equal(B(5, 3).add(B(5, 3)).toNumber(), 10000);
  assert.equal(B(1, 3).sub(B(1, 4)).toNumber(), 0, '음수는 0');
  assert.equal(B(2, 100).mul(B(5, 200)).e, 301);
  assert.equal(B(1, 10).div(B(4, 2)).toNumber(), 2.5e7);
  assert.ok(B(1, 309).gt(B(9.99, 308)));
  assert.equal(BigNum.min(B(3), B(2)).toNumber(), 2);
  assert.equal(BigNum.max(B(3), B(2)).toNumber(), 3);
  assert.ok(Math.abs(BigNum.pow(2, 10).toNumber() - 1024) < 1e-9);
  assert.equal(BigNum.pow(10, 5000).e, 5000, '오버플로 없이 큰 거듭제곱');
  assert.equal(new BigNum('1.5e400').e, 400);
  assert.equal(new BigNum({ m: 25, e: 1 }).toJSON().e, 2);
  assert.equal(new BigNum(Infinity).e > 1e15, true);
  assert.equal(new BigNum(NaN).isZero(), true);
});

test('차원 비용: 10개 묶음마다 10^step 배', () => {
  const s = core.fresh(NOW);
  assert.equal(core.dimCost(s, 0).toNumber(), 10);
  assert.equal(core.dimCost(s, 0, 9).toNumber(), 10);
  assert.equal(core.dimCost(s, 0, 10).toNumber(), 1e4);
  assert.equal(core.dimCost(s, 7, 10).e, 39);
});

test('구매: ×1 · ×10 · MAX', () => {
  const s = core.fresh(NOW);
  s.matter = B(1, 3);
  assert.equal(core.buyDim(s, 0, 1), 1);
  assert.ok(Math.abs(s.matter.toNumber() - 990) < 1e-9);
  assert.equal(core.buyDim(s, 0, 10), 9, '같은 묶음 안의 남은 9개만 살 수 있다');
  assert.equal(s.dims[0].bought, 10);
  s.matter = B(1, 9);
  const n = core.buyDim(s, 0, 'max');
  assert.ok(n >= 10 && n <= 20, 'MAX ' + n);
  assert.equal(core.buyDim(s, 4, 1), 0, '잠긴 차원은 구매 불가');
});

test('틱스피드: 비용 ×10, 속도 증가', () => {
  const s = core.fresh(NOW);
  s.matter = B(1.1, 5);
  const before = core.speed(s, NOW).toNumber();
  assert.equal(core.buyTickMax(s), 2);
  assert.ok(core.speed(s, NOW).toNumber() > before);
  assert.equal(core.tickCost(s).e, 5);
});

test('성좌 투자: 사도 발견, 레벨 이월, 필요량 정확 투자', () => {
  const s = core.fresh(NOW);
  s.matter = B(1, 300);
  const need = core.constSearchNeed(0);
  assert.ok(core.invest(s, 0, need, NOW).ok);
  assert.equal(s.constellations[0].apostleFound, true);
  assert.equal(s.apostles[0].awake, true);
  // 남은 양을 정확히 투자하면 레벨업해야 한다
  assert.ok(core.invest(s, 0, core.constRemaining(s, 0), NOW).ok);
  assert.equal(s.constellations[0].level, 1);
  // 한 번에 큰 금액을 넣으면 여러 레벨이 오른다
  core.invest(s, 0, B(1, 200), NOW);
  assert.equal(s.constellations[0].level, 10);
  assert.equal(core.invest(s, 0, B(1), NOW).reason, 'max');
  assert.ok(core.constBonus(s, 0) > 1.4);
});

test('사도 스킬 구매', () => {
  const s = core.fresh(NOW);
  s.matter = B(1, 300);
  assert.equal(core.fundSkill(s, 0, 0, NOW), false, '깨어나기 전에는 불가');
  core.invest(s, 0, core.constSearchNeed(0), NOW);
  const before = s.apostles[0].skills[0];
  assert.equal(core.fundSkill(s, 0, 0, NOW), true);
  assert.equal(s.apostles[0].skills[0], before + 1);
});

test('정확한 해(오프라인)가 작은 간격의 실시간 진행과 일치', () => {
  const mk = () => {
    const s = core.fresh(NOW);
    s.shifts = 4;
    s.dims.forEach((d, i) => { d.amount = B(3 + i); d.bought = 10; });
    s.achievements.fill(true); s.secretAch.fill(true); // 진행 중 업적 해금으로 배율이 바뀌지 않도록
    return s;
  };
  const a = mk(), b = mk();
  const NO = core.NO_TIMED;
  const gain = core.advanceExact(a, 30, NO);
  a.matter = a.matter.add(gain);
  b.event.nextAt = Infinity;
  for (let t = 0; t < 30; t += 0.001) core.tick(b, 0.001, NO);
  const rel = Math.abs(a.matter.log10() - b.matter.log10());
  assert.ok(rel < 0.01, 'log 차이 ' + rel);
  assert.ok(Math.abs(a.dims[0].amount.log10() - b.dims[0].amount.log10()) < 0.01);
});

test('오프라인: 24시간 상한, 거대한 값에서도 유한', () => {
  const s = core.fresh(NOW);
  s.shifts = 4;
  s.tickspeedPurchased = 2000;
  s.dims.forEach(d => { d.amount = B(1, 50); d.bought = 300; });
  const r = core.offline(s, 7 * 86400, NOW);
  assert.equal(r.seconds, core.OFFLINE_CAP);
  assert.equal(r.capped, true);
  assert.ok(Number.isFinite(s.matter.m) && s.matter.lte(core.INF), '반물질은 ∞에서 멈춘다');
});

test('빅 크런치: ∞ 필요, IP 지급, 진행 초기화', () => {
  const s = core.fresh(NOW);
  assert.equal(core.crunch(s, NOW), 0);
  s.matter = new BigNum(core.INF);
  s.galaxies = 3; s.shifts = 4; s.tickspeedPurchased = 50;
  assert.equal(core.crunch(s, NOW), 1);
  assert.equal(s.ip, 1);
  assert.equal(s.galaxies + s.shifts + s.tickspeedPurchased, 0);
  assert.equal(s.matter.toNumber(), 10);
  s.infinityUpgrades[8] = true; s.research[5] = 2; s.matter = new BigNum(core.INF);
  assert.equal(core.crunch(s, NOW), 6);
});

test('도전: 첫 크런치 후 해금, 종료 시 원래 우주 복귀', () => {
  const s = core.fresh(NOW);
  assert.equal(core.startChallenge(s, 0).reason, 'locked');
  s.infinities = 1;
  s.matter = B(1, 50); s.shifts = 3; s.dims[0].bought = 42;
  assert.ok(core.startChallenge(s, 0).ok);
  assert.equal(s.shifts, 0);
  assert.equal(s.matter.toNumber(), 10);
  s.matter = core.challengeGoal(0);
  core.tick(s, 0.01, NOW);
  assert.equal(s.activeChallenge, -1);
  assert.equal(s.challenges[0], true);
  assert.equal(s.matter.e, 50);
  assert.equal(s.dims[0].bought, 42);
});

test('도전 중 저장 후 불러오기해도 도전과 원래 우주가 유지', () => {
  const s = core.fresh(NOW);
  s.infinities = 1; s.matter = B(1, 77);
  core.startChallenge(s, 3);
  const loaded = core.revive(JSON.parse(core.serialize(s, NOW)), NOW + 1000);
  assert.equal(loaded.activeChallenge, 3);
  core.exitChallenge(loaded, false);
  assert.equal(loaded.matter.e, 77);
});

test('무거운 차원 도전은 시작 직후에도 첫 차원을 살 수 있다', () => {
  const s = core.fresh(NOW);
  s.infinities = 1;
  core.startChallenge(s, 1);
  assert.equal(core.buyDim(s, 0, 1), 1);
});

test('이전 버전(v2) 세이브 변환', () => {
  const v2 = {
    version: 2, matter: { m: 1.5, e: 20 }, ip: 3, shifts: 2, boosts: 1, galaxies: 0, infinities: 2,
    tickspeedCost: { m: 1, e: 6 }, tickspeedPurchased: 3,
    dims: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, amount: { m: 2, e: 3 }, bought: 12, baseCost: { m: 1, e: 1 }, costMult: 1000 })),
    infinityUpgrades: [{ bought: true }, { bought: false }, { bought: true }, { bought: false }],
    achievements: Array(24).fill(true), stats: { playSeconds: 100, totalMatter: { m: 1, e: 21 }, totalPurchases: 50, crunches: 2, history: ['a', 7, 'b'] },
    savedAt: NOW - 5000, mastery: Array(8).fill({ xp: 5, level: 2 }), buff: { active: true, endsAt: NOW + 1000, used: true },
    challenges: [true, false, false], activeChallenge: 1, secretAch: [true, false, false, false, false, false],
    constellations: Array.from({ length: 8 }, () => ({ invested: { m: 1, e: 5 }, searchProgress: 50, apostleFound: false, level: 0, sponsorRate: 0 })),
    apostles: Array.from({ length: 8 }, () => ({ awake: false, skills: [0, 0, 0], lastRevelation: 0, log: ['12:00 hello'] })),
    research: [5, 1, 0, 0, 0, 0, 0, 0, 0, 0], galaxyCollection: ['NGC-1', '<img src=x onerror=alert(1)>'],
    activeEvent: '차원 폭풍', eventEndsAt: NOW + 5000, nextEventAt: NOW + 10000
  };
  const s = core.revive(JSON.parse(JSON.stringify(v2)), NOW);
  assert.equal(s.matter.e, 20);
  assert.deepEqual(s.infinityUpgrades.slice(0, 4), [true, false, true, false]);
  assert.equal(s.infinityUpgrades.length, 10);
  assert.equal(s.achievements.length, core.ACH.length);
  assert.equal(s.achievements[23], true);
  assert.equal(s.achievements[24], false);
  assert.equal(s.activeChallenge, -1, '스냅샷 없는 이전 도전은 해제');
  assert.deepEqual(s.stats.history, ['a', 'b']);
  assert.equal(s.apostles[0].log[0].msg, '12:00 hello');
  assert.equal(s.research[0], 5);
  assert.equal(s.buff.used, true);
  assert.equal(s.galaxyCollection.length, 2, '문자열은 보존되며 화면에서 이스케이프한다');
  assert.throws(() => core.revive({ nope: 1 }, NOW));
});

test('탭 콤보와 혜성 보상', () => {
  const s = core.fresh(NOW);
  const r1 = core.tap(s, NOW);
  assert.equal(r1.combo, 1);
  assert.ok(r1.gain.gte(1));
  assert.equal(core.tap(s, NOW + 500).combo, 2);
  assert.equal(core.tap(s, NOW + 3000).combo, 1, '1초가 지나면 콤보 초기화');
  const m = core.claimComet(s, 'matter', NOW);
  assert.ok(m.gain.gte(100));
  core.claimComet(s, 'boost', NOW);
  assert.ok(core.cometBoostActive(s, NOW + 10000));
  assert.equal(s.stats.comets, 2);
});

test('일일 보상: 연속 접속과 초기화', () => {
  const s = core.fresh(NOW);
  const r1 = core.claimDaily(s, '2026-10-01', '2026-09-30', NOW);
  assert.equal(r1.day, 1);
  assert.equal(core.claimDaily(s, '2026-10-01', '2026-09-30', NOW), null, '같은 날 두 번 불가');
  assert.equal(core.claimDaily(s, '2026-10-02', '2026-10-01', NOW).day, 2);
  assert.equal(core.claimDaily(s, '2026-10-05', '2026-10-04', NOW).day, 1, '하루 빠지면 1일차');
  s.daily.streak = 6; s.daily.lastDay = '2026-10-05';
  const r7 = core.claimDaily(s, '2026-10-06', '2026-10-05', NOW);
  assert.equal(r7.day, 7);
  assert.equal(r7.ip, 1);
  assert.equal(core.claimDaily(s, '2026-10-07', '2026-10-06', NOW).day, 1, '7일 뒤 다시 1일차');
});

test('과충전: 지속 후 재사용 대기', () => {
  const s = core.fresh(NOW);
  s.matter = B(1, 10);
  assert.ok(core.activateBuff(s, NOW).ok);
  assert.ok(core.buffActive(s, NOW + 30000));
  assert.equal(core.activateBuff(s, NOW + 30000).reason, 'active');
  assert.equal(core.activateBuff(s, NOW + 90000).reason, 'cooldown');
  assert.ok(core.activateBuff(s, NOW + 121000).ok);
});

test('연구 효과가 실제로 적용된다', () => {
  const s = core.fresh(NOW);
  const base = core.dimMults(s, NOW)[0].toNumber();
  s.research[0] = 1; s.research[2] = 1;
  assert.ok(Math.abs(core.dimMults(s, NOW)[0].toNumber() / base - 1.2 * 1.5) < 1e-9);
  s.research[3] = 5;
  assert.equal(core.galaxyReq(s), 60);
  s.research[6] = 2;
  assert.equal(core.offlineMult(s), 2);
  s.research[8] = 5;
  assert.equal(core.buffPower(s), 2.5);
});

test('진행 속도: 탐욕 봇이 20~90분 사이에 첫 인피니티 도달', () => {
  const { marks } = simulate({ hours: 1.5, log: false });
  const t = marks['crunch#1 (+1IP)'];
  assert.ok(t !== undefined, '1.5시간 내 첫 크런치 실패');
  assert.ok(t > 20 * 60 && t < 90 * 60, '첫 크런치 ' + Math.round(t / 60) + '분');
});
