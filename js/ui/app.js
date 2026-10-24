/* MatWeb - 界面主程序 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('matweb.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('matweb.' + k, JSON.stringify(v)); } catch (e) { /* 存储不可用 */ } }
  };

  // ======================= 文件系统 =======================
  const FS = {
    files: store.get('fs', null),
    init() {
      if (!this.files || typeof this.files !== 'object') { this.files = Object.assign({}, ML.DEFAULT_FILES); this.save(); }
    },
    save() { store.set('fs', this.files); },
    list() { return Object.keys(this.files).sort((a, b) => a.localeCompare(b)); },
    read(n) { return this.files[n]; },
    write(n, c) { this.files[n] = c; this.save(); },
    remove(n) { delete this.files[n]; this.save(); },
    has(n) { return Object.prototype.hasOwnProperty.call(this.files, n); }
  };
  FS.init();

  // ======================= 状态栏 =======================
  const status = (text, cls) => { const s = $('#status'); s.textContent = text; s.className = 'state' + (cls ? ' ' + cls : ''); };

  // 小方块文件图标（脚本=蓝，函数=绿，数据=橙）与标签关闭按钮
  const isFunctionSrc = (src) => /^\s*(%[^\n]*\n\s*)*function\b/.test(src || '');
  function docIcon(name, src) {
    const isM = /\.m$/.test(name), isFn = isM && isFunctionSrc(src);
    return el('span', 'doc-ico' + (isM ? (isFn ? ' fn' : '') : ' data'), isM ? (isFn ? 'fx' : 'M') : name.split('.').pop().toUpperCase().slice(0, 1));
  }
  function closeBtn(title, onClick) {
    const x = el('span', 'close'); x.title = title;
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    x.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return x;
  }

  // ======================= 命令行窗口 =======================
  const Console = {
    out: $('#consoleOut'), input: $('#consoleIn'), box: $('#console'), promptEl: $('#prompt'),
    history: store.get('history', []), hpos: -1, draft: '', inputMode: false, nodes: 0,
    append(text, cls) {
      if (!text) return;
      const last = this.out.lastChild;
      if (last && last.dataset.cls === (cls || 'out') && cls !== 'echo') last.textContent += text;
      else {
        const span = el('span', cls || 'out');
        span.dataset.cls = cls || 'out';
        span.textContent = text;
        this.out.appendChild(span);
        if (++this.nodes > 3000) { for (let i = 0; i < 500 && this.out.firstChild; i++) this.out.removeChild(this.out.firstChild); this.nodes -= 500; }
      }
      this.scroll();
    },
    echo(cmd) {
      const span = el('span', 'echo'); span.dataset.cls = 'echo';
      const p = el('span', 'p', '>> '); span.appendChild(p);
      span.appendChild(document.createTextNode(cmd.split('\n').join('\n   ') + '\n'));
      this.out.appendChild(span); this.nodes++;
      this.scroll();
    },
    info(text) { this.append(text, 'info'); },
    clear() { this.out.innerHTML = ''; this.nodes = 0; },
    scroll() { requestAnimationFrame(() => { this.box.scrollTop = this.box.scrollHeight; }); },
    autosize() { this.input.style.height = 'auto'; this.input.style.height = this.input.scrollHeight + 'px'; },
    submit() {
      const code = this.input.value;
      if (this.inputMode) {
        this.inputMode = false;
        this.promptEl.textContent = '>>'; this.promptEl.classList.remove('input-mode');
        this.input.value = ''; this.autosize();
        engine.respondInput(code);
        return;
      }
      this.input.value = ''; this.autosize();
      this.hpos = -1;
      if (code.trim()) {
        if (this.history[this.history.length - 1] !== code) { this.history.push(code); if (this.history.length > 500) this.history.shift(); store.set('history', this.history); Tools.renderHistory(); }
      }
      this.exec(code);
    },
    exec(code, echoText) {
      if (echoText !== null) this.echo(echoText !== undefined ? echoText : code);
      if (!code.trim()) return;
      engine.run(code, { source: 'console', code });
    },
    // 在输出中插入一个可点击的操作
    action(label, onClick) {
      const a = el('span', 'action', label);
      a.dataset.cls = 'action';
      a.addEventListener('click', onClick);
      this.out.appendChild(a);
      this.out.appendChild(document.createTextNode('\n'));
      this.nodes += 2;
      this.scroll();
    },
    startInput(prompt) {
      this.inputMode = true;
      this.append(prompt || '', 'out');
      this.promptEl.textContent = '输入'; this.promptEl.classList.add('input-mode');
      this.input.focus();
    },
    nav(dir) {
      if (!this.history.length) return;
      if (this.hpos === -1) { this.draft = this.input.value; this.hpos = this.history.length; }
      const prefix = this.draft;
      let p = this.hpos;
      do { p += dir; } while (p >= 0 && p < this.history.length && prefix && !this.history[p].startsWith(prefix));
      if (p < 0) return;
      if (p >= this.history.length) { this.hpos = -1; this.input.value = this.draft; }
      else { this.hpos = p; this.input.value = this.history[p]; }
      this.autosize();
      const n = this.input.value.length; this.input.setSelectionRange(n, n);
    }
  };

  // ---------- 自动补全 ----------
  const Completion = {
    box: $('#completion'), items: [], sel: 0, start: 0, active: false,
    candidates(prefix) {
      const names = new Set();
      for (const v of Workspace.vars) names.add(v.name);
      for (const k of Object.keys(ML.builtins)) if (!/^\d/.test(k)) names.add(k);
      for (const f of FS.list()) if (/\.m$/.test(f)) names.add(f.replace(/\.m$/, ''));
      for (const k of ML.KEYWORDS) names.add(k);
      const lp = prefix.toLowerCase();
      return [...names].filter((n) => n.toLowerCase().startsWith(lp)).sort((a, b) => (a.startsWith(prefix) === b.startsWith(prefix) ? a.length - b.length || a.localeCompare(b) : a.startsWith(prefix) ? -1 : 1)).slice(0, 60);
    },
    trigger() {
      const ta = Console.input, pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const m = /[A-Za-z_][\w.]*$/.exec(before);
      if (!m) return false;
      const prefix = m[0];
      const list = this.candidates(prefix);
      if (!list.length) return true;
      this.start = pos - prefix.length;
      if (list.length === 1) { this.apply(list[0]); return true; }
      // 公共前缀
      let common = list[0];
      for (const s of list) { let i = 0; while (i < common.length && i < s.length && common[i].toLowerCase() === s[i].toLowerCase()) i++; common = common.slice(0, i); }
      if (common.length > prefix.length) { this.apply(common, true); }
      this.show(list);
      return true;
    },
    show(list) {
      this.items = list; this.sel = 0; this.active = true;
      this.box.innerHTML = '';
      list.forEach((n, i) => {
        const li = el('li', i === 0 ? 'sel' : '');
        li.appendChild(el('span', '', n));
        const d = ML.docs[n];
        if (d) li.appendChild(el('small', '', d.desc.slice(0, 26)));
        else if (Workspace.vars.some((v) => v.name === n)) li.appendChild(el('small', '', '变量'));
        li.addEventListener('mousedown', (e) => { e.preventDefault(); this.apply(n); this.hide(); });
        this.box.appendChild(li);
      });
      const row = Console.input.getBoundingClientRect(), host = Console.box.getBoundingClientRect();
      this.box.style.left = Math.max(4, row.left - host.left + 4) + 'px';
      const top = row.bottom - host.top + Console.box.scrollTop + 2;
      this.box.hidden = false;
      const h = Math.min(this.box.scrollHeight, 220);
      this.box.style.top = (top + h > Console.box.scrollTop + host.height ? top - h - row.height - 4 : top) + 'px';
    },
    hide() { this.active = false; this.box.hidden = true; },
    move(d) { if (!this.items.length) return; this.box.children[this.sel].classList.remove('sel'); this.sel = (this.sel + d + this.items.length) % this.items.length; const li = this.box.children[this.sel]; li.classList.add('sel'); li.scrollIntoView({ block: 'nearest' }); },
    apply(name, keepOpen) {
      const ta = Console.input; const pos = ta.selectionStart;
      ta.value = ta.value.slice(0, this.start) + name + ta.value.slice(pos);
      const np = this.start + name.length; ta.setSelectionRange(np, np);
      if (!keepOpen) this.hide();
    }
  };

  Console.input.addEventListener('keydown', (e) => {
    if (Completion.active) {
      if (e.key === 'ArrowDown') { e.preventDefault(); Completion.move(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); Completion.move(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); Completion.apply(Completion.items[Completion.sel]); return; }
      if (e.key === 'Escape') { Completion.hide(); return; }
      Completion.hide();
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Console.submit(); return; }
    if (e.key === 'Tab') { e.preventDefault(); if (!Completion.trigger()) { /* 无补全 */ } return; }
    const ta = Console.input;
    if (e.key === 'ArrowUp' && ta.value.lastIndexOf('\n', ta.selectionStart - 1) < 0) { e.preventDefault(); Console.nav(-1); return; }
    if (e.key === 'ArrowDown' && ta.value.indexOf('\n', ta.selectionStart) < 0) { e.preventDefault(); Console.nav(1); return; }
    if (e.key === 'Escape') { ta.value = ''; Console.autosize(); Console.hpos = -1; return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && engine.busy && ta.selectionStart === ta.selectionEnd) { e.preventDefault(); stopRun(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); Console.clear(); }
  });
  Console.input.addEventListener('input', () => Console.autosize());
  Console.input.addEventListener('blur', () => setTimeout(() => Completion.hide(), 150));
  Console.box.addEventListener('mouseup', () => { if (!getSelection().toString()) Console.input.focus(); });

  // ======================= 工作区 =======================
  const Workspace = {
    vars: [],
    render(vars) {
      this.vars = vars || [];
      const tb = $('#wsTable tbody');
      tb.innerHTML = '';
      $('#wsEmpty').hidden = this.vars.length > 0;
      for (const v of this.vars) {
        const tr = el('tr');
        tr.appendChild(el('td', '', v.name));
        const tdv = el('td', '', v.value); tdv.title = v.value; tr.appendChild(tdv);
        tr.appendChild(el('td', '', v.size));
        tr.appendChild(el('td', '', v.cls));
        tr.title = '双击在命令行中显示 ' + v.name;
        tr.addEventListener('dblclick', () => Console.exec(v.name));
        tb.appendChild(tr);
      }
    }
  };

  // ======================= 编辑器 =======================
  const Editor = {
    docs: [], active: -1, editor: null,
    init() {
      this.editor = new ML.CodeEditor($('#editorHost'));
      this.editor.on('change', () => { const d = this.doc(); if (d) { d.content = this.editor.getValue(); this.renderTabs(); this.persist(); } });
      this.editor.on('cursor', (p) => { $('#cursorPos').textContent = this.doc() ? '行 ' + p.line + '，列 ' + p.col : ''; });
      this.editor.on('save', () => this.save());
      this.editor.on('run', () => runCurrent());
      this.editor.on('runSection', () => runSection());
      this.emptyEl = el('div', 'editor-empty');
      this.emptyEl.innerHTML = '<svg class="empty-ico"><use href="#i-file"/></svg><div>没有打开的文件</div>';
      const b = el('button', 'btn btn-primary'); b.innerHTML = '<svg class="ico"><use href="#i-plus"/></svg><span>新建脚本</span>';
      b.onclick = () => this.newDoc(); this.emptyEl.appendChild(b);
      $('#editorHost').appendChild(this.emptyEl);
      // 恢复上次打开的文件
      const saved = store.get('tabs', null);
      if (saved && saved.docs && saved.docs.length) {
        for (const d of saved.docs) this.docs.push({ name: d.name, content: d.content, saved: FS.has(d.name) ? FS.read(d.name) : null });
        this.select(Math.min(saved.active || 0, this.docs.length - 1));
      } else if (FS.has('welcome.m')) this.open('welcome.m');
      else this.select(-1);
    },
    doc() { return this.docs[this.active]; },
    persist() { store.set('tabs', { docs: this.docs.map((d) => ({ name: d.name, content: d.content })), active: this.active }); },
    isDirty(d) { return d.saved === null || d.content !== d.saved; },
    renderTabs() {
      const host = $('#editorTabs'); host.innerHTML = '';
      this.docs.forEach((d, i) => {
        const t = el('button', 'tab' + (i === this.active ? ' active' : ''));
        t.appendChild(docIcon(d.name, d.content));
        t.appendChild(el('span', '', d.name));
        if (this.isDirty(d)) { const dot = el('span', 'dirty'); dot.title = '未保存'; t.appendChild(dot); }
        t.appendChild(closeBtn('关闭', () => this.close(i)));
        t.addEventListener('click', () => this.select(i));
        t.title = d.name;
        host.appendChild(t);
      });
      const d = this.doc();
      const info = $('#editorInfo');
      info.textContent = d ? (this.isDirty(d) ? '未保存' : '已保存') : '';
      info.className = 'state-tag' + (d ? (this.isDirty(d) ? ' unsaved' : ' saved') : '');
    },
    select(i) {
      const cur = this.doc(); if (cur) cur.content = this.editor.getValue();
      this.active = i;
      const d = this.doc();
      this.emptyEl.hidden = !!d;
      this.editor.el.style.visibility = d ? 'visible' : 'hidden';
      if (d) this.editor.setValue(d.content);
      this.renderTabs(); this.persist();
      Files.render();
    },
    open(name) {
      const i = this.docs.findIndex((d) => d.name === name);
      if (i >= 0) { this.select(i); return; }
      const content = FS.has(name) ? FS.read(name) : '';
      this.docs.push({ name, content, saved: FS.has(name) ? content : null });
      this.select(this.docs.length - 1);
    },
    newDoc(content, name) {
      if (!name) { let k = 1; do { name = 'untitled' + (k === 1 ? '' : k) + '.m'; k++; } while (FS.has(name) || this.docs.some((d) => d.name === name)); }
      this.docs.push({ name, content: content || '', saved: null });
      this.select(this.docs.length - 1);
      this.editor.focus();
    },
    close(i) {
      const d = this.docs[i];
      if (this.isDirty(d) && d.content.trim() && !confirm('“' + d.name + '”尚未保存，确定关闭吗？')) return;
      this.docs.splice(i, 1);
      if (this.active >= this.docs.length) this.active = this.docs.length - 1;
      else if (i < this.active) this.active--;
      this.active = Math.min(this.active, this.docs.length - 1);
      const a = this.active; this.active = -2;
      this.select(a);
    },
    save(silent) {
      const d = this.doc(); if (!d) return null;
      d.content = this.editor.getValue();
      if (d.saved === null && /^untitled\d*\.m$/.test(d.name) && !silent) {
        // 根据函数名建议文件名
        const m = /^\s*function\s+(?:\[[^\]]*\]\s*=\s*|\w+\s*=\s*)?(\w+)/m.exec(d.content);
        let name = prompt('保存为（文件名需以 .m 结尾）：', m ? m[1] + '.m' : d.name);
        if (!name) return null;
        name = name.trim(); if (!/\.\w+$/.test(name)) name += '.m';
        if (!/^[A-Za-z][\w]*\.\w+$/.test(name)) { alert('文件名无效：须以字母开头，只能包含字母、数字和下划线。'); return null; }
        if (FS.has(name) && !confirm('文件 ' + name + ' 已存在，是否覆盖？')) return null;
        d.name = name;
      }
      FS.write(d.name, d.content);
      d.saved = d.content;
      engine.setFile(d.name, d.content);
      this.renderTabs(); this.persist(); Files.render();
      status('已保存 ' + d.name, 'ok');
      return d.name;
    },
    fileChanged(name, content) {
      for (const d of this.docs) if (d.name === name && !this.isDirty(d)) { d.content = content; d.saved = content; if (this.doc() === d) this.editor.setValue(content); }
      this.renderTabs();
    }
  };

  // ======================= 文件面板 =======================
  const Files = {
    sel: null,
    render() {
      const ul = $('#fileList'); ul.innerHTML = '';
      const names = FS.list();
      if (!names.length) { const li = el('li', 'muted', '（空）'); ul.appendChild(li); return; }
      for (const n of names) {
        const li = el('li', n === this.sel ? 'sel' : '');
        const isM = /\.m$/.test(n);
        const isFn = isM && isFunctionSrc(FS.read(n));
        const ic = el('span', 'file-ic' + (isM ? (isFn ? ' fn' : '') : ' data'), isM ? (isFn ? 'fx' : 'M') : n.split('.').pop().toUpperCase().slice(0, 3));
        li.appendChild(ic);
        li.appendChild(el('span', '', n));
        li.title = isFn ? '函数文件：可在命令行中按函数名调用' : isM ? '脚本：双击打开，在命令行输入 ' + n.replace(/\.m$/, '') + ' 运行' : '数据文件';
        li.addEventListener('click', () => { this.sel = n; this.render(); });
        li.addEventListener('dblclick', () => { if (/\.(m|csv|txt|dat|json)$/i.test(n)) Editor.open(n); });
        ul.appendChild(li);
      }
    },
    newFile() {
      let name = prompt('新文件名（例如 myfun.m 或 data.csv）：', 'newfile.m');
      if (!name) return;
      name = name.trim(); if (!/\.\w+$/.test(name)) name += '.m';
      if (!/^[A-Za-z][\w]*\.\w+$/.test(name)) { alert('文件名无效：须以字母开头，只能包含字母、数字和下划线。'); return; }
      if (FS.has(name)) { Editor.open(name); return; }
      const base = name.replace(/\.m$/, '');
      const content = /\.m$/.test(name) ? '% ' + base + '.m\n' : '';
      FS.write(name, content); engine.setFile(name, content);
      this.sel = name; this.render(); Editor.open(name);
    },
    remove() {
      const n = this.sel; if (!n) { alert('请先在列表中选择一个文件。'); return; }
      if (!confirm('确定删除文件 ' + n + ' 吗？此操作无法撤销。')) return;
      FS.remove(n); engine.deleteFile(n); this.sel = null; this.render();
      const i = Editor.docs.findIndex((d) => d.name === n); if (i >= 0) { Editor.docs[i].saved = null; Editor.renderTabs(); }
    },
    download() {
      const n = this.sel; if (!n) { alert('请先在列表中选择一个文件。'); return; }
      const blob = new Blob([FS.read(n)], { type: 'text/plain;charset=utf-8' });
      const a = el('a'); a.href = URL.createObjectURL(blob); a.download = n; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    upload(fileList) {
      for (const f of fileList) {
        const reader = new FileReader();
        reader.onload = () => {
          const name = f.name.replace(/[^\w.]/g, '_');
          FS.write(name, String(reader.result)); engine.setFile(name, String(reader.result));
          this.sel = name; this.render();
          Console.info('已导入文件 ' + name + '\n');
        };
        reader.readAsText(f);
      }
    }
  };

  // ======================= 图窗 =======================
  const Figures = {
    map: new Map(), active: null,
    host: $('#figHost'),
    get(id) {
      let f = this.map.get(id);
      if (f) return f;
      const canvas = el('canvas');
      this.host.appendChild(canvas);
      const r = new ML.FigureRenderer(canvas);
      f = { id, canvas, r, fig: null };
      this.map.set(id, f);
      this.bindMouse(f);
      return f;
    },
    update(fig, current) {
      const f = this.get(fig.id);
      f.fig = fig;
      if (current || this.active === null || !this.map.has(this.active)) this.select(fig.id, true);
      if (this.active === fig.id) { this.fit(f); f.r.setFigure(fig); }
      else f.pending = true;
      this.renderTabs();
    },
    fit(f) { const w = this.host.clientWidth, h = this.host.clientHeight; if (f.w !== w || f.h !== h) { f.w = w; f.h = h; f.r.resize(w, h); } },
    select(id, noRender) {
      this.active = id;
      for (const [k, f] of this.map) f.canvas.classList.toggle('active', k === id);
      const f = this.map.get(id);
      $('#figEmpty').hidden = !!f;
      if (f && !noRender) { this.fit(f); if (f.fig) f.r.setFigure(f.fig); f.pending = false; }
      this.renderTabs();
    },
    close(id) {
      const f = this.map.get(id); if (!f) return;
      f.canvas.remove(); this.map.delete(id);
      if (this.active === id) { const ids = [...this.map.keys()]; this.active = null; if (ids.length) this.select(ids[ids.length - 1]); else $('#figEmpty').hidden = false; }
      this.renderTabs();
    },
    renderTabs() {
      const host = $('#figTabs'); host.innerHTML = '';
      for (const [id, f] of this.map) {
        const name = f.fig && f.fig.name ? (f.fig.numberTitle === false ? f.fig.name : '图窗 ' + id + ': ' + f.fig.name) : '图窗 ' + id;
        const t = el('button', 'tab' + (id === this.active ? ' active' : ''));
        const ic = el('span', 'doc-ico'); ic.innerHTML = '<svg viewBox="0 0 24 24"><path d="m4 17 5-6 4 4 7-8"/></svg>';
        t.appendChild(ic);
        t.appendChild(el('span', '', name));
        t.appendChild(closeBtn('关闭图窗', () => Console.exec('close(' + id + ')')));
        t.addEventListener('click', () => { this.select(id); Console.exec('figure(' + id + ');', null); });
        host.appendChild(t);
      }
      if (!this.map.size) host.appendChild(el('span', 'tab active placeholder', '图窗'));
    },
    resizeAll() { const f = this.map.get(this.active); if (f) { this.fit(f); } },
    bindMouse(f) {
      let drag = null;
      const pos = (e) => { const b = f.canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
      f.canvas.addEventListener('mousedown', (e) => {
        const [x, y] = pos(e);
        const a3 = f.r.axes3DAt(x, y);
        if (a3) { drag = { x, y, hid: a3.ax.hid, view: (f.r.viewOverride.get(a3.ax.hid) || a3.view).slice() }; e.preventDefault(); }
      });
      window.addEventListener('mousemove', (e) => {
        if (!drag) return;
        const [x, y] = pos(e);
        const az = drag.view[0] - (x - drag.x) * 0.5, el2 = Math.max(-90, Math.min(90, drag.view[1] + (y - drag.y) * 0.5));
        f.r.viewOverride.set(drag.hid, [az, el2]);
        f.r.render();
        $('#figStatus').textContent = '方位角 ' + az.toFixed(1) + '°，仰角 ' + el2.toFixed(1) + '°';
      });
      window.addEventListener('mouseup', () => { drag = null; });
      f.canvas.addEventListener('mousemove', (e) => {
        if (drag) return;
        const [x, y] = pos(e);
        const d = f.r.dataAt(x, y);
        if (d) $('#figStatus').textContent = 'x = ' + fmtNum(d.x) + '    y = ' + fmtNum(d.y);
        else if (f.r.axes3DAt(x, y)) $('#figStatus').textContent = '按住鼠标拖动可旋转三维视图';
        else $('#figStatus').textContent = '';
      });
      f.canvas.addEventListener('mouseleave', () => { if (!drag) $('#figStatus').textContent = ''; });
    },
    exportPNG(id, name) {
      const f = this.map.get(id === undefined || id === null ? this.active : id);
      if (!f) { alert('没有可导出的图窗。'); return; }
      const fname = (name || 'figure' + f.id + '.png').replace(/\.(jpg|jpeg|pdf|eps|svg|fig)$/i, '.png');
      f.canvas.toBlob((blob) => { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = /\.png$/i.test(fname) ? fname : fname + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    }
  };
  const fmtNum = (v) => (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : (+v.toPrecision(6)).toString());
  new ResizeObserver(() => Figures.resizeAll()).observe($('#figHost'));

  // ======================= 工具面板 =======================
  const Tools = {
    init() {
      document.querySelectorAll('#toolTabs .tab').forEach((t) => t.addEventListener('click', () => {
        document.querySelectorAll('#toolTabs .tab').forEach((x) => x.classList.toggle('active', x === t));
        document.querySelectorAll('.tool-pane').forEach((p) => p.classList.toggle('active', p.id === 'tool-' + t.dataset.tool));
        store.set('tool', t.dataset.tool);
      }));
      const last = store.get('tool', 'ai');
      const tab = document.querySelector('#toolTabs .tab[data-tool="' + last + '"]'); if (tab) tab.click();
      $('#formulaSearch').addEventListener('input', () => this.renderFormulas());
      $('#funcSearch').addEventListener('input', () => this.renderFunctions());
      $('#btnClearHistory').addEventListener('click', () => { if (confirm('清空所有命令历史？')) { Console.history = []; store.set('history', []); this.renderHistory(); } });
      this.collapsed = new Set(store.get('collapsed', []));
      this.renderFormulas(); this.renderFunctions(); this.renderHistory();
    },
    renderFormulas() {
      const q = $('#formulaSearch').value.trim().toLowerCase();
      const host = $('#formulaList'); host.innerHTML = '';
      let total = 0;
      for (const cat of ML.FORMULAS) {
        const items = cat.items.filter((f) => !q || (f.n + f.d + f.c + cat.cat).toLowerCase().indexOf(q) >= 0);
        if (!items.length) continue;
        total += items.length;
        const collapsed = !q && this.collapsed.has(cat.cat);
        const title = el('div', 'cat-title' + (collapsed ? ' collapsed' : ''));
        const tl = el('span'); tl.appendChild(el('span', 'chev', '▾')); tl.appendChild(document.createTextNode(cat.cat));
        title.appendChild(tl);
        title.appendChild(el('span', 'count', items.length + ' 条'));
        title.addEventListener('click', () => { if (this.collapsed.has(cat.cat)) this.collapsed.delete(cat.cat); else this.collapsed.add(cat.cat); store.set('collapsed', [...this.collapsed]); this.renderFormulas(); });
        host.appendChild(title);
        if (collapsed) continue;
        for (const f of items) {
          const box = el('div', 'formula');
          const head = el('div', 'f-name');
          head.appendChild(el('span', '', f.n));
          const acts = el('div', 'f-actions');
          const bRun = el('button', 'btn btn-sm btn-ghost'); bRun.title = '在命令行中运行示例代码';
          bRun.innerHTML = '<svg class="ico fill"><use href="#i-play"/></svg>运行';
          bRun.onclick = () => Console.exec(f.c, '% 公式库：' + f.n + '\n' + f.c);
          const bIns = el('button', 'btn btn-sm btn-ghost', '插入'); bIns.title = '把代码放入命令行，修改后按回车运行';
          bIns.onclick = () => { Console.input.value = f.c; Console.autosize(); Console.input.focus(); };
          const bCode = el('button', 'btn btn-sm btn-ghost', '代码'); bCode.title = '查看示例代码';
          bCode.onclick = () => box.classList.toggle('open');
          acts.append(bRun, bIns, bCode);
          head.appendChild(acts);
          box.appendChild(head);
          const tex = el('div', 'f-tex'); tex.innerHTML = f.f; box.appendChild(tex);
          box.appendChild(el('div', 'f-desc', f.d));
          const pre = el('pre', '', f.c); pre.title = '双击在编辑器中打开';
          pre.addEventListener('dblclick', () => Editor.newDoc('% ' + f.n + '\n' + f.c + '\n'));
          box.appendChild(pre);
          host.appendChild(box);
        }
      }
      if (!total) host.appendChild(el('div', 'empty', '没有匹配的公式'));
    },
    renderFunctions() {
      const q = $('#funcSearch').value.trim().toLowerCase();
      const host = $('#funcList'); host.innerHTML = '';
      const cats = {};
      for (const name of Object.keys(ML.docs)) {
        const d = ML.docs[name];
        if (q && (name + d.desc + d.cat + d.syn).toLowerCase().indexOf(q) < 0) continue;
        (cats[d.cat] = cats[d.cat] || []).push(name);
      }
      const order = ['常量', '矩阵构造', '矩阵操作', '矩阵信息', '初等数学', '三角函数', '指数对数', '取整', '复数', '数论', '特殊函数', '线性代数', '数据分析', '统计', '概率分布', '集合运算', '多项式', '插值', '微积分', '优化', '微分方程', '信号处理', '几何', '字符串', '进制转换', '数据类型', '逻辑运算', '运算符', '函数', '绘图', '显示', '工作区', '文件', '计时', '错误处理', '系统'];
      const keys = Object.keys(cats).sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
      let total = 0;
      for (const c of keys) {
        const names = cats[c].sort();
        total += names.length;
        const title = el('div', 'cat-title');
        title.appendChild(el('span', '', c)); title.appendChild(el('span', 'count', names.length + ' 个'));
        host.appendChild(title);
        for (const n of names) {
          const d = ML.docs[n];
          const item = el('div', 'fn-item');
          item.appendChild(el('b', '', n));
          item.appendChild(el('span', '', d.desc));
          item.addEventListener('click', () => {
            const next = item.nextSibling;
            if (next && next.classList && next.classList.contains('fn-detail')) { next.remove(); return; }
            const det = el('div', 'fn-detail');
            det.appendChild(el('div', '', d.desc));
            for (const s of d.syn.split(/,\s(?=[\w[])/)) det.appendChild(el('code', '', s));
            const b1 = el('button', 'btn btn-sm', '插入到命令行'); b1.onclick = () => { Console.input.value += n + '('; Console.autosize(); Console.input.focus(); };
            const b2 = el('button', 'btn btn-sm btn-ghost', 'help ' + n); b2.onclick = () => Console.exec('help ' + n);
            const acts = el('div', 'fn-actions'); acts.append(b1, b2);
            det.appendChild(acts);
            item.after(det);
          });
          host.appendChild(item);
        }
      }
      if (!total) host.appendChild(el('div', 'empty', '没有匹配的函数'));
      $('#funcSearch').placeholder = '搜索 ' + Object.keys(ML.docs).length + ' 个函数，如：eig、积分、plot…';
    },
    renderHistory() {
      const ul = $('#historyList'); ul.innerHTML = '';
      const h = Console.history.slice(-200).reverse();
      if (!h.length) { ul.appendChild(el('li', 'muted', '暂无历史命令')); return; }
      for (const cmd of h) {
        const li = el('li', '', cmd.length > 120 ? cmd.slice(0, 120) + '…' : cmd.replace(/\n/g, ' ⏎ '));
        li.title = '单击放入命令行，双击直接运行';
        li.addEventListener('click', () => { Console.input.value = cmd; Console.autosize(); Console.input.focus(); });
        li.addEventListener('dblclick', () => Console.exec(cmd));
        ul.appendChild(li);
      }
    }
  };

  // ======================= 运行控制 =======================
  let runningFile = null;
  function runCurrent() {
    const d = Editor.doc();
    if (!d) return;
    if (!/\.m$/.test(d.name)) { alert('只能运行 .m 文件。'); return; }
    // 运行前自动保存（未命名脚本以当前名称保存）
    Editor.save(true);
    Editor.editor.markError(0);
    const base = d.name.replace(/\.m$/, '');
    runningFile = { name: d.name, offset: 0 };
    const isFn = /^\s*(%[^\n]*\n\s*)*function\b/.test(d.content);
    if (isFn) Console.info('提示：' + d.name + ' 是函数文件，可在命令行中以 ' + base + '(参数...) 的形式调用。\n');
    Console.echo(base);
    engine.run('run(\'' + base + '\')', { source: 'file', file: d.name });
  }
  function runSection() {
    const d = Editor.doc(); if (!d) return;
    const sec = Editor.editor.currentSection();
    Editor.editor.markError(0);
    runningFile = { name: d.name, offset: sec.startLine - 1, section: true };
    Console.echo('% 运行节（' + d.name + ' 第 ' + sec.startLine + ' 行起）');
    engine.run(sec.code, { source: 'section', file: d.name });
  }
  function stopRun() { engine.interrupt(); status('已请求停止…'); }

  // ======================= 引擎 =======================
  let lastErr = '';
  let capture = null; // AI 助手运行代码时收集输出
  const engine = new ML.EngineClient({
    onReady(info) {
      const m = info.mode === 'worker' ? '后台引擎 (Web Worker)' + (info.hasInput ? ' · 支持中断与 input' : '') : '主线程模式';
      $('#engineMode').textContent = m;
      if (info.mode === 'local') {
        $('#engineMode').title = '通过 file:// 打开时浏览器不允许后台线程。运行 node server.js 并访问 http://localhost:8000 可获得更好的体验（可中断、动画、input）。';
        Console.info('提示：当前以主线程模式运行（单次运行限时 60 秒，动画会在结束后一次显示）。建议在项目目录运行 node server.js 后访问 http://localhost:8000。\n');
      }
      status('就绪', 'ok');
    },
    onOut: (t) => { Console.append(t, 'out'); if (capture) capture.text += t; },
    onErr: (t) => { lastErr += t; Console.append(t, 'err'); if (capture) capture.text += t; },
    onWarn: (t) => { Console.append(t, 'warn'); if (capture) capture.text += t; },
    onClc: () => Console.clear(),
    onFigure: (fig, cur) => { Figures.update(fig, cur); if (capture) capture.figs.add(fig.id); },
    onCloseFigure: (id) => Figures.close(id),
    onWorkspace: (vars) => Workspace.render(vars),
    onSaveFile: (name, content) => { FS.write(name, content); Files.render(); Editor.fileChanged(name, content); },
    onDeleteFile: (name) => { FS.remove(name); Files.render(); },
    onOpenFile: (name) => {
      if (!name) { Editor.newDoc(); return; }
      if (!FS.has(name)) { FS.write(name, ''); engine.setFile(name, ''); Files.render(); }
      Editor.open(name);
    },
    onExportFigure: (id, name) => Figures.exportPNG(id, name),
    onInput: (prompt) => Console.startInput(prompt),
    onBusy(busy, meta, elapsed) {
      $('#btnStop').disabled = !busy;
      $('#busyIndicator').hidden = !busy;
      if (busy) { lastErr = ''; capture = meta.capture ? { text: '', figs: new Set() } : null; status('正在运行…', 'run'); return; }
      const cap = capture; capture = null;
      if (meta.onDone) meta.onDone({ output: cap ? cap.text : '', error: !!lastErr, figures: cap ? [...cap.figs] : [], elapsed });
      // 命令行出错时提供“让 AI 修复”的入口
      if (lastErr && meta.source === 'console' && meta.code && ML.AI) {
        const code = meta.code, errText = lastErr;
        Console.action('让 AI 助手解释并修复这个错误', () => ML.AI.ask('我在命令行运行了下面的代码，出现了错误。请解释原因并给出修复后的代码（可以直接运行验证）。\n\n```matlab\n' + code + '\n```\n\n错误信息：\n```\n' + errText.trim() + '\n```'));
      }
      if (Console.inputMode) { Console.inputMode = false; $('#prompt').textContent = '>>'; $('#prompt').classList.remove('input-mode'); }
      // 定位错误行
      if (lastErr && runningFile && Editor.doc() && Editor.doc().name === runningFile.name) {
        const base = runningFile.name.replace(/\.m$/, '');
        let m = new RegExp('出错 ' + base + '[^\\n]*第 (\\d+) 行').exec(lastErr) || (runningFile.section ? /第 (\d+) 行/.exec(lastErr) : null);
        if (m) Editor.editor.markError(+m[1] + (runningFile.section ? runningFile.offset : 0));
      }
      runningFile = null;
      status(lastErr ? '运行出错' : '就绪 · 用时 ' + (elapsed < 1000 ? elapsed + ' ms' : (elapsed / 1000).toFixed(2) + ' s'), lastErr ? 'err' : 'ok');
    }
  });

  // ======================= 工具栏 =======================
  function bindToolbar() {
    $('#btnNew').onclick = () => Editor.newDoc('');
    $('#btnSave').onclick = () => Editor.save();
    $('#btnRun').onclick = () => runCurrent();
    $('#btnSection').onclick = () => runSection();
    $('#btnStop').onclick = () => stopRun();
    $('#btnClc').onclick = () => Console.clear();
    $('#btnClear').onclick = () => Console.exec('clear');
    $('#btnClearWs').onclick = () => Console.exec('clear');
    $('#btnCloseFigs').onclick = () => Console.exec('close all');
    $('#btnNewFile').onclick = () => Files.newFile();
    $('#btnUpload').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = (e) => { Files.upload(e.target.files); e.target.value = ''; };
    $('#btnDownload').onclick = () => Files.download();
    $('#btnDeleteFile').onclick = () => Files.remove();
    $('#btnFigExport').onclick = () => Figures.exportPNG();
    $('#btnFigClose').onclick = () => { if (Figures.active !== null) Console.exec('close(' + Figures.active + ')'); };
    $('#btnFigReset').onclick = () => { const f = Figures.map.get(Figures.active); if (f) { f.r.viewOverride.clear(); f.r.render(); } };
    $('#btnFigMax').onclick = () => { $('#panelFigures').classList.toggle('maximized'); setTimeout(() => Figures.resizeAll(), 30); };
    const sel = $('#selExamples');
    ML.EXAMPLES.forEach((ex, i) => { const o = el('option', '', ex.title); o.value = String(i); sel.appendChild(o); });
    sel.onchange = () => { const ex = ML.EXAMPLES[+sel.value]; sel.value = ''; if (!ex) return; Editor.docs.some((d) => d.name === ex.name) ? Editor.open(ex.name) : Editor.newDoc(ex.code, ex.name); status('已打开示例：' + ex.title + '（按 F5 运行）'); };
    const fmt = $('#selFormat');
    fmt.onchange = () => Console.exec('format ' + fmt.value);
    $('#btnTheme').onclick = () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next; store.set('theme', next);
      syncThemeIcon();
      Editor.editor.render();
    };
    syncThemeIcon();
    $('#btnHelp').onclick = () => showHelp();
    $('#modalClose').onclick = () => { $('#modal').hidden = true; };
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').hidden = true; });
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'F5') { e.preventDefault(); runCurrent(); }
      else if (mod && (e.key === 'n' || e.key === 'N') && !e.shiftKey) { e.preventDefault(); Editor.newDoc(''); }
      else if (mod && (e.key === 's' || e.key === 'S') && document.activeElement !== Editor.editor.ta) { e.preventDefault(); Editor.save(); }
      else if (e.key === 'Escape' && !$('#modal').hidden) $('#modal').hidden = true;
      else if (e.key === 'Escape' && $('#panelFigures').classList.contains('maximized')) { $('#panelFigures').classList.remove('maximized'); Figures.resizeAll(); }
    });
    window.addEventListener('beforeunload', (e) => {
      const d = Editor.doc(); if (d) d.content = Editor.editor.getValue();
      Editor.persist();
      if (Editor.docs.some((x) => Editor.isDirty(x) && x.saved !== null)) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ======================= 分隔条 =======================
  function bindSplitters() {
    const root = document.documentElement;
    const sizes = store.get('layout', {});
    if (sizes.left) root.style.setProperty('--left-w', sizes.left + 'px');
    if (sizes.right) root.style.setProperty('--right-w', sizes.right + 'px');
    for (const id of ['panelFiles', 'panelEditor', 'panelFigures']) if (sizes[id]) $('#' + id).style.flexBasis = sizes[id] + 'px';
    document.querySelectorAll('.vsplit').forEach((sp) => {
      sp.addEventListener('mousedown', (e) => {
        e.preventDefault(); sp.classList.add('drag');
        const side = sp.dataset.side;
        const startX = e.clientX;
        const startW = side === 'left' ? $('#left').offsetWidth : $('#right').offsetWidth;
        const move = (ev) => {
          const dx = ev.clientX - startX;
          const w = Math.max(160, Math.min(window.innerWidth * 0.6, side === 'left' ? startW + dx : startW - dx));
          root.style.setProperty(side === 'left' ? '--left-w' : '--right-w', w + 'px');
          sizes[side] = w;
          Figures.resizeAll();
        };
        const up = () => { sp.classList.remove('drag'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); store.set('layout', sizes); };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      });
    });
    document.querySelectorAll('.hsplit').forEach((sp) => {
      sp.addEventListener('mousedown', (e) => {
        e.preventDefault(); sp.classList.add('drag');
        const panel = $('#' + sp.dataset.prev);
        const col = panel.parentElement;
        const startY = e.clientY, startH = panel.offsetHeight;
        const move = (ev) => {
          const h = Math.max(70, Math.min(col.clientHeight - 90, startH + ev.clientY - startY));
          panel.style.flexBasis = h + 'px';
          sizes[panel.id] = h;
          Figures.resizeAll();
        };
        const up = () => { sp.classList.remove('drag'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); store.set('layout', sizes); };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      });
    });
  }

  // ======================= 帮助 =======================
  function showHelp() {
    $('#modalTitle').textContent = 'MatWeb 使用帮助';
    $('#modalBody').innerHTML = `
      <p>MatWeb 是一个运行在浏览器中的类 MATLAB 数值计算环境，内置 <b>${Object.keys(ML.builtins).length}</b> 个函数，支持 MATLAB 语言的大部分语法：矩阵运算、索引与切片、控制流、函数与匿名函数、元胞数组、结构体、绘图等。</p>
      <h3>界面</h3>
      <ul>
        <li><b>编辑器</b>：编写脚本（.m 文件）。<kbd>F5</kbd> 运行整个脚本，<kbd>Ctrl</kbd>+<kbd>Enter</kbd> 运行当前节（以 <code>%%</code> 分隔），<kbd>Ctrl</kbd>+<kbd>S</kbd> 保存，<kbd>Ctrl</kbd>+<kbd>/</kbd> 注释/取消注释，<kbd>Tab</kbd> 缩进。</li>
        <li><b>命令行窗口</b>：输入命令后按 <kbd>Enter</kbd> 执行，<kbd>Shift</kbd>+<kbd>Enter</kbd> 换行，<kbd>↑</kbd>/<kbd>↓</kbd> 浏览历史，<kbd>Tab</kbd> 自动补全，<kbd>Ctrl</kbd>+<kbd>C</kbd> 停止运行，<kbd>Ctrl</kbd>+<kbd>L</kbd> 清屏。</li>
        <li><b>当前文件夹</b>：文件保存在浏览器本地存储中。函数文件（以 <code>function</code> 开头）可在命令行按函数名直接调用。支持导入/下载 .m、.csv 文件。</li>
        <li><b>工作区</b>：显示所有变量，双击查看变量内容。</li>
        <li><b>图窗</b>：显示绘图结果；二维图鼠标悬停显示坐标，三维图按住鼠标拖动旋转；可导出 PNG。</li>
        <li><b>公式库</b>：按类别整理的常用数学、物理、金融公式，每条都可一键运行或插入命令行修改。</li>
      </ul>
      <h3>快速上手</h3>
      <pre>A = [1 2; 3 4];          % 矩阵
x = A \\ [5; 6]           % 解线性方程组
[V, D] = eig(A)          % 特征值
f = @(t) exp(-t).*sin(5*t);
integral(f, 0, Inf)      % 数值积分
t = linspace(0, 5, 300);
plot(t, f(t)); grid on   % 绘图
[X, Y, Z] = peaks(40); surf(X, Y, Z)</pre>
      <h3>主要功能</h3>
      <table>
        <tr><th>类别</th><th>函数示例</th></tr>
        <tr><td>矩阵</td><td>zeros ones eye rand magic linspace reshape repmat find sort unique cat kron</td></tr>
        <tr><td>线性代数</td><td>det inv rank eig svd lu qr chol pinv null orth expm norm cond rref</td></tr>
        <tr><td>数据分析</td><td>sum mean median std var max min cumsum diff histcounts cov corrcoef prctile</td></tr>
        <tr><td>数值方法</td><td>roots polyfit polyval interp1 spline fzero fsolve fminsearch fminbnd integral integral2 ode45 fft filter</td></tr>
        <tr><td>绘图</td><td>plot plot3 scatter bar histogram pie stem area surf mesh contour contourf quiver imagesc fplot fimplicit polarplot subplot legend colorbar</td></tr>
        <tr><td>字符串</td><td>sprintf fprintf num2str str2double strsplit strjoin strrep regexp regexprep upper lower</td></tr>
        <tr><td>数据类型</td><td>cell struct cellfun arrayfun fieldnames containers.Map int8…uint64 logical char</td></tr>
        <tr><td>文件</td><td>save load csvread csvwrite readmatrix writematrix fopen fprintf fgetl fclose</td></tr>
      </table>
      <p>在命令行输入 <code>help</code> 查看全部函数列表，输入 <code>help 函数名</code> 查看具体用法。</p>
      <h3>运行模式</h3>
      <p>直接双击 index.html 打开时，计算在主线程执行（单次运行限时 60 秒）。在项目目录执行 <code>node server.js</code> 并访问 <code>http://localhost:8000</code>，计算将在后台线程运行，支持随时中断、实时动画（<code>drawnow</code>/<code>pause</code>）和 <code>input</code> 交互输入。</p>
      <h3>与 MATLAB 的差异</h3>
      <p>仅支持二维数组（不支持三维及以上数组）；不支持符号计算、Simulink、类定义（classdef）与工具箱专有函数；双引号字符串按字符向量处理。</p>`;
    $('#modal').hidden = false;
  }

  // ======================= 启动 =======================
  // 主题按钮：浅色显示月亮，深色显示太阳
  function syncThemeIcon() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#btnTheme use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    $('#btnTheme').title = dark ? '切换到浅色主题' : '切换到深色主题';
  }

  function boot() {
    Editor.init();
    Files.render();
    Tools.init();
    Figures.renderTabs();
    bindToolbar();
    bindSplitters();
    Console.info('MatWeb 1.0 —— 浏览器中的类 MATLAB 数值计算环境。输入 help 查看函数列表，右上方“示例程序”中有更多演示。\n');
    engine.start(FS.files);
    Console.input.focus();
  }
  // 以捕获输出的方式运行代码（供 AI 助手使用）：返回 {output, error, figures, elapsed, cancelled}
  function runCapture(code, echoText) {
    return new Promise((resolve) => {
      Console.echo(echoText || code);
      engine.run(code, { source: 'ai', capture: true, onDone: resolve });
    });
  }
  function showTool(name) {
    const tab = document.querySelector('#toolTabs .tab[data-tool="' + name + '"]');
    if (tab) tab.click();
  }
  ML.App = { Console, Editor, Files, Figures, Workspace, engine, FS, runCapture, showTool, status };
  boot();
})(typeof self !== 'undefined' ? self : globalThis);
