/* MatWeb - 运算符：逐元素运算（含隐式扩展）、矩阵乘法、比较、逻辑 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const { Tensor, Cell, Struct, FuncHandle, isIntType, castValue, classOf } = ML.types;
  const err = ML.err;

  // ---------- 复数基础运算 ----------
  const C = {
    mul(ar, ai, br, bi, o) { o[0] = ar * br - ai * bi; o[1] = ar * bi + ai * br; },
    div(ar, ai, br, bi, o) {
      if (bi === 0) { o[0] = ar / br; o[1] = ai / br; return; }
      if (Math.abs(br) >= Math.abs(bi)) {
        const r = bi / br, d = br + bi * r;
        o[0] = (ar + ai * r) / d; o[1] = (ai - ar * r) / d;
      } else {
        const r = br / bi, d = br * r + bi;
        o[0] = (ar * r + ai) / d; o[1] = (ai * r - ar) / d;
      }
    },
    abs(re, im) { return Math.hypot(re, im); },
    exp(re, im, o) { const e = Math.exp(re); if (im === 0) { o[0] = e; o[1] = 0; return; } o[0] = e * Math.cos(im); o[1] = e * Math.sin(im); },
    log(re, im, o) { o[0] = Math.log(Math.hypot(re, im)); o[1] = Math.atan2(im, re); },
    sqrt(re, im, o) {
      if (im === 0) {
        if (re >= 0) { o[0] = Math.sqrt(re); o[1] = 0; } else { o[0] = 0; o[1] = Math.sqrt(-re); }
        return;
      }
      const m = Math.hypot(re, im);
      let a = Math.sqrt((m + Math.abs(re)) / 2);
      if (re >= 0) { o[0] = a; o[1] = im / (2 * a); } else { o[0] = Math.abs(im) / (2 * a); o[1] = im < 0 ? -a : a; }
    },
    pow(ar, ai, br, bi, o) {
      if (ar === 0 && ai === 0) {
        if (br === 0 && bi === 0) { o[0] = 1; o[1] = 0; } else if (br > 0) { o[0] = 0; o[1] = 0; } else { o[0] = Infinity; o[1] = 0; }
        return;
      }
      // 整数次幂的精确处理
      if (bi === 0 && Number.isInteger(br) && Math.abs(br) <= 64) {
        let rr = 1, ri = 0, xr = ar, xi = ai, n = Math.abs(br);
        while (n > 0) {
          if (n & 1) { const t = rr * xr - ri * xi; ri = rr * xi + ri * xr; rr = t; }
          const t2 = xr * xr - xi * xi; xi = 2 * xr * xi; xr = t2;
          n >>= 1;
        }
        if (br < 0) { C.div(1, 0, rr, ri, o); } else { o[0] = rr; o[1] = ri; }
        return;
      }
      const lr = Math.log(Math.hypot(ar, ai)), li = Math.atan2(ai, ar);
      const er = br * lr - bi * li, ei = br * li + bi * lr;
      C.exp(er, ei, o);
    }
  };

  // ---------- 类型规则 ----------
  function numericOperand(v, opname) {
    if (v instanceof Tensor) return v;
    if (v instanceof Cell) err('未定义与 \'cell\' 类型的输入参数相对应的运算符 \'' + opname + '\'。');
    if (v instanceof Struct) err('未定义与 \'struct\' 类型的输入参数相对应的运算符 \'' + opname + '\'。');
    if (v instanceof FuncHandle) err('未定义与 \'function_handle\' 类型的输入参数相对应的运算符 \'' + opname + '\'。');
    err('无效的运算数。');
  }
  function resultType(a, b) {
    const ta = a.type, tb = b.type;
    const ia = isIntType(ta), ib = isIntType(tb);
    if (ia && ib && ta !== tb) err('整数只能与同类整数或双精度标量值组合使用。');
    if (ia) return ta;
    if (ib) return tb;
    if (ta === 'single' || tb === 'single') return 'single';
    return 'double';
  }
  function finalize(t) {
    if (t.type !== 'double' && t.type !== 'logical' && t.type !== 'char') {
      const re = t.re;
      for (let k = 0; k < re.length; k++) re[k] = castValue(t.type, re[k]);
      if (t.im && isIntType(t.type)) err('整数类型不支持复数。');
    }
    return t.trim();
  }

  function broadcastDims(a, b) {
    const r = a.rows === b.rows ? a.rows : (a.rows === 1 ? b.rows : (b.rows === 1 ? a.rows : -1));
    const c = a.cols === b.cols ? a.cols : (a.cols === 1 ? b.cols : (b.cols === 1 ? a.cols : -1));
    if (r < 0 || c < 0) err('矩阵维度必须一致。（' + a.rows + '×' + a.cols + ' 与 ' + b.rows + '×' + b.cols + '）');
    return [r, c];
  }

  // 通用逐元素二元运算
  // fr(x,y) -> number（实数路径）；fc(ar,ai,br,bi,out)（复数路径）；needC(x,y) -> 实数输入是否需要复数结果
  function elementwise(a, b, fr, fc, type, needC) {
    const [R, Cc] = broadcastDims(a, b);
    const n = R * Cc;
    let complex = !!(a.im || b.im);
    const ar = a.re, br = b.re;
    const sameShape = a.rows === b.rows && a.cols === b.cols;
    const aS = a.numel === 1, bS = b.numel === 1;
    if (!complex && needC) {
      // 检测是否需要复数（例如负数的分数次幂）
      if (sameShape) { for (let k = 0; k < n; k++) if (needC(ar[k], br[k])) { complex = true; break; } } else {
        outer: for (let c = 0; c < Cc; c++) for (let r = 0; r < R; r++) {
          const ia = (a.rows === 1 ? 0 : r) + (a.cols === 1 ? 0 : c) * a.rows;
          const ib = (b.rows === 1 ? 0 : r) + (b.cols === 1 ? 0 : c) * b.rows;
          if (needC(ar[ia], br[ib])) { complex = true; break outer; }
        }
      }
    }
    const out = new Tensor(R, Cc, null, null, type);
    const ore = out.re;
    if (!complex) {
      if (sameShape) for (let k = 0; k < n; k++) ore[k] = fr(ar[k], br[k]);
      else if (bS) { const y = br[0]; for (let k = 0; k < n; k++) ore[k] = fr(ar[k], y); }
      else if (aS) { const x = ar[0]; for (let k = 0; k < n; k++) ore[k] = fr(x, br[k]); }
      else {
        let k = 0;
        for (let c = 0; c < Cc; c++) for (let r = 0; r < R; r++, k++) {
          const ia = (a.rows === 1 ? 0 : r) + (a.cols === 1 ? 0 : c) * a.rows;
          const ib = (b.rows === 1 ? 0 : r) + (b.cols === 1 ? 0 : c) * b.rows;
          ore[k] = fr(ar[ia], br[ib]);
        }
      }
      return out;
    }
    if (!fc) err('该运算不支持复数。');
    const oim = out.im = new Float64Array(n);
    const ai = a.im, bi = b.im, o = [0, 0];
    let k = 0;
    for (let c = 0; c < Cc; c++) for (let r = 0; r < R; r++, k++) {
      const ia = (a.rows === 1 ? 0 : r) + (a.cols === 1 ? 0 : c) * a.rows;
      const ib = (b.rows === 1 ? 0 : r) + (b.cols === 1 ? 0 : c) * b.rows;
      fc(ar[ia], ai ? ai[ia] : 0, br[ib], bi ? bi[ib] : 0, o);
      ore[k] = o[0]; oim[k] = o[1];
    }
    return out;
  }

  function arith(name, fr, fc, needC) {
    return function (a, b) {
      a = numericOperand(a, name); b = numericOperand(b, name);
      const t = resultType(a, b);
      return finalize(elementwise(a, b, fr, fc, t, needC));
    };
  }

  const plus = arith('+', (x, y) => x + y, (ar, ai, br, bi, o) => { o[0] = ar + br; o[1] = ai + bi; });
  const minus = arith('-', (x, y) => x - y, (ar, ai, br, bi, o) => { o[0] = ar - br; o[1] = ai - bi; });
  const times = arith('.*', (x, y) => x * y, C.mul);
  const rdivide = arith('./', (x, y) => x / y, C.div);
  const ldivide = arith('.\\', (x, y) => y / x, (ar, ai, br, bi, o) => C.div(br, bi, ar, ai, o));
  const powNeedC = (x, y) => x < 0 && !Number.isInteger(y) && Number.isFinite(y);
  const power = arith('.^', (x, y) => Math.pow(x, y), C.pow, powNeedC);

  // 整数类型除法需要四舍五入（由 finalize 处理）

  // ---------- 比较 ----------
  function compare(name, fr, fcEq) {
    return function (a, b) {
      a = numericOperand(a, name); b = numericOperand(b, name);
      if (fcEq && (a.im || b.im)) {
        return elementwise(a, b, null, (ar, ai, br, bi, o) => { o[0] = fcEq(ar, ai, br, bi) ? 1 : 0; o[1] = 0; }, 'logical').trim();
      }
      // 大小比较只比较实部
      const ra = a.im ? new Tensor(a.rows, a.cols, a.re, null, a.type) : a;
      const rb = b.im ? new Tensor(b.rows, b.cols, b.re, null, b.type) : b;
      return elementwise(ra, rb, (x, y) => (fr(x, y) ? 1 : 0), null, 'logical');
    };
  }
  const eq = compare('==', (x, y) => x === y, (ar, ai, br, bi) => ar === br && ai === bi);
  const ne = compare('~=', (x, y) => x !== y, (ar, ai, br, bi) => ar !== br || ai !== bi);
  const lt = compare('<', (x, y) => x < y);
  const le = compare('<=', (x, y) => x <= y);
  const gt = compare('>', (x, y) => x > y);
  const ge = compare('>=', (x, y) => x >= y);

  function logicalOperand(v, name) {
    v = numericOperand(v, name);
    for (let k = 0; k < v.re.length; k++) if (Number.isNaN(v.re[k])) err('NaN 不能转换为逻辑值。');
    return v;
  }
  function nz(t, k) { return t.re[k] !== 0 || (t.im !== null && t.im[k] !== 0); }
  function logicalOp(name, f) {
    return function (a, b) {
      a = logicalOperand(a, name); b = logicalOperand(b, name);
      const ra = a.im ? abs(a) : a, rb = b.im ? abs(b) : b;
      return elementwise(ra, rb, (x, y) => (f(x !== 0, y !== 0) ? 1 : 0), null, 'logical');
    };
  }
  const and = logicalOp('&', (x, y) => x && y);
  const or = logicalOp('|', (x, y) => x || y);
  const xor = logicalOp('xor', (x, y) => x !== y);

  function not(a) {
    a = logicalOperand(a, '~');
    const out = new Tensor(a.rows, a.cols, null, null, 'logical');
    for (let k = 0; k < out.re.length; k++) out.re[k] = nz(a, k) ? 0 : 1;
    return out;
  }
  function uminus(a) {
    a = numericOperand(a, '-');
    const t = new Tensor(a.rows, a.cols, null, null, (a.type === 'logical' || a.type === 'char') ? 'double' : a.type);
    for (let k = 0; k < t.re.length; k++) t.re[k] = -a.re[k];
    if (a.im) { t.im = new Float64Array(a.im.length); for (let k = 0; k < t.im.length; k++) t.im[k] = -a.im[k]; }
    return finalize(t);
  }
  function uplus(a) {
    a = numericOperand(a, '+');
    const t = a.clone();
    if (t.type === 'logical' || t.type === 'char') t.type = 'double';
    return t;
  }
  function abs(a) {
    const t = new Tensor(a.rows, a.cols, null, null, a.type === 'logical' || a.type === 'char' ? 'double' : a.type);
    if (a.im) for (let k = 0; k < t.re.length; k++) t.re[k] = Math.hypot(a.re[k], a.im[k]);
    else for (let k = 0; k < t.re.length; k++) t.re[k] = Math.abs(a.re[k]);
    return t;
  }

  // ---------- 转置 ----------
  function transposeGeneric(v, conj) {
    if (v instanceof Tensor) {
      const R = v.rows, Cc = v.cols;
      const t = new Tensor(Cc, R, null, null, v.type);
      const re = v.re, tre = t.re;
      for (let c = 0; c < Cc; c++) for (let r = 0; r < R; r++) tre[c + r * Cc] = re[r + c * R];
      if (v.im) {
        t.im = new Float64Array(R * Cc);
        const s = conj ? -1 : 1;
        for (let c = 0; c < Cc; c++) for (let r = 0; r < R; r++) t.im[c + r * Cc] = s * v.im[r + c * R];
      }
      return t;
    }
    if (v instanceof Cell) {
      const t = new Cell(v.cols, v.rows);
      for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) t.data[c + r * v.cols] = v.data[r + c * v.rows];
      return t;
    }
    if (v instanceof Struct) {
      const t = new Struct(v.cols, v.rows, v.fields.slice());
      for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) t.elems[c + r * v.cols] = v.elems[r + c * v.rows];
      return t;
    }
    err('转置运算不支持 ' + classOf(v) + ' 类型。');
  }
  const ctranspose = (v) => transposeGeneric(v, true);
  const transpose = (v) => transposeGeneric(v, false);

  // ---------- 矩阵乘法 ----------
  function mtimes(a, b) {
    a = numericOperand(a, '*'); b = numericOperand(b, '*');
    if (a.numel === 1 || b.numel === 1) return times(a, b);
    if (a.cols !== b.rows) err('用于矩阵乘法的维度不正确。请检查并确保第一个矩阵中的列数与第二个矩阵中的行数匹配。要执行按元素相乘，请使用 \'.*\'。');
    const M = a.rows, N = b.cols, K = a.cols;
    const type = resultType(a, b);
    const out = new Tensor(M, N, null, null, type);
    const ar = a.re, br = b.re, o = out.re;
    if (!a.im && !b.im) {
      for (let j = 0; j < N; j++) {
        for (let k = 0; k < K; k++) {
          const bkj = br[k + j * K];
          if (bkj === 0) continue;
          const ao = k * M, oo = j * M;
          for (let i = 0; i < M; i++) o[i + oo] += ar[i + ao] * bkj;
        }
      }
      // 处理 0*Inf 等情况：以上跳过 0 会忽略 NaN 传播，这里对含非有限值的情况重算
      if (hasNonFinite(ar) || hasNonFinite(br)) {
        for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
          let s = 0;
          for (let k = 0; k < K; k++) s += ar[i + k * M] * br[k + j * K];
          o[i + j * M] = s;
        }
      }
      return finalize(out);
    }
    const ai = a.im, bi = b.im;
    const oi = out.im = new Float64Array(M * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
      let sr = 0, si = 0;
      for (let k = 0; k < K; k++) {
        const xr = ar[i + k * M], xi = ai ? ai[i + k * M] : 0;
        const yr = br[k + j * K], yi = bi ? bi[k + j * K] : 0;
        sr += xr * yr - xi * yi; si += xr * yi + xi * yr;
      }
      o[i + j * M] = sr; oi[i + j * M] = si;
    }
    return finalize(out);
  }
  function hasNonFinite(a) { for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k])) return true; return false; }

  function eye(n) { const t = new Tensor(n, n); for (let i = 0; i < n; i++) t.re[i + i * n] = 1; return t; }

  function mpower(a, b) {
    a = numericOperand(a, '^'); b = numericOperand(b, '^');
    if (a.numel === 1 && b.numel === 1) return power(a, b);
    if (b.numel === 1 && a.rows === a.cols) {
      const p = b.re[0];
      if (b.im) err('不支持复数矩阵幂。');
      if (Number.isInteger(p)) {
        let base = p < 0 ? ML.linalg.inv(a) : a;
        let n = Math.abs(p);
        let res = eye(a.rows);
        if (a.im) res.im = new Float64Array(a.numel);
        while (n > 0) {
          if (n & 1) res = mtimes(res, base);
          n = Math.floor(n / 2);
          if (n > 0) base = mtimes(base, base);
        }
        return res;
      }
      // 非整数次幂：通过特征分解
      return ML.linalg.funm(a, (re, im, o) => C.pow(re, im, p, 0, o));
    }
    if (a.numel === 1 && b.rows === b.cols) {
      // s^A = expm(log(s)*A)
      const o = [0, 0];
      C.log(a.re[0], a.im ? a.im[0] : 0, o);
      const ls = new Tensor(1, 1, new Float64Array([o[0]]), new Float64Array([o[1]])).trim();
      return ML.linalg.expm(times(ls, b));
    }
    err('用于求矩阵幂的输入必须为方阵且幂为标量。要执行按元素求幂，请使用 \'.^\'。');
  }

  function mldivide(a, b) {
    a = numericOperand(a, '\\'); b = numericOperand(b, '\\');
    if (a.numel === 1) return ldivide(a, b);
    if (a.rows !== b.rows) err('矩阵维度必须一致。（' + a.rows + '×' + a.cols + ' \\ ' + b.rows + '×' + b.cols + '）');
    return ML.linalg.solve(a, b);
  }
  function mrdivide(a, b) {
    a = numericOperand(a, '/'); b = numericOperand(b, '/');
    if (b.numel === 1) return rdivide(a, b);
    if (a.cols !== b.cols) err('矩阵维度必须一致。（' + a.rows + '×' + a.cols + ' / ' + b.rows + '×' + b.cols + '）');
    return ctranspose(ML.linalg.solve(ctranspose(b), ctranspose(a)));
  }

  const binaryOps = {
    '+': plus, '-': minus, '.*': times, './': rdivide, '.\\': ldivide, '.^': power,
    '*': mtimes, '/': mrdivide, '\\': mldivide, '^': mpower,
    '==': eq, '~=': ne, '<': lt, '<=': le, '>': gt, '>=': ge,
    '&': and, '|': or
  };

  ML.C = C;
  ML.ops = {
    C, elementwise, broadcastDims, resultType, finalize, numericOperand,
    plus, minus, times, rdivide, ldivide, power, mtimes, mpower, mldivide, mrdivide,
    eq, ne, lt, le, gt, ge, and, or, xor, not, uminus, uplus, abs,
    transpose, ctranspose, eye, binaryOps
  };
})(typeof self !== 'undefined' ? self : globalThis);
