'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BigNum = require('../www/js/bignum.js');
require('../www/js/data.js');
const core = require('../www/js/core.js');
const SD = require('../www/js/saga-data.js');
const saga = require('../www/js/saga.js');
const { run } = require('./saga-sim.js');

const NOW = 1_700_000_000_000;
function world(awakeN = 3) {
  let x = 5; core.setRandom(() => { x = (x * 16807) % 2147483647; return x / 2147483647; });
  core.setListener(null);
  const s = core.fresh(NOW);
  for (let i = 0; i < awakeN; i++) { s.constellations[i].apostleFound = true; s.apostles[i].awake = true; }
  s.matter = new BigNum(1, 100);
  return s;
}

test('확률 곡선: 0.01%에서 시작해 70%를 넘지 않고 단조 증가', () => {
  assert.ok(Math.abs(saga.prob(0) - 0.0001) < 1e-9);
  let prev = 0;
  for (let t = 0; t <= 400; t += 5) { const p = saga.prob(t); assert.ok(p >= prev - 1e-12 && p <= 0.7 + 1e-9); prev = p; }
  assert.ok(saga.prob(150) > 0.6);
});

test('데이터 무결성: 전조가 가리키는 사건이 모두 존재', () => {
  const ids = new Set(SD.fates.map(f => f.id));
  for (const o of SD.omens) for (const id in o.add) assert.ok(ids.has(id), id);
  assert.ok(SD.fates.length >= 18 && SD.omens.length >= 45);
});

test('성좌가 세계의 인물 중 사도를 고른다', () => {
  const s = world(2);
  saga.ensureWorld(s, NOW);
  saga.choose(s, 0, NOW);
  const ap = saga.apostleOf(s, 0);
  assert.ok(ap && ap.status === 'apostle' && ap.patron === 0);
  assert.ok(s.saga.feed.some(f => f.kind === 'pick'));
});

test('영향력: 합이 1, 강한 성좌일수록 크고 몸값이 비싸다', () => {
  const s = world(3);
  s.constellations[0].level = 8; s.saga.fame[0] = 100;
  const inf = saga.influence(s);
  assert.ok(Math.abs(inf.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(inf[0] > inf[1] && inf[1] > inf[5]);
  assert.ok(saga.priceMult(s, 0) > saga.priceMult(s, 1));
  assert.ok(core.constNeed(s, 0).gt(core.constNeed(s, 1).div(1e10)), '몸값이 레벨 비용에 반영');
});

test('운명 사건: 엮인 성좌가 많고 영향력이 클수록 많이 가져간다', () => {
  assert.ok(saga.takeFraction(1, 0.1) < saga.takeFraction(3, 0.3));
  assert.ok(saga.takeFraction(3, 0.2) < saga.takeFraction(3, 0.6));
  assert.equal(saga.takeFraction(8, 1), 0.6);
  const s = world(2);
  const f = SD.fates.find(x => x.id === 'blood_festival');
  const before = new BigNum(s.matter);
  const out = saga.resolve(s, f, NOW);
  assert.ok(s.matter.lt(before));
  assert.ok(out.taken.gt(0));
  assert.ok(s.saga.feed.filter(e => e.kind === 'take').length === 3);
  assert.ok(!s.saga.power[5].isZero(), '잠든 성좌도 몫을 챙긴다');
});

test('빼앗긴 반물질로 잠든 성좌가 스스로 깨어날 수 있다', () => {
  const s = world(1);
  s.matter = new BigNum(1, 300);
  saga.resolve(s, SD.fates.find(x => x.id === 'star_war'), NOW);
  assert.ok(s.constellations.filter(c => c.apostleFound).length > 1);
});

test('타락: 부패도 100이면 타락하고 반란 긴장도가 오른다', () => {
  const s = world(1);
  saga.ensureWorld(s, NOW); saga.choose(s, 0, NOW);
  const ap = saga.apostleOf(s, 0);
  ap.corrupt = 99.9; ap.sponsorAt = 0;
  s.saga.power[0] = new BigNum(0);
  for (let k = 0; k < 20 && ap.status === 'apostle'; k++) saga.step(s, NOW + k * 15000);
  assert.equal(ap.status, 'fallen');
  assert.ok(s.saga.tension.rebellion >= 19, '감쇠 후에도 큰 폭 상승');
  assert.ok(s.saga.feed.some(e => e.kind === 'fall'));
});

test('저장 후 불러오기: 사도·긴장도·명예의 전당 유지, 잘못된 값 정리', () => {
  const s = world(3);
  saga.ensureWorld(s, NOW); saga.choose(s, 1, NOW);
  s.saga.tension.concert = 77; s.saga.fame[1] = 12;
  const raw = JSON.parse(core.serialize(s, NOW));
  raw.saga.people.push({ id: 'x', name: 42 }, null);
  raw.saga.patrons[4] = 99999;
  const r = core.revive(raw, NOW + 1000);
  assert.equal(saga.apostleOf(r, 1).name, saga.apostleOf(s, 1).name);
  assert.equal(r.saga.tension.concert, 77);
  assert.equal(r.saga.fame[1], 12);
  assert.equal(r.saga.patrons[4], 0);
  assert.ok(r.saga.people.every(p => typeof p.name === 'string'));
});

test('이전 세이브(서사 없음)도 불러올 수 있다', () => {
  const s = world(0);
  const raw = JSON.parse(core.serialize(s, NOW));
  delete raw.saga;
  const r = core.revive(raw, NOW);
  assert.ok(r.saga && Array.isArray(r.saga.people));
});

test('서사 3시간: 사건이 빌드업을 거쳐 시간당 1~10회 일어난다', () => {
  const r = run({ hours: 3, awakeN: 4, seed: 11, log: false });
  const ps = r.fates.map(f => Number(f.match(/p=([0-9.]+)/)[1]));
  assert.ok(ps.length >= 3 && ps.length <= 30, '사건 ' + ps.length + '회');
  assert.ok(ps.filter(p => p >= 5).length >= ps.length / 2, '대부분은 확률이 오른 뒤에 터진다');
  assert.ok(r.s.saga.stats.omens > 100);
});

test('사도가 있으면 생산 보너스가 붙는다', () => {
  const s = world(1);
  const base = core.production(s, NOW).toNumber();
  saga.ensureWorld(s, NOW); saga.choose(s, 0, NOW);
  s.dims[0].amount = new BigNum(10);
  const a = core.dimMults(s, NOW)[0].toNumber();
  saga.apostleOf(s, 0).status = 'free'; s.saga.patrons[0] = 0;
  const b = core.dimMults(s, NOW)[0].toNumber();
  assert.ok(a > b, a + ' > ' + b);
  assert.equal(base, 0);
});
