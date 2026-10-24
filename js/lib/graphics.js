/* MatWeb - 图形模型：图窗/坐标区/图形对象，以及 plot、surf 等绘图命令
 * 引擎侧只维护图形数据模型，由界面侧的渲染器绘制到 canvas。
 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const D = (syn, desc) => ({ cat: '绘图', syn, desc });

  const COLOR_ORDER = [[0, 0.447, 0.741], [0.85, 0.325, 0.098], [0.929, 0.694, 0.125], [0.494, 0.184, 0.556], [0.466, 0.674, 0.188], [0.301, 0.745, 0.933], [0.635, 0.078, 0.184]];
  const NAMED = { b: [0, 0, 1], g: [0, 0.5, 0], r: [1, 0, 0], c: [0, 0.75, 0.75], m: [0.75, 0, 0.75], y: [0.9, 0.8, 0], k: [0, 0, 0], w: [1, 1, 1],
    blue: [0, 0, 1], green: [0, 0.5, 0], red: [1, 0, 0], cyan: [0, 0.75, 0.75], magenta: [0.75, 0, 0.75], yellow: [0.9, 0.8, 0], black: [0, 0, 0], white: [1, 1, 1],
    orange: [1, 0.5, 0], gray: [0.5, 0.5, 0.5], grey: [0.5, 0.5, 0.5], purple: [0.5, 0, 0.5], brown: [0.6, 0.3, 0.1], pink: [1, 0.6, 0.7] };
  const MARKERS = ['o', '+', '*', '.', 'x', 's', 'd', '^', 'v', '>', '<', 'p', 'h', '_', '|'];

  let handleSeq = 1000;

  function parseLineSpec(s) {
    if (typeof s !== 'string') return null;
    let rest = s, color = null, style = null, marker = null;
    const styles = ['--', '-.', '-', ':'];
    let guard = 0;
    while (rest.length && guard++ < 10) {
      let hit = false;
      for (const st of styles) if (rest.startsWith(st)) { if (style) return null; style = st; rest = rest.slice(st.length); hit = true; break; }
      if (hit) continue;
      const ch = rest[0];
      if ('bgrcmykw'.indexOf(ch) >= 0) { if (color) return null; color = NAMED[ch]; rest = rest.slice(1); continue; }
      if (MARKERS.indexOf(ch) >= 0 && ch !== '_' && ch !== '|') { if (marker) return null; marker = ch === 'd' ? 'd' : ch; rest = rest.slice(1); continue; }
      return null;
    }
    if (s.length === 0) return null;
    return { color, style, marker };
  }
  function parseColor(v) {
    if (v instanceof Tensor && v.type === 'char') {
      const s = v.toStr().toLowerCase().trim();
      if (s === 'none') return 'none';
      if (s === 'flat' || s === 'interp' || s === 'auto') return s;
      if (NAMED[s]) return NAMED[s];
      const m = /^#?([0-9a-f]{6})$/.exec(s);
      if (m) { const x = parseInt(m[1], 16); return [(x >> 16 & 255) / 255, (x >> 8 & 255) / 255, (x & 255) / 255]; }
      err('无效的颜色值 \'' + s + '\'。');
    }
    if (v instanceof Tensor && v.numel === 3) { const a = Array.from(v.re); if (a.some((x) => x > 1)) return a.map((x) => x / 255); return a; }
    err('颜色必须为颜色名称或 RGB 三元组 [r g b]。');
  }
  const toF = (v) => Float64Array.from(H.tensor(v).re);
  const seq = (n) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = i + 1; return a; };

  // ---------- 图形状态 ----------
  function create(it) {
    const g = { figs: new Map(), cur: null, dirty: new Set(), closed: new Set(), handles: new Map(), it };
    g.newFigure = function (id) {
      if (id === undefined) { id = 1; while (g.figs.has(id)) id++; }
      const f = { kind: 'figure', id, hid: id, name: '', color: [1, 1, 1], axes: [], curAx: null, colormap: 'parula', sgtitle: '', numberTitle: true };
      g.figs.set(id, f);
      g.handles.set(id, f);
      g.cur = id;
      g.closed.delete(id);
      g.dirty.add(id);
      return f;
    };
    g.gcf = function () { if (g.cur === null || !g.figs.has(g.cur)) return g.newFigure(); return g.figs.get(g.cur); };
    g.newAxes = function (f, pos) {
      const ax = { kind: 'axes', hid: ++handleSeq, figId: f.id, pos: pos || null, hold: false, series: [], title: '', xlabel: '', ylabel: '', zlabel: '', legend: null,
        grid: false, minorGrid: false, box: true, xlim: null, ylim: null, zlim: null, aspect: 'normal', visible: true, tight: false, is3D: false, view: [0, 90], colorbar: false,
        xscale: 'linear', yscale: 'linear', colorIndex: 0, clim: null, ydir: 'normal', polar: false, pie: false, xticks: null, yticks: null, xticklabels: null, yticklabels: null, fontSize: 10, colormap: null };
      f.axes.push(ax); f.curAx = ax.hid;
      g.handles.set(ax.hid, ax);
      return ax;
    };
    g.gca = function () {
      const f = g.gcf();
      let ax = f.axes.find((a) => a.hid === f.curAx);
      if (!ax) ax = g.newAxes(f, null);
      return ax;
    };
    g.touch = function (obj) { const fid = obj.kind === 'figure' ? obj.id : obj.figId; if (fid !== undefined) g.dirty.add(fid); };
    // 准备添加图形对象：若未保持则清空
    g.prepare = function (ax) {
      if (!ax.hold) {
        ax.series = []; ax.colorIndex = 0; ax.legend = ax.legend && ax.legend.keep ? ax.legend : null;
        ax.is3D = false; ax.view = [0, 90]; ax.polar = false; ax.pie = false; ax.xscale = 'linear'; ax.yscale = 'linear'; ax.ydir = 'normal';
        ax.xlim = null; ax.ylim = null; ax.zlim = null; ax.clim = null; ax.aspect = ax.aspect === 'equal' && ax.keepAspect ? 'equal' : 'normal';
      }
      g.touch(ax);
    };
    g.nextColor = function (ax) { const c = COLOR_ORDER[ax.colorIndex % COLOR_ORDER.length]; ax.colorIndex++; return c; };
    g.addSeries = function (ax, s) {
      s.hid = ++handleSeq; s.figId = ax.figId; s.axId = ax.hid;
      if (s.visible === undefined) s.visible = true;
      ax.series.push(s);
      g.handles.set(s.hid, s);
      g.touch(ax);
      return s;
    };
    g.flush = function () {
      if (!it.io.figure) { g.dirty.clear(); g.closed.clear(); return; }
      for (const id of g.closed) if (it.io.closeFigure) it.io.closeFigure(id);
      g.closed.clear();
      for (const id of g.dirty) { const f = g.figs.get(id); if (f) it.io.figure(snapshot(f), id === g.cur); }
      g.dirty.clear();
    };
    g.close = function (id) {
      const f = g.figs.get(id);
      if (!f) return;
      for (const ax of f.axes) { g.handles.delete(ax.hid); for (const s of ax.series) g.handles.delete(s.hid); }
      g.figs.delete(id); g.handles.delete(id); g.dirty.delete(id); g.closed.add(id);
      if (g.cur === id) { const ids = [...g.figs.keys()]; g.cur = ids.length ? ids[ids.length - 1] : null; }
    };
    return g;
  }
  function snapshot(f) {
    // 只复制结构（类型化数组按引用传递，postMessage 时会被结构化克隆）
    return {
      id: f.id, name: f.name, color: f.color, colormap: f.colormap, sgtitle: f.sgtitle, numberTitle: f.numberTitle,
      axes: f.axes.map((ax) => Object.assign({}, ax, { series: ax.series.map((s) => Object.assign({}, s)) }))
    };
  }
  ML.graphics = { create, parseLineSpec, parseColor, COLOR_ORDER };

  const gr = (it) => it.graphics;

  // ---------- 图形句柄对象 ----------
  const PROP_MAP = {
    color: 'color', linewidth: 'lineWidth', linestyle: 'lineStyle', marker: 'marker', markersize: 'markerSize', markerfacecolor: 'markerFaceColor', markeredgecolor: 'markerEdgeColor',
    xdata: 'x', ydata: 'y', zdata: 'z', cdata: 'C', displayname: 'displayName', facecolor: 'faceColor', edgecolor: 'edgeColor', facealpha: 'faceAlpha', edgealpha: 'edgeAlpha', visible: 'visible',
    name: 'name', xlim: 'xlim', ylim: 'ylim', zlim: 'zlim', xscale: 'xscale', yscale: 'yscale', fontsize: 'fontSize', box: 'box', xgrid: 'grid', ygrid: 'grid', colormap: 'colormap',
    xtick: 'xticks', ytick: 'yticks', xticklabel: 'xticklabels', yticklabel: 'yticklabels', ydir: 'ydir', string: 'str', position: 'position', barwidth: 'width', basevalue: 'baseValue',
    sizedata: 'sizes', levellist: 'levels', title: 'title', xlabel: 'xlabel', ylabel: 'ylabel', clim: 'clim', view: 'view', numbertitle: 'numberTitle', horizontalalignment: 'hAlign', fontweight: 'fontWeight', type: 'kindName'
  };
  class GHandle {
    constructor(obj) { this.obj = obj; }
    get rows() { return 1; } get cols() { return 1; } get numel() { return 1; }
    isEmpty() { return false; }
    className() { return 'matlab.graphics.' + ({ figure: 'Figure', axes: 'axis.Axes' }[this.obj.kind] || 'chart.primitive.' + cap(this.obj.type || 'Line')); }
    clone() { return this; }
    mlDisplay() {
      const o = this.obj;
      if (o.kind === 'figure') return '  Figure (' + o.id + (o.name ? ': ' + o.name : '') + ')';
      if (o.kind === 'axes') return '  Axes' + (o.title ? ' (' + o.title + ')' : '');
      return '  ' + cap(o.type) + (o.displayName ? ' (' + o.displayName + ')' : '') + ' 图形对象';
    }
    field(name) { return getProp(this.obj, name); }
    setField(name, v) { setProp(this.obj, name, v); }
  }
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  ML.GHandle = GHandle;
  function toVal(x) {
    if (x === null || x === undefined) return new Tensor(0, 0);
    if (typeof x === 'string') return T.str(x);
    if (typeof x === 'number') return T.scalar(x);
    if (typeof x === 'boolean') return T.str(x ? 'on' : 'off');
    if (x instanceof Float64Array) return T.row(Array.from(x));
    if (Array.isArray(x)) return x.every((y) => typeof y === 'string') ? new Cell(1, x.length, x.map((y) => T.str(y))) : T.row(x);
    if (x.re) return T.fromArray(x.re, x.rows, x.cols);
    return new Tensor(0, 0);
  }
  function getProp(o, name) {
    const key = PROP_MAP[name.toLowerCase()] || name;
    if (key === 'kindName') return T.str(o.kind === 'figure' || o.kind === 'axes' ? o.kind : o.type);
    if (o.kind === 'axes' && (key === 'xlim' || key === 'ylim' || key === 'zlim') && !o[key]) return T.row(dataRange(o, key[0]));
    if (key === 'C' && o.C) return T.fromArray(o.C, o.rows, o.cols);
    if (key === 'z' && o.Z) return T.fromArray(o.Z, o.rows, o.cols);
    if (key === 'Children' || name.toLowerCase() === 'children') { if (o.kind === 'axes') return T.col(o.series.map((s) => s.hid).reverse()); return new Tensor(0, 1); }
    if (!(key in o)) err('无法识别的属性 \'' + name + '\'。');
    return toVal(o[key]);
  }
  function dataRange(ax, axis) {
    let lo = Infinity, hi = -Infinity;
    for (const s of ax.series) {
      const d = s[axis] || (axis === 'z' ? s.Z : null) || (axis === 'x' ? s.X : axis === 'y' ? s.Y : null);
      if (!d) continue;
      for (const v of d) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) return [0, 1];
    if (lo === hi) return [lo - 1, hi + 1];
    return [lo, hi];
  }
  function setProp(o, name, v) {
    const g = ML.curInterp.graphics;
    const lname = name.toLowerCase();
    const key = PROP_MAP[lname] || name;
    switch (lname) {
      case 'color': case 'markerfacecolor': case 'markeredgecolor': case 'facecolor': case 'edgecolor':
        o[key] = parseColor(v); break;
      case 'xdata': case 'ydata': case 'zdata': o[key] = toF(v); break;
      case 'cdata': o.C = toF(v); break;
      case 'visible': case 'box': o[key] = H.str(v) === 'on'; break;
      case 'xgrid': case 'ygrid': o.grid = H.str(v) === 'on'; break;
      case 'xlim': case 'ylim': case 'zlim': case 'clim': case 'view': case 'position': o[key] = H.toArray(v); break;
      case 'xtick': case 'ytick': o[key] = H.toArray(v); break;
      case 'xticklabel': case 'yticklabel': o[key] = v instanceof Cell ? v.data.map((x) => H.str(x)) : (T.isStr(v) && v.rows > 1 ? Array.from({ length: v.rows }, (x, r) => v.rowString(r).trim()) : H.str(v).split('|')); break;
      case 'linestyle': case 'marker': case 'displayname': case 'name': case 'xscale': case 'yscale': case 'ydir': case 'string': case 'title': case 'xlabel': case 'ylabel': case 'horizontalalignment': case 'fontweight':
        o[key] = v instanceof Cell ? v.data.map((x) => H.str(x)).join('\n') : H.str(v); break;
      case 'colormap': o.colormap = v instanceof Tensor && v.type !== 'char' ? { rows: v.rows, data: Array.from(v.re) } : H.str(v); break;
      case 'numbertitle': o.numberTitle = H.str(v) === 'on'; break;
      default:
        if (v instanceof Tensor && v.type !== 'char') o[key] = v.numel === 1 ? v.re[0] : Array.from(v.re);
        else if (T.isStr(v)) o[key] = v.toStr();
        else err('无法设置属性 \'' + name + '\'。');
    }
    g.touch(o);
  }
  function hobj(it, v) {
    if (v instanceof GHandle) return v.obj;
    if (v instanceof Tensor && v.numel >= 1) { const o = gr(it).handles.get(v.re[0]); if (o) return o; }
    err('无效或已删除的图形对象句柄。');
  }
  function mkHandle(o) { return new GHandle(o); }

  // 名称-值属性应用到对象
  function applyProps(obj, args, start) {
    for (let i = start; i + 1 < args.length; i += 2) {
      if (!T.isStr(args[i])) err('属性名必须为字符向量。');
      setPropLocal(obj, args[i].toStr(), args[i + 1]);
    }
  }
  function setPropLocal(o, name, v) {
    const lname = name.toLowerCase();
    if (lname === 'linewidth' || lname === 'markersize' || lname === 'facealpha' || lname === 'edgealpha' || lname === 'barwidth' || lname === 'fontsize' || lname === 'basevalue') { o[PROP_MAP[lname]] = H.num(v); return; }
    if (lname === 'filled') return;
    if (lname === 'autoscale') { o.autoscale = H.str(v) !== 'off'; return; }
    if (lname === 'autoscalefactor') { o.scale = H.num(v); return; }
    if (lname === 'levellist') { o.levels = H.toArray(v); return; }
    if (lname === 'showtext') { o.showText = H.str(v) === 'on'; return; }
    if (lname === 'labels') return;
    if (lname === 'normalization' || lname === 'binwidth' || lname === 'numbins' || lname === 'binedges') return;
    if (lname === 'meshstyle' || lname === 'linejoin' || lname === 'clipping' || lname === 'tag' || lname === 'userdata' || lname === 'parent') return;
    if (!PROP_MAP[lname]) err('无法识别的属性名称 \'' + name + '\'。');
    const g = ML.curInterp.graphics; const saveTouch = g.touch; g.touch = () => {};
    try { setProp(o, name, v); } finally { g.touch = saveTouch; }
  }

  // 解析 plot 风格参数：返回 {groups:[{x,y,z,spec}], props:index}
  function parsePlotArgs(a, dims, fname) {
    const groups = [];
    let i = 0;
    let ax = null;
    if (a.length && (a[0] instanceof GHandle && a[0].obj.kind === 'axes')) { ax = a[0].obj; i = 1; }
    let propStart = a.length;
    while (i < a.length) {
      if (T.isStr(a[i])) {
        // 不是线型说明符 → 名称-值属性开始
        propStart = i; break;
      }
      const nums = [];
      while (i < a.length && !T.isStr(a[i]) && nums.length < dims) nums.push(a[i++]);
      let spec = null;
      if (i < a.length && T.isStr(a[i])) {
        const sp = parseLineSpec(a[i].toStr());
        if (sp) { spec = sp; i++; }
      }
      groups.push({ nums, spec });
    }
    return { groups, propStart, ax };
  }
  function vecPairs(xv, yv, fname) {
    // 返回若干 [x, y] 对（处理矩阵）
    const Y = H.tensor(yv);
    if (!xv) {
      if (Y.im) return [[Float64Array.from(Y.re), Float64Array.from(Y.im)]];
      if (Y.rows === 1 || Y.cols === 1) return [[seq(Y.numel), Float64Array.from(Y.re)]];
      const out = [];
      for (let c = 0; c < Y.cols; c++) out.push([seq(Y.rows), Y.re.slice(c * Y.rows, (c + 1) * Y.rows)]);
      return out;
    }
    const X = H.tensor(xv);
    const xVec = X.rows === 1 || X.cols === 1, yVec = Y.rows === 1 || Y.cols === 1;
    if (xVec && yVec) {
      if (X.numel !== Y.numel && X.numel !== 1 && Y.numel !== 1) err(fname + ': 向量长度必须相同。');
      if (X.numel === 1 && Y.numel > 1) return [[new Float64Array(Y.numel).fill(X.re[0]), Float64Array.from(Y.re)]];
      if (Y.numel === 1 && X.numel > 1) return [[Float64Array.from(X.re), new Float64Array(X.numel).fill(Y.re[0])]];
      return [[Float64Array.from(X.re), Float64Array.from(Y.re)]];
    }
    const out = [];
    if (xVec) {
      const n = X.numel;
      if (Y.rows === n) for (let c = 0; c < Y.cols; c++) out.push([Float64Array.from(X.re), Y.re.slice(c * Y.rows, (c + 1) * Y.rows)]);
      else if (Y.cols === n) for (let r = 0; r < Y.rows; r++) { const y = new Float64Array(n); for (let c = 0; c < n; c++) y[c] = Y.re[r + c * Y.rows]; out.push([Float64Array.from(X.re), y]); }
      else err(fname + ': 向量长度必须与矩阵的某一维度一致。');
      return out;
    }
    if (yVec) {
      const n = Y.numel;
      if (X.rows === n) for (let c = 0; c < X.cols; c++) out.push([X.re.slice(c * X.rows, (c + 1) * X.rows), Float64Array.from(Y.re)]);
      else err(fname + ': 向量长度必须与矩阵的某一维度一致。');
      return out;
    }
    if (X.rows !== Y.rows || X.cols !== Y.cols) err(fname + ': 矩阵大小必须相同。');
    for (let c = 0; c < X.cols; c++) out.push([X.re.slice(c * X.rows, (c + 1) * X.rows), Y.re.slice(c * Y.rows, (c + 1) * Y.rows)]);
    return out;
  }
  function lineSeries(g, ax, x, y, z, spec) {
    const s = { type: 'line', x, y, z: z || null, color: (spec && spec.color) || null, lineStyle: spec && spec.style ? spec.style : (spec && spec.marker ? 'none' : '-'), marker: spec && spec.marker ? spec.marker : 'none', lineWidth: 0.5, markerSize: 6, markerFaceColor: 'none', displayName: '' };
    if (!s.color) s.color = g.nextColor(ax);
    return g.addSeries(ax, s);
  }

  function doPlot(a, nargout, it, opts) {
    opts = opts || {};
    const g = gr(it);
    const p = parsePlotArgs(a, opts.dims || 2, opts.name || 'plot');
    const ax = p.ax || g.gca();
    if (!opts.noPrepare) g.prepare(ax);
    if (opts.xscale) ax.xscale = opts.xscale;
    if (opts.yscale) ax.yscale = opts.yscale;
    if (opts.dims === 3 && !ax.hold) { ax.is3D = true; ax.view = [-37.5, 30]; ax.grid = true; }
    const created = [];
    for (const grp of p.groups) {
      if (opts.dims === 3) {
        if (grp.nums.length < 3) err('plot3: 需要 X、Y、Z 三个参数。');
        const [X, Y, Z] = grp.nums.map((v) => H.tensor(v));
        if (X.rows > 1 && X.cols > 1) {
          for (let c = 0; c < X.cols; c++) created.push(lineSeries(g, ax, X.re.slice(c * X.rows, (c + 1) * X.rows), Y.re.slice(c * Y.rows, (c + 1) * Y.rows), Z.re.slice(c * Z.rows, (c + 1) * Z.rows), grp.spec));
        } else created.push(lineSeries(g, ax, Float64Array.from(X.re), Float64Array.from(Y.re), Float64Array.from(Z.re), grp.spec));
        continue;
      }
      const pairs = grp.nums.length === 1 ? vecPairs(null, grp.nums[0], opts.name || 'plot') : vecPairs(grp.nums[0], grp.nums[1], opts.name || 'plot');
      for (const [x, y] of pairs) {
        let xx = x, yy = y;
        if (opts.stairs) { const r = stairsXY(x, y); xx = r[0]; yy = r[1]; }
        if (opts.polar) { ax.polar = true; }
        const s = lineSeries(g, ax, xx, yy, null, grp.spec);
        if (opts.polar) { s.polar = true; }
        created.push(s);
      }
    }
    for (const s of created) applyProps(s, a, p.propStart);
    if (opts.polar) ax.polar = true;
    if (nargout > 0) return created.length === 1 ? mkHandle(created[0]) : T.col(created.map((s) => s.hid));
    return null;
  }
  function stairsXY(x, y) {
    const n = x.length; if (n < 2) return [x, y];
    const X = new Float64Array(2 * n - 1), Y = new Float64Array(2 * n - 1);
    for (let i = 0; i < n; i++) { X[2 * i] = x[i]; Y[2 * i] = y[i]; if (i < n - 1) { X[2 * i + 1] = x[i + 1]; Y[2 * i + 1] = y[i]; } }
    return [X, Y];
  }

  def('plot', (a, n, it) => doPlot(a, n, it, { name: 'plot' }), D("plot(x,y), plot(x,y,'r--o'), plot(x1,y1,x2,y2,...)", '二维线图'));
  def('plot3', (a, n, it) => doPlot(a, n, it, { name: 'plot3', dims: 3 }), D('plot3(x,y,z)', '三维线图'));
  def('semilogx', (a, n, it) => doPlot(a, n, it, { name: 'semilogx', xscale: 'log' }), D('semilogx(x,y)', 'x 轴为对数刻度的线图'));
  def('semilogy', (a, n, it) => doPlot(a, n, it, { name: 'semilogy', yscale: 'log' }), D('semilogy(x,y)', 'y 轴为对数刻度的线图'));
  def('loglog', (a, n, it) => doPlot(a, n, it, { name: 'loglog', xscale: 'log', yscale: 'log' }), D('loglog(x,y)', '双对数刻度线图'));
  def('stairs', (a, n, it) => doPlot(a, n, it, { name: 'stairs', stairs: true }), D('stairs(x,y)', '阶梯图'));
  def('polarplot polar', (a, n, it) => doPlot(a, n, it, { name: 'polarplot', polar: true }), D('polarplot(theta,rho)', '极坐标图'));
  def('line', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.touch(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    const s = lineSeries(g, ax, toF(nums[0]), toF(nums[1]), nums[2] ? toF(nums[2]) : null, null);
    applyProps(s, a, i);
    return n > 0 ? mkHandle(s) : null;
  }, D('line(x,y)', '添加线条（不清除现有图形）'));
  def('comet', (a, n, it) => doPlot(a, n, it, { name: 'comet' }), D('comet(x,y)', '彗星图（此处显示为线图）'));
  def('animatedline', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.touch(ax);
    const s = { type: 'line', x: new Float64Array(0), y: new Float64Array(0), z: null, color: g.nextColor(ax), lineStyle: '-', marker: 'none', lineWidth: 0.5, markerSize: 6, markerFaceColor: 'none', displayName: '', maxPoints: Infinity };
    g.addSeries(ax, s);
    applyProps(s, a, 0);
    return mkHandle(s);
  }, D('h = animatedline', '创建动画线条（配合 addpoints 和 drawnow）'));
  def('addpoints', (a, n, it) => {
    const s = hobj(it, a[0]);
    const x = toF(a[1]), y = toF(a[2]);
    const cat = (p, q) => { const r = new Float64Array(p.length + q.length); r.set(p); r.set(q, p.length); return r; };
    s.x = cat(s.x, x); s.y = cat(s.y, y);
    if (a.length > 3 && !T.isStr(a[3])) s.z = cat(s.z || new Float64Array(0), toF(a[3]));
    gr(it).touch(s);
    return null;
  }, D('addpoints(h,x,y)', '向动画线条添加点'));
  def('clearpoints', (a, n, it) => { const s = hobj(it, a[0]); s.x = new Float64Array(0); s.y = new Float64Array(0); gr(it).touch(s); return null; });
  function refLine(axis) {
    return (a, n, it) => {
      const g = gr(it); const ax = g.gca(); g.touch(ax);
      const vals = H.toArray(a[0]);
      let spec = null, i = 1;
      if (a.length > 1 && T.isStr(a[1])) { spec = parseLineSpec(a[1].toStr()); if (spec) i = 2; }
      let label = '';
      if (i < a.length && T.isStr(a[i]) && !(i + 1 < a.length && PROP_MAP[a[i].toStr().toLowerCase()])) { label = a[i].toStr(); i++; }
      const out = [];
      for (const v of vals) {
        const s = g.addSeries(ax, { type: 'refline', axis, value: v, color: (spec && spec.color) || [0.15, 0.15, 0.15], lineStyle: (spec && spec.style) || '-', lineWidth: 0.5, label, displayName: label });
        applyProps(s, a, i);
        out.push(s);
      }
      return n > 0 ? mkHandle(out[0]) : null;
    };
  }
  def('xline', refLine('x'), D("xline(x,'--','标签')", '竖直参考线'));
  def('yline', refLine('y'), D("yline(y,'--','标签')", '水平参考线'));

  // ---------- 散点、柱状、杆状、面积 ----------
  def('scatter', (a, n, it) => scatterImpl(a, n, it, false), D("scatter(x,y,sz,c,'filled')", '散点图'));
  def('scatter3', (a, n, it) => scatterImpl(a, n, it, true), D("scatter3(x,y,z,sz,c,'filled')", '三维散点图'));
  function scatterImpl(a, n, it, three) {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = [];
    const need = three ? 3 : 2;
    while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    if (nums.length < need) err('scatter: 输入参数不足。');
    const x = toF(nums[0]), y = toF(nums[1]), z = three ? toF(nums[2]) : null;
    if (x.length !== y.length) err('scatter: X 和 Y 的长度必须相同。');
    const s = { type: 'scatter', x, y, z, sizes: 36, cdata: null, colors: null, color: null, filled: false, marker: 'o', displayName: '', lineWidth: 0.5, markerFaceColor: null, faceAlpha: 1 };
    const szArg = nums[need], cArg = nums[need + 1];
    if (szArg && szArg.numel) s.sizes = szArg.numel === 1 ? szArg.re[0] : Float64Array.from(szArg.re);
    if (cArg && cArg.numel) {
      if (cArg.numel === 3 && x.length !== 3) s.color = Array.from(cArg.re);
      else if (cArg.cols === 3 && cArg.rows === x.length) { s.colors = []; for (let k = 0; k < cArg.rows; k++) s.colors.push([cArg.re[k], cArg.re[k + cArg.rows], cArg.re[k + 2 * cArg.rows]]); }
      else s.cdata = Float64Array.from(cArg.re);
    }
    while (i < a.length && T.isStr(a[i])) {
      const str = a[i].toStr();
      if (str === 'filled') { s.filled = true; i++; continue; }
      const sp = parseLineSpec(str);
      if (sp && !(i + 1 < a.length && PROP_MAP[str.toLowerCase()])) { if (sp.color) s.color = sp.color; if (sp.marker) s.marker = sp.marker; i++; continue; }
      break;
    }
    if (!s.color && !s.colors && !s.cdata) s.color = g.nextColor(ax);
    if (three && !ax.hold) { ax.is3D = true; ax.view = [-37.5, 30]; ax.grid = true; }
    g.addSeries(ax, s);
    applyProps(s, a, i);
    return n > 0 ? mkHandle(s) : null;
  }
  function barImpl(a, n, it, horizontal) {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = [];
    while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    let X, Y, width = 0.8;
    if (nums.length === 1) Y = H.tensor(nums[0]);
    else if (nums.length >= 2 && nums[1].numel === 1 && nums[0].numel > 1) { Y = H.tensor(nums[0]); width = nums[1].re[0]; }
    else { X = H.tensor(nums[0]); Y = H.tensor(nums[1]); if (nums.length > 2) width = H.num(nums[2]); }
    let rows, cols, data;
    if (Y.rows === 1 || Y.cols === 1) { rows = Y.numel; cols = 1; data = Float64Array.from(Y.re); }
    else { rows = Y.rows; cols = Y.cols; data = Float64Array.from(Y.re); }
    const x = X ? Float64Array.from(X.re) : seq(rows);
    let stacked = false, color = null;
    while (i < a.length && T.isStr(a[i])) {
      const sv = a[i].toStr();
      if (sv === 'stacked') { stacked = true; i++; continue; }
      if (sv === 'grouped' || sv === 'hist' || sv === 'histc') { i++; continue; }
      const sp = parseLineSpec(sv);
      if (sp && sp.color && !(i + 1 < a.length && PROP_MAP[sv.toLowerCase()])) { color = sp.color; i++; continue; }
      break;
    }
    const colors = []; for (let c = 0; c < cols; c++) colors.push(color || g.nextColor(ax));
    const s = { type: 'bar', x, data, rows, cols, width, stacked, horizontal, colors, faceColor: null, edgeColor: [0, 0, 0], displayName: '', faceAlpha: 1, baseValue: 0 };
    g.addSeries(ax, s);
    applyProps(s, a, i);
    if (s.faceColor && s.faceColor !== 'flat') s.colors = s.colors.map(() => s.faceColor);
    return n > 0 ? mkHandle(s) : null;
  }
  def('bar', (a, n, it) => barImpl(a, n, it, false), D("bar(y), bar(x,y), bar(Y,'stacked')", '柱状图'));
  def('barh', (a, n, it) => barImpl(a, n, it, true), D('barh(y)', '水平柱状图'));
  def('stem', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    const p = parsePlotArgs(a, 2, 'stem');
    const out = [];
    let filled = false;
    for (let k = p.propStart; k < a.length; k++) if (T.isStr(a[k]) && a[k].toStr() === 'filled') { filled = true; a = a.slice(0, k).concat(a.slice(k + 1)); break; }
    for (const grp of p.groups) {
      const pairs = grp.nums.length === 1 ? vecPairs(null, grp.nums[0], 'stem') : vecPairs(grp.nums[0], grp.nums[1], 'stem');
      for (const [x, y] of pairs) {
        const s = g.addSeries(ax, { type: 'stem', x, y, color: (grp.spec && grp.spec.color) || g.nextColor(ax), marker: (grp.spec && grp.spec.marker) || 'o', lineStyle: (grp.spec && grp.spec.style) || '-', filled, lineWidth: 0.5, markerSize: 6, displayName: '', baseValue: 0 });
        out.push(s);
      }
    }
    for (const s of out) applyProps(s, a, Math.min(p.propStart, a.length));
    return n > 0 ? mkHandle(out[0]) : null;
  }, D('stem(x,y)', '火柴杆图（离散序列）'));
  def('area', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    const pairs = nums.length === 1 ? vecPairs(null, nums[0], 'area') : vecPairs(nums[0], nums[1], 'area');
    let base = null; const out = [];
    for (const [x, y] of pairs) {
      const yy = Float64Array.from(y);
      const lower = base ? Float64Array.from(base) : new Float64Array(y.length);
      if (base) for (let k = 0; k < yy.length; k++) yy[k] += base[k];
      const s = g.addSeries(ax, { type: 'area', x, y: yy, lower, color: g.nextColor(ax), faceAlpha: 1, edgeColor: [0, 0, 0], displayName: '', lineWidth: 0.5 });
      base = yy; out.push(s);
    }
    for (const s of out) { applyProps(s, a, i); if (s.faceColor) s.color = s.faceColor; }
    return n > 0 ? mkHandle(out[0]) : null;
  }, D('area(x,y)', '填充面积图'));
  def('fill patch', (a, n, it) => {
    const g = gr(it); const ax = g.gca();
    if (!ax.hold) g.prepare(ax); else g.touch(ax);
    let i = 0; const out = [];
    // fill(x1,y1,c1,x2,y2,c2,...)
    while (i + 1 < a.length && !T.isStr(a[i]) && !T.isStr(a[i + 1])) {
      const x = toF(a[i]), y = toF(a[i + 1]); i += 2;
      let color = null;
      if (i < a.length) {
        if (T.isStr(a[i]) && !PROP_MAP[a[i].toStr().toLowerCase()]) { color = parseColor(a[i]); i++; }
        else if (!T.isStr(a[i]) && a[i].numel === 3) { color = Array.from(a[i].re); i++; }
        else if (!T.isStr(a[i]) && a[i].numel === 1) { color = g.nextColor(ax); i++; }
      }
      out.push(g.addSeries(ax, { type: 'patch', x, y, color: color || g.nextColor(ax), edgeColor: [0, 0, 0], faceAlpha: 1, lineWidth: 0.5, displayName: '' }));
    }
    for (const s of out) { applyProps(s, a, i); if (s.faceColor) s.color = s.faceColor; }
    return n > 0 ? mkHandle(out[0]) : null;
  }, D("fill(x,y,'r')", '填充多边形'));
  def('rectangle', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.touch(ax);
    const nv = H.nameValue(a, 0);
    const pos = nv.position ? H.toArray(nv.position) : [0, 0, 1, 1];
    const [x, y, w, h] = pos;
    const curv = nv.curvature ? H.toArray(nv.curvature) : [0];
    let xs, ys;
    if (curv[0] > 0) { xs = []; ys = []; for (let k = 0; k <= 64; k++) { const t = 2 * Math.PI * k / 64; xs.push(x + w / 2 + w / 2 * Math.cos(t)); ys.push(y + h / 2 + h / 2 * Math.sin(t)); } }
    else { xs = [x, x + w, x + w, x, x]; ys = [y, y, y + h, y + h, y]; }
    const s = g.addSeries(ax, { type: 'patch', x: Float64Array.from(xs), y: Float64Array.from(ys), color: nv.facecolor ? parseColor(nv.facecolor) : 'none', edgeColor: nv.edgecolor ? parseColor(nv.edgecolor) : [0, 0, 0], faceAlpha: 1, lineWidth: nv.linewidth ? H.num(nv.linewidth) : 0.5, displayName: '' });
    return n > 0 ? mkHandle(s) : null;
  }, D("rectangle('Position',[x y w h],'Curvature',[1 1])", '矩形（或椭圆）'));
  def('errorbar', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    let x, y, lo, hi;
    if (nums.length === 2) { y = toF(nums[0]); x = seq(y.length); lo = hi = toF(nums[1]); }
    else if (nums.length === 3) { x = toF(nums[0]); y = toF(nums[1]); lo = hi = toF(nums[2]); }
    else { x = toF(nums[0]); y = toF(nums[1]); lo = toF(nums[2]); hi = toF(nums[3]); }
    let spec = null; if (i < a.length && T.isStr(a[i])) { spec = parseLineSpec(a[i].toStr()); if (spec) i++; }
    const s = g.addSeries(ax, { type: 'errorbar', x, y, lo, hi, color: (spec && spec.color) || g.nextColor(ax), lineStyle: (spec && spec.style) || '-', marker: (spec && spec.marker) || 'none', lineWidth: 0.5, markerSize: 6, displayName: '' });
    applyProps(s, a, i);
    return n > 0 ? mkHandle(s) : null;
  }, D('errorbar(x,y,err)', '误差条图'));
  def('pie', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    const v = H.toArray(a[0]).map(Math.abs);
    let labels = null;
    for (let k = 1; k < a.length; k++) if (a[k] instanceof Cell) labels = a[k].data.map((x) => H.str(x));
    const explode = a.length > 1 && a[1] instanceof Tensor && a[1].type !== 'char' ? H.toArray(a[1]) : null;
    const total = v.reduce((s, x) => s + x, 0);
    const frac = total > 1 ? v.map((x) => x / total) : v.slice();
    if (!labels) labels = frac.map((f) => { const p = f * 100; return (p < 1 && p > 0 ? '< 1' : Math.round(p)) + '%'; });
    const colors = v.map((x, k) => k);
    ax.pie = true; ax.aspect = 'equal';
    const s = g.addSeries(ax, { type: 'pie', frac, labels, explode, colors, displayName: '' });
    return n > 0 ? mkHandle(s) : null;
  }, D("pie(x), pie(x,labels)", '饼图'));

  // ---------- 直方图 ----------
  def('hist', (a, nargout, it) => {
    const data = H.tensor(a[0]);
    const vals = Array.from(data.re);
    let centers;
    if (a.length > 1 && a[1].numel > 1) centers = H.toArray(a[1]);
    else {
      const nb = a.length > 1 ? H.int(a[1]) : 10;
      const fin = vals.filter(Number.isFinite);
      let mn = Math.min(...fin), mx = Math.max(...fin);
      if (!fin.length) { mn = 0; mx = 1; }
      if (mn === mx) { mn -= nb / 2; mx += nb / 2; }
      const w = (mx - mn) / nb;
      centers = []; for (let k = 0; k < nb; k++) centers.push(mn + w * (k + 0.5));
    }
    const edges = [-Infinity]; for (let k = 0; k < centers.length - 1; k++) edges.push((centers[k] + centers[k + 1]) / 2); edges.push(Infinity);
    const counts = new Array(centers.length).fill(0);
    for (const v of vals) { if (Number.isNaN(v)) continue; for (let k = 0; k < counts.length; k++) if (v >= edges[k] && (v < edges[k + 1] || (k === counts.length - 1))) { counts[k]++; break; } }
    if (nargout > 0) return [T.row(counts), T.row(centers)];
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    g.addSeries(ax, { type: 'bar', x: Float64Array.from(centers), data: Float64Array.from(counts), rows: counts.length, cols: 1, width: 1, stacked: false, horizontal: false, colors: [g.nextColor(ax)], edgeColor: [0, 0, 0], displayName: '', faceAlpha: 1, baseValue: 0 });
    return null;
  }, D('hist(y,nbins), [n,x] = hist(y)', '直方图（旧版）'));
  def('histogram', (a, nargout, it) => {
    const vals = Array.from(H.tensor(a[0]).re);
    let edges = null;
    const nv = H.nameValue(a, a.length > 1 && !T.isStr(a[1]) ? 2 : 1);
    if (a.length > 1 && !T.isStr(a[1])) { const b = H.toArray(a[1]); edges = b.length === 1 ? ML.hist.autoEdges(vals, b[0]) : b; }
    if (nv.numbins) edges = ML.hist.autoEdges(vals, H.int(nv.numbins));
    if (nv.binedges) edges = H.toArray(nv.binedges);
    if (nv.binwidth) { const w = H.num(nv.binwidth); const fin = vals.filter(Number.isFinite); const lo = Math.floor(Math.min(...fin) / w) * w; edges = []; for (let v = lo; v <= Math.max(...fin) + w * 1e-9; v += w) edges.push(v); edges.push(edges[edges.length - 1] + w); if (edges[edges.length - 2] > Math.max(...fin)) edges.pop(); }
    if (!edges) edges = ML.hist.autoEdges(vals);
    let counts = ML.hist.countBins(vals, edges);
    const norm = nv.normalization ? H.str(nv.normalization).toLowerCase() : 'count';
    const tot = vals.filter(Number.isFinite).length;
    if (norm === 'probability') counts = counts.map((c) => c / tot);
    else if (norm === 'pdf') counts = counts.map((c, k) => c / tot / (edges[k + 1] - edges[k]));
    else if (norm === 'cdf') { let s = 0; counts = counts.map((c) => (s += c) / tot); }
    else if (norm === 'cumcount') { let s = 0; counts = counts.map((c) => (s += c)); }
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    const s = g.addSeries(ax, { type: 'histogram', edges: Float64Array.from(edges), counts: Float64Array.from(counts), color: nv.facecolor ? parseColor(nv.facecolor) : g.nextColor(ax), edgeColor: [0, 0, 0], faceAlpha: nv.facealpha ? H.num(nv.facealpha) : 0.6, displayName: '' });
    if (nv.displayname) s.displayName = H.str(nv.displayname);
    if (nargout > 0) {
      const h = mkHandle(s);
      return h;
    }
    return null;
  }, D("histogram(x,nbins,'Normalization','pdf')", '直方图'));

  // ---------- 函数绘图 ----------
  function vectorizeStr(s) { return s.replace(/\.?\*/g, '.*').replace(/\.?\//g, './').replace(/\.?\^/g, '.^'); }
  function toFunc(it, f, vars) {
    if (f instanceof FuncHandle) return f;
    if (T.isStr(f)) {
      const s = f.toStr();
      const found = (vars || ['x']).filter((v) => new RegExp('\\b' + v + '\\b').test(s));
      const params = found.length ? found : (vars || ['x']).slice(0, 1);
      return it.evalString('@(' + params.join(',') + ') ' + vectorizeStr(s), it.base, 1)[0];
    }
    err('需要函数句柄或表达式字符串。');
  }
  function sampleFn(it, fh, lo, hi, n) {
    const xs = new Float64Array(n);
    for (let k = 0; k < n; k++) xs[k] = lo + (hi - lo) * k / (n - 1);
    let ys;
    try {
      const r = it.call1(fh, [T.row(Array.from(xs))]);
      if (r instanceof Tensor && r.numel === n) ys = Float64Array.from(r.re);
    } catch (e) { if (e instanceof ML.MError && e.identifier === 'MATLAB:interrupt') throw e; }
    if (!ys) { ys = new Float64Array(n); for (let k = 0; k < n; k++) { const r = it.call1(fh, [T.scalar(xs[k])]); ys[k] = r.re[0]; } }
    // 在跳变处断开（例如 tan）
    const fin = Array.from(ys).filter(Number.isFinite).sort((p, q) => p - q);
    if (fin.length > 10) {
      const q1 = fin[Math.floor(fin.length * 0.05)], q3 = fin[Math.floor(fin.length * 0.95)];
      const span = (q3 - q1) || 1;
      for (let k = 1; k < n; k++) if (Math.abs(ys[k] - ys[k - 1]) > 8 * span && Math.sign(ys[k]) !== Math.sign(ys[k - 1])) ys[k - 1] = NaN;
    }
    return [xs, ys];
  }
  def('fplot', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    const fh = toFunc(it, a[0]);
    let lim = [-5, 5], i = 1;
    if (a.length > 1 && a[1] instanceof Tensor && a[1].type !== 'char') { lim = H.toArray(a[1]); i = 2; }
    // 参数方程 fplot(fx, fy, lim)
    if (a.length > 1 && a[1] instanceof FuncHandle) {
      const fy = a[1]; lim = a.length > 2 && !T.isStr(a[2]) ? H.toArray(a[2]) : [-5, 5]; i = a.length > 2 && !T.isStr(a[2]) ? 3 : 2;
      const [ts, xs] = sampleFn(it, fh, lim[0], lim[1], 600); const [, ys] = sampleFn(it, fy, lim[0], lim[1], 600); void ts;
      let spec = null; if (i < a.length && T.isStr(a[i])) { spec = parseLineSpec(a[i].toStr()); if (spec) i++; }
      const s = lineSeries(g, ax, xs, ys, null, spec); applyProps(s, a, i);
      return n > 0 ? mkHandle(s) : null;
    }
    let spec = null; if (i < a.length && T.isStr(a[i])) { spec = parseLineSpec(a[i].toStr()); if (spec) i++; }
    const [xs, ys] = sampleFn(it, fh, lim[0], lim[1], 600);
    const s = lineSeries(g, ax, xs, ys, null, spec);
    s.displayName = fh.text.replace(/^@\([^)]*\)/, '');
    applyProps(s, a, i);
    ax.xlim = lim.slice(0, 2);
    return n > 0 ? mkHandle(s) : null;
  }, D("fplot(f,[a b]), fplot(@(x) sin(x))", '绘制函数图像'));
  function implicitPlot(a, n, it, fname) {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    const fh = toFunc(it, a[0], ['x', 'y']);
    let lim = [-5, 5, -5, 5];
    if (a.length > 1 && a[1] instanceof Tensor && a[1].type !== 'char') { const l = H.toArray(a[1]); lim = l.length === 2 ? [l[0], l[1], l[0], l[1]] : l; }
    const N = 160;
    const xs = [], ys = [];
    for (let k = 0; k < N; k++) { xs.push(lim[0] + (lim[1] - lim[0]) * k / (N - 1)); ys.push(lim[2] + (lim[3] - lim[2]) * k / (N - 1)); }
    const [X, Y] = ML.builtins.meshgrid([T.row(xs), T.row(ys)], 2);
    let Z;
    try { Z = H.tensor(it.call1(fh, [X, Y])); if (Z.numel !== X.numel) throw new Error(); }
    catch (e) { Z = new Tensor(N, N); for (let k = 0; k < N * N; k++) Z.re[k] = H.num(it.call1(fh, [T.scalar(X.re[k]), T.scalar(Y.re[k])])); }
    const s = g.addSeries(ax, { type: 'contour', X: Float64Array.from(X.re), Y: Float64Array.from(Y.re), Z: Float64Array.from(Z.re), rows: N, cols: N, levels: [0], filled: false, lineColor: g.nextColor(ax), lineWidth: 1, displayName: fh.text.replace(/^@\([^)]*\)/, '') });
    ax.xlim = [lim[0], lim[1]]; ax.ylim = [lim[2], lim[3]];
    applyProps(s, a, a.length > 1 && !T.isStr(a[1]) ? 2 : 1);
    return n > 0 ? mkHandle(s) : null;
  }
  def('fimplicit', (a, n, it) => implicitPlot(a, n, it, 'fimplicit'), D("fimplicit(@(x,y) x.^2+y.^2-1)", '绘制隐函数 f(x,y)=0'));
  def('ezplot', (a, n, it) => {
    if (T.isStr(a[0]) && /\by\b/.test(a[0].toStr())) return implicitPlot(a, n, it, 'ezplot');
    if (a[0] instanceof FuncHandle && a[0].params.length === 2) return implicitPlot(a, n, it, 'ezplot');
    const args = a.slice();
    if (args.length === 1) args.push(T.row([-2 * Math.PI, 2 * Math.PI]));
    const r = ML.builtins.fplot(args, n, it);
    const ax = it.graphics.gca();
    if (!ax.title) ax.title = T.isStr(a[0]) ? a[0].toStr() : a[0].text.replace(/^@\([^)]*\)/, '');
    return r;
  }, D("ezplot('sin(x)/x'), ezplot('x^2+y^2-4')", '简易函数绘图（支持隐函数）'));
  function surfFn(a, n, it, kind) {
    const fh = toFunc(it, a[0], ['x', 'y']);
    let lim = [-5, 5, -5, 5];
    if (a.length > 1 && a[1] instanceof Tensor && a[1].type !== 'char') { const l = H.toArray(a[1]); lim = l.length === 2 ? [l[0], l[1], l[0], l[1]] : l; }
    const N = 40; const xs = [], ys = [];
    for (let k = 0; k < N; k++) { xs.push(lim[0] + (lim[1] - lim[0]) * k / (N - 1)); ys.push(lim[2] + (lim[3] - lim[2]) * k / (N - 1)); }
    const [X, Y] = ML.builtins.meshgrid([T.row(xs), T.row(ys)], 2);
    let Z;
    try { Z = H.tensor(it.call1(fh, [X, Y])); if (Z.numel !== X.numel) throw new Error(); }
    catch (e) { Z = new Tensor(N, N); for (let k = 0; k < N * N; k++) Z.re[k] = H.num(it.call1(fh, [T.scalar(X.re[k]), T.scalar(Y.re[k])])); }
    return surfImpl([X, Y, Z], n, it, kind);
  }
  def('fsurf ezsurf', (a, n, it) => surfFn(a, n, it, 'surf'), D('fsurf(@(x,y) sin(x)+cos(y))', '绘制二元函数曲面'));
  def('fmesh ezmesh', (a, n, it) => surfFn(a, n, it, 'mesh'), D('fmesh(f)', '绘制二元函数网格面'));
  def('fcontour ezcontour', (a, n, it) => {
    const fh = toFunc(it, a[0], ['x', 'y']);
    let lim = [-5, 5, -5, 5];
    if (a.length > 1 && a[1] instanceof Tensor) { const l = H.toArray(a[1]); lim = l.length === 2 ? [l[0], l[1], l[0], l[1]] : l; }
    const N = 80; const xs = [], ys = [];
    for (let k = 0; k < N; k++) { xs.push(lim[0] + (lim[1] - lim[0]) * k / (N - 1)); ys.push(lim[2] + (lim[3] - lim[2]) * k / (N - 1)); }
    const [X, Y] = ML.builtins.meshgrid([T.row(xs), T.row(ys)], 2);
    const Z = H.tensor(it.call1(fh, [X, Y]));
    return contourImpl([X, Y, Z], n, it, false);
  }, D('fcontour(f)', '绘制二元函数等高线'));

  // ---------- 曲面与等高线 ----------
  function gridArgs(nums, fname) {
    let X, Y, Z, Cm = null;
    if (nums.length === 1 || nums.length === 2) {
      Z = H.tensor(nums[0]);
      if (nums.length === 2) Cm = H.tensor(nums[1]);
      const xs = [], ys = []; for (let j = 1; j <= Z.cols; j++) xs.push(j); for (let i = 1; i <= Z.rows; i++) ys.push(i);
      [X, Y] = ML.builtins.meshgrid([T.row(xs), T.row(ys)], 2);
    } else {
      X = H.tensor(nums[0]); Y = H.tensor(nums[1]); Z = H.tensor(nums[2]);
      if (nums.length > 3) Cm = H.tensor(nums[3]);
      if ((X.rows === 1 || X.cols === 1) && (Y.rows === 1 || Y.cols === 1) && !(Z.rows === 1 || Z.cols === 1) || (X.numel !== Z.numel)) {
        if (X.numel !== Z.cols || Y.numel !== Z.rows) err(fname + ': X 的长度必须等于 Z 的列数，Y 的长度必须等于 Z 的行数。');
        [X, Y] = ML.builtins.meshgrid([X, Y], 2);
      }
    }
    if (Z.rows === 1 || Z.cols === 1) err(fname + ': Z 必须为矩阵（而不是向量）。可先使用 meshgrid 生成网格。');
    return { X: Float64Array.from(X.re), Y: Float64Array.from(Y.re), Z: Float64Array.from(Z.re), C: Cm ? Float64Array.from(Cm.re) : null, rows: Z.rows, cols: Z.cols };
  }
  function surfImpl(a, n, it, kind) {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    const gd = gridArgs(nums, kind);
    const s = Object.assign({ type: 'surface', kind, edgeColor: kind === 'mesh' ? 'flat' : [0, 0, 0], faceColor: kind === 'mesh' ? 'bg' : 'flat', faceAlpha: 1, lineWidth: 0.5, displayName: '' }, gd);
    if (kind === 'pcolor') { s.faceColor = 'flat'; s.edgeColor = [0, 0, 0]; }
    g.addSeries(ax, s);
    applyProps(s, a, i);
    if (!ax.hold || ax.series.length === 1) {
      if (kind === 'pcolor') { ax.is3D = false; ax.view = [0, 90]; ax.tight = true; }
      else { ax.is3D = true; ax.view = [-37.5, 30]; ax.grid = true; }
    }
    return n > 0 ? mkHandle(s) : null;
  }
  def('surf surfc', (a, n, it) => surfImpl(a, n, it, 'surf'), D('surf(X,Y,Z), surf(Z)', '三维曲面图'));
  def('mesh meshc meshz waterfall', (a, n, it) => surfImpl(a, n, it, 'mesh'), D('mesh(X,Y,Z)', '三维网格图'));
  def('pcolor', (a, n, it) => surfImpl(a, n, it, 'pcolor'), D('pcolor(X,Y,C)', '伪彩色图'));
  function contourImpl(a, n, it, filled, three) {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    let levels = 10;
    if (nums.length === 2 || nums.length === 4) { const lv = H.tensor(nums.pop()); levels = lv.numel === 1 ? lv.re[0] : Array.from(lv.re); if (lv.numel === 2 && lv.re[0] === lv.re[1]) levels = [lv.re[0]]; }
    const gd = gridArgs(nums, 'contour');
    let spec = null; if (i < a.length && T.isStr(a[i])) { spec = parseLineSpec(a[i].toStr()); if (spec) i++; }
    const s = Object.assign({ type: 'contour', levels, filled: !!filled, three: !!three, lineColor: spec && spec.color ? spec.color : null, lineStyle: spec && spec.style ? spec.style : '-', lineWidth: 0.5, showText: false, displayName: '' }, gd);
    g.addSeries(ax, s);
    applyProps(s, a, i);
    if (three && !ax.hold) { ax.is3D = true; ax.view = [-37.5, 30]; ax.grid = true; }
    return n > 0 ? mkHandle(s) : null;
  }
  def('contour', (a, n, it) => contourImpl(a, n, it, false), D('contour(X,Y,Z,n), contour(Z)', '等高线图'));
  def('contourf', (a, n, it) => contourImpl(a, n, it, true), D('contourf(X,Y,Z,n)', '填充等高线图'));
  def('contour3', (a, n, it) => contourImpl(a, n, it, false, true), D('contour3(X,Y,Z)', '三维等高线图'));
  def('clabel', (a, n, it) => { if (a.length && a[a.length - 1] instanceof GHandle) a[a.length - 1].obj.showText = true; else { const ax = gr(it).gca(); for (const s of ax.series) if (s.type === 'contour') s.showText = true; gr(it).touch(ax); } return null; }, D('clabel(C,h)', '等高线标签'));
  def('quiver quiver3', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    let X, Y, U, V, scale = 1;
    if (nums.length === 2 || nums.length === 3) {
      U = H.tensor(nums[0]); V = H.tensor(nums[1]); if (nums.length === 3) scale = H.num(nums[2]);
      const xs = [], ys = []; for (let j = 1; j <= U.cols; j++) xs.push(j); for (let r = 1; r <= U.rows; r++) ys.push(r);
      [X, Y] = ML.builtins.meshgrid([T.row(xs), T.row(ys)], 2);
    } else {
      X = H.tensor(nums[0]); Y = H.tensor(nums[1]); U = H.tensor(nums[2]); V = H.tensor(nums[3]); if (nums.length > 4) scale = H.num(nums[4]);
      if (X.numel !== U.numel) [X, Y] = ML.builtins.meshgrid([X, Y], 2);
    }
    let spec = null; if (i < a.length && T.isStr(a[i])) { spec = parseLineSpec(a[i].toStr()); if (spec) i++; }
    const s = g.addSeries(ax, { type: 'quiver', x: Float64Array.from(X.re), y: Float64Array.from(Y.re), u: Float64Array.from(U.re), v: Float64Array.from(V.re), scale, autoscale: scale !== 0, color: (spec && spec.color) || g.nextColor(ax), lineWidth: 0.5, displayName: '' });
    applyProps(s, a, i);
    return n > 0 ? mkHandle(s) : null;
  }, D('quiver(X,Y,U,V)', '向量场箭头图'));
  function imageImpl(a, n, it, scaled, name) {
    const g = gr(it); const ax = g.gca(); g.prepare(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i])) nums.push(a[i++]);
    let Cm, xr = null, yr = null, clim = null;
    if (nums.length >= 3) { xr = H.toArray(nums[0]); yr = H.toArray(nums[1]); Cm = H.tensor(nums[2]); if (nums[3]) clim = H.toArray(nums[3]); }
    else { Cm = H.tensor(nums[0]); if (nums[1]) clim = H.toArray(nums[1]); }
    const R = Cm.rows, Cc = Cm.cols;
    const x0 = xr ? xr[0] : 1, x1 = xr ? xr[xr.length - 1] : Cc;
    const y0 = yr ? yr[0] : 1, y1 = yr ? yr[yr.length - 1] : R;
    let isGray = false;
    if (name === 'imshow') { isGray = true; scaled = false; if (Cm.type === 'uint8') clim = [0, 255]; else if (!clim) clim = [0, 1]; ax.aspect = 'equal'; ax.visible = false; }
    const s = g.addSeries(ax, { type: 'image', C: Float64Array.from(Cm.re), rows: R, cols: Cc, x: [x0, x1], y: [y0, y1], scaled, gray: isGray, clim, displayName: '' });
    ax.ydir = 'reverse'; ax.tight = true;
    if (clim) ax.clim = clim;
    applyProps(s, a, i);
    return n > 0 ? mkHandle(s) : null;
  }
  def('imagesc', (a, n, it) => imageImpl(a, n, it, true, 'imagesc'), D('imagesc(C), imagesc(x,y,C)', '缩放颜色的图像显示（热图）'));
  def('image', (a, n, it) => imageImpl(a, n, it, false, 'image'), D('image(C)', '图像显示（直接颜色映射索引）'));
  def('imshow', (a, n, it) => imageImpl(a, n, it, false, 'imshow'), D('imshow(I)', '显示灰度图像'));
  def('heatmap', (a, n, it) => {
    const Cm = H.tensor(a[a.length === 1 ? 0 : (a.length >= 3 && !T.isStr(a[2]) ? 2 : 0)]);
    const r = imageImpl([Cm], n, it, true, 'heatmap');
    const ax = gr(it).gca(); ax.colorbar = true; ax.heat = true;
    if (a.length >= 3 && a[0] instanceof Cell) { ax.xticks = a[0].data.map((x, i) => i + 1); ax.xticklabels = a[0].data.map((x) => H.str(x)); ax.yticks = a[1].data.map((x, i) => i + 1); ax.yticklabels = a[1].data.map((x) => H.str(x)); }
    return r;
  }, D('heatmap(C)', '热图'));

  // ---------- 文字 ----------
  def('text', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.touch(ax);
    let i = 0; const nums = []; while (i < a.length && !T.isStr(a[i]) && !(a[i] instanceof Cell)) nums.push(a[i++]);
    const strArg = a[i++];
    const strs = strArg instanceof Cell ? strArg.data.map((x) => H.str(x)) : [H.str(strArg)];
    const xs = H.toArray(nums[0]), ys = H.toArray(nums[1]), zs = nums.length > 2 ? H.toArray(nums[2]) : null;
    const out = [];
    for (let k = 0; k < xs.length; k++) {
      const s = g.addSeries(ax, { type: 'text', x: xs[k], y: ys[k], z: zs ? zs[k] : null, str: strs.length === xs.length ? strs[k] : strs.join('\n'), color: [0, 0, 0], fontSize: 10, hAlign: 'left', fontWeight: 'normal', displayName: '' });
      applyProps(s, a, i);
      out.push(s);
      if (strs.length !== xs.length) break;
    }
    return n > 0 ? mkHandle(out[0]) : null;
  }, D("text(x,y,'文字')", '添加文字说明（支持 TeX 如 \\alpha, x^2）'));
  function textArg(v) { if (v instanceof Cell) return v.data.map((x) => H.str(x)).join('\n'); if (T.isStr(v) && v.rows > 1) return Array.from({ length: v.rows }, (x, r) => v.rowString(r).trimEnd()).join('\n'); if (v instanceof Tensor && v.type !== 'char') return ML.fmt.gStr(v.re[0], 5); return H.str(v); }
  function labelFn(field) {
    return (a, n, it) => {
      const g = gr(it);
      let ax, i = 0;
      if (a.length && a[0] instanceof GHandle) { ax = a[0].obj; i = 1; } else ax = g.gca();
      ax[field] = a.length > i ? textArg(a[i]) : '';
      for (let k = i + 1; k + 1 < a.length; k += 2) if (T.isStr(a[k]) && a[k].toStr().toLowerCase() === 'fontsize') ax[field + 'Size'] = H.num(a[k + 1]);
      g.touch(ax);
      return null;
    };
  }
  def('title', labelFn('title'), D("title('标题')", '添加标题'));
  def('subtitle', labelFn('subtitle'), D("subtitle('副标题')", '添加副标题'));
  def('xlabel', labelFn('xlabel'), D("xlabel('x 轴')", 'x 轴标签'));
  def('ylabel', labelFn('ylabel'), D("ylabel('y 轴')", 'y 轴标签'));
  def('zlabel', labelFn('zlabel'), D("zlabel('z 轴')", 'z 轴标签'));
  def('sgtitle suptitle', (a, n, it) => { const f = gr(it).gcf(); f.sgtitle = textArg(a[0]); gr(it).touch(f); return null; }, D("sgtitle('总标题')", '子图网格的总标题'));
  def('legend', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); g.touch(ax);
    let labels = [], loc = 'northeast', i = 0;
    if (a.length === 1 && T.isStr(a[0]) && /^(off|hide)$/i.test(a[0].toStr())) { ax.legend = null; return null; }
    if (a.length === 1 && T.isStr(a[0]) && /^(show|on|toggle|boxoff|boxon)$/i.test(a[0].toStr())) { if (/boxoff/i.test(a[0].toStr())) { if (ax.legend) ax.legend.box = false; return null; } ax.legend = ax.legend || { labels: null, location: loc, box: true }; return null; }
    if (a.length && a[0] instanceof Cell) { labels = a[0].data.map((x) => H.str(x)); i = 1; }
    else { while (i < a.length && T.isStr(a[i]) && !/^(location|orientation|fontsize|box|numcolumns|autoupdate|textcolor)$/i.test(a[i].toStr())) labels.push(a[i++].toStr()); }
    let orient = 'vertical', box = true;
    for (; i + 1 < a.length; i += 2) {
      const k = H.str(a[i]).toLowerCase();
      if (k === 'location') loc = H.str(a[i + 1]).toLowerCase();
      else if (k === 'orientation') orient = H.str(a[i + 1]).toLowerCase();
      else if (k === 'box') box = H.str(a[i + 1]) === 'on';
    }
    if (a.length === 1 && T.isStr(a[0]) && a[0].toStr().toLowerCase() === 'location') labels = [];
    ax.legend = { labels: labels.length ? labels : null, location: loc, orientation: orient, box };
    return null;
  }, D("legend('a','b'), legend({'a','b'},'Location','best')", '添加图例'));
  def('colorbar', (a, n, it) => { const g = gr(it); const ax = g.gca(); ax.colorbar = !(a.length && T.isStr(a[0]) && a[0].toStr() === 'off'); g.touch(ax); return null; }, D('colorbar', '显示颜色栏'));
  def('colormap', (a, nargout, it) => {
    const g = gr(it); const f = g.gcf();
    if (!a.length) return T.str(typeof f.colormap === 'string' ? f.colormap : 'custom');
    const v = a[a.length - 1];
    if (T.isStr(v)) f.colormap = v.toStr().toLowerCase();
    else { const M = H.tensor(v); if (M.cols !== 3) err('colormap: 颜色图必须为 n×3 矩阵。'); f.colormap = { rows: M.rows, data: Array.from(M.re) }; }
    for (const ax of f.axes) ax.colormap = null;
    g.touch(f);
    return null;
  }, D("colormap jet | parula | hot | gray | cool | hsv | turbo | viridis", '设置颜色图'));
  const CMAP_NAMES = ['parula', 'jet', 'hot', 'gray', 'cool', 'hsv', 'turbo', 'viridis', 'spring', 'summer', 'autumn', 'winter', 'bone', 'copper', 'pink', 'lines'];
  for (const nm of CMAP_NAMES) {
    def(nm, (a) => {
      const n = a.length ? H.int(a[0]) : 64;
      const cm = ML.colormaps ? ML.colormaps.sample(nm, n) : null;
      if (!cm) err('颜色图不可用。');
      const t = new Tensor(n, 3);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) t.re[i + c * n] = cm[i][c];
      return t;
    }, { cat: '绘图', syn: nm + '(n)', desc: nm + ' 颜色图矩阵（n×3）' });
  }
  def('caxis clim', (a, n, it) => { const g = gr(it); const ax = g.gca(); if (!a.length) return T.row(ax.clim || [0, 1]); if (T.isStr(a[0])) ax.clim = null; else ax.clim = H.toArray(a[0]); g.touch(ax); return null; }, D('caxis([cmin cmax])', '设置颜色范围'));
  def('shading', (a, n, it) => {
    const g = gr(it); const ax = g.gca(); const mode = H.str(a[0]).toLowerCase();
    for (const s of ax.series) if (s.type === 'surface') {
      if (mode === 'flat') { s.edgeColor = 'none'; s.faceColor = 'flat'; }
      else if (mode === 'interp') { s.edgeColor = 'none'; s.faceColor = 'interp'; }
      else { s.edgeColor = [0, 0, 0]; s.faceColor = 'flat'; }
    }
    g.touch(ax); return null;
  }, D('shading flat | interp | faceted', '设置曲面着色方式'));
  def('lighting material camlight light alpha brighten', () => null);
  def('view', (a, n, it) => {
    const g = gr(it); const ax = g.gca();
    if (!a.length) return T.row(ax.view);
    const v = H.toArray(a[0]);
    if (v.length === 1 && a.length === 1) { if (v[0] === 2) { ax.view = [0, 90]; } else { ax.view = [-37.5, 30]; ax.is3D = true; } }
    else if (v.length >= 2) { ax.view = [v[0], v[1]]; ax.is3D = true; }
    else { ax.view = [H.num(a[0]), H.num(a[1])]; ax.is3D = true; }
    if (ax.view[1] === 90 && ax.view[0] === 0 && !ax.series.some((s) => s.type === 'surface' || s.z)) ax.is3D = false;
    g.touch(ax);
    return null;
  }, D('view(az,el), view(2), view(3)', '设置三维视角'));
  def('rotate3d zoom pan datacursormode grid_minor brush linkaxes linkprop', () => null);

  // ---------- 坐标区 ----------
  def('hold', (a, n, it) => {
    const g = gr(it); const ax = g.gca();
    if (!a.length) ax.hold = !ax.hold;
    else { const s = H.str(a[a.length - 1]).toLowerCase(); ax.hold = s === 'on' || s === 'all'; }
    return null;
  }, D('hold on | off', '保留当前图形以添加新图形'));
  def('ishold', (a, n, it) => T.bool(gr(it).gca().hold), D('ishold', '是否保持图形'));
  def('grid', (a, n, it) => {
    const g = gr(it); const ax = g.gca();
    if (!a.length) ax.grid = !ax.grid;
    else { const s = H.str(a[a.length - 1]).toLowerCase(); if (s === 'minor') { ax.minorGrid = !ax.minorGrid; ax.grid = true; } else { ax.grid = s === 'on'; if (s === 'off') ax.minorGrid = false; } }
    g.touch(ax); return null;
  }, D('grid on | off | minor', '显示网格线'));
  def('box', (a, n, it) => { const g = gr(it); const ax = g.gca(); ax.box = a.length ? H.str(a[0]) === 'on' : !ax.box; g.touch(ax); return null; }, D('box on | off', '显示坐标区边框'));
  def('axis', (a, nargout, it) => {
    const g = gr(it); const ax = g.gca(); g.touch(ax);
    if (!a.length) { const xl = ax.xlim || dataRange(ax, 'x'), yl = ax.ylim || dataRange(ax, 'y'); return T.row(xl.concat(yl)); }
    for (const v of a) {
      if (T.isStr(v)) {
        const s = v.toStr().toLowerCase();
        switch (s) {
          case 'equal': ax.aspect = 'equal'; break;
          case 'image': ax.aspect = 'equal'; ax.tight = true; break;
          case 'square': ax.aspect = 'square'; break;
          case 'normal': ax.aspect = 'normal'; break;
          case 'tight': ax.tight = true; ax.xlim = null; ax.ylim = null; break;
          case 'auto': ax.xlim = null; ax.ylim = null; ax.zlim = null; ax.tight = false; break;
          case 'off': ax.visible = false; break;
          case 'on': ax.visible = true; break;
          case 'ij': ax.ydir = 'reverse'; break;
          case 'xy': ax.ydir = 'normal'; break;
          case 'vis3d': case 'manual': case 'fill': break;
          default: err('axis: 无法识别的选项 \'' + s + '\'。');
        }
      } else {
        const l = H.toArray(v);
        if (l.length < 4) err('axis: 范围必须为 [xmin xmax ymin ymax] 形式。');
        ax.xlim = [l[0], l[1]]; ax.ylim = [l[2], l[3]];
        if (l.length >= 6) ax.zlim = [l[4], l[5]];
      }
    }
    return null;
  }, D("axis([xmin xmax ymin ymax]), axis equal | tight | off | square", '设置坐标轴范围和外观'));
  function limFn(key) {
    return (a, nargout, it) => {
      const g = gr(it); const ax = g.gca();
      if (!a.length) return T.row(ax[key] || dataRange(ax, key[0]));
      if (T.isStr(a[0])) { ax[key] = null; g.touch(ax); return null; }
      const l = H.toArray(a[0]); if (l.length !== 2 || !(l[0] < l[1])) err(key + ': 范围必须为递增的二元向量。');
      ax[key] = l; g.touch(ax); return null;
    };
  }
  def('xlim', limFn('xlim'), D('xlim([xmin xmax])', '设置 x 轴范围'));
  def('ylim', limFn('ylim'), D('ylim([ymin ymax])', '设置 y 轴范围'));
  def('zlim', limFn('zlim'), D('zlim([zmin zmax])', '设置 z 轴范围'));
  function tickFn(key) {
    return (a, n, it) => { const g = gr(it); const ax = g.gca(); if (!a.length) return T.row(ax[key] || []); if (T.isStr(a[0])) ax[key] = null; else ax[key] = H.toArray(a[0]); g.touch(ax); return null; };
  }
  def('xticks', tickFn('xticks'), D('xticks([...])', '设置 x 轴刻度值'));
  def('yticks', tickFn('yticks'), D('yticks([...])', '设置 y 轴刻度值'));
  function tickLabelFn(key) {
    return (a, n, it) => { const g = gr(it); const ax = g.gca(); const v = a[0]; ax[key] = v instanceof Cell ? v.data.map((x) => H.str(x)) : H.str(v).split('|'); g.touch(ax); return null; };
  }
  def('xticklabels', tickLabelFn('xticklabels'), D("xticklabels({'a','b'})", '设置 x 轴刻度标签'));
  def('yticklabels', tickLabelFn('yticklabels'), D("yticklabels({'a','b'})", '设置 y 轴刻度标签'));
  def('xtickangle ytickangle', () => null);

  // ---------- 图窗 ----------
  def('figure', (a, nargout, it) => {
    const g = gr(it);
    let f;
    let i = 0;
    if (a.length && !T.isStr(a[0])) {
      const id = a[0] instanceof GHandle ? a[0].obj.id : H.int(a[0]);
      f = g.figs.get(id) || g.newFigure(id); g.cur = id; g.dirty.add(id); i = 1;
    } else f = g.newFigure();
    for (; i + 1 < a.length; i += 2) {
      const k = H.str(a[i]).toLowerCase();
      if (k === 'name') f.name = H.str(a[i + 1]);
      else if (k === 'color') f.color = parseColor(a[i + 1]);
      else if (k === 'numbertitle') f.numberTitle = H.str(a[i + 1]) === 'on';
    }
    return nargout > 0 ? mkHandle(f) : null;
  }, D("figure, figure(n), figure('Name','标题')", '创建或选择图窗'));
  def('gcf', (a, n, it) => mkHandle(gr(it).gcf()), D('h = gcf', '当前图窗句柄'));
  def('gca', (a, n, it) => mkHandle(gr(it).gca()), D('ax = gca', '当前坐标区句柄'));
  def('clf', (a, n, it) => { const g = gr(it); const f = g.gcf(); for (const ax of f.axes) g.handles.delete(ax.hid); f.axes = []; f.curAx = null; f.sgtitle = ''; g.touch(f); return null; }, D('clf', '清除当前图窗'));
  def('cla', (a, n, it) => { const g = gr(it); const ax = g.gca(); ax.series = []; ax.colorIndex = 0; ax.legend = null; g.touch(ax); return null; }, D('cla', '清除当前坐标区'));
  def('close', (a, n, it) => {
    const g = gr(it);
    if (!a.length) { if (g.cur !== null) g.close(g.cur); return null; }
    if (T.isStr(a[0])) { const s = a[0].toStr(); if (s === 'all') for (const id of [...g.figs.keys()]) g.close(id); else for (const [id, f] of g.figs) if (f.name === s) g.close(id); return null; }
    if (a[0] instanceof GHandle) { g.close(a[0].obj.id); return null; }
    for (const id of H.toArray(a[0])) g.close(id);
    return null;
  }, D('close, close all, close(n)', '关闭图窗'));
  def('subplot', (a, nargout, it) => {
    const g = gr(it); const f = g.gcf();
    let m, nn, p;
    if (a.length === 1) { const k = H.int(a[0]); m = Math.floor(k / 100); nn = Math.floor(k / 10) % 10; p = [k % 10]; }
    else { m = H.int(a[0]); nn = H.int(a[1]); p = H.toArray(a[2]); }
    for (const q of p) if (q < 1 || q > m * nn) err('subplot: 索引超出范围。');
    // 计算覆盖的格子
    const cells = [];
    const rs = p.map((q) => Math.floor((q - 1) / nn)), cs = p.map((q) => (q - 1) % nn);
    const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push(r * nn + c);
    const pos = { m, n: nn, r0, r1, c0, c1 };
    const same = f.axes.find((ax) => ax.pos && ax.pos.m === m && ax.pos.n === nn && ax.pos.r0 === r0 && ax.pos.r1 === r1 && ax.pos.c0 === c0 && ax.pos.c1 === c1);
    let ax;
    if (same) { ax = same; f.curAx = ax.hid; }
    else {
      // 删除重叠的坐标区
      f.axes = f.axes.filter((o) => {
        if (!o.pos) return false;
        const fr = (o.pos.r0) / o.pos.m, fr1 = (o.pos.r1 + 1) / o.pos.m, fc = o.pos.c0 / o.pos.n, fc1 = (o.pos.c1 + 1) / o.pos.n;
        const nr = r0 / m, nr1 = (r1 + 1) / m, nc = c0 / nn, nc1 = (c1 + 1) / nn;
        const overlap = fr < nr1 - 1e-9 && nr < fr1 - 1e-9 && fc < nc1 - 1e-9 && nc < fc1 - 1e-9;
        return !overlap;
      });
      ax = g.newAxes(f, pos);
    }
    g.touch(f);
    return nargout > 0 ? mkHandle(ax) : null;
  }, D('subplot(m,n,p)', '在网格位置创建坐标区（子图）'));
  def('tiledlayout', (a, n, it) => { const g = gr(it); const f = g.gcf(); f.tiled = { m: H.int(a[0]), n: a.length > 1 && !T.isStr(a[1]) ? H.int(a[1]) : H.int(a[0]), next: 0 }; f.axes = []; g.touch(f); return null; }, D('tiledlayout(m,n)', '分块图布局（配合 nexttile）'));
  def('nexttile', (a, n, it) => {
    const g = gr(it); const f = g.gcf();
    if (!f.tiled) f.tiled = { m: 1, n: 1, next: 0 };
    const t = f.tiled; t.next++;
    if (t.next > t.m * t.n) { t.m++; }
    return ML.builtins.subplot([T.scalar(t.m), T.scalar(t.n), T.scalar(a.length ? H.int(a[0]) : t.next)], n, it);
  }, D('nexttile', '在分块图布局中创建下一个坐标区'));
  def('drawnow refresh refreshdata', (a, n, it) => { gr(it).flush(); return null; }, D('drawnow', '立即刷新图形（用于动画）'));
  def('set', (a, n, it) => {
    const objs = a[0] instanceof GHandle ? [a[0].obj] : H.toArray(a[0]).map((h) => gr(it).handles.get(h)).filter(Boolean);
    for (const o of objs) for (let i = 1; i + 1 < a.length; i += 2) setProp(o, H.str(a[i]), a[i + 1]);
    return null;
  }, D("set(h,'LineWidth',2)", '设置图形对象属性'));
  def('get', (a, n, it) => {
    const o = hobj(it, a[0]);
    if (a.length < 2) { const s = new Struct(1, 1); for (const k of Object.keys(PROP_MAP)) { const key = PROP_MAP[k]; if (key in o && o[key] !== null && o[key] !== undefined && typeof o[key] !== 'object' || (key in o && Array.isArray(o[key]))) s.setField(k.replace(/^./, (c) => c.toUpperCase()), toVal(o[key]), 0); } return s; }
    return getProp(o, H.str(a[1]));
  }, D("v = get(h,'Color')", '获取图形对象属性'));
  def('ishandle isgraphics isvalid', (a, n, it) => { const v = a[0]; if (v instanceof GHandle) return T.bool(gr(it).handles.has(v.obj.hid)); if (v instanceof Tensor && v.type !== 'char') return H.map(v, (h) => (gr(it).handles.has(h) ? 1 : 0), 'logical'); return T.bool(false); }, D('ishandle(h)', '是否为有效图形句柄'));
  def('saveas print exportgraphics', (a, n, it) => { gr(it).flush(); if (it.io.exportFigure) it.io.exportFigure(gr(it).cur, a.length > 1 && T.isStr(a[1]) ? a[1].toStr() : (a.length && T.isStr(a[0]) ? a[0].toStr() : 'figure.png')); else it.print('（请使用图窗面板上的“导出 PNG”按钮保存图像。）\n'); return null; }, D("saveas(gcf,'fig.png')", '导出图窗为 PNG 图片'));
  def('vectorize', (a) => T.str(vectorizeStr(H.str(a[0]))), D("vectorize('x^2*y')", '将表达式向量化（* / ^ 变为 .* ./ .^）', '字符串'));
  def('inline', (a, n, it) => toFunc(it, a[0], a.length > 1 ? a.slice(1).map((x) => H.str(x)) : ['x', 'y', 't']), D("f = inline('x^2+1')", '由字符串创建函数（旧语法）', '函数'));
})(typeof self !== 'undefined' ? self : globalThis);
