/* MatWeb - 索引读取、索引赋值、删除、串联 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle, isIntType, castValue, classOf } = T;
  const err = ML.err;

  const COLON = { colon: true, toString() { return ':'; } };

  function share(v) { if (v && typeof v === 'object') v._own = null; return v; }

  // 将索引值转换为 0 基索引列表
  function idxList(a, dimLen) {
    if (a === COLON) {
      const l = new Array(dimLen);
      for (let i = 0; i < dimLen; i++) l[i] = i;
      return { list: l, colon: true, rows: dimLen, cols: 1 };
    }
    if (a instanceof Tensor) {
      if (a.type === 'logical') {
        const l = [];
        for (let k = 0; k < a.re.length; k++) if (a.re[k] !== 0) l.push(k);
        return { list: l, logical: true, rows: a.rows === 1 ? 1 : l.length, cols: a.rows === 1 ? l.length : 1, src: a };
      }
      const n = a.re.length, l = new Array(n);
      for (let k = 0; k < n; k++) {
        const x = a.re[k];
        if (!(x >= 1) || x !== Math.floor(x) || !Number.isFinite(x)) {
          if (Number.isInteger(x) && x <= 0) err('索引超出范围；数组索引必须为正整数或逻辑值（索引为 ' + x + '）。', 'MATLAB:badsubscript');
          err('数组索引必须为正整数或逻辑值。', 'MATLAB:badsubscript');
        }
        l[k] = x - 1;
      }
      return { list: l, rows: a.rows, cols: a.cols };
    }
    if (a instanceof Cell) err('无法使用元胞数组作为索引。');
    err('无效的索引类型 ' + classOf(a) + '。');
  }
  function maxOf(list) { let m = -1; for (let i = 0; i < list.length; i++) if (list[i] > m) m = list[i]; return m; }

  // ---------- 读取：计算源线性索引和结果形状 ----------
  function readPlan(v, args) {
    const R = v.rows, C = v.cols, n = R * C;
    if (args.length === 0) return null;
    if (args.length === 1) {
      const ix = idxList(args[0], n);
      const mx = maxOf(ix.list);
      if (mx >= n) err('索引超出数组元素的数目(' + n + ')。索引不能超过 ' + n + '。', 'MATLAB:index:outOfBounds');
      let rows, cols;
      const len = ix.list.length;
      if (ix.colon) { rows = n; cols = 1; } else {
        const isIdxVec = ix.rows === 1 || ix.cols === 1;
        const isVVec = (R === 1 || C === 1) && n !== 1;
        if (isIdxVec && isVVec) { if (R === 1) { rows = 1; cols = len; } else { rows = len; cols = 1; } }
        else if (ix.logical && !(ix.src.rows === 1 || ix.src.cols === 1)) { rows = len; cols = 1; }
        else { rows = ix.rows; cols = ix.cols; }
      }
      return { lin: ix.list, rows, cols };
    }
    const ir = idxList(args[0], R);
    const ic = idxList(args[1], args.length > 2 ? C : C);
    for (let k = 2; k < args.length; k++) {
      const ik = idxList(args[k], 1);
      for (const x of ik.list) if (x !== 0) err('索引超出矩阵维度。', 'MATLAB:index:outOfBounds');
      if (ik.list.length === 0) return { lin: [], rows: ir.list.length, cols: 0 };
    }
    if (maxOf(ir.list) >= R) err('位置 1 处的索引超出数组边界（不能超过 ' + R + '）。', 'MATLAB:index:outOfBounds');
    if (maxOf(ic.list) >= C) err('位置 2 处的索引超出数组边界（不能超过 ' + C + '）。', 'MATLAB:index:outOfBounds');
    const rl = ir.list, cl = ic.list;
    const lin = new Array(rl.length * cl.length);
    let k = 0;
    for (let j = 0; j < cl.length; j++) { const off = cl[j] * R; for (let i = 0; i < rl.length; i++) lin[k++] = rl[i] + off; }
    return { lin, rows: rl.length, cols: cl.length };
  }

  function gatherTensor(v, plan) {
    const out = new Tensor(plan.rows, plan.cols, null, v.im ? new Float64Array(plan.rows * plan.cols) : null, v.type);
    const lin = plan.lin, re = v.re, ore = out.re;
    for (let k = 0; k < lin.length; k++) ore[k] = re[lin[k]];
    if (v.im) { const im = v.im, oim = out.im; for (let k = 0; k < lin.length; k++) oim[k] = im[lin[k]]; out.trim(); }
    return out;
  }

  // v(args)
  function indexParen(v, args) {
    if (v instanceof FuncHandle) err('函数句柄不能被索引。');
    if (args.length === 0) return v;
    // 标量快速路径
    if (v instanceof Tensor && args.length <= 2) {
      const a0 = args[0];
      if (a0 instanceof Tensor && a0.numel === 1 && a0.type !== 'logical' && (args.length === 1 || (args[1] instanceof Tensor && args[1].numel === 1 && args[1].type !== 'logical'))) {
        let k;
        const x = a0.re[0];
        if (!(x >= 1) || x !== Math.floor(x)) err('数组索引必须为正整数或逻辑值。', 'MATLAB:badsubscript');
        if (args.length === 1) {
          k = x - 1;
          if (k >= v.numel) err('索引超出数组元素的数目(' + v.numel + ')。索引不能超过 ' + v.numel + '。', 'MATLAB:index:outOfBounds');
        } else {
          const y = args[1].re[0];
          if (!(y >= 1) || y !== Math.floor(y)) err('数组索引必须为正整数或逻辑值。', 'MATLAB:badsubscript');
          if (x > v.rows) err('位置 1 处的索引超出数组边界（不能超过 ' + v.rows + '）。', 'MATLAB:index:outOfBounds');
          if (y > v.cols) err('位置 2 处的索引超出数组边界（不能超过 ' + v.cols + '）。', 'MATLAB:index:outOfBounds');
          k = (x - 1) + (y - 1) * v.rows;
        }
        const t = new Tensor(1, 1, new Float64Array([v.re[k]]), v.im ? new Float64Array([v.im[k]]) : null, v.type);
        return v.im ? t.trim() : t;
      }
    }
    const plan = readPlan(v, args);
    if (v instanceof Tensor) return gatherTensor(v, plan);
    if (v instanceof Cell) {
      const out = new Cell(plan.rows, plan.cols, plan.lin.map((k) => v.data[k]));
      return out;
    }
    if (v instanceof Struct) {
      return new Struct(plan.rows, plan.cols, v.fields.slice(), plan.lin.map((k) => v.elems[k]));
    }
    err('无法索引 ' + classOf(v) + ' 类型。');
  }

  // c{args} → 值列表
  function indexBrace(v, args) {
    if (!(v instanceof Cell)) {
      if (v instanceof Tensor && v.numel === 0) err('索引超出数组元素的数目(0)。');
      err('此类型的变量不支持使用花括号进行索引。');
    }
    if (args.length === 0) return v.data.slice();
    const plan = readPlan(v, args);
    return plan.lin.map((k) => v.data[k]);
  }

  // ---------- 赋值 ----------
  function growTensor(v, R, C) {
    const t = new Tensor(R, C, null, v.im ? new Float64Array(R * C) : null, v.type);
    for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) {
      t.re[r + c * R] = v.re[r + c * v.rows];
      if (v.im) t.im[r + c * R] = v.im[r + c * v.rows];
    }
    return t;
  }
  function growCell(v, R, C) {
    const t = new Cell(R, C);
    for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) t.data[r + c * R] = v.data[r + c * v.rows];
    return t;
  }
  function growStruct(v, R, C) {
    const t = new Struct(R, C, v.fields.slice());
    for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) t.elems[r + c * R] = v.elems[r + c * v.rows];
    return t;
  }
  function grow(v, R, C) {
    if (v instanceof Tensor) return growTensor(v, R, C);
    if (v instanceof Cell) return growCell(v, R, C);
    return growStruct(v, R, C);
  }
  function copyOf(v) { return v.clone(); }

  // 计算赋值目标：返回 {lin, R, C}
  function writePlan(base, args, rhsRows, rhsCols, rhsN) {
    const R = base.rows, C = base.cols, n = R * C;
    if (args.length === 1) {
      const a = args[0];
      if (a === COLON) {
        const lin = new Array(n); for (let i = 0; i < n; i++) lin[i] = i;
        return { lin, R, C };
      }
      const ix = idxList(a, n);
      const mx = maxOf(ix.list);
      let nR = R, nC = C;
      if (mx >= n) {
        if (n === 0) {
          if (ix.cols === 1 && ix.rows > 1 && !ix.logical) { nR = mx + 1; nC = 1; } else { nR = 1; nC = mx + 1; }
          if (R > 1 && C === 0) { err('试图沿模糊维度增大数组。'); }
        } else if (R === 1) nC = mx + 1;
        else if (C === 1) nR = mx + 1;
        else err('试图沿模糊维度增大数组。无法使用线性索引扩展矩阵。', 'MATLAB:indexed:ambiguousGrow');
      }
      return { lin: ix.list, R: nR, C: nC };
    }
    let a0 = args[0], a1 = args[1];
    for (let k = 2; k < args.length; k++) {
      const ik = idxList(args[k], 1);
      for (const x of ik.list) if (x !== 0) err('暂不支持三维及以上数组。');
    }
    const seq = (len) => { const l = new Array(len); for (let i = 0; i < len; i++) l[i] = i; return l; };
    let rl = a0 === COLON ? null : idxList(a0, R).list;
    let cl = a1 === COLON ? null : idxList(a1, C).list;
    if (!rl && !cl) {
      if (n === 0) { rl = seq(rhsN === 1 ? Math.max(R, 1) : rhsRows); cl = seq(rhsN === 1 ? Math.max(C, 1) : rhsCols); }
      else { rl = seq(R); cl = seq(C); }
    } else if (!rl) {
      rl = seq(R > 0 ? R : (rhsN === 1 ? 1 : Math.round(rhsN / Math.max(cl.length, 1))));
    } else if (!cl) {
      cl = seq(C > 0 ? C : (rhsN === 1 ? 1 : Math.round(rhsN / Math.max(rl.length, 1))));
    }
    const nR = Math.max(R, maxOf(rl) + 1), nC = Math.max(C, maxOf(cl) + 1);
    const lin = new Array(rl.length * cl.length);
    let k = 0;
    for (let j = 0; j < cl.length; j++) for (let i = 0; i < rl.length; i++) lin[k++] = rl[i] + cl[j] * nR;
    return { lin, R: nR, C: nC };
  }

  function tensorAssignType(base, rhs, baseFresh) {
    if (baseFresh) return rhs.type;
    const bt = base.type, rt = rhs.type;
    if (bt === rt) return bt;
    if (isIntType(bt)) return bt;
    if (isIntType(rt)) return rt;
    if (bt === 'char') return rt === 'logical' ? 'char' : (rt === 'double' ? 'char' : rt);
    if (bt === 'logical') return rt === 'char' ? 'char' : rt;
    if (bt === 'single' || rt === 'single') return 'single';
    return 'double';
  }

  function isDeletion(rhs) { return rhs instanceof Tensor && rhs.rows === 0 && rhs.cols === 0 && rhs.type === 'double'; }

  // base(args) = rhs ; base 可以是 undefined；inPlace 表示可以直接修改 base
  function assignParen(base, args, rhs, inPlace) {
    const fresh = base === undefined;
    if (fresh) base = (rhs instanceof Cell) ? new Cell(0, 0) : (rhs instanceof Struct ? new Struct(0, 0, rhs.fields.slice()) : new Tensor(0, 0));
    if (args.length === 0) err('赋值时必须提供索引。');
    if (isDeletion(rhs) && !fresh) return deleteElems(base, args);
    // 类型协调
    if (base instanceof Tensor && base.numel === 0 && !(rhs instanceof Tensor)) {
      base = rhs instanceof Cell ? new Cell(base.rows, base.cols) : new Struct(base.rows, base.cols, rhs instanceof Struct ? rhs.fields.slice() : []);
      inPlace = false;
    }
    if (base instanceof Tensor) {
      if (!(rhs instanceof Tensor)) {
        if (rhs instanceof Cell) err('无法从 cell 转换为 ' + base.type + '。');
        if (rhs instanceof Struct) err('无法从 struct 转换为 ' + base.type + '。');
        err('无法从 ' + classOf(rhs) + ' 转换为 ' + base.type + '。');
      }
      const baseEmptyFresh = fresh || (base.numel === 0 && base.type === 'double');
      const plan = writePlan(base, args, rhs.rows, rhs.cols, rhs.numel);
      const cnt = plan.lin.length;
      if (rhs.numel !== 1 && rhs.numel !== cnt) err('无法执行赋值，因为左侧和右侧的元素数目不同（' + cnt + ' 与 ' + rhs.numel + '）。', 'MATLAB:subsassignnumelmismatch');
      const type = tensorAssignType(base, rhs, baseEmptyFresh);
      let t;
      if (plan.R !== base.rows || plan.C !== base.cols) t = growTensor(base, plan.R, plan.C);
      else t = inPlace ? base : base.clone();
      if (t.type !== type) {
        if (isIntType(type) && !isIntType(t.type)) for (let k = 0; k < t.re.length; k++) t.re[k] = castValue(type, t.re[k]);
        t.type = type;
      }
      if (rhs.im && !t.im) t.im = new Float64Array(t.re.length);
      const lin = plan.lin, tre = t.re, tim = t.im, rre = rhs.re, rim = rhs.im;
      const needCast = type !== 'double' && type !== 'char' && type !== 'logical';
      if (rhs.numel === 1) {
        let x = rre[0];
        if (needCast) x = castValue(type, x);
        else if (type === 'logical') x = x !== 0 ? 1 : 0;
        const y = rim ? rim[0] : 0;
        for (let k = 0; k < cnt; k++) { tre[lin[k]] = x; if (tim) tim[lin[k]] = y; }
      } else {
        for (let k = 0; k < cnt; k++) {
          let x = rre[k];
          if (needCast) x = castValue(type, x);
          tre[lin[k]] = x;
          if (tim) tim[lin[k]] = rim ? rim[k] : 0;
        }
      }
      if (tim && !rim) t.trim();
      return t;
    }
    if (base instanceof Cell) {
      if (!(rhs instanceof Cell)) err('无法从 ' + classOf(rhs) + ' 转换为 cell。请使用花括号 {} 为元胞数组的内容赋值。');
      const plan = writePlan(base, args, rhs.rows, rhs.cols, rhs.numel);
      const cnt = plan.lin.length;
      if (rhs.numel !== 1 && rhs.numel !== cnt) err('无法执行赋值，因为左侧和右侧的元素数目不同。');
      const t = (plan.R !== base.rows || plan.C !== base.cols) ? growCell(base, plan.R, plan.C) : base.clone();
      for (let k = 0; k < cnt; k++) t.data[plan.lin[k]] = share(rhs.numel === 1 ? rhs.data[0] : rhs.data[k]);
      return t;
    }
    if (base instanceof Struct) {
      if (!(rhs instanceof Struct)) err('无法从 ' + classOf(rhs) + ' 转换为 struct。');
      const plan = writePlan(base, args, rhs.rows, rhs.cols, rhs.numel);
      const cnt = plan.lin.length;
      if (rhs.numel !== 1 && rhs.numel !== cnt) err('无法执行赋值，因为左侧和右侧的元素数目不同。');
      const t = (plan.R !== base.rows || plan.C !== base.cols) ? growStruct(base, plan.R, plan.C) : base.clone();
      for (const f of rhs.fields) if (!t.hasField(f)) t.fields.push(f);
      for (let k = 0; k < cnt; k++) {
        const src = rhs.elems[rhs.numel === 1 ? 0 : k];
        const m = new Map();
        for (const [key, val] of src) m.set(key, share(val));
        t.elems[plan.lin[k]] = m;
      }
      return t;
    }
    err('无法对 ' + classOf(base) + ' 类型进行索引赋值。');
  }

  // base{args} = rhs
  function assignBrace(base, args, rhs) {
    if (base === undefined || (base instanceof Tensor && base.numel === 0)) base = new Cell(0, 0);
    if (!(base instanceof Cell)) err('无法对非元胞数组对象使用花括号索引赋值。');
    if (args.length === 0) err('赋值时必须提供索引。');
    const plan = writePlan(base, args, 1, 1, 1);
    const t = (plan.R !== base.rows || plan.C !== base.cols) ? growCell(base, plan.R, plan.C) : base.clone();
    for (let k = 0; k < plan.lin.length; k++) t.data[plan.lin[k]] = share(rhs);
    return t;
  }

  // 删除元素 base(args) = []
  function deleteElems(base, args) {
    const R = base.rows, C = base.cols, n = R * C;
    const make = (rows, cols, srcIdx) => {
      if (base instanceof Tensor) {
        const t = new Tensor(rows, cols, null, base.im ? new Float64Array(rows * cols) : null, base.type);
        for (let k = 0; k < srcIdx.length; k++) { t.re[k] = base.re[srcIdx[k]]; if (base.im) t.im[k] = base.im[srcIdx[k]]; }
        return t.trim();
      }
      if (base instanceof Cell) return new Cell(rows, cols, srcIdx.map((k) => base.data[k]));
      return new Struct(rows, cols, base.fields.slice(), srcIdx.map((k) => base.elems[k]));
    };
    if (args.length === 1) {
      if (args[0] === COLON) return make(0, 0, []);
      const del = new Set(idxList(args[0], n).list);
      for (const k of del) if (k >= n) err('删除时索引超出数组范围。');
      const keep = [];
      for (let k = 0; k < n; k++) if (!del.has(k)) keep.push(k);
      if (C === 1 && R !== 1) return make(keep.length, 1, keep);
      return make(keep.length === 0 && del.size === 0 ? R : 1, keep.length, keep);
    }
    const a0 = args[0], a1 = args[1];
    const allRows = a0 === COLON || (() => { const s = new Set(idxList(a0, R).list); for (let i = 0; i < R; i++) if (!s.has(i)) return false; return true; })();
    const allCols = a1 === COLON || (() => { const s = new Set(idxList(a1, C).list); for (let j = 0; j < C; j++) if (!s.has(j)) return false; return true; })();
    if (allRows) {
      const del = new Set(a1 === COLON ? Array.from({ length: C }, (x, i) => i) : idxList(a1, C).list);
      const keepCols = []; for (let j = 0; j < C; j++) if (!del.has(j)) keepCols.push(j);
      const src = []; for (const j of keepCols) for (let i = 0; i < R; i++) src.push(i + j * R);
      return make(R, keepCols.length, src);
    }
    if (allCols) {
      const del = new Set(idxList(a0, R).list);
      const keepRows = []; for (let i = 0; i < R; i++) if (!del.has(i)) keepRows.push(i);
      const src = []; for (let j = 0; j < C; j++) for (const i of keepRows) src.push(i + j * R);
      return make(keepRows.length, C, src);
    }
    err('删除操作只能删除整行或整列（使用冒号 :）。', 'MATLAB:nullAssignmentNonEmpty');
  }

  // 取出单个元素（用于嵌套赋值，如 s(2).name = ... / c{3}(2) = ...）
  function getElemForNested(base, args, brace) {
    if (base === undefined) return undefined;
    if (base instanceof Tensor && base.numel === 0) return undefined;
    const n = base.rows * base.cols;
    let k;
    if (args.length === 1) {
      const ix = idxList(args[0], n);
      if (ix.list.length !== 1) err('嵌套赋值需要单个元素索引。');
      k = ix.list[0];
      if (k >= n) return undefined;
    } else {
      const r = idxList(args[0], base.rows).list, c = idxList(args[1], base.cols).list;
      if (r.length !== 1 || c.length !== 1) err('嵌套赋值需要单个元素索引。');
      if (r[0] >= base.rows || c[0] >= base.cols) return undefined;
      k = r[0] + c[0] * base.rows;
    }
    if (brace) {
      if (!(base instanceof Cell)) err('此类型的变量不支持使用花括号进行索引。');
      return base.data[k];
    }
    if (base instanceof Struct) return new Struct(1, 1, base.fields.slice(), [new Map(base.elems[k])]);
    if (base instanceof Cell) err('元胞数组需使用花括号 {} 访问内容。');
    err('无法对非结构体数组使用点索引。');
  }

  // ---------- 串联 ----------
  function concatType(vals) {
    let anyChar = false, intT = null, anySingle = false, allLogical = true;
    for (const v of vals) {
      if (v.type === 'char') anyChar = true;
      else if (isIntType(v.type)) intT = intT || v.type;
      else if (v.type === 'single') anySingle = true;
      if (v.type !== 'logical') allLogical = false;
    }
    if (intT) return intT;
    if (anyChar) return 'char';
    if (anySingle) return 'single';
    if (allLogical && vals.length) return 'logical';
    return 'double';
  }
  function catTensors(vals, horiz) {
    const nonEmpty = vals.filter((v) => v.numel > 0);
    const type = concatType(vals.filter((v) => v.numel > 0 || v.type === 'char').length ? vals.filter((v) => v.numel > 0 || v.type === 'char') : vals);
    if (nonEmpty.length === 0) {
      // 保持空数组的维度（如 zeros(3,0)）
      if (vals.length === 0) return new Tensor(0, 0);
      let r = 0, c = 0;
      if (horiz) { r = vals[0].rows; for (const v of vals) c += v.cols; if (vals.some((v) => v.rows !== r)) r = 0; }
      else { c = vals[0].cols; for (const v of vals) r += v.rows; if (vals.some((v) => v.cols !== c)) c = 0; }
      return new Tensor(r, c, null, null, type);
    }
    if (nonEmpty.length === 1) {
      const t = nonEmpty[0].clone();
      if (t.type !== type) { if (isIntType(type)) for (let k = 0; k < t.re.length; k++) t.re[k] = castValue(type, t.re[k]); t.type = type; }
      return t;
    }
    const cplx = nonEmpty.some((v) => v.im);
    let R, C;
    if (horiz) {
      R = nonEmpty[0].rows; C = 0;
      for (const v of nonEmpty) { if (v.rows !== R) err('要串联的数组的维度不一致。（水平串联需要相同的行数：' + R + ' 与 ' + v.rows + '）', 'MATLAB:catenate:dimensionMismatch'); C += v.cols; }
    } else {
      C = nonEmpty[0].cols; R = 0;
      for (const v of nonEmpty) { if (v.cols !== C) err('要串联的数组的维度不一致。（垂直串联需要相同的列数：' + C + ' 与 ' + v.cols + '）', 'MATLAB:catenate:dimensionMismatch'); R += v.rows; }
    }
    const t = new Tensor(R, C, null, cplx ? new Float64Array(R * C) : null, type);
    const cast = isIntType(type);
    if (horiz) {
      let off = 0;
      for (const v of nonEmpty) {
        const n = v.numel;
        for (let k = 0; k < n; k++) t.re[off + k] = cast ? castValue(type, v.re[k]) : v.re[k];
        if (cplx && v.im) for (let k = 0; k < n; k++) t.im[off + k] = v.im[k];
        off += n;
      }
    } else {
      let r0 = 0;
      for (const v of nonEmpty) {
        for (let c = 0; c < C; c++) for (let r = 0; r < v.rows; r++) {
          t.re[r0 + r + c * R] = cast ? castValue(type, v.re[r + c * v.rows]) : v.re[r + c * v.rows];
          if (cplx && v.im) t.im[r0 + r + c * R] = v.im[r + c * v.rows];
        }
        r0 += v.rows;
      }
    }
    return t;
  }
  function catCells(vals, horiz) {
    const cells = vals.map((v) => (v instanceof Cell ? v : (v instanceof Tensor && v.numel === 0 ? null : new Cell(1, 1, [share(v)])))).filter((c) => c && c.numel > 0);
    if (cells.length === 0) return new Cell(0, 0);
    let R, C;
    if (horiz) { R = cells[0].rows; C = 0; for (const c of cells) { if (c.rows !== R) err('要串联的数组的维度不一致。'); C += c.cols; } }
    else { C = cells[0].cols; R = 0; for (const c of cells) { if (c.cols !== C) err('要串联的数组的维度不一致。'); R += c.rows; } }
    const t = new Cell(R, C);
    if (horiz) { let off = 0; for (const c of cells) { for (let k = 0; k < c.numel; k++) t.data[off + k] = c.data[k]; off += c.numel; } }
    else { let r0 = 0; for (const c of cells) { for (let j = 0; j < C; j++) for (let i = 0; i < c.rows; i++) t.data[r0 + i + j * R] = c.data[i + j * c.rows]; r0 += c.rows; } }
    return t;
  }
  function catStructs(vals, horiz) {
    const ss = vals.filter((v) => !(v instanceof Tensor && v.numel === 0));
    for (const s of ss) if (!(s instanceof Struct)) err('无法串联 struct 与 ' + classOf(s) + '。');
    const nonEmpty = ss.filter((s) => s.numel > 0);
    if (!nonEmpty.length) return ss[0] || new Struct(0, 0);
    const fields = nonEmpty[0].fields.slice();
    for (const s of nonEmpty) {
      if (s.fields.length !== fields.length || s.fields.some((f) => fields.indexOf(f) < 0)) err('无法串联字段名称不同的结构体数组。');
    }
    let R, C;
    if (horiz) { R = nonEmpty[0].rows; C = 0; for (const s of nonEmpty) { if (s.rows !== R) err('要串联的数组的维度不一致。'); C += s.cols; } }
    else { C = nonEmpty[0].cols; R = 0; for (const s of nonEmpty) { if (s.cols !== C) err('要串联的数组的维度不一致。'); R += s.rows; } }
    const t = new Struct(R, C, fields);
    if (horiz) { let off = 0; for (const s of nonEmpty) { for (let k = 0; k < s.numel; k++) t.elems[off + k] = s.elems[k]; off += s.numel; } }
    else { let r0 = 0; for (const s of nonEmpty) { for (let j = 0; j < C; j++) for (let i = 0; i < s.rows; i++) t.elems[r0 + i + j * R] = s.elems[i + j * s.rows]; r0 += s.rows; } }
    return t;
  }
  function concat(vals, horiz) {
    if (vals.length === 1 && !(vals[0] instanceof FuncHandle)) return vals[0];
    if (vals.some((v) => v instanceof FuncHandle)) {
      if (vals.length === 1) return vals[0];
      err('不允许串联函数句柄。请改用元胞数组 {}。');
    }
    if (vals.some((v) => v instanceof Cell)) return catCells(vals, horiz);
    if (vals.some((v) => v instanceof Struct)) return catStructs(vals, horiz);
    return catTensors(vals, horiz);
  }
  const horzcat = (vals) => concat(vals, true);
  const vertcat = (vals) => concat(vals, false);

  ML.COLON = COLON;
  ML.share = share;
  ML.idx = {
    COLON, idxList, readPlan, indexParen, indexBrace, assignParen, assignBrace, deleteElems,
    getElemForNested, horzcat, vertcat, concat, isDeletion, grow, share
  };
})(typeof self !== 'undefined' ? self : globalThis);
