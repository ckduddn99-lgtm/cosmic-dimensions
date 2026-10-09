// 진행 속도 시뮬레이션: 단순한 탐욕 봇이 게임을 플레이했을 때 주요 지점까지 걸리는 시간
// 사용법: node tests/sim.js [시간(h)=4] [research=1]
'use strict';
require('../www/js/bignum.js');
require('../www/js/data.js');
const core = require('../www/js/core.js');

function simulate({ hours = 4, research = true, challenge = -1, preset = null, log = true, buyUpgrades = true } = {}) {
  let seed = 7;
  core.setRandom(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  let now = 0;
  let s = core.fresh(now);
  if (preset) preset(s);
  if (challenge >= 0) core.startChallenge(s, challenge);
  const marks = {};
  const mark = (k) => { if (!(k in marks)) { marks[k] = s.stats.playSeconds; if (log) console.log(fmt(s.stats.playSeconds).padStart(9), k); } };
  let done = false;
  core.setListener((type, p) => {
    if (type === 'shift') mark('shift→' + p.dim);
    if (type === 'boost') mark('boost#' + p.boosts);
    if (type === 'galaxy') mark('galaxy#' + p.galaxies);
    if (type === 'crunch') { mark('crunch#' + s.infinities + ' (+' + p.gain + 'IP)'); }
    if (type === 'challengeDone') { mark('challenge done ' + p.i); done = true; }
  });
  const dt = 0.25, end = hours * 3600;
  let acc = 0;
  while (s.stats.playSeconds < end && !done) {
    now += dt * 1000;
    core.tick(s, dt, now);
    acc += dt;
    if (acc >= 1) {
      acc = 0;
      for (const e of [1, 3, 6, 10, 20, 30, 50, 100, 150, 200, 250, 308]) if (s.matter.log10() >= e) mark('1e' + e);
      if (core.canCrunch(s)) { core.crunch(s, now); if (buyUpgrades) for (let i = 0; i < 10; i++) core.buyUpgrade(s, i); continue; }
      core.buyMaxAll(s);
      if (!core.galaxy(s) && !core.shift(s)) core.boost(s);
      if (core.canSacrifice(s) && core.sacrificeGain(s) >= 2) core.sacrifice(s);
      if (research) for (let i = 0; i < 10; i++) while (core.buyResearch(s, i));
    }
  }
  return { s, marks };
}
function fmt(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = Math.floor(sec % 60); return (h ? h + 'h' : '') + String(m).padStart(2, '0') + 'm' + String(x).padStart(2, '0') + 's'; }

module.exports = { simulate, fmt };
if (require.main === module) {
  const hours = Number(process.argv[2] || 4), research = process.argv[3] !== '0', ch = Number(process.argv[4] ?? -1);
  const { s } = simulate({ hours, research, challenge: ch });
  console.log('final', s.matter.log10().toFixed(1), 'shifts', s.shifts, 'boosts', s.boosts, 'gal', s.galaxies, 'tick', s.tickspeedPurchased, 'inf', s.infinities, 'ip', s.ip, 'mastery', s.mastery.map(m => m.level).join(','));
}
