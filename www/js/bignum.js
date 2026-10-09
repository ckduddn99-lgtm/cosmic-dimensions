/* 초공간 차원 붕괴 — 큰 수 연산
 * 값 = m × 10^e (1 ≤ m < 10, e는 정수). 이 게임은 음수를 쓰지 않으므로 0 이하는 0으로 고정한다.
 */
(function (root) {
  'use strict';

  const MAX_EXP = 9e15;

  class BigNum {
    constructor(m = 0, e = 0) {
      if (m instanceof BigNum) { this.m = m.m; this.e = m.e; return; }
      if (m && typeof m === 'object' && 'm' in m) { this.m = Number(m.m) || 0; this.e = Number(m.e) || 0; }
      else if (typeof m === 'string') {
        const p = m.trim().toLowerCase().split('e');
        this.m = Number(p[0]) || 0;
        this.e = p.length > 1 ? Number(p[1]) || 0 : 0;
      } else { this.m = Number(m) || 0; this.e = Number(e) || 0; }
      this.normalize();
    }

    normalize() {
      if (Number.isNaN(this.m) || Number.isNaN(this.e) || this.m <= 0) { this.m = 0; this.e = 0; return this; }
      if (!Number.isFinite(this.m) || this.e >= MAX_EXP) { this.m = 9.999; this.e = MAX_EXP; return this; }
      if (!Number.isInteger(this.e)) {
        const fe = Math.floor(this.e);
        this.m *= Math.pow(10, this.e - fe);
        this.e = fe;
      }
      const s = Math.floor(Math.log10(this.m));
      if (s !== 0) { this.m /= Math.pow(10, s); this.e += s; }
      // 부동소수 오차로 9.9999999 → 10.000000x 가 되는 경우 보정
      if (this.m >= 10) { this.m /= 10; this.e += 1; }
      if (this.m < 1) { this.m *= 10; this.e -= 1; }
      return this;
    }

    static from(v) { return v instanceof BigNum ? v : new BigNum(v); }

    /** 10^l 을 BigNum으로 */
    static fromLog10(l) {
      if (l === -Infinity || Number.isNaN(l)) return new BigNum(0);
      if (l === Infinity || l >= MAX_EXP) return new BigNum(9.999, MAX_EXP);
      const e = Math.floor(l);
      return new BigNum(Math.pow(10, l - e), e);
    }

    /** base^exp (base: number|BigNum, exp: number ≥ 0) — 로그 공간에서 계산해 오버플로가 없다 */
    static pow(base, exp) {
      if (exp === 0) return new BigNum(1);
      const b = BigNum.from(base);
      if (!b.m) return new BigNum(0);
      return BigNum.fromLog10(b.log10() * exp);
    }

    static min(a, b) { a = BigNum.from(a); b = BigNum.from(b); return a.lte(b) ? new BigNum(a) : new BigNum(b); }
    static max(a, b) { a = BigNum.from(a); b = BigNum.from(b); return a.gte(b) ? new BigNum(a) : new BigNum(b); }

    log10() { return this.m ? Math.log10(this.m) + this.e : -Infinity; }
    isZero() { return this.m === 0; }

    cmp(o) {
      o = BigNum.from(o);
      if (!this.m || !o.m) return this.m ? 1 : o.m ? -1 : 0;
      if (this.e !== o.e) return this.e > o.e ? 1 : -1;
      return this.m === o.m ? 0 : this.m > o.m ? 1 : -1;
    }
    gte(o) { return this.cmp(o) >= 0; }
    gt(o) { return this.cmp(o) > 0; }
    lte(o) { return this.cmp(o) <= 0; }
    lt(o) { return this.cmp(o) < 0; }

    add(o) {
      o = BigNum.from(o);
      if (!o.m) return new BigNum(this);
      if (!this.m) return new BigNum(o);
      const d = this.e - o.e;
      if (d > 16) return new BigNum(this);
      if (d < -16) return new BigNum(o);
      return new BigNum(this.m + o.m * Math.pow(10, -d), this.e);
    }

    sub(o) {
      o = BigNum.from(o);
      if (!o.m) return new BigNum(this);
      const d = this.e - o.e;
      if (d > 16) return new BigNum(this);
      if (d < 0) return new BigNum(0);
      const n = this.m - o.m * Math.pow(10, -d);
      // 상대 오차 수준의 잔여값은 0으로 본다
      return n <= 1e-12 ? new BigNum(0) : new BigNum(n, this.e);
    }

    mul(o) {
      o = BigNum.from(o);
      if (!this.m || !o.m) return new BigNum(0);
      return new BigNum(this.m * o.m, this.e + o.e);
    }

    div(o) {
      o = BigNum.from(o);
      if (!o.m || !this.m) return new BigNum(0);
      return new BigNum(this.m / o.m, this.e - o.e);
    }

    /** 일반 숫자로 변환 (범위를 넘으면 Infinity) */
    toNumber() {
      if (!this.m) return 0;
      if (this.e > 308) return Infinity;
      if (this.e < -320) return 0;
      return this.m * Math.pow(10, this.e);
    }

    toJSON() { return { m: this.m, e: this.e }; }
  }

  BigNum.ZERO = Object.freeze(new BigNum(0));

  const CD = root.CD = root.CD || {};
  CD.BigNum = BigNum;
  if (typeof module === 'object' && module.exports) module.exports = BigNum;
})(typeof globalThis !== 'undefined' ? globalThis : this);
