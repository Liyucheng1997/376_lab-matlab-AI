/* MatWeb - 语法分析器：将记号流解析为抽象语法树 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const err = ML.err;

  class Parser {
    constructor(tokens) {
      this.t = tokens;
      this.p = 0;
      this.indexDepth = 0;
    }
    peek(o) { return this.t[this.p + (o || 0)]; }
    next() { return this.t[this.p++]; }
    isOp(v, o) { const k = this.peek(o); return k && k.type === 'op' && k.value === v; }
    isKw(v, o) { const k = this.peek(o); return k && k.type === 'kw' && k.value === v; }
    expectOp(v) {
      const k = this.next();
      if (!k || k.type !== 'op' || k.value !== v) this.fail(k, '应为 \'' + v + '\'');
      return k;
    }
    fail(tok, msg) {
      const line = tok ? tok.line : '?';
      let what = '';
      if (tok) {
        if (tok.type === 'eof') what = '文件结尾';
        else if (tok.type === 'nl') what = '换行';
        else what = '\'' + (tok.type === 'str' ? "'" + tok.value + "'" : tok.value) + '\'';
      }
      const e = new ML.MError('语法错误（第 ' + line + ' 行）：' + (msg || '无效的表达式') + (what ? '，遇到 ' + what : '') + '。', 'MATLAB:parse');
      e.mlLine = line;
      throw e;
    }

    // ---------- 程序 ----------
    parseProgram() {
      const body = [];
      const functions = [];
      this.skipSeps();
      while (this.peek().type !== 'eof') {
        if (this.isKw('function')) functions.push(this.parseFunction());
        else body.push(this.parseStatement());
        this.skipSeps();
      }
      return { type: 'Program', body, functions };
    }
    skipSeps() {
      while (true) {
        const k = this.peek();
        if (k.type === 'nl' || (k.type === 'op' && (k.value === ';' || k.value === ','))) this.p++;
        else break;
      }
    }
    // 解析语句块，直到遇到指定的关键字之一
    parseBlock(terms) {
      const body = [];
      this.skipSeps();
      while (true) {
        const k = this.peek();
        if (k.type === 'eof') {
          if (terms.indexOf('eof') >= 0) break;
          this.fail(k, '缺少 \'end\'');
        }
        if (k.type === 'kw' && terms.indexOf(k.value) >= 0) break;
        if (k.type === 'kw' && k.value === 'function') {
          if (terms.indexOf('function') >= 0) break;
          this.fail(k, '函数定义不能出现在这里');
        }
        body.push(this.parseStatement());
        this.skipSeps();
      }
      return body;
    }
    endStmt(node) {
      // 语句结束：; 抑制输出
      const k = this.peek();
      node.print = true;
      if (k.type === 'op' && k.value === ';') { node.print = false; this.p++; }
      else if (k.type === 'op' && k.value === ',') this.p++;
      else if (k.type === 'nl') this.p++;
      else if (k.type === 'eof') { /* ok */ }
      else if (k.type === 'kw' && (k.value === 'end' || k.value === 'else' || k.value === 'elseif' || k.value === 'case' || k.value === 'otherwise' || k.value === 'catch' || k.value === 'until')) { /* 同一行的块结束 */ }
      else this.fail(k, '运算符或语句结尾无效');
      return node;
    }

    parseFunction() {
      const ft = this.next(); // function
      let outs = [], name, params = [];
      // function [a,b] = name(...) | function a = name(...) | function name(...)
      if (this.isOp('[')) {
        this.p++;
        while (!this.isOp(']')) {
          const k = this.next();
          if (k.type === 'id') outs.push(k.value);
          else if (!(k.type === 'op' && k.value === ',')) this.fail(k, '函数输出参数列表无效');
        }
        this.p++;
        this.expectOp('=');
        name = this.parseFuncName();
      } else {
        const first = this.parseFuncName();
        if (this.isOp('=')) { this.p++; outs = [first]; name = this.parseFuncName(); } else name = first;
      }
      if (this.isOp('(')) {
        this.p++;
        while (!this.isOp(')')) {
          const k = this.next();
          if (k.type === 'id') params.push(k.value);
          else if (k.type === 'op' && k.value === '~') params.push('~');
          else if (!(k.type === 'op' && k.value === ',')) this.fail(k, '函数输入参数列表无效');
        }
        this.p++;
      }
      const body = this.parseBlock(['end', 'function', 'eof']);
      if (this.isKw('end')) this.p++;
      return { type: 'Function', name, params, outs, body, line: ft.line };
    }
    parseFuncName() {
      const k = this.next();
      if (k.type !== 'id' && k.type !== 'cmd') this.fail(k, '应为函数名');
      let name = k.value;
      while (this.isOp('.') && this.peek(1).type === 'id') { this.p++; name += '.' + this.next().value; }
      return name;
    }

    parseStatement() {
      const k = this.peek();
      const line = k.line;
      if (k.type === 'cmd') {
        this.p++;
        return this.endStmt({ type: 'Cmd', name: k.value, args: k.args, line });
      }
      if (k.type === 'kw') {
        switch (k.value) {
          case 'if': return this.parseIf();
          case 'for': case 'parfor': return this.parseFor();
          case 'while': return this.parseWhile();
          case 'switch': return this.parseSwitch();
          case 'try': return this.parseTry();
          case 'do': return this.parseDo();
          case 'break': this.p++; return this.endStmt({ type: 'Break', line });
          case 'continue': this.p++; return this.endStmt({ type: 'Continue', line });
          case 'return': this.p++; return this.endStmt({ type: 'Return', line });
          case 'global': case 'persistent': {
            this.p++;
            const names = [];
            while (this.peek().type === 'id') names.push(this.next().value);
            return this.endStmt({ type: k.value === 'global' ? 'Global' : 'Persistent', names, line });
          }
          case 'function': this.fail(k, '此上下文中不允许函数定义');
          default: this.fail(k, '非预期的关键字');
        }
      }
      // 多重赋值 [a, b] = ...
      if (k.type === 'op' && k.value === '[') {
        const save = this.p;
        const close = this.findMatching(this.p);
        if (close > 0 && this.t[close + 1] && this.t[close + 1].type === 'op' && this.t[close + 1].value === '=') {
          this.p++;
          const lhs = [];
          while (!this.isOp(']')) {
            if (this.isOp(',')) { this.p++; continue; }
            if (this.isOp('~') && (this.isOp(',', 1) || this.isOp(']', 1))) { this.p++; lhs.push({ type: 'Tilde' }); continue; }
            const e = this.parsePostfix();
            this.checkLValue(e);
            lhs.push(e);
          }
          this.p++; // ]
          this.expectOp('=');
          const rhs = this.parseExpr();
          return this.endStmt({ type: 'Assign', lhs, rhs, line });
        }
        this.p = save;
      }
      const e = this.parseExpr();
      if (this.isOp('=')) {
        this.p++;
        this.checkLValue(e);
        const rhs = this.parseExpr();
        return this.endStmt({ type: 'Assign', lhs: [e], rhs, line });
      }
      const k2 = this.peek();
      if (k2.type === 'op' && (k2.value === '+=' || k2.value === '-=' || k2.value === '*=' || k2.value === '/=')) {
        this.p++;
        this.checkLValue(e);
        const rhs = this.parseExpr();
        const op = k2.value[0];
        return this.endStmt({ type: 'Assign', lhs: [e], rhs: { type: 'Bin', op, l: e, r: rhs }, line });
      }
      return this.endStmt({ type: 'Expr', expr: e, line });
    }
    findMatching(start) {
      let depth = 0;
      for (let j = start; j < this.t.length; j++) {
        const k = this.t[j];
        if (k.type === 'op') {
          if (k.value === '[' || k.value === '(' || k.value === '{') depth++;
          else if (k.value === ']' || k.value === ')' || k.value === '}') { depth--; if (depth === 0) return j; }
        }
        if (k.type === 'nl' || k.type === 'eof') return -1;
      }
      return -1;
    }
    checkLValue(e) {
      if (e.type === 'Id') return;
      if (e.type === 'Index' || e.type === 'Field') { this.checkLValue(e.obj); return; }
      const err2 = new ML.MError('赋值语句左侧无效。', 'MATLAB:parse');
      throw err2;
    }

    parseIf() {
      const line = this.next().line;
      const clauses = [];
      let cond = this.parseExpr();
      let body = this.parseBlock(['elseif', 'else', 'end']);
      clauses.push({ cond, body });
      let elseBody = null;
      while (true) {
        const k = this.next();
        if (k.type === 'kw' && k.value === 'elseif') {
          cond = this.parseExpr();
          body = this.parseBlock(['elseif', 'else', 'end']);
          clauses.push({ cond, body });
        } else if (k.type === 'kw' && k.value === 'else') {
          elseBody = this.parseBlock(['end']);
        } else if (k.type === 'kw' && k.value === 'end') break;
        else this.fail(k, '缺少 end');
      }
      return { type: 'If', clauses, elseBody, line };
    }
    parseFor() {
      const line = this.next().line;
      let paren = false;
      if (this.isOp('(')) {
        // for (i = 1:n)
        const close = this.findMatching(this.p);
        const k = this.t[this.p + 1], k2 = this.t[this.p + 2];
        if (close > 0 && k && k.type === 'id' && k2 && k2.type === 'op' && k2.value === '=') { paren = true; this.p++; }
      }
      const v = this.parsePostfix();
      this.checkLValue(v);
      this.expectOp('=');
      const expr = this.parseExpr();
      if (paren) this.expectOp(')');
      const body = this.parseBlock(['end']);
      this.next();
      return { type: 'For', v, expr, body, line };
    }
    parseWhile() {
      const line = this.next().line;
      const cond = this.parseExpr();
      const body = this.parseBlock(['end']);
      this.next();
      return { type: 'While', cond, body, line };
    }
    parseDo() {
      const line = this.next().line;
      const body = this.parseBlock(['until']);
      this.next();
      const cond = this.parseExpr();
      return this.endStmt({ type: 'DoUntil', cond, body, line });
    }
    parseSwitch() {
      const line = this.next().line;
      const expr = this.parseExpr();
      this.skipSeps();
      const cases = [];
      let otherwise = null;
      while (true) {
        const k = this.next();
        if (k.type === 'kw' && k.value === 'case') {
          const val = this.parseExpr();
          const body = this.parseBlock(['case', 'otherwise', 'end']);
          cases.push({ val, body });
        } else if (k.type === 'kw' && k.value === 'otherwise') {
          otherwise = this.parseBlock(['case', 'otherwise', 'end']);
        } else if (k.type === 'kw' && k.value === 'end') break;
        else this.fail(k, 'switch 语句中应为 case/otherwise/end');
      }
      return { type: 'Switch', expr, cases, otherwise, line };
    }
    parseTry() {
      const line = this.next().line;
      const body = this.parseBlock(['catch', 'end']);
      let id = null, catchBody = [];
      const k = this.next();
      if (k.type === 'kw' && k.value === 'catch') {
        const n = this.peek();
        if ((n.type === 'id') && n.line === k.line) { id = n.value; this.p++; }
        else if (n.type === 'cmd' && n.line === k.line && n.args.length === 0) { id = n.value; this.p++; }
        catchBody = this.parseBlock(['end']);
        this.next();
      }
      return { type: 'Try', body, id, catchBody, line };
    }

    // ---------- 表达式 ----------
    parseExpr() { return this.parseOrOr(); }
    parseOrOr() {
      let l = this.parseAndAnd();
      while (this.isOp('||')) { this.p++; l = { type: 'Bin', op: '||', l, r: this.parseAndAnd() }; }
      return l;
    }
    parseAndAnd() {
      let l = this.parseOr();
      while (this.isOp('&&')) { this.p++; l = { type: 'Bin', op: '&&', l, r: this.parseOr() }; }
      return l;
    }
    parseOr() {
      let l = this.parseAnd();
      while (this.isOp('|')) { this.p++; l = { type: 'Bin', op: '|', l, r: this.parseAnd() }; }
      return l;
    }
    parseAnd() {
      let l = this.parseCmp();
      while (this.isOp('&')) { this.p++; l = { type: 'Bin', op: '&', l, r: this.parseCmp() }; }
      return l;
    }
    parseCmp() {
      let l = this.parseRange();
      while (true) {
        const k = this.peek();
        if (k.type === 'op' && (k.value === '==' || k.value === '~=' || k.value === '<' || k.value === '<=' || k.value === '>' || k.value === '>=')) {
          this.p++;
          l = { type: 'Bin', op: k.value, l, r: this.parseRange() };
        } else break;
      }
      return l;
    }
    parseRange() {
      if (this.isOp(':') && this.indexDepth > 0 && (this.isOp(',', 1) || this.isOp(')', 1) || this.isOp('}', 1))) {
        this.p++;
        return { type: 'Colon' };
      }
      const a = this.parseAdd();
      if (this.isOp(':') && !(this.isOp(',', 1) || this.isOp(')', 1))) {
        this.p++;
        const b = this.parseAdd();
        if (this.isOp(':')) {
          this.p++;
          const c = this.parseAdd();
          return { type: 'Range', start: a, step: b, stop: c };
        }
        return { type: 'Range', start: a, step: null, stop: b };
      }
      return a;
    }
    parseAdd() {
      let l = this.parseMul();
      while (true) {
        const k = this.peek();
        if (k.type === 'op' && (k.value === '+' || k.value === '-')) { this.p++; l = { type: 'Bin', op: k.value, l, r: this.parseMul() }; }
        else break;
      }
      return l;
    }
    parseMul() {
      let l = this.parseUnary();
      while (true) {
        const k = this.peek();
        if (k.type === 'op' && (k.value === '*' || k.value === '/' || k.value === '\\' || k.value === '.*' || k.value === './' || k.value === '.\\')) {
          this.p++; l = { type: 'Bin', op: k.value, l, r: this.parseUnary() };
        } else break;
      }
      return l;
    }
    parseUnary() {
      const k = this.peek();
      if (k.type === 'op' && (k.value === '-' || k.value === '+' || k.value === '~')) {
        this.p++;
        const e = this.parseUnary();
        if (k.value === '-' && e.type === 'Num' && !e.neg) return { type: 'Num', value: -e.value, imag: e.imag, neg: true };
        return { type: 'Un', op: k.value, e };
      }
      return this.parsePower();
    }
    parsePower() {
      let base = this.parsePostfix();
      while (this.isOp('^') || this.isOp('.^')) {
        const op = this.next().value;
        const ex = this.parsePowerOperand();
        base = { type: 'Bin', op, l: base, r: ex };
      }
      return base;
    }
    parsePowerOperand() {
      const k = this.peek();
      if (k.type === 'op' && (k.value === '-' || k.value === '+' || k.value === '~')) {
        this.p++;
        return { type: 'Un', op: k.value, e: this.parsePowerOperand() };
      }
      return this.parsePostfix();
    }
    parsePostfix() {
      let e = this.parsePrimary();
      while (true) {
        const k = this.peek();
        if (k.type !== 'op') break;
        if (k.value === '(' && !(k.space && this.inMatrixCtx)) {
          this.p++;
          const args = this.parseArgs(')');
          e = { type: 'Index', obj: e, args, brace: false };
        } else if (k.value === '{' && !k.space) {
          this.p++;
          const args = this.parseArgs('}');
          e = { type: 'Index', obj: e, args, brace: true };
        } else if (k.value === '.' && this.peek(1).type === 'id' || (k.value === '.' && this.peek(1).type === 'kw')) {
          this.p++;
          const name = this.next().value;
          e = { type: 'Field', obj: e, name };
        } else if (k.value === '.' && this.isOp('(', 1)) {
          this.p += 2;
          const save = this.indexDepth; this.indexDepth = 0;
          const dyn = this.parseExpr();
          this.indexDepth = save;
          this.expectOp(')');
          e = { type: 'Field', obj: e, name: null, dyn };
        } else if (k.value === "'" || k.value === ".'") {
          this.p++;
          e = { type: 'Post', op: k.value, e };
        } else break;
      }
      return e;
    }
    parseArgs(close) {
      const args = [];
      this.indexDepth++;
      if (this.isOp(close)) { this.p++; this.indexDepth--; return args; }
      while (true) {
        this.skipNl();
        if (this.isOp(':') && (this.isOp(',', 1) || this.isOp(close, 1))) { this.p++; args.push({ type: 'Colon' }); }
        else args.push(this.parseExpr());
        this.skipNl();
        if (this.isOp(',')) { this.p++; continue; }
        if (this.isOp(close)) { this.p++; break; }
        this.fail(this.peek(), '应为 \',\' 或 \'' + close + '\'');
      }
      this.indexDepth--;
      return args;
    }
    skipNl() { while (this.peek().type === 'nl') this.p++; }

    parsePrimary() {
      const k = this.next();
      switch (k.type) {
        case 'num': return { type: 'Num', value: k.value, imag: !!k.imag };
        case 'str': return { type: 'Str', value: k.value, dq: !!k.dq };
        case 'id': return { type: 'Id', name: k.value, line: k.line };
        case 'cmd':
          // 在表达式位置出现的命令记号（极少见），回退为标识符
          this.fail(k, '无效的表达式');
          break;
        case 'kw':
          if (k.value === 'end' && this.indexDepth > 0) return { type: 'End' };
          this.fail(k, '非预期的关键字');
          break;
        case 'op':
          if (k.value === '(') {
            const save = this.indexDepth; this.indexDepth = 0;
            const saveM = this.inMatrixCtx; this.inMatrixCtx = false;
            const e = this.parseExpr();
            this.indexDepth = save; this.inMatrixCtx = saveM;
            this.expectOp(')');
            return { type: 'Paren', e };
          }
          if (k.value === '[') return this.parseMatrix(']', 'Matrix');
          if (k.value === '{') return this.parseMatrix('}', 'CellLit');
          if (k.value === '@') {
            if (this.isOp('(')) {
              this.p++;
              const params = [];
              while (!this.isOp(')')) {
                const a = this.next();
                if (a.type === 'id') params.push(a.value);
                else if (a.type === 'op' && a.value === '~') params.push('~');
                else if (!(a.type === 'op' && a.value === ',')) this.fail(a, '匿名函数参数无效');
              }
              this.p++;
              const saveD = this.indexDepth; this.indexDepth = 0;
              const saveM = this.inMatrixCtx; this.inMatrixCtx = false;
              const body = this.parseExpr();
              this.indexDepth = saveD; this.inMatrixCtx = saveM;
              return { type: 'Anon', params, body };
            }
            const id = this.next();
            if (id.type !== 'id') this.fail(id, '函数句柄无效');
            let name = id.value;
            while (this.isOp('.') && this.peek(1).type === 'id') { this.p++; name += '.' + this.next().value; }
            return { type: 'FHandle', name };
          }
          if (k.value === ':' ) return { type: 'Colon' };
          this.fail(k, '无效的表达式');
          break;
        default:
          this.fail(k, '表达式不完整');
      }
    }
    parseMatrix(close, type) {
      const rows = [];
      let cur = [];
      const saveD = this.indexDepth; this.indexDepth = saveD; // 允许 [x(end) 1]
      const saveM = this.inMatrixCtx; this.inMatrixCtx = true;
      while (true) {
        const k = this.peek();
        if (k.type === 'op' && k.value === close) { this.p++; break; }
        if (k.type === 'eof') this.fail(k, '缺少 \'' + close + '\'');
        if (k.type === 'op' && k.value === ',') { this.p++; continue; }
        if (k.type === 'op' && k.value === ';') { this.p++; rows.push(cur); cur = []; continue; }
        if (k.type === 'nl') { this.p++; rows.push(cur); cur = []; continue; }
        cur.push(this.parseExpr());
      }
      rows.push(cur);
      this.inMatrixCtx = saveM;
      return { type, rows: rows.filter((r) => r.length > 0) };
    }
  }

  // ---------- 反解析（用于显示函数句柄）----------
  const PREC = { '||': 1, '&&': 2, '|': 3, '&': 4, '==': 5, '~=': 5, '<': 5, '<=': 5, '>': 5, '>=': 5, ':': 6, '+': 7, '-': 7, '*': 8, '/': 8, '\\': 8, '.*': 8, './': 8, '.\\': 8, '^': 10, '.^': 10 };
  function unparse(e) {
    switch (e.type) {
      case 'Num': {
        let s = numStr(e.value);
        return e.imag ? s + 'i' : s;
      }
      case 'Str': return e.dq ? '"' + e.value.replace(/"/g, '""') + '"' : "'" + e.value.replace(/'/g, "''") + "'";
      case 'Id': return e.name;
      case 'Colon': return ':';
      case 'End': return 'end';
      case 'Paren': return '(' + unparse(e.e) + ')';
      case 'Bin': {
        const p = PREC[e.op];
        const wrap = (x, right) => {
          const s = unparse(x);
          if (x.type === 'Bin' && (PREC[x.op] < p || (right && PREC[x.op] === p))) return '(' + s + ')';
          if (x.type === 'Range') return '(' + s + ')';
          return s;
        };
        return wrap(e.l, false) + e.op + wrap(e.r, true);
      }
      case 'Un': {
        const s = unparse(e.e);
        return e.op + (e.e.type === 'Bin' || e.e.type === 'Range' ? '(' + s + ')' : s);
      }
      case 'Post': return unparse(e.e) + e.op;
      case 'Range': return unparse(e.start) + ':' + (e.step ? unparse(e.step) + ':' : '') + unparse(e.stop);
      case 'Index': return unparse(e.obj) + (e.brace ? '{' : '(') + e.args.map(unparse).join(',') + (e.brace ? '}' : ')');
      case 'Field': return unparse(e.obj) + '.' + (e.name !== null ? e.name : '(' + unparse(e.dyn) + ')');
      case 'Matrix': return '[' + e.rows.map((r) => r.map(unparse).join(',')).join(';') + ']';
      case 'CellLit': return '{' + e.rows.map((r) => r.map(unparse).join(',')).join(';') + '}';
      case 'Anon': return '@(' + e.params.join(',') + ')' + unparse(e.body);
      case 'FHandle': return '@' + e.name;
      default: return '?';
    }
  }
  function numStr(v) {
    if (Number.isInteger(v)) return String(v);
    let s = String(v);
    if (s.length > 12) s = String(+v.toPrecision(12));
    return s;
  }

  function parse(src) {
    const toks = ML.tokenize(src);
    const p = new Parser(toks);
    return p.parseProgram();
  }

  ML.Parser = Parser;
  ML.parse = parse;
  ML.unparse = unparse;
})(typeof self !== 'undefined' ? self : globalThis);
