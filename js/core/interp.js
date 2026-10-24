/* MatWeb - 解释器：执行语法树 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor, Cell, Struct, FuncHandle, MError, classOf } = T;
  const ops = ML.ops;
  const IX = ML.idx;
  const COLON = ML.COLON;
  const err = ML.err;
  const share = ML.share;

  const BREAK = 1, CONTINUE = 2, RETURN = 3;

  let envCounter = 0;
  class Env {
    constructor(ctx) {
      this.id = ++envCounter;
      this.vars = new Map(); // name -> slot {v}
      this.globalNames = null;
      this.ctx = ctx || null; // 函数上下文 {name, locals, persist, file}
    }
  }

  class Interpreter {
    constructor(io) {
      this.io = io || {};
      this.base = new Env(null);
      this.globalSlots = new Map();
      this.files = new Map();       // 'name' -> 源码（虚拟文件系统中的 .m 文件）
      this.dataFiles = new Map();   // 其它文件（csv/mat）
      this.fileCache = new Map();
      this.cmdFunctions = new Map(); // 命令行中定义的函数
      this.persistStore = new Map();
      this.callStack = [];
      this.endStack = [];
      this.ticks = 0;
      this.curEnv = this.base;
      this.curLine = 0;
      this.depth = 0;
      this.lastWarning = '';
      this.lastError = null;
      this.tictoc = Date.now();
      this.rng = ML.random ? ML.random.create(0) : null;
      this.graphics = ML.graphics ? ML.graphics.create(this) : null;
      this.dirtyWorkspace = true;
      this.fileHandles = new Map();
      ML.warn = (msg) => this.warning(msg);
      ML.curInterp = this;
    }

    // ---------- 输出 ----------
    print(text) { if (this.io.print) this.io.print(text); }
    printErr(text) { if (this.io.printErr) this.io.printErr(text); else this.print(text); }
    warning(msg) {
      this.lastWarning = msg;
      if (this.warningsOff) return;
      if (this.io.warn) this.io.warn('警告: ' + msg + '\n'); else this.print('警告: ' + msg + '\n');
    }
    tick() {
      if ((++this.ticks & 0x3ff) === 0 && this.io.checkInterrupt && this.io.checkInterrupt()) {
        err('操作已被用户终止。', 'MATLAB:interrupt');
      }
    }

    // ---------- 变量 ----------
    slot(env, name, create) {
      if (env.globalNames && env.globalNames.has(name)) {
        let s = this.globalSlots.get(name);
        if (!s && create) { s = { v: undefined }; this.globalSlots.set(name, s); }
        return s;
      }
      let s = env.vars.get(name);
      if (!s && create) { s = { v: undefined }; env.vars.set(name, s); }
      return s;
    }
    getVar(env, name) { const s = this.slot(env, name, false); return s ? s.v : undefined; }
    setVar(env, name, v) {
      const s = this.slot(env, name, true);
      if (v && typeof v === 'object') {
        if (v._own === undefined) v._own = s;
        else if (v._own !== s) v._own = null;
      }
      s.v = v;
      if (env === this.base) this.dirtyWorkspace = true;
    }
    clearVar(env, name) { env.vars.delete(name); if (env === this.base) this.dirtyWorkspace = true; }

    // ---------- 执行入口 ----------
    // 在基础工作区执行一段代码，错误会被打印
    run(src, opts) {
      opts = opts || {};
      ML.curInterp = this;
      ML.warn = (msg) => this.warning(msg);
      let prog;
      try {
        prog = ML.parse(src);
      } catch (e) {
        this.reportError(e);
        return false;
      }
      for (const f of prog.functions) this.cmdFunctions.set(f.name, { fn: f, locals: this.cmdFunctions });
      this.callStack = [];
      this.endStack = [];
      this.depth = 0;
      const ctxSave = this.base.ctx;
      if (opts.locals) this.base.ctx = opts.locals;
      try {
        this.execBlock(prog.body, this.base);
        return true;
      } catch (e) {
        this.reportError(e);
        return false;
      } finally {
        this.base.ctx = ctxSave;
        if (this.graphics) this.graphics.flush();
      }
    }
    reportError(e) {
      if (e && e.mlSignal) return;
      let msg;
      if (e instanceof MError) msg = e.message;
      else if (e instanceof RangeError && /call stack/i.test(e.message)) msg = '已达到最大递归深度。可能存在无限递归。';
      else { msg = '内部错误: ' + (e && e.message ? e.message : String(e)); if (typeof console !== 'undefined') console.error(e); }
      this.lastError = e instanceof MError ? e : new MError(msg);
      let where = '';
      if (e && e.mlWhere) where = '\n\n出错 ' + e.mlWhere;
      else if (e && e.mlLine && this.multiLine) where = '（第 ' + e.mlLine + ' 行）';
      this.printErr('错误: ' + msg + where + '\n');
    }

    execBlock(stmts, env) {
      for (let i = 0; i < stmts.length; i++) {
        const r = this.execStmt(stmts[i], env);
        if (r) return r;
      }
      return 0;
    }

    execStmt(s, env) {
      this.curLine = s.line;
      try {
        switch (s.type) {
          case 'Expr': return this.execExprStmt(s, env);
          case 'Assign': return this.execAssign(s, env);
          case 'Cmd': return this.execCmd(s, env);
          case 'If': {
            for (const c of s.clauses) {
              if (this.cond(c.cond, env)) return this.execBlock(c.body, env);
            }
            if (s.elseBody) return this.execBlock(s.elseBody, env);
            return 0;
          }
          case 'For': return this.execFor(s, env);
          case 'While': {
            while (this.cond(s.cond, env)) {
              this.tick();
              const r = this.execBlock(s.body, env);
              if (r === BREAK) break;
              if (r === RETURN) return r;
            }
            return 0;
          }
          case 'DoUntil': {
            do {
              this.tick();
              const r = this.execBlock(s.body, env);
              if (r === BREAK) break;
              if (r === RETURN) return r;
            } while (!this.cond(s.cond, env));
            return 0;
          }
          case 'Switch': return this.execSwitch(s, env);
          case 'Try': {
            try {
              const r = this.execBlock(s.body, env);
              return r;
            } catch (e) {
              if (e && e.mlSignal) throw e;
              if (!(e instanceof MError) && e && /interrupt/.test(e.identifier || '')) throw e;
              if (e instanceof MError && e.identifier === 'MATLAB:interrupt') throw e;
              const me = e instanceof MError ? e : new MError('内部错误: ' + (e && e.message));
              this.lastError = me;
              if (s.id) this.setVar(env, s.id, this.makeException(me));
              return this.execBlock(s.catchBody, env);
            }
          }
          case 'Break': return BREAK;
          case 'Continue': return CONTINUE;
          case 'Return': return RETURN;
          case 'Global': {
            if (!env.globalNames) env.globalNames = new Set();
            for (const n of s.names) {
              env.globalNames.add(n);
              if (!this.globalSlots.has(n)) this.globalSlots.set(n, { v: new Tensor(0, 0) });
              env.vars.delete(n);
            }
            if (env === this.base) this.dirtyWorkspace = true;
            return 0;
          }
          case 'Persistent': {
            const ctx = env.ctx;
            if (!ctx) err('persistent 只能在函数中使用。');
            const key = ctx.key;
            let store = this.persistStore.get(key);
            if (!store) { store = new Map(); this.persistStore.set(key, store); }
            if (!env.globalNames) env.globalNames = new Set();
            for (const n of s.names) {
              if (!store.has(n)) store.set(n, { v: new Tensor(0, 0) });
              env.vars.set(n, store.get(n));
            }
            return 0;
          }
          default: err('未知语句类型 ' + s.type);
        }
      } catch (e) {
        if (e instanceof MError && e.mlLine == null) e.mlLine = s.line;
        throw e;
      }
    }

    makeException(me) {
      const s = new Struct(1, 1);
      s.setField('message', T.str(me.message), 0);
      s.setField('identifier', T.str(me.identifier || ''), 0);
      const st = new Struct(1, 1);
      st.setField('name', T.str(me.mlFunc || ''), 0);
      st.setField('line', T.scalar(me.mlLine || 0), 0);
      s.setField('stack', st, 0);
      s.isException = true;
      return s;
    }

    cond(node, env) {
      const v = this.evalSingle(node, env);
      return T.isTrue(v);
    }

    execExprStmt(s, env) {
      const e = s.expr;
      if (e.type === 'Id') {
        const v = this.getVar(env, e.name);
        if (v !== undefined) {
          if (s.print) this.print(ML.fmt.display(e.name, v));
          return 0;
        }
      }
      const vals = this.evalMulti(e, env, 0);
      if (vals.length > 0 && vals[0] !== undefined) {
        const v = vals[0];
        this.setVar(env, 'ans', v);
        if (s.print) this.print(ML.fmt.display('ans', v));
      }
      return 0;
    }

    execCmd(s, env) {
      // 命令语法：如果名字是变量则报错（MATLAB 行为类似）
      if (this.getVar(env, s.name) !== undefined) {
        err('"' + s.name + '" 是变量，不能以命令语法调用。如果要进行运算，请在运算符两侧加空格或使用括号。');
      }
      const args = s.args.map((a) => T.str(a));
      const vals = this.callFunction(s.name, args, 0, env);
      if (vals.length > 0 && vals[0] !== undefined) {
        this.setVar(env, 'ans', vals[0]);
        if (s.print) this.print(ML.fmt.display('ans', vals[0]));
      }
      return 0;
    }

    execFor(s, env) {
      const ex = s.expr;
      const assign = (v) => { if (s.v.type === 'Id') this.setVar(env, s.v.name, v); else this.assignTo(s.v, v, env); };
      if (ex.type === 'Range') {
        // 避免生成完整数组
        const a = this.evalSingle(ex.start, env), st = ex.step ? this.evalSingle(ex.step, env) : null, b = this.evalSingle(ex.stop, env);
        if (a instanceof Tensor && b instanceof Tensor && a.type !== 'char' && !a.im && (!st || (st instanceof Tensor && !st.im))) {
          const start = T.toNum(a, '范围起点'), step = st ? T.toNum(st, '步长') : 1, stop = T.toNum(b, '范围终点');
          const n = rangeCount(start, step, stop);
          const type = (a.type === 'double' || a.type === 'logical') ? 'double' : a.type;
          for (let k = 0; k < n; k++) {
            this.tick();
            const x = k === n - 1 && n > 1 && Math.abs(start + k * step - stop) < Math.abs(step) * 1e-10 ? stop : start + k * step;
            assign(new Tensor(1, 1, new Float64Array([x]), null, type));
            const r = this.execBlock(s.body, env);
            if (r === BREAK) break;
            if (r === RETURN) return r;
          }
          return 0;
        }
      }
      const v = this.evalSingle(ex, env);
      let cols, getCol;
      if (v instanceof Tensor) {
        cols = v.numel === 0 ? 0 : v.cols;
        getCol = (c) => {
          if (v.rows === 1) return new Tensor(1, 1, new Float64Array([v.re[c]]), v.im ? new Float64Array([v.im[c]]) : null, v.type).trim();
          return IX.indexParen(v, [COLON, T.scalar(c + 1)]);
        };
      } else if (v instanceof Cell || v instanceof Struct) {
        cols = v.numel === 0 ? 0 : v.cols;
        getCol = (c) => IX.indexParen(v, [COLON, T.scalar(c + 1)]);
      } else if (v instanceof FuncHandle) {
        cols = 1; getCol = () => v;
      } else err('for 循环的值无效。');
      for (let c = 0; c < cols; c++) {
        this.tick();
        assign(getCol(c));
        const r = this.execBlock(s.body, env);
        if (r === BREAK) break;
        if (r === RETURN) return r;
      }
      return 0;
    }

    execSwitch(s, env) {
      const v = this.evalSingle(s.expr, env);
      const matches = (cv) => {
        if (cv instanceof Cell) return cv.data.some(matches);
        if (T.isStr(v) || T.isStr(cv)) return T.isStr(v) && T.isStr(cv) && v.toStr() === cv.toStr();
        if (v instanceof Tensor && cv instanceof Tensor) {
          if (v.numel === 0 && cv.numel === 0) return true;
          if (v.numel !== 1 || cv.numel !== 1) return false;
          return v.re[0] === cv.re[0];
        }
        return false;
      };
      for (const c of s.cases) {
        const cv = this.evalSingle(c.val, env);
        if (matches(cv)) return this.execBlock(c.body, env);
      }
      if (s.otherwise) return this.execBlock(s.otherwise, env);
      return 0;
    }

    // ---------- 赋值 ----------
    execAssign(s, env) {
      const lhs = s.lhs;
      if (lhs.length === 1) {
        let v;
        const L = lhs[0];
        // 多元素右侧（如 c{:}）赋给单个变量时取第一个
        const vals = this.evalMulti(s.rhs, env, 1);
        if (vals.length === 0 || vals[0] === undefined) err('右侧表达式没有返回值，无法赋值。');
        v = vals[0];
        const root = this.assignTo(L, v, env);
        if (s.print) this.print(ML.fmt.display(root, this.getVar(env, root)));
        return 0;
      }
      const nout = lhs.length;
      const vals = this.evalMulti(s.rhs, env, nout);
      const roots = [];
      for (let i = 0; i < nout; i++) {
        if (lhs[i].type === 'Tilde') continue;
        if (i >= vals.length || vals[i] === undefined) err('输出参数太多（需要 ' + nout + ' 个，实际只有 ' + vals.length + ' 个）。');
        roots.push(this.assignTo(lhs[i], vals[i], env));
      }
      if (s.print) for (const r of roots) this.print(ML.fmt.display(r, this.getVar(env, r)));
      return 0;
    }

    // 赋值到左值，返回根变量名
    assignTo(L, v, env) {
      if (L.type === 'Id') { this.setVar(env, L.name, v); return L.name; }
      const accs = [];
      let node = L;
      while (node.type !== 'Id') { accs.unshift(node); node = node.obj; }
      const root = node.name;
      const s = this.slot(env, root, false);
      const cur = s ? s.v : undefined;
      const inPlace = !!(s && cur && cur._own === s);
      const nv = this.assignPath(cur, accs, 0, v, env, inPlace);
      this.setVar(env, root, nv);
      return root;
    }

    assignPath(cur, accs, i, rhs, env, inPlace) {
      const acc = accs[i];
      const last = i === accs.length - 1;
      if (acc.type === 'Field') {
        const fname = acc.name !== null ? acc.name : T.toStr(this.evalSingle(acc.dyn, env), '动态字段名');
        if (ML.GHandle && cur instanceof ML.GHandle) {
          // 图形对象属性赋值（句柄语义）
          if (!last) err('不支持对图形对象属性进行嵌套赋值。');
          cur.setField(fname, rhs);
          return cur;
        }
        let s;
        if (cur === undefined || (cur instanceof Tensor && cur.numel === 0)) s = new Struct(1, 1);
        else if (cur instanceof Struct) s = cur.clone();
        else err('无法对 ' + classOf(cur) + ' 类型的变量使用点索引赋值。');
        if (s.numel !== 1) err('结构体数组的字段赋值需要先指定元素索引，例如 s(2).' + fname + ' = ...');
        const child = s.hasField(fname) ? s.getField(fname, 0) : undefined;
        const nv = last ? rhs : this.assignPath(child, accs, i + 1, rhs, env, false);
        s.setField(fname, share(nv), 0);
        return s;
      }
      // Index
      if (cur instanceof ML.MapObj && !acc.brace) {
        const keyArgs = this.evalArgs(acc.args, env, null);
        if (keyArgs.length !== 1) err('containers.Map 索引只接受一个键。');
        if (last) { cur.set(keyArgs[0], rhs); return cur; }
        const child = cur.map.has(cur.keyOf(keyArgs[0])) ? cur.get(keyArgs[0]) : undefined;
        cur.set(keyArgs[0], this.assignPath(child, accs, i + 1, rhs, env, false));
        return cur;
      }
      const ctxVal = cur === undefined ? new Tensor(0, 0) : cur;
      const args = this.evalArgs(acc.args, env, ctxVal);
      if (last) {
        if (acc.brace) return IX.assignBrace(cur, args, rhs);
        return IX.assignParen(cur, args, rhs, inPlace);
      }
      if (acc.brace) {
        const child = IX.getElemForNested(cur, args, true);
        const nv = this.assignPath(child, accs, i + 1, rhs, env, false);
        return IX.assignBrace(cur, args, nv);
      }
      if (cur instanceof Tensor && cur.numel > 0 && accs[i + 1].type === 'Field') err('无法对非结构体数组使用点索引赋值。');
      const child = IX.getElemForNested(cur, args, false);
      const nv = this.assignPath(child, accs, i + 1, rhs, env, false);
      if (cur instanceof Tensor && cur.numel === 0) cur = undefined;
      return IX.assignParen(cur, args, nv, false);
    }

    // ---------- 表达式求值 ----------
    evalSingle(node, env) {
      switch (node.type) {
        case 'Num': {
          if (node.cache) return node.cache;
          const t = node.imag ? new Tensor(1, 1, new Float64Array([0]), new Float64Array([node.value])) : T.scalar(node.value);
          t._own = null; node.cache = t;
          return t;
        }
        case 'Str': {
          if (node.cache) return node.cache;
          const t = T.str(node.value); t._own = null; node.cache = t;
          return t;
        }
        case 'Bin': {
          const op = node.op;
          if (op === '&&' || op === '||') {
            const a = this.evalSingle(node.l, env);
            const av = this.logicalScalar(a, op);
            if (op === '&&' && !av) return T.bool(false);
            if (op === '||' && av) return T.bool(true);
            return T.bool(this.logicalScalar(this.evalSingle(node.r, env), op));
          }
          const a = this.evalSingle(node.l, env), b = this.evalSingle(node.r, env);
          // 标量快速路径
          if (a instanceof Tensor && b instanceof Tensor && a.numel === 1 && b.numel === 1 && !a.im && !b.im && a.type === 'double' && b.type === 'double') {
            const x = a.re[0], y = b.re[0];
            switch (op) {
              case '+': return T.scalar(x + y);
              case '-': return T.scalar(x - y);
              case '*': case '.*': return T.scalar(x * y);
              case '/': case './': return T.scalar(x / y);
              case '<': return T.bool(x < y);
              case '>': return T.bool(x > y);
              case '<=': return T.bool(x <= y);
              case '>=': return T.bool(x >= y);
              case '==': return T.bool(x === y);
              case '~=': return T.bool(x !== y);
              default: break;
            }
          }
          const f = ops.binaryOps[op];
          if (!f) err('不支持的运算符 ' + op);
          return f(a, b);
        }
        case 'Un': {
          const a = this.evalSingle(node.e, env);
          if (node.op === '-') return ops.uminus(a);
          if (node.op === '+') return ops.uplus(a);
          return ops.not(a);
        }
        case 'Post': {
          const a = this.evalSingle(node.e, env);
          return node.op === "'" ? ops.ctranspose(a) : ops.transpose(a);
        }
        case 'Paren': return this.evalSingle(node.e, env);
        case 'Range': return this.evalRange(node, env);
        case 'Matrix': return this.evalMatrix(node, env);
        case 'CellLit': return this.evalCellLit(node, env);
        case 'Anon': return this.makeAnon(node, env);
        case 'FHandle': return new FuncHandle('named', { name: node.name, text: '@' + node.name, ctx: env.ctx });
        case 'End': {
          const top = this.endStack[this.endStack.length - 1];
          if (!top) err('\'end\' 只能在索引表达式中使用。');
          const v = top.v;
          if (top.n === 1) return T.scalar(v.rows * v.cols);
          if (top.k === 0) return T.scalar(v.rows);
          if (top.k === 1) return T.scalar(top.n === 2 ? v.cols : v.cols);
          return T.scalar(1);
        }
        case 'Colon': return T.str(':');
        default: {
          const vals = this.evalMulti(node, env, 1);
          if (vals.length === 0 || vals[0] === undefined) {
            const nm = node.type === 'Id' ? node.name : (node.obj && node.obj.type === 'Id' ? node.obj.name : '');
            err((nm ? '函数 \'' + nm + '\' ' : '该表达式') + '没有返回值，不能用于表达式中。');
          }
          return vals[0];
        }
      }
    }
    logicalScalar(v, op) {
      if (!(v instanceof Tensor)) err('运算符 \'' + op + '\' 的操作数必须能够转换为逻辑标量值。');
      if (v.numel === 0) err('运算符 \'' + op + '\' 的操作数必须能够转换为逻辑标量值（不能为空）。');
      return T.isTrue(v);
    }

    // 可能返回多个值（函数调用、cs-list）
    evalMulti(node, env, nargout) {
      switch (node.type) {
        case 'Id': {
          const v = this.getVar(env, node.name);
          if (v !== undefined) return [v];
          return this.callFunction(node.name, [], nargout, env);
        }
        case 'Index': {
          const obj = node.obj;
          if (obj.type === 'Id') {
            const v = this.getVar(env, obj.name);
            if (v === undefined) {
              if (node.brace) err('未定义变量 \'' + obj.name + '\'，无法使用花括号索引。');
              const args = this.evalArgs(node.args, env, null);
              return this.callFunction(obj.name, args, nargout, env);
            }
            return this.indexValue(v, node, env, nargout);
          }
          if (obj.type === 'Field' && !node.brace) {
            // 带包名的函数调用，如 containers.Map(...)
            const dn = this.dottedFunction(obj, env);
            if (dn) return this.callFunction(dn, this.evalArgs(node.args, env, null), nargout, env);
          }
          const base = this.evalSingle(obj, env);
          return this.indexValue(base, node, env, nargout);
        }
        case 'Field': {
          const dn = this.dottedFunction(node, env);
          if (dn) return this.callFunction(dn, [], nargout, env);
          const base = this.evalSingle(node.obj, env);
          const fname = node.name !== null ? node.name : T.toStr(this.evalSingle(node.dyn, env), '动态字段名');
          if (base instanceof ML.MapObj || (ML.GHandle && base instanceof ML.GHandle)) return [base.field(fname)];
          if (!(base instanceof Struct)) {
            if (base instanceof Tensor && base.type === 'char') err('点索引不支持字符向量。');
            err('无法从非结构体数组对象引用字段 \'' + fname + '\'。');
          }
          if (!base.hasField(fname)) err('无法识别的字段名称 "' + fname + '"。');
          const out = [];
          for (let k = 0; k < base.numel; k++) out.push(base.getField(fname, k));
          return out;
        }
        default:
          return [this.evalSingle(node, env)];
      }
    }

    dottedFunction(node, env) {
      const parts = [];
      let n = node;
      while (n.type === 'Field' && n.name !== null) { parts.unshift(n.name); n = n.obj; }
      if (n.type !== 'Id' || this.getVar(env, n.name) !== undefined) return null;
      parts.unshift(n.name);
      const name = parts.join('.');
      return this.resolveFunction(name, env) ? name : null;
    }

    indexValue(v, node, env, nargout) {
      if (v instanceof FuncHandle && !node.brace) {
        const args = this.evalArgs(node.args, env, null);
        return this.callValue(v, args, nargout);
      }
      if (v instanceof ML.MapObj && !node.brace) {
        const args = this.evalArgs(node.args, env, null);
        if (args.length !== 1) err('containers.Map 索引只接受一个键。');
        return [v.get(args[0])];
      }
      const args = this.evalArgs(node.args, env, v);
      if (node.brace) return IX.indexBrace(v, args);
      return [IX.indexParen(v, args)];
    }

    evalArgs(argNodes, env, ctxVal) {
      const out = [];
      const n = argNodes.length;
      for (let k = 0; k < n; k++) {
        const a = argNodes[k];
        if (a.type === 'Colon') { out.push(ctxVal ? COLON : T.str(':')); continue; }
        if (ctxVal) this.endStack.push({ v: ctxVal, k, n });
        try {
          if ((a.type === 'Index' && a.brace) || a.type === 'Field') {
            const vals = this.evalMulti(a, env, 1);
            for (const x of vals) out.push(x);
          } else if (a.type === 'Index' || a.type === 'Id') {
            const vals = this.evalMulti(a, env, 1);
            if (vals.length === 0 || vals[0] === undefined) err('函数没有返回值，不能用作参数。');
            out.push(vals[0]);
          } else out.push(this.evalSingle(a, env));
        } finally {
          if (ctxVal) this.endStack.pop();
        }
      }
      return out;
    }

    evalRange(node, env) {
      const a = this.evalSingle(node.start, env);
      const st = node.step ? this.evalSingle(node.step, env) : null;
      const b = this.evalSingle(node.stop, env);
      return makeRange(a, st, b);
    }

    evalMatrix(node, env) {
      const rowVals = [];
      for (const r of node.rows) {
        const items = [];
        for (const e of r) {
          if ((e.type === 'Index' && e.brace) || e.type === 'Field') { for (const x of this.evalMulti(e, env, 1)) items.push(x); }
          else if (e.type === 'Index' || e.type === 'Id') {
            const vals = this.evalMulti(e, env, 1);
            if (vals.length === 0 || vals[0] === undefined) err('函数没有返回值，无法串联。');
            items.push(vals[0]);
          } else items.push(this.evalSingle(e, env));
        }
        rowVals.push(items.length === 0 ? new Tensor(0, 0) : (items.length === 1 ? items[0] : IX.horzcat(items)));
      }
      if (rowVals.length === 0) return new Tensor(0, 0);
      if (rowVals.length === 1) {
        const v = rowVals[0];
        // [x] 返回 x 本身（不拷贝），但 [] 为空
        return v;
      }
      return IX.vertcat(rowVals);
    }

    evalCellLit(node, env) {
      const rowVals = [];
      for (const r of node.rows) {
        const items = [];
        for (const e of r) {
          let vals;
          if ((e.type === 'Index' && e.brace) || e.type === 'Field') vals = this.evalMulti(e, env, 1);
          else vals = [this.evalSingle(e, env)];
          for (const x of vals) items.push(x instanceof Cell ? x : new Cell(1, 1, [share(x)]));
        }
        if (items.length) rowVals.push(IX.horzcat(items));
      }
      if (rowVals.length === 0) return new Cell(0, 0);
      if (rowVals.length === 1) return rowVals[0] instanceof Cell ? rowVals[0] : new Cell(1, 1, [rowVals[0]]);
      return IX.vertcat(rowVals);
    }

    makeAnon(node, env) {
      const captured = new Map();
      const params = new Set(node.params);
      const visit = (e) => {
        if (!e || typeof e !== 'object') return;
        if (e.type === 'Id') {
          if (!params.has(e.name) && !captured.has(e.name)) {
            const v = this.getVar(env, e.name);
            if (v !== undefined) captured.set(e.name, share(v));
          }
          return;
        }
        if (e.type === 'Anon') {
          // 嵌套匿名函数：捕获其自由变量
          const inner = new Set(e.params);
          const visit2 = (x) => {
            if (!x || typeof x !== 'object') return;
            if (x.type === 'Id') {
              if (!inner.has(x.name) && !params.has(x.name) && !captured.has(x.name)) {
                const v = this.getVar(env, x.name);
                if (v !== undefined) captured.set(x.name, share(v));
              }
              return;
            }
            for (const k in x) if (k !== 'cache') { const c = x[k]; if (Array.isArray(c)) c.forEach((y) => (Array.isArray(y) ? y.forEach(visit2) : visit2(y))); else if (c && typeof c === 'object' && c.type) visit2(c); }
          };
          visit2(e.body);
          return;
        }
        for (const k in e) {
          if (k === 'cache') continue;
          const c = e[k];
          if (Array.isArray(c)) c.forEach((y) => (Array.isArray(y) ? y.forEach(visit) : visit(y)));
          else if (c && typeof c === 'object' && c.type) visit(c);
        }
      };
      visit(node.body);
      return new FuncHandle('anon', { params: node.params, body: node.body, captured, text: ML.unparse(node), ctx: env.ctx });
    }

    // ---------- 函数调用 ----------
    resolveFunction(name, env) {
      const ctx = env && env.ctx;
      if (ctx && ctx.locals && ctx.locals.has(name)) return { kind: 'user', entry: ctx.locals.get(name) };
      if (this.cmdFunctions.has(name)) return { kind: 'user', entry: this.cmdFunctions.get(name) };
      if (this.files.has(name)) {
        const f = this.loadFile(name);
        if (f.isScript) return { kind: 'script', file: f };
        return { kind: 'user', entry: f.main };
      }
      const b = ML.builtins[name];
      if (b) return { kind: 'builtin', fn: b };
      return null;
    }
    loadFile(name) {
      const src = this.files.get(name);
      let c = this.fileCache.get(name);
      if (c && c.src === src) return c;
      let prog;
      try { prog = ML.parse(src); } catch (e) {
        if (e instanceof MError) e.message = '文件 ' + name + '.m 中: ' + e.message;
        throw e;
      }
      const locals = new Map();
      c = { src, prog, name, locals };
      if (prog.body.length === 0 && prog.functions.length > 0) {
        c.isScript = false;
        for (const f of prog.functions) locals.set(f.name, { fn: f, locals, file: name });
        const mainFn = prog.functions[0];
        c.main = { fn: mainFn, locals, file: name };
      } else {
        c.isScript = true;
        for (const f of prog.functions) locals.set(f.name, { fn: f, locals, file: name });
      }
      this.fileCache.set(name, c);
      return c;
    }
    functionExists(name) { return !!this.resolveFunction(name, this.curEnv); }

    callFunction(name, args, nargout, env) {
      const r = this.resolveFunction(name, env);
      if (!r) {
        const sug = this.suggest(name, env);
        err('函数或变量 \'' + name + '\' 无法识别。' + (sug ? '\n\n您是否要输入:\n>> ' + sug : ''), 'MATLAB:UndefinedFunction');
      }
      if (r.kind === 'builtin') return this.callBuiltin(name, r.fn, args, nargout, env);
      if (r.kind === 'script') {
        if (args.length) err('尝试将脚本 ' + name + ' 作为函数执行。');
        this.runScript(r.file, env);
        return [];
      }
      return this.callUser(r.entry, args, nargout);
    }
    suggest(name, env) {
      const cands = [];
      for (const k of Object.keys(ML.builtins)) cands.push(k);
      if (env) for (const k of env.vars.keys()) cands.push(k);
      let best = null, bd = 3;
      for (const c of cands) {
        if (Math.abs(c.length - name.length) > 2) continue;
        const d = editDistance(c.toLowerCase(), name.toLowerCase());
        if (d < bd || (d === bd && best && c.length < best.length)) { bd = d; best = c; }
      }
      return bd <= (name.length > 4 ? 2 : 1) ? best : null;
    }
    callBuiltin(name, fn, args, nargout, env) {
      const saveEnv = this.curEnv;
      this.curEnv = env || this.curEnv;
      try {
        const r = fn(args, nargout, this);
        if (r === undefined || r === null) return [];
        return Array.isArray(r) ? r : [r];
      } catch (e) {
        if (e instanceof MError && !e.mlFunc) e.mlFunc = name;
        throw e;
      } finally {
        this.curEnv = saveEnv;
      }
    }
    runScript(file, env) {
      const save = env.ctx;
      if (file.locals.size) env.ctx = { locals: file.locals, key: 'script:' + file.name, name: file.name };
      this.depth++;
      if (this.depth > 200) err('脚本递归调用层数过多。');
      try {
        const r = this.execBlock(file.prog.body, env);
        return r;
      } catch (e) {
        if (e instanceof MError && !e.mlWhere) e.mlWhere = file.name + '（第 ' + (e.mlLine || this.curLine) + ' 行）';
        throw e;
      } finally {
        this.depth--;
        env.ctx = save;
      }
    }

    callUser(entry, args, nargout) {
      const fn = entry.fn;
      const params = fn.params;
      const hasVarargin = params.length && params[params.length - 1] === 'varargin';
      const nFixed = hasVarargin ? params.length - 1 : params.length;
      if (!hasVarargin && args.length > params.length) err('输入参数太多。函数 \'' + fn.name + '\' 最多接受 ' + params.length + ' 个输入。', 'MATLAB:TooManyInputs');
      const hasVarargout = fn.outs.length && fn.outs[fn.outs.length - 1] === 'varargout';
      if (!hasVarargout && nargout > Math.max(fn.outs.length, 1)) err('输出参数太多。函数 \'' + fn.name + '\' 最多返回 ' + fn.outs.length + ' 个输出。', 'MATLAB:TooManyOutputs');
      const env = new Env({ locals: entry.locals, key: (entry.file || '') + '/' + fn.name, name: fn.name });
      for (let i = 0; i < Math.min(nFixed, args.length); i++) if (params[i] !== '~') this.setVar(env, params[i], args[i]);
      if (hasVarargin) {
        const extra = args.slice(nFixed).map(share);
        this.setVar(env, 'varargin', new Cell(1, extra.length, extra));
      }
      env.nargin = args.length;
      env.nargout = nargout;
      this.depth++;
      if (this.depth > 256) { this.depth--; err('已达到最大递归限制 256。请避免无限递归。', 'MATLAB:recursionLimit'); }
      const saveEnv = this.curEnv;
      this.curEnv = env;
      this.callStack.push(fn.name);
      try {
        this.execBlock(fn.body, env);
      } catch (e) {
        if (e instanceof MError && !e.mlWhere) e.mlWhere = fn.name + (entry.file ? ' (' + entry.file + '.m)' : '') + '（第 ' + (e.mlLine || this.curLine) + ' 行）';
        throw e;
      } finally {
        this.depth--;
        this.curEnv = saveEnv;
        this.callStack.pop();
      }
      const outs = [];
      const want = Math.max(nargout, 1);
      for (let i = 0; i < fn.outs.length && outs.length < want; i++) {
        const name = fn.outs[i];
        if (name === 'varargout' && i === fn.outs.length - 1) {
          const vo = this.getVar(env, 'varargout');
          if (vo instanceof Cell) for (const x of vo.data) { if (outs.length < want) outs.push(x); }
          break;
        }
        const v = this.getVar(env, name);
        if (v === undefined) {
          if (i < nargout) err('在调用 "' + fn.name + '" 期间未对输出参数 "' + name + '"（可能还有其他参数）赋值。', 'MATLAB:unassignedOutputs');
          break;
        }
        outs.push(v);
      }
      if (nargout > 0 && outs.length < nargout) err('输出参数太多。');
      return outs;
    }

    // 调用函数句柄 / 函数名
    callValue(f, args, nargout) {
      if (nargout === undefined) nargout = 1;
      if (f instanceof FuncHandle) {
        if (f.kind === 'named') {
          const env = new Env(f.ctx || null);
          return this.callFunction(f.name, args, nargout, env);
        }
        const env = new Env(f.ctx || null);
        for (const [k, v] of f.captured) env.vars.set(k, { v });
        if (args.length > f.params.length && !(f.params.length && f.params[f.params.length - 1] === 'varargin')) err('输入参数太多。');
        for (let i = 0; i < f.params.length; i++) {
          const p = f.params[i];
          if (p === 'varargin') { this.setVar(env, 'varargin', new Cell(1, Math.max(0, args.length - i), args.slice(i).map(share))); break; }
          if (i < args.length && p !== '~') this.setVar(env, p, args[i]);
        }
        this.depth++;
        if (this.depth > 256) { this.depth--; err('已达到最大递归限制 256。', 'MATLAB:recursionLimit'); }
        try {
          return this.evalMulti(f.body, env, nargout);
        } finally { this.depth--; }
      }
      if (T.isStr(f)) return this.callFunction(f.toStr(), args, nargout, this.curEnv);
      err('需要函数句柄或函数名。');
    }
    // 便捷：调用并返回第一个结果
    call1(f, args) {
      const r = this.callValue(f, args, 1);
      if (!r.length) err('函数没有返回值。');
      return r[0];
    }

    // 在当前环境中执行字符串（eval）
    evalString(src, env, nargout) {
      env = env || this.curEnv;
      const prog = ML.parse(src);
      for (const f of prog.functions) this.cmdFunctions.set(f.name, { fn: f, locals: this.cmdFunctions });
      // 单个表达式且需要返回值
      if (nargout > 0 && prog.body.length === 1 && prog.body[0].type === 'Expr') {
        return this.evalMulti(prog.body[0].expr, env, nargout);
      }
      this.execBlock(prog.body, env);
      return [];
    }

    // 工作区信息
    workspaceInfo() {
      const out = [];
      const names = new Set([...this.base.vars.keys()]);
      if (this.base.globalNames) for (const g of this.base.globalNames) names.add(g);
      for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
        const v = this.getVar(this.base, name);
        if (v === undefined) continue;
        out.push({ name, size: v.rows + '×' + v.cols, cls: classOf(v) + (v instanceof Tensor && v.im ? ' (复数)' : ''), value: previewValue(v), bytes: bytesOf(v) });
      }
      return out;
    }
  }

  function previewValue(v) {
    try {
      if (v instanceof Tensor) {
        if (v.type === 'char' && v.rows <= 1) { const s = v.toStr(); return "'" + (s.length > 40 ? s.slice(0, 40) + '…' : s) + "'"; }
        if (v.numel === 0) return '[]';
        if (v.numel === 1) return ML.fmt.matrixLines(v, 0).lines[0].trim();
        if (v.numel <= 8 && v.rows === 1 && !v.im) return '[' + Array.from(v.re, (x) => ML.fmt.gStr(x, 5)).join(' ') + ']';
        if (v.numel <= 8 && v.cols === 1 && !v.im) return '[' + Array.from(v.re, (x) => ML.fmt.gStr(x, 5)).join(';') + ']';
        return v.rows + '×' + v.cols + ' ' + v.type;
      }
      return ML.fmt.summary(v, false);
    } catch (e) { return ''; }
  }
  function bytesOf(v) {
    if (v instanceof Tensor) {
      const per = { double: 8, single: 4, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, int64: 8, uint64: 8, logical: 1, char: 2 }[v.type] || 8;
      return v.numel * per * (v.im ? 2 : 1);
    }
    if (v instanceof Cell) return v.data.reduce((s, x) => s + bytesOf(x) + 104, 0);
    if (v instanceof Struct) { let s = 0; for (const m of v.elems) for (const x of m.values()) s += bytesOf(x) + 104; return s; }
    return 32;
  }

  function editDistance(a, b) {
    const m = a.length, n = b.length;
    const d = []; for (let i = 0; i <= m; i++) { d.push(new Array(n + 1).fill(0)); d[i][0] = i; }
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  function rangeCount(start, step, stop) {
    if (!Number.isFinite(start) || !Number.isFinite(stop) || !Number.isFinite(step)) {
      if (Number.isNaN(start) || Number.isNaN(step) || Number.isNaN(stop)) return 1;
      err('范围的边界或步长不能为 Inf。');
    }
    if (step === 0 || (step > 0 && start > stop) || (step < 0 && start < stop)) return 0;
    const n = Math.floor((stop - start) / step + 1e-10) + 1;
    if (n > 5e8) err('超出最大数组大小限制。');
    return n;
  }
  function makeRange(a, st, b) {
    if (!(a instanceof Tensor) || !(b instanceof Tensor) || (st && !(st instanceof Tensor))) err('冒号运算符需要数值操作数。');
    if (a.numel === 0 || b.numel === 0 || (st && st.numel === 0)) return new Tensor(1, 0);
    const start = a.re[0], step = st ? st.re[0] : 1, stop = b.re[0];
    const n = rangeCount(start, step, stop);
    let type = 'double';
    if (a.type === 'char' && b.type === 'char') type = 'char';
    else if (T.isIntType(a.type)) type = a.type;
    else if (T.isIntType(b.type)) type = b.type;
    else if (a.type === 'single' || b.type === 'single') type = 'single';
    const t = new Tensor(1, n, null, null, type);
    for (let k = 0; k < n; k++) t.re[k] = start + k * step;
    // 末端恰好落在 stop 上时消除累积误差
    if (n > 1 && Math.abs(t.re[n - 1] - stop) < Math.abs(step) * 1e-10) t.re[n - 1] = stop;
    return t;
  }

  ML.Interpreter = Interpreter;
  ML.Env = Env;
  ML.makeRange = makeRange;
  ML.rangeCount = rangeCount;
  ML.editDistance = editDistance;
})(typeof self !== 'undefined' ? self : globalThis);
