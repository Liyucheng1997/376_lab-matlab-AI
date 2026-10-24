/* MatWeb - 数据分析：求和、均值、极值、统计、差分、积分、概率分布 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, isIntType, castValue } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const ops = ML.ops;
  const D = (cat, syn, desc) => ({ cat, syn, desc });

  // 解析归约参数：dim / 'all' / 'omitnan' / 'includenan'
  function rargs(a, v, start) {
    const o = { dim: null, all: false, omitnan: false, nums: [] };
    for (let k = start; k < a.length; k++) {
      const x = a[k];
      if (T.isStr(x)) {
        const s = x.toStr().toLowerCase();
        if (s === 'all') o.all = true;
        else if (s === 'omitnan') o.omitnan = true;
        else if (s === 'includenan' || s === 'double' || s === 'native' || s === 'default') { /* 忽略 */ }
        else err('无法识别的选项 \'' + s + '\'。');
      } else o.nums.push(x);
    }
    return o;
  }
  function dimOf(o, v, idx) {
    const x = o.nums[idx === undefined ? 0 : idx];
    if (x && x.numel) return H.int(x, '维度');
    return v.rows !== 1 ? 1 : 2;
  }
  function flatten(v) { return new Tensor(v.numel, 1, new Float64Array(v.re), v.im ? new Float64Array(v.im) : null, v.type); }

  // 复数感知的归约：fRe(arr) 实部；用于 sum/mean 这种线性运算
  function linearReduce(v, dim, f) {
    const re = H.reduce(new Tensor(v.rows, v.cols, v.re), dim, f);
    if (v.im) { const im = H.reduce(new Tensor(v.rows, v.cols, v.im), dim, f); re.im = im.re; re.trim(); }
    return re;
  }
  const sumArr = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s; };
  const sumOmit = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) if (!Number.isNaN(arr[i])) s += arr[i]; return s; };

  def('sum', (a) => {
    let v = H.tensor(a[0]);
    const o = rargs(a, v, 1);
    if (o.all) v = flatten(v);
    const dim = dimOf(o, v);
    if (v.rows === 0 && v.cols === 0) return T.scalar(0);
    const r = linearReduce(v, dim, o.omitnan ? sumOmit : sumArr);
    if (isIntType(v.type)) { r.type = v.type; for (let k = 0; k < r.re.length; k++) r.re[k] = castValue(v.type, r.re[k]); }
    return r;
  }, D('数据分析', 'sum(A), sum(A,dim), sum(A,\'all\')', '求和'));
  def('prod', (a) => {
    let v = H.tensor(a[0]);
    const o = rargs(a, v, 1);
    if (o.all) v = flatten(v);
    const dim = dimOf(o, v);
    if (v.rows === 0 && v.cols === 0) return T.scalar(1);
    if (v.im) {
      // 复数连乘
      const R = v.rows, Cc = v.cols;
      const outR = dim === 1 ? 1 : R, outC = dim === 1 ? Cc : 1;
      const t = new Tensor(outR, outC); t.im = new Float64Array(outR * outC);
      const o2 = [0, 0];
      for (let p = 0; p < outR * outC; p++) {
        let pr = 1, pi = 0;
        const n = dim === 1 ? R : Cc;
        for (let q = 0; q < n; q++) {
          const k = dim === 1 ? q + p * R : p + q * R;
          ML.C.mul(pr, pi, v.re[k], v.im[k], o2); pr = o2[0]; pi = o2[1];
        }
        t.re[p] = pr; t.im[p] = pi;
      }
      return t.trim();
    }
    return H.reduce(v, dim, (arr) => { let s = 1; for (const x of arr) if (!(o.omitnan && Number.isNaN(x))) s *= x; return s; });
  }, D('数据分析', 'prod(A), prod(A,dim)', '连乘积'));
  function cumOp(a, f0, f) {
    const v = H.tensor(a[0]);
    const o = rargs(a, v, 1);
    const dim = dimOf(o, v);
    const re = H.transform(v, dim, (arr) => { const out = new Array(arr.length); let s = f0; for (let i = 0; i < arr.length; i++) { s = f(s, arr[i]); out[i] = s; } return out; });
    if (v.im && f0 === 0) { const im = H.transform(new Tensor(v.rows, v.cols, v.im), dim, (arr) => { const out = []; let s = 0; for (const x of arr) { s += x; out.push(s); } return out; }); re.im = im.re; re.trim(); }
    return re;
  }
  def('cumsum', (a) => cumOp(a, 0, (s, x) => s + x), D('数据分析', 'cumsum(A), cumsum(A,dim)', '累积和'));
  def('cumprod', (a) => cumOp(a, 1, (s, x) => s * x), D('数据分析', 'cumprod(A)', '累积乘积'));
  def('cummax', (a) => cumOp(a, -Infinity, (s, x) => (x > s ? x : s)), D('数据分析', 'cummax(A)', '累积最大值'));
  def('cummin', (a) => cumOp(a, Infinity, (s, x) => (x < s ? x : s)), D('数据分析', 'cummin(A)', '累积最小值'));

  def('mean', (a) => {
    let v = H.tensor(a[0]);
    const o = rargs(a, v, 1);
    if (o.all) v = flatten(v);
    const dim = dimOf(o, v);
    if (v.numel === 0 && v.rows === 0 && v.cols === 0) return T.scalar(NaN);
    const f = o.omitnan ? (arr) => { let s = 0, n = 0; for (const x of arr) if (!Number.isNaN(x)) { s += x; n++; } return s / n; } : (arr) => sumArr(arr) / arr.length;
    const r = linearReduce(new Tensor(v.rows, v.cols, v.re, v.im), dim, f);
    return r;
  }, D('数据分析', 'mean(A), mean(A,dim), mean(A,\'all\')', '平均值'));
  function medianArr(arr, omit) {
    let x = arr.slice();
    if (omit) x = x.filter((y) => !Number.isNaN(y)); else if (x.some(Number.isNaN)) return NaN;
    if (!x.length) return NaN;
    x.sort((p, q) => p - q);
    const n = x.length, m = n >> 1;
    return n % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
  }
  def('median', (a) => {
    let v = H.tensor(a[0]); const o = rargs(a, v, 1); if (o.all) v = flatten(v);
    if (v.rows === 0 && v.cols === 0) return T.scalar(NaN);
    return H.reduce(v, dimOf(o, v), (arr) => medianArr(arr, o.omitnan));
  }, D('数据分析', 'median(A), median(A,dim)', '中位数'));
  def('mode', (a, nargout) => {
    let v = H.tensor(a[0]); const o = rargs(a, v, 1); if (o.all) v = flatten(v);
    const freq = [];
    const M = H.reduce(v, dimOf(o, v), (arr) => {
      const cnt = new Map(); let best = NaN, bc = 0;
      for (const x of arr) { if (Number.isNaN(x)) continue; const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); }
      for (const [x, c] of cnt) if (c > bc || (c === bc && x < best)) { best = x; bc = c; }
      freq.push(bc);
      return best;
    });
    if (nargout > 1) { const F = new Tensor(M.rows, M.cols, Float64Array.from(freq)); return [M, F]; }
    return M;
  }, D('数据分析', 'mode(A)', '众数（出现次数最多的值）'));
  function varArr(arr, w, omit) {
    let x = omit ? arr.filter((y) => !Number.isNaN(y)) : arr;
    const n = x.length;
    if (n === 0) return NaN;
    if (n === 1) return 0;
    const m = sumArr(x) / n;
    let s = 0; for (const y of x) s += (y - m) * (y - m);
    return s / (w === 1 ? n : n - 1);
  }
  function varFn(a, sq) {
    let v = H.tensor(a[0]); const o = rargs(a, v, 1); if (o.all) v = flatten(v);
    const w = o.nums[0] && o.nums[0].numel ? H.num(o.nums[0]) : 0;
    const dim = dimOf(o, v, 1);
    if (v.im) {
      const absDev = (arrRe, arrIm) => 0;
      void absDev;
    }
    const r = H.reduce(v, dim, (arr) => varArr(arr, w, o.omitnan));
    if (sq) for (let k = 0; k < r.re.length; k++) r.re[k] = Math.sqrt(r.re[k]);
    return r;
  }
  def('var', (a) => varFn(a, false), D('数据分析', 'var(A), var(A,w,dim)', '方差（默认 N-1 归一化）'));
  def('std', (a) => varFn(a, true), D('数据分析', 'std(A), std(A,w,dim)', '标准差（默认 N-1 归一化）'));

  // max / min
  function extremum(a, nargout, isMax) {
    const better = isMax ? (x, y) => x > y : (x, y) => x < y;
    if (a.length >= 2 && !(a[1] instanceof Tensor && a[1].numel === 0 && a[1].rows === 0 && a[1].cols === 0)) {
      // 两个数组逐元素比较
      const x = H.tensor(a[0]), y = H.tensor(a[1]);
      const type = ops.resultType(x, y);
      const f = (p, q) => (Number.isNaN(p) ? q : Number.isNaN(q) ? p : (better(q, p) ? q : p));
      if (x.im || y.im) {
        return ops.elementwise(x, y, null, (ar, ai, br, bi, o) => { const ma = Math.hypot(ar, ai), mb = Math.hypot(br, bi); if (better(mb, ma)) { o[0] = br; o[1] = bi; } else { o[0] = ar; o[1] = ai; } }, 'double');
      }
      return ops.finalize(ops.elementwise(x, y, f, null, type));
    }
    let v = H.tensor(a[0]);
    const o = rargs(a, v, 2);
    if (o.all) v = flatten(v);
    const dim = o.nums.length ? H.int(o.nums[0], '维度') : (v.rows !== 1 ? 1 : 2);
    if (v.numel === 0) return [new Tensor(0, 0), new Tensor(0, 0)];
    const R = v.rows, Cc = v.cols;
    const outR = dim === 1 ? 1 : R, outC = dim === 1 ? Cc : (dim === 2 ? 1 : Cc);
    if (dim > 2) return [v, H.map(v, () => 1)];
    const M = new Tensor(outR, outC, null, v.im ? new Float64Array(outR * outC) : null, v.type === 'logical' || v.type === 'char' ? 'double' : v.type);
    const I = new Tensor(outR, outC);
    const n = dim === 1 ? R : Cc;
    for (let p = 0; p < outR * outC; p++) {
      let bestK = -1, bestV = NaN;
      for (let q = 0; q < n; q++) {
        const k = dim === 1 ? q + p * R : p + q * R;
        const val = v.im ? Math.hypot(v.re[k], v.im[k]) : v.re[k];
        if (Number.isNaN(val)) continue;
        if (bestK < 0 || better(val, bestV)) { bestK = k; bestV = val; }
      }
      if (bestK < 0) { bestK = dim === 1 ? p * R : p; }
      M.re[p] = v.re[bestK]; if (v.im) M.im[p] = v.im[bestK];
      I.re[p] = (dim === 1 ? bestK - p * R : Math.floor((bestK - p) / R)) + 1;
    }
    if (M.im) M.trim();
    return [M, I];
  }
  def('max', (a, n) => extremum(a, n, true), D('数据分析', 'max(A), [M,I] = max(A), max(A,[],dim), max(A,B)', '最大值'));
  def('min', (a, n) => extremum(a, n, false), D('数据分析', 'min(A), [M,I] = min(A), min(A,[],dim), min(A,B)', '最小值'));
  def('bounds', (a) => { const v = H.tensor(a[0]); return [extremum([v, new Tensor(0, 0), T.str('all')], 1, false)[0], extremum([v, new Tensor(0, 0), T.str('all')], 1, true)[0]]; }, D('数据分析', '[lo,hi] = bounds(A)', '最小值和最大值'));
  def('range', (a) => {
    const v = H.tensor(a[0]);
    const dim = a.length > 1 ? H.int(a[1]) : (v.rows !== 1 ? 1 : 2);
    return H.reduce(v, dim, (arr) => Math.max(...arr) - Math.min(...arr));
  }, D('数据分析', 'range(A)', '极差（最大值 - 最小值）'));

  def('any', (a) => {
    let v = H.tensor(a[0]); const o = rargs(a, v, 1); if (o.all) v = flatten(v);
    if (v.rows === 0 && v.cols === 0) return T.bool(false);
    return H.reduce(v, dimOf(o, v), (arr) => (arr.some((x) => x !== 0 && !Number.isNaN(x)) ? 1 : 0), 'logical');
  }, D('逻辑运算', 'any(A), any(A,dim)', '是否有非零元素'));
  def('all', (a) => {
    let v = H.tensor(a[0]); const o = rargs(a, v, 1); if (o.all) v = flatten(v);
    if (v.rows === 0 && v.cols === 0) return T.bool(true);
    return H.reduce(v, dimOf(o, v), (arr) => (arr.every((x) => x !== 0) ? 1 : 0), 'logical');
  }, D('逻辑运算', 'all(A), all(A,dim)', '是否全部非零'));

  // ---------- 差分与数值积分 ----------
  def('diff', (a) => {
    let v = H.tensor(a[0]);
    const n = a.length > 1 && a[1].numel ? H.int(a[1]) : 1;
    let dim = a.length > 2 ? H.int(a[2]) : (v.rows !== 1 ? 1 : 2);
    for (let it = 0; it < n; it++) {
      const R = v.rows, Cc = v.cols;
      if (dim === 1) {
        if (R <= 1) { v = new Tensor(0, Cc); break; }
        const t = new Tensor(R - 1, Cc, null, v.im ? new Float64Array((R - 1) * Cc) : null);
        for (let c = 0; c < Cc; c++) for (let r = 0; r < R - 1; r++) { t.re[r + c * (R - 1)] = v.re[r + 1 + c * R] - v.re[r + c * R]; if (v.im) t.im[r + c * (R - 1)] = v.im[r + 1 + c * R] - v.im[r + c * R]; }
        v = t;
      } else {
        if (Cc <= 1) { v = new Tensor(R, 0); break; }
        const t = new Tensor(R, Cc - 1, null, v.im ? new Float64Array(R * (Cc - 1)) : null);
        for (let c = 0; c < Cc - 1; c++) for (let r = 0; r < R; r++) { t.re[r + c * R] = v.re[r + (c + 1) * R] - v.re[r + c * R]; if (v.im) t.im[r + c * R] = v.im[r + (c + 1) * R] - v.im[r + c * R]; }
        v = t;
      }
    }
    return v;
  }, D('数据分析', 'diff(X), diff(X,n)', '差分（相邻元素之差）'));
  function trapzCore(x, y) { let s = 0; for (let i = 1; i < y.length; i++) s += (x ? x[i] - x[i - 1] : 1) * (y[i] + y[i - 1]) / 2; return s; }
  def('trapz', (a) => {
    let X = null, Y;
    if (a.length === 1) Y = H.tensor(a[0]);
    else if (a.length >= 2 && a[1].numel === 1 && a[0].numel > 1) Y = H.tensor(a[0]);
    else { X = H.toArray(a[0]); Y = H.tensor(a[1]); if (X.length === 1) { const h = X[0]; X = null; return H.reduce(Y, Y.rows !== 1 ? 1 : 2, (arr) => h * trapzCore(null, arr)); } }
    const dim = Y.rows !== 1 ? 1 : 2;
    return H.reduce(Y, dim, (arr) => trapzCore(X, arr));
  }, D('微积分', 'trapz(Y), trapz(X,Y)', '梯形法数值积分'));
  def('cumtrapz', (a) => {
    let X = null, Y;
    if (a.length === 1) Y = H.tensor(a[0]); else { X = H.toArray(a[0]); Y = H.tensor(a[1]); }
    const dim = Y.rows !== 1 ? 1 : 2;
    return H.transform(Y, dim, (arr) => { const out = [0]; let s = 0; for (let i = 1; i < arr.length; i++) { s += (X ? X[i] - X[i - 1] : 1) * (arr[i] + arr[i - 1]) / 2; out.push(s); } return out; });
  }, D('微积分', 'cumtrapz(X,Y)', '累积梯形积分'));
  def('gradient', (a, nargout) => {
    const F = H.tensor(a[0]);
    const hx = a.length > 1 ? H.toArray(a[1]) : [1];
    const hy = a.length > 2 ? H.toArray(a[2]) : hx;
    const grad1 = (arr, h) => {
      const n = arr.length, out = new Array(n);
      const xs = h.length === n ? h : null, s = h.length === 1 ? h[0] : 1;
      if (n === 1) return [0];
      for (let i = 0; i < n; i++) {
        if (i === 0) out[i] = (arr[1] - arr[0]) / (xs ? xs[1] - xs[0] : s);
        else if (i === n - 1) out[i] = (arr[n - 1] - arr[n - 2]) / (xs ? xs[n - 1] - xs[n - 2] : s);
        else out[i] = (arr[i + 1] - arr[i - 1]) / (xs ? xs[i + 1] - xs[i - 1] : 2 * s);
      }
      return out;
    };
    if (F.rows === 1 || F.cols === 1) return H.transform(F, F.rows === 1 ? 2 : 1, (arr) => grad1(arr, hx));
    const Fx = H.transform(F, 2, (arr) => grad1(arr, hx));
    const Fy = H.transform(F, 1, (arr) => grad1(arr, hy));
    return [Fx, Fy];
  }, D('微积分', '[Fx,Fy] = gradient(F,h)', '数值梯度'));
  def('del2', (a) => {
    const F = H.tensor(a[0]);
    const d2 = (arr) => { const n = arr.length, o = new Array(n).fill(0); if (n < 3) return o; for (let i = 1; i < n - 1; i++) o[i] = arr[i - 1] - 2 * arr[i] + arr[i + 1]; o[0] = 2 * o[1] - o[2]; o[n - 1] = 2 * o[n - 2] - o[n - 3]; return o; };
    if (F.rows === 1 || F.cols === 1) return H.map(H.transform(F, F.rows === 1 ? 2 : 1, d2), (x) => x / 4);
    const A = H.transform(F, 1, d2), B = H.transform(F, 2, d2);
    return H.map(ops.plus(A, B), (x) => x / 4);
  }, D('微积分', 'del2(F)', '离散拉普拉斯算子'));

  // ---------- 向量运算 ----------
  def('dot', (a) => {
    const x = H.tensor(a[0]), y = H.tensor(a[1]);
    if (x.numel !== y.numel) err('dot: 向量长度必须相同。');
    if (H.isVec(x) && H.isVec(y)) {
      const p = ops.times(ML.builtins.conj([x]), y);
      return ML.builtins.sum([new Tensor(p.numel, 1, p.re, p.im)]);
    }
    return ML.builtins.sum([ops.times(ML.builtins.conj([x]), y)]);
  }, D('线性代数', 'dot(a,b)', '向量点积'));
  def('cross', (a) => {
    const x = H.tensor(a[0]), y = H.tensor(a[1]);
    if (x.numel !== 3 || y.numel !== 3) err('cross: 输入必须为三维向量。');
    const p = x.re, q = y.re;
    return H.likeVec([p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]], x);
  }, D('线性代数', 'cross(a,b)', '向量叉积'));

  // ---------- 统计 ----------
  function covMatrix(X) {
    const n = X.rows, p = X.cols;
    const means = []; for (let j = 0; j < p; j++) { let s = 0; for (let i = 0; i < n; i++) s += X.re[i + j * n]; means.push(s / n); }
    const Cv = new Tensor(p, p);
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) {
      let s = 0; for (let i = 0; i < n; i++) s += (X.re[i + a * n] - means[a]) * (X.re[i + b * n] - means[b]);
      const v = s / (n - 1); Cv.re[a + b * p] = v; Cv.re[b + a * p] = v;
    }
    return Cv;
  }
  function asColumns(a) {
    let X = H.tensor(a[0]);
    if (X.rows === 1) X = ops.transpose(X);
    if (a.length > 1 && a[1] instanceof Tensor && a[1].numel > 1) {
      let Y = H.tensor(a[1]); if (Y.rows === 1) Y = ops.transpose(Y);
      X = ML.idx.horzcat([new Tensor(X.numel, 1, X.re), new Tensor(Y.numel, 1, Y.re)]);
    }
    return X;
  }
  def('cov', (a) => { const X = asColumns(a); if (X.cols === 1) return T.scalar(varArr(Array.from(X.re), 0)); return covMatrix(X); }, D('统计', 'cov(X), cov(x,y)', '协方差（矩阵）'));
  def('corrcoef corr', (a) => {
    const X = asColumns(a); const Cv = covMatrix(X); const p = Cv.rows;
    const R = new Tensor(p, p);
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) R.re[i + j * p] = Cv.re[i + j * p] / Math.sqrt(Cv.re[i + i * p] * Cv.re[j + j * p]);
    for (let i = 0; i < p; i++) R.re[i + i * p] = 1;
    return R;
  }, D('统计', 'corrcoef(X), corrcoef(x,y)', '相关系数矩阵'));
  function quantileArr(sorted, p) {
    const n = sorted.length;
    if (n === 0) return NaN;
    const pos = p * n - 0.5;
    if (pos <= 0) return sorted[0];
    if (pos >= n - 1) return sorted[n - 1];
    const lo = Math.floor(pos), f = pos - lo;
    return sorted[lo] + f * (sorted[lo + 1] - sorted[lo]);
  }
  function quantFn(a, scale) {
    const v = H.tensor(a[0]); const ps = H.toArray(a[1]).map((p) => p / scale);
    const dim = a.length > 2 ? H.int(a[2]) : (v.rows !== 1 ? 1 : 2);
    if (H.isVec(v)) {
      const s = Array.from(v.re).filter((x) => !Number.isNaN(x)).sort((x, y) => x - y);
      const out = ps.map((p) => quantileArr(s, p));
      return a[1].rows === 1 ? T.row(out) : T.col(out);
    }
    if (ps.length === 1) return H.reduce(v, dim, (arr) => quantileArr(arr.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y), ps[0]));
    const res = ps.map((p) => H.reduce(v, dim, (arr) => quantileArr(arr.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y), p)));
    return dim === 1 ? ML.idx.vertcat(res) : ML.idx.horzcat(res);
  }
  def('prctile', (a) => quantFn(a, 100), D('统计', 'prctile(X,p)', '百分位数'));
  def('quantile', (a) => quantFn(a, 1), D('统计', 'quantile(X,p)', '分位数'));
  def('iqr', (a) => { const q = quantFn([a[0], T.row([0.25, 0.75])], 1); return ops.minus(ML.idx.indexParen(q, [T.scalar(2)]), ML.idx.indexParen(q, [T.scalar(1)])); }, D('统计', 'iqr(X)', '四分位距'));
  function moment(arr, k) { const n = arr.length, m = sumArr(arr) / n; let s = 0; for (const x of arr) s += Math.pow(x - m, k); return s / n; }
  def('skewness', (a) => { const v = H.tensor(a[0]); return H.reduce(v, v.rows !== 1 ? 1 : 2, (arr) => moment(arr, 3) / Math.pow(moment(arr, 2), 1.5)); }, D('统计', 'skewness(X)', '偏度'));
  def('kurtosis', (a) => { const v = H.tensor(a[0]); return H.reduce(v, v.rows !== 1 ? 1 : 2, (arr) => moment(arr, 4) / Math.pow(moment(arr, 2), 2)); }, D('统计', 'kurtosis(X)', '峰度'));
  def('zscore', (a) => {
    const v = H.tensor(a[0]); const dim = v.rows !== 1 ? 1 : 2;
    return H.transform(v, dim, (arr) => { const m = sumArr(arr) / arr.length; const s = Math.sqrt(varArr(arr, 0)); return arr.map((x) => (s === 0 ? 0 : (x - m) / s)); });
  }, D('统计', 'zscore(X)', '标准化 z 分数'));
  def('normalize', (a) => ML.builtins.zscore(a), D('统计', 'normalize(X)', '标准化（z 分数）'));
  def('rescale', (a) => {
    const v = H.tensor(a[0]); const lo = a.length > 1 ? H.num(a[1]) : 0, hi = a.length > 2 ? H.num(a[2]) : 1;
    let mn = Infinity, mx = -Infinity; for (const x of v.re) { if (x < mn) mn = x; if (x > mx) mx = x; }
    return H.map(v, (x) => (mx === mn ? lo : lo + (x - mn) / (mx - mn) * (hi - lo)));
  }, D('统计', 'rescale(X,l,u)', '缩放到区间 [l,u]'));
  function movFn(a, f) {
    const v = H.tensor(a[0]); const kv = H.toArray(a[1]);
    let kb, kf; if (kv.length === 2) { kb = kv[0]; kf = kv[1]; } else { const k = kv[0]; kb = Math.floor(k / 2); kf = k % 2 ? kb : kb - 1; }
    return H.transform(v, v.rows !== 1 ? 1 : 2, (arr) => arr.map((x, i) => f(arr.slice(Math.max(0, i - kb), Math.min(arr.length, i + kf + 1)))));
  }
  def('movmean', (a) => movFn(a, (w) => sumArr(w) / w.length), D('统计', 'movmean(A,k)', '移动平均'));
  def('movsum', (a) => movFn(a, sumArr), D('统计', 'movsum(A,k)', '移动求和'));
  def('movmax', (a) => movFn(a, (w) => Math.max(...w)), D('统计', 'movmax(A,k)', '移动最大值'));
  def('movmin', (a) => movFn(a, (w) => Math.min(...w)), D('统计', 'movmin(A,k)', '移动最小值'));
  def('movmedian', (a) => movFn(a, (w) => medianArr(w)), D('统计', 'movmedian(A,k)', '移动中位数'));

  // ---------- 直方图计数 ----------
  function niceBinWidth(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return nice * p;
  }
  function autoEdges(vals, nbins) {
    const x = vals.filter(Number.isFinite);
    if (!x.length) return [0, 1];
    let mn = Math.min(...x), mx = Math.max(...x);
    if (nbins) {
      if (mn === mx) { mn -= 0.5; mx += 0.5; }
      const e = []; for (let i = 0; i <= nbins; i++) e.push(mn + (mx - mn) * i / nbins); return e;
    }
    if (mn === mx) return [mn - 0.5, mn + 0.5];
    const n = x.length, m = sumArr(x) / n;
    let s = 0; for (const y of x) s += (y - m) * (y - m);
    const sd = Math.sqrt(s / Math.max(n - 1, 1));
    let w = 3.5 * sd * Math.pow(n, -1 / 3);
    if (!(w > 0)) w = (mx - mn) / 10;
    w = niceBinWidth(w);
    if ((mx - mn) / w > 100) w = niceBinWidth((mx - mn) / 100);
    const lo = Math.floor(mn / w) * w, hi = Math.ceil(mx / w) * w;
    const e = []; for (let v = lo; v <= hi + w * 1e-9; v += w) e.push(+v.toPrecision(12));
    if (e.length < 2) e.push(e[0] + w);
    if (e[e.length - 1] < mx) e.push(e[e.length - 1] + w);
    return e;
  }
  function countBins(vals, edges) {
    const N = new Array(edges.length - 1).fill(0);
    for (const v of vals) {
      if (!Number.isFinite(v)) continue;
      if (v < edges[0] || v > edges[edges.length - 1]) continue;
      let lo = 0, hi = edges.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (v >= edges[mid]) lo = mid; else hi = mid; }
      N[Math.min(lo, N.length - 1)]++;
    }
    return N;
  }
  ML.hist = { autoEdges, countBins };
  def('histcounts', (a) => {
    const vals = H.toArray(a[0]);
    let edges;
    if (a.length > 1 && !T.isStr(a[1])) { const b = H.toArray(a[1]); edges = b.length === 1 ? autoEdges(vals, b[0]) : b; }
    else edges = autoEdges(vals);
    const nv = H.nameValue(a, 1);
    if (nv.binwidth) { const w = H.num(nv.binwidth); const mn = Math.min(...vals), mx = Math.max(...vals); edges = []; for (let v = Math.floor(mn / w) * w; v <= mx + w; v += w) { edges.push(v); if (v > mx) break; } }
    let N = countBins(vals, edges);
    if (nv.normalization) {
      const m = H.str(nv.normalization).toLowerCase(); const tot = vals.length;
      if (m === 'probability') N = N.map((x) => x / tot);
      else if (m === 'pdf') N = N.map((x, i) => x / tot / (edges[i + 1] - edges[i]));
      else if (m === 'cdf') { let s = 0; N = N.map((x) => (s += x) / tot); }
    }
    return [T.row(N), T.row(edges)];
  }, D('统计', '[N,edges] = histcounts(X,nbins)', '直方图计数'));
  def('histc', (a) => {
    const vals = H.toArray(a[0]); const edges = H.toArray(a[1]);
    const N = new Array(edges.length).fill(0);
    for (const v of vals) { if (v === edges[edges.length - 1]) { N[edges.length - 1]++; continue; } for (let i = 0; i < edges.length - 1; i++) if (v >= edges[i] && v < edges[i + 1]) { N[i]++; break; } }
    return H.likeVec(N, a[0]);
  }, D('统计', 'histc(X,edges)', '直方图计数（旧版）'));

  // ---------- 概率分布 ----------
  const SP = () => ML.special;
  function distFn(name, f, nparams, defaults, doc) {
    def(name, (a) => {
      const X = H.tensor(a[0]);
      const ps = [];
      for (let i = 0; i < nparams; i++) ps.push(a.length > i + 1 ? H.tensor(a[i + 1]) : T.scalar(defaults[i]));
      let r = X;
      // 广播：依次与参数组合
      let n = Math.max(X.numel, ...ps.map((p) => p.numel));
      const shape = [X, ...ps].find((t) => t.numel === n);
      const t = new Tensor(shape.rows, shape.cols);
      for (let k = 0; k < n; k++) {
        const x = X.numel === 1 ? X.re[0] : X.re[k];
        const pv = ps.map((p) => (p.numel === 1 ? p.re[0] : p.re[k]));
        t.re[k] = f(x, ...pv);
      }
      void r;
      return t;
    }, doc);
  }
  const SQ2PI = Math.sqrt(2 * Math.PI);
  distFn('normpdf', (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * SQ2PI), 2, [0, 1], D('概率分布', 'normpdf(x,mu,sigma)', '正态分布概率密度'));
  distFn('normcdf', (x, mu, s) => 0.5 * SP().erfc(-(x - mu) / (s * Math.SQRT2)), 2, [0, 1], D('概率分布', 'normcdf(x,mu,sigma)', '正态分布累积分布函数'));
  distFn('norminv', (p, mu, s) => mu - s * Math.SQRT2 * SP().erfinv(1 - 2 * p) * 1, 2, [0, 1], D('概率分布', 'norminv(p,mu,sigma)', '正态分布逆累积分布函数'));
  distFn('unifpdf', (x, a, b) => (x >= a && x <= b ? 1 / (b - a) : 0), 2, [0, 1], D('概率分布', 'unifpdf(x,a,b)', '均匀分布概率密度'));
  distFn('unifcdf', (x, a, b) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)), 2, [0, 1], D('概率分布', 'unifcdf(x,a,b)', '均匀分布累积分布'));
  distFn('exppdf', (x, mu) => (x < 0 ? 0 : Math.exp(-x / mu) / mu), 1, [1], D('概率分布', 'exppdf(x,mu)', '指数分布概率密度'));
  distFn('expcdf', (x, mu) => (x < 0 ? 0 : 1 - Math.exp(-x / mu)), 1, [1], D('概率分布', 'expcdf(x,mu)', '指数分布累积分布'));
  const binom = (n, k) => Math.exp(SP().gammaln(n + 1) - SP().gammaln(k + 1) - SP().gammaln(n - k + 1));
  distFn('binopdf', (k, n, p) => (k < 0 || k > n || !Number.isInteger(k) ? 0 : binom(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k)), 2, [1, 0.5], D('概率分布', 'binopdf(k,n,p)', '二项分布概率'));
  distFn('binocdf', (k, n, p) => { let s = 0; for (let i = 0; i <= Math.floor(k) && i <= n; i++) s += binom(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i); return Math.min(s, 1); }, 2, [1, 0.5], D('概率分布', 'binocdf(k,n,p)', '二项分布累积概率'));
  distFn('poisspdf', (k, l) => (k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(l) - l - SP().gammaln(k + 1))), 1, [1], D('概率分布', 'poisspdf(k,lambda)', '泊松分布概率'));
  distFn('poisscdf', (k, l) => { let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += Math.exp(i * Math.log(l) - l - SP().gammaln(i + 1)); return Math.min(s, 1); }, 1, [1], D('概率分布', 'poisscdf(k,lambda)', '泊松分布累积概率'));
  distFn('tpdf', (x, v) => Math.exp(SP().gammaln((v + 1) / 2) - SP().gammaln(v / 2)) / Math.sqrt(v * Math.PI) * Math.pow(1 + x * x / v, -(v + 1) / 2), 1, [1], D('概率分布', 'tpdf(x,v)', 't 分布概率密度'));
  distFn('tcdf', (x, v) => { const ib = SP().betainc(v / (v + x * x), v / 2, 0.5); return x >= 0 ? 1 - 0.5 * ib : 0.5 * ib; }, 1, [1], D('概率分布', 'tcdf(x,v)', 't 分布累积分布'));
  distFn('chi2pdf', (x, k) => (x < 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - SP().gammaln(k / 2))), 1, [1], D('概率分布', 'chi2pdf(x,k)', '卡方分布概率密度'));
  distFn('chi2cdf', (x, k) => (x <= 0 ? 0 : SP().gammainc(x / 2, k / 2)), 1, [1], D('概率分布', 'chi2cdf(x,k)', '卡方分布累积分布'));
  distFn('gampdf', (x, k, th) => (x < 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / th - SP().gammaln(k) - k * Math.log(th))), 2, [1, 1], D('概率分布', 'gampdf(x,a,b)', '伽马分布概率密度'));
  distFn('fpdf', (x, d1, d2) => (x < 0 ? 0 : Math.sqrt(Math.pow(d1 * x, d1) * Math.pow(d2, d2) / Math.pow(d1 * x + d2, d1 + d2)) / (x * SP().beta(d1 / 2, d2 / 2))), 2, [1, 1], D('概率分布', 'fpdf(x,d1,d2)', 'F 分布概率密度'));
})(typeof self !== 'undefined' ? self : globalThis);
