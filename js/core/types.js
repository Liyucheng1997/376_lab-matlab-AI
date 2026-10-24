/* MatWeb - 核心数据类型
 * Tensor: 二维数值/字符/逻辑矩阵（列优先存储）
 * Cell:   元胞数组
 * Struct: 结构体（数组）
 * FuncHandle: 函数句柄
 */
(function (G) {
  'use strict';
  const ML = G.ML || (G.ML = {});

  class MError extends Error {
    constructor(message, identifier) {
      super(message);
      this.identifier = identifier || '';
      this.mlLine = null;
    }
  }
  function err(msg, id) { throw new MError(msg, id); }

  const INT_RANGE = {
    int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535],
    int32: [-2147483648, 2147483647], uint32: [0, 4294967295],
    int64: [-9223372036854775808, 9223372036854775807], uint64: [0, 18446744073709551615]
  };
  const isIntType = (t) => Object.prototype.hasOwnProperty.call(INT_RANGE, t);
  const NUMERIC_TYPES = ['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'];

  function roundHalfAway(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }
  function castValue(type, x) {
    if (type === 'double' || type === 'char') return x;
    if (type === 'single') return Math.fround(x);
    if (type === 'logical') {
      if (Number.isNaN(x)) err('NaN 不能转换为逻辑值。');
      return x !== 0 ? 1 : 0;
    }
    const r = INT_RANGE[type];
    if (r) {
      if (Number.isNaN(x)) return 0;
      x = roundHalfAway(x);
      return x < r[0] ? r[0] : (x > r[1] ? r[1] : x);
    }
    return x;
  }

  class Tensor {
    constructor(rows, cols, re, im, type) {
      this.rows = rows;
      this.cols = cols;
      this.re = re || new Float64Array(rows * cols);
      this.im = im || null;
      this.type = type || 'double';
    }
    get numel() { return this.rows * this.cols; }
    isEmpty() { return this.rows === 0 || this.cols === 0; }
    isScalar() { return this.rows === 1 && this.cols === 1; }
    isVector() { return (this.rows === 1 || this.cols === 1) && this.numel >= 1; }
    isComplex() { return this.im !== null; }
    isChar() { return this.type === 'char'; }
    isLogical() { return this.type === 'logical'; }
    clone() {
      return new Tensor(this.rows, this.cols, new Float64Array(this.re), this.im ? new Float64Array(this.im) : null, this.type);
    }
    get(r, c) { return this.re[r + c * this.rows]; }
    // 返回数值（标量）
    toNumber(what) {
      if (this.numel < 1) err((what || '输入') + ' 不能为空。');
      return this.re[0];
    }
    toStr() {
      if (this.rows <= 1) return String.fromCharCode.apply(null, Array.from(this.re));
      // 多行字符矩阵：按行拼接，用换行分隔
      const lines = [];
      for (let r = 0; r < this.rows; r++) {
        let s = '';
        for (let c = 0; c < this.cols; c++) s += String.fromCharCode(this.re[r + c * this.rows]);
        lines.push(s);
      }
      return lines.join('\n');
    }
    rowString(r) {
      let s = '';
      for (let c = 0; c < this.cols; c++) s += String.fromCharCode(this.re[r + c * this.rows]);
      return s;
    }
    // 若虚部全为 0 则去掉
    trim() {
      if (this.im) {
        let allZero = true;
        for (let k = 0; k < this.im.length; k++) if (this.im[k] !== 0) { allZero = false; break; }
        if (allZero) this.im = null;
      }
      return this;
    }
    className() { return this.type; }
  }

  // ---------- 构造函数 ----------
  function scalar(v, type) {
    const t = new Tensor(1, 1, new Float64Array([v]), null, type || 'double');
    return t;
  }
  function complex(re, im) {
    const t = new Tensor(1, 1, new Float64Array([re]), new Float64Array([im]));
    return t.trim();
  }
  function bool(b) { return new Tensor(1, 1, new Float64Array([b ? 1 : 0]), null, 'logical'); }
  function str(s) {
    s = String(s);
    const re = new Float64Array(s.length);
    for (let i = 0; i < s.length; i++) re[i] = s.charCodeAt(i);
    return new Tensor(s.length === 0 ? 0 : 1, s.length, re, null, 'char');
  }
  function charMatrix(lines) {
    const rows = lines.length;
    const cols = rows ? Math.max(...lines.map((l) => l.length)) : 0;
    const t = new Tensor(rows, cols, null, null, 'char');
    for (let r = 0; r < rows; r++) {
      const l = lines[r].padEnd(cols, ' ');
      for (let c = 0; c < cols; c++) t.re[r + c * rows] = l.charCodeAt(c);
    }
    return t;
  }
  function empty(r, c, type) { return new Tensor(r || 0, c || 0, null, null, type || 'double'); }
  function zeros(r, c, type) { return new Tensor(r, c, null, null, type); }
  function fill(r, c, v) { const t = new Tensor(r, c); t.re.fill(v); return t; }
  // 由 JS 数组（列优先）构造
  function fromArray(arr, rows, cols, type) {
    return new Tensor(rows, cols, Float64Array.from(arr), null, type);
  }
  function row(arr, type) { return new Tensor(arr.length === 0 ? 1 : 1, arr.length, Float64Array.from(arr), null, type); }
  function col(arr, type) { return new Tensor(arr.length, 1, Float64Array.from(arr), null, type); }
  // 由二维 JS 数组（行优先）构造
  function fromRows(a, type) {
    const rows = a.length, cols = rows ? a[0].length : 0;
    const t = new Tensor(rows, cols, null, null, type);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t.re[r + c * rows] = a[r][c];
    return t;
  }
  function toRows(t) {
    const a = [];
    for (let r = 0; r < t.rows; r++) {
      const rowA = new Array(t.cols);
      for (let c = 0; c < t.cols; c++) rowA[c] = t.re[r + c * t.rows];
      a.push(rowA);
    }
    return a;
  }
  function toRowsIm(t) {
    const a = [];
    for (let r = 0; r < t.rows; r++) {
      const rowA = new Array(t.cols);
      for (let c = 0; c < t.cols; c++) rowA[c] = t.im ? t.im[r + c * t.rows] : 0;
      a.push(rowA);
    }
    return a;
  }
  function fromRowsComplex(re, im) {
    const t = fromRows(re);
    const ti = fromRows(im);
    t.im = ti.re;
    return t.trim();
  }

  // ---------- 元胞数组 ----------
  class Cell {
    constructor(rows, cols, data) {
      this.rows = rows; this.cols = cols;
      this.data = data || new Array(rows * cols).fill(null).map(() => empty());
    }
    get numel() { return this.rows * this.cols; }
    isEmpty() { return this.numel === 0; }
    clone() { return new Cell(this.rows, this.cols, this.data.slice()); }
    className() { return 'cell'; }
  }

  // ---------- 结构体 ----------
  class Struct {
    constructor(rows, cols, fields, elems) {
      this.rows = rows === undefined ? 1 : rows;
      this.cols = cols === undefined ? 1 : cols;
      this.fields = fields || [];
      this.elems = elems || Array.from({ length: this.rows * this.cols }, () => new Map());
    }
    get numel() { return this.rows * this.cols; }
    isEmpty() { return this.numel === 0; }
    clone() {
      return new Struct(this.rows, this.cols, this.fields.slice(), this.elems.map((m) => new Map(m)));
    }
    hasField(f) { return this.fields.indexOf(f) >= 0; }
    getField(f, i) {
      const m = this.elems[i || 0];
      const v = m ? m.get(f) : undefined;
      return v === undefined ? empty() : v;
    }
    // 原地设置（调用者负责拷贝）
    setField(f, v, i) {
      if (!this.hasField(f)) this.fields.push(f);
      this.elems[i || 0].set(f, v);
    }
    className() { return 'struct'; }
  }

  // ---------- 函数句柄 ----------
  class FuncHandle {
    // kind: 'named' | 'anon'
    constructor(kind, opts) {
      this.kind = kind;
      this.name = opts.name || null;
      this.params = opts.params || [];
      this.body = opts.body || null;
      this.captured = opts.captured || null;
      this.ctx = opts.ctx || null;
      this.text = opts.text || (this.name ? '@' + this.name : '@');
    }
    get rows() { return 1; }
    get cols() { return 1; }
    get numel() { return 1; }
    isEmpty() { return false; }
    className() { return 'function_handle'; }
  }

  function classOf(v) {
    if (v instanceof Tensor) return v.type;
    if (v instanceof Cell) return 'cell';
    if (v instanceof Struct) return 'struct';
    if (v instanceof FuncHandle) return 'function_handle';
    if (v && typeof v.className === 'function') return v.className();
    return 'unknown';
  }

  // if / while 条件判断
  function isTrue(v) {
    if (v instanceof Tensor) {
      if (v.numel === 0) return false;
      for (let k = 0; k < v.re.length; k++) {
        if (v.re[k] === 0 && !(v.im && v.im[k] !== 0)) return false;
        if (Number.isNaN(v.re[k])) err('NaN 不能转换为逻辑值。');
      }
      return true;
    }
    if (v instanceof FuncHandle) return true;
    err('条件表达式必须是数值或逻辑值，而不是 ' + classOf(v) + '。');
  }

  function sizeStr(v) { return v.rows + '×' + v.cols; }

  // 期望字符串
  function toStr(v, what) {
    if (v instanceof Tensor && (v.type === 'char' || v.numel === 0)) return v.toStr();
    if (v instanceof Cell && v.numel === 1) return toStr(v.data[0], what);
    err((what || '参数') + ' 必须为字符向量。');
  }
  function isStr(v) { return v instanceof Tensor && v.type === 'char'; }

  // 期望数值标量
  function toNum(v, what) {
    if (v instanceof Tensor && v.numel >= 1) return v.re[0];
    err((what || '参数') + ' 必须为数值标量。');
  }
  function toInt(v, what) {
    const x = toNum(v, what);
    if (!Number.isFinite(x) || Math.floor(x) !== x) err((what || '参数') + ' 必须为整数。');
    return x;
  }
  function toTensor(v, what) {
    if (v instanceof Tensor) return v;
    err((what || '参数') + ' 必须为数值数组，而不是 ' + classOf(v) + '。');
  }

  ML.MError = MError;
  ML.err = err;
  ML.types = {
    Tensor, Cell, Struct, FuncHandle, MError,
    INT_RANGE, NUMERIC_TYPES, isIntType, castValue, roundHalfAway,
    scalar, complex, bool, str, charMatrix, empty, zeros, fill, fromArray, row, col,
    fromRows, toRows, toRowsIm, fromRowsComplex,
    classOf, isTrue, sizeStr, toStr, isStr, toNum, toInt, toTensor
  };
})(typeof self !== 'undefined' ? self : globalThis);
