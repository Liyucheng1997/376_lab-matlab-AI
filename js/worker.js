/* MatWeb - 计算引擎 Worker：在后台线程运行解释器，避免阻塞界面 */
/* global importScripts */
'use strict';
importScripts('manifest.js');
importScripts.apply(null, self.ML.ENGINE_SCRIPTS);

const ML = self.ML;
let ctl = null;      // Int32Array: [0]=中断标志 [1]=睡眠占位 [2]=输入就绪 [3]=输入长度
let inputBuf = null; // Uint16Array
let outBuf = '';
let lastFlush = 0;

function flushOut() {
  if (outBuf) { postMessage({ type: 'out', text: outBuf }); outBuf = ''; }
  lastFlush = Date.now();
}
const io = {
  print(t) { outBuf += t; if (outBuf.length > 20000 || Date.now() - lastFlush > 60) flushOut(); },
  printErr(t) { flushOut(); postMessage({ type: 'err', text: t }); },
  warn(t) { flushOut(); postMessage({ type: 'warn', text: t }); },
  clc() { outBuf = ''; postMessage({ type: 'clc' }); },
  figure(fig, current) { flushOut(); postMessage({ type: 'figure', fig, current }); },
  closeFigure(id) { postMessage({ type: 'closeFigure', id }); },
  saveFile(name, content) { postMessage({ type: 'saveFile', name, content }); },
  deleteFile(name) { postMessage({ type: 'deleteFile', name }); },
  openFile(name) { postMessage({ type: 'openFile', name }); },
  exportFigure(id, name) { postMessage({ type: 'exportFigure', id, name }); },
  checkInterrupt() {
    if (ctl && Atomics.load(ctl, 0) === 1) { Atomics.store(ctl, 0, 0); return true; }
    return false;
  },
  sleep(sec) {
    flushOut();
    const ms = sec * 1000;
    if (ctl) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        Atomics.wait(ctl, 1, 0, Math.min(50, end - Date.now()));
        if (Atomics.load(ctl, 0) === 1) return;
      }
    } else {
      const end = Date.now() + ms;
      while (Date.now() < end) { /* 忙等待 */ }
    }
  }
};

const interp = new ML.Interpreter(io);

function setupInput() {
  if (!ctl) return;
  io.inputShowsPrompt = true;
  io.input = function (prompt) {
    flushOut();
    Atomics.store(ctl, 2, 0);
    postMessage({ type: 'input', prompt });
    while (Atomics.load(ctl, 2) === 0) {
      Atomics.wait(ctl, 2, 0, 200);
      if (Atomics.load(ctl, 0) === 1) { Atomics.store(ctl, 0, 0); return null; }
    }
    const state = Atomics.load(ctl, 2);
    if (state === 2) return null; // 取消
    const len = Atomics.load(ctl, 3);
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(inputBuf[i]);
    return s;
  };
}

function sendWorkspace() {
  postMessage({ type: 'workspace', vars: interp.workspaceInfo(), format: ML.fmt.settings.mode });
}

self.onmessage = function (e) {
  const m = e.data;
  switch (m.type) {
    case 'init':
      if (m.sab) { ctl = new Int32Array(m.sab); inputBuf = new Uint16Array(m.inputSab); setupInput(); }
      for (const [name, content] of Object.entries(m.files || {})) setFile(name, content);
      postMessage({ type: 'ready', builtins: Object.keys(ML.builtins), hasInput: !!ctl });
      sendWorkspace();
      break;
    case 'run': {
      const t0 = Date.now();
      interp.multiLine = /\n/.test(m.code);
      interp.run(m.code);
      flushOut();
      sendWorkspace();
      postMessage({ type: 'done', id: m.id, elapsed: Date.now() - t0 });
      break;
    }
    case 'setFile': setFile(m.name, m.content); break;
    case 'deleteFile':
      if (/\.m$/.test(m.name)) { interp.files.delete(m.name.replace(/\.m$/, '')); interp.fileCache.delete(m.name.replace(/\.m$/, '')); }
      else interp.dataFiles.delete(m.name);
      break;
    case 'getVar': {
      const v = interp.getVar(interp.base, m.name);
      postMessage({ type: 'varText', name: m.name, text: v === undefined ? '' : ML.fmt.display(m.name, v) });
      break;
    }
    default: break;
  }
};
function setFile(name, content) {
  if (/\.m$/.test(name)) { const base = name.replace(/\.m$/, ''); interp.files.set(base, content); interp.fileCache.delete(base); }
  else interp.dataFiles.set(name, content);
}
