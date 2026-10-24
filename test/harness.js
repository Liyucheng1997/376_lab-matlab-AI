// Node 测试工具：加载引擎并执行 MATLAB 代码，返回输出文本
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'js');

function loadEngine() {
  const ctx = { console, Math, Date, Float64Array, Uint8Array, Uint32Array, Int32Array, Map, Set, Array, Object, String, Number, JSON, RegExp, Error, RangeError, TypeError, Symbol, Infinity, NaN, parseInt, parseFloat, isNaN, isFinite, setTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'manifest.js'), 'utf8'), ctx, { filename: 'manifest.js' });
  for (const f of ctx.ML.ENGINE_SCRIPTS) {
    const p = path.join(JS, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  return ctx.ML;
}

function makeSession() {
  const ML = loadEngine();
  let out = '';
  const io = {
    print: (t) => { out += t; },
    printErr: (t) => { out += t; },
    warn: (t) => { out += t; },
    figure: () => {},
  };
  const interp = new ML.Interpreter(io);
  return {
    ML, interp,
    run(code) { out = ''; interp.run(code); return out; },
  };
}

module.exports = { loadEngine, makeSession };

if (require.main === module) {
  const s = makeSession();
  const code = process.argv.slice(2).join(' ') || fs.readFileSync(0, 'utf8');
  process.stdout.write(s.run(code));
}
