/* MatWeb - 字符串函数：sprintf/num2str/mat2str/正则表达式/字符串操作/进制转换 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const D = (syn, desc, cat) => ({ cat: cat || '字符串', syn, desc });

  // ---------- printf 格式化 ----------
  function unescape(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) {
        const d = s[++i];
        switch (d) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case 'a': out += '\x07'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'v': out += '\v'; break;
          case '\\': out += '\\'; break;
          case '\'': out += '\''; break;
          case '"': out += '"'; break;
          case 'x': { let h = ''; while (i + 1 < s.length && /[0-9a-fA-F]/.test(s[i + 1]) && h.length < 4) h += s[++i]; out += String.fromCharCode(parseInt(h || '0', 16)); break; }
          default:
            if (d >= '0' && d <= '7') { let o = d; while (i + 1 < s.length && /[0-7]/.test(s[i + 1]) && o.length < 3) o += s[++i]; out += String.fromCharCode(parseInt(o, 8)); }
            else out += '\\' + d;
        }
      } else out += c;
    }
    return out;
  }
  // 将格式串解析为片段：{lit} 或 {spec}
  function parseFormat(fmt) {
    const parts = [];
    let lit = '';
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c !== '%') { lit += c; continue; }
      if (fmt[i + 1] === '%') { lit += '%'; i++; continue; }
      const m = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?([lh]?)([diuoxXfFeEgGcsa])/.exec(fmt.slice(i));
      if (!m) { lit += c; continue; }
      if (lit) { parts.push({ lit }); lit = ''; }
      parts.push({ flags: m[1], width: m[2], prec: m[3], conv: m[5] });
      i += m[0].length - 1;
    }
    if (lit) parts.push({ lit });
    return parts;
  }
  function expFix(s) { return s.replace(/e([+-])(\d)$/, 'e$10$2'); }
  function fmtG(x, prec, alt, upper) {
    const P = prec === 0 ? 1 : prec;
    if (x === 0) return alt ? (0).toFixed(P - 1) : '0';
    let e = Math.floor(Math.log10(Math.abs(x)));
    const rounded = Number(x.toPrecision(P));
    if (rounded !== 0) e = Math.floor(Math.log10(Math.abs(rounded)));
    let s;
    if (e < -4 || e >= P) {
      s = expFix(x.toExponential(P - 1));
      if (!alt) s = s.replace(/\.?0+e/, 'e');
    } else {
      s = x.toFixed(Math.max(0, P - 1 - e));
      if (!alt && s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    }
    return upper ? s.toUpperCase() : s;
  }
  function formatOne(spec, val, width, prec) {
    let conv = spec.conv;
    const flags = spec.flags || '';
    let s;
    if (conv === 's') {
      // 数值用于 %s：整数按字符编码输出，非整数改用 %e（与 MATLAB 一致）
      if (typeof val === 'number') s = Number.isInteger(val) && val >= 0 ? String.fromCharCode(val) : expFix(val.toExponential(6));
      else s = prec !== undefined ? val.slice(0, prec) : val;
    } else if (conv === 'c') {
      s = typeof val === 'number' ? String.fromCharCode(val) : val;
    } else {
      let x = typeof val === 'number' ? val : NaN;
      if (typeof val === 'string') {
        // 字符串用于数值转换：逐字符输出编码
        return val.split('').map((ch) => formatOne(spec, ch.charCodeAt(0), width, prec)).join('');
      }
      // 整数转换符遇到非整数时改用 %e
      if ((conv === 'd' || conv === 'i' || conv === 'u' || conv === 'x' || conv === 'X' || conv === 'o') && !Number.isInteger(x) && Number.isFinite(x)) conv = 'e';
      if (!Number.isFinite(x)) {
        s = Number.isNaN(x) ? 'NaN' : (x > 0 ? 'Inf' : '-Inf');
        if (x > 0 && flags.indexOf('+') >= 0) s = '+' + s;
      } else {
        const neg = x < 0;
        const ax = Math.abs(x);
        switch (conv) {
          case 'd': case 'i': case 'u': s = String(ax); break;
          case 'x': s = Math.round(ax).toString(16); break;
          case 'X': s = Math.round(ax).toString(16).toUpperCase(); break;
          case 'o': s = Math.round(ax).toString(8); break;
          case 'f': case 'F': s = ax.toFixed(prec !== undefined ? prec : 6); if (flags.indexOf('#') >= 0 && prec === 0) s += '.'; break;
          case 'e': s = expFix(ax.toExponential(prec !== undefined ? prec : 6)); break;
          case 'E': s = expFix(ax.toExponential(prec !== undefined ? prec : 6)).toUpperCase(); break;
          case 'g': s = fmtG(ax, prec !== undefined ? prec : 6, flags.indexOf('#') >= 0, false); break;
          case 'G': s = fmtG(ax, prec !== undefined ? prec : 6, flags.indexOf('#') >= 0, true); break;
          case 'a': s = ax.toString(16); break;
          default: s = String(ax);
        }
        if ((conv === 'd' || conv === 'i') && prec !== undefined) s = s.padStart(prec, '0');
        let sign = neg ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
        if (flags.indexOf('0') >= 0 && flags.indexOf('-') < 0 && width) {
          s = s.padStart(width - sign.length, '0');
        }
        s = sign + s;
      }
    }
    if (width && s.length < width) s = flags.indexOf('-') >= 0 ? s.padEnd(width) : s.padStart(width);
    return s;
  }
  // 将参数展开为数据项
  function dataItems(args) {
    const items = [];
    for (const v of args) {
      if (v instanceof Tensor) {
        if (v.type === 'char') { items.push(v.toStr().replace(/\n/g, '\n')); continue; }
        for (let k = 0; k < v.numel; k++) {
          items.push(v.re[k]);
        }
      } else if (v instanceof Cell) {
        for (const x of v.data) { if (T.isStr(x)) items.push(x.toStr()); else if (x instanceof Tensor) for (let k = 0; k < x.numel; k++) items.push(x.re[k]); else err('sprintf: 不支持元胞数组中的此类型。'); }
      } else if (v instanceof FuncHandle) items.push(v.text);
      else err('sprintf: 不支持 ' + T.classOf(v) + ' 类型的参数。');
    }
    return items;
  }
  function sprintfCore(fmt, args) {
    const parts = parseFormat(unescape(fmt));
    const items = dataItems(args);
    const nspec = parts.filter((p) => !p.lit).length;
    let out = '';
    let idx = 0;
    if (nspec === 0 || items.length === 0) {
      // 无数据时只输出字面文本（转换符输出为空）
      for (const p of parts) if (p.lit) out += p.lit;
      return out;
    }
    let guard = 0;
    while (idx < items.length && guard++ < 1e6) {
      for (const p of parts) {
        if (p.lit !== undefined) { out += p.lit; continue; }
        let width = p.width, prec = p.prec;
        if (width === '*') { if (idx >= items.length) return out; width = items[idx++]; }
        if (prec === '*') { if (idx >= items.length) return out; prec = items[idx++]; }
        if (idx >= items.length) return out;
        const val = items[idx++];
        out += formatOne(p, val, width !== undefined ? +width : 0, prec !== undefined ? +prec : undefined);
      }
    }
    return out;
  }
  ML.sprintf = sprintfCore;
  ML.unescape = unescape;
  def('sprintf', (a) => {
    H.nargchk(a, 1, undefined, 'sprintf');
    return T.str(sprintfCore(H.str(a[0], '格式'), a.slice(1)));
  }, D("s = sprintf(fmt, A, ...)", '格式化数据为字符串（%d %f %e %g %s %c %x）'));
  def('fprintf', (a, nargout, it) => {
    H.nargchk(a, 1, undefined, 'fprintf');
    let fid = 1, k = 0;
    if (a[0] instanceof Tensor && a[0].type !== 'char' && a[0].numel === 1 && a.length > 1) { fid = a[0].re[0]; k = 1; }
    const s = sprintfCore(H.str(a[k], '格式'), a.slice(k + 1));
    if (fid === 2) it.printErr(s);
    else if (fid === 1) it.print(s);
    else if (it.fileHandles && it.fileHandles.has(fid)) it.fileHandles.get(fid).buf += s;
    else err('fprintf: 无效的文件标识符。');
    return nargout > 0 ? T.scalar(s.length) : null;
  }, D("fprintf(fmt, A, ...)", '格式化输出到命令行窗口'));

  // ---------- num2str / mat2str ----------
  function num2strScalar(x, prec) {
    if (Number.isNaN(x)) return 'NaN';
    if (!Number.isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
    if (Number.isInteger(x) && prec === undefined) return String(x);
    const p = prec !== undefined ? prec : Math.max(Math.floor(Math.log10(Math.abs(x) || 1)) + 5, 5);
    return fmtG(x, p, false, false);
  }
  function num2strCore(v, arg) {
    if (T.isStr(v)) return v;
    if (!(v instanceof Tensor)) err('num2str: 输入必须为数值。');
    if (v.numel === 0) return T.str('');
    if (arg && T.isStr(arg)) {
      const fmt = arg.toStr();
      const lines = [];
      for (let r = 0; r < v.rows; r++) { const row = []; for (let c = 0; c < v.cols; c++) row.push(v.re[r + c * v.rows]); lines.push(sprintfCore(fmt, [T.row(row)])); }
      return T.charMatrix(lines);
    }
    const prec = arg ? H.int(arg) : undefined;
    const fmtC = (k) => {
      const re = num2strScalar(v.re[k], prec);
      if (!v.im) return re;
      const im = v.im[k];
      return re + (im < 0 || Object.is(im, -0) ? '-' : '+') + num2strScalar(Math.abs(im), prec) + 'i';
    };
    if (v.numel === 1) return T.str(fmtC(0));
    const cells = []; for (let k = 0; k < v.numel; k++) cells.push(fmtC(k));
    const allInt = !v.im && Array.from(v.re).every((x) => Number.isInteger(x) || !Number.isFinite(x));
    const w = Math.max(...cells.map((s) => s.length)) + 2;
    const lines = [];
    for (let r = 0; r < v.rows; r++) {
      let s = '';
      for (let c = 0; c < v.cols; c++) s += cells[r + c * v.rows].padStart(allInt ? w : w);
      lines.push(s);
    }
    // 去除公共的前导空格
    const lead = Math.min(...lines.map((l) => l.length - l.replace(/^ +/, '').length));
    return T.charMatrix(lines.map((l) => l.slice(lead).replace(/\s+$/, '')));
  }
  def('num2str', (a) => { H.nargchk(a, 1, 2, 'num2str'); const r = num2strCore(a[0], a[1]); return r instanceof Tensor ? r : T.str(r); },
    D('s = num2str(x), num2str(x,prec), num2str(x,fmt)', '数字转换为字符串'));
  def('int2str', (a) => num2strCore(ML.builtins.round([a[0]])), D('s = int2str(x)', '整数转换为字符串（先四舍五入）'));
  function mat2strVal(x, prec, isLogical) {
    if (isLogical) return x ? 'true' : 'false';
    if (Number.isNaN(x)) return 'NaN';
    if (!Number.isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
    return fmtG(x, prec, false, false);
  }
  def('mat2str', (a) => {
    const v = a[0];
    const prec = a.length > 1 ? H.int(a[1]) : 15;
    if (T.isStr(v)) { if (v.rows <= 1) return T.str("'" + v.toStr().replace(/'/g, "''") + "'"); return T.str('[' + Array.from({ length: v.rows }, (x, r) => "'" + v.rowString(r) + "'").join(';') + ']'); }
    const t = H.tensor(v);
    const isL = t.type === 'logical';
    const el = (k) => {
      const re = mat2strVal(t.re[k], prec, isL);
      if (!t.im) return re;
      const im = t.im[k];
      return re + (im < 0 ? '-' : '+') + mat2strVal(Math.abs(im), prec) + 'i';
    };
    if (t.numel === 1) return T.str(el(0));
    const rows = [];
    for (let r = 0; r < t.rows; r++) { const row = []; for (let c = 0; c < t.cols; c++) row.push(el(r + c * t.rows)); rows.push(row.join(' ')); }
    return T.str('[' + rows.join(';') + ']');
  }, D('s = mat2str(A)', '矩阵转换为 MATLAB 语法字符串'));
  def('str2num', (a, nargout, it) => {
    const s = H.str(a[0]);
    try {
      const sub = new ML.Interpreter({ print() {}, printErr() {}, warn() {} });
      sub.files = it.files;
      const vals = sub.evalString('__r = [' + s.replace(/\n/g, ';') + '];', null, 0);
      void vals;
      const r = sub.getVar(sub.base, '__r');
      return [r, T.bool(true)];
    } catch (e) {
      return [new Tensor(0, 0), T.bool(false)];
    }
  }, D('x = str2num(s)', '字符串转换为数值（求值）'));
  function parseDouble(s) {
    s = s.trim().replace(/,/g, '');
    if (/^[+-]?inf(inity)?$/i.test(s)) return [s[0] === '-' ? -Infinity : Infinity, 0];
    if (/^nan$/i.test(s)) return [NaN, 0];
    const num = '[+-]?(?:\\d+\\.?\\d*(?:[eEdD][+-]?\\d+)?|\\.\\d+(?:[eEdD][+-]?\\d+)?|inf|nan)';
    let m = new RegExp('^(' + num + ')$', 'i').exec(s);
    if (m) return [parseFloat(m[1].replace(/[dD]/, 'e').replace(/^([+-]?)inf/i, '$1Infinity')), 0];
    m = new RegExp('^(' + num + ')?\\s*([+-])\\s*(' + num.replace('[+-]?', '') + ')?\\s*\\*?\\s*[ij]$', 'i').exec(s);
    if (m) { const re = m[1] ? parseFloat(m[1]) : 0; const im = (m[3] ? parseFloat(m[3]) : 1) * (m[2] === '-' ? -1 : 1); return [re, im]; }
    m = new RegExp('^(' + num + ')\\s*\\*?\\s*[ij]$', 'i').exec(s);
    if (m) return [0, parseFloat(m[1])];
    if (/^[+-]?[ij]$/.test(s)) return [0, s[0] === '-' ? -1 : 1];
    return [NaN, 0];
  }
  def('str2double', (a) => {
    const v = a[0];
    if (v instanceof Cell) {
      const t = new Tensor(v.rows, v.cols); let anyIm = false; const im = new Float64Array(v.numel);
      v.data.forEach((x, k) => { const [re, i] = T.isStr(x) ? parseDouble(x.toStr()) : [NaN, 0]; t.re[k] = re; im[k] = i; if (i) anyIm = true; });
      if (anyIm) t.im = im;
      return t;
    }
    if (!T.isStr(v)) return T.scalar(NaN);
    if (v.rows > 1) { const t = new Tensor(v.rows, 1); for (let r = 0; r < v.rows; r++) t.re[r] = parseDouble(v.rowString(r))[0]; return t; }
    const [re, im] = parseDouble(v.toStr());
    return im ? T.complex(re, im) : T.scalar(re);
  }, D('x = str2double(s)', '字符串转换为双精度数（无效时返回 NaN）'));
  def('string', (a) => { const v = a[0]; if (T.isStr(v)) return v; if (v instanceof Cell) return v; if (v instanceof Tensor && v.numel === 1) return T.str(num2strScalar(v.re[0])); return num2strCore(v); }, D('s = string(x)', '转换为字符串（本环境用字符向量表示）'));
  def('strings', (a) => { const { r, c } = H.sizeArgs(a); return new Cell(r, c, new Array(r * c).fill(null).map(() => T.str(''))); });

  // ---------- 基本字符串操作 ----------
  const mapStr = (v, f) => {
    if (v instanceof Cell) return new Cell(v.rows, v.cols, v.data.map((x) => mapStr(x, f)));
    if (T.isStr(v)) { if (v.rows <= 1) return T.str(f(v.toStr())); return T.charMatrix(Array.from({ length: v.rows }, (x, r) => f(v.rowString(r)))); }
    if (v instanceof Tensor && v.numel === 0) return T.str('');
    err('输入必须为字符向量或元胞数组。');
  };
  def('upper', (a) => mapStr(a[0], (s) => s.toUpperCase()), D('upper(s)', '转换为大写'));
  def('lower', (a) => mapStr(a[0], (s) => s.toLowerCase()), D('lower(s)', '转换为小写'));
  def('strtrim', (a) => mapStr(a[0], (s) => s.replace(/^[\s\0]+|[\s\0]+$/g, '')), D('strtrim(s)', '删除首尾空白'));
  def('deblank', (a) => mapStr(a[0], (s) => s.replace(/[\s\0]+$/g, '')), D('deblank(s)', '删除尾部空白'));
  def('fliplr_str reverse', (a) => mapStr(a[0], (s) => s.split('').reverse().join('')), D('reverse(s)', '反转字符串'));
  def('blanks', (a) => T.str(' '.repeat(Math.max(0, H.int(a[0])))), D('blanks(n)', '由 n 个空格组成的字符串'));
  def('newline', () => T.str('\n'), D('newline', '换行符'));
  def('strcat', (a) => {
    if (a.some((x) => x instanceof Cell)) {
      const n = Math.max(...a.map((x) => (x instanceof Cell ? x.numel : 1)));
      const shape = a.find((x) => x instanceof Cell && x.numel === n);
      const out = new Cell(shape.rows, shape.cols);
      for (let k = 0; k < n; k++) out.data[k] = T.str(a.map((x) => (x instanceof Cell ? H.str(x.data[x.numel === 1 ? 0 : k]) : H.str(x))).join(''));
      return out;
    }
    // 字符数组：去除尾部空白后拼接
    return T.str(a.map((x) => (T.isStr(x) ? x.toStr().replace(/[ \t\n\0]+$/, '') : (x instanceof Tensor && x.numel === 0 ? '' : String.fromCharCode(...x.re)))).join(''));
  }, D('s = strcat(s1,s2,...)', '水平串联字符串'));
  def('strvcat', (a) => T.charMatrix(a.filter((x) => x.numel > 0).flatMap((x) => (x instanceof Cell ? x.data.map((y) => H.str(y)) : [H.str(x)]))));
  def('char', (a) => {
    if (a.length === 1) {
      const v = a[0];
      if (v instanceof Cell) return T.charMatrix(v.data.map((x) => H.str(x)));
      if (v instanceof Tensor) { const t = v.clone(); t.type = 'char'; t.im = null; for (let k = 0; k < t.numel; k++) t.re[k] = Math.max(0, Math.round(t.re[k])); return t; }
      err('char: 无法转换为字符。');
    }
    const lines = [];
    for (const v of a) {
      if (v instanceof Cell) for (const x of v.data) lines.push(H.str(x));
      else if (T.isStr(v)) { if (v.rows <= 1) lines.push(v.toStr()); else for (let r = 0; r < v.rows; r++) lines.push(v.rowString(r)); }
      else lines.push(String.fromCharCode(...H.tensor(v).re));
    }
    return T.charMatrix(lines);
  }, D('c = char(x), char(s1,s2,...)', '转换为字符数组'));
  def('cellstr', (a) => {
    const v = a[0];
    if (v instanceof Cell) return v;
    const s = H.tensor(v);
    if (s.rows <= 1) return new Cell(1, 1, [T.str(s.toStr().replace(/\s+$/, ''))]);
    return new Cell(s.rows, 1, Array.from({ length: s.rows }, (x, r) => T.str(s.rowString(r).replace(/\s+$/, ''))));
  }, D('c = cellstr(S)', '字符数组转换为字符向量元胞数组'));

  function strCompare(a, f) {
    const x = a[0], y = a[1];
    const n = a.length > 2 ? H.int(a[2]) : undefined;
    const toS = (v) => (T.isStr(v) && v.rows <= 1 ? v.toStr() : null);
    const cmp = (p, q) => (p === null || q === null ? false : f(p, q, n));
    if (x instanceof Cell || y instanceof Cell) {
      const cx = x instanceof Cell ? x : null, cy = y instanceof Cell ? y : null;
      const ref = cx || cy;
      if (cx && cy && cx.numel !== cy.numel && cx.numel !== 1 && cy.numel !== 1) err('strcmp: 元胞数组大小必须相同。');
      const big = cx && cy ? (cx.numel >= cy.numel ? cx : cy) : ref;
      const t = new Tensor(big.rows, big.cols, null, null, 'logical');
      for (let k = 0; k < big.numel; k++) {
        const p = cx ? toS(cx.data[cx.numel === 1 ? 0 : k]) : toS(x);
        const q = cy ? toS(cy.data[cy.numel === 1 ? 0 : k]) : toS(y);
        t.re[k] = cmp(p, q) ? 1 : 0;
      }
      return t;
    }
    if (T.isStr(x) && T.isStr(y) && (x.rows > 1 || y.rows > 1)) return T.bool(x.rows === y.rows && x.cols === y.cols && x.toStr() === y.toStr());
    const sx = T.isStr(x) || (x instanceof Tensor && x.numel === 0 && x.type === 'char') ? x.toStr() : null;
    const sy = T.isStr(y) || (y instanceof Tensor && y.numel === 0 && y.type === 'char') ? y.toStr() : null;
    return T.bool(cmp(sx, sy));
  }
  def('strcmp', (a) => strCompare(a, (p, q) => p === q), D('tf = strcmp(s1,s2)', '比较字符串（区分大小写）'));
  def('strcmpi', (a) => strCompare(a, (p, q) => p.toLowerCase() === q.toLowerCase()), D('tf = strcmpi(s1,s2)', '比较字符串（不区分大小写）'));
  def('strncmp', (a) => strCompare(a, (p, q, n) => p.length >= n && q.length >= n && p.slice(0, n) === q.slice(0, n)), D('tf = strncmp(s1,s2,n)', '比较前 n 个字符'));
  def('strncmpi', (a) => strCompare(a, (p, q, n) => p.length >= n && q.length >= n && p.slice(0, n).toLowerCase() === q.slice(0, n).toLowerCase()), D('tf = strncmpi(s1,s2,n)', '比较前 n 个字符（不区分大小写）'));
  def('strfind', (a) => {
    const find = (s, p) => { const out = []; if (!p.length) return T.empty(1, 0); let i = s.indexOf(p); while (i >= 0) { out.push(i + 1); i = s.indexOf(p, i + 1); } return out.length ? T.row(out) : T.empty(1, 0); };
    const pat = H.str(a[1]);
    if (a[0] instanceof Cell) return new Cell(a[0].rows, a[0].cols, a[0].data.map((x) => find(H.str(x), pat)));
    return find(H.str(a[0]), pat);
  }, D('k = strfind(str,pattern)', '查找子字符串的起始索引'));
  def('strrep replace', (a) => {
    const old = H.str(a[1]), nw = H.str(a[2]);
    return mapStr(a[0], (s) => (old.length ? s.split(old).join(nw) : s));
  }, D('s = strrep(str,old,new)', '替换子字符串'));
  def('strsplit split', (a) => {
    const s = H.str(a[0]);
    let delims = [' ', '\f', '\n', '\r', '\t', '\v'];
    let collapse = true;
    let rest = 1;
    if (a.length > 1 && !(T.isStr(a[1]) && /^collapsedelimiters$/i.test(a[1].toStr()))) { delims = H.cellOfStrings(a[1]).map(unescape); collapse = false; rest = 2; }
    const nv = H.nameValue(a, rest);
    if (nv.collapsedelimiters) collapse = T.isTrue(nv.collapsedelimiters);
    if (a.length === 1) collapse = true;
    const esc = (d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?:' + delims.map(esc).join('|') + ')' + (collapse ? '+' : ''), 'g');
    let parts = s.split(re);
    if (a.length === 1) { /* 保留首尾空字符串（MATLAB 行为）*/ }
    return new Cell(1, parts.length, parts.map((p) => T.str(p)));
  }, D("c = strsplit(s,delim)", '按分隔符拆分字符串'));
  def('strjoin join', (a) => {
    const parts = H.cellOfStrings(a[0]);
    const d = a.length > 1 ? unescape(H.str(a[1])) : ' ';
    return T.str(parts.join(d));
  }, D("s = strjoin(c,delim)", '用分隔符连接字符串元胞数组'));
  def('strtok', (a) => {
    const s = H.str(a[0]); const dl = a.length > 1 ? H.str(a[1]) : ' \t\n\r\f\v\0';
    let i = 0; while (i < s.length && dl.indexOf(s[i]) >= 0) i++;
    let j = i; while (j < s.length && dl.indexOf(s[j]) < 0) j++;
    return [T.str(s.slice(i, j)), T.str(s.slice(j))];
  }, D('[tok,rem] = strtok(s,delim)', '提取第一个标记'));
  function strPred(a, f) {
    const pats = H.cellOfStrings(a[1]);
    const nv = H.nameValue(a, 2); const ic = nv.ignorecase ? T.isTrue(nv.ignorecase) : false;
    const test = (s) => pats.some((p) => (ic ? f(s.toLowerCase(), p.toLowerCase()) : f(s, p)));
    if (a[0] instanceof Cell) { const t = new Tensor(a[0].rows, a[0].cols, null, null, 'logical'); a[0].data.forEach((x, k) => { t.re[k] = test(H.str(x)) ? 1 : 0; }); return t; }
    return T.bool(test(H.str(a[0])));
  }
  def('contains', (a) => strPred(a, (s, p) => s.indexOf(p) >= 0), D('tf = contains(str,pattern)', '是否包含模式'));
  def('startsWith', (a) => strPred(a, (s, p) => s.startsWith(p)), D('tf = startsWith(str,pattern)', '是否以模式开头'));
  def('endsWith', (a) => strPred(a, (s, p) => s.endsWith(p)), D('tf = endsWith(str,pattern)', '是否以模式结尾'));
  def('strlength', (a) => { const v = a[0]; if (v instanceof Cell) { const t = new Tensor(v.rows, v.cols); v.data.forEach((x, k) => { t.re[k] = x.numel; }); return t; } return T.scalar(v.numel); }, D('n = strlength(s)', '字符串长度'));
  def('count', (a) => { const s = H.str(a[0]), p = H.str(a[1]); if (!p) return T.scalar(0); return T.scalar(s.split(p).length - 1); }, D('n = count(str,pattern)', '模式出现次数'));
  def('pad', (a) => { const s = H.str(a[0]); const n = a.length > 1 ? H.int(a[1]) : s.length; return T.str(s.padEnd(n)); });
  def('extractBetween', (a) => { const s = H.str(a[0]), p = H.str(a[1]), q = H.str(a[2]); const i = s.indexOf(p); if (i < 0) return new Cell(0, 1); const j = s.indexOf(q, i + p.length); if (j < 0) return new Cell(0, 1); return new Cell(1, 1, [T.str(s.slice(i + p.length, j))]); });
  def('extractAfter', (a) => { const s = H.str(a[0]), p = H.str(a[1]); const i = s.indexOf(p); return T.str(i < 0 ? '' : s.slice(i + p.length)); });
  def('extractBefore', (a) => { const s = H.str(a[0]), p = H.str(a[1]); const i = s.indexOf(p); return T.str(i < 0 ? '' : s.slice(0, i)); });

  // 字符类别
  function charPred(v, f) { const s = H.tensor(v); const t = new Tensor(s.rows, s.cols, null, null, 'logical'); for (let k = 0; k < s.numel; k++) t.re[k] = s.type === 'char' && f(String.fromCharCode(s.re[k])) ? 1 : 0; return t; }
  def('isspace', (a) => charPred(a[0], (c) => /\s/.test(c)), D('tf = isspace(s)', '是否为空白字符'));
  def('isletter', (a) => charPred(a[0], (c) => /\p{L}/u.test(c)), D('tf = isletter(s)', '是否为字母'));
  def('isdigit', (a) => charPred(a[0], (c) => /[0-9]/.test(c)));
  def('isstrprop', (a) => {
    const kind = H.str(a[1]);
    const tests = { alpha: /\p{L}/u, digit: /[0-9]/, alphanum: /[\p{L}0-9]/u, wspace: /\s/, upper: /\p{Lu}/u, lower: /\p{Ll}/u, punct: /[!-\/:-@\[-`{-~]/, cntrl: /[\x00-\x1f\x7f]/, xdigit: /[0-9a-fA-F]/ };
    const re = tests[kind]; if (!re) err('isstrprop: 无效的类别 \'' + kind + '\'。');
    return charPred(a[0], (c) => re.test(c));
  }, D("tf = isstrprop(s,'digit')", '判断字符类别'));

  // ---------- 正则表达式 ----------
  function toJsRegex(expr, flags) {
    // MATLAB 与 JS 正则大体兼容：处理 (?<name>...) 已兼容；\< \> 单词边界
    let src = expr.replace(/\\</g, '\\b').replace(/\\>/g, '\\b');
    try { return new RegExp(src, flags); } catch (e) { err('无效的正则表达式：' + e.message); }
  }
  function regexpCore(a, ignoreCase) {
    const str = a[0], expr = H.str(a[1]);
    const opts = a.slice(2).filter(T.isStr).map((x) => x.toStr().toLowerCase());
    let ic = ignoreCase || opts.indexOf('ignorecase') >= 0;
    if (opts.indexOf('matchcase') >= 0) ic = false;
    const once = opts.indexOf('once') >= 0;
    const order = opts.filter((o) => ['match', 'tokens', 'names', 'start', 'end', 'split', 'tokenextents'].indexOf(o) >= 0);
    const outs = order.length ? order : ['start', 'end', 'tokenextents', 'match', 'tokens', 'names', 'split'];
    const one = (s) => {
      const re = toJsRegex(expr, 'g' + (ic ? 'i' : '') + 'u');
      const res = { start: [], end: [], match: [], tokens: [], names: [], split: [], tokenextents: [] };
      let m, last = 0;
      while ((m = re.exec(s)) !== null) {
        res.start.push(m.index + 1); res.end.push(m.index + m[0].length);
        res.match.push(m[0]);
        const toks = m.length > 1 ? m.slice(1).map((x) => x === undefined ? '' : x) : [m[0]];
        res.tokens.push(toks);
        res.names.push(m.groups || null);
        res.split.push(s.slice(last, m.index)); last = m.index + m[0].length;
        if (m[0].length === 0) re.lastIndex++;
        if (once) break;
      }
      res.split.push(s.slice(last));
      const conv = (k) => {
        switch (k) {
          case 'match': return once ? (res.match.length ? T.str(res.match[0]) : T.str('')) : new Cell(1, res.match.length, res.match.map((x) => T.str(x)));
          case 'tokens': {
            const cellOf = (toks) => new Cell(1, toks.length, toks.map((x) => T.str(x)));
            return once ? (res.tokens.length ? cellOf(res.tokens[0]) : new Cell(1, 0)) : new Cell(1, res.tokens.length, res.tokens.map(cellOf));
          }
          case 'names': {
            const st = new Struct(1, 1);
            const g = res.names[0];
            if (g) for (const key of Object.keys(g)) st.setField(key, T.str(g[key] || ''), 0);
            return st;
          }
          case 'start': return once ? (res.start.length ? T.scalar(res.start[0]) : T.empty(1, 0)) : (res.start.length ? T.row(res.start) : T.empty(1, 0));
          case 'end': return once ? (res.end.length ? T.scalar(res.end[0]) : T.empty(1, 0)) : (res.end.length ? T.row(res.end) : T.empty(1, 0));
          case 'split': return new Cell(1, res.split.length, res.split.map((x) => T.str(x)));
          case 'tokenextents': return new Cell(1, res.start.length, res.start.map((s0, i) => T.row([s0, res.end[i]])));
          default: return new Tensor(0, 0);
        }
      };
      return outs.map(conv);
    };
    if (str instanceof Cell) {
      const per = str.data.map((x) => one(H.str(x)));
      return outs.map((k, i) => new Cell(str.rows, str.cols, per.map((p) => p[i])));
    }
    return one(H.str(str));
  }
  def('regexp', (a) => regexpCore(a, false), D("[tok,mat] = regexp(str,expr,'tokens','match')", '正则表达式匹配'));
  def('regexpi', (a) => regexpCore(a, true), D('regexpi(str,expr)', '正则表达式匹配（不区分大小写）'));
  def('regexprep', (a) => {
    const expr = H.str(a[1]); let rep = H.str(a[2]);
    const opts = a.slice(3).filter(T.isStr).map((x) => x.toStr().toLowerCase());
    const ic = opts.indexOf('ignorecase') >= 0, once = opts.indexOf('once') >= 0;
    rep = unescape(rep.replace(/\$0/g, '$$&'));
    return mapStr(a[0], (s) => s.replace(toJsRegex(expr, (once ? '' : 'g') + (ic ? 'i' : '') + 'u'), rep));
  }, D('s = regexprep(str,expr,rep)', '使用正则表达式替换（$1 引用标记）'));
  def('sscanf', (a) => {
    const s = H.str(a[0]); const fmt = H.str(a[1]);
    const parts = parseFormat(unescape(fmt)).filter((p) => !p.lit);
    const out = [];
    let pos = 0; let guard = 0;
    const numRe = /^\s*([+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|inf|nan))/i;
    const intRe = /^\s*([+-]?\d+)/;
    outer: while (pos < s.length && guard++ < 1e5) {
      for (const p of parts) {
        const rest = s.slice(pos);
        if (p.conv === 's') { const m = /^\s*(\S+)/.exec(rest); if (!m) break outer; for (const ch of m[1]) out.push(ch.charCodeAt(0)); pos += m[0].length; continue; }
        if (p.conv === 'c') { if (!rest.length) break outer; out.push(rest.charCodeAt(0)); pos++; continue; }
        const m = (p.conv === 'd' || p.conv === 'i' || p.conv === 'u' ? intRe : numRe).exec(rest);
        if (!m) break outer;
        out.push(parseFloat(m[1].replace(/^([+-]?)inf/i, '$1Infinity'))); pos += m[0].length;
        const lit = /^[\s,;]*/.exec(s.slice(pos)); pos += lit[0].length;
      }
      if (!parts.length) break;
    }
    return T.col(out);
  }, D("A = sscanf(str,fmt)", '按格式读取字符串中的数据'));
  def('textscan', (a) => {
    const s = H.str(a[0]); const fmt = H.str(a[1]);
    const parts = parseFormat(unescape(fmt)).filter((p) => !p.lit);
    const cols = parts.map(() => []);
    const tokens = s.split(/[\s,;]+/).filter((x) => x.length);
    for (let i = 0; i < tokens.length; i++) { const p = parts[i % parts.length]; cols[i % parts.length].push(p.conv === 's' ? tokens[i] : parseFloat(tokens[i])); }
    return new Cell(1, parts.length, cols.map((c, i) => (parts[i].conv === 's' ? new Cell(c.length, 1, c.map((x) => T.str(x))) : T.col(c))));
  });

  // ---------- 进制转换 ----------
  def('dec2bin', (a) => {
    const v = H.tensor(a[0]); const n = a.length > 1 ? H.int(a[1]) : 0;
    const strs = Array.from(v.re, (x) => { if (x < 0 || !Number.isInteger(x)) err('dec2bin: 输入必须为非负整数。'); return x.toString(2); });
    const w = Math.max(n, ...strs.map((s) => s.length));
    return T.charMatrix(strs.map((s) => s.padStart(w, '0')));
  }, D('s = dec2bin(d,n)', '十进制转二进制字符串', '进制转换'));
  def('bin2dec', (a) => { const v = a[0]; if (v instanceof Cell) return T.col(v.data.map((x) => parseInt(H.str(x).replace(/\s/g, ''), 2))); const s = H.tensor(v); const out = []; for (let r = 0; r < Math.max(1, s.rows); r++) out.push(parseInt((s.rows > 1 ? s.rowString(r) : s.toStr()).replace(/\s/g, ''), 2)); return T.col(out); }, D('d = bin2dec(s)', '二进制字符串转十进制', '进制转换'));
  def('dec2hex', (a) => { const v = H.tensor(a[0]); const n = a.length > 1 ? H.int(a[1]) : 0; const strs = Array.from(v.re, (x) => x.toString(16).toUpperCase()); const w = Math.max(n, ...strs.map((s) => s.length)); return T.charMatrix(strs.map((s) => s.padStart(w, '0'))); }, D('s = dec2hex(d)', '十进制转十六进制字符串', '进制转换'));
  def('hex2dec', (a) => { const v = a[0]; const list = v instanceof Cell ? v.data.map((x) => H.str(x)) : (v.rows > 1 ? Array.from({ length: v.rows }, (x, r) => v.rowString(r)) : [H.str(v)]); return T.col(list.map((s) => parseInt(s.trim(), 16))); }, D('d = hex2dec(s)', '十六进制字符串转十进制', '进制转换'));
  def('dec2base', (a) => { const v = H.tensor(a[0]); const b = H.int(a[1]); const strs = Array.from(v.re, (x) => x.toString(b).toUpperCase()); const w = Math.max(a.length > 2 ? H.int(a[2]) : 0, ...strs.map((s) => s.length)); return T.charMatrix(strs.map((s) => s.padStart(w, '0'))); }, D('s = dec2base(d,base)', '十进制转任意进制', '进制转换'));
  def('base2dec', (a) => T.scalar(parseInt(H.str(a[0]).trim(), H.int(a[1]))), D('d = base2dec(s,base)', '任意进制转十进制', '进制转换'));
  def('native2unicode unicode2native', (a) => a[0]);
})(typeof self !== 'undefined' ? self : globalThis);
