/* MatWeb - 代码编辑器（textarea + 高亮层） */
(function (G) {
  'use strict';
  const ML = G.ML;
  const LINE_H = 20;
  const OPENERS = /^(if|for|parfor|while|switch|try|function|else|elseif|case|otherwise|catch|do)\b/;

  class CodeEditor {
    constructor(host) {
      this.host = host;
      const el = document.createElement('div');
      el.className = 'editor';
      el.innerHTML = '<div class="gutter"><div class="gutter-inner"></div></div><div class="code"><div class="curline"></div><pre aria-hidden="true"></pre><textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="代码编辑器"></textarea></div>';
      host.appendChild(el);
      this.el = el;
      this.ta = el.querySelector('textarea');
      this.pre = el.querySelector('pre');
      this.gutterInner = el.querySelector('.gutter-inner');
      this.curline = el.querySelector('.curline');
      this.listeners = { change: [], cursor: [], save: [], run: [], runSection: [] };
      this.errLine = 0;
      this.pending = false;
      this.ta.addEventListener('input', () => { this.schedule(); this.emit('change'); });
      this.ta.addEventListener('scroll', () => this.syncScroll());
      for (const ev of ['keyup', 'click', 'select']) this.ta.addEventListener(ev, () => this.updateCursor());
      this.ta.addEventListener('keydown', (e) => this.onKey(e));
      this.render();
    }
    on(ev, cb) { this.listeners[ev].push(cb); }
    emit(ev, arg) { for (const cb of this.listeners[ev]) cb(arg); }
    getValue() { return this.ta.value; }
    setValue(v) { this.ta.value = v; this.errLine = 0; this.render(); this.ta.scrollTop = 0; this.updateCursor(); }
    focus() { this.ta.focus(); }
    schedule() {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => { this.pending = false; this.render(); });
    }
    render() {
      const text = this.ta.value;
      const lines = ML.highlight(text);
      this.pre.innerHTML = lines.join('\n') + '\n\n';
      const n = lines.length;
      if (this.lineCount !== n || this.errDirty) {
        let g = '';
        for (let i = 1; i <= n; i++) g += '<div' + (i === this.errLine ? ' class="err"' : '') + '>' + i + '</div>';
        this.gutterInner.innerHTML = g;
        this.lineCount = n;
        this.errDirty = false;
      }
      this.syncScroll();
      this.updateCursor();
    }
    syncScroll() {
      const st = this.ta.scrollTop, sl = this.ta.scrollLeft;
      this.pre.scrollTop = st; this.pre.scrollLeft = sl;
      this.pre.style.transform = '';
      if (this.pre.scrollTop !== st) this.pre.style.transform = 'translate(' + (-sl + this.pre.scrollLeft) + 'px,' + (-st + this.pre.scrollTop) + 'px)';
      this.gutterInner.style.transform = 'translateY(' + (-st) + 'px)';
      this.updateCurLineBox();
    }
    caretLine() { return this.ta.value.slice(0, this.ta.selectionStart).split('\n').length; }
    updateCursor() {
      const before = this.ta.value.slice(0, this.ta.selectionStart);
      const line = before.split('\n').length, col = before.length - before.lastIndexOf('\n');
      if (line !== this.curLineNo) {
        const kids = this.gutterInner.children;
        if (this.curLineNo && kids[this.curLineNo - 1]) kids[this.curLineNo - 1].classList.remove('cur');
        if (kids[line - 1]) kids[line - 1].classList.add('cur');
        this.curLineNo = line;
      }
      this.updateCurLineBox();
      this.emit('cursor', { line, col });
    }
    updateCurLineBox() {
      const line = this.curLineNo || 1;
      this.curline.style.top = (8 + (line - 1) * LINE_H - this.ta.scrollTop) + 'px';
    }
    markError(line) { this.errLine = line || 0; this.errDirty = true; this.render(); if (line) this.gotoLine(line); }
    gotoLine(line) {
      const lines = this.ta.value.split('\n');
      let pos = 0; for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
      this.ta.focus();
      this.ta.setSelectionRange(pos, pos);
      const top = (line - 1) * LINE_H;
      if (top < this.ta.scrollTop || top > this.ta.scrollTop + this.ta.clientHeight - 2 * LINE_H) this.ta.scrollTop = Math.max(0, top - this.ta.clientHeight / 3);
      this.updateCursor();
    }
    insert(text) {
      this.ta.focus();
      // execCommand 保留撤销历史
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok) { this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, 'end'); this.schedule(); this.emit('change'); }
    }
    // 当前节（%% 分隔）
    currentSection() {
      const lines = this.ta.value.split('\n');
      const cur = this.caretLine() - 1;
      let a = cur, b = cur;
      while (a > 0 && !/^\s*%%/.test(lines[a])) a--;
      if (!/^\s*%%/.test(lines[a])) a = 0;
      b = cur + 1;
      while (b < lines.length && !/^\s*%%/.test(lines[b])) b++;
      return { code: lines.slice(a, b).join('\n'), startLine: a + 1 };
    }
    selectedLinesRange() {
      const v = this.ta.value, s = this.ta.selectionStart, e = this.ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (le < 0) le = v.length;
      return [ls, le];
    }
    transformLines(fn) {
      const [ls, le] = this.selectedLinesRange();
      const v = this.ta.value;
      const block = v.slice(ls, le);
      const nb = block.split('\n').map(fn).join('\n');
      this.ta.setSelectionRange(ls, le);
      this.insert(nb);
      this.ta.setSelectionRange(ls, ls + nb.length);
    }
    onKey(e) {
      const ta = this.ta;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Tab') {
        e.preventDefault();
        if (ta.selectionStart !== ta.selectionEnd && ta.value.slice(ta.selectionStart, ta.selectionEnd).indexOf('\n') >= 0) {
          if (e.shiftKey) this.transformLines((l) => l.replace(/^( {1,4}|\t)/, ''));
          else this.transformLines((l) => '    ' + l);
        } else if (e.shiftKey) this.transformLines((l) => l.replace(/^( {1,4}|\t)/, ''));
        else this.insert('    ');
        return;
      }
      if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const v = ta.value, s = ta.selectionStart;
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const line = v.slice(ls, s);
        let indent = /^\s*/.exec(line)[0];
        const t = line.trim();
        if (OPENERS.test(t) && !/\bend\s*;?\s*(%.*)?$/.test(t)) indent += '    ';
        this.insert('\n' + indent);
        return;
      }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.emit('save'); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); this.emit('runSection'); return; }
      if (e.key === 'F5') { e.preventDefault(); this.emit('run'); return; }
      if (mod && (e.key === '/' || e.key === 'r' || e.key === 'R' || e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        const [ls, le] = this.selectedLinesRange();
        const lines = ta.value.slice(ls, le).split('\n');
        let comment;
        if (e.key === 'r' || e.key === 'R') comment = true;
        else if (e.key === 't' || e.key === 'T') comment = false;
        else comment = !lines.filter((l) => l.trim()).every((l) => /^\s*%/.test(l));
        this.transformLines((l) => (comment ? (l.trim() ? '% ' + l : l) : l.replace(/^(\s*)% ?/, '$1')));
        return;
      }
      // 输入 end/else 等时自动减少缩进
      if (e.key === 'd' && !mod) {
        const v = ta.value, s = ta.selectionStart;
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const before = v.slice(ls, s);
        if (/^\s{4,}en$/.test(before) && (v[s] === undefined || v[s] === '\n')) {
          e.preventDefault();
          ta.setSelectionRange(ls, s);
          this.insert(before.replace(/^ {4}/, '') + 'd');
        }
      }
    }
  }
  ML.CodeEditor = CodeEditor;
})(typeof self !== 'undefined' ? self : globalThis);
