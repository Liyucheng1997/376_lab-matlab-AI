/* MatWeb - 内置函数注册表与通用辅助函数 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle } = T;
  const err = ML.err;

  ML.builtins = Object.create(null);
  ML.docs = Object.create(null);

  // def('sin', fn, {cat, syn, desc})；names 可以用空格分隔多个别名
  ML.def = function (names, fn, doc) {
    for (const n of names.split(/\s+/)) {
      if (!n) continue;
      ML.builtins[n] = fn;
      if (doc) ML.docs[n] = doc;
    }
  };

  const H = {};
  H.nargchk = function (args, min, max, name) {
    if (args.length < min) err('输入参数太少。' + (name ? '（' + name + ' 至少需要 ' + min + ' 个输入）' : ''), 'MATLAB:narginchk:notEnoughInputs');
    if (max !== undefined && args.length > max) err('输入参数太多。' + (name ? '（' + name + ' 最多接受 ' + max + ' 个输入）' : ''), 'MATLAB:TooManyInputs');
  };
  H.num = (v, what) => T.toNum(v, what);
  H.int = (v, what) => T.toInt(v, what);
  H.str = (v, what) => T.toStr(v, what);
  H.isStr = T.isStr;
  H.tensor = (v, what) => T.toTensor(v, what);
  H.S = T.scalar;
  H.B = T.bool;
  H.Str = T.str;
  H.isNum = (v) => v instanceof Tensor && v.type !== 'char';

  // 对实数逐元素映射
  H.map = function (v, f, type) {
    v = T.toTensor(v);
    const t = new Tensor(v.rows, v.cols, null, null, type || 'double');
    const re = v.re, o = t.re;
    for (let k = 0; k < re.length; k++) o[k] = f(re[k]);
    return t;
  };
  // 支持复数的逐元素映射：fr(x) 实数；fc(re, im, out) 复数；needC(x) 实数输入是否需要复数结果
  H.mapC = function (v, fr, fc, needC) {
    v = T.toTensor(v);
    const n = v.numel;
    let cplx = !!v.im;
    if (!cplx && needC) for (let k = 0; k < n; k++) if (needC(v.re[k])) { cplx = true; break; }
    const outType = (v.type === 'single') ? 'single' : 'double';
    const t = new Tensor(v.rows, v.cols, null, null, outType);
    if (!cplx) {
      for (let k = 0; k < n; k++) t.re[k] = fr(v.re[k]);
      return t;
    }
    if (!fc) err('该函数不支持复数输入。');
    t.im = new Float64Array(n);
    const o = [0, 0];
    for (let k = 0; k < n; k++) { fc(v.re[k], v.im ? v.im[k] : 0, o); t.re[k] = o[0]; t.im[k] = o[1]; }
    return t.trim();
  };

  // 获取维度参数：默认第一个非单一维度
  H.defaultDim = (v) => (v.rows !== 1 ? 1 : 2);
  H.getDim = function (args, i, v) {
    if (args.length > i && !(args[i] instanceof Tensor && args[i].numel === 0)) {
      if (T.isStr(args[i])) return null;
      const d = T.toInt(args[i], '维度');
      if (d < 1) err('维度参数必须为正整数。');
      return d;
    }
    return H.defaultDim(v);
  };
  // 沿维度归约：f(arr) -> number
  H.reduce = function (v, dim, f, type) {
    v = T.toTensor(v);
    const R = v.rows, C = v.cols;
    if (dim === 1) {
      const t = new Tensor(R === 0 && C === 0 ? 1 : 1, C, null, null, type || 'double');
      if (R === 0 && C === 0) { const t0 = new Tensor(1, 1, null, null, type || 'double'); t0.re[0] = f([]); return t0; }
      const col = new Array(R);
      for (let c = 0; c < C; c++) { for (let r = 0; r < R; r++) col[r] = v.re[r + c * R]; t.re[c] = f(col); }
      return t;
    }
    if (dim === 2) {
      const t = new Tensor(R, 1, null, null, type || 'double');
      const row = new Array(C);
      for (let r = 0; r < R; r++) { for (let c = 0; c < C; c++) row[c] = v.re[r + c * R]; t.re[r] = f(row); }
      return t;
    }
    // dim >= 3：逐元素
    const t = new Tensor(R, C, null, null, type || 'double');
    for (let k = 0; k < v.numel; k++) t.re[k] = f([v.re[k]]);
    return t;
  };
  // 沿维度变换（输出同尺寸）：f(arr) -> arr
  H.transform = function (v, dim, f, type) {
    v = T.toTensor(v);
    const R = v.rows, C = v.cols;
    const t = new Tensor(R, C, null, null, type || 'double');
    if (dim === 1) {
      const col = new Array(R);
      for (let c = 0; c < C; c++) { for (let r = 0; r < R; r++) col[r] = v.re[r + c * R]; const o = f(col); for (let r = 0; r < R; r++) t.re[r + c * R] = o[r]; }
    } else if (dim === 2) {
      const row = new Array(C);
      for (let r = 0; r < R; r++) { for (let c = 0; c < C; c++) row[c] = v.re[r + c * R]; const o = f(row); for (let c = 0; c < C; c++) t.re[r + c * R] = o[c]; }
    } else { for (let k = 0; k < v.numel; k++) t.re[k] = f([v.re[k]])[0]; }
    return t;
  };
  // 解析尺寸参数：zeros(n) / zeros(m,n) / zeros([m n]) / 末尾可选类型名
  H.sizeArgs = function (args, fname) {
    let type = 'double';
    let like = null;
    args = args.slice();
    while (args.length && T.isStr(args[args.length - 1])) {
      const s = args.pop().toStr();
      if (s === 'like') { like = args.pop(); continue; }
      type = s;
    }
    if (args.length >= 2 && T.isStr(args[args.length - 2]) && args[args.length - 2].toStr() === 'like') { like = args.pop(); args.pop(); }
    if (like) type = like.type;
    let r, c;
    if (args.length === 0) { r = 1; c = 1; }
    else if (args.length === 1) {
      const a = T.toTensor(args[0]);
      if (a.numel === 1) { r = c = a.re[0]; }
      else if (a.numel >= 2) { r = a.re[0]; c = a.re[1]; for (let k = 2; k < a.numel; k++) if (a.re[k] !== 1) err((fname || '') + ': 暂不支持三维及以上数组。'); }
      else { r = 0; c = 0; }
    } else {
      r = T.toNum(args[0]); c = T.toNum(args[1]);
      for (let k = 2; k < args.length; k++) if (T.toNum(args[k]) !== 1) err((fname || '') + ': 暂不支持三维及以上数组。');
    }
    if (!Number.isFinite(r) || !Number.isFinite(c)) err('尺寸参数必须为有限值。');
    r = Math.max(0, Math.floor(r)); c = Math.max(0, Math.floor(c));
    if (r * c > 2e8) err('请求的数组大小超出最大限制。');
    return { r, c, type };
  };
  // 名称-值参数解析
  H.nameValue = function (args, start) {
    const o = {};
    for (let i = start; i + 1 < args.length; i += 2) {
      if (!T.isStr(args[i])) break;
      o[args[i].toStr().toLowerCase()] = args[i + 1];
    }
    return o;
  };
  H.toArray = (v) => Array.from(T.toTensor(v).re);
  H.rowVec = (arr) => T.row(arr);
  H.colVec = (arr) => T.col(arr);
  // 与输入方向一致的向量
  H.likeVec = (arr, v) => (v.rows === 1 ? T.row(arr) : T.col(arr));
  H.isVec = (v) => v.rows === 1 || v.cols === 1;
  H.cellOfStrings = function (v, what) {
    if (T.isStr(v)) return [v.toStr()];
    if (v instanceof Cell) return v.data.map((x) => T.toStr(x, what));
    err((what || '参数') + ' 必须为字符向量或字符向量元胞数组。');
  };
  H.cellStr = (arr, rows) => new Cell(rows ? arr.length : 1, rows ? 1 : arr.length, arr.map((s) => T.str(s)));

  ML.H = H;
})(typeof self !== 'undefined' ? self : globalThis);
