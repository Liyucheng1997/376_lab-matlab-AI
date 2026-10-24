/* MatWeb - 图窗渲染器：将引擎发来的图形模型绘制到 canvas（二维、三维、极坐标、饼图） */
(function (G) {
  'use strict';
  const ML = G.ML || (G.ML = {});
  const CM = () => ML.colormaps;

  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';
  const css = (c, a) => {
    if (!c || c === 'none') return 'rgba(0,0,0,0)';
    if (typeof c === 'string') return c;
    const r = Math.round(c[0] * 255), g = Math.round(c[1] * 255), b = Math.round(c[2] * 255);
    return a === undefined || a >= 1 ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };
  const lw = (w) => Math.max(1, 0.75 + (w === undefined ? 0.5 : w));
  const dashOf = (s) => (s === '--' ? [7, 4] : s === ':' ? [1.5, 3] : s === '-.' ? [7, 3, 1.5, 3] : []);

  // ---------- TeX 简化渲染 ----------
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    infty: '∞', pm: '±', mp: '∓', cdot: '·', times: '×', div: '÷', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝',
    rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', uparrow: '↑', downarrow: '↓', partial: '∂', nabla: '∇', int: '∫', oint: '∮', sum: '∑', prod: '∏', surd: '√', sqrt: '√',
    deg: '°', circ: '°', degree: '°', bullet: '•', ldots: '…', cdots: '⋯', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', angle: '∠', perp: '⊥', parallel: '∥', neg: '¬', wedge: '∧', vee: '∨', langle: '⟨', rangle: '⟩', hbar: 'ħ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ' };
  function texSegments(s) {
    const segs = [];
    let i = 0, buf = '';
    const flush = (mode) => { if (buf) { segs.push({ t: buf, m: mode || 'n' }); buf = ''; } };
    const readGroup = () => {
      if (s[i] === '{') { let depth = 1, j = i + 1, out = ''; while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') { depth--; if (!depth) break; } out += s[j++]; } i = j + 1; return out; }
      if (s[i] === '\\') { const m = /^\\([A-Za-z]+)/.exec(s.slice(i)); if (m) { i += m[0].length; return GREEK[m[1]] || m[1]; } }
      return s[i++] || '';
    };
    // 嵌套的上下标转为 Unicode 上下标字符
    const SUPC = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ', t: 'ᵗ', k: 'ᵏ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ' };
    const SUBC = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', n: 'ₙ', x: 'ₓ', a: 'ₐ', e: 'ₑ', o: 'ₒ', t: 'ₜ' };
    const conv = (t) => t.replace(/\\([A-Za-z]+)/g, (m, n) => GREEK[n] || n)
      .replace(/\^\{([^}]*)\}|\^(.)/g, (m, g1, g2) => (g1 !== undefined ? g1 : g2).split('').map((ch) => SUPC[ch] || ch).join(''))
      .replace(/_\{([^}]*)\}|_(.)/g, (m, g1, g2) => (g1 !== undefined ? g1 : g2).split('').map((ch) => SUBC[ch] || ch).join(''))
      .replace(/[{}]/g, '');
    while (i < s.length) {
      const c = s[i];
      if (c === '^' || c === '_') { flush(); i++; const g = readGroup(); segs.push({ t: conv(g), m: c === '^' ? 'sup' : 'sub' }); continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+)/.exec(s.slice(i));
        if (m) {
          i += m[0].length;
          if (m[1] === 'bf' || m[1] === 'it' || m[1] === 'rm') continue;
          buf += GREEK[m[1]] || m[1];
          if (s[i] === ' ' && GREEK[m[1]]) i++;
          continue;
        }
        if (s[i + 1] === '{' || s[i + 1] === '}' || s[i + 1] === '_' || s[i + 1] === '^' || s[i + 1] === '\\') { buf += s[i + 1]; i += 2; continue; }
      }
      if (c === '{' || c === '}') { i++; continue; }
      buf += c; i++;
    }
    flush();
    return segs;
  }
  function measureTex(ctx, s, size) {
    const segs = texSegments(s);
    let w = 0;
    for (const sg of segs) { ctx.font = (sg.m === 'n' ? size : size * 0.7) + 'px ' + FONT; w += ctx.measureText(sg.t).width; }
    return w;
  }
  function drawTex(ctx, s, x, y, opts) {
    opts = opts || {};
    const size = opts.size || 12;
    const lines = String(s).split('\n');
    const lh = size * 1.25;
    let y0 = y;
    if (opts.valign === 'middle') y0 = y - (lines.length - 1) * lh / 2;
    else if (opts.valign === 'bottom') y0 = y - (lines.length - 1) * lh;
    ctx.save();
    ctx.fillStyle = opts.color || '#1d1d1f';
    ctx.textBaseline = 'middle';
    const weight = opts.bold ? 'bold ' : '';
    lines.forEach((line, li) => {
      const segs = texSegments(line);
      let w = 0;
      for (const sg of segs) { ctx.font = weight + (sg.m === 'n' ? size : size * 0.7) + 'px ' + FONT; w += ctx.measureText(sg.t).width; }
      let cx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
      const cy = y0 + li * lh;
      if (opts.rotate) { ctx.translate(x, cy); ctx.rotate(opts.rotate); cx -= x; }
      for (const sg of segs) {
        ctx.font = weight + (sg.m === 'n' ? size : size * 0.7) + 'px ' + FONT;
        const dy = sg.m === 'sup' ? -size * 0.35 : sg.m === 'sub' ? size * 0.3 : 0;
        ctx.fillText(sg.t, cx, (opts.rotate ? 0 : cy) + dy);
        cx += ctx.measureText(sg.t).width;
      }
      if (opts.rotate) ctx.setTransform(opts.baseTransform || ctx.getTransform());
    });
    ctx.restore();
    return lines.length * lh;
  }

  // ---------- 刻度 ----------
  function niceStep(range, n) {
    const raw = range / Math.max(n, 1);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function linTicks(lo, hi, n) {
    if (!(hi > lo)) return { ticks: [lo], step: 1 };
    const step = niceStep(hi - lo, n);
    const t = [];
    const s0 = Math.ceil(lo / step - 1e-9);
    for (let k = s0; k * step <= hi + step * 1e-9; k++) t.push(+(k * step).toPrecision(12));
    return { ticks: t, step };
  }
  function niceLimits(lo, hi, n) {
    if (!(hi > lo)) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    const step = niceStep(hi - lo, n);
    return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
  }
  function fmtTick(v, step) {
    if (Math.abs(v) < step * 1e-9) return '0';
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    let s = v.toFixed(Math.min(dec, 10));
    return s;
  }
  function tickScale(ticks) {
    // 返回公共指数（如 ×10^4）
    const mx = Math.max(...ticks.map(Math.abs));
    if (mx >= 1e5 || (mx > 0 && mx < 1e-3)) return Math.floor(Math.log10(mx));
    return 0;
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const supNum = (n) => String(n).split('').map((c) => SUP[c] || c).join('');

  // ---------- 颜色图 ----------
  function cmapFn(spec) {
    if (spec && typeof spec === 'object' && spec.data) {
      const n = spec.rows, d = spec.data;
      return (t) => { const i = Math.min(n - 1, Math.max(0, Math.floor(t * n))); return [d[i], d[i + n], d[i + 2 * n]]; };
    }
    const name = spec || 'parula';
    return (t) => CM().at(name, t);
  }

  // ---------- 标记 ----------
  function drawMarker(ctx, m, x, y, size, stroke, fill) {
    const r = size / 2;
    ctx.beginPath();
    switch (m) {
      case 'o': ctx.arc(x, y, r, 0, 2 * Math.PI); break;
      case '.': ctx.arc(x, y, Math.max(1.5, r / 3), 0, 2 * Math.PI); ctx.fillStyle = stroke; ctx.fill(); return;
      case 's': ctx.rect(x - r, y - r, 2 * r, 2 * r); break;
      case 'd': ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r, y); ctx.closePath(); break;
      case '^': ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); break;
      case 'v': ctx.moveTo(x, y + r * 1.1); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x - r, y - r * 0.8); ctx.closePath(); break;
      case '>': ctx.moveTo(x + r * 1.1, y); ctx.lineTo(x - r * 0.8, y + r); ctx.lineTo(x - r * 0.8, y - r); ctx.closePath(); break;
      case '<': ctx.moveTo(x - r * 1.1, y); ctx.lineTo(x + r * 0.8, y + r); ctx.lineTo(x + r * 0.8, y - r); ctx.closePath(); break;
      case 'p': case 'h': {
        const k = m === 'p' ? 5 : 6;
        for (let i = 0; i < 2 * k; i++) { const ang = -Math.PI / 2 + i * Math.PI / k; const rr = i % 2 ? r * 0.45 : r * 1.15; const px = x + rr * Math.cos(ang), py = y + rr * Math.sin(ang); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath(); break;
      }
      case '+': ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.strokeStyle = stroke; ctx.stroke(); return;
      case 'x': ctx.moveTo(x - r * 0.75, y - r * 0.75); ctx.lineTo(x + r * 0.75, y + r * 0.75); ctx.moveTo(x - r * 0.75, y + r * 0.75); ctx.lineTo(x + r * 0.75, y - r * 0.75); ctx.strokeStyle = stroke; ctx.stroke(); return;
      case '*': for (let i = 0; i < 3; i++) { const ang = i * Math.PI / 3; ctx.moveTo(x - r * Math.cos(ang), y - r * Math.sin(ang)); ctx.lineTo(x + r * Math.cos(ang), y + r * Math.sin(ang)); } ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.strokeStyle = stroke; ctx.stroke(); return;
      default: return;
    }
    if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.stroke();
  }

  // ---------- 数据范围 ----------
  function extend(b, v) { if (Number.isFinite(v)) { if (v < b[0]) b[0] = v; if (v > b[1]) b[1] = v; } }
  function extendArr(b, arr, pos) { if (!arr) return; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (Number.isFinite(v) && (!pos || v > 0)) { if (v < b[0]) b[0] = v; if (v > b[1]) b[1] = v; } } }
  function bounds2D(ax) {
    const xb = [Infinity, -Infinity], yb = [Infinity, -Infinity];
    const xlog = ax.xscale === 'log', ylog = ax.yscale === 'log';
    let tightX = false, tightY = false;
    for (const s of ax.series) {
      if (s.visible === false) continue;
      switch (s.type) {
        case 'line': case 'scatter': case 'area':
          extendArr(xb, s.x, xlog); extendArr(yb, s.y, ylog); if (s.lower) extendArr(yb, s.lower, ylog); if (s.type === 'area') tightX = true; break;
        case 'stem': extendArr(xb, s.x, xlog); extendArr(yb, s.y, ylog); extend(yb, s.baseValue || 0); break;
        case 'errorbar': extendArr(xb, s.x, xlog); for (let i = 0; i < s.y.length; i++) { extend(yb, s.y[i] - s.lo[i]); extend(yb, s.y[i] + s.hi[i]); } break;
        case 'patch': extendArr(xb, s.x); extendArr(yb, s.y); break;
        case 'bar': {
          const pos = s.horizontal ? yb : xb, val = s.horizontal ? xb : yb;
          const dx = minSpacing(s.x);
          for (const x of s.x) { extend(pos, x - dx * 0.5); extend(pos, x + dx * 0.5); }
          extend(val, s.baseValue || 0);
          for (let r = 0; r < s.rows; r++) {
            if (s.stacked) { let p = 0, q = 0; for (let c = 0; c < s.cols; c++) { const v = s.data[r + c * s.rows]; if (v >= 0) p += v; else q += v; } extend(val, p); extend(val, q); }
            else for (let c = 0; c < s.cols; c++) extend(val, s.data[r + c * s.rows]);
          }
          break;
        }
        case 'histogram': extendArr(xb, s.edges); extendArr(yb, s.counts); extend(yb, 0); tightX = true; break;
        case 'image': {
          const dx = s.cols > 1 ? (s.x[1] - s.x[0]) / (s.cols - 1) : 1, dy = s.rows > 1 ? (s.y[1] - s.y[0]) / (s.rows - 1) : 1;
          extend(xb, s.x[0] - dx / 2); extend(xb, s.x[1] + dx / 2); extend(yb, s.y[0] - dy / 2); extend(yb, s.y[1] + dy / 2);
          tightX = tightY = true; break;
        }
        case 'surface': case 'contour': extendArr(xb, s.X); extendArr(yb, s.Y); tightX = tightY = true; break;
        case 'quiver': {
          extendArr(xb, s.x); extendArr(yb, s.y);
          const k = quiverScale(s);
          for (let i = 0; i < s.x.length; i++) { extend(xb, s.x[i] + s.u[i] * k); extend(yb, s.y[i] + s.v[i] * k); }
          break;
        }
        case 'text': extend(xb, s.x); extend(yb, s.y); break;
        default: break;
      }
    }
    return { xb, yb, tightX, tightY };
  }
  function minSpacing(x) {
    if (x.length < 2) return 1;
    let m = Infinity; const s = Array.from(x).sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d > 0 && d < m) m = d; }
    return Number.isFinite(m) ? m : 1;
  }
  function quiverScale(s) {
    if (!s.autoscale) return 1;
    let maxLen = 0; for (let i = 0; i < s.u.length; i++) maxLen = Math.max(maxLen, Math.hypot(s.u[i], s.v[i]));
    if (!maxLen) return 1;
    // 估计网格间距
    const n = s.x.length;
    let xr = [Infinity, -Infinity], yr = [Infinity, -Infinity];
    extendArr(xr, s.x); extendArr(yr, s.y);
    const area = Math.max((xr[1] - xr[0]) * (yr[1] - yr[0]), 1e-12);
    const spacing = Math.sqrt(area / Math.max(n, 1));
    return 0.9 * spacing / maxLen * (s.scale || 1);
  }
  function climOf(ax) {
    if (ax.clim) return ax.clim;
    const b = [Infinity, -Infinity];
    for (const s of ax.series) {
      if (s.type === 'surface') extendArr(b, s.C || s.Z);
      else if (s.type === 'image' && s.scaled) extendArr(b, s.C);
      else if (s.type === 'contour') extendArr(b, s.Z);
      else if (s.type === 'scatter' && s.cdata) extendArr(b, s.cdata);
      else if (s.type === 'image' && !s.scaled && !s.gray) { b[0] = Math.min(b[0], 1); b[1] = Math.max(b[1], 64); }
    }
    if (!Number.isFinite(b[0])) return [0, 1];
    if (b[0] === b[1]) return [b[0] - 0.5, b[1] + 0.5];
    return b;
  }
  function contourLevels(s, clim) {
    if (Array.isArray(s.levels)) return s.levels.slice().sort((a, b) => a - b);
    const n = s.levels || 10;
    let lo = Infinity, hi = -Infinity;
    for (const v of s.Z) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(hi > lo)) return [lo];
    // 与 MATLAB 类似：选择“好看”的等值线
    const { ticks } = linTicks(lo, hi, n);
    const lv = ticks.filter((t) => t > lo && t < hi);
    return lv.length >= 2 ? lv : Array.from({ length: n }, (x, k) => lo + (hi - lo) * (k + 1) / (n + 1));
  }

  // ---------- 等值线：行进方块法 ----------
  function marchingSquares(s, level, cb) {
    const R = s.rows, C = s.cols, X = s.X, Y = s.Y, Z = s.Z;
    const idx = (i, j) => i + j * R;
    for (let j = 0; j < C - 1; j++) for (let i = 0; i < R - 1; i++) {
      const k0 = idx(i, j), k1 = idx(i, j + 1), k2 = idx(i + 1, j + 1), k3 = idx(i + 1, j);
      const z0 = Z[k0], z1 = Z[k1], z2 = Z[k2], z3 = Z[k3];
      if (!(Number.isFinite(z0) && Number.isFinite(z1) && Number.isFinite(z2) && Number.isFinite(z3))) continue;
      let code = 0;
      if (z0 > level) code |= 1; if (z1 > level) code |= 2; if (z2 > level) code |= 4; if (z3 > level) code |= 8;
      if (code === 0 || code === 15) continue;
      const lerp = (ka, kb, za, zb) => { const t = (level - za) / (zb - za); return [X[ka] + t * (X[kb] - X[ka]), Y[ka] + t * (Y[kb] - Y[ka])]; };
      const e0 = () => lerp(k0, k1, z0, z1), e1 = () => lerp(k1, k2, z1, z2), e2 = () => lerp(k3, k2, z3, z2), e3 = () => lerp(k0, k3, z0, z3);
      const center = (z0 + z1 + z2 + z3) / 4 > level;
      switch (code) {
        case 1: case 14: cb(e3(), e0()); break;
        case 2: case 13: cb(e0(), e1()); break;
        case 3: case 12: cb(e3(), e1()); break;
        case 4: case 11: cb(e1(), e2()); break;
        case 6: case 9: cb(e0(), e2()); break;
        case 7: case 8: cb(e3(), e2()); break;
        case 5: if (center) { cb(e3(), e2()); cb(e0(), e1()); } else { cb(e3(), e0()); cb(e1(), e2()); } break;
        case 10: if (center) { cb(e3(), e0()); cb(e1(), e2()); } else { cb(e0(), e1()); cb(e3(), e2()); } break;
        default: break;
      }
    }
  }
  // 三角形按数值区间裁剪（用于填充等高线）
  function clipPoly(pts, level, above) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ina = above ? a[2] >= level : a[2] <= level, inb = above ? b[2] >= level : b[2] <= level;
      if (ina) out.push(a);
      if (ina !== inb) { const t = (level - a[2]) / (b[2] - a[2]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), level]); }
    }
    return out;
  }

  // ---------- 渲染器 ----------
  class FigureRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fig = null;
      this.viewOverride = new Map(); // axes hid -> [az, el]
      this.lastViews = new Map();
      this.axRects = [];
      this.theme = 'light';
    }
    setFigure(fig) {
      this.fig = fig;
      for (const ax of fig.axes) {
        const key = ax.hid, v = (ax.view || []).join(',');
        if (this.lastViews.get(key) !== v) { this.viewOverride.delete(key); this.lastViews.set(key, v); }
      }
      this.render();
    }
    resize(w, h) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      this.w = Math.max(50, Math.floor(w)); this.h = Math.max(50, Math.floor(h));
      this.canvas.width = Math.floor(this.w * dpr); this.canvas.height = Math.floor(this.h * dpr);
      this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
      this.dpr = dpr;
      this.render();
    }
    render() {
      const ctx = this.ctx, fig = this.fig;
      if (!this.w) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.base = ctx.getTransform();
      ctx.fillStyle = fig ? css(fig.color) : '#ffffff';
      ctx.fillRect(0, 0, this.w, this.h);
      this.axRects = [];
      if (!fig) return;
      let top = 0;
      if (fig.sgtitle) { drawTex(ctx, fig.sgtitle, this.w / 2, 16, { align: 'center', size: 15, bold: true }); top = 30; }
      const H = this.h - top;
      for (const ax of fig.axes) {
        let R;
        if (!ax.pos) R = { x: 0, y: top, w: this.w, h: H };
        else { const cw = this.w / ax.pos.n, ch = H / ax.pos.m; R = { x: ax.pos.c0 * cw, y: top + ax.pos.r0 * ch, w: (ax.pos.c1 - ax.pos.c0 + 1) * cw, h: (ax.pos.r1 - ax.pos.r0 + 1) * ch }; }
        try { this.renderAxes(ax, R, fig); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
      }
    }
    cmap(ax, fig) { return cmapFn(ax.colormap || fig.colormap); }

    renderAxes(ax, R, fig) {
      const ctx = this.ctx;
      const small = Math.min(R.w, R.h) < 260;
      const fs = small ? 10 : 11.5;
      const titleLines = ax.title ? ax.title.split('\n').length : 0;
      const m = {
        top: ax.title ? 14 + titleLines * (fs + 4) + (ax.subtitle ? fs + 2 : 0) : 14,
        bottom: (ax.visible === false ? 10 : fs + 18) + (ax.xlabel ? fs + 8 : 0),
        left: ax.visible === false ? 10 : 44 + (ax.ylabel ? fs + 8 : 0),
        right: 18 + (ax.colorbar ? 64 : 0)
      };
      if (ax.pie) { this.renderPie(ax, R, fig, fs); return; }
      if (ax.polar) { this.renderPolar(ax, R, fig, fs, m); return; }
      const view = this.viewOverride.get(ax.hid) || ax.view || [0, 90];
      const is3D = ax.is3D && !(view[0] === 0 && view[1] === 90 && !ax.series.some((s) => s.z));
      if (is3D) { this.render3D(ax, R, fig, fs, view); return; }
      this.render2D(ax, R, fig, fs, m);
    }

    // ===== 二维 =====
    render2D(ax, R, fig, fs, m) {
      const ctx = this.ctx;
      let P = { x: R.x + m.left, y: R.y + m.top, w: R.w - m.left - m.right, h: R.h - m.top - m.bottom };
      if (P.w < 20 || P.h < 20) return;
      const b = bounds2D(ax);
      const xlog = ax.xscale === 'log', ylog = ax.yscale === 'log';
      const tf = (v, log) => (log ? Math.log10(v) : v);
      let xb = b.xb, yb = b.yb;
      if (!Number.isFinite(xb[0])) xb = xlog ? [1, 10] : [0, 1];
      if (!Number.isFinite(yb[0])) yb = ylog ? [1, 10] : [0, 1];
      let xl = [tf(xb[0], xlog), tf(xb[1], xlog)], yl = [tf(yb[0], ylog), tf(yb[1], ylog)];
      if (ax.aspect === 'square') { const s = Math.min(P.w, P.h); P = { x: P.x + (P.w - s) / 2, y: P.y + (P.h - s) / 2, w: s, h: s }; }
      const nx = Math.max(2, Math.min(10, Math.floor(P.w / 70))), ny = Math.max(2, Math.min(10, Math.floor(P.h / 45)));
      const autoLim = (l, tight, n, log) => {
        if (l[0] === l[1]) { const d = Math.abs(l[0]) * 0.1 || 1; return [l[0] - d, l[1] + d]; }
        if (tight || ax.tight) return l;
        if (log) return [Math.floor(l[0]), Math.ceil(l[1])];
        return niceLimits(l[0], l[1], n);
      };
      xl = ax.xlim ? [tf(ax.xlim[0], xlog), tf(ax.xlim[1], xlog)] : autoLim(xl, b.tightX, nx, xlog);
      yl = ax.ylim ? [tf(ax.ylim[0], ylog), tf(ax.ylim[1], ylog)] : autoLim(yl, b.tightY, ny, ylog);
      if (ax.aspect === 'equal') {
        const ux = (xl[1] - xl[0]) / P.w, uy = (yl[1] - yl[0]) / P.h;
        if (ux > uy) { const c = (yl[0] + yl[1]) / 2, h = ux * P.h / 2; if (!ax.ylim) yl = [c - h, c + h]; else { const nw = (yl[1] - yl[0]) / uy * ux; void nw; } }
        else { const c = (xl[0] + xl[1]) / 2, w = uy * P.w / 2; if (!ax.xlim) xl = [c - w, c + w]; }
        if (ax.xlim && ax.ylim) { const s = Math.min(P.w / (xl[1] - xl[0]), P.h / (yl[1] - yl[0])); const nw = (xl[1] - xl[0]) * s, nh = (yl[1] - yl[0]) * s; P = { x: P.x + (P.w - nw) / 2, y: P.y + (P.h - nh) / 2, w: nw, h: nh }; }
      }
      const rev = ax.ydir === 'reverse';
      const X = (v) => P.x + (tf(v, xlog) - xl[0]) / (xl[1] - xl[0]) * P.w;
      const Y = (v) => (rev ? P.y + (tf(v, ylog) - yl[0]) / (yl[1] - yl[0]) * P.h : P.y + P.h - (tf(v, ylog) - yl[0]) / (yl[1] - yl[0]) * P.h);
      this.axRects.push({ ax, P, xl, yl, xlog, ylog, rev, mode: '2d' });
      // 背景
      if (ax.visible !== false) { ctx.fillStyle = '#ffffff'; ctx.fillRect(P.x, P.y, P.w, P.h); }
      // 刻度（柱状图默认以各柱的 x 位置为刻度）
      let xticksFixed = ax.xticks;
      const barS = ax.series.find((s) => s.type === 'bar' && !s.horizontal);
      if (!xticksFixed && barS && barS.x.length <= 25 && Array.from(barS.x).every(Number.isInteger)) xticksFixed = Array.from(barS.x);
      let yticksFixed = ax.yticks;
      const barH = ax.series.find((s) => s.type === 'bar' && s.horizontal);
      if (!yticksFixed && barH && barH.x.length <= 25 && Array.from(barH.x).every(Number.isInteger)) yticksFixed = Array.from(barH.x);
      const xt = this.axisTicks(xl, nx, xlog, xticksFixed), yt = this.axisTicks(yl, ny, ylog, yticksFixed);
      if (ax.visible !== false && (ax.grid || ax.minorGrid)) {
        ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.09)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const t of xt.pos) { const px = Math.round(P.x + (t - xl[0]) / (xl[1] - xl[0]) * P.w) + 0.5; ctx.moveTo(px, P.y); ctx.lineTo(px, P.y + P.h); }
        for (const t of yt.pos) { const py0 = (t - yl[0]) / (yl[1] - yl[0]) * P.h; const py = Math.round(rev ? P.y + py0 : P.y + P.h - py0) + 0.5; ctx.moveTo(P.x, py); ctx.lineTo(P.x + P.w, py); }
        ctx.stroke();
        if (ax.minorGrid) {
          ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.beginPath();
          const minor = (t, l, n) => { const out = []; for (let i = 0; i + 1 < t.length; i++) for (let k = 1; k < n; k++) out.push(t[i] + (t[i + 1] - t[i]) * k / n); return out; };
          for (const t of minor(xt.pos, xl, xlog ? 9 : 5)) { const px = P.x + (t - xl[0]) / (xl[1] - xl[0]) * P.w; ctx.moveTo(px, P.y); ctx.lineTo(px, P.y + P.h); }
          for (const t of minor(yt.pos, yl, ylog ? 9 : 5)) { const py0 = (t - yl[0]) / (yl[1] - yl[0]) * P.h; const py = rev ? P.y + py0 : P.y + P.h - py0; ctx.moveTo(P.x, py); ctx.lineTo(P.x + P.w, py); }
          ctx.stroke();
        }
        ctx.restore();
      }
      const clim = climOf(ax), cmap = this.cmap(ax, fig);
      // 图形对象
      ctx.save();
      ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      for (const s of ax.series) { if (s.visible !== false) this.draw2DSeries(s, X, Y, P, ax, clim, cmap, fs, xl, yl); }
      ctx.restore();
      // 文字对象（不裁剪）
      for (const s of ax.series) if (s.type === 'text' && s.visible !== false) {
        drawTex(ctx, s.str, X(s.x), Y(s.y), { size: (s.fontSize || 10) * 1.2, color: css(s.color), align: s.hAlign === 'center' ? 'center' : s.hAlign === 'right' ? 'right' : 'left', valign: 'middle', bold: s.fontWeight === 'bold' });
      }
      if (ax.visible !== false) {
        // 边框与刻度
        ctx.save();
        ctx.strokeStyle = '#8e8e93'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(P.x + 0.5, P.y); ctx.lineTo(P.x + 0.5, P.y + P.h + 0.5); ctx.lineTo(P.x + P.w, P.y + P.h + 0.5);
        if (ax.box !== false) { ctx.moveTo(P.x + P.w - 0.5, P.y + P.h); ctx.lineTo(P.x + P.w - 0.5, P.y + 0.5); ctx.lineTo(P.x, P.y + 0.5); }
        ctx.stroke();
        ctx.fillStyle = '#6e6e73'; ctx.font = fs + 'px ' + FONT;
        ctx.beginPath();
        xt.pos.forEach((t, i) => {
          const px = Math.round(P.x + (t - xl[0]) / (xl[1] - xl[0]) * P.w) + 0.5;
          if (px < P.x - 1 || px > P.x + P.w + 1) return;
          ctx.moveTo(px, P.y + P.h); ctx.lineTo(px, P.y + P.h - 5);
          if (ax.box !== false) { ctx.moveTo(px, P.y); ctx.lineTo(px, P.y + 5); }
        });
        yt.pos.forEach((t) => {
          const py0 = (t - yl[0]) / (yl[1] - yl[0]) * P.h; const py = Math.round(rev ? P.y + py0 : P.y + P.h - py0) + 0.5;
          ctx.moveTo(P.x, py); ctx.lineTo(P.x + 5, py);
          if (ax.box !== false) { ctx.moveTo(P.x + P.w, py); ctx.lineTo(P.x + P.w - 5, py); }
        });
        ctx.stroke();
        xt.pos.forEach((t, i) => {
          const px = P.x + (t - xl[0]) / (xl[1] - xl[0]) * P.w;
          if (px < P.x - 1 || px > P.x + P.w + 1) return;
          drawTex(ctx, ax.xticklabels && ax.xticks ? (ax.xticklabels[i] !== undefined ? ax.xticklabels[i] : '') : (ax.xticklabels ? (ax.xticklabels[i] !== undefined ? ax.xticklabels[i] : '') : xt.labels[i]), px, P.y + P.h + 4 + fs / 2 + 2, { align: 'center', size: fs });
        });
        yt.pos.forEach((t, i) => {
          const py0 = (t - yl[0]) / (yl[1] - yl[0]) * P.h; const py = rev ? P.y + py0 : P.y + P.h - py0;
          drawTex(ctx, ax.yticklabels ? (ax.yticklabels[i] !== undefined ? ax.yticklabels[i] : '') : yt.labels[i], P.x - 6, py, { align: 'right', size: fs, valign: 'middle' });
        });
        if (xt.exp && !ax.xticklabels) drawTex(ctx, '×10^{' + xt.exp + '}', P.x + P.w, P.y + P.h + fs * 2 + 6, { align: 'right', size: fs });
        if (yt.exp && !ax.yticklabels) drawTex(ctx, '×10^{' + yt.exp + '}', P.x, P.y - 8, { align: 'left', size: fs });
        ctx.restore();
        // 标签
        if (ax.xlabel) drawTex(ctx, ax.xlabel, P.x + P.w / 2, P.y + P.h + fs * 2 + 10, { align: 'center', size: fs + 1 });
        if (ax.ylabel) {
          ctx.save(); ctx.translate(R.x + 12, P.y + P.h / 2); ctx.rotate(-Math.PI / 2);
          drawTex(ctx, ax.ylabel, 0, 0, { align: 'center', size: fs + 1, valign: 'middle' });
          ctx.restore();
        }
      }
      if (ax.title) drawTex(ctx, ax.title, P.x + P.w / 2, R.y + 12 + (fs + 2) / 2, { align: 'center', size: fs + 2, bold: true });
      if (ax.subtitle) drawTex(ctx, ax.subtitle, P.x + P.w / 2, R.y + 12 + (fs + 2) * (ax.title ? ax.title.split('\n').length : 0) + fs / 2 + 4, { align: 'center', size: fs, color: '#6e6e73' });
      if (ax.colorbar) this.drawColorbar(P, clim, cmap, fs);
      if (ax.legend) this.drawLegend(ax, P, fs, cmap, clim);
    }
    axisTicks(l, n, log, fixed) {
      if (fixed) return { pos: fixed.map((v) => (log ? Math.log10(v) : v)), labels: fixed.map((v) => ML.fmt ? ML.fmt.gStr(v, 6) : String(v)), exp: 0 };
      if (log) {
        const pos = [], labels = [];
        let a = Math.ceil(l[0] - 1e-9), b = Math.floor(l[1] + 1e-9);
        let step = Math.max(1, Math.ceil((b - a + 1) / n));
        for (let k = a; k <= b; k += step) { pos.push(k); labels.push('10^{' + k + '}'); }
        if (pos.length < 2) { const t = linTicks(Math.pow(10, l[0]), Math.pow(10, l[1]), n); return { pos: t.ticks.filter((v) => v > 0).map(Math.log10), labels: t.ticks.filter((v) => v > 0).map((v) => fmtTick(v, t.step)), exp: 0 }; }
        return { pos, labels, exp: 0 };
      }
      const t = linTicks(l[0], l[1], n);
      const exp = tickScale(t.ticks);
      const sc = Math.pow(10, exp);
      return { pos: t.ticks, labels: t.ticks.map((v) => fmtTick(v / sc, t.step / sc)), exp };
    }
    draw2DSeries(s, X, Y, P, ax, clim, cmap, fs, xl, yl) {
      const ctx = this.ctx;
      const cval = (v) => cmap((v - clim[0]) / (clim[1] - clim[0]));
      switch (s.type) {
        case 'line': {
          const n = Math.min(s.x.length, s.y.length);
          const color = css(s.color);
          if (s.lineStyle !== 'none') {
            ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle)); ctx.lineJoin = 'round';
            ctx.beginPath(); let pen = false;
            for (let i = 0; i < n; i++) {
              const xv = s.x[i], yv = s.y[i];
              if (!Number.isFinite(xv) || !Number.isFinite(yv) || (ax.xscale === 'log' && xv <= 0) || (ax.yscale === 'log' && yv <= 0)) { pen = false; continue; }
              const px = X(xv), py = Y(yv);
              if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
            }
            ctx.stroke(); ctx.restore();
          }
          if (s.marker && s.marker !== 'none') {
            ctx.save(); ctx.lineWidth = Math.max(1, lw(s.lineWidth) * 0.8);
            const stroke = s.markerEdgeColor && s.markerEdgeColor !== 'auto' ? css(s.markerEdgeColor) : color;
            const fill = s.markerFaceColor && s.markerFaceColor !== 'none' ? (s.markerFaceColor === 'auto' ? color : css(s.markerFaceColor)) : null;
            const step = n > 2000 ? Math.ceil(n / 2000) : 1;
            for (let i = 0; i < n; i += step) if (Number.isFinite(s.x[i]) && Number.isFinite(s.y[i])) drawMarker(ctx, s.marker, X(s.x[i]), Y(s.y[i]), s.markerSize || 6, stroke, fill);
            ctx.restore();
          }
          break;
        }
        case 'scatter': {
          const n = s.x.length;
          ctx.save(); ctx.lineWidth = 1;
          if (s.faceAlpha !== undefined && s.faceAlpha < 1) ctx.globalAlpha = s.faceAlpha;
          for (let i = 0; i < n; i++) {
            if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i])) continue;
            const area = typeof s.sizes === 'number' ? s.sizes : s.sizes[i];
            const d = Math.sqrt(Math.max(area, 1)) * 1.1;
            const c = s.colors ? css(s.colors[i]) : s.cdata ? css(cval(s.cdata[s.cdata.length === 1 ? 0 : i])) : css(s.color);
            const fill = s.filled ? c : (s.markerFaceColor && s.markerFaceColor !== 'none' ? css(s.markerFaceColor) : null);
            drawMarker(ctx, s.marker || 'o', X(s.x[i]), Y(s.y[i]), d, c, fill);
          }
          ctx.restore();
          break;
        }
        case 'stem': {
          ctx.save(); const c = css(s.color); ctx.strokeStyle = c; ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle));
          const y0 = Y(s.baseValue || 0);
          ctx.beginPath();
          for (let i = 0; i < s.x.length; i++) { if (!Number.isFinite(s.y[i])) continue; const px = X(s.x[i]); ctx.moveTo(px, y0); ctx.lineTo(px, Y(s.y[i])); }
          ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(P.x, y0); ctx.lineTo(P.x + P.w, y0); ctx.stroke();
          for (let i = 0; i < s.x.length; i++) if (Number.isFinite(s.y[i])) drawMarker(ctx, s.marker, X(s.x[i]), Y(s.y[i]), s.markerSize || 6, c, s.filled ? c : '#fff');
          ctx.restore();
          break;
        }
        case 'errorbar': {
          ctx.save(); const c = css(s.color); ctx.strokeStyle = c; ctx.lineWidth = lw(s.lineWidth);
          ctx.beginPath();
          for (let i = 0; i < s.x.length; i++) {
            const px = X(s.x[i]), p1 = Y(s.y[i] - s.lo[i]), p2 = Y(s.y[i] + s.hi[i]);
            ctx.moveTo(px, p1); ctx.lineTo(px, p2); ctx.moveTo(px - 4, p1); ctx.lineTo(px + 4, p1); ctx.moveTo(px - 4, p2); ctx.lineTo(px + 4, p2);
          }
          ctx.stroke();
          if (s.lineStyle !== 'none') { ctx.setLineDash(dashOf(s.lineStyle)); ctx.beginPath(); for (let i = 0; i < s.x.length; i++) { const px = X(s.x[i]), py = Y(s.y[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
          if (s.marker && s.marker !== 'none') for (let i = 0; i < s.x.length; i++) drawMarker(ctx, s.marker, X(s.x[i]), Y(s.y[i]), s.markerSize || 6, c, null);
          ctx.restore();
          break;
        }
        case 'area': {
          ctx.save(); ctx.fillStyle = css(s.color, s.faceAlpha); ctx.strokeStyle = css(s.edgeColor || [0, 0, 0]); ctx.lineWidth = lw(s.lineWidth);
          ctx.beginPath();
          for (let i = 0; i < s.x.length; i++) { const px = X(s.x[i]), py = Y(s.y[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          for (let i = s.x.length - 1; i >= 0; i--) ctx.lineTo(X(s.x[i]), Y(s.lower[i]));
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
          break;
        }
        case 'patch': {
          ctx.save();
          ctx.beginPath();
          for (let i = 0; i < s.x.length; i++) { const px = X(s.x[i]), py = Y(s.y[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.closePath();
          if (s.color !== 'none') { ctx.fillStyle = css(s.color, s.faceAlpha); ctx.fill(); }
          if (s.edgeColor !== 'none') { ctx.strokeStyle = css(s.edgeColor); ctx.lineWidth = lw(s.lineWidth); ctx.stroke(); }
          ctx.restore();
          break;
        }
        case 'bar': {
          const dx = minSpacing(s.x);
          const groupW = dx * s.width * (s.cols > 1 ? 0.95 : 1);
          ctx.save(); ctx.lineWidth = 0.8;
          for (let r = 0; r < s.rows; r++) {
            let posAcc = 0, negAcc = 0;
            for (let c = 0; c < s.cols; c++) {
              const v = s.data[r + c * s.rows];
              if (!Number.isFinite(v)) continue;
              let p0, p1, v0, v1;
              if (s.stacked) { p0 = s.x[r] - groupW / 2; p1 = s.x[r] + groupW / 2; if (v >= 0) { v0 = posAcc; v1 = posAcc + v; posAcc = v1; } else { v0 = negAcc; v1 = negAcc + v; negAcc = v1; } }
              else { const bw = s.cols > 1 ? groupW / s.cols : groupW; p0 = s.x[r] - groupW / 2 + c * bw + (s.cols > 1 ? bw * 0.05 : 0); p1 = p0 + bw * (s.cols > 1 ? 0.9 : 1); v0 = s.baseValue || 0; v1 = v; }
              ctx.fillStyle = css(s.colors[c] || [0, 0.447, 0.741], s.faceAlpha);
              ctx.strokeStyle = css(s.edgeColor || [0, 0, 0]);
              let rx, ry, rw, rh;
              if (s.horizontal) { rx = Math.min(X(v0), X(v1)); rw = Math.abs(X(v1) - X(v0)); ry = Math.min(Y(p0), Y(p1)); rh = Math.abs(Y(p1) - Y(p0)); }
              else { rx = Math.min(X(p0), X(p1)); rw = Math.abs(X(p1) - X(p0)); ry = Math.min(Y(v0), Y(v1)); rh = Math.abs(Y(v1) - Y(v0)); }
              ctx.fillRect(rx, ry, rw, rh);
              if (s.edgeColor !== 'none') ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(rw - 1, 0), Math.max(rh - 1, 0));
            }
          }
          ctx.restore();
          break;
        }
        case 'histogram': {
          ctx.save(); ctx.fillStyle = css(s.color, s.faceAlpha); ctx.strokeStyle = css(s.edgeColor || [0, 0, 0]); ctx.lineWidth = 0.7;
          for (let k = 0; k < s.counts.length; k++) {
            const x0 = X(s.edges[k]), x1 = X(s.edges[k + 1]), y0 = Y(0), y1 = Y(s.counts[k]);
            ctx.fillRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0));
            ctx.strokeRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0));
          }
          ctx.restore();
          break;
        }
        case 'image': {
          const R = s.rows, C = s.cols;
          const off = typeof document !== 'undefined' ? document.createElement('canvas') : null;
          if (!off) break;
          off.width = C; off.height = R;
          const octx = off.getContext('2d');
          const img = octx.createImageData(C, R);
          const cl = s.clim || (s.scaled ? clim : null);
          for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
            const v = s.C[i + j * R];
            let rgb;
            if (s.gray) { const t = Math.max(0, Math.min(1, (v - cl[0]) / (cl[1] - cl[0]))); rgb = [t, t, t]; }
            else if (s.scaled) rgb = cval(v);
            else { const nmap = 64; rgb = cmap((Math.min(Math.max(Math.round(v), 1), nmap) - 1) / (nmap - 1)); }
            const o = (i * C + j) * 4;
            if (!Number.isFinite(v)) { img.data[o + 3] = 0; continue; }
            img.data[o] = rgb[0] * 255; img.data[o + 1] = rgb[1] * 255; img.data[o + 2] = rgb[2] * 255; img.data[o + 3] = 255;
          }
          octx.putImageData(img, 0, 0);
          const dx = C > 1 ? (s.x[1] - s.x[0]) / (C - 1) : 1, dy = R > 1 ? (s.y[1] - s.y[0]) / (R - 1) : 1;
          const x0 = X(s.x[0] - dx / 2), x1 = X(s.x[1] + dx / 2), y0 = Y(s.y[0] - dy / 2), y1 = Y(s.y[1] + dy / 2);
          ctx.save(); ctx.imageSmoothingEnabled = false;
          ctx.translate(Math.min(x0, x1), Math.min(y0, y1));
          if (y0 > y1) { ctx.translate(0, Math.abs(y1 - y0)); ctx.scale(1, -1); }
          ctx.drawImage(off, 0, 0, Math.abs(x1 - x0), Math.abs(y1 - y0));
          ctx.restore();
          break;
        }
        case 'surface': {
          // 二维视图下的曲面（如 pcolor 或 view(2)）
          const Rr = s.rows, Cc = s.cols; const V = s.C || s.Z;
          ctx.save();
          for (let j = 0; j < Cc - 1; j++) for (let i = 0; i < Rr - 1; i++) {
            const k0 = i + j * Rr, k1 = i + (j + 1) * Rr, k2 = i + 1 + (j + 1) * Rr, k3 = i + 1 + j * Rr;
            const v = s.faceColor === 'interp' ? (V[k0] + V[k1] + V[k2] + V[k3]) / 4 : V[k0];
            if (!Number.isFinite(v)) continue;
            ctx.beginPath(); ctx.moveTo(X(s.X[k0]), Y(s.Y[k0])); ctx.lineTo(X(s.X[k1]), Y(s.Y[k1])); ctx.lineTo(X(s.X[k2]), Y(s.Y[k2])); ctx.lineTo(X(s.X[k3]), Y(s.Y[k3])); ctx.closePath();
            const col = css(cval(v));
            ctx.fillStyle = s.faceColor === 'bg' ? '#fff' : col; ctx.fill();
            if (s.edgeColor === 'none' || !s.edgeColor) { ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(); }
            else { ctx.strokeStyle = s.edgeColor === 'flat' ? col : css(s.edgeColor, 0.7); ctx.lineWidth = 0.5; ctx.stroke(); }
          }
          ctx.restore();
          break;
        }
        case 'contour': {
          const levels = contourLevels(s, clim);
          ctx.save();
          if (s.filled) {
            // 填充：三角剖分后按区间裁剪
            const bands = [-Infinity].concat(levels, [Infinity]);
            const Rr = s.rows, Cc = s.cols;
            // 第 k 个区间（由低到高）的颜色
            const bandColor = (k) => css(cmap(levels.length ? k / levels.length : 0.5));
            for (let j = 0; j < Cc - 1; j++) for (let i = 0; i < Rr - 1; i++) {
              const ks = [i + j * Rr, i + (j + 1) * Rr, i + 1 + (j + 1) * Rr, i + 1 + j * Rr];
              const pts = ks.map((k) => [X(s.X[k]), Y(s.Y[k]), s.Z[k]]);
              if (pts.some((p) => !Number.isFinite(p[2]))) continue;
              for (const tri of [[pts[0], pts[1], pts[2]], [pts[0], pts[2], pts[3]]]) {
                const vmin = Math.min(tri[0][2], tri[1][2], tri[2][2]), vmax = Math.max(tri[0][2], tri[1][2], tri[2][2]);
                for (let k = 0; k < bands.length - 1; k++) {
                  const lo = bands[k], hi = bands[k + 1];
                  if (hi < vmin || lo > vmax) continue;
                  let poly = tri;
                  if (Number.isFinite(lo)) poly = clipPoly(poly, lo, true);
                  if (poly.length >= 3 && Number.isFinite(hi)) poly = clipPoly(poly, hi, false);
                  if (poly.length < 3) continue;
                  const col = bandColor(k);
                  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6;
                  ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let q = 1; q < poly.length; q++) ctx.lineTo(poly[q][0], poly[q][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
                }
              }
            }
          }
          ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle));
          for (const lv of levels) {
            ctx.strokeStyle = s.filled ? 'rgba(0,0,0,0.75)' : (s.lineColor ? css(s.lineColor) : css(cval(lv)));
            ctx.beginPath();
            marchingSquares(s, lv, (p, q) => { ctx.moveTo(X(p[0]), Y(p[1])); ctx.lineTo(X(q[0]), Y(q[1])); });
            ctx.stroke();
          }
          if (s.showText) {
            ctx.fillStyle = '#1d1d1f'; ctx.font = (fs - 1) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (const lv of levels) { let cnt = 0; marchingSquares(s, lv, (p) => { if (cnt++ % 40 === 15) { const tx = X(p[0]), ty = Y(p[1]); ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; const t = ML.fmt ? ML.fmt.gStr(lv, 3) : String(lv); const w = ctx.measureText(t).width; ctx.fillRect(tx - w / 2 - 1, ty - 6, w + 2, 12); ctx.restore(); ctx.fillText(ML.fmt ? ML.fmt.gStr(lv, 3) : String(lv), tx, ty); } }); }
          }
          ctx.restore();
          break;
        }
        case 'quiver': {
          const k = quiverScale(s);
          ctx.save(); ctx.strokeStyle = css(s.color); ctx.lineWidth = lw(s.lineWidth);
          ctx.beginPath();
          for (let i = 0; i < s.x.length; i++) {
            const x0 = X(s.x[i]), y0 = Y(s.y[i]), x1 = X(s.x[i] + s.u[i] * k), y1 = Y(s.y[i] + s.v[i] * k);
            if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            const ang = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), h = Math.min(8, L * 0.35);
            ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(ang - 0.4), y1 - h * Math.sin(ang - 0.4));
            ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(ang + 0.4), y1 - h * Math.sin(ang + 0.4));
          }
          ctx.stroke(); ctx.restore();
          break;
        }
        case 'refline': {
          ctx.save(); ctx.strokeStyle = css(s.color); ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle));
          ctx.beginPath();
          if (s.axis === 'x') { const px = X(s.value); ctx.moveTo(px, P.y); ctx.lineTo(px, P.y + P.h); }
          else { const py = Y(s.value); ctx.moveTo(P.x, py); ctx.lineTo(P.x + P.w, py); }
          ctx.stroke(); ctx.setLineDash([]);
          if (s.label) {
            if (s.axis === 'x') { ctx.save(); ctx.translate(X(s.value) - 4, P.y + 6); ctx.rotate(-Math.PI / 2); drawTex(ctx, s.label, 0, 0, { align: 'right', size: fs, color: css(s.color), valign: 'middle' }); ctx.restore(); }
            else drawTex(ctx, s.label, P.x + P.w - 4, Y(s.value) - 8, { align: 'right', size: fs, color: css(s.color) });
          }
          ctx.restore();
          break;
        }
        default: break;
      }
    }
    drawColorbar(P, clim, cmap, fs) {
      const ctx = this.ctx;
      const x = P.x + P.w + 14, w = 14, y = P.y, h = P.h;
      for (let i = 0; i < h; i++) { ctx.fillStyle = css(cmap(1 - i / h)); ctx.fillRect(x, y + i, w, 1.5); }
      ctx.strokeStyle = '#c7c7cc'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      const t = linTicks(clim[0], clim[1], Math.max(2, Math.floor(h / 40)));
      ctx.fillStyle = '#6e6e73'; ctx.font = fs + 'px ' + FONT; ctx.textBaseline = 'middle';
      for (const v of t.ticks) { const py = y + h - (v - clim[0]) / (clim[1] - clim[0]) * h; ctx.beginPath(); ctx.moveTo(x + w, py); ctx.lineTo(x + w - 3, py); ctx.stroke(); ctx.fillText(fmtTick(v, t.step), x + w + 4, py); }
    }
    legendEntries(ax) {
      const items = ax.series.filter((s) => ['line', 'scatter', 'bar', 'stem', 'area', 'patch', 'histogram', 'errorbar', 'surface', 'contour', 'refline'].indexOf(s.type) >= 0);
      const out = [];
      const labels = ax.legend.labels;
      let li = 0;
      for (const s of items) {
        if (s.type === 'bar' && s.cols > 1) { for (let c = 0; c < s.cols; c++) out.push({ s, c, label: labels ? labels[li++] : (s.displayName || 'data' + (li++ + 1)) }); continue; }
        let label;
        if (labels) { if (li >= labels.length) break; label = labels[li++]; } else { li++; if (s.type === 'refline' && !s.displayName) continue; label = s.displayName || 'data' + li; }
        out.push({ s, label });
      }
      return out.filter((e) => e.label !== undefined);
    }
    drawLegend(ax, P, fs, cmap, clim) {
      const ctx = this.ctx;
      const entries = this.legendEntries(ax);
      if (!entries.length) return;
      ctx.save();
      ctx.font = fs + 'px ' + FONT;
      const horiz = ax.legend.orientation === 'horizontal';
      const rowH = fs + 8, sample = 28;
      const widths = entries.map((e) => measureTex(ctx, e.label, fs));
      const W = horiz ? widths.reduce((s, w) => s + w + sample + 18, 8) : Math.max(...widths) + sample + 20;
      const Hh = horiz ? rowH + 6 : entries.length * rowH + 6;
      const loc = ax.legend.location || 'northeast';
      let x = P.x + P.w - W - 8, y = P.y + 8;
      if (/west/.test(loc)) x = P.x + 8;
      if (/south/.test(loc)) y = P.y + P.h - Hh - 8;
      if (loc === 'north' || loc === 'south' || loc === 'northoutside' || loc === 'southoutside') x = P.x + (P.w - W) / 2;
      if (loc === 'east' || loc === 'west') y = P.y + (P.h - Hh) / 2;
      if (/outside/.test(loc) && /east/.test(loc)) x = P.x + P.w - W - 2;
      if (loc === 'best') { x = P.x + P.w - W - 8; y = P.y + 8; }
      if (ax.legend.box !== false) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x, y, W, Hh); ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, W, Hh); }
      let cx = x + 6, cy = y + 3 + rowH / 2;
      entries.forEach((e, i) => {
        const s = e.s;
        const sx0 = cx, sx1 = cx + sample - 4;
        ctx.save();
        if (s.type === 'line' || s.type === 'errorbar' || s.type === 'refline' || (s.type === 'contour' && !s.filled)) {
          const col = css(s.color || s.lineColor || [0, 0.447, 0.741]);
          if (s.lineStyle !== 'none') { ctx.strokeStyle = col; ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle)); ctx.beginPath(); ctx.moveTo(sx0, cy); ctx.lineTo(sx1, cy); ctx.stroke(); }
          ctx.setLineDash([]);
          if (s.marker && s.marker !== 'none') drawMarker(ctx, s.marker, (sx0 + sx1) / 2, cy, s.markerSize || 6, col, s.markerFaceColor && s.markerFaceColor !== 'none' ? css(s.markerFaceColor) : null);
        } else if (s.type === 'scatter' || s.type === 'stem') {
          const col = css(s.color || (s.colors && s.colors[0]) || [0, 0.447, 0.741]);
          drawMarker(ctx, s.marker || 'o', (sx0 + sx1) / 2, cy, 7, col, s.filled ? col : null);
        } else {
          const col = s.type === 'bar' ? css(s.colors[e.c || 0], s.faceAlpha) : s.type === 'surface' || s.type === 'contour' ? css(cmap(0.6)) : css(s.color, s.faceAlpha);
          ctx.fillStyle = col; ctx.fillRect(sx0 + 4, cy - 5, sx1 - sx0 - 8, 10); ctx.strokeStyle = '#333'; ctx.lineWidth = 0.6; ctx.strokeRect(sx0 + 4, cy - 5, sx1 - sx0 - 8, 10);
        }
        ctx.restore();
        drawTex(ctx, e.label, cx + sample, cy, { size: fs, valign: 'middle' });
        if (horiz) cx += sample + widths[i] + 18; else cy += rowH;
      });
      ctx.restore();
    }

    // ===== 三维 =====
    render3D(ax, R, fig, fs, view) {
      const ctx = this.ctx;
      const xb = [Infinity, -Infinity], yb = [Infinity, -Infinity], zb = [Infinity, -Infinity];
      for (const s of ax.series) {
        if (s.visible === false) continue;
        if (s.type === 'surface' || s.type === 'contour') { extendArr(xb, s.X); extendArr(yb, s.Y); extendArr(zb, s.type === 'contour' && !s.three ? null : s.Z); if (s.type === 'contour' && !s.three) extend(zb, 0); }
        else if (s.type === 'line' || s.type === 'scatter') { extendArr(xb, s.x); extendArr(yb, s.y); if (s.z) extendArr(zb, s.z); else extend(zb, 0); }
        else if (s.type === 'text') { extend(xb, s.x); extend(yb, s.y); extend(zb, s.z || 0); }
        else if (s.type === 'quiver' || s.type === 'patch') { extendArr(xb, s.x); extendArr(yb, s.y); extend(zb, 0); }
      }
      const fix = (b) => (Number.isFinite(b[0]) ? (b[0] === b[1] ? [b[0] - 1, b[1] + 1] : b) : [0, 1]);
      let xl = fix(xb), yl = fix(yb), zl = fix(zb);
      const tight = ax.tight;
      if (!tight) { xl = niceLimits(xl[0], xl[1], 5); yl = niceLimits(yl[0], yl[1], 5); zl = niceLimits(zl[0], zl[1], 5); }
      if (ax.xlim) xl = ax.xlim; if (ax.ylim) yl = ax.ylim; if (ax.zlim) zl = ax.zlim;
      const box = ax.aspect === 'equal' ? (() => { const dx = xl[1] - xl[0], dy = yl[1] - yl[0], dz = zl[1] - zl[0]; const m = Math.max(dx, dy, dz); return [dx / m, dy / m, dz / m]; })() : [1, 1, 0.8];
      const az = view[0] * Math.PI / 180, el = view[1] * Math.PI / 180;
      const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
      const norm = (x, y, z) => [((x - xl[0]) / (xl[1] - xl[0]) - 0.5) * box[0], ((y - yl[0]) / (yl[1] - yl[0]) - 0.5) * box[1], ((z - zl[0]) / (zl[1] - zl[0]) - 0.5) * box[2]];
      const proj = (p) => [ca * p[0] + sa * p[1], -se * sa * p[0] + se * ca * p[1] + ce * p[2], ce * sa * p[0] - ce * ca * p[1] + se * p[2]];
      // 适配画布
      const top = R.y + (ax.title ? 22 + fs * 1.4 : 14), bottomM = 40, leftM = 40, rightM = ax.colorbar ? 80 : 30;
      const P = { x: R.x + leftM, y: top, w: R.w - leftM - rightM, h: R.h - (top - R.y) - bottomM };
      if (P.w < 30 || P.h < 30) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const cx of [0, 1]) for (const cy of [0, 1]) for (const cz of [0, 1]) {
        const q = proj([(cx - 0.5) * box[0], (cy - 0.5) * box[1], (cz - 0.5) * box[2]]);
        minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
      }
      const scale = Math.min(P.w / (maxX - minX), P.h / (maxY - minY)) * 0.92;
      const cxs = P.x + P.w / 2 - (minX + maxX) / 2 * scale, cys = P.y + P.h / 2 + (minY + maxY) / 2 * scale;
      const S = (x, y, z) => { const q = proj(norm(x, y, z)); return [cxs + q[0] * scale, cys - q[1] * scale, q[2]]; };
      this.axRects.push({ ax, P: { x: R.x, y: R.y, w: R.w, h: R.h }, mode: '3d', view });
      const depthOf = (x, y, z) => proj(norm(x, y, z))[2];
      // 背面判断
      const xc = (xl[0] + xl[1]) / 2, yc = (yl[0] + yl[1]) / 2, zc = (zl[0] + zl[1]) / 2;
      const xBack = depthOf(xl[0], yc, zc) < depthOf(xl[1], yc, zc) ? xl[0] : xl[1];
      const yBack = depthOf(xc, yl[0], zc) < depthOf(xc, yl[1], zc) ? yl[0] : yl[1];
      const zBack = depthOf(xc, yc, zl[0]) < depthOf(xc, yc, zl[1]) ? zl[0] : zl[1];
      const xFront = xBack === xl[0] ? xl[1] : xl[0], yFront = yBack === yl[0] ? yl[1] : yl[0];
      const xt = linTicks(xl[0], xl[1], 5).ticks, yt = linTicks(yl[0], yl[1], 5).ticks, zt = linTicks(zl[0], zl[1], 5).ticks;
      const xs = linTicks(xl[0], xl[1], 5).step, ys = linTicks(yl[0], yl[1], 5).step, zs = linTicks(zl[0], zl[1], 5).step;
      const poly = (pts, fill, stroke) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } };
      if (ax.visible !== false) {
        ctx.save(); ctx.lineWidth = 1;
        // 三个背面
        poly([S(xBack, yl[0], zl[0]), S(xBack, yl[1], zl[0]), S(xBack, yl[1], zl[1]), S(xBack, yl[0], zl[1])], '#fff', null);
        poly([S(xl[0], yBack, zl[0]), S(xl[1], yBack, zl[0]), S(xl[1], yBack, zl[1]), S(xl[0], yBack, zl[1])], '#fff', null);
        poly([S(xl[0], yl[0], zBack), S(xl[1], yl[0], zBack), S(xl[1], yl[1], zBack), S(xl[0], yl[1], zBack)], '#fff', null);
        if (ax.grid) {
          ctx.strokeStyle = 'rgba(0,0,0,0.09)'; ctx.beginPath();
          const seg = (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
          for (const t of xt) { seg(S(t, yBack, zl[0]), S(t, yBack, zl[1])); seg(S(t, yl[0], zBack), S(t, yl[1], zBack)); }
          for (const t of yt) { seg(S(xBack, t, zl[0]), S(xBack, t, zl[1])); seg(S(xl[0], t, zBack), S(xl[1], t, zBack)); }
          for (const t of zt) { seg(S(xBack, yl[0], t), S(xBack, yl[1], t)); seg(S(xl[0], yBack, t), S(xl[1], yBack, t)); }
          ctx.stroke();
        }
        ctx.strokeStyle = '#8e8e93'; ctx.beginPath();
        const edge = (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
        // 坐标轴线
        edge(S(xl[0], yFront, zBack), S(xl[1], yFront, zBack));
        edge(S(xFront, yl[0], zBack), S(xFront, yl[1], zBack));
        ctx.stroke();
        ctx.restore();
      }
      // 收集图元
      const clim = climOf(ax), cmap = this.cmap(ax, fig);
      const cval = (v) => cmap((v - clim[0]) / (clim[1] - clim[0]));
      const prims = [];
      for (const s of ax.series) {
        if (s.visible === false) continue;
        if (s.type === 'surface') {
          const Rr = s.rows, Cc = s.cols, V = s.C || s.Z;
          const pts = new Array(Rr * Cc);
          for (let k = 0; k < Rr * Cc; k++) pts[k] = S(s.X[k], s.Y[k], s.Z[k]);
          for (let j = 0; j < Cc - 1; j++) for (let i = 0; i < Rr - 1; i++) {
            const k0 = i + j * Rr, k1 = i + (j + 1) * Rr, k2 = i + 1 + (j + 1) * Rr, k3 = i + 1 + j * Rr;
            const p = [pts[k0], pts[k1], pts[k2], pts[k3]];
            if (p.some((q) => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) continue;
            const v = (V[k0] + V[k1] + V[k2] + V[k3]) / 4;
            prims.push({ d: (p[0][2] + p[1][2] + p[2][2] + p[3][2]) / 4, kind: 'quad', p, v, s });
          }
        } else if (s.type === 'line') {
          const n = s.x.length; let prev = null;
          for (let i = 0; i < n; i++) {
            const z = s.z ? s.z[i] : 0;
            if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i]) || !Number.isFinite(z)) { prev = null; continue; }
            const q = S(s.x[i], s.y[i], z);
            if (prev && s.lineStyle !== 'none') prims.push({ d: (prev[2] + q[2]) / 2, kind: 'seg', a: prev, b: q, s });
            if (s.marker && s.marker !== 'none') prims.push({ d: q[2] + 1e-6, kind: 'mark', p: q, s });
            prev = q;
          }
        } else if (s.type === 'scatter') {
          for (let i = 0; i < s.x.length; i++) {
            const q = S(s.x[i], s.y[i], s.z ? s.z[i] : 0);
            if (!Number.isFinite(q[0])) continue;
            prims.push({ d: q[2], kind: 'pt', p: q, s, i });
          }
        } else if (s.type === 'contour') {
          const levels = contourLevels(s, clim);
          for (const lv of levels) {
            const zv = s.three ? lv : zl[0];
            marchingSquares(s, lv, (a, b) => { const p = S(a[0], a[1], zv), q = S(b[0], b[1], zv); prims.push({ d: (p[2] + q[2]) / 2, kind: 'cseg', a: p, b: q, s, lv }); });
          }
        } else if (s.type === 'text') {
          const q = S(s.x, s.y, s.z || 0);
          prims.push({ d: q[2] + 10, kind: 'text', p: q, s });
        }
      }
      prims.sort((a, b) => a.d - b.d);
      ctx.save();
      ctx.lineJoin = 'round';
      for (const pr of prims) {
        const s = pr.s;
        if (pr.kind === 'quad') {
          const col = cval(pr.v);
          ctx.beginPath(); ctx.moveTo(pr.p[0][0], pr.p[0][1]); ctx.lineTo(pr.p[1][0], pr.p[1][1]); ctx.lineTo(pr.p[2][0], pr.p[2][1]); ctx.lineTo(pr.p[3][0], pr.p[3][1]); ctx.closePath();
          const alpha = s.faceAlpha !== undefined ? s.faceAlpha : 1;
          if (s.faceColor !== 'none') { ctx.fillStyle = s.faceColor === 'bg' ? 'rgba(255,255,255,' + alpha + ')' : (Array.isArray(s.faceColor) ? css(s.faceColor, alpha) : css(col, alpha)); ctx.fill(); }
          if (s.edgeColor === 'none') { if (s.faceColor !== 'none' && alpha >= 1) { ctx.strokeStyle = Array.isArray(s.faceColor) ? css(s.faceColor) : css(col); ctx.lineWidth = 0.7; ctx.stroke(); } }
          else { ctx.strokeStyle = s.edgeColor === 'flat' || s.edgeColor === 'interp' ? css(col) : css(s.edgeColor, 0.55); ctx.lineWidth = s.edgeColor === 'flat' ? 1 : 0.5; ctx.stroke(); }
        } else if (pr.kind === 'seg') {
          ctx.strokeStyle = css(s.color); ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle));
          ctx.beginPath(); ctx.moveTo(pr.a[0], pr.a[1]); ctx.lineTo(pr.b[0], pr.b[1]); ctx.stroke(); ctx.setLineDash([]);
        } else if (pr.kind === 'cseg') {
          ctx.strokeStyle = s.lineColor ? css(s.lineColor) : css(cval(pr.lv)); ctx.lineWidth = lw(s.lineWidth);
          ctx.beginPath(); ctx.moveTo(pr.a[0], pr.a[1]); ctx.lineTo(pr.b[0], pr.b[1]); ctx.stroke();
        } else if (pr.kind === 'mark') {
          drawMarker(ctx, s.marker, pr.p[0], pr.p[1], s.markerSize || 6, css(s.color), s.markerFaceColor && s.markerFaceColor !== 'none' ? css(s.markerFaceColor) : null);
        } else if (pr.kind === 'pt') {
          const i = pr.i;
          const area = typeof s.sizes === 'number' ? s.sizes : s.sizes[i];
          const c = s.colors ? css(s.colors[i]) : s.cdata ? css(cval(s.cdata[s.cdata.length === 1 ? 0 : i])) : css(s.color);
          drawMarker(ctx, s.marker || 'o', pr.p[0], pr.p[1], Math.sqrt(Math.max(area, 1)) * 1.1, c, s.filled ? c : null);
        } else if (pr.kind === 'text') {
          drawTex(ctx, s.str, pr.p[0], pr.p[1], { size: (s.fontSize || 10) * 1.2, color: css(s.color), valign: 'middle', align: s.hAlign === 'center' ? 'center' : 'left' });
        }
      }
      ctx.restore();
      // 刻度标签
      if (ax.visible !== false) {
        const center = S(xc, yc, zc);
        const label = (p, text, size) => {
          const dx = p[0] - center[0], dy = p[1] - center[1], L = Math.hypot(dx, dy) || 1;
          const ox = p[0] + dx / L * 14, oy = p[1] + dy / L * 12;
          drawTex(ctx, text, ox, oy, { size, align: Math.abs(dx / L) < 0.3 ? 'center' : dx > 0 ? 'left' : 'right', valign: 'middle' });
        };
        ctx.font = fs + 'px ' + FONT;
        for (const t of xt) label(S(t, yFront, zBack), fmtTick(t, xs), fs);
        for (const t of yt) label(S(xFront, t, zBack), fmtTick(t, ys), fs);
        // z 轴：取屏幕最左侧的竖直棱
        const corners = [[xl[0], yl[0]], [xl[0], yl[1]], [xl[1], yl[0]], [xl[1], yl[1]]];
        let zc0 = corners[0], best = Infinity;
        for (const c of corners) { const q = S(c[0], c[1], zc); if (q[0] < best) { best = q[0]; zc0 = c; } }
        ctx.save(); ctx.strokeStyle = '#8e8e93'; ctx.beginPath(); const za = S(zc0[0], zc0[1], zl[0]), zb2 = S(zc0[0], zc0[1], zl[1]); ctx.moveTo(za[0], za[1]); ctx.lineTo(zb2[0], zb2[1]); ctx.stroke(); ctx.restore();
        for (const t of zt) { const q = S(zc0[0], zc0[1], t); drawTex(ctx, fmtTick(t, zs), q[0] - 8, q[1], { size: fs, align: 'right', valign: 'middle' }); }
        if (ax.xlabel) { const q = S(xc, yFront, zBack); label([q[0] + (q[0] - center[0]) * 0.25, q[1] + (q[1] - center[1]) * 0.25 + 10], ax.xlabel, fs + 1); }
        if (ax.ylabel) { const q = S(xFront, yc, zBack); label([q[0] + (q[0] - center[0]) * 0.25, q[1] + (q[1] - center[1]) * 0.25 + 10], ax.ylabel, fs + 1); }
        if (ax.zlabel) { const q = S(zc0[0], zc0[1], zc); ctx.save(); ctx.translate(q[0] - 46, q[1]); ctx.rotate(-Math.PI / 2); drawTex(ctx, ax.zlabel, 0, 0, { size: fs + 1, align: 'center', valign: 'middle' }); ctx.restore(); }
      }
      if (ax.title) drawTex(ctx, ax.title, R.x + R.w / 2, R.y + 12 + fs / 2, { align: 'center', size: fs + 2, bold: true });
      if (ax.colorbar) this.drawColorbar({ x: R.x + R.w - 90, y: P.y + 10, w: 0, h: P.h - 20 }, clim, cmap, fs);
      if (ax.legend) this.drawLegend(ax, { x: R.x + 10, y: P.y, w: R.w - 30, h: P.h }, fs, cmap, clim);
    }

    // ===== 极坐标 =====
    renderPolar(ax, R, fig, fs, m) {
      const ctx = this.ctx;
      const top = R.y + (ax.title ? 24 + fs : 14);
      const cx = R.x + R.w / 2, cy = top + (R.h - (top - R.y) - 24) / 2;
      const rad = Math.min(R.w - 70, R.h - (top - R.y) - 40) / 2;
      if (rad < 20) return;
      let rmax = 0;
      for (const s of ax.series) if (s.type === 'line') for (const v of s.y) if (Number.isFinite(v)) rmax = Math.max(rmax, Math.abs(v));
      if (!rmax) rmax = 1;
      const rt = linTicks(0, rmax, 4);
      const rlim = ax.ylim ? ax.ylim[1] : rt.ticks[rt.ticks.length - 1] < rmax ? rt.ticks[rt.ticks.length - 1] + rt.step : rt.ticks[rt.ticks.length - 1];
      ctx.save();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (const t of rt.ticks) if (t > 0 && t <= rlim) { ctx.beginPath(); ctx.arc(cx, cy, t / rlim * rad, 0, 2 * Math.PI); ctx.stroke(); }
      for (let d = 0; d < 360; d += 30) { const a = d * Math.PI / 180; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + rad * Math.cos(a), cy - rad * Math.sin(a)); ctx.stroke(); drawTex(ctx, d + '°', cx + (rad + 16) * Math.cos(a), cy - (rad + 12) * Math.sin(a), { align: 'center', valign: 'middle', size: fs }); }
      ctx.strokeStyle = '#8e8e93'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.stroke();
      for (const t of rt.ticks) if (t > 0 && t <= rlim) drawTex(ctx, fmtTick(t, rt.step), cx + t / rlim * rad * Math.cos(Math.PI / 12) + 2, cy - t / rlim * rad * Math.sin(Math.PI / 12), { size: fs - 1, color: '#6e6e73' });
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.clip();
      for (const s of ax.series) {
        if (s.type !== 'line') continue;
        ctx.strokeStyle = css(s.color); ctx.lineWidth = lw(s.lineWidth); ctx.setLineDash(dashOf(s.lineStyle));
        ctx.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          const th = s.x[i], r = s.y[i];
          if (!Number.isFinite(th) || !Number.isFinite(r)) { pen = false; continue; }
          const px = cx + r / rlim * rad * Math.cos(th), py = cy - r / rlim * rad * Math.sin(th);
          if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
        }
        if (s.lineStyle !== 'none') ctx.stroke();
        ctx.setLineDash([]);
        if (s.marker && s.marker !== 'none') for (let i = 0; i < s.x.length; i++) drawMarker(ctx, s.marker, cx + s.y[i] / rlim * rad * Math.cos(s.x[i]), cy - s.y[i] / rlim * rad * Math.sin(s.x[i]), s.markerSize || 6, css(s.color), null);
      }
      ctx.restore();
      if (ax.title) drawTex(ctx, ax.title, R.x + R.w / 2, R.y + 12 + fs / 2, { align: 'center', size: fs + 2, bold: true });
      if (ax.legend) this.drawLegend(ax, { x: R.x + 10, y: top, w: R.w - 20, h: R.h - 40 }, fs, null, null);
    }

    // ===== 饼图 =====
    renderPie(ax, R, fig, fs) {
      const ctx = this.ctx;
      const s = ax.series.find((x) => x.type === 'pie');
      if (!s) return;
      const top = R.y + (ax.title ? 26 + fs : 10);
      const cx = R.x + R.w / 2, cy = top + (R.h - (top - R.y)) / 2;
      const rad = Math.min(R.w - 120, R.h - (top - R.y) - 50) / 2;
      if (rad < 10) return;
      const cmap = this.cmap(ax, fig);
      const n = s.frac.length;
      let ang = Math.PI / 2;
      ctx.save();
      s.frac.forEach((f, k) => {
        const a0 = ang, a1 = ang + f * 2 * Math.PI; // 逆时针
        const mid = (a0 + a1) / 2;
        const ex = s.explode && s.explode[k] ? rad * 0.1 : 0;
        const ox = ex * Math.cos(mid), oy = -ex * Math.sin(mid);
        ctx.beginPath(); ctx.moveTo(cx + ox, cy + oy);
        ctx.arc(cx + ox, cy + oy, rad, -a1, -a0);
        ctx.closePath();
        ctx.fillStyle = css(cmap(n === 1 ? 0 : k / (n - 1))); ctx.fill();
        ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 0.8; ctx.stroke();
        const lx = cx + ox + (rad + 18) * Math.cos(mid), ly = cy + oy - (rad + 14) * Math.sin(mid);
        drawTex(ctx, s.labels[k] || '', lx, ly, { align: Math.cos(mid) > 0.2 ? 'left' : Math.cos(mid) < -0.2 ? 'right' : 'center', valign: 'middle', size: fs });
        ang = a1;
      });
      ctx.restore();
      if (ax.title) drawTex(ctx, ax.title, R.x + R.w / 2, R.y + 12 + fs / 2, { align: 'center', size: fs + 2, bold: true });
      if (ax.legend) {
        const labels = ax.legend.labels || s.labels;
        ctx.save(); ctx.font = fs + 'px ' + FONT;
        const W = Math.max(...labels.map((l) => measureTex(ctx, l, fs))) + 36, Hh = labels.length * (fs + 8) + 6;
        const x = R.x + R.w - W - 10, y = top;
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x, y, W, Hh); ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.strokeRect(x + 0.5, y + 0.5, W, Hh);
        labels.forEach((l, k) => { const yy = y + 3 + (k + 0.5) * (fs + 8); ctx.fillStyle = css(cmap(n === 1 ? 0 : k / (n - 1))); ctx.fillRect(x + 6, yy - 5, 18, 10); drawTex(ctx, l, x + 30, yy, { size: fs, valign: 'middle' }); });
        ctx.restore();
      }
    }

    // 鼠标位置 → 数据坐标（二维）
    dataAt(px, py) {
      for (let i = this.axRects.length - 1; i >= 0; i--) {
        const r = this.axRects[i];
        if (r.mode !== '2d') continue;
        const P = r.P;
        if (px >= P.x && px <= P.x + P.w && py >= P.y && py <= P.y + P.h) {
          let x = r.xl[0] + (px - P.x) / P.w * (r.xl[1] - r.xl[0]);
          let y0 = r.rev ? (py - P.y) / P.h : (P.y + P.h - py) / P.h;
          let y = r.yl[0] + y0 * (r.yl[1] - r.yl[0]);
          if (r.xlog) x = Math.pow(10, x); if (r.ylog) y = Math.pow(10, y);
          return { x, y };
        }
      }
      return null;
    }
    axes3DAt(px, py) {
      for (let i = this.axRects.length - 1; i >= 0; i--) {
        const r = this.axRects[i];
        if (r.mode === '3d' && px >= r.P.x && px <= r.P.x + r.P.w && py >= r.P.y && py <= r.P.y + r.P.h) return r;
      }
      return null;
    }
  }

  ML.FigureRenderer = FigureRenderer;
  ML.render = { drawTex, texSegments, linTicks, css };
})(typeof self !== 'undefined' ? self : globalThis);
