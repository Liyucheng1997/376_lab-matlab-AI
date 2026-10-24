/* MatWeb - 计算引擎客户端：优先使用 Web Worker，失败时回退到主线程执行 */
(function (G) {
  'use strict';
  const ML = G.ML;

  class EngineClient {
    constructor(handlers) {
      this.h = handlers;
      this.queue = [];
      this.busy = false;
      this.mode = null;
      this.seq = 0;
      this.files = {};
      this.sab = null;
    }
    start(files) {
      this.files = Object.assign({}, files);
      let worker = null;
      if (location.protocol !== 'file:' && typeof Worker !== 'undefined') {
        try { worker = new Worker('js/worker.js'); } catch (e) { worker = null; }
      }
      if (!worker) { this.startLocal(); return; }
      this.worker = worker;
      this.mode = 'worker';
      let ready = false;
      const fallback = setTimeout(() => { if (!ready) { worker.terminate(); this.startLocal(); } }, 8000);
      worker.onerror = (e) => { if (!ready) { clearTimeout(fallback); worker.terminate(); this.startLocal(); } else this.h.onErr('引擎错误: ' + (e.message || e) + '\n'); };
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') { ready = true; clearTimeout(fallback); }
        this.onMessage(m);
      };
      const init = { type: 'init', files: this.files };
      if (typeof SharedArrayBuffer !== 'undefined' && G.crossOriginIsolated) {
        this.sab = new SharedArrayBuffer(16);
        this.ctl = new Int32Array(this.sab);
        this.inputSab = new SharedArrayBuffer(2 * 8192);
        this.inputBuf = new Uint16Array(this.inputSab);
        init.sab = this.sab; init.inputSab = this.inputSab;
      }
      worker.postMessage(init);
    }
    startLocal() {
      this.mode = 'local';
      this.worker = null;
      const self = this;
      let deadline = 0;
      const io = {
        print: (t) => self.h.onOut(t),
        printErr: (t) => self.h.onErr(t),
        warn: (t) => self.h.onWarn(t),
        clc: () => self.h.onClc(),
        figure: (fig, cur) => self.h.onFigure(typeof structuredClone === 'function' ? structuredClone(fig) : JSON.parse(JSON.stringify(fig, (k, v) => (v instanceof Float64Array ? Array.from(v) : v))), cur),
        closeFigure: (id) => self.h.onCloseFigure(id),
        saveFile: (n, c) => self.h.onSaveFile(n, c),
        deleteFile: (n) => self.h.onDeleteFile(n),
        openFile: (n) => self.h.onOpenFile(n),
        exportFigure: (id, n) => self.h.onExportFigure(id, n),
        checkInterrupt: () => Date.now() > deadline,
        input: (p) => G.prompt(p || '请输入：', ''),
        sleep: () => {}
      };
      this.interp = new ML.Interpreter(io);
      for (const [name, content] of Object.entries(this.files)) this.applyFileLocal(name, content);
      this.localDeadline = (ms) => { deadline = Date.now() + ms; };
      setTimeout(() => {
        this.h.onReady({ mode: 'local', hasInput: true });
        this.h.onWorkspace(this.interp.workspaceInfo());
      }, 0);
    }
    applyFileLocal(name, content) {
      const it = this.interp;
      if (/\.m$/.test(name)) { const b = name.replace(/\.m$/, ''); it.files.set(b, content); it.fileCache.delete(b); }
      else it.dataFiles.set(name, content);
    }
    onMessage(m) {
      const h = this.h;
      switch (m.type) {
        case 'ready': h.onReady({ mode: 'worker', hasInput: m.hasInput }); break;
        case 'out': h.onOut(m.text); break;
        case 'err': h.onErr(m.text); break;
        case 'warn': h.onWarn(m.text); break;
        case 'clc': h.onClc(); break;
        case 'figure': h.onFigure(m.fig, m.current); break;
        case 'closeFigure': h.onCloseFigure(m.id); break;
        case 'workspace': h.onWorkspace(m.vars); break;
        case 'saveFile': h.onSaveFile(m.name, m.content); break;
        case 'deleteFile': h.onDeleteFile(m.name); break;
        case 'openFile': h.onOpenFile(m.name); break;
        case 'exportFigure': h.onExportFigure(m.id, m.name); break;
        case 'input': h.onInput(m.prompt); break;
        case 'done': this.finish(m.elapsed); break;
        default: break;
      }
    }
    // 提交代码（排队执行）
    run(code, meta) {
      this.queue.push({ code, meta: meta || {} });
      this.pump();
    }
    pump() {
      if (this.busy || !this.queue.length || !this.mode) return;
      const job = this.queue.shift();
      this.busy = true;
      this.current = job;
      this.h.onBusy(true, job.meta);
      if (this.mode === 'worker') {
        if (this.ctl) Atomics.store(this.ctl, 0, 0);
        this.worker.postMessage({ type: 'run', code: job.code, id: ++this.seq });
      } else {
        setTimeout(() => {
          const t0 = Date.now();
          this.localDeadline(60000);
          this.interp.multiLine = /\n/.test(job.code);
          this.interp.run(job.code);
          this.h.onWorkspace(this.interp.workspaceInfo());
          this.finish(Date.now() - t0);
        }, 15);
      }
    }
    finish(elapsed) {
      this.busy = false;
      const job = this.current; this.current = null;
      this.h.onBusy(false, job ? job.meta : {}, elapsed);
      this.pump();
    }
    interrupt() {
      this.queue = [];
      if (!this.busy) return;
      if (this.mode === 'worker') {
        if (this.ctl) {
          Atomics.store(this.ctl, 0, 1);
          Atomics.notify(this.ctl, 1); Atomics.notify(this.ctl, 2);
        } else {
          // 无共享内存：重启 Worker（工作区会丢失）
          this.worker.terminate();
          this.busy = false;
          this.h.onWarn('已强制终止计算引擎，工作区已重置（通过 node server.js 启动可保留工作区）。\n');
          this.h.onBusy(false, {}, 0);
          this.h.onWorkspace([]);
          this.start(this.files);
        }
      }
    }
    respondInput(text) {
      if (!this.ctl) return;
      if (text === null) { Atomics.store(this.ctl, 2, 2); Atomics.notify(this.ctl, 2); return; }
      const n = Math.min(text.length, this.inputBuf.length);
      for (let i = 0; i < n; i++) this.inputBuf[i] = text.charCodeAt(i);
      Atomics.store(this.ctl, 3, n);
      Atomics.store(this.ctl, 2, 1);
      Atomics.notify(this.ctl, 2);
    }
    setFile(name, content) {
      this.files[name] = content;
      if (this.mode === 'worker') this.worker.postMessage({ type: 'setFile', name, content });
      else if (this.mode === 'local') this.applyFileLocal(name, content);
    }
    deleteFile(name) {
      delete this.files[name];
      if (this.mode === 'worker') this.worker.postMessage({ type: 'deleteFile', name });
      else if (this.mode === 'local') { const it = this.interp; if (/\.m$/.test(name)) it.files.delete(name.replace(/\.m$/, '')); else it.dataFiles.delete(name); }
    }
  }
  ML.EngineClient = EngineClient;
})(typeof self !== 'undefined' ? self : globalThis);
