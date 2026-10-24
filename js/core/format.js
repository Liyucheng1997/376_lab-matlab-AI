/* MatWeb - 输出格式化（模仿 MATLAB 命令行窗口的显示风格）*/
(function (G) {
  'use strict';
  const ML = G.ML;
  const { Tensor, Cell, Struct, FuncHandle, isIntType } = ML.types;

  const settings = { mode: 'short', compact: false, width: 100 };

  function expStr(x, d) {
    // 1.2346e+05 形式（指数至少两位）
    let s = x.toExponential(d);
    return s.replace(/e([+-])(\d)$/, 'e$10$2');
  }
  function special(x) {
    if (Number.isNaN(x)) return 'NaN';
    if (x === Infinity) return 'Inf';
    if (x === -Infinity) return '-Inf';
    return null;
  }
  function trimZeros(s) {
    if (s.indexOf('e') >= 0) {
      const [m, e] = s.split('e');
      return (m.indexOf('.') >= 0 ? m.replace(/0+$/, '').replace(/\.$/, '') : m) + 'e' + e;
    }
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }
  function gStr(x, p) {
    const sp = special(x); if (sp) return sp;
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e < -5 || e >= p) return trimZeros(expStr(x, p - 1));
    return trimZeros(x.toFixed(Math.max(0, p - 1 - e)));
  }
  // 有理逼近（format rat）
  function ratStr(x) {
    const sp = special(x); if (sp) return sp;
    if (Number.isInteger(x)) return String(x);
    const tol = 1e-6 * Math.abs(x);
    let y = x, a = Math.floor(y), h1 = 1, h0 = 0, k1 = 0, k0 = 1;
    let h = a, k = 1;
    for (let i = 0; i < 20; i++) {
      a = Math.floor(y);
      h = a * h1 + h0; k = a * k1 + k0;
      h0 = h1; h1 = h; k0 = k1; k1 = k;
      if (Math.abs(x - h / k) <= tol) break;
      const f = y - a;
      if (f === 0) break;
      y = 1 / f;
    }
    if (k < 0) { h = -h; k = -k; }
    return k === 1 ? String(h) : h + '/' + k;
  }

  // 计算一组实数的格式方案
  function analyze(vals) {
    let allInt = true, maxAbs = 0, anyFinite = false, minAbs = Infinity;
    for (const v of vals) {
      if (!Number.isFinite(v)) continue;
      anyFinite = true;
      if (!Number.isInteger(v)) allInt = false;
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
      if (a > 0 && a < minAbs) minAbs = a;
    }
    return { allInt, maxAbs, anyFinite, minAbs };
  }

  // 返回 {fmt: (x)=>string, scale: string|null}
  function makeFormatter(vals, isScalar, isComplex) {
    const mode = settings.mode;
    const info = analyze(vals);
    if (mode === 'rat') return { fmt: ratStr, scale: null };
    if (info.allInt && info.maxAbs < 1e10 && !(isComplex && (mode === 'short' || mode === 'long'))) return { fmt: (x) => special(x) || String(x === 0 ? 0 : x), scale: null, isInt: true };
    if (mode === 'shortg') return { fmt: (x) => gStr(x, 5), scale: null };
    if (mode === 'longg') return { fmt: (x) => gStr(x, 15), scale: null };
    if (mode === 'shorte') return { fmt: (x) => special(x) || expStr(x, 4), scale: null };
    if (mode === 'longe') return { fmt: (x) => special(x) || expStr(x, 15), scale: null };
    const long = mode === 'long';
    const baseDec = long ? 15 : 4;
    const maxAbs = info.maxAbs;
    const big = maxAbs >= (long ? 1e5 : 1e5) || (maxAbs > 0 && maxAbs < 1e-3);
    if (!info.anyFinite) return { fmt: (x) => special(x) || '0', scale: null };
    if (big) {
      if (isScalar) return { fmt: (x) => special(x) || expStr(x, baseDec), scale: null };
      const e = Math.floor(Math.log10(maxAbs));
      // 数量级差异过大时使用指数表示
      if (info.minAbs < maxAbs * 1e-5 && !long) return { fmt: (x) => special(x) || (x === 0 ? '0' : expStr(x, 4)), scale: null };
      const sc = Math.pow(10, e);
      return {
        fmt: (x) => special(x) || (x === 0 ? '0' : (x / sc).toFixed(baseDec)),
        scale: '   1.0e' + (e >= 0 ? '+' : '-') + String(Math.abs(e)).padStart(2, '0') + ' *'
      };
    }
    let dec = baseDec;
    if (long) {
      const intDigits = maxAbs >= 1 ? Math.floor(Math.log10(maxAbs)) + 1 : 1;
      dec = Math.max(15 - (intDigits - 1), 1);
    }
    return { fmt: (x) => special(x) || (x === 0 && !isComplex ? '0' : x.toFixed(dec)), scale: null };
  }

  function fixNegZero(x) { return x === 0 ? 0 : x; }

  // 实数/复数矩阵 → 文本行
  function matrixLines(t, indent) {
    const R = t.rows, Cn = t.cols, n = R * Cn;
    indent = indent === undefined ? 0 : indent;
    const lines = [];
    if (t.type === 'char') {
      for (let r = 0; r < R; r++) lines.push(' '.repeat(indent + 4) + "'" + t.rowString(r) + "'");
      return lines;
    }
    let cells = new Array(n);
    let scale = null;
    if (t.im) {
      const re = Array.from(t.re, fixNegZero), im = Array.from(t.im, fixNegZero);
      const f = makeFormatter(re.concat(im), n === 1, true);
      scale = f.scale;
      const reS = re.map(f.fmt), imS = im.map((x) => f.fmt(Math.abs(x)));
      const wRe = Math.max(...reS.map((s) => s.length)), wIm = Math.max(...imS.map((s) => s.length));
      for (let k = 0; k < n; k++) {
        const sign = (im[k] < 0 || Object.is(t.im[k], -0)) ? ' - ' : ' + ';
        cells[k] = reS[k].padStart(wRe) + sign + imS[k].padEnd(wIm) + 'i';
      }
    } else {
      const vals = Array.from(t.re, fixNegZero);
      const f = makeFormatter(vals, n === 1);
      scale = f.scale;
      for (let k = 0; k < n; k++) cells[k] = f.fmt(vals[k]);
    }
    const maxLen = Math.max(...cells.map((s) => s.length));
    let width;
    if (t.type === 'logical') width = maxLen + 2;
    else if (t.im) width = maxLen + 3;
    else width = Math.max(maxLen + 3, (isIntType(t.type) ? maxLen + 2 : 6));
    if (n === 1) return { lines: [cells[0]], scale };
    // 按窗口宽度分列显示
    const perChunk = Math.max(1, Math.floor((settings.width - indent) / width));
    const maxRows = 2000;
    for (let c0 = 0; c0 < Cn; c0 += perChunk) {
      const c1 = Math.min(Cn, c0 + perChunk);
      if (Cn > perChunk) {
        if (lines.length) lines.push('');
        lines.push(c1 - c0 === 1 ? '  第 ' + (c0 + 1) + ' 列' : '  第 ' + (c0 + 1) + ' 至 ' + c1 + ' 列');
        lines.push('');
      }
      for (let r = 0; r < R && r < maxRows; r++) {
        let s = ' '.repeat(indent);
        for (let c = c0; c < c1; c++) s += cells[r + c * R].padStart(width);
        lines.push(s);
      }
      if (R > maxRows) lines.push('   ...（省略 ' + (R - maxRows) + ' 行）');
    }
    return { lines, scale };
  }

  // 短格式摘要（用于结构体字段、元胞元素）
  function summary(v, inCell) {
    if (v instanceof Tensor) {
      if (v.type === 'char') {
        if (v.rows <= 1) return "'" + v.toStr() + "'";
        return v.rows + '×' + v.cols + ' char';
      }
      if (v.numel === 0) return inCell ? '[]' : '[]';
      if (v.numel === 1) {
        const ml = matrixLines(v, 0);
        const s = ml.lines[0].trim();
        return inCell ? '[' + s + ']' : s;
      }
      if (v.rows === 1 && v.cols <= 10 && !v.im) {
        const parts = Array.from(v.re, (x) => gStr(fixNegZero(x), 5));
        return '[' + parts.join(' ') + ']';
      }
      const cls = v.type === 'double' && v.im ? 'double' : v.type;
      return (inCell ? '' : '[') + v.rows + '×' + v.cols + ' ' + cls + (v.im ? ' (复数)' : '') + (inCell ? '' : ']');
    }
    if (v instanceof Cell) return '{' + v.rows + '×' + v.cols + ' cell}';
    if (v instanceof Struct) return (inCell ? '' : '[') + v.rows + '×' + v.cols + ' struct' + (inCell ? '' : ']');
    if (v instanceof FuncHandle) return v.text;
    if (v && v.className) return '[1×1 ' + v.className() + ']';
    return '?';
  }

  function cellLines(c) {
    const R = c.rows, Cn = c.cols;
    const cells = c.data.map((v) => '{' + summary(v, true) + '}');
    const widths = [];
    for (let j = 0; j < Cn; j++) { let w = 0; for (let i = 0; i < R; i++) w = Math.max(w, cells[i + j * R].length); widths.push(w); }
    const lines = [];
    for (let i = 0; i < R; i++) {
      let s = '   ';
      for (let j = 0; j < Cn; j++) s += ' ' + cells[i + j * R].padEnd(widths[j]) + (j < Cn - 1 ? '   ' : '');
      lines.push(s.replace(/\s+$/, ''));
    }
    return lines;
  }

  function structLines(s, indent) {
    indent = indent || 4;
    const lines = [];
    if (s.numel === 1) {
      const w = Math.max(0, ...s.fields.map((f) => f.length));
      for (const f of s.fields) lines.push(' '.repeat(indent) + f.padStart(w) + ': ' + summary(s.getField(f, 0), false));
    } else {
      for (const f of s.fields) lines.push(' '.repeat(indent) + f);
    }
    return lines;
  }

  function typeHeader(t) {
    if (t.type === 'logical') return '  ' + t.rows + '×' + t.cols + ' logical 数组';
    if (isIntType(t.type) || t.type === 'single') return '  ' + t.rows + '×' + t.cols + ' ' + t.type + ' 矩阵';
    return null;
  }

  // 带变量名的显示（语句不加分号时）
  function display(name, v) {
    const blank = settings.compact ? '' : '\n';
    if (v instanceof Tensor) {
      if (v.numel === 0) {
        if (v.type === 'char') return name + " =\n\n    0×0 空 char 数组\n" + blank;
        return name + ' =\n\n     []\n' + blank;
      }
      if (v.type === 'char' && v.rows === 1) return name + " = '" + v.toStr() + "'\n";
      if (v.numel === 1 && (v.type === 'double' || v.type === 'char')) {
        const ml = matrixLines(v, 0);
        return name + ' = ' + ml.lines[0].trim() + '\n';
      }
      if (v.numel === 1) {
        const ml = matrixLines(v, 0);
        return name + ' =\n\n  ' + v.type + '\n\n' + '   ' + ml.lines[0].trim() + '\n' + blank;
      }
      const ml = matrixLines(v, 0);
      const lines = ml.lines || ml;
      let out = name + ' =\n' + blank;
      const hdr = typeHeader(v);
      if (hdr) out += hdr + '\n' + blank;
      if (ml.scale) out += ml.scale + '\n' + blank;
      out += lines.join('\n') + '\n' + blank;
      return out;
    }
    if (v instanceof Cell) {
      if (v.numel === 0) return name + ' =\n\n  空的 ' + v.rows + '×' + v.cols + ' cell 数组\n' + blank;
      return name + ' =\n' + blank + '  ' + v.rows + '×' + v.cols + ' cell 数组\n' + blank + cellLines(v).join('\n') + '\n' + blank;
    }
    if (v instanceof Struct) {
      if (v.numel === 1) return name + ' =\n' + blank + '  包含以下字段的 struct:\n' + blank + structLines(v).join('\n') + '\n' + blank;
      return name + ' =\n' + blank + '  ' + v.rows + '×' + v.cols + ' struct 数组，包含以下字段:\n' + blank + structLines(v).join('\n') + '\n' + blank;
    }
    if (v instanceof FuncHandle) return name + ' =\n' + blank + '  包含以下值的 function_handle:\n' + blank + '    ' + v.text + '\n' + blank;
    if (v && v.mlDisplay) return name + ' =\n' + blank + v.mlDisplay() + '\n' + blank;
    return name + ' = ?\n';
  }

  // disp(x)
  function dispStr(v) {
    if (v instanceof Tensor) {
      if (v.numel === 0) return '';
      if (v.type === 'char') return v.toStr() + '\n';
      const ml = matrixLines(v, 0);
      if (v.numel === 1) return '   ' + ml.lines[0].trim() + '\n';
      return (ml.scale ? ml.scale + '\n\n' : '') + ml.lines.join('\n') + '\n';
    }
    if (v instanceof Cell) return cellLines(v).join('\n') + '\n';
    if (v instanceof Struct) return structLines(v).join('\n') + '\n';
    if (v instanceof FuncHandle) return '    ' + v.text + '\n';
    if (v && v.mlDisplay) return v.mlDisplay() + '\n';
    return '\n';
  }

  ML.fmt = { settings, display, dispStr, matrixLines, summary, gStr, expStr, ratStr, trimZeros, special };
})(typeof self !== 'undefined' ? self : globalThis);
