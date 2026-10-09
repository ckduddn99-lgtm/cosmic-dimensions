// 성좌 서사 시뮬레이션: 몇 시간 동안 어떤 사건이 얼마나 일어나는지 본다
// 사용법: node tests/saga-sim.js [시간=3] [각성 성좌 수=4]
'use strict';
require('../www/js/bignum.js'); require('../www/js/data.js');
const core = require('../www/js/core.js');
require('../www/js/saga-data.js'); require('../www/js/talk.js');
const saga = require('../www/js/saga.js');
const B = globalThis.CD.BigNum;

function run({ hours = 3, awakeN = 4, seed = 11, log = true } = {}) {
  let x = seed; core.setRandom(() => { x = (x * 16807) % 2147483647; return x / 2147483647; });
  const kinds = {};
  core.setListener((t, p) => { if (t === 'saga') kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
  const now0 = 1.7e12; const s = core.fresh(now0);
  for (let i = 0; i < awakeN; i++) { s.constellations[i].apostleFound = true; s.constellations[i].level = 2; s.apostles[i].awake = true; }
  s.matter = new B(1, 200); s.dims[0].amount = new B(1, 50); s.shifts = 4;
  const fates = [];
  let now = now0;
  const end = hours * 3600, dt = 5;
  let maxP = {};
  for (let t = 0; t < end; t += dt) {
    now += dt * 1000;
    const before = s.saga.stats.fates;
    saga.update(s, dt, now);
    s.matter = new B(1, 200); // 생산을 단순화: 반물질은 매번 회복
    for (const f in s.saga.tension) maxP[f] = Math.max(maxP[f] || 0, saga.prob(s.saga.tension[f]));
    if (s.saga.stats.fates > before) { const last = s.saga.feed.filter(e => e.kind === 'fate').pop(); fates.push(Math.round(t / 60) + 'm ' + last.text.slice(0, 40) + ' (p=' + (last.p * 100).toFixed(2) + '%)'); }
  }
  if (log) {
    console.log('kinds', kinds);
    console.log('stats', JSON.stringify({ ...s.saga.stats, taken: undefined }));
    console.log('fates:\n ' + fates.join('\n '));
    console.log('influence', saga.influence(s).map(v => (v * 100).toFixed(1) + '%').join(' '));
    console.log('apostles', saga.livingApostles(s).map(p => p.name + ' L' + p.lvl + ' c' + Math.round(p.corrupt) + ' y' + Math.round(p.loyal) + ' @' + p.patron).join(', '));
    console.log('fallen', saga.fallen(s).map(p => p.name).join(','), 'hall', s.saga.hall.length);
    console.log('max prob', Object.entries(maxP).map(([k, v]) => k + ':' + (v * 100).toFixed(1)).join(' '));
  }
  return { s, fates, kinds };
}
module.exports = { run };
if (require.main === module) run({ hours: Number(process.argv[2] || 3), awakeN: Number(process.argv[3] || 4) });
