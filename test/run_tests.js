// MatWeb 引擎回归测试：node test/run_tests.js
'use strict';
const { makeSession } = require('./harness');

// [代码, 变量名, 期望值]；期望值为数字/数组（容差比较）、字符串或函数
const cases = [
  // 基本运算与优先级
  ['r = 2 + 3 * 4;', 'r', 14],
  ['r = -2^2;', 'r', -4],
  ['r = 2^-1;', 'r', 0.5],
  ['r = 2^3^2;', 'r', 64],
  ['r = [1 -2];', 'r', [1, -2]],
  ['r = [1 - 2];', 'r', -1],
  ['a = 3; r = [a -1];', 'r', [3, -1]],
  ['r = [1, 2; 3, 4]\';', 'r', [[1, 3], [2, 4]]],
  ['r = 1:0.5:3;', 'r', [1, 1.5, 2, 2.5, 3]],
  ['r = 10:-3:1;', 'r', [10, 7, 4, 1]],
  ['r = numel(0:0.1:1);', 'r', 11],
  ['r = 7 \\ 14;', 'r', 2],
  ['r = mod(-7, 3);', 'r', 2],
  ['r = rem(-7, 3);', 'r', -1],
  ['r = true + true;', 'r', 2],
  ['r = ~[1 0 2];', 'r', [0, 1, 0]],
  ['r = xor(true, false);', 'r', 1],
  ['r = 3 > 2 && 1 < 0;', 'r', 0],
  // 索引与赋值
  ['A = magic(4); r = A(2, 3);', 'r', 10],
  ['A = magic(4); r = A(end, end);', 'r', 1],
  ['A = magic(3); r = A(:, 2)\';', 'r', [1, 5, 9]],
  ['A = magic(3); r = A([1 3], [1 3]);', 'r', [[8, 6], [4, 2]]],
  ['v = 1:6; r = v(v > 3);', 'r', [4, 5, 6]],
  ['v = []; v(3) = 5; r = v;', 'r', [0, 0, 5]],
  ['A = eye(2); A(3, 3) = 9; r = A;', 'r', [[1, 0, 0], [0, 1, 0], [0, 0, 9]]],
  ['v = 1:5; v([2 4]) = []; r = v;', 'r', [1, 3, 5]],
  ['A = magic(3); A(:, 2) = []; r = A;', 'r', [[8, 6], [3, 7], [4, 2]]],
  ['A = zeros(2); A(:) = 1:4; r = A;', 'r', [[1, 3], [2, 4]]],
  ['x = 1:3; y = x; y(1) = 99; r = x;', 'r', [1, 2, 3]],
  ['c = {1, \'a\', [1 2]}; r = c{3};', 'r', [1, 2]],
  ['c = {}; c{2} = 5; r = numel(c);', 'r', 2],
  ['s.a.b = 3; s.a.c = 4; r = s.a.b + s.a.c;', 'r', 7],
  ['s(2).x = 5; r = numel(s);', 'r', 2],
  ['s = struct(\'v\', {1, 2, 3}); r = [s.v];', 'r', [1, 2, 3]],
  ['c = {1, 2, 3}; r = [c{:}];', 'r', [1, 2, 3]],
  ['f = \'v\'; s.(f) = 8; r = s.v;', 'r', 8],
  // 控制流与函数
  ['r = 0; for k = 1:10, if mod(k,2), continue; end; r = r + k; end', 'r', 30],
  ['r = 0; while true, r = r + 1; if r >= 5, break; end; end', 'r', 5],
  ["switch 'b', case 'a', r = 1; case {'b','c'}, r = 2; otherwise, r = 3; end", 'r', 2],
  ["try, error('x:y', 'boom %d', 3); catch e, r = e.message; end", 'r', 'boom 3'],
  ['f = @(x, y) x.^2 + y; r = f(3, 1);', 'r', 10],
  ['a = 2; f = @(x) a * x; a = 100; r = f(5);', 'r', 10],
  ['g = @(f, x) f(x) + 1; r = g(@sqrt, 16);', 'r', 5],
  ['r = feval(@max, [3 9 2]);', 'r', 9],
  ['[m, i] = max([3 9 2]); r = [m i];', 'r', [9, 2]],
  ['[~, i] = sort([3 1 2]); r = i;', 'r', [2, 3, 1]],
  ['r = cellfun(@numel, {\'ab\', \'cde\'});', 'r', [2, 3]],
  ['r = arrayfun(@(x) x^2, 1:4);', 'r', [1, 4, 9, 16]],
  ['function y = sq(x)\ny = x.^2;\nend\nr = sq(4);', 'r', 16],
  ['function varargout = multi(varargin)\nfor k = 1:nargin, varargout{k} = varargin{k} * 2; end\nend\n[a, b] = multi(1, 2); r = [a b];', 'r', [2, 4]],
  ['function r = fact(n)\nif n <= 1, r = 1; else, r = n * fact(n - 1); end\nend\nr = fact(6);', 'r', 720],
  ['x = 5; x += 2; r = x;', 'r', 7],
  // 线性代数
  ['r = det([1 2; 3 4]);', 'r', -2],
  ['r = inv([2 0; 0 4]);', 'r', [[0.5, 0], [0, 0.25]]],
  ['A = [4 -2; 1 1]; r = eig(A)\';', 'r', [2, 3]],
  ['A = [2 1; 1 2]; [V, D] = eig(A); r = norm(A*V - V*D) < 1e-10;', 'r', 1],
  ['r = eig([0 -1; 1 0]);', 'r', (v) => Math.abs(Math.abs(v.im[0]) - 1) < 1e-12 && Math.abs(v.re[0]) < 1e-12],
  ['A = rand(5); [U, S, V] = svd(A); r = norm(U*S*V\' - A) < 1e-10;', 'r', 1],
  ['A = magic(4); [Q, R] = qr(A); r = norm(Q*R - A) < 1e-10;', 'r', 1],
  ['A = [4 3; 6 3]; [L, U, P] = lu(A); r = norm(P*A - L*U) < 1e-12;', 'r', 1],
  ['r = rank(magic(4));', 'r', 3],
  ['r = trace(magic(3));', 'r', 15],
  ['A = [1 2; 3 4]; b = [5; 6]; r = (A \\ b)\';', 'r', [-4, 4.5]],
  ['r = norm([3 4]);', 'r', 5],
  ['r = cross([1 0 0], [0 1 0]);', 'r', [0, 0, 1]],
  ['r = kron([1 2], [1; 1]);', 'r', [[1, 2], [1, 2]]],
  ['r = expm(zeros(2));', 'r', [[1, 0], [0, 1]]],
  ['r = rref([1 2 3; 4 5 6]);', 'r', [[1, 0, -1], [0, 1, 2]]],
  ['r = null([1 1])\' * [1; 1];', 'r', 0],
  // 数值方法
  ['r = roots([1 -3 2])\';', 'r', [2, 1]],
  ['r = polyval([1 2 3], 2);', 'r', 11],
  ['r = polyfit([1 2 3], [2 4 6], 1);', 'r', [2, 0]],
  ['r = conv([1 1], [1 -1]);', 'r', [1, 0, -1]],
  ['[q, rr] = deconv([1 0 -1], [1 1]); r = q;', 'r', [1, -1]],
  ['r = polyder([1 1 1]);', 'r', [2, 1]],
  ['r = interp1([1 2 3], [10 20 30], 2.5);', 'r', 25],
  ['r = interp1([0 1 2 3], [0 1 8 27], 1.5, \'spline\');', 'r', 3.375],
  ['r = integral(@(x) x.^2, 0, 3);', 'r', 9],
  ['r = integral(@(x) exp(-x), 0, Inf);', 'r', 1],
  ['r = integral2(@(x, y) x .* y, 0, 1, 0, 2);', 'r', 1],
  ['r = trapz(0:0.01:1, (0:0.01:1).^2);', 'r', (v) => Math.abs(v.re[0] - 1 / 3) < 1e-4],
  ['r = fzero(@(x) cos(x) - x, [0 1]);', 'r', 0.7390851332151607],
  ['r = fminbnd(@(x) (x - 2).^2, 0, 5);', 'r', (v) => Math.abs(v.re[0] - 2) < 1e-4],
  ['r = fminsearch(@(p) (p(1) - 1)^2 + (p(2) + 2)^2, [0 0]);', 'r', (v) => Math.abs(v.re[0] - 1) < 1e-3 && Math.abs(v.re[1] + 2) < 1e-3],
  ['r = fsolve(@(v) [v(1) + v(2) - 3; v(1) - v(2) - 1], [0; 0])\';', 'r', [2, 1]],
  ['[t, y] = ode45(@(t, y) -2 * y, [0 1], 1); r = y(end);', 'r', (v) => Math.abs(v.re[0] - Math.exp(-2)) < 1e-4],
  ['[t, y] = ode45(@(t, y) [y(2); -y(1)], [0 pi], [0; 1]); r = y(end, 1);', 'r', (v) => Math.abs(v.re[0]) < 1e-3],
  ['r = abs(fft([1 2 3 4]));', 'r', [10, Math.SQRT2 * 2, 2, Math.SQRT2 * 2]],
  ['r = real(ifft(fft([1 2 3 4 5])));', 'r', [1, 2, 3, 4, 5]],
  ['r = filter(1, [1 -0.5], [1 1 1]);', 'r', [1, 1.5, 1.75]],
  ['r = cumsum([1 2 3]);', 'r', [1, 3, 6]],
  ['r = diff([1 4 9 16]);', 'r', [3, 5, 7]],
  // 统计
  ['r = mean([1 2; 3 4]);', 'r', [2, 3]],
  ['r = median([3 1 4 1 5]);', 'r', 3],
  ['r = mode([1 2 2 3 3]);', 'r', 2],
  ['r = std([2 4 4 4 5 5 7 9], 1);', 'r', 2],
  ['r = var([1 2 3 4]);', 'r', 1.6666666666666667],
  ['r = sum(magic(4), 2)\';', 'r', [34, 34, 34, 34]],
  ['r = sum(magic(3), \'all\');', 'r', 45],
  ['r = prod([1 2 3 4]);', 'r', 24],
  ['r = max([1 5; 7 2]);', 'r', [7, 5]],
  ['r = max([1 5; 7 2], [], 2)\';', 'r', [5, 7]],
  ['r = min([4 2 8], 3);', 'r', [3, 2, 3]],
  ['r = normcdf(0);', 'r', 0.5],
  ['r = normpdf(0);', 'r', 1 / Math.sqrt(2 * Math.PI)],
  ['R = corrcoef([1 2 3], [2 4 6.5]); r = R(1, 2) > 0.99;', 'r', 1],
  ['r = histcounts([1 2 2 3 3 3], [0.5 1.5 2.5 3.5]);', 'r', [1, 2, 3]],
  // 初等函数
  ['r = sqrt(16);', 'r', 4],
  ['r = abs(sqrt(-4));', 'r', 2],
  ['r = exp(1i * pi);', 'r', (v) => Math.abs(v.re[0] + 1) < 1e-15],
  ['r = log(-1);', 'r', (v) => Math.abs(v.im[0] - Math.PI) < 1e-15],
  ['r = (-8)^(1/3);', 'r', (v) => Math.abs(v.re[0] - 1) < 1e-12 && Math.abs(v.im[0] - Math.sqrt(3)) < 1e-12],
  ['r = nthroot(-8, 3);', 'r', -2],
  ['r = round(2.5);', 'r', 3],
  ['r = round(-2.5);', 'r', -3],
  ['r = round(pi, 2);', 'r', 3.14],
  ['r = fix(-2.7);', 'r', -2],
  ['r = sind(30);', 'r', 0.5],
  ['r = atan2(1, 1);', 'r', Math.PI / 4],
  ['r = gamma(5);', 'r', 24],
  ['r = gamma(0.5);', 'r', Math.sqrt(Math.PI)],
  ['r = erf(0.5);', 'r', 0.5204998778130465],
  ['r = factorial(10);', 'r', 3628800],
  ['r = nchoosek(6, 2);', 'r', 15],
  ['r = gcd(48, 18);', 'r', 6],
  ['r = lcm(4, 6);', 'r', 12],
  ['r = primes(10);', 'r', [2, 3, 5, 7]],
  ['r = factor(60);', 'r', [2, 2, 3, 5]],
  ['r = int8(127) + int8(10);', 'r', 127],
  ['r = uint8(3.5);', 'r', 4],
  ['r = class(int16(5) * 2.6);', 'r', 'int16'],
  ['r = int16(5) * 2.6;', 'r', 13],
  // 字符串
  ["r = sprintf('%d-%s', 5, 'ok');", 'r', '5-ok'],
  ["r = sprintf('%5.2f|', [1 2]);", 'r', ' 1.00| 2.00|'],
  ["r = sprintf('%g', 0.0001);", 'r', '0.0001'],
  ["r = sprintf('%e', 12345.678);", 'r', '1.234568e+04'],
  ["r = sprintf('%x %o %c', 255, 8, 65);", 'r', 'ff 10 A'],
  ["r = num2str(pi);", 'r', '3.1416'],
  ["r = num2str(42);", 'r', '42'],
  ["r = num2str(3.14159, 3);", 'r', '3.14'],
  ["r = mat2str([1 2; 3 4]);", 'r', '[1 2;3 4]'],
  ["r = str2double('2.5e3');", 'r', 2500],
  ["r = str2num('[1 2 3]');", 'r', [1, 2, 3]],
  ["r = upper('abc');", 'r', 'ABC'],
  ["r = strrep('hello world', 'o', '0');", 'r', 'hell0 w0rld'],
  ["r = strtrim('  x y  ');", 'r', 'x y'],
  ["c = strsplit('a,b,,c', ','); r = numel(c);", 'r', 4],
  ["r = strjoin({'a', 'b', 'c'}, '-');", 'r', 'a-b-c'],
  ["r = strcmp('abc', 'abc');", 'r', 1],
  ["r = strcmp({'a', 'b'}, 'b');", 'r', [0, 1]],
  ["r = strfind('abcabc', 'bc');", 'r', [2, 5]],
  ["r = regexprep('a1b22', '\\d+', '#');", 'r', 'a#b#'],
  ["t = regexp('x=12, y=345', '(\\w)=(\\d+)', 'tokens'); r = t{2}{2};", 'r', '345'],
  ["r = ['abc', 'def'];", 'r', 'abcdef'],
  ["r = double('A');", 'r', 65],
  ["r = char([72 105]);", 'r', 'Hi'],
  ["r = lower(fliplr('ABC'));", 'r', 'cba'],
  ["r = dec2bin(10);", 'r', '1010'],
  ["r = bin2dec('1111');", 'r', 15],
  ["r = dec2hex(255);", 'r', 'FF'],
  ["r = contains('MatWeb', 'Web');", 'r', 1],
  ["r = length('hello');", 'r', 5],
  // 数据结构
  ["m = containers.Map(); m('a') = 1; m('b') = 2; r = m.Count;", 'r', 2],
  ["m = containers.Map({'x', 'y'}, {10, 20}); r = m('y');", 'r', 20],
  ["s = struct('a', 1, 'b', 2); r = numel(fieldnames(s));", 'r', 2],
  ["s = struct('a', 1); s = rmfield(s, 'a'); r = isempty(fieldnames(s));", 'r', 1],
  ["r = isfield(struct('a', 1), 'a');", 'r', 1],
  ["r = cell2mat({1 2; 3 4});", 'r', [[1, 2], [3, 4]]],
  ["r = iscell(num2cell([1 2]));", 'r', 1],
  ["[a, b] = deal(1, 2); r = a + b;", 'r', 3],
  ["r = isequal([1 2], [1 2]);", 'r', 1],
  // 矩阵构造
  ['r = size(zeros(2, 3));', 'r', [2, 3]],
  ['r = magic(3);', 'r', [[8, 1, 6], [3, 5, 7], [4, 9, 2]]],
  ['r = sum(magic(6));', 'r', [111, 111, 111, 111, 111, 111]],
  ['r = sum(diag(magic(8)));', 'r', 260],
  ['r = repmat([1 2], 2, 2);', 'r', [[1, 2, 1, 2], [1, 2, 1, 2]]],
  ['r = reshape(1:6, 2, 3);', 'r', [[1, 3, 5], [2, 4, 6]]],
  ['r = fliplr([1 2 3]);', 'r', [3, 2, 1]],
  ['r = circshift([1 2 3 4], 1);', 'r', [4, 1, 2, 3]],
  ['r = unique([3 1 2 3 1]);', 'r', [1, 2, 3]],
  ['r = find([0 1 0 1]);', 'r', [2, 4]],
  ['r = linspace(0, 1, 3);', 'r', [0, 0.5, 1]],
  ['r = tril(ones(3));', 'r', [[1, 0, 0], [1, 1, 0], [1, 1, 1]]],
  ['[X, Y] = meshgrid(1:2, 1:3); r = size(X);', 'r', [3, 2]],
  ['r = intersect([1 2 3], [2 3 4]);', 'r', [2, 3]],
  ['r = setdiff([5 1 3], [1]);', 'r', [3, 5]],
  ['r = ismember([1 5], [1 2 3]);', 'r', [1, 0]],
  ['r = sort([3 1 2], \'descend\');', 'r', [3, 2, 1]],
  ['r = any([0 0 1]);', 'r', 1],
  ['r = all([1 1 0]);', 'r', 0],
  ['r = nnz([1 0 2 0]);', 'r', 2],
  ['r = polyarea([0 1 1 0], [0 0 1 1]);', 'r', 1],
  ['r = isrow(1:3) && iscolumn((1:3)\');', 'r', 1],
  // 文件
  ['x = [1 2; 3 4]; save(\'t.mat\', \'x\'); clear x; load(\'t.mat\'); r = x;', 'r', [[1, 2], [3, 4]]],
  ["csvwrite('m.csv', [1 2; 3 4]); r = csvread('m.csv');", 'r', [[1, 2], [3, 4]]],
  ["f = fopen('t.txt', 'w'); fprintf(f, 'line1\\nline2\\n'); fclose(f); f = fopen('t.txt'); a = fgetl(f); r = fgetl(f); fclose(f);", 'r', 'line2'],
  // 图形模型
  ['h = plot(1:3); r = numel(get(h, \'XData\'));', 'r', 3],
  ['figure; subplot(2,1,1); plot(1:3); subplot(2,1,2); h = gca; r = isgraphics(h);', 'r', 1],
  ['close all; r = 1;', 'r', 1]
];

function toMatrix(v) {
  if (typeof v === 'number') return { rows: 1, cols: 1, data: [v] };
  if (Array.isArray(v) && Array.isArray(v[0])) {
    const rows = v.length, cols = v[0].length, data = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) data.push(v[r][c]);
    return { rows, cols, data };
  }
  return { rows: 1, cols: v.length, data: v };
}

const s = makeSession();
let pass = 0, fail = 0;
for (const [code, name, expected] of cases) {
  s.interp.base.vars.clear();
  const out = s.run(code);
  const v = s.interp.getVar(s.interp.base, name);
  let ok = false, got = '';
  try {
    if (v === undefined) got = '(未定义) ' + out.trim();
    else if (typeof expected === 'function') { ok = !!expected(v); got = Array.from(v.re || []).join(','); }
    else if (typeof expected === 'string') { got = v.toStr ? v.toStr() : String(v); ok = got === expected; }
    else {
      const e = toMatrix(expected);
      got = v.rows + 'x' + v.cols + ' [' + Array.from(v.re).map((x) => +x.toPrecision(10)).join(',') + ']';
      ok = v.rows === e.rows && v.cols === e.cols && e.data.every((x, k) => Math.abs(x - v.re[k]) <= 1e-9 * Math.max(1, Math.abs(x)));
      if (v.im && ok) ok = Array.from(v.im).every((x) => Math.abs(x) < 1e-9);
    }
  } catch (e) { got = 'EXCEPTION ' + e.message; }
  if (ok) pass++;
  else { fail++; console.log('✗ ' + code.replace(/\n/g, ' ⏎ ') + '\n    期望: ' + JSON.stringify(typeof expected === 'function' ? 'predicate' : expected) + '\n    实际: ' + got + (out.indexOf('错误') >= 0 ? '\n    输出: ' + out.trim() : '')); }
}
console.log('\n通过 ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
