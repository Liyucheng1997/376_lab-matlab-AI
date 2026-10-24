/* MatWeb - 数值计算：多项式、插值、优化、求根、数值积分、常微分方程、FFT、滤波 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Struct, FuncHandle } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const ops = ML.ops, LA = ML.linalg;
  const D = (cat, syn, desc) => ({ cat, syn, desc });

  // ---------- 多项式 ----------
  function polyvalArr(p, x) { let y = 0; for (let i = 0; i < p.length; i++) y = y * x + p[i]; return y; }
  def('polyval', (a) => {
    const p = H.tensor(a[0]), X = H.tensor(a[1]);
    let mu = null;
    if (a.length > 3) mu = H.toArray(a[3]);
    if (p.im || X.im) {
      // 复数霍纳法
      const t = new Tensor(X.rows, X.cols); t.im = new Float64Array(X.numel);
      const o = [0, 0];
      for (let k = 0; k < X.numel; k++) {
        let xr = X.re[k], xi = X.im ? X.im[k] : 0;
        if (mu) { xr = (xr - mu[0]) / mu[1]; xi /= mu[1]; }
        let yr = 0, yi = 0;
        for (let i = 0; i < p.numel; i++) { ML.C.mul(yr, yi, xr, xi, o); yr = o[0] + p.re[i]; yi = o[1] + (p.im ? p.im[i] : 0); }
        t.re[k] = yr; t.im[k] = yi;
      }
      return t.trim();
    }
    const pa = Array.from(p.re);
    return H.map(X, (x) => polyvalArr(pa, mu ? (x - mu[0]) / mu[1] : x));
  }, D('多项式', 'y = polyval(p,x)', '计算多项式在 x 处的值'));
  def('polyvalm', (a) => {
    const p = H.toArray(a[0]), X = H.tensor(a[1]);
    let Y = new Tensor(X.rows, X.cols);
    for (const c of p) Y = ops.plus(ops.mtimes(Y, X), ops.times(T.scalar(c), ops.eye(X.rows)));
    return Y;
  }, D('多项式', 'polyvalm(p,X)', '矩阵多项式求值'));
  def('polyfit', (a, nargout) => {
    let x = H.toArray(a[0]); const y = H.toArray(a[1]); const n = H.int(a[2]);
    if (x.length !== y.length) err('polyfit: X 和 Y 向量的长度必须相同。');
    let mu = null;
    if (nargout >= 3) {
      const m = x.reduce((s, v) => s + v, 0) / x.length;
      const sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
      mu = [m, sd]; x = x.map((v) => (v - m) / sd);
    }
    const V = new Tensor(x.length, n + 1);
    for (let i = 0; i < x.length; i++) for (let j = 0; j <= n; j++) V.re[i + j * x.length] = Math.pow(x[i], n - j);
    if (x.length <= n) ML.warn('polyfit: 多项式是病态的。请添加具有不同 X 值的点、降低多项式的次数，或尝试中心化和缩放。');
    const p = ops.mldivide(V, T.col(y));
    const P = T.row(Array.from(p.re));
    if (nargout >= 2) {
      const r = ops.minus(T.col(y), ops.mtimes(V, p));
      const S = new Struct(1, 1);
      S.setField('R', LA.qr(V, true).R, 0);
      S.setField('df', T.scalar(Math.max(0, x.length - (n + 1))), 0);
      S.setField('normr', T.scalar(LA.norm(r)), 0);
      const out = [P, S];
      if (mu) out.push(T.col(mu));
      return out;
    }
    return P;
  }, D('多项式', 'p = polyfit(x,y,n)', '多项式曲线拟合（最小二乘）'));
  def('roots', (a) => {
    let p = H.toArray(a[0]);
    while (p.length && p[0] === 0) p.shift();
    let nz = 0; while (p.length && p[p.length - 1] === 0) { p.pop(); nz++; }
    const n = p.length - 1;
    const res = [];
    if (n >= 1) {
      const Cm = new Tensor(n, n);
      for (let j = 0; j < n; j++) Cm.re[0 + j * n] = -p[j + 1] / p[0];
      for (let i = 1; i < n; i++) Cm.re[i + (i - 1) * n] = 1;
      const e = LA.eig(Cm, false).values;
      e.sort((x, y) => (Math.abs(x[0] - y[0]) > 1e-10 * Math.max(1, Math.abs(x[0])) ? y[0] - x[0] : y[1] - x[1]));
      for (const v of e) res.push(v);
    }
    for (let i = 0; i < nz; i++) res.push([0, 0]);
    const t = new Tensor(res.length, 1); t.im = new Float64Array(res.length);
    res.forEach((v, i) => { t.re[i] = Math.abs(v[0]) < 1e-14 && v[1] !== 0 ? 0 : v[0]; t.im[i] = v[1]; });
    if (res.length === 0) return new Tensor(0, 1);
    return t.trim();
  }, D('多项式', 'r = roots(p)', '多项式的根（p 为降幂系数）'));
  function convArr(u, v) {
    const out = new Array(u.length + v.length - 1).fill(0);
    for (let i = 0; i < u.length; i++) for (let j = 0; j < v.length; j++) out[i + j] += u[i] * v[j];
    return out;
  }
  def('conv', (a) => {
    const U = H.tensor(a[0]), V = H.tensor(a[1]);
    const u = Array.from(U.re), v = Array.from(V.re);
    if (!u.length || !v.length) return new Tensor(1, 0);
    let out = convArr(u, v);
    const shape = a.length > 2 ? H.str(a[2]) : 'full';
    if (shape === 'same') { const st = Math.floor(v.length / 2); out = out.slice(st, st + u.length); }
    else if (shape === 'valid') { out = u.length >= v.length ? out.slice(v.length - 1, u.length) : []; }
    return (U.cols === 1 && U.rows > 1) || (U.numel === 1 && V.cols === 1 && V.rows > 1) ? T.col(out) : T.row(out);
  }, D('多项式', 'w = conv(u,v)', '卷积与多项式乘法'));
  def('deconv', (a) => {
    const u = H.toArray(a[0]), v = H.toArray(a[1]);
    if (v[0] === 0) err('deconv: 除数的首项系数不能为零。');
    if (u.length < v.length) return [T.scalar(0), T.row(u)];
    const r = u.slice(); const q = new Array(u.length - v.length + 1).fill(0);
    for (let i = 0; i < q.length; i++) { q[i] = r[i] / v[0]; for (let j = 0; j < v.length; j++) r[i + j] -= q[i] * v[j]; }
    for (let i = 0; i < q.length; i++) r[i] = 0;
    return [T.row(q), T.row(r.map((x) => (Math.abs(x) < 1e-14 ? 0 : x)))];
  }, D('多项式', '[q,r] = deconv(u,v)', '多项式除法（反卷积）'));
  function polyderArr(p) { const n = p.length - 1; if (n < 1) return [0]; const d = []; for (let i = 0; i < n; i++) d.push(p[i] * (n - i)); return d; }
  def('polyder', (a, nargout) => {
    if (a.length === 1) return T.row(polyderArr(H.toArray(a[0])));
    const u = H.toArray(a[0]), v = H.toArray(a[1]);
    if (nargout < 2) {
      const d = addPoly(convArr(polyderArr(u), v), convArr(u, polyderArr(v)));
      return T.row(stripLead(d));
    }
    const num = addPoly(convArr(polyderArr(u), v), convArr(u, polyderArr(v)).map((x) => -x));
    return [T.row(stripLead(num)), T.row(convArr(v, v))];
  }, D('多项式', 'polyder(p), polyder(a,b)', '多项式求导'));
  function addPoly(a, b) { const n = Math.max(a.length, b.length); const out = new Array(n).fill(0); for (let i = 0; i < a.length; i++) out[n - a.length + i] += a[i]; for (let i = 0; i < b.length; i++) out[n - b.length + i] += b[i]; return out; }
  function stripLead(p) { let i = 0; while (i < p.length - 1 && p[i] === 0) i++; return p.slice(i); }
  def('polyint', (a) => {
    const p = H.toArray(a[0]); const k = a.length > 1 ? H.num(a[1]) : 0; const n = p.length;
    const out = p.map((c, i) => c / (n - i)); out.push(k);
    return T.row(out);
  }, D('多项式', 'polyint(p), polyint(p,k)', '多项式积分'));

  // ---------- 插值 ----------
  function findInterval(x, v) {
    // x 升序；返回 i 使 x[i] <= v < x[i+1]
    let lo = 0, hi = x.length - 1;
    if (v <= x[0]) return 0;
    if (v >= x[hi]) return hi - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= v) lo = m; else hi = m; }
    return lo;
  }
  function splineCoefs(x, y, endSlopes) {
    const n = x.length;
    if (n === 2 && !endSlopes) { const s = (y[1] - y[0]) / (x[1] - x[0]); return [[0, 0, s, y[0]]]; }
    const h = []; for (let i = 0; i < n - 1; i++) h.push(x[i + 1] - x[i]);
    const del = []; for (let i = 0; i < n - 1; i++) del.push((y[i + 1] - y[i]) / h[i]);
    if (n === 3 && !endSlopes) {
      // 抛物线
      const c2 = (del[1] - del[0]) / (x[2] - x[0]);
      const b0 = del[0] - c2 * h[0];
      return [[0, c2, b0, y[0]], [0, c2, b0 + 2 * c2 * h[0], y[1]]];
    }
    // 求二阶导 M：三对角方程组（Thomas 算法）
    const thomas = (A, rhs) => {
      const N = rhs.length, cp = new Array(N), dp = new Array(N), x = new Array(N);
      cp[0] = A[0][2] / A[0][1]; dp[0] = rhs[0] / A[0][1];
      for (let i = 1; i < N; i++) {
        const den = A[i][1] - A[i][0] * cp[i - 1];
        cp[i] = A[i][2] / den; dp[i] = (rhs[i] - A[i][0] * dp[i - 1]) / den;
      }
      x[N - 1] = dp[N - 1];
      for (let i = N - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
      return x;
    };
    let M;
    if (endSlopes) {
      // 端点斜率已知（clamped）
      const A = [], rhs = [];
      A.push([0, 2 * h[0], h[0]]); rhs.push(6 * (del[0] - endSlopes[0]));
      for (let i = 1; i < n - 1; i++) { A.push([h[i - 1], 2 * (h[i - 1] + h[i]), h[i]]); rhs.push(6 * (del[i] - del[i - 1])); }
      A.push([h[n - 2], 2 * h[n - 2], 0]); rhs.push(6 * (endSlopes[1] - del[n - 2]));
      M = thomas(A, rhs);
    } else {
      // not-a-knot：用端点条件消去 M0 与 M(n-1)，只解内部未知量 M1..M(n-2)
      const m = n - 1;
      const A = [], rhs = [];
      for (let i = 1; i <= n - 2; i++) {
        let a = h[i - 1], b = 2 * (h[i - 1] + h[i]), c = h[i];
        if (i === 1) { b += h[0] * (h[0] + h[1]) / h[1]; c = h[1] - h[0] * h[0] / h[1]; a = 0; }
        if (i === n - 2) { a = h[m - 2] - h[m - 1] * h[m - 1] / h[m - 2]; b += h[m - 1] * (h[m - 2] + h[m - 1]) / h[m - 2]; c = 0; }
        A.push([a, b, c]); rhs.push(6 * (del[i] - del[i - 1]));
      }
      const inner = thomas(A, rhs);
      M = [0].concat(inner, [0]);
      M[0] = ((h[0] + h[1]) * M[1] - h[0] * M[2]) / h[1];
      M[m] = ((h[m - 2] + h[m - 1]) * M[m - 1] - h[m - 1] * M[m - 2]) / h[m - 2];
    }
    const coefs = [];
    for (let i = 0; i < n - 1; i++) {
      const a3 = (M[i + 1] - M[i]) / (6 * h[i]);
      const a2 = M[i] / 2;
      const a1 = del[i] - h[i] * (2 * M[i] + M[i + 1]) / 6;
      coefs.push([a3, a2, a1, y[i]]);
    }
    return coefs;
  }
  function pchipCoefs(x, y) {
    const n = x.length;
    const h = [], del = [];
    for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); del.push((y[i + 1] - y[i]) / h[i]); }
    const d = new Array(n).fill(0);
    if (n === 2) { d[0] = d[1] = del[0]; }
    else {
      for (let k = 1; k < n - 1; k++) {
        if (del[k - 1] * del[k] > 0) {
          const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
          d[k] = (w1 + w2) / (w1 / del[k - 1] + w2 / del[k]);
        }
      }
      const endD = (h0, h1, d0, d1) => {
        let v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
        if (Math.sign(v) !== Math.sign(d0)) v = 0;
        else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(v) > Math.abs(3 * d0)) v = 3 * d0;
        return v;
      };
      d[0] = endD(h[0], h[1], del[0], del[1]);
      d[n - 1] = endD(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
    }
    const coefs = [];
    for (let i = 0; i < n - 1; i++) {
      const c = (3 * del[i] - 2 * d[i] - d[i + 1]) / h[i];
      const b = (d[i] - 2 * del[i] + d[i + 1]) / (h[i] * h[i]);
      coefs.push([b, c, d[i], y[i]]);
    }
    return coefs;
  }
  function ppEval(x, coefs, v) {
    const i = findInterval(x, v);
    const c = coefs[Math.min(i, coefs.length - 1)];
    const s = v - x[Math.min(i, coefs.length - 1)];
    return ((c[0] * s + c[1]) * s + c[2]) * s + c[3];
  }
  function interp1Core(x, y, xi, method, extrap) {
    const n = x.length;
    // 排序
    if (n > 1 && x[1] < x[0]) { x = x.slice().reverse(); y = y.slice().reverse(); }
    for (let i = 1; i < n; i++) if (!(x[i] > x[i - 1])) err('interp1: 采样点必须唯一且单调。');
    let coefs = null;
    if (method === 'spline') coefs = splineCoefs(x, y);
    else if (method === 'pchip' || method === 'cubic' || method === 'makima') coefs = n > 1 ? pchipCoefs(x, y) : null;
    const doExtrap = extrap === undefined ? (method === 'spline' || method === 'pchip' || method === 'cubic' || method === 'makima') : extrap;
    const extrapVal = typeof extrap === 'number' ? extrap : NaN;
    return xi.map((v) => {
      if (Number.isNaN(v)) return NaN;
      const out = v < x[0] || v > x[n - 1];
      if (out && doExtrap !== true) return typeof extrap === 'number' ? extrapVal : NaN;
      if (n === 1) return y[0];
      switch (method) {
        case 'nearest': { const i = findInterval(x, v); return (v - x[i] < x[i + 1] - v) ? y[i] : y[i + 1]; }
        case 'previous': { if (v >= x[n - 1]) return y[n - 1]; const i = findInterval(x, v); return y[i]; }
        case 'next': { if (v <= x[0]) return y[0]; const i = findInterval(x, v); return v === x[i] ? y[i] : y[i + 1]; }
        case 'linear': { const i = findInterval(x, v); const t = (v - x[i]) / (x[i + 1] - x[i]); return y[i] + t * (y[i + 1] - y[i]); }
        default: return ppEval(x, coefs, v);
      }
    });
  }
  def('interp1', (a) => {
    let x, Y, Xi, rest;
    if (a.length === 2 || (a.length >= 3 && T.isStr(a[2]))) { Y = H.tensor(a[0]); Xi = H.tensor(a[1]); x = null; rest = a.slice(2); }
    else { x = H.toArray(a[0]); Y = H.tensor(a[1]); Xi = H.tensor(a[2]); rest = a.slice(3); }
    let method = 'linear', extrap;
    for (const r of rest) {
      if (T.isStr(r)) { const s = r.toStr().toLowerCase(); if (s === 'extrap') extrap = true; else method = s.replace('*', ''); }
      else if (r instanceof Tensor && r.numel === 1) extrap = r.re[0];
    }
    const yIsVec = Y.rows === 1 || Y.cols === 1;
    const n = yIsVec ? Y.numel : Y.rows;
    if (!x) { x = []; for (let i = 1; i <= n; i++) x.push(i); }
    if (x.length !== n) err('interp1: 采样点 X 与 Y 的长度不一致。');
    const xi = Array.from(Xi.re);
    if (yIsVec) {
      const out = interp1Core(x, Array.from(Y.re), xi, method, extrap);
      return new Tensor(Xi.rows, Xi.cols, Float64Array.from(out));
    }
    const cols = [];
    for (let c = 0; c < Y.cols; c++) { const ycol = []; for (let r = 0; r < Y.rows; r++) ycol.push(Y.re[r + c * Y.rows]); cols.push(interp1Core(x, ycol, xi, method, extrap)); }
    const t = new Tensor(xi.length, Y.cols);
    cols.forEach((col, c) => col.forEach((v, r) => { t.re[r + c * xi.length] = v; }));
    return t;
  }, D('插值', "yi = interp1(x,y,xi,method)", "一维插值（'linear','nearest','spline','pchip','previous','next'）"));
  function makePP(x, coefs) {
    const s = new Struct(1, 1);
    s.setField('form', T.str('pp'), 0);
    s.setField('breaks', T.row(x), 0);
    s.setField('coefs', T.fromRows(coefs), 0);
    s.setField('pieces', T.scalar(coefs.length), 0);
    s.setField('order', T.scalar(4), 0);
    s.setField('dim', T.scalar(1), 0);
    return s;
  }
  def('spline', (a) => {
    const x = H.toArray(a[0]); let y = H.toArray(a[1]);
    let ends = null;
    if (y.length === x.length + 2) { ends = [y[0], y[y.length - 1]]; y = y.slice(1, -1); }
    const coefs = splineCoefs(x, y, ends);
    if (a.length < 3) return makePP(x, coefs);
    const Xi = H.tensor(a[2]);
    return H.map(Xi, (v) => ppEval(x, coefs, v));
  }, D('插值', 'yy = spline(x,y,xx), pp = spline(x,y)', '三次样条插值（not-a-knot）'));
  def('pchip', (a) => {
    const x = H.toArray(a[0]), y = H.toArray(a[1]);
    const coefs = pchipCoefs(x, y);
    if (a.length < 3) return makePP(x, coefs);
    return H.map(H.tensor(a[2]), (v) => ppEval(x, coefs, v));
  }, D('插值', 'yy = pchip(x,y,xx)', '保形分段三次 Hermite 插值'));
  def('makima', (a) => ML.builtins.pchip(a), D('插值', 'yy = makima(x,y,xx)', '修正 Akima 插值（此处近似为 pchip）'));
  def('ppval', (a) => {
    const pp = a[0]; if (!(pp instanceof Struct)) err('ppval: 第一个参数必须为分段多项式结构体。');
    const x = H.toArray(pp.getField('breaks', 0)); const C = pp.getField('coefs', 0);
    const coefs = T.toRows(C).map((r) => { while (r.length < 4) r.unshift(0); return r; });
    return H.map(H.tensor(a[1]), (v) => ppEval(x, coefs, v));
  }, D('插值', 'v = ppval(pp,xx)', '计算分段多项式'));
  def('interp2', (a) => {
    let X, Y, Z, XI, YI, method = 'linear';
    const args = a.filter((v) => !T.isStr(v)); const strs = a.filter(T.isStr);
    if (strs.length) method = strs[0].toStr().toLowerCase();
    if (args.length === 3) { Z = H.tensor(args[0]); XI = H.tensor(args[1]); YI = H.tensor(args[2]); X = null; Y = null; }
    else { X = H.tensor(args[0]); Y = H.tensor(args[1]); Z = H.tensor(args[2]); XI = H.tensor(args[3]); YI = H.tensor(args[4]); }
    const R = Z.rows, Cc = Z.cols;
    let xv, yv;
    if (!X) { xv = []; for (let j = 1; j <= Cc; j++) xv.push(j); yv = []; for (let i = 1; i <= R; i++) yv.push(i); }
    else {
      xv = (X.rows === 1 || X.cols === 1) ? Array.from(X.re) : Array.from({ length: Cc }, (v, j) => X.re[0 + j * X.rows]);
      yv = (Y.rows === 1 || Y.cols === 1) ? Array.from(Y.re) : Array.from({ length: R }, (v, i) => Y.re[i]);
    }
    let xiArr = XI, yiArr = YI;
    if ((XI.rows === 1 && YI.cols === 1 && YI.rows > 1) || (XI.cols === 1 && YI.rows === 1 && XI.rows > 1)) {
      const g = ML.builtins.meshgrid([XI, YI], 2); xiArr = g[0]; yiArr = g[1];
    }
    const out = new Tensor(xiArr.rows, xiArr.cols);
    const z = (i, j) => Z.re[i + j * R];
    for (let k = 0; k < xiArr.numel; k++) {
      const xq = xiArr.re[k], yq = yiArr.re[yiArr.numel === 1 ? 0 : k];
      if (xq < xv[0] || xq > xv[Cc - 1] || yq < yv[0] || yq > yv[R - 1]) { out.re[k] = NaN; continue; }
      const j = Math.min(findInterval(xv, xq), Cc - 2), i = Math.min(findInterval(yv, yq), R - 2);
      if (Cc === 1 || R === 1) { out.re[k] = z(0, 0); continue; }
      const tx = (xq - xv[j]) / (xv[j + 1] - xv[j]), ty = (yq - yv[i]) / (yv[i + 1] - yv[i]);
      if (method === 'nearest') { out.re[k] = z(ty < 0.5 ? i : i + 1, tx < 0.5 ? j : j + 1); continue; }
      out.re[k] = (1 - tx) * (1 - ty) * z(i, j) + tx * (1 - ty) * z(i, j + 1) + (1 - tx) * ty * z(i + 1, j) + tx * ty * z(i + 1, j + 1);
    }
    return out;
  }, D('插值', 'ZI = interp2(X,Y,Z,XI,YI)', '二维插值（双线性/最近邻）'));

  // ---------- 函数句柄求值辅助 ----------
  function scalarFn(it, f) {
    return (x) => {
      const r = it.call1(f, [T.scalar(x)]);
      if (!(r instanceof Tensor) || r.numel < 1) err('函数必须返回数值标量。');
      return r.re[0];
    };
  }
  // 向量化求值：尝试一次传入向量，失败则逐点
  function vecFn(it, f) {
    let vectorOK = true;
    return (xs) => {
      if (vectorOK) {
        try {
          const r = it.call1(f, [T.row(xs)]);
          if (r instanceof Tensor && r.numel === xs.length) return Array.from(r.re);
          vectorOK = false;
        } catch (e) { if (e instanceof ML.MError && /interrupt/.test(e.identifier)) throw e; vectorOK = false; }
      }
      return xs.map((x) => { const r = it.call1(f, [T.scalar(x)]); return r.re[0]; });
    };
  }
  function getOpt(opts, name, dflt) {
    if (opts instanceof Struct && opts.hasField(name)) { const v = opts.getField(name, 0); if (v instanceof Tensor && v.numel) return v.type === 'char' ? v.toStr() : v.re[0]; }
    return dflt;
  }
  function optStruct(a) {
    const s = new Struct(1, 1);
    let start = 0;
    if (a.length && a[0] instanceof Struct) { const b = a[0]; for (const f of b.fields) s.setField(f, b.getField(f, 0), 0); start = 1; }
    for (let i = start; i + 1 < a.length; i += 2) s.setField(H.str(a[i]), a[i + 1], 0);
    return s;
  }
  def('optimset', (a) => optStruct(a), D('优化', "opts = optimset('TolX',1e-8)", '创建优化选项结构体'));
  def('optimoptions', (a) => optStruct(a.slice(1)), D('优化', "optimoptions('fminsearch',...)", '创建优化选项'));
  def('odeset', (a) => optStruct(a), D('微分方程', "opts = odeset('RelTol',1e-6)", '创建 ODE 选项结构体'));
  def('optimget odeget', (a) => { const s = a[0]; const n = H.str(a[1]); for (const f of s.fields) if (f.toLowerCase() === n.toLowerCase()) return s.getField(f, 0); return a.length > 2 ? a[2] : new Tensor(0, 0); });

  // ---------- 求根 ----------
  function brent(f, a, b, fa, fb, tol, maxIter) {
    let c = a, fc = fa, d = b - a, e = d;
    for (let it = 0; it < maxIter; it++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const tol1 = 2 * LA.EPS * Math.abs(b) + 0.5 * tol;
      const m = 0.5 * (c - b);
      if (Math.abs(m) <= tol1 || fb === 0) return { x: b, fx: fb, iter: it };
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        let p, q, r;
        const s = fb / fa;
        if (a === c) { p = 2 * m * s; q = 1 - s; }
        else { q = fa / fc; r = fb / fc; p = s * (2 * m * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
        if (p > 0) q = -q; else p = -p;
        if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
        else { d = m; e = m; }
      } else { d = m; e = m; }
      a = b; fa = fb;
      b += Math.abs(d) > tol1 ? d : (m > 0 ? tol1 : -tol1);
      fb = f(b);
    }
    return { x: b, fx: fb, iter: maxIter };
  }
  def('fzero', (a, nargout, it) => {
    H.nargchk(a, 2, 3, 'fzero');
    const f = scalarFn(it, a[0]);
    const x0 = H.toArray(a[1]);
    const tol = getOpt(a[2], 'TolX', LA.EPS);
    let lo, hi, flo, fhi;
    if (x0.length >= 2) {
      lo = x0[0]; hi = x0[1]; flo = f(lo); fhi = f(hi);
      if (flo * fhi > 0) err('fzero: 区间端点处的函数值必须具有不同的符号。');
    } else {
      const x = x0[0]; const fx = f(x);
      if (fx === 0) return [T.scalar(x), T.scalar(0), T.scalar(1)];
      let dx = x !== 0 ? Math.abs(x) / 50 : 1 / 50;
      let found = false;
      for (let k = 0; k < 200 && !found; k++) {
        lo = x - dx; hi = x + dx; flo = f(lo); fhi = f(hi);
        if (Math.sign(flo) * Math.sign(fx) <= 0 && Number.isFinite(flo)) { hi = x; fhi = fx; found = true; break; }
        if (Math.sign(fhi) * Math.sign(fx) <= 0 && Number.isFinite(fhi)) { lo = x; flo = fx; found = true; break; }
        dx *= Math.SQRT2;
      }
      if (!found) err('fzero: 搜索区间时未找到符号变化，无法求根（' + x + ' 附近）。');
    }
    const r = brent(f, lo, hi, flo, fhi, tol, 500);
    return [T.scalar(r.x), T.scalar(r.fx), T.scalar(1)];
  }, D('优化', 'x = fzero(fun,x0), x = fzero(fun,[a b])', '求一元非线性方程的根'));
  def('fsolve', (a, nargout, it) => {
    const f = a[0]; const x0 = H.tensor(a[1]);
    const n = x0.numel;
    const F = (x) => { const r = it.call1(f, [new Tensor(x0.rows, x0.cols, Float64Array.from(x))]); return Array.from(H.tensor(r).re); };
    let x = Array.from(x0.re); let fx = F(x);
    const norm2 = (v) => Math.sqrt(v.reduce((s, y) => s + y * y, 0));
    let exitflag = 1;
    for (let iter = 0; iter < 200; iter++) {
      if (norm2(fx) < 1e-12) break;
      const m = fx.length;
      const J = new Tensor(m, n);
      for (let j = 0; j < n; j++) {
        const h = 1e-7 * Math.max(1, Math.abs(x[j]));
        const xp = x.slice(); xp[j] += h; const fp = F(xp);
        for (let i = 0; i < m; i++) J.re[i + j * m] = (fp[i] - fx[i]) / h;
      }
      const saveWarn = ML.warn; ML.warn = () => {};
      let dx;
      try { dx = Array.from(ops.mldivide(J, T.col(fx.map((v) => -v))).re); } finally { ML.warn = saveWarn; }
      if (dx.some((v) => !Number.isFinite(v))) dx = Array.from(ops.mtimes(LA.pinv(J), T.col(fx.map((v) => -v))).re);
      let t = 1; const f0 = norm2(fx);
      let xn, fn;
      for (let ls = 0; ls < 30; ls++) { xn = x.map((v, i) => v + t * dx[i]); fn = F(xn); if (norm2(fn) < f0 || t < 1e-8) break; t /= 2; }
      const step = norm2(dx.map((v) => v * t));
      x = xn; fx = fn;
      if (step < 1e-14 * (1 + norm2(x))) { if (norm2(fx) > 1e-6) exitflag = -2; break; }
      if (iter === 199) exitflag = 0;
    }
    return [new Tensor(x0.rows, x0.cols, Float64Array.from(x)), new Tensor(fx.length === n ? x0.rows : fx.length, fx.length === n ? x0.cols : 1, Float64Array.from(fx)), T.scalar(exitflag)];
  }, D('优化', 'x = fsolve(fun,x0)', '求解非线性方程组 F(x) = 0'));

  // ---------- 最优化 ----------
  def('fminsearch', (a, nargout, it) => {
    const f = a[0]; const x0 = H.tensor(a[1]); const opts = a[2];
    const n = x0.numel;
    const F = (x) => H.num(it.call1(f, [new Tensor(x0.rows, x0.cols, Float64Array.from(x))]));
    const tolx = getOpt(opts, 'TolX', 1e-4), tolf = getOpt(opts, 'TolFun', 1e-4);
    const maxIter = getOpt(opts, 'MaxIter', 200 * n), maxFun = getOpt(opts, 'MaxFunEvals', 200 * n);
    let simplex = [Array.from(x0.re)];
    for (let i = 0; i < n; i++) { const p = simplex[0].slice(); p[i] = p[i] !== 0 ? p[i] * 1.05 : 0.00025; simplex.push(p); }
    let fv = simplex.map(F); let nf = n + 1;
    const order = () => { const idx = fv.map((v, i) => i).sort((p, q) => fv[p] - fv[q]); simplex = idx.map((i) => simplex[i]); fv = idx.map((i) => fv[i]); };
    order();
    let iter = 0;
    while (iter < maxIter && nf < maxFun) {
      let maxDx = 0, maxDf = 0;
      for (let i = 1; i <= n; i++) { maxDf = Math.max(maxDf, Math.abs(fv[i] - fv[0])); for (let j = 0; j < n; j++) maxDx = Math.max(maxDx, Math.abs(simplex[i][j] - simplex[0][j])); }
      if (maxDx <= tolx && maxDf <= tolf) break;
      iter++;
      const xbar = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) xbar[j] += simplex[i][j] / n;
      const xr = xbar.map((v, j) => 2 * v - simplex[n][j]); const fr = F(xr); nf++;
      if (fr < fv[0]) {
        const xe = xbar.map((v, j) => 3 * v - 2 * simplex[n][j]); const fe = F(xe); nf++;
        if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; }
      } else if (fr < fv[n - 1]) { simplex[n] = xr; fv[n] = fr; }
      else {
        let shrink = false;
        if (fr < fv[n]) {
          const xc = xbar.map((v, j) => 1.5 * v - 0.5 * simplex[n][j]); const fc = F(xc); nf++;
          if (fc <= fr) { simplex[n] = xc; fv[n] = fc; } else shrink = true;
        } else {
          const xcc = xbar.map((v, j) => 0.5 * v + 0.5 * simplex[n][j]); const fcc = F(xcc); nf++;
          if (fcc < fv[n]) { simplex[n] = xcc; fv[n] = fcc; } else shrink = true;
        }
        if (shrink) for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); fv[i] = F(simplex[i]); nf++; }
      }
      order();
    }
    return [new Tensor(x0.rows, x0.cols, Float64Array.from(simplex[0])), T.scalar(fv[0]), T.scalar(iter < maxIter ? 1 : 0)];
  }, D('优化', '[x,fval] = fminsearch(fun,x0)', '无约束多元函数最小值（Nelder-Mead 单纯形法）'));
  def('fminunc', (a, n, it) => ML.builtins.fminsearch([a[0], a[1], optStruct([T.str('TolX'), T.scalar(1e-8), T.str('TolFun'), T.scalar(1e-10), T.str('MaxIter'), T.scalar(5000), T.str('MaxFunEvals'), T.scalar(10000)])], n, it), D('优化', '[x,fval] = fminunc(fun,x0)', '无约束最小化'));
  def('fminbnd', (a, nargout, it) => {
    const f = scalarFn(it, a[0]); let ax = H.num(a[1]), bx = H.num(a[2]);
    const tol = getOpt(a[3], 'TolX', 1e-4);
    const c = 0.5 * (3 - Math.sqrt(5));
    let v = ax + c * (bx - ax), w = v, x = v, e = 0, d = 0;
    let fv = f(x), fw = fv, fx = fv;
    for (let iter = 0; iter < 500; iter++) {
      const xm = 0.5 * (ax + bx);
      const tol1 = Math.sqrt(LA.EPS) * Math.abs(x) + tol / 3, tol2 = 2 * tol1;
      if (Math.abs(x - xm) <= tol2 - 0.5 * (bx - ax)) break;
      let golden = true;
      if (Math.abs(e) > tol1) {
        let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
        q = 2 * (q - r); if (q > 0) p = -p; q = Math.abs(q);
        const etemp = e; e = d;
        if (!(Math.abs(p) >= Math.abs(0.5 * q * etemp) || p <= q * (ax - x) || p >= q * (bx - x))) {
          d = p / q; const u = x + d;
          if (u - ax < tol2 || bx - u < tol2) d = xm - x >= 0 ? tol1 : -tol1;
          golden = false;
        }
      }
      if (golden) { e = (x >= xm) ? ax - x : bx - x; d = c * e; }
      const u = Math.abs(d) >= tol1 ? x + d : x + (d >= 0 ? tol1 : -tol1);
      const fu = f(u);
      if (fu <= fx) { if (u >= x) ax = x; else bx = x; v = w; fv = fw; w = x; fw = fx; x = u; fx = fu; }
      else { if (u < x) ax = u; else bx = u; if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; } else if (fu <= fv || v === x || v === w) { v = u; fv = fu; } }
    }
    return [T.scalar(x), T.scalar(fx), T.scalar(1)];
  }, D('优化', '[x,fval] = fminbnd(fun,a,b)', '区间上一元函数最小值'));
  def('lsqcurvefit', (a, nargout, it) => {
    // lsqcurvefit(fun, x0, xdata, ydata)：最小化 sum((fun(x,xdata)-ydata).^2)
    const f = a[0], x0 = H.tensor(a[1]), xd = a[2], yd = H.tensor(a[3]);
    const obj = new FuncHandle('anon', { params: [], body: null, captured: new Map(), text: 'lsq' });
    const F = (x) => { const r = H.tensor(it.call1(f, [new Tensor(x0.rows, x0.cols, Float64Array.from(x)), xd])); let s = 0; for (let k = 0; k < r.numel; k++) s += (r.re[k] - yd.re[k]) ** 2; return s; };
    void obj;
    // Levenberg–Marquardt
    const resid = (x) => { const r = H.tensor(it.call1(f, [new Tensor(x0.rows, x0.cols, Float64Array.from(x)), xd])); return Array.from(r.re, (v, k) => v - yd.re[k]); };
    let x = Array.from(x0.re); let r = resid(x); let lambda = 1e-3; const n = x.length;
    let cost = r.reduce((s, v) => s + v * v, 0);
    for (let iter = 0; iter < 400; iter++) {
      const m = r.length; const J = [];
      for (let j = 0; j < n; j++) { const h = 1e-7 * Math.max(1, Math.abs(x[j])); const xp = x.slice(); xp[j] += h; const rp = resid(xp); J.push(rp.map((v, i) => (v - r[i]) / h)); }
      const A = LA.zerosRM(n, n), g = new Array(n).fill(0);
      for (let p = 0; p < n; p++) { for (let q = 0; q < n; q++) { let s = 0; for (let i = 0; i < m; i++) s += J[p][i] * J[q][i]; A[p][q] = s; } let s = 0; for (let i = 0; i < m; i++) s += J[p][i] * r[i]; g[p] = -s; }
      let improved = false;
      for (let tries = 0; tries < 20; tries++) {
        const Al = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
        const saveWarn = ML.warn; ML.warn = () => {};
        let dx; try { dx = Array.from(LA.solve(LA.fromRM(Al), T.col(g)).re); } finally { ML.warn = saveWarn; }
        const xn = x.map((v, i) => v + dx[i]); const rn = resid(xn); const cn = rn.reduce((s, v) => s + v * v, 0);
        if (cn < cost) { x = xn; r = rn; const dc = cost - cn; cost = cn; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (dc < 1e-14 * (1 + cost)) iter = 1e9; break; }
        lambda *= 10;
      }
      if (!improved) break;
    }
    void F;
    return [new Tensor(x0.rows, x0.cols, Float64Array.from(x)), T.scalar(cost)];
  }, D('优化', 'x = lsqcurvefit(fun,x0,xdata,ydata)', '非线性最小二乘曲线拟合'));
  def('linprog', (a) => {
    // 单纯形法：min f'x s.t. A x <= b, x >= 0（简单实现）
    const f = H.toArray(a[0]); const A = T.toRows(H.tensor(a[1])); const b = H.toArray(a[2]);
    const m = A.length, n = f.length;
    if (b.some((v) => v < 0)) err('linprog: 本实现要求 b >= 0。');
    const tab = []; for (let i = 0; i < m; i++) { const row = A[i].slice(); for (let j = 0; j < m; j++) row.push(i === j ? 1 : 0); row.push(b[i]); tab.push(row); }
    const obj = f.slice(); for (let j = 0; j < m; j++) obj.push(0); obj.push(0); tab.push(obj);
    const basis = []; for (let i = 0; i < m; i++) basis.push(n + i);
    for (let iter = 0; iter < 1000; iter++) {
      let pc = -1, mv = -1e-12; for (let j = 0; j < n + m; j++) if (tab[m][j] < mv) { mv = tab[m][j]; pc = j; }
      if (pc < 0) break;
      let pr = -1, best = Infinity; for (let i = 0; i < m; i++) if (tab[i][pc] > 1e-12) { const r = tab[i][n + m] / tab[i][pc]; if (r < best) { best = r; pr = i; } }
      if (pr < 0) err('linprog: 问题无界。');
      const pv = tab[pr][pc]; tab[pr] = tab[pr].map((v) => v / pv);
      for (let i = 0; i <= m; i++) if (i !== pr) { const fct = tab[i][pc]; if (fct) tab[i] = tab[i].map((v, j) => v - fct * tab[pr][j]); }
      basis[pr] = pc;
    }
    const x = new Array(n).fill(0); basis.forEach((bi, i) => { if (bi < n) x[bi] = tab[i][n + m]; });
    return [T.col(x), T.scalar(f.reduce((s, c, i) => s + c * x[i], 0))];
  }, D('优化', 'x = linprog(f,A,b)', '线性规划（A*x <= b, x >= 0）'));

  // ---------- 数值积分 ----------
  const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926, 0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961, 0.207784955007898467600689403773245, 0];
  const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518, 0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014, 0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
  const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];
  function gk15(fv, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2;
    const xs = [];
    for (let i = 0; i < 7; i++) { xs.push(c - h * XGK[i]); xs.push(c + h * XGK[i]); }
    xs.push(c);
    const ys = fv(xs);
    let rk = WGK[7] * ys[14], rg = WG[3] * ys[14];
    for (let i = 0; i < 7; i++) {
      const s = ys[2 * i] + ys[2 * i + 1];
      rk += WGK[i] * s;
      if (i % 2 === 1) rg += WG[(i - 1) / 2] * s;
    }
    return { val: rk * h, err: Math.abs((rk - rg) * h) };
  }
  function adaptQuad(fv, a, b, absTol, relTol) {
    if (a === b) return 0;
    let sign = 1;
    if (a > b) { const t = a; a = b; b = t; sign = -1; }
    // 无穷区间变换
    let g = fv, lo = a, hi = b;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      if (a === -Infinity && b === Infinity) { g = (ts) => { const xs = ts.map((t) => t / (1 - t * t)); const ys = fv(xs); return ys.map((y, i) => y * (1 + ts[i] * ts[i]) / Math.pow(1 - ts[i] * ts[i], 2)); }; lo = -1; hi = 1; }
      else if (b === Infinity) { g = (ts) => { const xs = ts.map((t) => a + t / (1 - t)); const ys = fv(xs); return ys.map((y, i) => y / Math.pow(1 - ts[i], 2)); }; lo = 0; hi = 1; }
      else { g = (ts) => { const xs = ts.map((t) => b - (1 - t) / t); const ys = fv(xs); return ys.map((y, i) => y / (ts[i] * ts[i])); }; lo = 0; hi = 1; }
    }
    const safe = (xs) => g(xs).map((y) => (Number.isFinite(y) ? y : 0));
    // 初始划分为 10 段
    let ivs = [];
    const N0 = 10;
    for (let i = 0; i < N0; i++) { const x0 = lo + (hi - lo) * i / N0, x1 = lo + (hi - lo) * (i + 1) / N0; const r = gk15(safe, x0, x1); ivs.push({ a: x0, b: x1, val: r.val, err: r.err }); }
    for (let iter = 0; iter < 2000; iter++) {
      let total = 0, terr = 0, worst = 0;
      for (let i = 0; i < ivs.length; i++) { total += ivs[i].val; terr += ivs[i].err; if (ivs[i].err > ivs[worst].err) worst = i; }
      if (terr <= Math.max(absTol, relTol * Math.abs(total))) return sign * total;
      const w = ivs[worst]; const m = (w.a + w.b) / 2;
      if (m <= w.a || m >= w.b) return sign * total;
      const r1 = gk15(safe, w.a, m), r2 = gk15(safe, m, w.b);
      ivs.splice(worst, 1, { a: w.a, b: m, val: r1.val, err: r1.err }, { a: m, b: w.b, val: r2.val, err: r2.err });
      if (ivs.length > 5000) break;
    }
    let total = 0; for (const iv of ivs) total += iv.val;
    ML.warn('已达到最大区间数限制，积分可能不准确。');
    return sign * total;
  }
  ML.adaptQuad = adaptQuad;
  function integralArgs(a) {
    const nv = H.nameValue(a, 3);
    return { abs: nv.abstol ? H.num(nv.abstol) : 1e-10, rel: nv.reltol ? H.num(nv.reltol) : 1e-6, arrayValued: nv.arrayvalued ? T.isTrue(nv.arrayvalued) : false };
  }
  def('integral quadgk', (a, nargout, it) => {
    H.nargchk(a, 3, undefined, 'integral');
    const lo = H.num(a[1]), hi = H.num(a[2]);
    const o = integralArgs(a);
    if (o.arrayValued) {
      // 对每个分量分别积分
      const f0 = H.tensor(it.call1(a[0], [T.scalar((Number.isFinite(lo) ? lo : 0) + 0.5)]));
      const out = new Tensor(f0.rows, f0.cols);
      for (let k = 0; k < f0.numel; k++) out.re[k] = adaptQuad((xs) => xs.map((x) => H.tensor(it.call1(a[0], [T.scalar(x)])).re[k]), lo, hi, o.abs, o.rel);
      return out;
    }
    return T.scalar(adaptQuad(vecFn(it, a[0]), lo, hi, o.abs, o.rel));
  }, D('微积分', 'q = integral(fun,a,b)', '数值积分（自适应 Gauss-Kronrod，支持无穷区间）'));
  def('quad quadl', (a, nargout, it) => {
    const tol = a.length > 3 && a[3].numel ? H.num(a[3]) : 1e-6;
    return T.scalar(adaptQuad(vecFn(it, a[0]), H.num(a[1]), H.num(a[2]), tol, tol));
  }, D('微积分', 'q = quad(fun,a,b)', '数值积分'));
  def('integral2 dblquad', (a, nargout, it) => {
    const f = a[0];
    const xa = H.num(a[1]), xb = H.num(a[2]);
    const yaF = a[3] instanceof FuncHandle ? (x) => H.num(it.call1(a[3], [T.scalar(x)])) : (() => { const v = H.num(a[3]); return () => v; })();
    const ybF = a[4] instanceof FuncHandle ? (x) => H.num(it.call1(a[4], [T.scalar(x)])) : (() => { const v = H.num(a[4]); return () => v; })();
    let vecOK = true;
    const inner = (x) => {
      const ya = yaF(x), yb = ybF(x);
      return adaptQuad((ys) => {
        if (vecOK) {
          try {
            const r = it.call1(f, [T.fill(1, ys.length, x), T.row(ys)]);
            if (r.numel === ys.length) return Array.from(r.re);
            vecOK = false;
          } catch (e) { vecOK = false; }
        }
        return ys.map((y) => H.num(it.call1(f, [T.scalar(x), T.scalar(y)])));
      }, ya, yb, 1e-10, 1e-8);
    };
    return T.scalar(adaptQuad((xs) => xs.map(inner), xa, xb, 1e-10, 1e-6));
  }, D('微积分', 'q = integral2(fun,xmin,xmax,ymin,ymax)', '二重积分（y 的边界可为函数句柄）'));
  def('integral3 triplequad', (a, nargout, it) => {
    const f = a[0]; const [xa, xb, ya, yb, za, zb] = a.slice(1, 7).map((v) => H.num(v));
    const g = (xs) => xs.map((x) => adaptQuad((ys) => ys.map((y) => adaptQuad((zs) => zs.map((z) => H.num(it.call1(f, [T.scalar(x), T.scalar(y), T.scalar(z)]))), za, zb, 1e-8, 1e-6)), ya, yb, 1e-8, 1e-6));
    return T.scalar(adaptQuad(g, xa, xb, 1e-8, 1e-6));
  }, D('微积分', 'q = integral3(fun,x1,x2,y1,y2,z1,z2)', '三重积分（常数边界）'));

  // ---------- 常微分方程（Dormand-Prince 4(5)）----------
  function odeSolve(a, nargout, it, method) {
    H.nargchk(a, 3, undefined, method);
    const f = a[0]; const tspan = H.toArray(a[1]); const y0T = H.tensor(a[2]); const opts = a[3];
    const n = y0T.numel;
    const rtol = getOpt(opts, 'RelTol', 1e-3), atol = getOpt(opts, 'AbsTol', 1e-6);
    const t0 = tspan[0], tf = tspan[tspan.length - 1];
    const dir = tf >= t0 ? 1 : -1;
    const maxStep = getOpt(opts, 'MaxStep', Math.abs(tf - t0) / 10);
    const F = (t, y) => {
      const r = it.call1(f, [T.scalar(t), T.col(y)]);
      const rt = H.tensor(r);
      if (rt.numel !== n) err(method + ': 函数返回的向量长度 (' + rt.numel + ') 与初始条件长度 (' + n + ') 不一致。');
      return Array.from(rt.re);
    };
    const c2 = 1 / 5, c3 = 3 / 10, c4 = 4 / 5, c5 = 8 / 9;
    const a21 = 1 / 5, a31 = 3 / 40, a32 = 9 / 40, a41 = 44 / 45, a42 = -56 / 15, a43 = 32 / 9;
    const a51 = 19372 / 6561, a52 = -25360 / 2187, a53 = 64448 / 6561, a54 = -212 / 729;
    const a61 = 9017 / 3168, a62 = -355 / 33, a63 = 46732 / 5247, a64 = 49 / 176, a65 = -5103 / 18656;
    const b1 = 35 / 384, b3 = 500 / 1113, b4 = 125 / 192, b5 = -2187 / 6784, b6 = 11 / 84;
    const e1 = 71 / 57600, e3 = -71 / 16695, e4 = 71 / 1920, e5 = -17253 / 339200, e6 = 22 / 525, e7 = -1 / 40;
    let t = t0, y = Array.from(y0T.re);
    let k1 = F(t, y);
    const T_out = [t], Y_out = [y.slice()];
    const wantPoints = tspan.length > 2 ? tspan.slice(1) : null;
    let wp = 0;
    // 初始步长
    let h = getOpt(opts, 'InitialStep', 0);
    if (!h) {
      let d0 = 0, d1 = 0;
      for (let i = 0; i < n; i++) { const sc = atol + rtol * Math.abs(y[i]); d0 = Math.max(d0, Math.abs(y[i]) / sc); d1 = Math.max(d1, Math.abs(k1[i]) / sc); }
      h = (d0 < 1e-5 || d1 < 1e-5) ? 1e-6 : 0.01 * d0 / d1;
      h = Math.min(h, maxStep, Math.abs(tf - t0));
    }
    const refine = 4;
    let steps = 0, fails = 0;
    const hermite = (tA, yA, fA, tB, yB, fB, tq) => {
      const hh = tB - tA, s = (tq - tA) / hh;
      const h00 = 2 * s * s * s - 3 * s * s + 1, h10 = s * s * s - 2 * s * s + s, h01 = -2 * s * s * s + 3 * s * s, h11 = s * s * s - s * s;
      return yA.map((v, i) => h00 * v + h10 * hh * fA[i] + h01 * yB[i] + h11 * hh * fB[i]);
    };
    while (dir * (tf - t) > 1e-12 * Math.max(1, Math.abs(tf))) {
      it.tick();
      if (++steps > 200000) err(method + ': 步数过多，可能是刚性问题或解发散。');
      if (Math.abs(h) < 16 * LA.EPS * Math.max(1, Math.abs(t))) {
        ML.warn(method + ': 在 t=' + t + ' 处无法满足积分容差（步长过小）。');
        break;
      }
      h = Math.min(Math.abs(h), maxStep, Math.abs(tf - t)) * dir;
      const yt = (coefs) => y.map((v, i) => v + h * coefs.reduce((s, c) => s + c[0] * c[1][i], 0));
      const k2 = F(t + c2 * h, yt([[a21, k1]]));
      const k3 = F(t + c3 * h, yt([[a31, k1], [a32, k2]]));
      const k4 = F(t + c4 * h, yt([[a41, k1], [a42, k2], [a43, k3]]));
      const k5 = F(t + c5 * h, yt([[a51, k1], [a52, k2], [a53, k3], [a54, k4]]));
      const k6 = F(t + h, yt([[a61, k1], [a62, k2], [a63, k3], [a64, k4], [a65, k5]]));
      const ynew = yt([[b1, k1], [b3, k3], [b4, k4], [b5, k5], [b6, k6]]);
      const k7 = F(t + h, ynew);
      let errn = 0;
      for (let i = 0; i < n; i++) {
        const e = h * (e1 * k1[i] + e3 * k3[i] + e4 * k4[i] + e5 * k5[i] + e6 * k6[i] + e7 * k7[i]);
        const sc = Math.max(atol, rtol * Math.max(Math.abs(y[i]), Math.abs(ynew[i])));
        errn = Math.max(errn, Math.abs(e) / sc);
      }
      if (errn <= 1 || !Number.isFinite(errn) && false) {
        const tnew = t + h;
        if (wantPoints) {
          while (wp < wantPoints.length && dir * (wantPoints[wp] - tnew) <= 1e-12 * Math.max(1, Math.abs(tnew))) {
            const tq = wantPoints[wp];
            T_out.push(tq); Y_out.push(Math.abs(tq - tnew) < 1e-14 ? ynew.slice() : hermite(t, y, k1, tnew, ynew, k7, tq));
            wp++;
          }
        } else {
          for (let r = 1; r < refine; r++) { const tq = t + h * r / refine; T_out.push(tq); Y_out.push(hermite(t, y, k1, tnew, ynew, k7, tq)); }
          T_out.push(tnew); Y_out.push(ynew.slice());
        }
        t = tnew; y = ynew; k1 = k7;
        const fac = errn === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(errn, -0.2)));
        h *= fac;
        fails = 0;
      } else {
        fails++;
        h *= Math.max(0.1, 0.9 * Math.pow(errn, -0.25));
        if (!Number.isFinite(errn)) h /= 10;
      }
    }
    const nt = T_out.length;
    const tcol = T.col(T_out);
    const Ym = new Tensor(nt, n);
    for (let i = 0; i < nt; i++) for (let j = 0; j < n; j++) Ym.re[i + j * nt] = Y_out[i][j];
    if (nargout <= 1) {
      const s = new Struct(1, 1);
      s.setField('solver', T.str(method), 0);
      s.setField('x', T.row(T_out), 0);
      s.setField('y', ops.transpose(Ym), 0);
      return s;
    }
    return [tcol, Ym];
  }
  def('ode45', (a, n, it) => odeSolve(a, n, it, 'ode45'), D('微分方程', '[t,y] = ode45(odefun,tspan,y0)', '求解非刚性常微分方程（Dormand-Prince 4(5)）'));
  def('ode23', (a, n, it) => odeSolve(a, n, it, 'ode23'), D('微分方程', '[t,y] = ode23(odefun,tspan,y0)', '求解常微分方程（低阶）'));
  def('ode113 ode15s ode23s ode23t', (a, n, it) => odeSolve(a, n, it, 'ode45'), D('微分方程', '[t,y] = ode15s(odefun,tspan,y0)', '求解常微分方程（本环境中使用自适应 Runge-Kutta 方法）'));
  def('deval', (a) => {
    const sol = a[0]; const xi = H.toArray(a[1]);
    const x = H.toArray(sol.getField('x', 0)); const Y = H.tensor(sol.getField('y', 0));
    const n = Y.rows; const out = new Tensor(n, xi.length);
    for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < Y.cols; j++) row.push(Y.re[i + j * n]); const v = interp1Core(x, row, xi, 'linear', true); v.forEach((val, j) => { out.re[i + j * n] = val; }); }
    return out;
  }, D('微分方程', 'y = deval(sol,t)', '计算 ODE 解在指定点的值'));

  // ---------- FFT ----------
  function fftCore(re, im, inverse) {
    const n = re.length;
    if (n <= 1) return [re.slice(), im.slice()];
    if ((n & (n - 1)) === 0) {
      const xr = re.slice(), xi = im.slice();
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { let t = xr[i]; xr[i] = xr[j]; xr[j] = t; t = xi[i]; xi[i] = xi[j]; xi[j] = t; }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = 2 * Math.PI / len * (inverse ? 1 : -1);
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const ur = xr[i + k], ui = xi[i + k];
            const vr = xr[i + k + len / 2] * cr - xi[i + k + len / 2] * ci;
            const vi = xr[i + k + len / 2] * ci + xi[i + k + len / 2] * cr;
            xr[i + k] = ur + vr; xi[i + k] = ui + vi;
            xr[i + k + len / 2] = ur - vr; xi[i + k + len / 2] = ui - vi;
            const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
          }
        }
      }
      return [xr, xi];
    }
    // Bluestein 算法
    let m = 1; while (m < 2 * n - 1) m <<= 1;
    const s = inverse ? 1 : -1;
    const wr = new Array(n), wi = new Array(n);
    for (let k = 0; k < n; k++) { const ang = s * Math.PI * ((k * k) % (2 * n)) / n; wr[k] = Math.cos(ang); wi[k] = Math.sin(ang); }
    const ar = new Array(m).fill(0), ai = new Array(m).fill(0), br = new Array(m).fill(0), bi = new Array(m).fill(0);
    for (let k = 0; k < n; k++) { ar[k] = re[k] * wr[k] - im[k] * wi[k]; ai[k] = re[k] * wi[k] + im[k] * wr[k]; }
    br[0] = wr[0]; bi[0] = -wi[0];
    for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
    const [Ar, Ai] = fftCore(ar, ai, false), [Br, Bi] = fftCore(br, bi, false);
    const Cr = new Array(m), Ci = new Array(m);
    for (let k = 0; k < m; k++) { Cr[k] = Ar[k] * Br[k] - Ai[k] * Bi[k]; Ci[k] = Ar[k] * Bi[k] + Ai[k] * Br[k]; }
    const [cr, ci] = fftCore(Cr, Ci, true);
    const outR = new Array(n), outI = new Array(n);
    for (let k = 0; k < n; k++) { const xr = cr[k] / m, xi = ci[k] / m; outR[k] = xr * wr[k] - xi * wi[k]; outI[k] = xr * wi[k] + xi * wr[k]; }
    return [outR, outI];
  }
  function fftApply(a, inverse) {
    const X = H.tensor(a[0]);
    let N = a.length > 1 && a[1].numel ? H.int(a[1]) : null;
    let dim = a.length > 2 ? H.int(a[2]) : (X.rows === 1 ? 2 : 1);
    const symmetric = a.some((v) => T.isStr(v) && v.toStr() === 'symmetric');
    const R = X.rows, Cc = X.cols;
    const len = dim === 1 ? R : Cc;
    if (N === null) N = len;
    const outR = dim === 1 ? N : R, outC = dim === 1 ? Cc : N;
    const t = new Tensor(outR, outC); t.im = new Float64Array(outR * outC);
    const nvec = dim === 1 ? Cc : R;
    for (let v = 0; v < nvec; v++) {
      const re = new Array(N).fill(0), im = new Array(N).fill(0);
      for (let k = 0; k < Math.min(N, len); k++) { const idx = dim === 1 ? k + v * R : v + k * R; re[k] = X.re[idx]; im[k] = X.im ? X.im[idx] : 0; }
      const [yr, yi] = fftCore(re, im, inverse);
      for (let k = 0; k < N; k++) { const idx = dim === 1 ? k + v * outR : v + k * outR; t.re[idx] = inverse ? yr[k] / N : yr[k]; t.im[idx] = inverse ? yi[k] / N : yi[k]; }
    }
    if (inverse) {
      let mr = 0, mi = 0; for (let k = 0; k < t.re.length; k++) { mr = Math.max(mr, Math.abs(t.re[k])); mi = Math.max(mi, Math.abs(t.im[k])); }
      if (symmetric || mi <= 1e-12 * Math.max(mr, 1e-300)) t.im = null;
    }
    return t.trim();
  }
  def('fft', (a) => fftApply(a, false), D('信号处理', 'Y = fft(X), fft(X,n)', '快速傅里叶变换'));
  def('ifft', (a) => fftApply(a, true), D('信号处理', 'X = ifft(Y), ifft(Y,n)', '快速傅里叶逆变换'));
  def('fft2', (a) => { const A = fftApply([a[0], new Tensor(0, 0), T.scalar(1)], false); return fftApply([A, new Tensor(0, 0), T.scalar(2)], false); }, D('信号处理', 'fft2(X)', '二维快速傅里叶变换'));
  def('ifft2', (a) => { const A = fftApply([a[0], new Tensor(0, 0), T.scalar(1)], true); return fftApply([A, new Tensor(0, 0), T.scalar(2)], true); }, D('信号处理', 'ifft2(X)', '二维快速傅里叶逆变换'));
  function shiftFn(a, inv) {
    const X = a[0];
    const sh = (n) => (inv ? -Math.floor(n / 2) : Math.floor(n / 2));
    if (X.rows === 1 || X.cols === 1) return ML.builtins.circshift([X, T.scalar(sh(X.numel))]);
    return ML.builtins.circshift([X, T.row([sh(X.rows), sh(X.cols)])]);
  }
  def('fftshift', (a) => shiftFn(a, false), D('信号处理', 'fftshift(X)', '将零频分量移到频谱中心'));
  def('ifftshift', (a) => shiftFn(a, true), D('信号处理', 'ifftshift(X)', 'fftshift 的逆操作'));
  def('filter', (a) => {
    const b = H.toArray(a[0]), av = H.toArray(a[1]); const X = H.tensor(a[2]);
    if (av[0] === 0) err('filter: a(1) 不能为 0。');
    const a0 = av[0]; const bn = b.map((v) => v / a0), an = av.map((v) => v / a0);
    const n = Math.max(bn.length, an.length);
    while (bn.length < n) bn.push(0); while (an.length < n) an.push(0);
    const run = (x) => {
      const z = new Array(n).fill(0); const y = new Array(x.length);
      for (let k = 0; k < x.length; k++) {
        y[k] = bn[0] * x[k] + z[0];
        for (let i = 1; i < n; i++) z[i - 1] = bn[i] * x[k] + (i < n ? z[i] : 0) - an[i] * y[k];
        z[n - 1] = 0;
        if (n > 1) z[n - 2] = bn[n - 1] * x[k] - an[n - 1] * y[k];
      }
      return y;
    };
    if (X.rows === 1 || X.cols === 1) return H.likeVec(run(Array.from(X.re)), X);
    return H.transform(X, 1, run);
  }, D('信号处理', 'y = filter(b,a,x)', '一维数字滤波器'));
  def('conv2', (a) => {
    const A = H.tensor(a[0]), B = H.tensor(a[1]); const shape = a.length > 2 ? H.str(a[2]) : 'full';
    const R = A.rows + B.rows - 1, Cc = A.cols + B.cols - 1;
    const F = new Tensor(R, Cc);
    for (let i = 0; i < A.rows; i++) for (let j = 0; j < A.cols; j++) { const v = A.re[i + j * A.rows]; if (!v) continue; for (let p = 0; p < B.rows; p++) for (let q = 0; q < B.cols; q++) F.re[(i + p) + (j + q) * R] += v * B.re[p + q * B.rows]; }
    if (shape === 'full') return F;
    let r0, c0, nr, nc;
    if (shape === 'same') { r0 = Math.floor(B.rows / 2) - (B.rows % 2 === 0 ? 0 : 0); c0 = Math.floor(B.cols / 2); r0 = Math.ceil((B.rows - 1) / 2); c0 = Math.ceil((B.cols - 1) / 2); nr = A.rows; nc = A.cols; }
    else { r0 = B.rows - 1; c0 = B.cols - 1; nr = Math.max(0, A.rows - B.rows + 1); nc = Math.max(0, A.cols - B.cols + 1); }
    const out = new Tensor(nr, nc);
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) out.re[i + j * nr] = F.re[(i + r0) + (j + c0) * R];
    return out;
  }, D('信号处理', 'C = conv2(A,B,shape)', '二维卷积'));
})(typeof self !== 'undefined' ? self : globalThis);
