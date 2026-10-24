/* MatWeb - 词法分析器
 * 处理 MATLAB 的特殊语法：矩阵内空格分隔、转置与字符串的区分、命令语法、续行、块注释
 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const err = ML.err;

  const KEYWORDS = new Set(['if', 'elseif', 'else', 'end', 'for', 'parfor', 'while', 'switch', 'case', 'otherwise',
    'try', 'catch', 'function', 'return', 'break', 'continue', 'global', 'persistent', 'do', 'until']);
  // 这些关键字不会触发命令语法
  const OPS3 = ['...', '.^\'', '==='];
  const OPS2 = ['==', '~=', '!=', '<=', '>=', '&&', '||', '.*', './', '.\\', '.^', ".'", '++', '--', '+=', '-=', '*=', '/='];
  const OPS1 = '+-*/\\^<>=&|~!()[]{},;:.@\'';

  function isIdStart(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
  function isIdChar(c) { return isIdStart(c) || (c >= '0' && c <= '9'); }
  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isSpace(c) { return c === ' ' || c === '\t' || c === '\r'; }

  function tokenize(src) {
    const toks = [];
    const n = src.length;
    let i = 0, line = 1;
    const stack = []; // 括号栈：'(' '[' '{' 或 'anon'
    let spaceBefore = false;

    const top = () => stack[stack.length - 1];
    const inMatrix = () => top() === '[' || top() === '{';
    const prev = () => toks[toks.length - 1];
    const push = (type, value, extra) => {
      const t = { type, value, line, space: spaceBefore };
      if (extra) Object.assign(t, extra);
      toks.push(t);
      spaceBefore = false;
      return t;
    };
    function prevEndsValue() {
      const p = prev();
      if (!p) return false;
      if (p.type === 'num' || p.type === 'str' || p.type === 'id') return true;
      if (p.type === 'kw') return p.value === 'end';
      if (p.type === 'op') {
        if (p.anon) return false;
        return p.value === ')' || p.value === ']' || p.value === '}' || p.value === "'" || p.value === ".'";
      }
      return false;
    }
    function atStmtStart() {
      if (stack.length) return false;
      const p = prev();
      if (!p) return true;
      if (p.type === 'nl') return true;
      if (p.type === 'op' && (p.value === ';' || p.value === ',')) return true;
      return false;
    }
    // 矩阵内：空白之后是否开始一个新元素
    function startsNewElement(j) {
      const c = src[j], c2 = src[j + 1];
      if (c === undefined) return false;
      if (isIdStart(c) || isDigit(c) || c === '"' || c === "'" || c === '(' || c === '[' || c === '{' || c === '@') return true;
      if (c === '.' && isDigit(c2)) return true;
      if ((c === '+' || c === '-') && c2 !== undefined && !isSpace(c2) && c2 !== '=' && c2 !== '\n') {
        // 例如 [1 -2] 是两个元素；[a - b] 是一个表达式
        return true;
      }
      if ((c === '~' || c === '!') && c2 !== '=') return true;
      return false;
    }

    while (i < n) {
      const c = src[i];

      // 续行 ...
      if (c === '.' && src.startsWith('...', i)) {
        while (i < n && src[i] !== '\n') i++;
        i++; line++;
        spaceBefore = true;
        continue;
      }
      // 注释
      if (c === '%' || (c === '#' && !inMatrix())) {
        // 块注释 %{ ... %}
        if (src.startsWith('%{', i)) {
          const lineStart = src.lastIndexOf('\n', i - 1) + 1;
          const before = src.slice(lineStart, i).trim();
          let lineEnd = src.indexOf('\n', i); if (lineEnd < 0) lineEnd = n;
          const after = src.slice(i + 2, lineEnd).trim();
          if (before === '' && after === '') {
            let depth = 0, j = i;
            while (j < n) {
              let le = src.indexOf('\n', j); if (le < 0) le = n;
              const ln = src.slice(j, le).trim();
              if (ln === '%{') depth++;
              else if (ln === '%}') { depth--; if (depth === 0) { j = le; break; } }
              j = le + 1; line++;
            }
            i = j;
            continue;
          }
        }
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '\n') {
        if (inMatrix()) {
          const p = prev();
          if (p && !(p.type === 'op' && (p.value === ';' || p.value === '[' || p.value === '{' || p.value === ','))) push('op', ';', { row: true });
        } else if (stack.length === 0) {
          push('nl', '\n');
        }
        i++; line++;
        spaceBefore = true;
        continue;
      }
      if (isSpace(c)) {
        while (i < n && isSpace(src[i])) i++;
        spaceBefore = true;
        if (inMatrix() && prevEndsValue() && startsNewElement(i)) {
          push('op', ',', { auto: true });
        }
        continue;
      }

      // 命令语法：hold on / format long / clear x y
      if (isIdStart(c) && atStmtStart()) {
        let j = i; while (j < n && isIdChar(src[j])) j++;
        const word = src.slice(i, j);
        if (!KEYWORDS.has(word) && j < n && isSpace(src[j])) {
          let k = j; while (k < n && isSpace(src[k])) k++;
          const d = src[k], d2 = src[k + 1];
          let isCmd = false;
          if (d !== undefined && (isIdStart(d) || isDigit(d) || d === "'")) isCmd = true;
          // "x = 1"、"x (1)"、"a + b" 等已通过首字符排除；"a b = 1" 这类写法极少见
          if (isCmd && (isIdStart(d) || isDigit(d))) {
            let e = k; while (e < n && isIdChar(src[e])) e++;
            while (e < n && isSpace(src[e])) e++;
            if (src[e] === '=' && src[e + 1] !== '=') isCmd = false;
            if (src[e] === '(' && d2 === undefined) isCmd = false;
          }
          if (isCmd) {
            // 读取参数直到行尾 / ; / , / %
            const args = [];
            let p = k, cur = '', inQ = false, has = false;
            while (p < n) {
              const ch = src[p];
              if (inQ) {
                if (ch === "'") { if (src[p + 1] === "'") { cur += "'"; p += 2; continue; } inQ = false; p++; continue; }
                if (ch === '\n') break;
                cur += ch; p++; continue;
              }
              if (ch === '\n' || ch === ';' || ch === ',' || ch === '%') break;
              if (ch === "'") { inQ = true; has = true; p++; continue; }
              if (isSpace(ch)) { if (has || cur) { args.push(cur); cur = ''; has = false; } p++; continue; }
              cur += ch; p++;
            }
            if (has || cur) args.push(cur);
            push('cmd', word, { args });
            i = p;
            continue;
          }
        }
      }

      // 数字
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        let j = i;
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j = i + 2; while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
          push('num', parseInt(src.slice(i + 2, j), 16));
          i = j; continue;
        }
        while (j < n && isDigit(src[j])) j++;
        if (src[j] === '.' && !(src[j + 1] === '*' || src[j + 1] === '/' || src[j + 1] === '\\' || src[j + 1] === '^' || src[j + 1] === "'") && !src.startsWith('...', j)) {
          j++; while (j < n && isDigit(src[j])) j++;
        }
        if ((src[j] === 'e' || src[j] === 'E' || src[j] === 'd' || src[j] === 'D') &&
          (isDigit(src[j + 1]) || ((src[j + 1] === '+' || src[j + 1] === '-') && isDigit(src[j + 2])))) {
          j += 2; while (j < n && isDigit(src[j])) j++;
        }
        const text = src.slice(i, j).replace(/[dD]/, 'e');
        let imag = false;
        if ((src[j] === 'i' || src[j] === 'j' || src[j] === 'I' || src[j] === 'J') && !isIdChar(src[j + 1] || '')) { imag = true; j++; }
        push('num', parseFloat(text), { imag });
        i = j;
        continue;
      }
      // 标识符 / 关键字
      if (isIdStart(c)) {
        let j = i; while (j < n && isIdChar(src[j])) j++;
        const word = src.slice(i, j);
        if (KEYWORDS.has(word) && !(word === 'end' && stack.length > 0 && top() !== 'anon')) push('kw', word);
        else if (KEYWORDS.has(word) && word === 'end') push('kw', 'end', { indexEnd: true });
        else push('id', word);
        i = j;
        continue;
      }
      // 字符串 / 转置
      if (c === "'") {
        const isTranspose = prevEndsValue() && !(inMatrix() && spaceBefore);
        if (isTranspose) { push('op', "'"); i++; continue; }
        let j = i + 1, s = '';
        while (true) {
          if (j >= n || src[j] === '\n') err('字符向量未正确终止（第 ' + line + ' 行）。');
          if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
          s += src[j++];
        }
        push('str', s);
        i = j + 1;
        continue;
      }
      if (c === '"') {
        let j = i + 1, s = '';
        while (true) {
          if (j >= n || src[j] === '\n') err('字符串未正确终止（第 ' + line + ' 行）。');
          if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
          s += src[j++];
        }
        push('str', s, { dq: true });
        i = j + 1;
        continue;
      }
      // 运算符
      let op = null;
      for (const o of OPS2) if (src.startsWith(o, i)) { op = o; break; }
      if (op === "'" ) op = null;
      if (op && (op === '++' || op === '--')) op = null; // 不支持自增
      if (op === '+=' || op === '-=' || op === '*=' || op === '/=') {
        // 仅在语句层支持复合赋值
        if (stack.length) op = null;
      }
      if (!op && OPS1.indexOf(c) >= 0) op = c;
      if (!op) err('无效的字符 \'' + c + '\'（第 ' + line + ' 行）。');
      if (op === '!=') op = '~=';
      if (op === '!') op = '~';
      if (op === '(' || op === '[' || op === '{') {
        const p = prev();
        const isAnon = op === '(' && p && p.type === 'op' && p.value === '@';
        stack.push(isAnon ? 'anon' : op);
        push('op', op);
        i += op.length;
        continue;
      }
      if (op === ')' || op === ']' || op === '}') {
        const t = stack.pop();
        // 去掉矩阵末尾的多余分隔符
        if ((op === ']' || op === '}')) {
          const p = prev();
          if (p && p.type === 'op' && (p.value === ',' || p.value === ';') && (p.auto || p.row)) toks.pop();
        }
        const tk = push('op', op);
        if (t === 'anon') tk.anon = true;
        i += op.length;
        continue;
      }
      push('op', op);
      i += op.length;
    }
    push('nl', '\n');
    push('eof', null);
    return toks;
  }

  ML.tokenize = tokenize;
  ML.KEYWORDS = KEYWORDS;
})(typeof self !== 'undefined' ? self : globalThis);
