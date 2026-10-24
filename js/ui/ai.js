/* MatWeb - AI 助手（Claude）
 * 用户在浏览器中填写自己的 Anthropic API Key，请求从浏览器直接发往 Anthropic（不经过任何其它服务器）。
 * 通过官方 SDK（@anthropic-ai/sdk，按需从 CDN 加载）进行流式对话，Claude 可以调用下列工具操作 MatWeb：
 * 运行代码、查看工作区、读取编辑器与文件、写入文件、查看图窗截图、检索函数参考。
 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const App = ML.App;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
  const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
  const MAX_STEPS = 24;          // 单轮最多的模型调用次数
  const MAX_OUTPUT_CHARS = 30000; // 返回给模型的单次输出上限
  const MODELS = [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: '推荐：能力强，适合大多数任务', fallback: true },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: '速度更快，费用更低', fallback: true },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: '最快、最便宜，适合简单问题', fallback: false },
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', note: '最强，适合复杂推理（费用最高）', fallback: true }
  ];
  const EFFORTS = [{ id: 'low', name: '低' }, { id: 'medium', name: '中' }, { id: 'high', name: '高' }];

  // ======================= 设置 =======================
  const Settings = {
    load() {
      let s = {};
      try { s = JSON.parse(localStorage.getItem('matweb.ai') || '{}'); } catch (e) { s = {}; }
      this.model = MODELS.some((m) => m.id === s.model) ? s.model : 'claude-opus-5-5';
      this.effort = EFFORTS.some((x) => x.id === s.effort) ? s.effort : 'medium';
      this.baseURL = typeof s.baseURL === 'string' ? s.baseURL : '';
      this.autoRun = s.autoRun !== false;
      this.remember = s.remember !== false;
      try { this.key = localStorage.getItem('matweb.ai.key') || sessionStorage.getItem('matweb.ai.key') || ''; } catch (e) { this.key = ''; }
    },
    save() {
      try {
        localStorage.setItem('matweb.ai', JSON.stringify({ model: this.model, effort: this.effort, baseURL: this.baseURL, autoRun: this.autoRun, remember: this.remember }));
        localStorage.removeItem('matweb.ai.key'); sessionStorage.removeItem('matweb.ai.key');
        if (this.key) (this.remember ? localStorage : sessionStorage).setItem('matweb.ai.key', this.key);
      } catch (e) { /* 存储不可用时仅在内存中保留 */ }
    },
    modelInfo() { return MODELS.find((m) => m.id === this.model) || MODELS[0]; },
    officialEndpoint() { return !this.baseURL || /^https:\/\/api\.anthropic\.com\/?$/.test(this.baseURL.trim()); }
  };
  Settings.load();

  // ======================= SDK =======================
  let sdkPromise = null;
  function loadSDK() {
    if (!sdkPromise) {
      sdkPromise = import(SDK_URL).then((m) => m.default || m.Anthropic).catch((e) => { sdkPromise = null; throw e; });
    }
    return sdkPromise;
  }
  async function makeClient() {
    const Anthropic = await loadSDK();
    const opts = { apiKey: Settings.key, dangerouslyAllowBrowser: true, maxRetries: 2 };
    if (Settings.baseURL.trim()) opts.baseURL = Settings.baseURL.trim().replace(/\/+$/, '');
    return { Anthropic, client: new Anthropic(opts) };
  }

  // ======================= 提示词与工具 =======================
  const SYSTEM = `You are the AI assistant built into MatWeb, a MATLAB-like numerical computing environment that runs entirely in the user's browser. You help with MATLAB tasks: computation, linear algebra, numerical methods, data analysis, plotting, writing and debugging scripts and functions, and explaining math.

About the environment:
- It interprets a large subset of the MATLAB language: matrices, indexing, control flow, functions and anonymous functions, cell arrays, structs, containers.Map, integer types, complex numbers.
- Arrays are 2-D only (no N-D arrays). There is no symbolic math (syms), no classdef, no Simulink, and no toolbox functions beyond what search_functions lists. Double-quoted strings behave like char vectors.
- Plotting is supported (plot, plot3, scatter, bar, histogram, pie, stem, area, errorbar, surf, mesh, contour, contourf, quiver, imagesc, fplot, fimplicit, polarplot, subplot, legend, colorbar, colormap, view, axis, text, animatedline and more).
- Code you run with run_matlab executes in the user's base workspace and appears in their Command Window; variables persist between calls, and figures appear in their Figures panel.

How to work:
- For anything that needs computation or a plot, write MATLAB code and run it with run_matlab instead of working numbers out in your head, then read the output and fix any errors.
- If you are not sure a function exists here, check with search_functions before relying on it.
- After making a plot you can call view_figure to see it and check that it looks right.
- When the user asks for a program, script or function, save it with write_file so it opens in their editor; keep quick calculations in run_matlab.
- Leave the user's existing variables, figures and files alone unless the task calls for changing them (avoid clear all / close all on their behalf).
- Reply in the user's language (usually Chinese). Keep answers concise and show final code in \`\`\`matlab blocks when it helps.`;

  const TOOLS = [
    {
      name: 'run_matlab',
      description: "Run MATLAB code in the user's MatWeb session (base workspace) and return the Command Window output, including any error messages. Variables persist between calls. Figures created by the code appear in the user's Figures panel; the result lists which figures were updated.",
      input_schema: { type: 'object', properties: { code: { type: 'string', description: 'MATLAB code to execute.' } }, required: ['code'] }
    },
    {
      name: 'get_workspace',
      description: "List the variables in the user's workspace with their size, class and a short value preview. Use run_matlab to print full values.",
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'read_editor',
      description: "Read the file that is currently open in the user's code editor (file name and full text, including unsaved changes), plus the names of the other open tabs.",
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'list_files',
      description: "List the files in the user's current folder (.m scripts and functions, data files such as .csv).",
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'read_file',
      description: "Read the full text of a file in the user's current folder.",
      input_schema: { type: 'object', properties: { name: { type: 'string', description: 'File name, e.g. myfun.m or data.csv' } }, required: ['name'] }
    },
    {
      name: 'write_file',
      description: "Create or overwrite a file in the user's current folder and open it in the editor. Use it for scripts and functions the user asked for. A function file must be named after its main function (function y = foo(x) goes in foo.m). The user can then run it or call the function from the Command Window.",
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'File name: letters, digits and underscores, starting with a letter, with an extension such as .m or .csv' },
          content: { type: 'string', description: 'Full file content.' }
        },
        required: ['name', 'content']
      }
    },
    {
      name: 'view_figure',
      description: 'Get a PNG image of a figure window to check what a plot looks like. Defaults to the current figure.',
      input_schema: { type: 'object', properties: { figure: { type: 'integer', description: 'Figure number (optional).' } } }
    },
    {
      name: 'search_functions',
      description: 'Search the built-in function reference of this environment by name or keyword (English or Chinese). Returns matching functions with syntax and description. Use it to check whether a MATLAB function is supported here.',
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
    }
  ];
  const TOOL_TITLES = { run_matlab: '运行代码', get_workspace: '查看工作区', read_editor: '读取编辑器', list_files: '列出文件', read_file: '读取文件', write_file: '写入文件', view_figure: '查看图窗', search_functions: '检索函数' };

  // 校验工具输入（流式工具参数不经服务器校验，必须在执行前检查）
  function validate(name, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return '参数必须是对象';
    const str = (k) => typeof input[k] === 'string';
    switch (name) {
      case 'run_matlab': return str('code') && input.code.trim() ? null : 'code 必须是非空字符串';
      case 'read_file': return str('name') ? null : 'name 必须是字符串';
      case 'write_file':
        if (!str('name') || !str('content')) return 'name 和 content 必须是字符串';
        if (!/^[A-Za-z]\w*\.(m|csv|txt|dat|json)$/.test(input.name)) return '文件名无效：须以字母开头，只含字母、数字、下划线，扩展名为 .m/.csv/.txt/.dat/.json';
        return null;
      case 'view_figure': return input.figure === undefined || Number.isInteger(input.figure) ? null : 'figure 必须是整数';
      case 'search_functions': return str('query') ? null : 'query 必须是字符串';
      case 'get_workspace': case 'read_editor': case 'list_files': return null;
      default: return '未知工具 ' + name;
    }
  }

  function clip(text) {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    const head = text.slice(0, 20000), tail = text.slice(-6000);
    return head + '\n…（输出过长，省略了中间 ' + (text.length - 26000) + ' 个字符）…\n' + tail;
  }

  // ======================= 工具执行 =======================
  async function execTool(name, input, card) {
    switch (name) {
      case 'run_matlab': {
        const r = await App.runCapture(input.code, '% AI 助手运行：\n' + input.code);
        let text = r.cancelled ? '（运行已被用户停止）' : (r.output.trim() ? r.output : '（代码运行完毕，没有输出）');
        if (r.figures.length) text += '\n[已更新图窗：' + r.figures.join(', ') + ']';
        card.output(text, r.error || r.cancelled);
        return { content: clip(text), is_error: !!(r.error || r.cancelled) };
      }
      case 'get_workspace': {
        const vars = App.Workspace.vars;
        const text = vars.length ? vars.map((v) => v.name + '  ' + v.size + '  ' + v.cls + '  = ' + v.value).join('\n') : '（工作区为空）';
        card.output(text);
        return { content: text };
      }
      case 'read_editor': {
        const E = App.Editor;
        const d = E.doc();
        if (!d) { card.output('（编辑器中没有打开的文件）'); return { content: '编辑器中没有打开的文件。' }; }
        const content = E.editor.getValue();
        const others = E.docs.filter((x) => x !== d).map((x) => x.name);
        card.output(d.name + '（' + content.split('\n').length + ' 行）');
        return { content: '当前文件：' + d.name + (E.isDirty(d) ? '（有未保存的修改）' : '') + (others.length ? '\n其它打开的标签：' + others.join(', ') : '') + '\n\n' + content };
      }
      case 'list_files': {
        const names = App.FS.list();
        const text = names.length ? names.join('\n') : '（当前文件夹为空）';
        card.output(text);
        return { content: text };
      }
      case 'read_file': {
        if (!App.FS.has(input.name)) { card.output('文件不存在：' + input.name, true); return { content: '文件不存在：' + input.name, is_error: true }; }
        const t = App.FS.read(input.name);
        card.output(input.name + '（' + t.length + ' 个字符）');
        return { content: clip(t) };
      }
      case 'write_file': {
        const E = App.Editor;
        const open = E.docs.find((x) => x.name === input.name);
        if (open && E.isDirty(open) && open.saved !== null) {
          const msg = '用户在编辑器中对 ' + input.name + ' 有未保存的修改，没有覆盖。请换一个文件名，或请用户先保存。';
          card.output(msg, true);
          return { content: msg, is_error: true };
        }
        const existed = App.FS.has(input.name);
        App.FS.write(input.name, input.content);
        App.engine.setFile(input.name, input.content);
        App.Files.render();
        if (open) { open.content = input.content; open.saved = input.content; }
        E.open(input.name);
        if (open && E.doc() === open) E.editor.setValue(input.content);
        E.renderTabs();
        const msg = (existed ? '已覆盖 ' : '已创建 ') + input.name + '（' + input.content.split('\n').length + ' 行），并在编辑器中打开。';
        card.output(msg);
        return { content: msg };
      }
      case 'view_figure': {
        const F = App.Figures;
        const id = input.figure !== undefined ? input.figure : F.active;
        const f = F.map.get(id);
        if (!f || !f.fig) { const msg = id === null || id === undefined ? '当前没有打开的图窗。' : '图窗 ' + id + ' 不存在。'; card.output(msg, true); return { content: msg, is_error: true }; }
        if (F.active !== id) F.select(id); else { F.fit(f); f.r.setFigure(f.fig); }
        const src = f.canvas;
        const scale = Math.min(1, 1200 / src.width);
        const c = document.createElement('canvas');
        c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(src, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/png');
        card.image(url);
        return { content: [{ type: 'text', text: '图窗 ' + id + ' 的截图：' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: url.split(',')[1] } }] };
      }
      case 'search_functions': {
        const q = input.query.trim().toLowerCase();
        const docs = ML.docs;
        const words = q.split(/\s+/).filter(Boolean);
        const hits = Object.keys(docs).filter((n) => { const d = docs[n]; const hay = (n + ' ' + d.syn + ' ' + d.desc + ' ' + d.cat).toLowerCase(); return words.every((w) => hay.indexOf(w) >= 0); });
        hits.sort((a, b) => (a.toLowerCase() === q ? -1 : b.toLowerCase() === q ? 1 : a.length - b.length));
        const exactMissing = /^[a-z_]\w*$/i.test(q) && !ML.builtins[input.query.trim()] ? '注意：没有名为 ' + input.query.trim() + ' 的内置函数。\n' : '';
        const text = exactMissing + (hits.length ? hits.slice(0, 30).map((n) => n + ' — ' + docs[n].desc + '\n    ' + docs[n].syn).join('\n') : '没有找到匹配的函数。');
        card.output(hits.length ? '找到 ' + hits.length + ' 个函数' + (hits.length > 30 ? '（显示前 30 个）' : '') : '没有找到匹配的函数', !hits.length);
        return { content: text };
      }
      default: return { content: '未知工具', is_error: true };
    }
  }

  // ======================= Markdown 渲染（简化版） =======================
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  }
  function renderMarkdown(text) {
    const out = [];
    const parts = text.split(/```/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n');
        const lang = nl >= 0 ? part.slice(0, nl).trim() : '';
        const code = nl >= 0 ? part.slice(nl + 1).replace(/\n$/, '') : part;
        const runnable = !lang || /^(matlab|octave|m)$/i.test(lang);
        out.push('<div class="ai-code"><div class="ai-code-bar"><span>' + esc(lang || 'code') + '</span><span class="ai-code-acts">' +
          (runnable ? '<button data-act="run">运行</button><button data-act="editor">放入编辑器</button>' : '') +
          '<button data-act="copy">复制</button></span></div><pre>' + esc(code) + '</pre></div>');
        return;
      }
      const lines = part.split('\n');
      let para = [], list = null, table = null;
      const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
      const flushList = () => { if (list) { out.push('<' + list.tag + '>' + list.items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
      const flushTable = () => {
        if (!table) return;
        const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
        out.push('<table class="ai-table">' + rows.map((r, k) => '<tr>' + r.map((c) => (k === 0 ? '<th>' + c + '</th>' : '<td>' + c + '</td>')).join('') + '</tr>').join('') + '</table>');
        table = null;
      };
      for (const line of lines) {
        const h = /^(#{1,4})\s+(.*)$/.exec(line);
        const li = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
        if (/^\s*\|.*\|\s*$/.test(line)) { flushPara(); flushList(); (table = table || []).push(line); continue; }
        flushTable();
        if (h) { flushPara(); flushList(); out.push('<div class="ai-h">' + inline(h[2]) + '</div>'); }
        else if (li) { flushPara(); const tag = li[1] ? 'ol' : 'ul'; if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; } list.items.push(li[2]); }
        else if (!line.trim()) { flushPara(); flushList(); }
        else { flushList(); para.push(line); }
      }
      flushPara(); flushList(); flushTable();
    });
    return out.join('');
  }

  // 从未完成的 JSON 中尽量取出某个字符串字段（用于实时显示正在编写的代码）
  function partialField(json, key) {
    const m = new RegExp('"' + key + '"\\s*:\\s*"').exec(json);
    if (!m) return null;
    let s = json.slice(m.index + m[0].length);
    let end = -1;
    for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '"') { end = i; break; } }
    if (end >= 0) s = s.slice(0, end);
    s = s.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '');
    try { return JSON.parse('"' + s + '"'); } catch (e) { return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
  }

  // ======================= 对话视图 =======================
  const View = {
    log: null,
    init() {
      this.log = $('#aiLog');
      this.log.addEventListener('click', (e) => {
        const btn = e.target.closest('.ai-code button');
        if (btn) { codeAction(btn.dataset.act, btn.closest('.ai-code').querySelector('pre').textContent, btn); return; }
        const chip = e.target.closest('.ai-chip');
        if (chip) { AI.ask(chip.dataset.prompt); return; }
        const setup = e.target.closest('[data-act="settings"]');
        if (setup) openSettings();
      });
    },
    scroll(force) {
      const L = this.log;
      if (force || L.scrollHeight - L.scrollTop - L.clientHeight < 120) requestAnimationFrame(() => { L.scrollTop = L.scrollHeight; });
    },
    clear() { this.log.innerHTML = ''; this.renderEmpty(); },
    renderEmpty() {
      if (this.log.querySelector('.ai-msg')) return;
      const box = el('div', 'ai-empty');
      const keyed = !!Settings.key;
      box.innerHTML = '<div class="ai-hero"><span class="ai-mark"><svg class="ico"><use href="#i-sparkles"/></svg></span><div><div class="ai-hero-title">AI 助手</div><div class="ai-hero-sub">由 Claude 驱动：可以编写并运行代码、画图、调试错误、解释数学。</div></div></div>' +
        (keyed ? '' : '<div class="ai-setup"><div>开始之前，请先填写你的 Anthropic API Key。Key 只保存在本浏览器中，请求直接发送到 Anthropic。</div><button class="btn btn-primary btn-sm" data-act="settings">填写 API Key</button></div>') +
        '<div class="ai-chips-title">试试这样问</div><div class="ai-chips">' +
        ['求解方程组 2x + y = 5，x − 3y = −1，并验证结果', '画出 z = sin(x)·cos(y) 的三维曲面，加上颜色栏', '用 ode45 求解阻尼振动 x\'\' + 0.4x\' + 4x = 0，并画出相图', '解释我编辑器里的代码，并指出可以改进的地方', '写一个计算斐波那契数列的函数 fib.m，并测试前 10 项']
          .map((p) => '<button class="ai-chip" data-prompt="' + esc(p).replace(/"/g, '&quot;') + '">' + esc(p) + '</button>').join('') + '</div>';
      this.log.appendChild(box);
    },
    user(text) {
      const empty = this.log.querySelector('.ai-empty'); if (empty) empty.remove();
      const m = el('div', 'ai-msg user');
      m.appendChild(el('div', 'ai-bubble', text));
      this.log.appendChild(m);
      this.scroll(true);
    },
    assistant() {
      const m = el('div', 'ai-msg assistant');
      this.log.appendChild(m);
      return new TurnView(m);
    }
  };

  class TurnView {
    constructor(root) { this.root = root; this.blocks = new Map(); this.pending = new Set(); this.raf = 0; }
    begin() { this.blocks.clear(); }
    onEvent(ev) {
      if (ev.type === 'content_block_start') {
        const b = ev.content_block;
        if (b.type === 'text') this.blocks.set(ev.index, { type: 'text', text: '', node: this.add(el('div', 'ai-text')) });
        else if (b.type === 'thinking') {
          const d = el('details', 'ai-think'); d.appendChild(el('summary', '', '思考中…')); const body = el('div', 'ai-think-body'); d.appendChild(body);
          this.blocks.set(ev.index, { type: 'thinking', text: '', node: this.add(d), body });
        } else if (b.type === 'tool_use') {
          this.blocks.set(ev.index, { type: 'tool_use', json: '', name: b.name, card: new ToolCard(this.add(el('div', 'ai-tool')), b.name) });
        } else if (b.type === 'fallback') {
          this.note('原模型拒绝了该请求，已自动改由 ' + ((b.to && b.to.model) || '备用模型') + ' 继续回答。');
        }
      } else if (ev.type === 'content_block_delta') {
        const blk = this.blocks.get(ev.index);
        if (!blk) return;
        if (ev.delta.type === 'text_delta' && blk.type === 'text') { blk.text += ev.delta.text; this.schedule(blk); }
        else if (ev.delta.type === 'thinking_delta' && blk.type === 'thinking') { blk.text += ev.delta.thinking; this.schedule(blk); }
        else if (ev.delta.type === 'input_json_delta' && blk.type === 'tool_use') { blk.json += ev.delta.partial_json; this.schedule(blk); }
      } else if (ev.type === 'content_block_stop') {
        const blk = this.blocks.get(ev.index);
        if (blk) { this.flush(blk); if (blk.type === 'thinking') blk.node.querySelector('summary').textContent = blk.text.trim() ? '思考过程' : '已思考'; }
      }
    }
    add(node) { this.root.appendChild(node); View.scroll(); return node; }
    schedule(blk) {
      this.pending.add(blk);
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; for (const b of this.pending) this.flush(b); this.pending.clear(); View.scroll(); });
    }
    flush(blk) {
      if (blk.type === 'text') blk.node.innerHTML = renderMarkdown(blk.text);
      else if (blk.type === 'thinking') blk.body.textContent = blk.text;
      else if (blk.type === 'tool_use') blk.card.draft(blk.json);
    }
    // 根据最终消息找到工具卡片
    cardFor(index) { const b = this.blocks.get(index); return b && b.card; }
    note(text, cls) { this.add(el('div', 'ai-note' + (cls ? ' ' + cls : ''), text)); }
    error(text) { this.note(text, 'error'); }
  }

  class ToolCard {
    constructor(node, name) {
      this.node = node; this.name = name;
      const head = el('div', 'ai-tool-head');
      this.state = el('span', 'state-tag busy', TOOL_TITLES[name] || name);
      head.appendChild(this.state);
      this.detail = el('span', 'ai-tool-detail');
      head.appendChild(this.detail);
      node.appendChild(head);
      if (name === 'run_matlab' || name === 'write_file') { this.code = el('pre', 'ai-tool-code'); node.appendChild(this.code); }
      this.out = null;
    }
    draft(json) {
      if (this.code) {
        const code = partialField(json, this.name === 'write_file' ? 'content' : 'code');
        if (code !== null) this.code.textContent = code;
        if (this.name === 'write_file') { const n = partialField(json, 'name'); if (n) this.detail.textContent = n; }
      } else if (this.name === 'read_file') { const n = partialField(json, 'name'); if (n) this.detail.textContent = n; }
      else if (this.name === 'search_functions') { const q = partialField(json, 'query'); if (q) this.detail.textContent = q; }
    }
    setInput(input) {
      if (this.code) this.code.textContent = this.name === 'write_file' ? input.content : input.code;
      if (input.name) this.detail.textContent = input.name;
      if (input.query) this.detail.textContent = input.query;
      if (input.figure !== undefined) this.detail.textContent = '图窗 ' + input.figure;
    }
    running(text) { this.state.className = 'state-tag busy'; if (text) this.state.textContent = text; }
    done(ok) { this.state.className = 'state-tag ' + (ok ? 'saved' : 'error'); this.state.textContent = TOOL_TITLES[this.name] || this.name; }
    output(text, isErr) {
      if (!this.out) {
        this.out = el('pre', 'ai-tool-out');
        this.node.appendChild(this.out);
      }
      this.out.textContent = text.length > 4000 ? text.slice(0, 4000) + '\n…' : text;
      this.out.classList.toggle('err', !!isErr);
      if (text.split('\n').length > 8) {
        this.out.classList.add('collapsed');
        const more = el('button', 'ai-more', '展开全部输出');
        more.onclick = () => { this.out.classList.toggle('collapsed'); more.textContent = this.out.classList.contains('collapsed') ? '展开全部输出' : '收起'; };
        this.node.appendChild(more);
      }
    }
    image(url) { const img = el('img', 'ai-tool-img'); img.src = url; img.alt = '图窗截图'; this.node.appendChild(img); }
    // 需要用户确认时
    confirm() {
      return new Promise((resolve) => {
        const bar = el('div', 'ai-confirm');
        bar.appendChild(el('span', '', '是否运行这段代码？'));
        const yes = el('button', 'btn btn-primary btn-sm', '运行');
        const no = el('button', 'btn btn-sm', '跳过');
        yes.onclick = () => { bar.remove(); resolve(true); };
        no.onclick = () => { bar.remove(); resolve(false); };
        bar.append(yes, no);
        this.node.appendChild(bar);
        this.state.className = 'state-tag unsaved'; this.state.textContent = '等待确认';
        AI.pendingConfirm = () => { bar.remove(); resolve(false); };
        View.scroll(true);
      });
    }
  }

  function codeAction(act, code, btn) {
    if (act === 'copy') {
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '复制'; }, 1200); }).catch(() => {});
    } else if (act === 'run') {
      App.Console.exec(code);
    } else if (act === 'editor') {
      App.Editor.newDoc(code + '\n');
    }
  }

  // ======================= 对话循环 =======================
  const AI = {
    messages: [],
    busy: false,
    abort: null,
    pendingConfirm: null,
    usage: { input: 0, output: 0, cacheRead: 0 },

    ask(text) {
      App.showTool('ai');
      if (this.busy) { App.status('AI 助手正在回答，请稍候或先停止。'); return; }
      $('#aiInput').value = text;
      this.send();
    },
    newChat() {
      if (this.busy) this.stop();
      this.messages = [];
      this.usage = { input: 0, output: 0, cacheRead: 0 };
      View.clear();
      updateUsage();
    },
    stop() {
      this.stopped = true;
      if (this.abort) this.abort();
      if (this.pendingConfirm) { this.pendingConfirm(); this.pendingConfirm = null; }
      if (App.engine.busy) App.engine.interrupt();
    },
    async send() {
      const input = $('#aiInput');
      const text = input.value.trim();
      if (!text || this.busy) return;
      if (!Settings.key) { openSettings(); return; }
      input.value = ''; autosize();
      View.user(text);
      this.messages.push({ role: 'user', content: text });
      this.setBusy(true);
      this.stopped = false;
      const turn = View.assistant();
      try {
        await this.loop(turn);
      } catch (e) {
        turn.error(describeError(e, this.Anthropic));
      } finally {
        this.abort = null;
        this.setBusy(false);
        updateUsage();
        View.scroll();
      }
    },
    setBusy(b) {
      this.busy = b;
      $('#aiSend').hidden = b; $('#aiStop').hidden = !b;
      $('#aiStatus').hidden = !b;
    },
    async loop(turn) {
      const { Anthropic, client } = await makeClient();
      this.Anthropic = Anthropic;
      const info = Settings.modelInfo();
      const official = Settings.officialEndpoint();
      const useFallback = official && info.fallback;
      // 使用官方 API 时启用工具参数的实时流式输出
      const tools = TOOLS.map((t) => (official ? Object.assign({ eager_input_streaming: true }, t) : t));
      let jsonRetries = 0;
      for (let step = 0; step < MAX_STEPS; step++) {
        if (this.stopped) return;
        const params = {
          model: Settings.model,
          max_tokens: 64000,
          system: SYSTEM,
          tools,
          messages: this.messages,
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: Settings.effort },
          cache_control: { type: 'ephemeral' }
        };
        const stream = useFallback
          ? client.beta.messages.stream(Object.assign({}, params, { betas: [FALLBACK_BETA], fallbacks: 'default' }))
          : client.messages.stream(params);
        this.abort = () => stream.abort();
        turn.begin();
        let message;
        try {
          for await (const ev of stream) turn.onEvent(ev);
          message = await stream.finalMessage();
          jsonRetries = 0;
        } catch (e) {
          if (this.stopped || e instanceof Anthropic.APIUserAbortError) { turn.note('已停止。'); return; }
          if (e instanceof Anthropic.APIError) throw e;
          // 工具参数无法解析为 JSON：重新发起本轮请求（最多 2 次）
          if (jsonRetries++ < 2) { turn.note('工具参数解析失败，正在重试…'); continue; }
          throw e;
        }
        this.abort = null;
        addUsage(message.usage);
        updateUsage();

        if (message.stop_reason === 'refusal') {
          const cat = message.stop_details && message.stop_details.category;
          turn.error('模型拒绝了这个请求' + (cat ? '（类别：' + cat + '）' : '') + '。可以换一种说法再试。');
          return;
        }
        const toolUses = message.content.filter((b) => b.type === 'tool_use');
        if (message.stop_reason === 'max_tokens' && toolUses.length) {
          turn.error('回复超出长度上限，工具参数被截断，本步没有执行。可以让 AI 把任务拆小一些再试。');
          return;
        }
        // 原样追加助手消息（包括思考块），保证历史只追加、不修改
        this.messages.push({ role: 'assistant', content: message.content });
        if (message.stop_reason === 'pause_turn') continue;
        if (!toolUses.length) {
          if (message.stop_reason === 'max_tokens') turn.note('回复达到长度上限，可能不完整。');
          return;
        }
        const results = [];
        for (const tu of toolUses) {
          const idx = message.content.indexOf(tu);
          const card = turn.cardFor(idx) || new ToolCard(turn.add(el('div', 'ai-tool')), tu.name);
          const problem = validate(tu.name, tu.input);
          if (problem) {
            card.output('参数无效：' + problem, true); card.done(false);
            results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(tu.input), reason: problem }) });
            continue;
          }
          card.setInput(tu.input);
          if (this.stopped) { results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: '用户已停止，本工具未执行。' }); card.done(false); continue; }
          if (tu.name === 'run_matlab' && !Settings.autoRun) {
            const ok = await card.confirm();
            this.pendingConfirm = null;
            if (!ok) { card.output('用户选择不运行这段代码。', true); card.done(false); results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: '用户选择不运行这段代码。' }); continue; }
          }
          card.running('正在' + (TOOL_TITLES[tu.name] || '执行'));
          try {
            const r = await execTool(tu.name, tu.input, card);
            card.done(!r.is_error);
            const res = { type: 'tool_result', tool_use_id: tu.id, content: r.content };
            if (r.is_error) res.is_error = true;
            results.push(res);
          } catch (err) {
            card.output('执行失败：' + (err && err.message ? err.message : err), true); card.done(false);
            results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: '执行失败：' + (err && err.message ? err.message : String(err)) });
          }
        }
        // 所有工具结果放在同一条用户消息中返回
        this.messages.push({ role: 'user', content: results });
        if (this.stopped) { turn.note('已停止。'); return; }
      }
      turn.note('已达到单轮最多 ' + MAX_STEPS + ' 步。如需继续，可以回复“继续”。');
    }
  };

  function addUsage(u) {
    if (!u) return;
    AI.usage.input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    AI.usage.cacheRead += u.cache_read_input_tokens || 0;
    AI.usage.output += u.output_tokens || 0;
  }
  function updateUsage() {
    const u = AI.usage;
    const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));
    $('#aiUsage').textContent = u.input || u.output ? '本次对话：输入 ' + fmt(u.input) + (u.cacheRead ? '（缓存 ' + fmt(u.cacheRead) + '）' : '') + ' · 输出 ' + fmt(u.output) + ' tokens' : '';
  }

  function describeError(e, A) {
    if (!A) return '无法加载 Claude SDK（' + (e && e.message ? e.message : e) + '）。请检查网络是否能访问 cdn.jsdelivr.net。';
    if (e instanceof A.AuthenticationError) return 'API Key 无效或已失效，请在设置中重新填写。';
    if (e instanceof A.PermissionDeniedError) return '当前 API Key 没有权限使用这个模型或功能（' + e.message + '）。';
    if (e instanceof A.NotFoundError) return '找不到模型或接口地址（' + e.message + '）。请检查设置中的模型和 API 地址。';
    if (e instanceof A.RateLimitError) return '请求过于频繁或额度不足，请稍后再试。';
    if (e instanceof A.BadRequestError) return '请求被拒绝：' + e.message;
    if (e instanceof A.APIConnectionError) return '无法连接到 API（' + e.message + '）。请检查网络；如果所在网络无法直接访问 api.anthropic.com，可以在设置中填写可用的 API 地址。';
    if (e instanceof A.InternalServerError) return 'Anthropic 服务暂时不可用（' + e.status + '），请稍后再试。';
    if (e instanceof A.APIError) return 'API 错误 ' + (e.status || '') + '：' + e.message;
    return '出错了：' + (e && e.message ? e.message : String(e));
  }

  // ======================= 设置对话框 =======================
  function openSettings() {
    $('#modalTitle').textContent = 'AI 助手设置';
    const body = $('#modalBody');
    body.innerHTML = `
      <div class="form">
        <label class="form-row"><span class="form-label">API Key</span>
          <span class="key-wrap"><input id="aiKey" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"><button id="aiKeyShow" class="icon-btn" type="button" title="显示/隐藏"><svg class="ico"><use href="#i-eye"/></svg></button></span>
        </label>
        <label class="form-check form-indent"><input id="aiRemember" type="checkbox"> 在此浏览器中记住 API Key（不勾选则关闭页面后清除）</label>
        <div class="form-hint form-indent">还没有 Key？在 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> 创建。Key 只保存在你的浏览器里，请求从浏览器直接发送到 Anthropic，不经过任何其它服务器；调用费用由你的账户承担。</div>
        <label class="form-row"><span class="form-label">模型</span><select id="aiModel" class="input"></select></label>
        <div class="form-hint form-indent" id="aiModelNote"></div>
        <div class="form-row"><span class="form-label">思考强度</span><div class="seg" id="aiEffort"></div></div>
        <div class="form-hint form-indent">强度越高，回答越周全，但更慢、消耗更多 tokens。</div>
        <label class="form-row"><span class="form-label">API 地址</span><input id="aiBase" class="input" placeholder="https://api.anthropic.com（默认，可留空）" spellcheck="false"></label>
        <div class="form-hint form-indent">只有在无法直接访问 Anthropic 时才需要填写兼容 Anthropic API 的地址。</div>
        <label class="form-check form-indent"><input id="aiAuto" type="checkbox"> 允许 AI 直接运行代码（不勾选则每次运行前询问）</label>
        <div id="aiTestMsg" class="form-hint form-indent"></div>
      </div>
      <div class="modal-footer">
        <button id="aiClearKey" class="btn btn-danger">清除 Key</button>
        <span style="flex:1"></span>
        <button id="aiTest" class="btn">测试连接</button>
        <button id="aiSave" class="btn btn-primary">保存</button>
      </div>`;
    const sel = $('#aiModel');
    for (const m of MODELS) { const o = el('option', '', m.name); o.value = m.id; sel.appendChild(o); }
    sel.value = Settings.model;
    const noteModel = () => { const m = MODELS.find((x) => x.id === sel.value); $('#aiModelNote').textContent = m ? m.note : ''; };
    sel.onchange = noteModel; noteModel();
    let effort = Settings.effort;
    const seg = $('#aiEffort');
    const drawSeg = () => {
      seg.innerHTML = '';
      for (const e of EFFORTS) { const b = el('button', 'tab' + (e.id === effort ? ' active' : ''), e.name); b.type = 'button'; b.onclick = () => { effort = e.id; drawSeg(); }; seg.appendChild(b); }
    };
    drawSeg();
    $('#aiKey').value = Settings.key;
    $('#aiRemember').checked = Settings.remember;
    $('#aiBase').value = Settings.baseURL;
    $('#aiAuto').checked = Settings.autoRun;
    $('#aiKeyShow').onclick = () => { const k = $('#aiKey'); k.type = k.type === 'password' ? 'text' : 'password'; };
    const collect = () => {
      Settings.key = $('#aiKey').value.trim();
      Settings.remember = $('#aiRemember').checked;
      Settings.model = sel.value;
      Settings.effort = effort;
      Settings.baseURL = $('#aiBase').value.trim();
      Settings.autoRun = $('#aiAuto').checked;
    };
    $('#aiSave').onclick = () => {
      collect(); Settings.save(); refreshHeader();
      $('#modal').hidden = true;
      if (!AI.messages.length) View.clear();
      $('#aiInput').focus();
    };
    $('#aiClearKey').onclick = () => { $('#aiKey').value = ''; Settings.key = ''; Settings.save(); refreshHeader(); $('#aiTestMsg').textContent = '已清除保存的 API Key。'; };
    $('#aiTest').onclick = async () => {
      collect();
      const msg = $('#aiTestMsg');
      if (!Settings.key) { msg.textContent = '请先填写 API Key。'; return; }
      msg.textContent = '正在连接…';
      let A = null;
      try {
        const { Anthropic, client } = await makeClient();
        A = Anthropic;
        const m = await client.models.retrieve(Settings.model);
        msg.textContent = '连接成功：可以使用 ' + (m.display_name || m.id) + '。';
      } catch (e) { msg.textContent = describeError(e, A); }
    };
    $('#modal').hidden = false;
    setTimeout(() => $('#aiKey').focus(), 50);
  }

  function refreshHeader() {
    const m = Settings.modelInfo();
    const eff = EFFORTS.find((x) => x.id === Settings.effort);
    $('#aiModelBadge').textContent = m.name + ' · ' + (eff ? eff.name : '') + (Settings.key ? '' : ' · 未设置 Key');
  }

  function autosize() { const t = $('#aiInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }

  // ======================= 初始化 =======================
  function init() {
    View.init();
    View.renderEmpty();
    refreshHeader();
    const input = $('#aiInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); AI.send(); }
    });
    input.addEventListener('input', autosize);
    $('#aiSend').onclick = () => AI.send();
    $('#aiStop').onclick = () => AI.stop();
    $('#aiNew').onclick = () => AI.newChat();
    $('#aiSettings').onclick = () => openSettings();
    $('#btnAI').onclick = () => { App.showTool('ai'); input.focus(); };
  }
  ML.AI = AI;
  init();
})(typeof self !== 'undefined' ? self : globalThis);
