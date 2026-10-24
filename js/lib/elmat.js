/* MatWeb - 基本矩阵：常量、构造、尺寸、变形、类型转换、集合运算 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle, isIntType, castValue, INT_RANGE } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const IX = ML.idx;

  // ---------- 随机数发生器（xoshiro128**）----------
  ML.random = {
    create(seed) {
      const g = { s: new Uint32Array(4), spare: null };
      g.seed = function (sd) {
        let x = (sd >>> 0) ^ 0x9e3779b9;
        const sm = () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0; };
        for (let i = 0; i < 4; i++) g.s[i] = sm();
        g.spare = null; g.seedValue = sd;
      };
      const rotl = (x, k) => (x << k) | (x >>> (32 - k));
      g.u32 = function () {
        const s = g.s;
        const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
        const t = s[1] << 9;
        s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
        return result;
      };
      g.next = function () {
        // (0,1) 区间 53 位精度
        let v;
        do { v = ((g.u32() >>> 5) * 67108864 + (g.u32() >>> 6)) / 9007199254740992; } while (v === 0);
        return v;
      };
      g.normal = function () {
        if (g.spare !== null) { const s = g.spare; g.spare = null; return s; }
        let u, v, s;
        do { u = 2 * g.next() - 1; v = 2 * g.next() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
        const m = Math.sqrt(-2 * Math.log(s) / s);
        g.spare = v * m;
        return u * m;
      };
      g.seed(seed || 0);
      return g;
    }
  };
  const rng = (it) => it.rng || (it.rng = ML.random.create(0));

  // ---------- 常量 ----------
  function constFill(v, args, fname) {
    if (args.length === 0) return T.scalar(v);
    const { r, c, type } = H.sizeArgs(args, fname);
    const t = new Tensor(r, c, null, null, type === 'single' ? 'single' : 'double');
    t.re.fill(v);
    return t;
  }
  def('pi', (a) => constFill(Math.PI, a, 'pi'), { cat: '常量', syn: 'pi', desc: '圆周率 π = 3.14159…' });
  def('e', (a) => constFill(Math.E, a, 'e'), { cat: '常量', syn: 'e', desc: '自然常数 e = 2.71828…（MATLAB 中通常写作 exp(1)）' });
  def('Inf inf', (a) => constFill(Infinity, a, 'Inf'), { cat: '常量', syn: 'Inf, Inf(m,n)', desc: '正无穷大' });
  def('NaN nan', (a) => constFill(NaN, a, 'NaN'), { cat: '常量', syn: 'NaN, NaN(m,n)', desc: '非数 (Not-a-Number)' });
  def('NA', (a) => constFill(NaN, a, 'NA'));
  def('eps', (a) => {
    if (a.length === 1 && H.isNum(a[0])) {
      return H.map(a[0], (x) => { x = Math.abs(x); if (!Number.isFinite(x)) return NaN; if (x < 2.2250738585072014e-308) return 4.9406564584124654e-324; const e = Math.floor(Math.log2(x)); let p = Math.pow(2, e - 52); if (Math.pow(2, e) > x) p /= 2; return p; });
    }
    return constFill(Math.pow(2, -52), a, 'eps');
  }, { cat: '常量', syn: 'eps, eps(x)', desc: '浮点相对精度 2^-52' });
  const imagUnit = (a) => { if (a.length) err('i 不接受参数。'); return new Tensor(1, 1, new Float64Array([0]), new Float64Array([1])); };
  def('i j 1i 1j I J', imagUnit, { cat: '常量', syn: 'i, j', desc: '虚数单位 √-1' });
  def('realmax', () => T.scalar(Number.MAX_VALUE), { cat: '常量', syn: 'realmax', desc: '最大的正浮点数' });
  def('realmin', () => T.scalar(2.2250738585072014e-308), { cat: '常量', syn: 'realmin', desc: '最小的正规化浮点数' });
  def('flintmax', () => T.scalar(9007199254740992), { cat: '常量', syn: 'flintmax', desc: '最大连续整数浮点值 2^53' });
  def('intmax', (a) => { const t = a.length ? H.str(a[0]) : 'int32'; if (!INT_RANGE[t]) err('无效的整数类型。'); return T.scalar(INT_RANGE[t][1], t); }, { cat: '常量', syn: "intmax('int32')", desc: '整数类型最大值' });
  def('intmin', (a) => { const t = a.length ? H.str(a[0]) : 'int32'; if (!INT_RANGE[t]) err('无效的整数类型。'); return T.scalar(INT_RANGE[t][0], t); }, { cat: '常量', syn: "intmin('int32')", desc: '整数类型最小值' });
  def('true', (a) => { const t = constFill(1, a, 'true'); t.type = 'logical'; return t; }, { cat: '常量', syn: 'true, true(m,n)', desc: '逻辑真' });
  def('false', (a) => { const t = constFill(0, a, 'false'); t.type = 'logical'; return t; }, { cat: '常量', syn: 'false, false(m,n)', desc: '逻辑假' });

  // ---------- 构造 ----------
  def('zeros', (a) => { const { r, c, type } = H.sizeArgs(a, 'zeros'); return new Tensor(r, c, null, null, type); },
    { cat: '矩阵构造', syn: 'zeros(n), zeros(m,n), zeros([m n])', desc: '创建全零矩阵' });
  def('ones', (a) => { const { r, c, type } = H.sizeArgs(a, 'ones'); const t = new Tensor(r, c, null, null, type); t.re.fill(1); return t; },
    { cat: '矩阵构造', syn: 'ones(n), ones(m,n)', desc: '创建全一矩阵' });
  def('eye', (a) => { const { r, c, type } = H.sizeArgs(a, 'eye'); const t = new Tensor(r, c, null, null, type); for (let i = 0; i < Math.min(r, c); i++) t.re[i + i * r] = 1; return t; },
    { cat: '矩阵构造', syn: 'eye(n), eye(m,n)', desc: '单位矩阵' });
  def('rand', (a, n, it) => {
    if (a.length && T.isStr(a[0])) { const opt = a[0].toStr(); if ((opt === 'seed' || opt === 'state' || opt === 'twister') && a.length > 1) rng(it).seed(H.num(a[1])); return null; }
    const { r, c } = H.sizeArgs(a, 'rand'); const g = rng(it);
    const t = new Tensor(r, c); for (let k = 0; k < t.re.length; k++) t.re[k] = g.next(); return t;
  }, { cat: '矩阵构造', syn: 'rand(n), rand(m,n)', desc: '(0,1) 均匀分布随机数' });
  def('randn', (a, n, it) => {
    const { r, c } = H.sizeArgs(a, 'randn'); const g = rng(it);
    const t = new Tensor(r, c); for (let k = 0; k < t.re.length; k++) t.re[k] = g.normal(); return t;
  }, { cat: '矩阵构造', syn: 'randn(n), randn(m,n)', desc: '标准正态分布随机数' });
  def('randi', (a, n, it) => {
    H.nargchk(a, 1, undefined, 'randi');
    const lim = H.tensor(a[0]);
    let lo = 1, hi;
    if (lim.numel >= 2) { lo = lim.re[0]; hi = lim.re[1]; } else hi = lim.re[0];
    if (hi < lo) err('randi: 上限必须大于等于下限。');
    const { r, c } = H.sizeArgs(a.slice(1), 'randi'); const g = rng(it);
    const t = new Tensor(r, c); for (let k = 0; k < t.re.length; k++) t.re[k] = lo + Math.floor(g.next() * (hi - lo + 1)); return t;
  }, { cat: '矩阵构造', syn: 'randi(imax,n), randi([imin imax],m,n)', desc: '均匀分布随机整数' });
  def('randperm', (a, n, it) => {
    const N = H.int(a[0]); const k = a.length > 1 ? H.int(a[1]) : N; const g = rng(it);
    const p = []; for (let i = 1; i <= N; i++) p.push(i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(g.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    return T.row(p.slice(0, k));
  }, { cat: '矩阵构造', syn: 'randperm(n), randperm(n,k)', desc: '随机排列' });
  def('rng', (a, n, it) => {
    const g = rng(it);
    const s = new Struct(1, 1); s.setField('Type', T.str('twister'), 0); s.setField('Seed', T.scalar(g.seedValue || 0), 0);
    if (a.length) {
      if (T.isStr(a[0])) { const o = a[0].toStr(); if (o === 'default') g.seed(0); else if (o === 'shuffle') g.seed(Date.now() % 4294967296); }
      else if (a[0] instanceof Struct) g.seed(H.num(a[0].getField('Seed', 0)));
      else g.seed(H.num(a[0]));
    }
    return n > 0 ? s : null;
  }, { cat: '矩阵构造', syn: "rng(seed), rng('default'), rng('shuffle')", desc: '控制随机数生成器种子' });

  def('linspace', (a) => {
    H.nargchk(a, 2, 3, 'linspace');
    const x0 = H.num(a[0]), x1 = H.num(a[1]); const n = a.length > 2 ? Math.floor(H.num(a[2])) : 100;
    if (n < 1) return new Tensor(1, 0);
    const t = new Tensor(1, n);
    if (n === 1) { t.re[0] = x1; return t; }
    for (let k = 0; k < n; k++) t.re[k] = x0 + (x1 - x0) * k / (n - 1);
    t.re[n - 1] = x1;
    return t;
  }, { cat: '矩阵构造', syn: 'linspace(a,b), linspace(a,b,n)', desc: '生成线性间隔向量（默认 100 个点）' });
  def('logspace', (a) => {
    const x0 = H.num(a[0]), x1 = H.num(a[1]); const n = a.length > 2 ? Math.floor(H.num(a[2])) : 50;
    const t = new Tensor(1, n);
    for (let k = 0; k < n; k++) t.re[k] = Math.pow(10, n === 1 ? x1 : x0 + (x1 - x0) * k / (n - 1));
    return t;
  }, { cat: '矩阵构造', syn: 'logspace(a,b,n)', desc: '生成对数间隔向量 10^a 到 10^b' });
  def('colon', (a) => ML.makeRange(a[0], a.length > 2 ? a[1] : null, a.length > 2 ? a[2] : a[1]), { cat: '矩阵构造', syn: 'colon(a,b), colon(a,step,b)', desc: '等价于 a:b 或 a:step:b' });

  function magic(n) {
    const M = []; for (let i = 0; i < n; i++) M.push(new Array(n).fill(0));
    const mod = (a, b) => ((a % b) + b) % b;
    if (n % 2 === 1) {
      for (let I = 1; I <= n; I++) for (let J = 1; J <= n; J++) {
        const A = mod(I + J - (n + 3) / 2, n), B = mod(I + 2 * J - 2, n);
        M[I - 1][J - 1] = n * A + B + 1;
      }
    } else if (n % 4 === 0) {
      for (let I = 1; I <= n; I++) for (let J = 1; J <= n; J++) {
        let v = (I - 1) * n + J;
        if (Math.floor(mod(I, 4) / 2) === Math.floor(mod(J, 4) / 2)) v = n * n + 1 - v;
        M[I - 1][J - 1] = v;
      }
    } else {
      const p = n / 2;
      const A = magic(p);
      for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
        M[i][j] = A[i][j]; M[i][j + p] = A[i][j] + 2 * p * p;
        M[i + p][j] = A[i][j] + 3 * p * p; M[i + p][j + p] = A[i][j] + p * p;
      }
      if (n === 2) return M;
      const k = (n - 2) / 4;
      const cols = [];
      for (let j = 1; j <= k; j++) cols.push(j);
      for (let j = n - k + 2; j <= n; j++) cols.push(j);
      const swap = (rowsIdx, colsIdx) => {
        for (const j of colsIdx) for (const i of rowsIdx) { const t = M[i - 1][j - 1]; M[i - 1][j - 1] = M[i + p - 1][j - 1]; M[i + p - 1][j - 1] = t; }
      };
      const allI = []; for (let i = 1; i <= p; i++) allI.push(i);
      swap(allI, cols);
      const i2 = k + 1;
      swap([i2], [1, i2]);
    }
    return M;
  }
  def('magic', (a) => { const n = H.int(a[0]); if (n < 1) return new Tensor(0, 0); if (n === 2) return T.fromRows([[4, 3], [1, 2]]); return T.fromRows(magic(n)); },
    { cat: '矩阵构造', syn: 'magic(n)', desc: '魔方矩阵（行、列、对角线和相等）' });
  def('hilb', (a) => { const n = H.int(a[0]); const t = new Tensor(n, n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) t.re[i + j * n] = 1 / (i + j + 1); return t; },
    { cat: '矩阵构造', syn: 'hilb(n)', desc: '希尔伯特矩阵' });
  def('pascal', (a) => { const n = H.int(a[0]); const t = new Tensor(n, n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) t.re[i + j * n] = (i === 0 || j === 0) ? 1 : t.re[(i - 1) + j * n] + t.re[i + (j - 1) * n]; return t; },
    { cat: '矩阵构造', syn: 'pascal(n)', desc: '帕斯卡矩阵' });
  def('vander', (a) => { const v = H.toArray(a[0]); const n = v.length; const m = a.length > 1 ? H.int(a[1]) : n; const t = new Tensor(n, m); for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) t.re[i + j * n] = Math.pow(v[i], m - 1 - j); return t; },
    { cat: '矩阵构造', syn: 'vander(v)', desc: '范德蒙矩阵' });
  def('toeplitz', (a) => {
    const c = H.toArray(a[0]); const r = a.length > 1 ? H.toArray(a[1]) : c;
    const m = c.length, n = r.length; const t = new Tensor(m, n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) t.re[i + j * m] = i >= j ? c[i - j] : r[j - i];
    return t;
  }, { cat: '矩阵构造', syn: 'toeplitz(c,r)', desc: '托普利茨矩阵' });
  def('hankel', (a) => {
    const c = H.toArray(a[0]); const m = c.length;
    const r = a.length > 1 ? H.toArray(a[1]) : new Array(m).fill(0);
    const n = r.length; const t = new Tensor(m, n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const k = i + j; t.re[i + j * m] = k < m ? c[k] : r[k - m + 1]; }
    return t;
  }, { cat: '矩阵构造', syn: 'hankel(c,r)', desc: '汉克尔矩阵' });
  def('compan', (a) => {
    const p = H.toArray(a[0]); const n = p.length - 1; if (n < 1) return new Tensor(0, 0);
    const t = new Tensor(n, n);
    for (let j = 0; j < n; j++) t.re[0 + j * n] = -p[j + 1] / p[0];
    for (let i = 1; i < n; i++) t.re[i + (i - 1) * n] = 1;
    return t;
  }, { cat: '矩阵构造', syn: 'compan(p)', desc: '多项式伴随矩阵' });
  def('blkdiag', (a) => {
    const ms = a.map((x) => H.tensor(x));
    const R = ms.reduce((s, m) => s + m.rows, 0), C = ms.reduce((s, m) => s + m.cols, 0);
    const t = new Tensor(R, C); let r0 = 0, c0 = 0;
    for (const m of ms) { for (let i = 0; i < m.rows; i++) for (let j = 0; j < m.cols; j++) t.re[(r0 + i) + (c0 + j) * R] = m.re[i + j * m.rows]; r0 += m.rows; c0 += m.cols; }
    return t;
  }, { cat: '矩阵构造', syn: 'blkdiag(A,B,...)', desc: '分块对角矩阵' });

  def('diag', (a) => {
    const v = H.tensor(a[0]); const k = a.length > 1 ? H.int(a[1]) : 0;
    if (v.rows === 1 || v.cols === 1) {
      const n = v.numel, N = n + Math.abs(k);
      const t = new Tensor(N, N, null, v.im ? new Float64Array(N * N) : null, v.type === 'logical' ? 'double' : v.type);
      for (let i = 0; i < n; i++) {
        const r = k >= 0 ? i : i - k, c = k >= 0 ? i + k : i;
        t.re[r + c * N] = v.re[i]; if (v.im) t.im[r + c * N] = v.im[i];
      }
      return t;
    }
    const out = [], outI = [];
    for (let i = 0; i < v.rows; i++) { const j = i + k; if (j >= 0 && j < v.cols) { out.push(v.re[i + j * v.rows]); outI.push(v.im ? v.im[i + j * v.rows] : 0); } }
    const t = T.col(out); if (v.im) { t.im = Float64Array.from(outI); t.trim(); }
    return t;
  }, { cat: '矩阵操作', syn: 'diag(v), diag(A), diag(A,k)', desc: '创建对角矩阵或提取对角线' });
  function triPart(a, upper) {
    const A = H.tensor(a[0]); const k = a.length > 1 ? H.int(a[1]) : 0;
    const t = A.clone();
    for (let i = 0; i < A.rows; i++) for (let j = 0; j < A.cols; j++) {
      const keep = upper ? (j - i >= k) : (j - i <= k);
      if (!keep) { t.re[i + j * A.rows] = 0; if (t.im) t.im[i + j * A.rows] = 0; }
    }
    return t;
  }
  def('tril', (a) => triPart(a, false), { cat: '矩阵操作', syn: 'tril(A), tril(A,k)', desc: '下三角部分' });
  def('triu', (a) => triPart(a, true), { cat: '矩阵操作', syn: 'triu(A), triu(A,k)', desc: '上三角部分' });

  def('meshgrid', (a, nargout) => {
    const x = H.toArray(a[0]); const y = a.length > 1 ? H.toArray(a[1]) : x;
    const R = y.length, C = x.length;
    const X = new Tensor(R, C), Y = new Tensor(R, C);
    for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { X.re[i + j * R] = x[j]; Y.re[i + j * R] = y[i]; }
    return [X, Y];
  }, { cat: '矩阵构造', syn: '[X,Y] = meshgrid(x,y)', desc: '生成二维网格坐标（常用于 surf/contour）' });
  def('ndgrid', (a) => {
    const x = H.toArray(a[0]); const y = a.length > 1 ? H.toArray(a[1]) : x;
    const R = x.length, C = y.length;
    const X = new Tensor(R, C), Y = new Tensor(R, C);
    for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { X.re[i + j * R] = x[i]; Y.re[i + j * R] = y[j]; }
    return [X, Y];
  }, { cat: '矩阵构造', syn: '[X,Y] = ndgrid(x,y)', desc: 'N 维网格（二维）' });

  def('repmat', (a) => {
    H.nargchk(a, 2, 3, 'repmat');
    const A = a[0];
    let m, n;
    if (a.length === 2) { const s = H.tensor(a[1]); m = s.re[0]; n = s.numel > 1 ? s.re[1] : m; } else { m = H.num(a[1]); n = H.num(a[2]); }
    const R = A.rows, C = A.cols, NR = R * m, NC = C * n;
    if (A instanceof Tensor) {
      const t = new Tensor(NR, NC, null, A.im ? new Float64Array(NR * NC) : null, A.type);
      for (let bj = 0; bj < n; bj++) for (let bi = 0; bi < m; bi++) for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) {
        const d = (bi * R + i) + (bj * C + j) * NR; t.re[d] = A.re[i + j * R]; if (A.im) t.im[d] = A.im[i + j * R];
      }
      return t;
    }
    if (A instanceof Cell) {
      const t = new Cell(NR, NC);
      for (let bj = 0; bj < n; bj++) for (let bi = 0; bi < m; bi++) for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) t.data[(bi * R + i) + (bj * C + j) * NR] = A.data[i + j * R];
      return t;
    }
    if (A instanceof Struct) {
      const t = new Struct(NR, NC, A.fields.slice());
      for (let bj = 0; bj < n; bj++) for (let bi = 0; bi < m; bi++) for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) t.elems[(bi * R + i) + (bj * C + j) * NR] = new Map(A.elems[i + j * R]);
      return t;
    }
    err('repmat: 不支持的输入类型。');
  }, { cat: '矩阵操作', syn: 'repmat(A,m,n)', desc: '重复矩阵（平铺）' });

  def('reshape', (a) => {
    H.nargchk(a, 2, undefined, 'reshape');
    const A = a[0], n = A.rows * A.cols;
    let dims = [];
    if (a.length === 2) dims = H.toArray(a[1]);
    else for (let k = 1; k < a.length; k++) dims.push(a[k] instanceof Tensor && a[k].numel === 0 ? null : H.num(a[k]));
    const unknown = dims.indexOf(null);
    if (unknown >= 0) { const p = dims.reduce((s, d) => (d === null ? s : s * d), 1); dims[unknown] = n / p; if (!Number.isInteger(dims[unknown])) err('reshape: 元素数目不能被已知维度整除。'); }
    while (dims.length > 2 && dims[dims.length - 1] === 1) dims.pop();
    if (dims.length > 2) err('reshape: 暂不支持三维及以上数组。');
    const [r, c] = dims;
    if (r * c !== n) err('重构数组时元素数目不能更改。（' + n + ' 个元素无法重构为 ' + r + '×' + c + '）');
    if (A instanceof Tensor) return new Tensor(r, c, new Float64Array(A.re), A.im ? new Float64Array(A.im) : null, A.type);
    if (A instanceof Cell) return new Cell(r, c, A.data.slice());
    if (A instanceof Struct) return new Struct(r, c, A.fields.slice(), A.elems.slice());
    err('reshape: 不支持的输入类型。');
  }, { cat: '矩阵操作', syn: 'reshape(A,m,n), reshape(A,[m n])', desc: '改变矩阵形状（按列优先顺序）' });

  def('cat', (a) => {
    const d = H.int(a[0]); const vals = a.slice(1);
    if (d === 1) return IX.vertcat(vals);
    if (d === 2) return IX.horzcat(vals);
    err('cat: 暂不支持三维及以上数组。');
  }, { cat: '矩阵操作', syn: 'cat(dim,A,B,...)', desc: '沿指定维度串联' });
  def('horzcat', (a) => (a.length ? IX.horzcat(a) : new Tensor(0, 0)), { cat: '矩阵操作', syn: 'horzcat(A,B,...)', desc: '水平串联 [A B]' });
  def('vertcat', (a) => (a.length ? IX.vertcat(a) : new Tensor(0, 0)), { cat: '矩阵操作', syn: 'vertcat(A,B,...)', desc: '垂直串联 [A; B]' });

  // ---------- 尺寸 ----------
  def('size', (a, nargout) => {
    H.nargchk(a, 1, 2, 'size');
    const v = a[0];
    const dims = [v.rows, v.cols];
    if (a.length > 1) {
      const ds = H.toArray(a[1]);
      const out = ds.map((d) => (d <= 2 ? dims[d - 1] : 1));
      if (nargout > 1) return out.map((x) => T.scalar(x));
      return T.row(out);
    }
    if (nargout <= 1) return T.row(dims);
    const out = [T.scalar(v.rows), T.scalar(v.cols)];
    for (let k = 2; k < nargout; k++) out.push(T.scalar(1));
    return out;
  }, { cat: '矩阵信息', syn: 'size(A), [m,n] = size(A), size(A,dim)', desc: '数组尺寸' });
  def('numel', (a) => T.scalar(a[0].rows * a[0].cols), { cat: '矩阵信息', syn: 'numel(A)', desc: '元素个数' });
  def('length', (a) => { const v = a[0]; return T.scalar(v.rows * v.cols === 0 ? 0 : Math.max(v.rows, v.cols)); }, { cat: '矩阵信息', syn: 'length(A)', desc: '最大维度的长度' });
  def('ndims', () => T.scalar(2), { cat: '矩阵信息', syn: 'ndims(A)', desc: '维数' });
  def('rows', (a) => T.scalar(a[0].rows));
  def('columns', (a) => T.scalar(a[0].cols));
  def('isempty', (a) => T.bool(a[0].rows * a[0].cols === 0), { cat: '矩阵信息', syn: 'isempty(A)', desc: '是否为空数组' });
  def('isscalar', (a) => T.bool(a[0].rows === 1 && a[0].cols === 1), { cat: '矩阵信息', syn: 'isscalar(A)', desc: '是否为标量' });
  def('isvector', (a) => T.bool((a[0].rows === 1 || a[0].cols === 1) && a[0].rows * a[0].cols >= 1), { cat: '矩阵信息', syn: 'isvector(A)', desc: '是否为向量' });
  def('isrow', (a) => T.bool(a[0].rows === 1), { cat: '矩阵信息', syn: 'isrow(A)', desc: '是否为行向量' });
  def('iscolumn', (a) => T.bool(a[0].cols === 1), { cat: '矩阵信息', syn: 'iscolumn(A)', desc: '是否为列向量' });
  def('ismatrix', () => T.bool(true), { cat: '矩阵信息', syn: 'ismatrix(A)', desc: '是否为矩阵' });
  def('issquare', (a) => T.bool(a[0].rows === a[0].cols));
  def('squeeze', (a) => a[0]);
  def('permute', (a) => { const p = H.toArray(a[1]); if (p[0] === 2 && p[1] === 1) return ML.ops.transpose(a[0]); return a[0]; });

  // ---------- 翻转与平移 ----------
  function rearrange(A, rmap, cmap, R, C) {
    // 新位置 (i,j) 取自 (rmap(i,j), cmap(i,j))
    if (A instanceof Tensor) {
      const t = new Tensor(R, C, null, A.im ? new Float64Array(R * C) : null, A.type);
      for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { const [si, sj] = rmap(i, j); const s = si + sj * A.rows; t.re[i + j * R] = A.re[s]; if (A.im) t.im[i + j * R] = A.im[s]; }
      return t;
    }
    if (A instanceof Cell) {
      const t = new Cell(R, C);
      for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { const [si, sj] = rmap(i, j); t.data[i + j * R] = A.data[si + sj * A.rows]; }
      return t;
    }
    if (A instanceof Struct) {
      const t = new Struct(R, C, A.fields.slice());
      for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { const [si, sj] = rmap(i, j); t.elems[i + j * R] = A.elems[si + sj * A.rows]; }
      return t;
    }
    err('不支持的输入类型。');
  }
  def('fliplr', (a) => { const A = a[0]; return rearrange(A, (i, j) => [i, A.cols - 1 - j], null, A.rows, A.cols); }, { cat: '矩阵操作', syn: 'fliplr(A)', desc: '左右翻转' });
  def('flipud', (a) => { const A = a[0]; return rearrange(A, (i, j) => [A.rows - 1 - i, j], null, A.rows, A.cols); }, { cat: '矩阵操作', syn: 'flipud(A)', desc: '上下翻转' });
  def('flip', (a) => {
    const A = a[0]; const d = a.length > 1 ? H.int(a[1]) : (A.rows !== 1 ? 1 : 2);
    if (d === 1) return rearrange(A, (i, j) => [A.rows - 1 - i, j], null, A.rows, A.cols);
    if (d === 2) return rearrange(A, (i, j) => [i, A.cols - 1 - j], null, A.rows, A.cols);
    return A;
  }, { cat: '矩阵操作', syn: 'flip(A), flip(A,dim)', desc: '沿维度翻转' });
  def('rot90', (a) => {
    const A = a[0]; let k = a.length > 1 ? H.int(a[1]) : 1; k = ((k % 4) + 4) % 4;
    const R = A.rows, C = A.cols;
    if (k === 0) return A;
    if (k === 1) return rearrange(A, (i, j) => [j, C - 1 - i], null, C, R);
    if (k === 2) return rearrange(A, (i, j) => [R - 1 - i, C - 1 - j], null, R, C);
    return rearrange(A, (i, j) => [R - 1 - j, i], null, C, R);
  }, { cat: '矩阵操作', syn: 'rot90(A), rot90(A,k)', desc: '旋转 90 度（逆时针）' });
  def('circshift', (a) => {
    const A = a[0]; const K = H.toArray(a[1]);
    let kr = 0, kc = 0;
    if (a.length > 2) { const d = H.int(a[2]); if (d === 1) kr = K[0]; else kc = K[0]; }
    else if (K.length >= 2) { kr = K[0]; kc = K[1]; }
    else if (A.rows === 1) kc = K[0]; else kr = K[0];
    const R = A.rows, C = A.cols, md = (x, m) => ((x % m) + m) % m;
    return rearrange(A, (i, j) => [md(i - kr, R), md(j - kc, C)], null, R, C);
  }, { cat: '矩阵操作', syn: 'circshift(A,k), circshift(A,k,dim)', desc: '循环平移' });

  // ---------- 查找 ----------
  def('find', (a, nargout) => {
    const X = H.tensor(a[0]);
    let lim = a.length > 1 ? H.num(a[1]) : Infinity;
    const last = a.length > 2 && H.str(a[2]) === 'last';
    let idx = [];
    for (let k = 0; k < X.numel; k++) if (X.re[k] !== 0 || (X.im && X.im[k] !== 0)) idx.push(k);
    if (lim < idx.length) idx = last ? idx.slice(idx.length - lim) : idx.slice(0, lim);
    const asRow = X.rows === 1 && X.cols !== 1;
    const mk = (arr) => (asRow ? T.row(arr) : T.col(arr));
    if (nargout <= 1) {
      const t = mk(idx.map((k) => k + 1));
      if (X.numel === 0) return new Tensor(X.rows === 1 ? 1 : 0, 0);
      return t;
    }
    const r = idx.map((k) => (k % X.rows) + 1), c = idx.map((k) => Math.floor(k / X.rows) + 1);
    const out = [mk(r), mk(c)];
    if (nargout > 2) out.push(mk(idx.map((k) => X.re[k])));
    return out;
  }, { cat: '矩阵操作', syn: 'find(X), find(X,k), [r,c] = find(X)', desc: '查找非零元素的索引' });
  def('nnz', (a) => { const X = H.tensor(a[0]); let n = 0; for (let k = 0; k < X.numel; k++) if (X.re[k] !== 0 || (X.im && X.im[k] !== 0)) n++; return T.scalar(n); },
    { cat: '矩阵信息', syn: 'nnz(X)', desc: '非零元素个数' });
  def('sub2ind', (a) => {
    const sz = H.toArray(a[0]); const r = H.tensor(a[1]), c = a.length > 2 ? H.tensor(a[2]) : null;
    const t = new Tensor(r.rows, r.cols);
    for (let k = 0; k < r.numel; k++) {
      const ri = r.re[k], ci = c ? c.re[c.numel === 1 ? 0 : k] : 1;
      if (ri < 1 || ri > sz[0] || ci < 1 || ci > (sz[1] || 1)) err('sub2ind: 下标超出范围。');
      t.re[k] = ri + (ci - 1) * sz[0];
    }
    return t;
  }, { cat: '矩阵操作', syn: 'ind = sub2ind(sz,r,c)', desc: '下标转线性索引' });
  def('ind2sub', (a, nargout) => {
    const sz = H.toArray(a[0]); const ind = H.tensor(a[1]);
    const R = new Tensor(ind.rows, ind.cols), C = new Tensor(ind.rows, ind.cols);
    for (let k = 0; k < ind.numel; k++) { const x = ind.re[k] - 1; R.re[k] = (x % sz[0]) + 1; C.re[k] = Math.floor(x / sz[0]) + 1; }
    if (nargout <= 1) return ind;
    return [R, C];
  }, { cat: '矩阵操作', syn: '[r,c] = ind2sub(sz,ind)', desc: '线性索引转下标' });

  // ---------- 排序 ----------
  function cmpNum(desc) {
    return (x, y) => {
      const nx = Number.isNaN(x[0]), ny = Number.isNaN(y[0]);
      if (nx || ny) { if (nx && ny) return x[1] - y[1]; return desc ? (nx ? -1 : 1) : (nx ? 1 : -1); }
      if (x[0] !== y[0]) return desc ? y[0] - x[0] : x[0] - y[0];
      return x[1] - y[1];
    };
  }
  function sortStrings(arr, desc) {
    const idx = arr.map((s, i) => i);
    idx.sort((x, y) => { const a = arr[x], b = arr[y]; if (a === b) return x - y; return (a < b ? -1 : 1) * (desc ? -1 : 1); });
    return idx;
  }
  def('sort', (a, nargout) => {
    const A = a[0];
    let desc = false, dim = null;
    for (let k = 1; k < a.length; k++) {
      if (T.isStr(a[k])) { const s = a[k].toStr().toLowerCase(); if (s === 'descend') desc = true; else if (s === 'ascend') desc = false; }
      else dim = H.int(a[k]);
    }
    if (A instanceof Cell) {
      const strs = A.data.map((x) => H.str(x, '元胞元素'));
      const idx = sortStrings(strs, desc);
      const out = new Cell(A.rows, A.cols, idx.map((i) => A.data[i]));
      return [out, A.rows === 1 ? T.row(idx.map((i) => i + 1)) : T.col(idx.map((i) => i + 1))];
    }
    const X = H.tensor(A);
    if (dim === null) dim = X.rows !== 1 ? 1 : 2;
    const B = X.clone(), I = new Tensor(X.rows, X.cols);
    const key = X.im ? (k) => Math.hypot(X.re[k], X.im[k]) + Math.atan2(X.im[k], X.re[k]) * 1e-300 : (k) => X.re[k];
    const process = (lin) => {
      const pairs = lin.map((k, p) => [X.im ? Math.hypot(X.re[k], X.im[k]) : X.re[k], p, k, X.im ? Math.atan2(X.im[k], X.re[k]) : 0]);
      const cmp = cmpNum(desc);
      pairs.sort((x, y) => { const c = cmp(x, y); if (X.im && x[0] === y[0]) return desc ? y[3] - x[3] : x[3] - y[3]; return c; });
      for (let p = 0; p < lin.length; p++) {
        B.re[lin[p]] = X.re[pairs[p][2]]; if (X.im) B.im[lin[p]] = X.im[pairs[p][2]];
        I.re[lin[p]] = pairs[p][1] + 1;
      }
    };
    void key;
    if (dim === 1) for (let c = 0; c < X.cols; c++) { const lin = []; for (let r = 0; r < X.rows; r++) lin.push(r + c * X.rows); process(lin); }
    else if (dim === 2) for (let r = 0; r < X.rows; r++) { const lin = []; for (let c = 0; c < X.cols; c++) lin.push(r + c * X.rows); process(lin); }
    return [B, I];
  }, { cat: '矩阵操作', syn: "sort(A), sort(A,'descend'), [B,I] = sort(A,dim)", desc: '排序' });
  def('sortrows', (a, nargout) => {
    const A = H.tensor(a[0]);
    let cols = []; for (let c = 1; c <= A.cols; c++) cols.push(c);
    if (a.length > 1 && !T.isStr(a[1])) cols = H.toArray(a[1]);
    const descAll = a.length > 1 && T.isStr(a[a.length - 1]) && a[a.length - 1].toStr() === 'descend';
    const idx = []; for (let r = 0; r < A.rows; r++) idx.push(r);
    idx.sort((x, y) => {
      for (const cc of cols) {
        const c = Math.abs(cc) - 1, s = (cc < 0 || descAll) ? -1 : 1;
        const vx = A.re[x + c * A.rows], vy = A.re[y + c * A.rows];
        if (vx !== vy) return (vx - vy) * s;
      }
      return x - y;
    });
    const B = new Tensor(A.rows, A.cols, null, null, A.type);
    for (let i = 0; i < A.rows; i++) for (let c = 0; c < A.cols; c++) B.re[i + c * A.rows] = A.re[idx[i] + c * A.rows];
    return [B, T.col(idx.map((i) => i + 1))];
  }, { cat: '矩阵操作', syn: 'sortrows(A), sortrows(A,col)', desc: '按行排序' });

  // ---------- 集合运算 ----------
  function setInput(v) {
    if (v instanceof Cell) return { strs: v.data.map((x) => H.str(x)), isCell: true, row: v.rows === 1 };
    const t = H.tensor(v);
    return { vals: Array.from(t.re), isCell: false, row: t.rows === 1 && t.numel > 0, type: t.type };
  }
  function setOutput(arr, info, rowPref) {
    if (info.isCell) return rowPref ? new Cell(1, arr.length, arr.map((s) => T.str(s))) : new Cell(arr.length, 1, arr.map((s) => T.str(s)));
    const t = rowPref ? T.row(arr) : T.col(arr);
    t.type = info.type === 'logical' ? 'logical' : (info.type || 'double');
    if (t.numel === 0) { t.rows = rowPref ? 1 : 0; t.cols = 0; }
    return t;
  }
  const sortVals = (arr, isStr) => arr.slice().sort(isStr ? ((x, y) => (x < y ? -1 : x > y ? 1 : 0)) : ((x, y) => (Number.isNaN(x) ? 1 : Number.isNaN(y) ? -1 : x - y)));
  def('unique', (a, nargout) => {
    const A = a[0];
    const opts = a.slice(1).filter(T.isStr).map((x) => x.toStr());
    const stable = opts.indexOf('stable') >= 0;
    if (opts.indexOf('rows') >= 0 && A instanceof Tensor) {
      const rowsArr = []; for (let r = 0; r < A.rows; r++) { const row = []; for (let c = 0; c < A.cols; c++) row.push(A.re[r + c * A.rows]); rowsArr.push(row); }
      const keys = rowsArr.map((r) => r.join(','));
      const order = rowsArr.map((r, i) => i).sort((x, y) => { for (let c = 0; c < A.cols; c++) { const d = rowsArr[x][c] - rowsArr[y][c]; if (d) return d; } return x - y; });
      const seen = new Map(); const sel = [];
      for (const i of (stable ? rowsArr.map((r, i) => i) : order)) if (!seen.has(keys[i])) { seen.set(keys[i], sel.length); sel.push(i); }
      const C = new Tensor(sel.length, A.cols);
      sel.forEach((i, p) => { for (let c = 0; c < A.cols; c++) C.re[p + c * sel.length] = rowsArr[i][c]; });
      return [C, T.col(sel.map((i) => i + 1)), T.col(keys.map((k) => seen.get(k) + 1))];
    }
    const info = setInput(A);
    const vals = info.isCell ? info.strs : info.vals;
    const keyOf = (x) => (info.isCell ? 's' + x : (Number.isNaN(x) ? 'nan' + Math.random() : x));
    let order = vals.map((x, i) => i);
    if (!stable) order.sort((x, y) => { const vx = vals[x], vy = vals[y]; if (vx === vy) return y - x; if (info.isCell) return vx < vy ? -1 : 1; if (Number.isNaN(vx)) return 1; if (Number.isNaN(vy)) return -1; return vx - vy; });
    const firstIdx = new Map(); const uniq = []; const pos = new Map();
    // MATLAB 默认返回最后出现的索引？新版本返回第一次出现。这里返回第一次出现。
    for (let i = 0; i < vals.length; i++) { const k = keyOf(vals[i]); if (!firstIdx.has(k)) firstIdx.set(k, i); }
    for (const i of order) { const k = keyOf(vals[i]); if (!pos.has(k)) { pos.set(k, uniq.length); uniq.push(i); } }
    const outVals = uniq.map((i) => vals[i]);
    const ia = uniq.map((i) => firstIdx.get(keyOf(vals[i])) + 1);
    const ic = vals.map((x) => pos.get(keyOf(x)) + 1);
    const rowPref = info.row;
    return [setOutput(outVals, info, rowPref), T.col(ia), T.col(ic)];
  }, { cat: '集合运算', syn: "unique(A), [C,ia,ic] = unique(A), unique(A,'stable')", desc: '唯一值（排序）' });
  function setOp(a, kind) {
    const A = setInput(a[0]), B = setInput(a[1]);
    const av = A.isCell ? A.strs : A.vals, bv = B.isCell ? B.strs : B.vals;
    const stable = a.length > 2 && T.isStr(a[2]) && a[2].toStr() === 'stable';
    const bset = new Set(bv), aset = new Set(av);
    let res = [];
    const ia = [], ib = [];
    if (kind === 'union') {
      const all = av.concat(bv); const seen = new Set();
      for (const x of all) if (!seen.has(x)) { seen.add(x); res.push(x); }
    } else if (kind === 'intersect') {
      const seen = new Set();
      av.forEach((x, i) => { if (bset.has(x) && !seen.has(x)) { seen.add(x); res.push(x); } });
    } else if (kind === 'setdiff') {
      const seen = new Set();
      av.forEach((x) => { if (!bset.has(x) && !seen.has(x)) { seen.add(x); res.push(x); } });
    } else if (kind === 'setxor') {
      const seen = new Set();
      av.forEach((x) => { if (!bset.has(x) && !seen.has(x)) { seen.add(x); res.push(x); } });
      bv.forEach((x) => { if (!aset.has(x) && !seen.has(x)) { seen.add(x); res.push(x); } });
    }
    if (!stable) res = sortVals(res, A.isCell);
    for (const x of res) { ia.push(av.indexOf(x) + 1); ib.push(bv.indexOf(x) + 1); }
    const rowPref = (A.row || av.length === 0) && (B.row || bv.length <= 1 || kind === 'setdiff');
    return [setOutput(res, A.isCell ? A : (B.isCell ? B : A), A.isCell || B.isCell ? true : rowPref), T.col(ia), T.col(ib)];
  }
  def('union', (a) => setOp(a, 'union'), { cat: '集合运算', syn: 'union(A,B)', desc: '并集' });
  def('intersect', (a) => setOp(a, 'intersect'), { cat: '集合运算', syn: '[C,ia,ib] = intersect(A,B)', desc: '交集' });
  def('setdiff', (a) => setOp(a, 'setdiff'), { cat: '集合运算', syn: 'setdiff(A,B)', desc: '差集（在 A 中但不在 B 中）' });
  def('setxor', (a) => setOp(a, 'setxor'), { cat: '集合运算', syn: 'setxor(A,B)', desc: '对称差' });
  def('ismember', (a, nargout) => {
    const A = a[0], S = setInput(a[1]);
    const sv = S.isCell ? S.strs : S.vals;
    const pos = new Map(); sv.forEach((x, i) => { if (!pos.has(x)) pos.set(x, i + 1); });
    if (T.isStr(A) && S.isCell) { const p = pos.get(A.toStr()) || 0; return [T.bool(p > 0), T.scalar(p)]; }
    if (A instanceof Cell) {
      const tf = new Tensor(A.rows, A.cols, null, null, 'logical'), loc = new Tensor(A.rows, A.cols);
      A.data.forEach((x, k) => { const p = pos.get(H.str(x)) || 0; tf.re[k] = p > 0 ? 1 : 0; loc.re[k] = p; });
      return [tf, loc];
    }
    const X = H.tensor(A);
    const tf = new Tensor(X.rows, X.cols, null, null, 'logical'), loc = new Tensor(X.rows, X.cols);
    for (let k = 0; k < X.numel; k++) { const p = pos.get(X.re[k]) || 0; tf.re[k] = p > 0 ? 1 : 0; loc.re[k] = p; }
    return [tf, loc];
  }, { cat: '集合运算', syn: '[tf,loc] = ismember(A,S)', desc: '判断元素是否属于集合' });
  def('accumarray', (a) => {
    const subs = H.tensor(a[0]); const vals = H.tensor(a[1]);
    const fn = a.length > 3 && a[3] instanceof FuncHandle ? a[3] : null;
    const twoD = subs.cols === 2 && subs.rows > 0;
    const n = twoD ? subs.rows : subs.numel;
    let R = 0, C = 1;
    for (let k = 0; k < n; k++) { R = Math.max(R, subs.re[k]); if (twoD) C = Math.max(C, subs.re[k + subs.rows]); }
    if (a.length > 2 && a[2] instanceof Tensor && a[2].numel >= 1) { const sz = H.toArray(a[2]); R = Math.max(R, sz[0]); C = Math.max(C, sz[1] || 1); }
    const groups = new Map();
    for (let k = 0; k < n; k++) {
      const r = subs.re[k] - 1, c = twoD ? subs.re[k + subs.rows] - 1 : 0;
      const key = r + c * R;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(vals.numel === 1 ? vals.re[0] : vals.re[k]);
    }
    const t = new Tensor(R, C);
    for (const [key, list] of groups) {
      if (fn) t.re[key] = H.num(ML.curInterp.call1(fn, [T.col(list)]));
      else t.re[key] = list.reduce((s, x) => s + x, 0);
    }
    return t;
  }, { cat: '矩阵操作', syn: 'accumarray(subs,vals)', desc: '按下标累加' });

  // ---------- 比较 ----------
  function isEqualVals(x, y, nanEq) {
    if (x instanceof Tensor && y instanceof Tensor) {
      if (x.rows !== y.rows || x.cols !== y.cols) return false;
      for (let k = 0; k < x.numel; k++) {
        const a = x.re[k], b = y.re[k];
        if (a !== b && !(nanEq && Number.isNaN(a) && Number.isNaN(b))) return false;
        const ai = x.im ? x.im[k] : 0, bi = y.im ? y.im[k] : 0;
        if (ai !== bi) return false;
      }
      return true;
    }
    if (x instanceof Cell && y instanceof Cell) {
      if (x.rows !== y.rows || x.cols !== y.cols) return false;
      return x.data.every((v, k) => isEqualVals(v, y.data[k], nanEq));
    }
    if (x instanceof Struct && y instanceof Struct) {
      if (x.rows !== y.rows || x.cols !== y.cols || x.fields.length !== y.fields.length) return false;
      for (const f of x.fields) if (!y.hasField(f)) return false;
      for (let k = 0; k < x.numel; k++) for (const f of x.fields) if (!isEqualVals(x.getField(f, k), y.getField(f, k), nanEq)) return false;
      return true;
    }
    if (x instanceof FuncHandle && y instanceof FuncHandle) return x === y || x.text === y.text;
    return false;
  }
  ML.isEqualVals = isEqualVals;
  def('isequal', (a) => { for (let k = 1; k < a.length; k++) if (!isEqualVals(a[0], a[k], false)) return T.bool(false); return T.bool(true); },
    { cat: '逻辑运算', syn: 'isequal(A,B,...)', desc: '判断数组是否相等' });
  def('isequaln', (a) => { for (let k = 1; k < a.length; k++) if (!isEqualVals(a[0], a[k], true)) return T.bool(false); return T.bool(true); },
    { cat: '逻辑运算', syn: 'isequaln(A,B)', desc: '判断相等（NaN 视为相等）' });

  // ---------- 类型转换 ----------
  function convertTo(type) {
    return (a) => {
      H.nargchk(a, 1, 1, type);
      const v = a[0];
      if (v instanceof Cell) err('无法从 cell 转换为 ' + type + '。');
      if (v instanceof Struct) err('无法从 struct 转换为 ' + type + '。');
      if (v instanceof FuncHandle) err('无法从 function_handle 转换为 ' + type + '。');
      if (v.type === type) return v;
      const t = new Tensor(v.rows, v.cols, null, v.im && !isIntType(type) && type !== 'logical' ? new Float64Array(v.im) : null, type);
      if (type === 'logical' && v.im) err('复数值不能转换为逻辑值。');
      for (let k = 0; k < v.numel; k++) t.re[k] = castValue(type, v.re[k]);
      return t;
    };
  }
  const intDoc = (t) => ({ cat: '数据类型', syn: t + '(x)', desc: '转换为 ' + t + ' 类型（四舍五入并饱和）' });
  def('double', convertTo('double'), { cat: '数据类型', syn: 'double(x)', desc: '转换为双精度' });
  def('single', convertTo('single'), { cat: '数据类型', syn: 'single(x)', desc: '转换为单精度' });
  def('logical', convertTo('logical'), { cat: '数据类型', syn: 'logical(x)', desc: '转换为逻辑值' });
  for (const t of ['int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64']) def(t, convertTo(t), intDoc(t));
  def('cast', (a) => convertTo(H.str(a[1]))([a[0]]), { cat: '数据类型', syn: "cast(x,'int8')", desc: '类型转换' });

  const cls = (v) => T.classOf(v);
  def('class', (a) => T.str(a[0] && a[0].isException ? 'MException' : cls(a[0])), { cat: '数据类型', syn: 'class(x)', desc: '返回变量的类名' });
  def('isa', (a) => {
    const c = cls(a[0]), want = H.str(a[1]);
    if (want === 'numeric') return T.bool(a[0] instanceof Tensor && a[0].type !== 'char' && a[0].type !== 'logical');
    if (want === 'float') return T.bool(c === 'double' || c === 'single');
    if (want === 'integer') return T.bool(isIntType(c));
    return T.bool(c === want);
  }, { cat: '数据类型', syn: "isa(x,'double')", desc: '判断是否属于指定类' });
  const isNumeric = (v) => v instanceof Tensor && v.type !== 'char' && v.type !== 'logical';
  def('isnumeric', (a) => T.bool(isNumeric(a[0])), { cat: '数据类型', syn: 'isnumeric(x)', desc: '是否为数值数组' });
  def('isfloat', (a) => T.bool(a[0] instanceof Tensor && (a[0].type === 'double' || a[0].type === 'single')), { cat: '数据类型', syn: 'isfloat(x)', desc: '是否为浮点数组' });
  def('isinteger', (a) => T.bool(a[0] instanceof Tensor && isIntType(a[0].type)), { cat: '数据类型', syn: 'isinteger(x)', desc: '是否为整数类型' });
  def('islogical isbool', (a) => T.bool(a[0] instanceof Tensor && a[0].type === 'logical'), { cat: '数据类型', syn: 'islogical(x)', desc: '是否为逻辑数组' });
  def('ischar', (a) => T.bool(a[0] instanceof Tensor && a[0].type === 'char'), { cat: '数据类型', syn: 'ischar(x)', desc: '是否为字符数组' });
  def('isstring', (a) => T.bool(false), { cat: '数据类型', syn: 'isstring(x)', desc: '是否为字符串数组（本环境字符串均为字符向量）' });
  def('iscell', (a) => T.bool(a[0] instanceof Cell), { cat: '数据类型', syn: 'iscell(x)', desc: '是否为元胞数组' });
  def('isstruct', (a) => T.bool(a[0] instanceof Struct), { cat: '数据类型', syn: 'isstruct(x)', desc: '是否为结构体' });
  def('is_function_handle', (a) => T.bool(a[0] instanceof FuncHandle), { cat: '数据类型', syn: 'is_function_handle(x)', desc: '是否为函数句柄' });
  def('isreal', (a) => T.bool(a[0] instanceof Tensor && !a[0].im), { cat: '数据类型', syn: 'isreal(x)', desc: '是否为实数数组' });
  def('iscellstr', (a) => T.bool(a[0] instanceof Cell && a[0].data.every((x) => T.isStr(x) || (x instanceof Tensor && x.numel === 0))), { cat: '数据类型', syn: 'iscellstr(c)', desc: '是否为字符向量元胞数组' });
})(typeof self !== 'undefined' ? self : globalThis);
