/* MatWeb - 初等数学函数：三角、指数对数、取整、复数、数论、特殊函数 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const ops = ML.ops, C = ML.C;

  // ---------- 复数小工具（返回 [re, im]）----------
  const cx = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const o = [0, 0]; C.div(a[0], a[1], b[0], b[1], o); return o; },
    sqrt: (a) => { const o = [0, 0]; C.sqrt(a[0], a[1], o); return o; },
    log: (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])],
    exp: (a) => { const o = [0, 0]; C.exp(a[0], a[1], o); return o; }
  };
  const I1 = [0, 1];
  function wrapC(f) { return (re, im, o) => { const r = f([re, im]); o[0] = r[0]; o[1] = r[1]; }; }
  const csin = (z) => [Math.sin(z[0]) * Math.cosh(z[1]), Math.cos(z[0]) * Math.sinh(z[1])];
  const ccos = (z) => [Math.cos(z[0]) * Math.cosh(z[1]), -Math.sin(z[0]) * Math.sinh(z[1])];
  const csinh = (z) => [Math.sinh(z[0]) * Math.cos(z[1]), Math.cosh(z[0]) * Math.sin(z[1])];
  const ccosh = (z) => [Math.cosh(z[0]) * Math.cos(z[1]), Math.sinh(z[0]) * Math.sin(z[1])];
  const casin = (z) => { const r = cx.log(cx.add(cx.mul(I1, z), cx.sqrt(cx.sub([1, 0], cx.mul(z, z))))); return [r[1], -r[0]]; };
  const cacos = (z) => { const r = cx.log(cx.add(z, cx.mul(I1, cx.sqrt(cx.sub([1, 0], cx.mul(z, z)))))); return [r[1], -r[0]]; };
  const catan = (z) => { const r = cx.log(cx.div(cx.add(I1, z), cx.sub(I1, z))); return [-r[1] / 2, r[0] / 2]; };
  const casinh = (z) => cx.log(cx.add(z, cx.sqrt(cx.add(cx.mul(z, z), [1, 0]))));
  const cacosh = (z) => cx.log(cx.add(z, cx.mul(cx.sqrt(cx.add(z, [1, 0])), cx.sqrt(cx.sub(z, [1, 0])))));
  const catanh = (z) => { const r = cx.log(cx.div(cx.add([1, 0], z), cx.sub([1, 0], z))); return [r[0] / 2, r[1] / 2]; };

  function unary(names, fr, fc, needC, doc) {
    def(names, (a) => { H.nargchk(a, 1, 1, names.split(' ')[0]); return H.mapC(a[0], fr, fc ? wrapC(fc) : null, needC); }, doc);
  }
  const D = (cat, syn, desc) => ({ cat, syn, desc });

  // ---------- 三角函数 ----------
  unary('sin', Math.sin, csin, null, D('三角函数', 'sin(x)', '正弦（弧度）'));
  unary('cos', Math.cos, ccos, null, D('三角函数', 'cos(x)', '余弦（弧度）'));
  unary('tan', Math.tan, (z) => cx.div(csin(z), ccos(z)), null, D('三角函数', 'tan(x)', '正切（弧度）'));
  unary('sec', (x) => 1 / Math.cos(x), (z) => cx.div([1, 0], ccos(z)), null, D('三角函数', 'sec(x)', '正割'));
  unary('csc', (x) => 1 / Math.sin(x), (z) => cx.div([1, 0], csin(z)), null, D('三角函数', 'csc(x)', '余割'));
  unary('cot', (x) => 1 / Math.tan(x), (z) => cx.div(ccos(z), csin(z)), null, D('三角函数', 'cot(x)', '余切'));
  unary('asin', Math.asin, casin, (x) => Math.abs(x) > 1, D('三角函数', 'asin(x)', '反正弦（结果为弧度）'));
  unary('acos', Math.acos, cacos, (x) => Math.abs(x) > 1, D('三角函数', 'acos(x)', '反余弦（结果为弧度）'));
  unary('atan', Math.atan, catan, null, D('三角函数', 'atan(x)', '反正切（结果为弧度）'));
  unary('acot', (x) => Math.atan(1 / x), (z) => catan(cx.div([1, 0], z)), null, D('三角函数', 'acot(x)', '反余切'));
  unary('asec', (x) => Math.acos(1 / x), (z) => cacos(cx.div([1, 0], z)), (x) => Math.abs(x) < 1, D('三角函数', 'asec(x)', '反正割'));
  unary('acsc', (x) => Math.asin(1 / x), (z) => casin(cx.div([1, 0], z)), (x) => Math.abs(x) < 1, D('三角函数', 'acsc(x)', '反余割'));
  unary('sinh', Math.sinh, csinh, null, D('三角函数', 'sinh(x)', '双曲正弦'));
  unary('cosh', Math.cosh, ccosh, null, D('三角函数', 'cosh(x)', '双曲余弦'));
  unary('tanh', Math.tanh, (z) => cx.div(csinh(z), ccosh(z)), null, D('三角函数', 'tanh(x)', '双曲正切'));
  unary('sech', (x) => 1 / Math.cosh(x), null, null, D('三角函数', 'sech(x)', '双曲正割'));
  unary('csch', (x) => 1 / Math.sinh(x), null, null, D('三角函数', 'csch(x)', '双曲余割'));
  unary('coth', (x) => 1 / Math.tanh(x), null, null, D('三角函数', 'coth(x)', '双曲余切'));
  unary('asinh', Math.asinh, casinh, null, D('三角函数', 'asinh(x)', '反双曲正弦'));
  unary('acosh', Math.acosh, cacosh, (x) => x < 1, D('三角函数', 'acosh(x)', '反双曲余弦'));
  unary('atanh', Math.atanh, catanh, (x) => Math.abs(x) > 1, D('三角函数', 'atanh(x)', '反双曲正切'));
  const d2r = Math.PI / 180;
  const exactSin = (deg) => { const m = ((deg % 360) + 360) % 360; if (m === 0 || m === 180) return 0; if (m === 90) return 1; if (m === 270) return -1; if (m === 30 || m === 150) return 0.5; if (m === 210 || m === 330) return -0.5; return Math.sin(deg * d2r); };
  const exactCos = (deg) => exactSin(deg + 90);
  unary('sind', exactSin, null, null, D('三角函数', 'sind(x)', '正弦（角度）'));
  unary('cosd', exactCos, null, null, D('三角函数', 'cosd(x)', '余弦（角度）'));
  unary('tand', (x) => { const s = exactSin(x), c = exactCos(x); return c === 0 ? (s > 0 ? Infinity : -Infinity) : s / c; }, null, null, D('三角函数', 'tand(x)', '正切（角度）'));
  unary('secd', (x) => 1 / exactCos(x), null, null, D('三角函数', 'secd(x)', '正割（角度）'));
  unary('cscd', (x) => 1 / exactSin(x), null, null, D('三角函数', 'cscd(x)', '余割（角度）'));
  unary('cotd', (x) => exactCos(x) / exactSin(x), null, null, D('三角函数', 'cotd(x)', '余切（角度）'));
  unary('asind', (x) => Math.asin(x) / d2r, null, null, D('三角函数', 'asind(x)', '反正弦（结果为角度）'));
  unary('acosd', (x) => Math.acos(x) / d2r, null, null, D('三角函数', 'acosd(x)', '反余弦（结果为角度）'));
  unary('atand', (x) => Math.atan(x) / d2r, null, null, D('三角函数', 'atand(x)', '反正切（结果为角度）'));
  unary('deg2rad', (x) => x * d2r, null, null, D('三角函数', 'deg2rad(x)', '角度转弧度'));
  unary('rad2deg', (x) => x / d2r, null, null, D('三角函数', 'rad2deg(x)', '弧度转角度'));
  function binReal(name, f, doc) {
    def(name, (a) => { H.nargchk(a, 2, 2, name); return ops.elementwise(H.tensor(a[0]), H.tensor(a[1]), f, null, 'double'); }, doc);
  }
  binReal('atan2', Math.atan2, D('三角函数', 'atan2(y,x)', '四象限反正切'));
  binReal('atan2d', (y, x) => Math.atan2(y, x) / d2r, D('三角函数', 'atan2d(y,x)', '四象限反正切（角度）'));
  binReal('hypot', Math.hypot, D('初等数学', 'hypot(a,b)', '平方和的平方根 √(a²+b²)'));

  // ---------- 指数与对数 ----------
  unary('exp', Math.exp, cx.exp, null, D('指数对数', 'exp(x)', '指数 e^x'));
  unary('log', Math.log, cx.log, (x) => x < 0, D('指数对数', 'log(x)', '自然对数 ln(x)'));
  unary('log10', Math.log10, (z) => { const r = cx.log(z); return [r[0] / Math.LN10, r[1] / Math.LN10]; }, (x) => x < 0, D('指数对数', 'log10(x)', '常用对数'));
  def('log2', (a, nargout) => {
    if (nargout >= 2) {
      const X = H.tensor(a[0]); const F = new Tensor(X.rows, X.cols), E = new Tensor(X.rows, X.cols);
      for (let k = 0; k < X.numel; k++) { const x = X.re[k]; if (x === 0 || !Number.isFinite(x)) { F.re[k] = x; continue; } let e = Math.floor(Math.log2(Math.abs(x))) + 1; let f = x / Math.pow(2, e); if (Math.abs(f) >= 1) { f /= 2; e++; } if (Math.abs(f) < 0.5) { f *= 2; e--; } F.re[k] = f; E.re[k] = e; }
      return [F, E];
    }
    return H.mapC(a[0], Math.log2, wrapC((z) => { const r = cx.log(z); return [r[0] / Math.LN2, r[1] / Math.LN2]; }), (x) => x < 0);
  }, D('指数对数', 'log2(x)', '以 2 为底的对数'));
  unary('log1p', Math.log1p, null, null, D('指数对数', 'log1p(x)', '精确计算 log(1+x)'));
  unary('expm1', Math.expm1, null, null, D('指数对数', 'expm1(x)', '精确计算 exp(x)-1'));
  unary('sqrt', Math.sqrt, cx.sqrt, (x) => x < 0, D('指数对数', 'sqrt(x)', '平方根（负数返回复数）'));
  unary('realsqrt', (x) => { if (x < 0) err('realsqrt 产生复数结果。'); return Math.sqrt(x); }, null, null, D('指数对数', 'realsqrt(x)', '非负实数平方根'));
  unary('reallog', (x) => { if (x < 0) err('reallog 产生复数结果。'); return Math.log(x); }, null, null, D('指数对数', 'reallog(x)', '非负实数自然对数'));
  unary('pow2', (x) => Math.pow(2, x), null, null, D('指数对数', 'pow2(x)', '2 的幂'));
  def('nthroot', (a) => ops.elementwise(H.tensor(a[0]), H.tensor(a[1]), (x, n) => {
    if (x < 0 && n % 2 === 1) return -Math.pow(-x, 1 / n);
    if (x < 0 && n % 2 !== 1) err('nthroot: 如果 X 为负数，则 N 必须为奇数。');
    const r = Math.pow(x, 1 / n);
    const rr = Math.round(r); return Math.abs(Math.pow(rr, n) - x) < 1e-12 * Math.max(1, Math.abs(x)) ? rr : r;
  }, null, 'double'), D('指数对数', 'nthroot(x,n)', '实数 n 次方根'));
  def('cbrt', (a) => H.map(a[0], Math.cbrt));

  // ---------- 取整与余数 ----------
  function keepIntType(fr) {
    return (a) => { const v = H.tensor(a[0]); if (T.isIntType(v.type)) return v; const t = H.mapC(v, fr, (re, im, o) => { o[0] = fr(re); o[1] = fr(im); }); return t; };
  }
  def('floor', keepIntType(Math.floor), D('取整', 'floor(x)', '向负无穷取整'));
  def('ceil', keepIntType(Math.ceil), D('取整', 'ceil(x)', '向正无穷取整'));
  def('fix', keepIntType(Math.trunc), D('取整', 'fix(x)', '向零取整'));
  const roundHalf = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
  def('round', (a) => {
    const v = H.tensor(a[0]);
    if (a.length > 1) {
      const n = H.int(a[1]);
      const sig = a.length > 2 && H.str(a[2]) === 'significant';
      return H.map(v, (x) => {
        if (x === 0 || !Number.isFinite(x)) return x;
        const d = sig ? n - 1 - Math.floor(Math.log10(Math.abs(x))) : n;
        const f = Math.pow(10, d);
        return d >= 0 ? roundHalf(x * f) / f : roundHalf(x / Math.pow(10, -d)) * Math.pow(10, -d);
      });
    }
    if (T.isIntType(v.type)) return v;
    return H.mapC(v, roundHalf, (re, im, o) => { o[0] = roundHalf(re); o[1] = roundHalf(im); });
  }, D('取整', 'round(x), round(x,n)', '四舍五入（可指定小数位数）'));
  function modFn(x, y) {
    if (y === 0) return x;
    if (!Number.isFinite(x)) return NaN;
    if (!Number.isFinite(y)) return (x === 0 || Math.sign(x) === Math.sign(y)) ? x : y;
    const r = x - Math.floor(x / y) * y;
    // 修正浮点误差
    if (Math.abs(r - y) < Math.abs(y) * 1e-14) return 0;
    return r;
  }
  function remFn(x, y) {
    if (y === 0) return NaN;
    if (!Number.isFinite(x)) return NaN;
    if (!Number.isFinite(y)) return x;
    return x - Math.trunc(x / y) * y;
  }
  function binKeepType(name, f, doc) {
    def(name, (a) => {
      H.nargchk(a, 2, 2, name);
      const x = H.tensor(a[0]), y = H.tensor(a[1]);
      const type = ops.resultType(x, y);
      return ops.finalize(ops.elementwise(x, y, f, null, type));
    }, doc);
  }
  binKeepType('mod', modFn, D('取整', 'mod(a,m)', '取模（结果符号与除数相同）'));
  binKeepType('rem', remFn, D('取整', 'rem(a,b)', '求余（结果符号与被除数相同）'));
  def('idivide', (a) => {
    const x = H.tensor(a[0]), y = H.tensor(a[1]); const opt = a.length > 2 ? H.str(a[2]) : 'fix';
    const f = { fix: Math.trunc, floor: Math.floor, ceil: Math.ceil, round: roundHalf }[opt] || Math.trunc;
    return ops.finalize(ops.elementwise(x, y, (p, q) => f(p / q), null, ops.resultType(x, y)));
  }, D('取整', "idivide(a,b,'fix')", '整数除法'));

  // ---------- 复数 ----------
  def('abs', (a) => { const v = H.tensor(a[0]); return ops.abs(v); }, D('复数', 'abs(x)', '绝对值或复数的模'));
  def('sign', (a) => {
    const v = H.tensor(a[0]);
    if (v.im) return H.mapC(v, Math.sign, (re, im, o) => { const m = Math.hypot(re, im); o[0] = m ? re / m : 0; o[1] = m ? im / m : 0; });
    return H.map(v, (x) => (x > 0 ? 1 : x < 0 ? -1 : (Number.isNaN(x) ? NaN : 0)), T.isIntType(v.type) ? v.type : 'double');
  }, D('初等数学', 'sign(x)', '符号函数'));
  def('real', (a) => { const v = H.tensor(a[0]); return new Tensor(v.rows, v.cols, new Float64Array(v.re), null, v.type === 'char' || v.type === 'logical' ? 'double' : v.type); }, D('复数', 'real(z)', '实部'));
  def('imag', (a) => { const v = H.tensor(a[0]); return new Tensor(v.rows, v.cols, v.im ? new Float64Array(v.im) : null, null, 'double'); }, D('复数', 'imag(z)', '虚部'));
  def('conj', (a) => { const v = H.tensor(a[0]); const t = v.clone(); if (t.im) for (let k = 0; k < t.im.length; k++) t.im[k] = -t.im[k]; return t; }, D('复数', 'conj(z)', '共轭复数'));
  def('angle phase', (a) => { const v = H.tensor(a[0]); const t = new Tensor(v.rows, v.cols); for (let k = 0; k < v.numel; k++) t.re[k] = Math.atan2(v.im ? v.im[k] : 0, v.re[k]); return t; }, D('复数', 'angle(z)', '相角（弧度）'));
  def('complex', (a) => {
    const re = H.tensor(a[0]); const im = a.length > 1 ? H.tensor(a[1]) : T.scalar(0);
    const t = ops.elementwise(re, im, (x) => x, (ar, ai, br, bi, o) => { o[0] = ar; o[1] = br; }, 'double');
    const out = ops.elementwise(re, im, null, (ar, ai, br, bi, o) => { o[0] = ar; o[1] = br; }, 'double');
    void t;
    return out;
  }, D('复数', 'complex(a,b)', '构造复数 a+bi'));
  def('cplxpair', (a) => a[0]);
  def('unwrap', (a) => {
    const v = H.tensor(a[0]); const tol = a.length > 1 && a[1].numel ? H.num(a[1]) : Math.PI;
    return H.transform(v, v.rows === 1 ? 2 : 1, (arr) => {
      const out = arr.slice(); let off = 0;
      for (let i = 1; i < arr.length; i++) { const d = arr[i] - arr[i - 1]; if (d > tol) off -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); else if (d < -tol) off += 2 * Math.PI * Math.round(-d / (2 * Math.PI)); out[i] = arr[i] + off; }
      return out;
    });
  }, D('复数', 'unwrap(p)', '相位解卷绕'));

  // ---------- 判断 ----------
  def('isnan', (a) => { const v = H.tensor(a[0]); const t = new Tensor(v.rows, v.cols, null, null, 'logical'); for (let k = 0; k < v.numel; k++) t.re[k] = Number.isNaN(v.re[k]) || (v.im && Number.isNaN(v.im[k])) ? 1 : 0; return t; }, D('逻辑运算', 'isnan(x)', '是否为 NaN'));
  def('isinf', (a) => { const v = H.tensor(a[0]); const t = new Tensor(v.rows, v.cols, null, null, 'logical'); for (let k = 0; k < v.numel; k++) t.re[k] = (v.re[k] === Infinity || v.re[k] === -Infinity || (v.im && Math.abs(v.im[k]) === Infinity)) ? 1 : 0; return t; }, D('逻辑运算', 'isinf(x)', '是否为无穷大'));
  def('isfinite', (a) => { const v = H.tensor(a[0]); const t = new Tensor(v.rows, v.cols, null, null, 'logical'); for (let k = 0; k < v.numel; k++) t.re[k] = Number.isFinite(v.re[k]) && (!v.im || Number.isFinite(v.im[k])) ? 1 : 0; return t; }, D('逻辑运算', 'isfinite(x)', '是否为有限值'));

  // ---------- 数论 ----------
  function gcd2(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  def('gcd', (a) => { let r = H.tensor(a[0]); for (let k = 1; k < a.length; k++) r = ops.elementwise(r, H.tensor(a[k]), gcd2, null, 'double'); return r; }, D('数论', 'gcd(a,b)', '最大公约数'));
  def('lcm', (a) => { let r = H.tensor(a[0]); for (let k = 1; k < a.length; k++) r = ops.elementwise(r, H.tensor(a[k]), (x, y) => (x === 0 || y === 0 ? 0 : Math.abs(x * y) / gcd2(x, y)), null, 'double'); return r; }, D('数论', 'lcm(a,b)', '最小公倍数'));
  function factorialN(n) {
    if (n < 0 || !Number.isInteger(n)) err('factorial: N 必须为非负整数。');
    if (n > 170) return Infinity;
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
  }
  def('factorial', (a) => H.map(a[0], factorialN), D('数论', 'factorial(n)', '阶乘 n!'));
  function binom(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }
  def('nchoosek', (a) => {
    const v = H.tensor(a[0]); const k = H.int(a[1]);
    if (v.numel === 1) return T.scalar(binom(v.re[0], k));
    const items = Array.from(v.re); const res = [];
    const comb = (start, cur) => { if (cur.length === k) { res.push(cur.slice()); return; } for (let i = start; i < items.length; i++) { cur.push(items[i]); comb(i + 1, cur); cur.pop(); } };
    comb(0, []);
    if (res.length === 0) return new Tensor(0, k);
    return T.fromRows(res);
  }, D('数论', 'nchoosek(n,k), nchoosek(v,k)', '二项式系数 C(n,k) 或所有组合'));
  def('perms', (a) => {
    const v = H.tensor(a[0]); const n = v.numel;
    if (n > 10) err('perms: 元素过多（最多 10 个）。');
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    const res = [];
    const perm = (arr, l) => { if (l === arr.length) { res.push(arr.slice()); return; } for (let i = l; i < arr.length; i++) { const t = arr.slice(); const x = t.splice(i, 1)[0]; t.splice(l, 0, x); perm(t, l + 1); } };
    perm(idx, 0);
    res.reverse();
    const t = T.fromRows(res.map((r) => r.map((i) => v.re[i])));
    t.type = v.type === 'char' ? 'char' : t.type;
    return t;
  }, D('数论', 'perms(v)', '全排列'));
  function sieve(n) {
    const isP = new Uint8Array(n + 1).fill(1); isP[0] = 0; if (n >= 1) isP[1] = 0;
    for (let i = 2; i * i <= n; i++) if (isP[i]) for (let j = i * i; j <= n; j += i) isP[j] = 0;
    const out = []; for (let i = 2; i <= n; i++) if (isP[i]) out.push(i);
    return out;
  }
  def('primes', (a) => { const n = Math.floor(H.num(a[0])); if (n > 1e8) err('primes: 输入过大。'); return T.row(n < 2 ? [] : sieve(n)); }, D('数论', 'primes(n)', '小于等于 n 的所有质数'));
  function isPrimeN(x) {
    if (x < 2 || !Number.isInteger(x)) return false;
    if (x < 4) return true;
    if (x % 2 === 0 || x % 3 === 0) return false;
    for (let i = 5; i * i <= x; i += 6) if (x % i === 0 || x % (i + 2) === 0) return false;
    return true;
  }
  def('isprime', (a) => H.map(a[0], (x) => (isPrimeN(x) ? 1 : 0), 'logical'), D('数论', 'isprime(n)', '是否为质数'));
  def('factor', (a) => {
    let n = H.num(a[0]);
    if (n < 1 || !Number.isInteger(n)) err('factor: N 必须为正整数。');
    const f = [];
    if (n === 1) return T.scalar(1);
    for (let p = 2; p * p <= n; p++) while (n % p === 0) { f.push(p); n /= p; }
    if (n > 1) f.push(n);
    return T.row(f);
  }, D('数论', 'factor(n)', '质因数分解'));
  def('rat', (a, nargout) => {
    const v = H.tensor(a[0]);
    const tol = a.length > 1 ? H.num(a[1]) : null;
    const N = new Tensor(v.rows, v.cols), Dn = new Tensor(v.rows, v.cols);
    for (let k = 0; k < v.numel; k++) {
      const x = v.re[k];
      const tl = tol === null ? 1e-6 * Math.abs(x) : tol;
      let y = x, h1 = 1, h0 = 0, k1 = 0, k0 = 1, h = Math.round(x), kk = 1;
      for (let i = 0; i < 30; i++) {
        const ai = Math.round(y);
        h = ai * h1 + h0; kk = ai * k1 + k0; h0 = h1; h1 = h; k0 = k1; k1 = kk;
        if (Math.abs(x - h / kk) <= tl) break;
        const f = y - ai; if (f === 0) break; y = 1 / f;
      }
      if (kk < 0) { h = -h; kk = -kk; }
      N.re[k] = h; Dn.re[k] = kk;
    }
    if (nargout >= 2) return [N, Dn];
    if (v.numel === 1) return T.str(Dn.re[0] === 1 ? String(N.re[0]) : N.re[0] + '/' + Dn.re[0]);
    return T.str(Array.from(N.re, (x, k) => (Dn.re[k] === 1 ? String(x) : x + '/' + Dn.re[k])).join('  '));
  }, D('数论', '[N,D] = rat(x)', '有理分式逼近'));
  def('rats', (a) => { const v = H.tensor(a[0]); return T.str(Array.from(v.re, (x) => ML.fmt.ratStr(x)).join('  ')); }, D('数论', 'rats(x)', '有理数形式字符串'));

  // ---------- 特殊函数 ----------
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(x) {
    if (Number.isNaN(x)) return NaN;
    if (x === Infinity) return Infinity;
    if (Number.isInteger(x) && x <= 0) return Infinity;
    if (Number.isInteger(x) && x <= 171) { let r = 1; for (let i = 2; i < x; i++) r *= i; return r; }
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    if (x > 171.7) return Infinity;
    x -= 1;
    let s = LG[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) s += LG[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * s;
  }
  function gammaln(x) {
    if (x <= 0) return x === 0 || Number.isInteger(x) ? Infinity : Math.log(Math.abs(gamma(x)));
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
    x -= 1;
    let s = LG[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) s += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s);
  }
  function erf(x) {
    if (Number.isNaN(x)) return NaN;
    const ax = Math.abs(x);
    if (ax < 2.5) {
      let sum = x, term = x; const x2 = x * x;
      for (let n = 1; n < 200; n++) { term *= -x2 / n; const d = term / (2 * n + 1); sum += d; if (Math.abs(d) < 1e-17 * Math.abs(sum)) break; }
      return 2 / Math.sqrt(Math.PI) * sum;
    }
    const r = 1 - erfcPos(ax);
    return x < 0 ? -r : r;
  }
  function erfcPos(x) {
    // 连分式（x >= 2.5）
    if (x > 27) return 0;
    let f = 0;
    for (let n = 60; n >= 1; n--) f = (n / 2) / (x + f);
    return Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  function erfc(x) {
    if (Number.isNaN(x)) return NaN;
    if (x >= 2.5) return erfcPos(x);
    if (x <= -2.5) return 2 - erfcPos(-x);
    return 1 - erf(x);
  }
  function erfinv(y) {
    if (y <= -1) return y === -1 ? -Infinity : NaN;
    if (y >= 1) return y === 1 ? Infinity : NaN;
    // Giles 近似 + 牛顿迭代
    let w = -Math.log((1 - y) * (1 + y)), x;
    if (w < 6.25) {
      w -= 3.125;
      x = -3.6444120640178196996e-21; x = -1.685059138182016589e-19 + x * w; x = 1.2858480715256400167e-18 + x * w; x = 1.115787767802518096e-17 + x * w; x = -1.333171662854620906e-16 + x * w; x = 2.0972767875968561637e-17 + x * w; x = 6.6376381343583238325e-15 + x * w; x = -4.0545662729752068639e-14 + x * w; x = -8.1519341976054721522e-14 + x * w; x = 2.6335093153082322977e-12 + x * w; x = -1.2975133253453532498e-11 + x * w; x = -5.4154120542946279317e-11 + x * w; x = 1.051212273321532285e-09 + x * w; x = -4.1126339803469836976e-09 + x * w; x = -2.9070369957882005086e-08 + x * w; x = 4.2347877827932403518e-07 + x * w; x = -1.3654692000834678645e-06 + x * w; x = -1.3882523362786468719e-05 + x * w; x = 0.0001867342080340571352 + x * w; x = -0.00074070253416626697512 + x * w; x = -0.0060336708714301490533 + x * w; x = 0.24015818242558961693 + x * w; x = 1.6536545626831027356 + x * w;
    } else if (w < 16) {
      w = Math.sqrt(w) - 3.25;
      x = 2.2137376921775787049e-09; x = 9.0756561938885390979e-08 + x * w; x = -2.7517406297064545428e-07 + x * w; x = 1.8239629214389227755e-08 + x * w; x = 1.5027403968909827627e-06 + x * w; x = -4.013867526981545969e-06 + x * w; x = 2.9234449089955446044e-06 + x * w; x = 1.2475304481671778723e-05 + x * w; x = -4.7318229009055733981e-05 + x * w; x = 6.8284851459573175448e-05 + x * w; x = 2.4031110387097893999e-05 + x * w; x = -0.0003550375203628474796 + x * w; x = 0.00095328937973738049703 + x * w; x = -0.0016882755560235047313 + x * w; x = 0.0024914420961078508066 + x * w; x = -0.0037512085075692412107 + x * w; x = 0.005370914553590063617 + x * w; x = 1.0052589676941592334 + x * w; x = 3.0838856104922207635 + x * w;
    } else {
      w = Math.sqrt(w) - 5;
      x = -2.7109920616438573243e-11; x = -2.5556418169965252055e-10 + x * w; x = 1.5076572693500548083e-09 + x * w; x = -3.7894654401267369937e-09 + x * w; x = 7.6157012080783393804e-09 + x * w; x = -1.4960026627149240478e-08 + x * w; x = 2.9147953450901080826e-08 + x * w; x = -6.7711997758452339498e-08 + x * w; x = 2.2900482228026654717e-07 + x * w; x = -9.9298272942317002539e-07 + x * w; x = 4.5260625972231537039e-06 + x * w; x = -1.9681778105531670567e-05 + x * w; x = 7.5995277030017761139e-05 + x * w; x = -0.00021503011930044477347 + x * w; x = -0.00013871931833623122026 + x * w; x = 1.0103004648645343977 + x * w; x = 4.8499064014085844221 + x * w;
    }
    x *= y;
    for (let i = 0; i < 2; i++) { const e = erf(x) - y; x -= e / (2 / Math.sqrt(Math.PI) * Math.exp(-x * x)); }
    return x;
  }
  ML.special = { gamma, gammaln, erf, erfc, erfinv, beta: (a, b) => Math.exp(gammaln(a) + gammaln(b) - gammaln(a + b)) };
  unary('gamma', gamma, null, null, D('特殊函数', 'gamma(x)', '伽马函数 Γ(x)'));
  unary('gammaln', gammaln, null, null, D('特殊函数', 'gammaln(x)', '伽马函数的对数'));
  unary('erf', erf, null, null, D('特殊函数', 'erf(x)', '误差函数'));
  unary('erfc', erfc, null, null, D('特殊函数', 'erfc(x)', '互补误差函数'));
  unary('erfinv', erfinv, null, null, D('特殊函数', 'erfinv(y)', '逆误差函数'));
  unary('erfcinv', (y) => erfinv(1 - y), null, null, D('特殊函数', 'erfcinv(y)', '逆互补误差函数'));
  binReal('beta', (a, b) => Math.exp(gammaln(a) + gammaln(b) - gammaln(a + b)), D('特殊函数', 'beta(a,b)', '贝塔函数 B(a,b)'));
  // 不完全伽马函数（正则化）
  function gammainc(x, a) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let sum = 1 / a, del = sum;
      for (let n = 1; n < 500; n++) { del *= x / (a + n); sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
      return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }
  ML.special.gammainc = gammainc;
  binReal('gammainc', gammainc, D('特殊函数', 'gammainc(x,a)', '正则化不完全伽马函数'));
  // 正则化不完全贝塔函数
  function betacf(a, b, x) {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  function betainc(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
  ML.special.betainc = betainc;
  def('betainc', (a) => {
    const X = H.tensor(a[0]), A = H.num(a[1]), B = H.num(a[2]);
    return H.map(X, (x) => betainc(x, A, B));
  }, D('特殊函数', 'betainc(x,a,b)', '正则化不完全贝塔函数'));
  // 贝塞尔函数（第一类，整数/实数阶，级数）
  function besselj(nu, x) {
    if (x === 0) return nu === 0 ? 1 : 0;
    if (Math.abs(x) > 25 + nu) {
      // 渐近展开
      const w = x - (nu / 2 + 0.25) * Math.PI;
      return Math.sqrt(2 / (Math.PI * x)) * Math.cos(w);
    }
    let sum = 0;
    for (let m = 0; m < 300; m++) {
      const t = Math.exp(m * 2 * Math.log(Math.abs(x) / 2) + nu * Math.log(Math.abs(x) / 2) - gammaln(m + 1) - gammaln(m + nu + 1)) * (m % 2 ? -1 : 1);
      sum += t;
      if (m > 5 && Math.abs(t) < 1e-17 * Math.abs(sum)) break;
    }
    if (x < 0 && Number.isInteger(nu) && nu % 2 === 1) sum = -sum;
    return sum;
  }
  def('besselj', (a) => { const nu = H.num(a[0]); return H.map(a[1], (x) => besselj(nu, x)); }, D('特殊函数', 'besselj(nu,x)', '第一类贝塞尔函数'));

  // ---------- 运算符的函数形式 ----------
  const fnOp = (name, f, doc) => def(name, (a) => { H.nargchk(a, 2, 2, name); return f(a[0], a[1]); }, doc);
  fnOp('plus', ops.plus, D('运算符', 'plus(a,b)', 'a + b'));
  fnOp('minus', ops.minus, D('运算符', 'minus(a,b)', 'a - b'));
  fnOp('times', ops.times, D('运算符', 'times(a,b)', 'a .* b'));
  fnOp('rdivide', ops.rdivide, D('运算符', 'rdivide(a,b)', 'a ./ b'));
  fnOp('ldivide', ops.ldivide, D('运算符', 'ldivide(a,b)', 'a .\\ b'));
  fnOp('mtimes', ops.mtimes, D('运算符', 'mtimes(A,B)', 'A * B 矩阵乘法'));
  fnOp('mrdivide', ops.mrdivide, D('运算符', 'mrdivide(A,B)', 'A / B'));
  fnOp('mldivide', ops.mldivide, D('运算符', 'mldivide(A,B)', 'A \\ B 解线性方程组'));
  fnOp('power', ops.power, D('运算符', 'power(a,b)', 'a .^ b'));
  fnOp('mpower', ops.mpower, D('运算符', 'mpower(A,p)', 'A ^ p'));
  fnOp('eq', ops.eq, D('运算符', 'eq(a,b)', 'a == b'));
  fnOp('ne', ops.ne, D('运算符', 'ne(a,b)', 'a ~= b'));
  fnOp('lt', ops.lt, D('运算符', 'lt(a,b)', 'a < b'));
  fnOp('le', ops.le, D('运算符', 'le(a,b)', 'a <= b'));
  fnOp('gt', ops.gt, D('运算符', 'gt(a,b)', 'a > b'));
  fnOp('ge', ops.ge, D('运算符', 'ge(a,b)', 'a >= b'));
  def('and', (a) => { let r = a[0]; for (let k = 1; k < a.length; k++) r = ops.and(r, a[k]); return r; }, D('运算符', 'and(a,b)', 'a & b'));
  def('or', (a) => { let r = a[0]; for (let k = 1; k < a.length; k++) r = ops.or(r, a[k]); return r; }, D('运算符', 'or(a,b)', 'a | b'));
  fnOp('xor', ops.xor, D('逻辑运算', 'xor(a,b)', '逻辑异或'));
  def('not', (a) => ops.not(a[0]), D('运算符', 'not(a)', '~a'));
  def('uminus', (a) => ops.uminus(a[0]), D('运算符', 'uminus(a)', '-a'));
  def('uplus', (a) => ops.uplus(a[0]), D('运算符', 'uplus(a)', '+a'));
  def('transpose', (a) => ops.transpose(a[0]), D('运算符', 'transpose(A)', "A.' 转置"));
  def('ctranspose', (a) => ops.ctranspose(a[0]), D('运算符', 'ctranspose(A)', "A' 共轭转置"));
})(typeof self !== 'undefined' ? self : globalThis);
