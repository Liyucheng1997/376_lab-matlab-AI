/* MatWeb - 系统与环境函数：显示、工作区、计时、错误处理、文件读写、帮助 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle, MError } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const D = (syn, desc, cat) => ({ cat: cat || '系统', syn, desc });

  // ---------- 显示 ----------
  def('disp', (a, n, it) => { H.nargchk(a, 1, 1, 'disp'); it.print(ML.fmt.dispStr(a[0])); return null; }, D('disp(X)', '显示变量的值（不显示变量名）', '显示'));
  def('display', (a, n, it) => { it.print(ML.fmt.display('ans', a[0])); return null; }, D('display(X)', '显示变量', '显示'));
  def('clc', (a, n, it) => { if (it.io.clc) it.io.clc(); return null; }, D('clc', '清空命令行窗口', '显示'));
  def('format', (a) => {
    const s = ML.fmt.settings;
    if (!a.length) { s.mode = 'short'; s.compact = false; return null; }
    for (const x of a) {
      const o = H.str(x).toLowerCase();
      if (o === 'compact') s.compact = true;
      else if (o === 'loose') s.compact = false;
      else if (['short', 'long', 'shortg', 'longg', 'shorte', 'longe', 'rat', 'rational'].indexOf(o) >= 0) s.mode = o === 'rational' ? 'rat' : o;
      else if (o === 'g') s.mode = s.mode === 'long' ? 'longg' : 'shortg';
      else if (o === 'e') s.mode = s.mode === 'long' ? 'longe' : 'shorte';
      else if (o === 'hex' || o === 'bank' || o === '+') { if (o === 'bank') s.mode = 'short'; }
      else err('format: 无法识别的格式 \'' + o + '\'。');
    }
    return null;
  }, D('format long | short | compact | rat | shortg', '设置命令行窗口输出显示格式', '显示'));
  def('more diary beep profile dbstop dbclear echo', () => null);
  def('drawnow_dummy', () => null);

  // ---------- 工作区 ----------
  function matchNames(names, patterns) {
    const res = patterns.map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'));
    return names.filter((n) => res.some((r) => r.test(n)));
  }
  def('clear clearvars', (a, n, it) => {
    const env = it.curEnv;
    const args = a.map((x) => H.str(x));
    const all = () => { env.vars.clear(); if (env.globalNames) env.globalNames.clear(); if (env === it.base) it.dirtyWorkspace = true; };
    if (!args.length) { all(); return null; }
    let except = [];
    const ei = args.indexOf('-except');
    if (ei >= 0) { except = args.slice(ei + 1); args.splice(ei); }
    if (ei >= 0 && !args.length) {
      for (const k of [...env.vars.keys()]) if (!matchNames([k], except).length) env.vars.delete(k);
      it.dirtyWorkspace = true; return null;
    }
    for (const o of args) {
      if (o === 'all' || o === '-all') { all(); it.fileCache.clear(); it.globalSlots.clear(); it.persistStore.clear(); it.cmdFunctions.clear(); }
      else if (o === 'variables' || o === '-variables' || o === 'vars') all();
      else if (o === 'functions' || o === '-functions') { it.fileCache.clear(); it.persistStore.clear(); }
      else if (o === 'global' || o === '-global') { it.globalSlots.clear(); if (env.globalNames) env.globalNames.clear(); }
      else if (o === 'classes' || o === 'import' || o === 'mex' || o === 'java') { /* 无操作 */ }
      else {
        for (const k of matchNames([...env.vars.keys()], [o])) env.vars.delete(k);
        if (env.globalNames) for (const k of matchNames([...env.globalNames], [o])) env.globalNames.delete(k);
        if (it.cmdFunctions.has(o)) it.cmdFunctions.delete(o);
      }
    }
    if (env === it.base) it.dirtyWorkspace = true;
    return null;
  }, D('clear, clear x y, clear all', '从工作区中删除变量', '工作区'));
  function varNames(it) {
    const env = it.curEnv;
    const names = new Set([...env.vars.keys()]);
    if (env.globalNames) for (const g of env.globalNames) names.add(g);
    return [...names].filter((n) => it.getVar(env, n) !== undefined).sort();
  }
  def('who', (a, nargout, it) => {
    const names = varNames(it);
    if (nargout > 0) return new Cell(names.length, 1, names.map((x) => T.str(x)));
    if (names.length) it.print('\n您的变量为:\n\n' + names.join('  ') + '\n\n');
    return null;
  }, D('who', '列出工作区中的变量', '工作区'));
  def('whos', (a, nargout, it) => {
    const env = it.curEnv;
    let names = varNames(it);
    if (a.length) names = matchNames(names, a.map((x) => H.str(x)));
    const rows = names.map((name) => {
      const v = it.getVar(env, name);
      const info = it.workspaceInfo().find((x) => x.name === name);
      return [name, v.rows + 'x' + v.cols, String(info ? info.bytes : 0), T.classOf(v) + (v instanceof Tensor && v.im ? '     complex' : '')];
    });
    if (!rows.length) return null;
    const w = [Math.max(6, ...rows.map((r) => r[0].length)) + 2, Math.max(4, ...rows.map((r) => r[1].length)) + 4, Math.max(5, ...rows.map((r) => r[2].length)) + 4];
    let out = '  ' + 'Name'.padEnd(w[0]) + 'Size'.padStart(w[1] - 4).padEnd(w[1]) + 'Bytes'.padStart(w[2]) + '  Class\n\n';
    for (const r of rows) out += '  ' + r[0].padEnd(w[0]) + r[1].padStart(w[1] - 4).padEnd(w[1]) + r[2].padStart(w[2]) + '  ' + r[3] + '\n';
    it.print('\n' + out + '\n');
    return null;
  }, D('whos', '列出工作区中的变量及其大小和类型', '工作区'));
  def('exist', (a, nargout, it) => {
    const name = H.str(a[0]); const kind = a.length > 1 ? H.str(a[1]) : '';
    const isVar = it.getVar(it.curEnv, name) !== undefined;
    const isFile = it.files.has(name.replace(/\.m$/, '')) || it.dataFiles.has(name);
    const isB = !!ML.builtins[name];
    if (kind === 'var') return T.scalar(isVar ? 1 : 0);
    if (kind === 'file') return T.scalar(isFile ? 2 : 0);
    if (kind === 'builtin') return T.scalar(isB ? 5 : 0);
    if (kind === 'dir') return T.scalar(0);
    return T.scalar(isVar ? 1 : (isFile ? 2 : (isB ? 5 : 0)));
  }, D("exist('name')", '检查变量、函数或文件是否存在（1 变量，2 文件，5 内置函数）', '工作区'));
  def('isvarname_exists', () => T.bool(false));
  def('nargin', (a, n, it) => {
    if (a.length) {
      const f = a[0]; const name = f instanceof FuncHandle ? f.name : H.str(f);
      if (f instanceof FuncHandle && f.kind === 'anon') return T.scalar(f.params.length);
      const r = it.resolveFunction(name, it.curEnv);
      if (r && r.kind === 'user') { const p = r.entry.fn.params; return T.scalar(p.length && p[p.length - 1] === 'varargin' ? -p.length : p.length); }
      return T.scalar(-1);
    }
    if (it.curEnv.nargin === undefined) err('nargin 只能在函数中使用。');
    return T.scalar(it.curEnv.nargin);
  }, D('nargin', '函数输入参数个数', '函数'));
  def('nargout', (a, n, it) => {
    if (a.length) {
      const f = a[0]; const name = f instanceof FuncHandle ? f.name : H.str(f);
      const r = it.resolveFunction(name, it.curEnv);
      if (r && r.kind === 'user') return T.scalar(r.entry.fn.outs.length);
      return T.scalar(-1);
    }
    if (it.curEnv.nargout === undefined) err('nargout 只能在函数中使用。');
    return T.scalar(it.curEnv.nargout);
  }, D('nargout', '函数输出参数个数', '函数'));
  def('narginchk', (a, n, it) => {
    const lo = H.num(a[0]), hi = H.num(a[1]); const k = it.curEnv.nargin;
    if (k < lo) err('输入参数太少。', 'MATLAB:narginchk:notEnoughInputs');
    if (k > hi) err('输入参数太多。', 'MATLAB:narginchk:tooManyInputs');
    return null;
  }, D('narginchk(min,max)', '验证输入参数个数', '函数'));
  def('nargoutchk', () => null);
  def('inputname', () => T.str(''));
  def('assignin', (a, n, it) => { const ws = H.str(a[0]); const env = ws === 'base' ? it.base : it.curEnv; it.setVar(env, H.str(a[1]), a[2]); return null; }, D("assignin('base','name',v)", '在指定工作区中赋值', '工作区'));
  def('evalin', (a, nargout, it) => { const ws = H.str(a[0]); const env = ws === 'base' ? it.base : it.curEnv; return it.evalString(H.str(a[1]), env, nargout); }, D("evalin('base',expr)", '在指定工作区中执行表达式', '工作区'));
  def('eval', (a, nargout, it) => {
    const s = H.str(a[0]);
    if (a.length > 1) {
      try { return it.evalString(s, it.curEnv, nargout); }
      catch (e) { if (!(e instanceof MError) || e.identifier === 'MATLAB:interrupt') throw e; it.lastError = e; return it.evalString(H.str(a[1]), it.curEnv, nargout); }
    }
    return it.evalString(s, it.curEnv, nargout);
  }, D("eval('expression')", '执行字符串中的 MATLAB 表达式', '函数'));
  def('evalc', (a, nargout, it) => {
    let buf = '';
    const save = it.io; it.io = Object.assign({}, save, { print: (t) => { buf += t; }, printErr: (t) => { buf += t; } });
    try { it.evalString(H.str(a[0]), it.curEnv, 0); } finally { it.io = save; }
    return T.str(buf);
  }, D("s = evalc('expression')", '执行表达式并捕获输出', '函数'));

  // ---------- 计时 ----------
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  def('tic', (a, nargout, it) => { it.tictoc = now(); return nargout > 0 ? T.scalar(it.tictoc * 1000, 'uint64') : null; }, D('tic', '启动秒表计时器', '计时'));
  def('toc', (a, nargout, it) => {
    const start = a.length ? H.num(a[0]) / 1000 : it.tictoc;
    const t = (now() - start) / 1000;
    if (nargout > 0) return T.scalar(t);
    it.print('历时 ' + t.toFixed(6) + ' 秒。\n');
    return null;
  }, D('toc, t = toc', '读取秒表计时器（秒）', '计时'));
  def('cputime', () => T.scalar(now() / 1000), D('cputime', 'CPU 时间（秒）', '计时'));
  function datenumOf(d) { return d.getTime() / 86400000 + 719529 - d.getTimezoneOffset() / 1440; }
  function dateOfNum(n) { const ms = (n - 719529) * 86400000; const d = new Date(ms); return new Date(ms + d.getTimezoneOffset() * 60000); }
  def('now', () => T.scalar(datenumOf(new Date())), D('now', '当前日期时间（序列日期值）', '计时'));
  def('clock', () => { const d = new Date(); return T.row([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds() + d.getMilliseconds() / 1000]); }, D('c = clock', '当前时间 [年 月 日 时 分 秒]', '计时'));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (x) => String(x).padStart(2, '0');
  function fmtDate(d, fmt) {
    if (!fmt) return p2(d.getDate()) + '-' + MON[d.getMonth()] + '-' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
    return fmt.replace(/yyyy|yy|mmmm|mmm|mm|dddd|ddd|dd|HH|MM|SS|FFF|PM|AM/g, (t) => ({
      yyyy: d.getFullYear(), yy: String(d.getFullYear()).slice(2), mmmm: MON[d.getMonth()], mmm: MON[d.getMonth()], mm: p2(d.getMonth() + 1),
      dddd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], ddd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], dd: p2(d.getDate()),
      HH: p2(d.getHours()), MM: p2(d.getMinutes()), SS: p2(d.getSeconds()), FFF: String(d.getMilliseconds()).padStart(3, '0'), PM: d.getHours() >= 12 ? 'PM' : 'AM', AM: d.getHours() >= 12 ? 'PM' : 'AM'
    }[t]));
  }
  def('datestr', (a) => {
    let d = new Date();
    if (a.length && a[0] instanceof Tensor && a[0].type !== 'char') { const v = H.tensor(a[0]); d = v.numel >= 3 ? new Date(v.re[0], v.re[1] - 1, v.re[2], v.re[3] || 0, v.re[4] || 0, v.re[5] || 0) : dateOfNum(v.re[0]); }
    let fmt = a.length > 1 && T.isStr(a[1]) ? a[1].toStr() : null;
    if (a.length > 1 && !T.isStr(a[1])) { const k = H.num(a[1]); fmt = { 0: 'dd-mmm-yyyy HH:MM:SS', 1: 'dd-mmm-yyyy', 13: 'HH:MM:SS', 29: 'yyyy-mm-dd', 31: 'yyyy-mm-dd HH:MM:SS' }[k] || null; }
    return T.str(fmtDate(d, fmt));
  }, D("s = datestr(t, fmt)", '日期转换为字符串', '计时'));
  def('date', () => { const d = new Date(); return T.str(p2(d.getDate()) + '-' + MON[d.getMonth()] + '-' + d.getFullYear()); }, D('date', '当前日期字符串', '计时'));
  def('datenum', (a) => {
    if (!a.length) return T.scalar(datenumOf(new Date()));
    if (a.length >= 3 || (a[0] instanceof Tensor && a[0].numel >= 3 && a[0].type !== 'char')) {
      const v = a.length >= 3 ? a.map((x) => H.num(x)) : H.toArray(a[0]);
      const d = new Date(Date.UTC(v[0], (v[1] || 1) - 1, v[2] || 1, v[3] || 0, v[4] || 0, v[5] || 0));
      return T.scalar(d.getTime() / 86400000 + 719529);
    }
    const d = new Date(H.str(a[0]));
    return T.scalar(datenumOf(d));
  }, D('n = datenum(y,m,d)', '日期转换为序列日期值', '计时'));
  def('etime', (a) => {
    const x = H.toArray(a[0]), y = H.toArray(a[1]);
    const t = (v) => Date.UTC(v[0], v[1] - 1, v[2], v[3], v[4], 0) / 1000 + v[5];
    return T.scalar(t(x) - t(y));
  }, D('etime(t1,t0)', '两个 clock 时间之差（秒）', '计时'));
  def('pause', (a, n, it) => {
    if (it.graphics) it.graphics.flush();
    if (a.length && T.isStr(a[0])) return null;
    const s = a.length ? H.num(a[0]) : 0;
    if (s > 0 && it.io.sleep) it.io.sleep(Math.min(s, 30));
    return null;
  }, D('pause(n)', '暂停 n 秒（并刷新图形）', '计时'));

  // ---------- 错误与警告 ----------
  def('error', (a, n, it) => {
    if (!a.length) return null;
    if (a[0] instanceof Struct) {
      const s = a[0];
      throw new MError(s.hasField('message') ? H.str(s.getField('message', 0)) : '', s.hasField('identifier') ? H.str(s.getField('identifier', 0)) : '');
    }
    let id = '', fmt = H.str(a[0]), rest = a.slice(1);
    if (rest.length && /^[A-Za-z][\w-]*(:[\w-]+)+$/.test(fmt) && T.isStr(rest[0])) { id = fmt; fmt = rest[0].toStr(); rest = rest.slice(1); }
    const msg = (a.length > 1) ? ML.sprintf(fmt, rest) : fmt;
    throw new MError(msg, id);
  }, D("error('msg'), error('id:x','fmt',args)", '抛出错误', '错误处理'));
  def('warning', (a, nargout, it) => {
    if (!a.length) return null;
    const first = H.str(a[0]);
    if (first === 'off' || first === 'on') { if (a.length === 1 || H.str(a[1]) === 'all') it.warningsOff = first === 'off'; return null; }
    if (first === 'query') return null;
    let fmt = first, rest = a.slice(1);
    if (rest.length && /^[A-Za-z][\w-]*(:[\w-]+)+$/.test(fmt) && T.isStr(rest[0])) { fmt = rest[0].toStr(); rest = rest.slice(1); }
    it.warning(a.length > 1 ? ML.sprintf(fmt, rest) : fmt);
    return null;
  }, D("warning('msg'), warning('off')", '显示警告信息', '错误处理'));
  def('lasterr', (a, n, it) => T.str(it.lastError ? it.lastError.message : ''), D('lasterr', '最后一条错误消息', '错误处理'));
  def('lastwarn', (a, n, it) => T.str(it.lastWarning || ''), D('lastwarn', '最后一条警告消息', '错误处理'));
  def('assert', (a) => {
    if (!T.isTrue(a[0])) {
      if (a.length > 1) {
        let fmt = H.str(a[1]), rest = a.slice(2), id = '';
        if (rest.length && /^[A-Za-z][\w-]*(:[\w-]+)+$/.test(fmt) && T.isStr(rest[0])) { id = fmt; fmt = rest[0].toStr(); rest = rest.slice(1); }
        throw new MError(ML.sprintf(fmt, rest), id);
      }
      throw new MError('断言失败。', 'MATLAB:assertion:failed');
    }
    return null;
  }, D('assert(cond, msg)', '条件为假时报错', '错误处理'));
  def('MException', (a) => {
    const id = H.str(a[0]); const msg = a.length > 1 ? ML.sprintf(H.str(a[1]), a.slice(2)) : '';
    const s = new Struct(1, 1); s.setField('identifier', T.str(id), 0); s.setField('message', T.str(msg), 0); s.setField('stack', new Struct(0, 1), 0);
    s.isException = true;
    return s;
  }, D("ME = MException('id:x','msg')", '创建异常对象', '错误处理'));
  def('throw rethrow throwAsCaller', (a) => {
    const s = a[0];
    if (!(s instanceof Struct)) err('需要 MException 对象。');
    throw new MError(H.str(s.getField('message', 0)), s.hasField('identifier') ? H.str(s.getField('identifier', 0)) : '');
  }, D('rethrow(ME)', '重新抛出异常', '错误处理'));
  def('getReport', (a) => { const s = a[0]; return T.str('错误: ' + H.str(s.getField('message', 0))); }, D('getReport(ME)', '异常报告文本', '错误处理'));

  // ---------- 交互输入 ----------
  def('input', (a, nargout, it) => {
    const prompt = a.length ? H.str(a[0]) : '';
    const asStr = a.length > 1 && H.str(a[1]) === 's';
    if (!it.io.input) err('当前运行环境不支持 input（请通过 node server.js 启动以启用交互输入）。');
    if (it.graphics) it.graphics.flush();
    const r = it.io.input(prompt);
    if (r === null || r === undefined) err('输入已取消。', 'MATLAB:interrupt');
    it.print((it.io.inputShowsPrompt ? '' : prompt) + r + '\n');
    if (asStr) return T.str(r);
    if (!r.trim()) return new Tensor(0, 0);
    const vals = it.evalString(r, it.curEnv, 1);
    return vals[0];
  }, D("x = input(prompt), s = input(prompt,'s')", '请求用户输入', '系统'));
  def('keyboard', () => null);

  // ---------- 环境信息 ----------
  def('version', () => T.str('1.0.0 (MatWeb 网页数值计算环境)'), D('version', '版本信息'));
  def('ver', (a, n, it) => { it.print('-----------------------------------------------------\nMatWeb 版本 1.0.0  —  浏览器中的类 MATLAB 数值计算环境\n内核：JavaScript 解释器，无需安装\n-----------------------------------------------------\n'); return null; }, D('ver', '版本信息'));
  def('computer', () => T.str('BROWSER'), D('computer', '计算机类型'));
  def('ispc', () => T.bool(false)); def('isunix', () => T.bool(true)); def('ismac', () => T.bool(false));
  def('isdeployed', () => T.bool(false)); def('usejava', () => T.bool(false));
  def('pwd', () => T.str('/MatWeb'), D('pwd', '当前文件夹'));
  def('cd', () => T.str('/MatWeb'));
  def('getenv', () => T.str(''));
  def('setenv', () => null);
  def('exit quit', (a, n, it) => { it.print('（浏览器环境中无法退出，可直接关闭页面。）\n'); return null; });
  def('maxNumCompThreads', () => T.scalar(1));
  def('memory', (a, n, it) => { it.print('浏览器环境中不提供内存信息。\n'); return null; });

  // ---------- 虚拟文件系统 ----------
  function allFiles(it) { return [...it.files.keys()].map((k) => k + '.m').concat([...it.dataFiles.keys()]).sort(); }
  def('ls dir what', (a, nargout, it) => {
    const files = allFiles(it);
    if (nargout > 0) { const s = new Struct(files.length, 1); files.forEach((f, i) => { s.setField('name', T.str(f), i); s.setField('isdir', T.bool(false), i); s.setField('bytes', T.scalar((it.files.get(f.replace(/\.m$/, '')) || it.dataFiles.get(f) || '').length), i); }); return s; }
    it.print(files.length ? '\n' + files.join('    ') + '\n\n' : '（当前文件夹为空）\n');
    return null;
  }, D('ls, dir', '列出当前文件夹中的文件', '文件'));
  function readFileText(it, name) {
    const base = name.replace(/\.m$/, '');
    if (/\.m$/.test(name) || (!it.dataFiles.has(name) && it.files.has(base))) { if (it.files.has(base)) return it.files.get(base); }
    if (it.dataFiles.has(name)) return it.dataFiles.get(name);
    err('无法打开文件 \'' + name + '\'：文件不存在。');
  }
  function writeFileText(it, name, text) {
    if (/\.m$/.test(name)) { it.files.set(name.replace(/\.m$/, ''), text); it.fileCache.delete(name.replace(/\.m$/, '')); }
    else it.dataFiles.set(name, text);
    if (it.io.saveFile) it.io.saveFile(name, text);
  }
  ML.fs = { readFileText, writeFileText };
  def('type', (a, n, it) => { const name = H.str(a[0]); it.print('\n' + readFileText(it, name) + '\n\n'); return null; }, D('type filename', '显示文件内容', '文件'));
  def('edit', (a, n, it) => { if (it.io.openFile) it.io.openFile(a.length ? H.str(a[0]).replace(/\.m$/, '') + '.m' : null); return null; }, D('edit filename', '在编辑器中打开文件', '文件'));
  def('run', (a, n, it) => {
    const name = H.str(a[0]).replace(/\.m$/, '');
    if (!it.files.has(name)) err('无法找到脚本 \'' + name + '\'。');
    const f = it.loadFile(name);
    if (!f.isScript) return it.callUser(f.main, [], 0);
    it.runScript(f, it.curEnv);
    return null;
  }, D('run scriptname', '运行脚本', '文件'));
  def('delete', (a, n, it) => {
    const name = H.str(a[0]);
    if (/\.m$/.test(name)) it.files.delete(name.replace(/\.m$/, '')); else it.dataFiles.delete(name);
    if (it.io.deleteFile) it.io.deleteFile(name);
    return null;
  }, D('delete filename', '删除文件', '文件'));
  def('isfile', (a, n, it) => { const nm = H.str(a[0]); return T.bool(it.dataFiles.has(nm) || it.files.has(nm.replace(/\.m$/, ''))); }, D('isfile(name)', '文件是否存在', '文件'));
  def('isfolder exist_dir', () => T.bool(false));
  def('which', (a, nargout, it) => {
    const name = H.str(a[0]);
    let s;
    if (it.getVar(it.curEnv, name) !== undefined) s = "'" + name + "' 是变量。";
    else if (it.files.has(name)) s = '/MatWeb/' + name + '.m';
    else if (ML.builtins[name]) s = '内置函数 (' + name + ')';
    else s = "未找到 '" + name + "'。";
    if (nargout > 0) return T.str(s);
    it.print(s + '\n');
    return null;
  }, D('which name', '查找函数或文件位置', '文件'));
  def('fileread', (a, n, it) => T.str(readFileText(it, H.str(a[0]))), D("text = fileread('file')", '读取文件文本', '文件'));

  // 序列化（save / load）
  function ser(v) {
    if (v instanceof Tensor) return { t: 'T', r: v.rows, c: v.cols, y: v.type, re: Array.from(v.re, (x) => (Number.isFinite(x) ? x : String(x))), im: v.im ? Array.from(v.im) : null };
    if (v instanceof Cell) return { t: 'C', r: v.rows, c: v.cols, d: v.data.map(ser) };
    if (v instanceof Struct) return { t: 'S', r: v.rows, c: v.cols, f: v.fields, e: v.elems.map((m) => { const o = {}; for (const [k, x] of m) o[k] = ser(x); return o; }) };
    if (v instanceof FuncHandle) return { t: 'F', s: v.text };
    if (v instanceof ML.MapObj) return { t: 'M', k: v.keyType, e: [...v.map.entries()].map(([k, x]) => [k, ser(x)]) };
    return null;
  }
  function deser(o, it) {
    if (!o) return new Tensor(0, 0);
    if (o.t === 'T') { const t = new Tensor(o.r, o.c, Float64Array.from(o.re.map(Number)), o.im ? Float64Array.from(o.im) : null, o.y); return t; }
    if (o.t === 'C') return new Cell(o.r, o.c, o.d.map((x) => deser(x, it)));
    if (o.t === 'S') return new Struct(o.r, o.c, o.f.slice(), o.e.map((e) => { const m = new Map(); for (const k of Object.keys(e)) m.set(k, deser(e[k], it)); return m; }));
    if (o.t === 'F') return ML.builtins.str2func([T.str(o.s)], 1, it);
    if (o.t === 'M') { const m = new ML.MapObj(o.k); for (const [k, x] of o.e) m.map.set(k, deser(x, it)); return m; }
    return new Tensor(0, 0);
  }
  ML.serialize = ser; ML.deserialize = deser;
  function matName(s) { return /\.[A-Za-z0-9]+$/.test(s) ? s : s + '.mat'; }
  def('save', (a, n, it) => {
    const args = a.map((x) => H.str(x)).filter((s) => !s.startsWith('-'));
    const file = matName(args[0] || 'matlab');
    const names = args.length > 1 ? matchNames(varNames(it), args.slice(1)) : varNames(it);
    if (/\.(csv|txt|dat)$/i.test(file)) {
      const v = it.getVar(it.curEnv, names[0]);
      writeFileText(it, file, matrixToText(H.tensor(v), /\.csv$/i.test(file) ? ',' : ' '));
      return null;
    }
    const obj = {};
    for (const nm of names) obj[nm] = ser(it.getVar(it.curEnv, nm));
    writeFileText(it, file, JSON.stringify({ matweb: 1, vars: obj }));
    return null;
  }, D('save filename [vars]', '将工作区变量保存到文件（浏览器本地存储）', '文件'));
  def('load', (a, nargout, it) => {
    const args = a.map((x) => H.str(x)).filter((s) => !s.startsWith('-'));
    const file = matName(args[0] || 'matlab');
    const text = readFileText(it, file);
    let obj;
    try { obj = JSON.parse(text); } catch (e) { obj = null; }
    if (!obj || !obj.vars) {
      const M = textToMatrix(text);
      if (nargout > 0) return M;
      it.setVar(it.curEnv, file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_'), M);
      return null;
    }
    const names = args.length > 1 ? matchNames(Object.keys(obj.vars), args.slice(1)) : Object.keys(obj.vars);
    if (nargout > 0) { const s = new Struct(1, 1); for (const nm of names) s.setField(nm, deser(obj.vars[nm], it), 0); return s; }
    for (const nm of names) it.setVar(it.curEnv, nm, deser(obj.vars[nm], it));
    return null;
  }, D('load filename', '从文件加载变量', '文件'));
  function matrixToText(M, delim) {
    const lines = [];
    for (let r = 0; r < M.rows; r++) { const row = []; for (let c = 0; c < M.cols; c++) row.push(ML.fmt.gStr(M.re[r + c * M.rows], 15)); lines.push(row.join(delim)); }
    return lines.join('\n') + '\n';
  }
  function textToMatrix(text, delim) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    const rows = lines.map((l) => l.trim().split(delim ? new RegExp('\\s*' + delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*') : /[\s,;]+/).map((x) => { const v = parseFloat(x); return x.trim() === '' ? 0 : (Number.isNaN(v) ? NaN : v); }));
    const nc = Math.max(0, ...rows.map((r) => r.length));
    return T.fromRows(rows.map((r) => { while (r.length < nc) r.push(0); return r; }));
  }
  def('csvwrite', (a, n, it) => { writeFileText(it, H.str(a[0]), matrixToText(H.tensor(a[1]), ',')); return null; }, D("csvwrite('file.csv',M)", '将矩阵写入 CSV 文件', '文件'));
  def('dlmwrite', (a, n, it) => { const d = a.length > 2 && T.isStr(a[2]) && !/^-/.test(a[2].toStr()) && a[2].toStr().length <= 2 ? ML.unescape(a[2].toStr()) : ','; writeFileText(it, H.str(a[0]), matrixToText(H.tensor(a[1]), d)); return null; }, D("dlmwrite('file',M,delim)", '将矩阵写入带分隔符的文件', '文件'));
  def('writematrix', (a, n, it) => { const file = a.length > 1 ? H.str(a[1]) : 'matrix.txt'; writeFileText(it, file, matrixToText(H.tensor(a[0]), /\.csv$/i.test(file) ? ',' : ',')); return null; }, D("writematrix(M,'file.csv')", '将矩阵写入文件', '文件'));
  def('csvread', (a, n, it) => {
    let M = textToMatrix(readFileText(it, H.str(a[0])), ',');
    if (a.length >= 3) { const r0 = H.int(a[1]), c0 = H.int(a[2]); M = ML.idx.indexParen(M, [ML.makeRange(T.scalar(r0 + 1), null, T.scalar(M.rows)), ML.makeRange(T.scalar(c0 + 1), null, T.scalar(M.cols))]); }
    return M;
  }, D("M = csvread('file.csv')", '读取 CSV 文件为矩阵', '文件'));
  def('dlmread readmatrix load_ascii', (a, n, it) => textToMatrix(readFileText(it, H.str(a[0])), a.length > 1 && T.isStr(a[1]) && a[1].toStr().length <= 2 ? ML.unescape(a[1].toStr()) : null), D("M = readmatrix('file')", '读取数值文件为矩阵', '文件'));
  def('fopen', (a, n, it) => {
    const name = H.str(a[0]); const mode = a.length > 1 ? H.str(a[1]) : 'r';
    if (name === 'all') return T.row([...it.fileHandles.keys()]);
    let content = '';
    if (mode[0] === 'r') { try { content = readFileText(it, name); } catch (e) { return [T.scalar(-1), T.str('无法打开文件')]; } }
    else if (mode[0] === 'a') { try { content = readFileText(it, name); } catch (e) { content = ''; } }
    it.nextFid = (it.nextFid || 3);
    const fid = it.nextFid++;
    it.fileHandles.set(fid, { name, mode, buf: mode[0] === 'r' ? '' : content, text: content, pos: 0 });
    return [T.scalar(fid), T.str('')];
  }, D("fid = fopen('file','w')", '打开文件', '文件'));
  def('fclose', (a, n, it) => {
    const close = (fid) => { const h = it.fileHandles.get(fid); if (!h) return; if (h.mode[0] !== 'r') writeFileText(it, h.name, h.buf); it.fileHandles.delete(fid); };
    if (T.isStr(a[0]) && a[0].toStr() === 'all') { for (const fid of [...it.fileHandles.keys()]) close(fid); return T.scalar(0); }
    close(H.num(a[0])); return n > 0 ? T.scalar(0) : null;
  }, D('fclose(fid)', '关闭文件', '文件'));
  function handle(it, v) { const h = it.fileHandles.get(H.num(v)); if (!h) err('无效的文件标识符。'); return h; }
  def('fgetl', (a, n, it) => { const h = handle(it, a[0]); if (h.pos >= h.text.length) return T.scalar(-1); let e = h.text.indexOf('\n', h.pos); if (e < 0) e = h.text.length; const line = h.text.slice(h.pos, e).replace(/\r$/, ''); h.pos = e + 1; return T.str(line); }, D('line = fgetl(fid)', '读取一行（不含换行符）', '文件'));
  def('fgets', (a, n, it) => { const h = handle(it, a[0]); if (h.pos >= h.text.length) return T.scalar(-1); let e = h.text.indexOf('\n', h.pos); e = e < 0 ? h.text.length : e + 1; const line = h.text.slice(h.pos, e); h.pos = e; return T.str(line); }, D('line = fgets(fid)', '读取一行（含换行符）', '文件'));
  def('feof', (a, n, it) => { const h = handle(it, a[0]); return T.bool(h.pos >= h.text.length); }, D('feof(fid)', '是否到达文件末尾', '文件'));
  def('frewind', (a, n, it) => { handle(it, a[0]).pos = 0; return null; });
  def('fscanf', (a, n, it) => { const h = handle(it, a[0]); const rest = h.text.slice(h.pos); h.pos = h.text.length; return ML.builtins.sscanf([T.str(rest), a[1]]); }, D('A = fscanf(fid,fmt)', '按格式读取文件数据', '文件'));
  def('fwrite', (a, n, it) => { const h = handle(it, a[0]); const v = a[1]; h.buf += T.isStr(v) ? v.toStr() : String.fromCharCode(...H.tensor(v).re); return null; });

  // ---------- 帮助 ----------
  function helpText(name, it) {
    const d = ML.docs[name];
    if (it.files.has(name)) {
      const src = it.files.get(name);
      const lines = src.split('\n');
      const out = [];
      let started = false;
      for (const l of lines) {
        const t = l.trim();
        if (!started && (t.startsWith('function') || t === '')) continue;
        if (t.startsWith('%')) { started = true; out.push(' ' + t.replace(/^%+\s?/, '')); } else if (started) break; else break;
      }
      return out.length ? out.join('\n') + '\n' : name + '.m 中没有帮助注释。\n';
    }
    if (!d) return null;
    return '  ' + name + ' - ' + d.desc + '\n\n  语法:\n    ' + d.syn.split(/,\s(?=[\w\[])/).join('\n    ') + '\n\n  类别: ' + d.cat + '\n';
  }
  ML.helpText = helpText;
  def('help doc', (a, n, it) => {
    if (!a.length) {
      const cats = {};
      for (const k of Object.keys(ML.docs)) { const c = ML.docs[k].cat; (cats[c] = cats[c] || []).push(k); }
      let out = '\nMatWeb 帮助 —— 输入 help 函数名 查看具体用法。可用函数（按类别）：\n\n';
      for (const c of Object.keys(cats).sort()) out += '  【' + c + '】\n    ' + cats[c].sort().join(', ').replace(/(.{1,96})(,\s|$)/g, '$1,\n    ').replace(/,\n\s*$/, '') + '\n\n';
      it.print(out);
      return null;
    }
    const name = H.str(a[0]);
    const t = helpText(name, it);
    if (t) it.print('\n' + t + '\n');
    else {
      const sug = it.suggest(name, null);
      it.print('未找到 ' + name + '。' + (sug ? '您是否要查找 ' + sug + '？' : '') + '\n');
    }
    return null;
  }, D('help name', '显示函数帮助', '系统'));
  def('lookfor', (a, n, it) => {
    const kw = H.str(a[0]).toLowerCase();
    const hits = Object.keys(ML.docs).filter((k) => k.toLowerCase().indexOf(kw) >= 0 || ML.docs[k].desc.toLowerCase().indexOf(kw) >= 0).sort();
    it.print(hits.length ? hits.map((k) => '  ' + k.padEnd(16) + ' - ' + ML.docs[k].desc).join('\n') + '\n' : '未找到匹配项。\n');
    return null;
  }, D('lookfor keyword', '按关键字搜索函数', '系统'));
})(typeof self !== 'undefined' ? self : globalThis);
