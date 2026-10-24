/* MatWeb - 数据类型：元胞数组、结构体、函数句柄、containers.Map */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const IX = ML.idx;
  const share = ML.share;
  const D = (syn, desc, cat) => ({ cat: cat || '数据类型', syn, desc });

  // ---------- containers.Map（句柄语义）----------
  class MapObj {
    constructor(keyType, valueType) { this.map = new Map(); this.keyType = keyType || 'char'; this.valueType = valueType || 'any'; }
    get rows() { return 1; }
    get cols() { return 1; }
    get numel() { return 1; }
    isEmpty() { return false; }
    className() { return 'containers.Map'; }
    clone() { return this; }
    keyOf(k) {
      if (this.keyType === 'char') { if (!T.isStr(k)) err('指定的键类型与此容器所需的类型不匹配（需要 char）。'); return k.toStr(); }
      return H.num(k);
    }
    get(k) {
      const key = this.keyOf(k);
      if (!this.map.has(key)) err('指定的键 \'' + key + '\' 不存在。', 'MATLAB:Containers:Map:NoKey');
      return this.map.get(key);
    }
    set(k, v) { this.map.set(this.keyOf(k), share(v)); }
    sortedKeys() { const ks = [...this.map.keys()]; return this.keyType === 'char' ? ks.sort() : ks.sort((a, b) => a - b); }
    keysCell() { return new Cell(1, this.map.size, this.sortedKeys().map((k) => (typeof k === 'string' ? T.str(k) : T.scalar(k)))); }
    valuesCell() { return new Cell(1, this.map.size, this.sortedKeys().map((k) => this.map.get(k))); }
    mlDisplay() { return '  containers.Map，包含 ' + this.map.size + ' 个键值对：\n\n' + this.sortedKeys().map((k) => '    ' + (typeof k === 'string' ? "'" + k + "'" : k) + ' → ' + ML.fmt.summary(this.map.get(k), false)).join('\n'); }
    field(name) {
      if (name === 'Count') return T.scalar(this.map.size);
      if (name === 'KeyType') return T.str(this.keyType);
      if (name === 'ValueType') return T.str(this.valueType);
      if (name === 'keys') return this.keysCell();
      if (name === 'values') return this.valuesCell();
      err('containers.Map 没有属性 \'' + name + '\'。');
    }
  }
  ML.MapObj = MapObj;
  def('containers.Map', (a) => {
    const nv = H.nameValue(a, a.length % 2 === 0 && a.length >= 2 && T.isStr(a[0]) && /^(keytype|valuetype|uniformvalues)$/i.test(a[0].toStr()) ? 0 : 2);
    let kt = nv.keytype ? H.str(nv.keytype) : null;
    const vt = nv.valuetype ? H.str(nv.valuetype) : 'any';
    const m = new MapObj('char', vt);
    if (a.length >= 2 && !(T.isStr(a[0]) && /^(keytype|valuetype|uniformvalues)$/i.test(a[0].toStr()))) {
      const keys = a[0], vals = a[1];
      const kl = keys instanceof Cell ? keys.data : (T.isStr(keys) ? [keys] : Array.from(H.tensor(keys).re, (x) => T.scalar(x)));
      const vl = keys instanceof Cell || !T.isStr(keys) && kl.length > 1 ? (vals instanceof Cell ? vals.data : Array.from(H.tensor(vals).re, (x) => T.scalar(x))) : [vals];
      if (!kt) kt = T.isStr(kl[0]) ? 'char' : 'double';
      m.keyType = kt;
      if (kl.length !== vl.length) err('键和值的数目必须相同。');
      kl.forEach((k, i) => m.set(k, vl[i]));
    } else if (kt) m.keyType = kt === 'char' ? 'char' : 'double';
    return m;
  }, D("m = containers.Map(keys,values)", '键值映射容器（句柄对象）'));
  def('keys', (a) => { if (!(a[0] instanceof MapObj)) err('keys: 输入必须为 containers.Map。'); return a[0].keysCell(); }, D('k = keys(m)', 'Map 的所有键'));
  def('values', (a) => {
    const m = a[0]; if (!(m instanceof MapObj)) err('values: 输入必须为 containers.Map。');
    if (a.length > 1) { const ks = a[1] instanceof Cell ? a[1].data : [a[1]]; return new Cell(1, ks.length, ks.map((k) => m.get(k))); }
    return m.valuesCell();
  }, D('v = values(m)', 'Map 的所有值'));
  def('isKey', (a) => {
    const m = a[0]; if (!(m instanceof MapObj)) err('isKey: 输入必须为 containers.Map。');
    if (a[1] instanceof Cell) { const t = new Tensor(a[1].rows, a[1].cols, null, null, 'logical'); a[1].data.forEach((k, i) => { t.re[i] = m.map.has(m.keyOf(k)) ? 1 : 0; }); return t; }
    return T.bool(m.map.has(m.keyOf(a[1])));
  }, D('tf = isKey(m,key)', '判断键是否存在'));
  def('remove', (a) => {
    const m = a[0]; if (!(m instanceof MapObj)) err('remove: 输入必须为 containers.Map。');
    const ks = a[1] instanceof Cell ? a[1].data : [a[1]];
    for (const k of ks) { const key = m.keyOf(k); if (!m.map.has(key)) err('指定的键不存在。'); m.map.delete(key); }
    return m;
  }, D('remove(m,key)', '删除键值对'));

  // ---------- 元胞数组 ----------
  def('cell', (a) => { const { r, c } = H.sizeArgs(a, 'cell'); return new Cell(r, c); }, D('c = cell(n), cell(m,n)', '创建空元胞数组'));
  def('num2cell', (a) => {
    const v = a[0];
    if (v instanceof Cell) return new Cell(v.rows, v.cols, v.data.map((x) => new Cell(1, 1, [x])));
    if (v instanceof Struct) return new Cell(v.rows, v.cols, v.elems.map((m) => new Struct(1, 1, v.fields.slice(), [new Map(m)])));
    const t = H.tensor(v);
    return new Cell(t.rows, t.cols, Array.from({ length: t.numel }, (x, k) => IX.indexParen(t, [T.scalar(k + 1)])));
  }, D('C = num2cell(A)', '将数组转换为元胞数组'));
  def('cell2mat', (a) => {
    const c = a[0]; if (!(c instanceof Cell)) err('cell2mat: 输入必须为元胞数组。');
    if (c.numel === 0) return new Tensor(0, 0);
    const rowsV = [];
    for (let r = 0; r < c.rows; r++) { const items = []; for (let j = 0; j < c.cols; j++) items.push(c.data[r + j * c.rows]); rowsV.push(IX.horzcat(items)); }
    return IX.vertcat(rowsV);
  }, D('A = cell2mat(C)', '将元胞数组转换为普通数组'));
  def('celldisp', (a, n, it) => {
    const c = a[0]; const name = a.length > 1 ? H.str(a[1]) : 'ans';
    c.data.forEach((x, k) => it.print(ML.fmt.display(name + '{' + (c.rows === 1 || c.cols === 1 ? (k + 1) : ((k % c.rows) + 1) + ',' + (Math.floor(k / c.rows) + 1)) + '}', x)));
    return null;
  }, D('celldisp(C)', '显示元胞数组内容'));
  def('iscellstr', (a) => T.bool(a[0] instanceof Cell && a[0].data.every((x) => T.isStr(x) || (x instanceof Tensor && x.numel === 0))));

  // cellfun / arrayfun
  function funApply(a, nargout, it, getN, getElem, shapeOf, fname) {
    let f = a[0];
    let uniform = true, errHandler = null;
    let inputs = a.slice(1);
    // 解析名称-值参数
    for (let i = 1; i < inputs.length; i++) {
      if (T.isStr(inputs[i]) && i + 1 < inputs.length && /^(uniformoutput|errorhandler)$/i.test(inputs[i].toStr())) {
        const nm = inputs[i].toStr().toLowerCase();
        if (nm === 'uniformoutput') uniform = T.isTrue(inputs[i + 1]); else errHandler = inputs[i + 1];
        inputs = inputs.slice(0, i).concat(inputs.slice(i + 2)); i--;
      }
    }
    if (T.isStr(f)) {
      const nm = f.toStr();
      f = new FuncHandle('named', { name: nm, text: '@' + nm });
    }
    if (!(f instanceof FuncHandle)) err(fname + ': 第一个参数必须为函数句柄。');
    const n = getN(inputs[0]);
    for (const x of inputs) if (getN(x) !== n) err(fname + ': 所有输入参数的元素数目必须相同。');
    const nout = Math.max(nargout, 1);
    const results = []; for (let k = 0; k < nout; k++) results.push(new Array(n));
    for (let i = 0; i < n; i++) {
      it.tick();
      const args = inputs.map((x) => getElem(x, i));
      let r;
      try { r = it.callValue(f, args, nargout); }
      catch (e) {
        if (errHandler && e instanceof ML.MError) {
          const s = new Struct(1, 1); s.setField('message', T.str(e.message), 0); s.setField('identifier', T.str(e.identifier), 0); s.setField('index', T.scalar(i + 1), 0);
          r = it.callValue(errHandler, [s].concat(args), nargout);
        } else throw e;
      }
      if (nargout > 0 && r.length < nout) err(fname + ': 函数返回的输出参数数目不足。');
      for (let k = 0; k < nout; k++) results[k][i] = r[k];
    }
    const [R, C] = shapeOf(inputs[0]);
    return results.map((res, k) => {
      if (!uniform) return new Cell(R, C, res.map((x) => (x === undefined ? new Tensor(0, 0) : x)));
      if (nargout === 0 && res.every((x) => x === undefined)) return undefined;
      const t = new Tensor(R, C);
      let type = null;
      for (let i = 0; i < n; i++) {
        const x = res[i];
        if (!(x instanceof Tensor) || x.numel !== 1) err(fname + ': 函数返回值不能串联为数组（非标量输出）。请设置 \'UniformOutput\' 为 false。');
        t.re[i] = x.re[0];
        if (x.im) { if (!t.im) t.im = new Float64Array(n); t.im[i] = x.im[0]; }
        type = type === null ? x.type : (type === x.type ? type : 'double');
      }
      if (type === 'logical' || type === 'char' || T.isIntType(type)) t.type = type;
      return t;
    }).filter((x) => x !== undefined);
  }
  def('cellfun', (a, nargout, it) => {
    const f0 = a[0];
    // 旧式字符串函数名的快速路径
    if (T.isStr(f0) && a.length === 2) {
      const nm = f0.toStr(); const c = a[1];
      const quick = { isempty: (x) => x.rows * x.cols === 0, length: (x) => (x.rows * x.cols === 0 ? 0 : Math.max(x.rows, x.cols)), numel: (x) => x.rows * x.cols, ndims: () => 2, isreal: (x) => !(x instanceof Tensor && x.im), islogical: (x) => x instanceof Tensor && x.type === 'logical', isclass: () => false };
      if (quick[nm] && c instanceof Cell) {
        const t = new Tensor(c.rows, c.cols, null, null, nm.startsWith('is') ? 'logical' : 'double');
        c.data.forEach((x, k) => { const r = quick[nm](x); t.re[k] = r === true ? 1 : r === false ? 0 : r; });
        return t;
      }
    }
    return funApply(a, nargout, it, (x) => { if (!(x instanceof Cell)) err('cellfun: 输入必须为元胞数组。'); return x.numel; }, (x, i) => x.data[i], (x) => [x.rows, x.cols], 'cellfun');
  }, D("B = cellfun(func,C,'UniformOutput',false)", '对元胞数组的每个元素应用函数'));
  def('arrayfun', (a, nargout, it) => funApply(a, nargout, it, (x) => x.rows * x.cols, (x, i) => {
    if (x instanceof Tensor) return new Tensor(1, 1, new Float64Array([x.re[i]]), x.im ? new Float64Array([x.im[i]]) : null, x.type).trim();
    if (x instanceof Struct) return new Struct(1, 1, x.fields.slice(), [x.elems[i]]);
    if (x instanceof Cell) return new Cell(1, 1, [x.data[i]]);
    return x;
  }, (x) => [x.rows, x.cols], 'arrayfun'), D('B = arrayfun(func,A)', '对数组的每个元素应用函数'));
  def('structfun', (a, nargout, it) => {
    const s = a[1]; if (!(s instanceof Struct)) err('structfun: 输入必须为结构体。');
    const vals = s.fields.map((f) => s.getField(f, 0));
    const c = new Cell(vals.length, 1, vals);
    const rest = a.slice(2);
    const res = funApply([a[0], c].concat(rest), nargout, it, (x) => x.numel, (x, i) => x.data[i], (x) => [x.rows, x.cols], 'structfun');
    const uni = !(rest.length >= 2 && !T.isTrue(rest[1]));
    if (!uni) return res.map((cc) => { const out = new Struct(1, 1); s.fields.forEach((f, i) => out.setField(f, cc.data[i], 0)); return out; });
    return res;
  }, D('A = structfun(func,S)', '对结构体的每个字段应用函数'));

  // ---------- 结构体 ----------
  def('struct', (a) => {
    if (a.length === 0) return new Struct(1, 1);
    if (a.length % 2) err('struct: 字段名和值必须成对出现。');
    let n = 1, shape = [1, 1];
    for (let i = 1; i < a.length; i += 2) if (a[i] instanceof Cell && a[i].numel !== 1) { n = a[i].numel; shape = [a[i].rows, a[i].cols]; }
    const s = new Struct(shape[0], shape[1]);
    if (n === 0) { for (let i = 0; i < a.length; i += 2) s.fields.push(H.str(a[i], '字段名')); return s; }
    for (let i = 0; i < a.length; i += 2) {
      const f = H.str(a[i], '字段名');
      if (!/^[A-Za-z]\w*$/.test(f)) err('struct: 无效的字段名 \'' + f + '\'。');
      const v = a[i + 1];
      for (let k = 0; k < n; k++) {
        let val;
        if (v instanceof Cell) val = v.numel === 1 ? v.data[0] : v.data[k];
        else val = v;
        s.setField(f, share(val), k);
      }
    }
    return s;
  }, D("s = struct('name',value,...)", '创建结构体'));
  def('fieldnames', (a) => {
    const s = a[0];
    if (s instanceof MapObj) return new Cell(3, 1, [T.str('Count'), T.str('KeyType'), T.str('ValueType')]);
    if (!(s instanceof Struct)) err('fieldnames: 输入必须为结构体。');
    return new Cell(s.fields.length, 1, s.fields.map((f) => T.str(f)));
  }, D('f = fieldnames(s)', '结构体的字段名'));
  def('isfield', (a) => {
    const s = a[0];
    if (a[1] instanceof Cell) { const t = new Tensor(a[1].rows, a[1].cols, null, null, 'logical'); a[1].data.forEach((x, k) => { t.re[k] = s instanceof Struct && T.isStr(x) && s.hasField(x.toStr()) ? 1 : 0; }); return t; }
    return T.bool(s instanceof Struct && T.isStr(a[1]) && s.hasField(a[1].toStr()));
  }, D("tf = isfield(s,'name')", '判断是否为结构体字段'));
  def('rmfield', (a) => {
    const s = a[0]; if (!(s instanceof Struct)) err('rmfield: 输入必须为结构体。');
    const names = H.cellOfStrings(a[1]);
    const t = s.clone();
    for (const f of names) {
      if (!t.hasField(f)) err('rmfield: 字段 \'' + f + '\' 不存在。');
      t.fields = t.fields.filter((x) => x !== f);
      for (const m of t.elems) m.delete(f);
    }
    return t;
  }, D("s = rmfield(s,'name')", '删除结构体字段'));
  def('setfield', (a) => { const s = a[0] instanceof Struct ? a[0].clone() : new Struct(1, 1); s.setField(H.str(a[1]), share(a[2]), 0); return s; }, D("s = setfield(s,'name',v)", '设置字段值'));
  def('getfield', (a) => { const s = a[0]; const f = H.str(a[1]); if (!(s instanceof Struct) || !s.hasField(f)) err('getfield: 字段不存在。'); return s.getField(f, 0); }, D("v = getfield(s,'name')", '获取字段值'));
  def('orderfields', (a) => { const s = a[0].clone(); s.fields.sort(); return s; }, D('s = orderfields(s)', '按字母顺序排列字段'));
  def('struct2cell', (a) => {
    const s = a[0]; if (!(s instanceof Struct)) err('struct2cell: 输入必须为结构体。');
    if (s.numel === 1) return new Cell(s.fields.length, 1, s.fields.map((f) => s.getField(f, 0)));
    const c = new Cell(s.fields.length, s.numel);
    for (let k = 0; k < s.numel; k++) s.fields.forEach((f, i) => { c.data[i + k * s.fields.length] = s.getField(f, k); });
    return c;
  }, D('c = struct2cell(s)', '结构体转换为元胞数组'));
  def('cell2struct', (a) => {
    const c = a[0]; const fields = H.cellOfStrings(a[1]); const dim = a.length > 2 ? H.int(a[2]) : 1;
    if (dim === 1) {
      const n = c.cols; const s = new Struct(n, 1);
      for (let k = 0; k < n; k++) fields.forEach((f, i) => s.setField(f, share(c.data[i + k * c.rows]), k));
      return s;
    }
    const n = c.rows; const s = new Struct(n, 1);
    for (let k = 0; k < n; k++) fields.forEach((f, i) => s.setField(f, share(c.data[k + i * c.rows]), k));
    return s;
  }, D('s = cell2struct(c,fields,dim)', '元胞数组转换为结构体'));
  def('isobject', () => T.bool(false));
  def('ismethod isprop', () => T.bool(false));

  // ---------- 函数句柄 ----------
  def('func2str', (a) => { if (!(a[0] instanceof FuncHandle)) err('func2str: 输入必须为函数句柄。'); const t = a[0].text; return T.str(a[0].kind === 'named' ? t.slice(1) : t); }, D('s = func2str(f)', '函数句柄转换为字符串'));
  def('str2func', (a, n, it) => {
    const s = H.str(a[0]).trim();
    if (s.startsWith('@')) { const r = it.evalString(s, it.curEnv, 1); return r[0]; }
    return new FuncHandle('named', { name: s, text: '@' + s });
  }, D("f = str2func('@(x) x.^2')", '字符串转换为函数句柄'));
  def('feval', (a, nargout, it) => {
    H.nargchk(a, 1, undefined, 'feval');
    const f = a[0];
    const r = it.callValue(f, a.slice(1), nargout);
    return r;
  }, D("y = feval(f,x,...)", '计算函数（句柄或函数名）'));
  def('deal', (a, nargout) => {
    const n = Math.max(nargout, 1);
    if (a.length === 1) return new Array(n).fill(a[0]);
    if (a.length !== n) err('deal: 输入和输出的数目必须相同。');
    return a.slice();
  }, D('[a,b] = deal(x,y)', '将输入分配给输出'));
  def('isvarname', (a) => T.bool(T.isStr(a[0]) && /^[A-Za-z]\w{0,62}$/.test(a[0].toStr()) && !ML.KEYWORDS.has(a[0].toStr())), D('tf = isvarname(s)', '是否为有效变量名'));
  def('iskeyword', (a) => (a.length ? T.bool(ML.KEYWORDS.has(H.str(a[0]))) : new Cell([...ML.KEYWORDS].length, 1, [...ML.KEYWORDS].map((k) => T.str(k)))), D('iskeyword(s)', '是否为关键字'));
  def('matlab.lang.makeValidName genvarname', (a) => mapValid(a[0]), D('matlab.lang.makeValidName(s)', '构造有效变量名'));
  function mapValid(v) {
    const f = (s) => { let r = s.replace(/[^A-Za-z0-9_]/g, '_'); if (!/^[A-Za-z]/.test(r)) r = 'x' + r; return r; };
    if (v instanceof Cell) return new Cell(v.rows, v.cols, v.data.map((x) => T.str(f(H.str(x)))));
    return T.str(f(H.str(v)));
  }
})(typeof self !== 'undefined' ? self : globalThis);
