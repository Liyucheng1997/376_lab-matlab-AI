/* MatWeb - 线性代数函数 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const ops = ML.ops, LA = ML.linalg;
  const D = (syn, desc) => ({ cat: '线性代数', syn, desc });

  def('det', (a) => { const A = H.tensor(a[0]); const [re, im] = LA.det(A); return im ? T.complex(re, im) : T.scalar(re); }, D('det(A)', '行列式'));
  def('inv', (a) => { const A = H.tensor(a[0]); return LA.inv(A); }, D('inv(A)', '逆矩阵'));
  def('pinv', (a) => LA.pinv(H.tensor(a[0]), a.length > 1 ? H.num(a[1]) : undefined), D('pinv(A)', 'Moore-Penrose 伪逆'));
  def('rank', (a) => T.scalar(LA.rank(H.tensor(a[0]), a.length > 1 ? H.num(a[1]) : undefined)), D('rank(A)', '矩阵的秩'));
  def('trace', (a) => {
    const A = H.tensor(a[0]); if (A.rows !== A.cols) err('trace: 输入必须为方阵。');
    let s = 0, si = 0; for (let i = 0; i < A.rows; i++) { s += A.re[i + i * A.rows]; if (A.im) si += A.im[i + i * A.rows]; }
    return si ? T.complex(s, si) : T.scalar(s);
  }, D('trace(A)', '迹（对角线元素之和）'));
  def('eig', (a, nargout) => {
    const A = H.tensor(a[0]);
    if (a.length > 1 && a[1] instanceof Tensor && !T.isStr(a[1])) {
      // 广义特征值 A v = λ B v → B\A
      const M = ops.mldivide(a[1], A);
      return ML.builtins.eig([M], nargout);
    }
    const r = LA.eig(A, nargout >= 2);
    const n = A.rows;
    const vals = r.values;
    if (nargout < 2) {
      const t = new Tensor(n, 1); t.im = new Float64Array(n);
      vals.forEach((v, i) => { t.re[i] = v[0]; t.im[i] = v[1]; });
      return t.trim();
    }
    const Dm = new Tensor(n, n); Dm.im = new Float64Array(n * n);
    vals.forEach((v, i) => { Dm.re[i + i * n] = v[0]; Dm.im[i + i * n] = v[1]; });
    return [r.V, Dm.trim()];
  }, D('e = eig(A), [V,D] = eig(A)', '特征值与特征向量'));
  def('svd', (a, nargout) => {
    const A = H.tensor(a[0]);
    const econ = a.length > 1;
    if (nargout < 2) return T.col(LA.singularValues(A));
    const r = LA.svd(A);
    const m = A.rows, n = A.cols, k = Math.min(m, n);
    let U = LA.fromRM(r.U, m, m), V = LA.fromRM(r.V, n, n);
    let S;
    if (econ) {
      U = ML.idx.indexParen(U, [ML.COLON, ML.makeRange(T.scalar(1), null, T.scalar(k))]);
      V = ML.idx.indexParen(V, [ML.COLON, ML.makeRange(T.scalar(1), null, T.scalar(k))]);
      S = new Tensor(k, k);
      for (let i = 0; i < k; i++) S.re[i + i * k] = r.S[i];
    } else {
      S = new Tensor(m, n);
      for (let i = 0; i < k; i++) S.re[i + i * m] = r.S[i];
    }
    return [U, S, V];
  }, D('s = svd(A), [U,S,V] = svd(A)', '奇异值分解'));
  def('lu', (a, nargout) => {
    const A = H.tensor(a[0]);
    const r = LA.lu(A);
    if (nargout >= 3) return [r.L, r.U, r.P];
    const L = ops.mtimes(ops.transpose(r.P), r.L);
    if (nargout === 2) return [L, r.U];
    return ops.minus(ops.plus(r.L, r.U), ops.eye(Math.min(A.rows, A.cols)));
  }, D('[L,U,P] = lu(A)', 'LU 分解（P*A = L*U）'));
  def('qr', (a, nargout) => {
    const A = H.tensor(a[0]);
    const r = LA.qr(A, a.length > 1);
    if (nargout < 2) return r.R;
    return [r.Q, r.R];
  }, D('[Q,R] = qr(A), qr(A,0)', 'QR 分解'));
  def('chol', (a, nargout) => {
    const A = H.tensor(a[0]);
    const r = LA.chol(A);
    if (nargout >= 2) return [r.R || new Tensor(0, 0), T.scalar(r.p)];
    if (!r.R) err('chol: 矩阵必须为正定矩阵。');
    let R = r.R;
    if (a.length > 1 && H.str(a[1]) === 'lower') R = ops.transpose(R);
    return R;
  }, D('R = chol(A)', 'Cholesky 分解（A = R\'*R）'));
  def('null', (a) => {
    const A = H.tensor(a[0]);
    if (a.length > 1 && H.str(a[1]) === 'r') {
      const { R, pivots } = rref(A);
      const n = A.cols; const free = []; for (let j = 0; j < n; j++) if (pivots.indexOf(j) < 0) free.push(j);
      const Z = new Tensor(n, free.length);
      free.forEach((f, c) => { Z.re[f + c * n] = 1; pivots.forEach((p, i) => { Z.re[p + c * n] = -R.re[i + f * R.rows]; }); });
      return Z;
    }
    const m = A.rows, n = A.cols;
    if (m === 0 || n === 0) return ops.eye(n);
    const r = LA.svd(A);
    const tol = Math.max(m, n) * (r.S[0] || 0) * LA.EPS;
    let rank = 0; for (const s of r.S) if (s > tol) rank++;
    const Z = new Tensor(n, n - rank);
    for (let c = rank; c < n; c++) for (let i = 0; i < n; i++) Z.re[i + (c - rank) * n] = r.V[i][c];
    return Z;
  }, D('Z = null(A)', '零空间的标准正交基'));
  def('orth', (a) => {
    const A = H.tensor(a[0]); const m = A.rows, n = A.cols;
    const r = LA.svd(A);
    const tol = Math.max(m, n) * (r.S[0] || 0) * LA.EPS;
    let rank = 0; for (const s of r.S) if (s > tol) rank++;
    const Q = new Tensor(m, rank);
    for (let c = 0; c < rank; c++) for (let i = 0; i < m; i++) Q.re[i + c * m] = r.U[i][c];
    return Q;
  }, D('Q = orth(A)', '列空间的标准正交基'));
  def('norm', (a) => {
    const A = H.tensor(a[0]);
    let p;
    if (a.length > 1) { if (T.isStr(a[1])) { const s = a[1].toStr().toLowerCase(); p = s === 'fro' ? 'fro' : (s === 'inf' ? Infinity : err('norm: 无效的范数类型。')); } else p = H.num(a[1]); }
    return T.scalar(LA.norm(A, p));
  }, D('norm(v), norm(A,p)', '向量或矩阵范数（2, 1, Inf, \'fro\'）'));
  def('cond', (a) => {
    const A = H.tensor(a[0]);
    if (a.length > 1 && !(H.num(a[1]) === 2)) { const p = H.num(a[1]); return T.scalar(LA.norm(A, p) * LA.norm(LA.inv(A), p)); }
    const s = LA.singularValues(A);
    return T.scalar(s[s.length - 1] === 0 ? Infinity : s[0] / s[s.length - 1]);
  }, D('cond(A)', '条件数'));
  def('rcond', (a) => {
    const A = H.tensor(a[0]);
    const saveWarn = ML.warn; ML.warn = () => {};
    try { const Ai = LA.inv(A); const r = 1 / (LA.norm(A, 1) * LA.norm(Ai, 1)); return T.scalar(Number.isFinite(r) ? r : 0); } finally { ML.warn = saveWarn; }
  }, D('rcond(A)', '倒数条件数估计（1-范数）'));
  def('expm', (a) => LA.expm(H.tensor(a[0])), D('expm(A)', '矩阵指数'));
  def('sqrtm', (a) => LA.funm(H.tensor(a[0]), (re, im, o) => ML.C.sqrt(re, im, o)), D('sqrtm(A)', '矩阵平方根'));
  def('logm', (a) => LA.funm(H.tensor(a[0]), (re, im, o) => ML.C.log(re, im, o)), D('logm(A)', '矩阵对数'));
  def('funm', (a, n, it) => {
    const A = H.tensor(a[0]); const f = a[1];
    return LA.funm(A, (re, im, o) => { const r = it.call1(f, [im ? T.complex(re, im) : T.scalar(re)]); o[0] = r.re[0]; o[1] = r.im ? r.im[0] : 0; });
  }, D('funm(A,@f)', '一般矩阵函数'));
  def('kron', (a) => {
    const A = H.tensor(a[0]), B = H.tensor(a[1]);
    const R = A.rows * B.rows, C = A.cols * B.cols;
    const t = new Tensor(R, C);
    for (let i = 0; i < A.rows; i++) for (let j = 0; j < A.cols; j++) {
      const v = A.re[i + j * A.rows];
      for (let p = 0; p < B.rows; p++) for (let q = 0; q < B.cols; q++) t.re[(i * B.rows + p) + (j * B.cols + q) * R] = v * B.re[p + q * B.rows];
    }
    return t;
  }, D('kron(A,B)', 'Kronecker 张量积'));
  def('linsolve', (a) => ops.mldivide(a[0], a[1]), D('x = linsolve(A,b)', '求解线性方程组 Ax = b'));
  def('lsqnonneg', (a) => {
    // 简单的非负最小二乘（投影梯度）
    const A = H.tensor(a[0]), b = H.tensor(a[1]);
    let x = ops.mldivide(A, b);
    x = H.map(x, (v) => Math.max(v, 0));
    const AtA = ops.mtimes(ops.transpose(A), A), Atb = ops.mtimes(ops.transpose(A), b);
    const L = LA.norm(AtA) || 1;
    for (let it = 0; it < 5000; it++) {
      const g = ops.minus(ops.mtimes(AtA, x), Atb);
      const xn = H.map(ops.minus(x, ops.rdivide(g, T.scalar(L))), (v) => Math.max(v, 0));
      let d = 0; for (let k = 0; k < xn.numel; k++) d = Math.max(d, Math.abs(xn.re[k] - x.re[k]));
      x = xn; if (d < 1e-13) break;
    }
    return x;
  }, D('x = lsqnonneg(C,d)', '非负最小二乘'));

  function rref(A) {
    const m = A.rows, n = A.cols;
    const R = A.clone(); R.type = 'double';
    const g = (i, j) => R.re[i + j * m], s = (i, j, v) => { R.re[i + j * m] = v; };
    let mx = 0; for (const v of R.re) mx = Math.max(mx, Math.abs(v));
    const tol = LA.EPS * Math.max(m, n) * mx;
    const pivots = [];
    let r = 0;
    for (let c = 0; c < n && r < m; c++) {
      let p = r, pv = Math.abs(g(r, c));
      for (let i = r + 1; i < m; i++) if (Math.abs(g(i, c)) > pv) { pv = Math.abs(g(i, c)); p = i; }
      if (pv <= tol) { for (let i = r; i < m; i++) s(i, c, 0); continue; }
      pivots.push(c);
      for (let j = c; j < n; j++) { const t = g(p, j); s(p, j, g(r, j)); s(r, j, t); }
      const d = g(r, c);
      for (let j = c; j < n; j++) s(r, j, g(r, j) / d);
      for (let i = 0; i < m; i++) if (i !== r) { const f = g(i, c); if (f) for (let j = c; j < n; j++) s(i, j, g(i, j) - f * g(r, j)); }
      r++;
    }
    return { R, pivots };
  }
  def('rref', (a, nargout) => {
    const { R, pivots } = rref(H.tensor(a[0]));
    if (nargout >= 2) return [R, T.row(pivots.map((p) => p + 1))];
    return R;
  }, D('R = rref(A)', '简化行阶梯形'));
  def('issymmetric', (a) => T.bool(LA.isSymmetric(H.tensor(a[0]), 0)), D('issymmetric(A)', '是否为对称矩阵'));
  def('ishermitian', (a) => T.bool(LA.isSymmetric(H.tensor(a[0]), 0)), D('ishermitian(A)', '是否为 Hermitian 矩阵'));
  def('isdiag', (a) => { const A = H.tensor(a[0]); for (let i = 0; i < A.rows; i++) for (let j = 0; j < A.cols; j++) if (i !== j && A.re[i + j * A.rows] !== 0) return T.bool(false); return T.bool(true); }, D('isdiag(A)', '是否为对角矩阵'));
  def('istriu', (a) => { const A = H.tensor(a[0]); for (let i = 0; i < A.rows; i++) for (let j = 0; j < Math.min(i, A.cols); j++) if (A.re[i + j * A.rows] !== 0) return T.bool(false); return T.bool(true); }, D('istriu(A)', '是否为上三角矩阵'));
  def('istril', (a) => { const A = H.tensor(a[0]); for (let i = 0; i < A.rows; i++) for (let j = i + 1; j < A.cols; j++) if (A.re[i + j * A.rows] !== 0) return T.bool(false); return T.bool(true); }, D('istril(A)', '是否为下三角矩阵'));
  def('hess', (a) => {
    // Householder 约化为上 Hessenberg
    const A = H.tensor(a[0]); const n = A.rows; const M = T.toRows(A);
    for (let k = 0; k < n - 2; k++) {
      let alpha = 0; for (let i = k + 1; i < n; i++) alpha += M[i][k] * M[i][k]; alpha = Math.sqrt(alpha);
      if (alpha === 0) continue; if (M[k + 1][k] > 0) alpha = -alpha;
      const v = new Array(n).fill(0); v[k + 1] = M[k + 1][k] - alpha; for (let i = k + 2; i < n; i++) v[i] = M[i][k];
      let vn = 0; for (const x of v) vn += x * x; if (vn === 0) continue;
      for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += v[i] * M[i][j]; s = 2 * s / vn; for (let i = 0; i < n; i++) M[i][j] -= s * v[i]; }
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i][j] * v[j]; s = 2 * s / vn; for (let j = 0; j < n; j++) M[i][j] -= s * v[j]; }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < i - 1; j++) M[i][j] = 0;
    return T.fromRows(M);
  }, D('H = hess(A)', 'Hessenberg 形式'));
  def('poly', (a) => {
    const A = H.tensor(a[0]);
    let r;
    if (A.rows === A.cols && A.rows > 1) { const e = LA.eig(A, false).values; r = e; }
    else { r = []; for (let k = 0; k < A.numel; k++) r.push([A.re[k], A.im ? A.im[k] : 0]); }
    let cr = [1], ci = [0];
    for (const [zr, zi] of r) {
      const nr = cr.concat([0]), ni = ci.concat([0]);
      for (let k = 1; k < nr.length; k++) { nr[k] -= zr * cr[k - 1] - zi * ci[k - 1]; ni[k] -= zr * ci[k - 1] + zi * cr[k - 1]; }
      cr = nr; ci = ni;
    }
    const t = T.row(cr);
    if (ci.some((x) => Math.abs(x) > 1e-12 * Math.max(1, ...cr.map(Math.abs)))) { t.im = Float64Array.from(ci); }
    return t;
  }, { cat: '多项式', syn: 'p = poly(r), p = poly(A)', desc: '由根（或矩阵特征值）构造多项式系数' });
})(typeof self !== 'undefined' ? self : globalThis);
