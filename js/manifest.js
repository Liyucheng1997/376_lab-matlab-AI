/* MatWeb - 引擎脚本加载顺序（主线程、Worker、Node 测试共用） */
(function (G) {
  'use strict';
  const ML = G.ML || (G.ML = {});
  ML.ENGINE_SCRIPTS = [
    'core/types.js',
    'core/colormaps.js',
    'core/ops.js',
    'core/linalg.js',
    'core/lexer.js',
    'core/parser.js',
    'core/format.js',
    'core/indexing.js',
    'lib/registry.js',
    'lib/elmat.js',
    'lib/elfun.js',
    'lib/datafun.js',
    'lib/matfun.js',
    'lib/numeric.js',
    'lib/strfun.js',
    'lib/datatypes.js',
    'lib/system.js',
    'lib/graphics.js',
    'lib/extras.js',
    'core/interp.js'
  ];
})(typeof self !== 'undefined' ? self : globalThis);
