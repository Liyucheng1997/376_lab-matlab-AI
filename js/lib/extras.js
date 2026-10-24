/* MatWeb - 其它常用函数：示例数据、几何、坐标变换、位运算 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor } = T;
  const H = ML.H, def = ML.def, err = ML.err;
  const D = (cat, syn, desc) => ({ cat, syn, desc });

  function peaksZ(x, y) {
    return 3 * (1 - x) ** 2 * Math.exp(-(x * x) - (y + 1) ** 2) - 10 * (x / 5 - x ** 3 - y ** 5) * Math.exp(-x * x - y * y) - 1 / 3 * Math.exp(-((x + 1) ** 2) - y * y);
  }
  def('peaks', (a, nargout, it) => {
    let X, Y;
    if (a.length >= 2) { X = H.tensor(a[0]); Y = H.tensor(a[1]); }
    else {
      let v;
      if (a.length === 1 && a[0].numel > 1) v = H.toArray(a[0]);
      else { const n = a.length ? H.int(a[0]) : 49; v = []; for (let k = 0; k < n; k++) v.push(n === 1 ? -3 : -3 + 6 * k / (n - 1)); }
      [X, Y] = ML.builtins.meshgrid([T.row(v)], 2);
    }
    const Z = new Tensor(X.rows, X.cols);
    for (let k = 0; k < X.numel; k++) Z.re[k] = peaksZ(X.re[k], Y.re[k]);
    if (nargout === 0) { ML.builtins.surf([X, Y, Z], 0, it); return null; }
    if (nargout >= 3) return [X, Y, Z];
    return Z;
  }, D('绘图', 'Z = peaks(n), [X,Y,Z] = peaks(n)', '示例函数（含峰谷的二元函数），常用于演示 surf/contour'));
  def('sphere', (a, nargout, it) => {
    const n = a.length ? H.int(a[0]) : 20;
    const X = new Tensor(n + 1, n + 1), Y = new Tensor(n + 1, n + 1), Z = new Tensor(n + 1, n + 1);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const phi = (-n + 2 * i) / n * Math.PI / 2, th = (-n + 2 * j) / n * Math.PI;
      const k = i + j * (n + 1);
      X.re[k] = Math.cos(phi) * Math.cos(th); Y.re[k] = Math.cos(phi) * Math.sin(th); Z.re[k] = Math.sin(phi);
    }
    if (nargout === 0) { ML.builtins.surf([X, Y, Z], 0, it); ML.builtins.axis([T.str('equal')], 0, it); return null; }
    return [X, Y, Z];
  }, D('绘图', '[X,Y,Z] = sphere(n)', '单位球面坐标'));
  def('cylinder', (a, nargout, it) => {
    const r = a.length && a[0].numel ? H.toArray(a[0]) : [1, 1];
    const n = a.length > 1 ? H.int(a[1]) : 20;
    const rr = r.length === 1 ? [r[0], r[0]] : r;
    const m = rr.length;
    const X = new Tensor(m, n + 1), Y = new Tensor(m, n + 1), Z = new Tensor(m, n + 1);
    for (let i = 0; i < m; i++) for (let j = 0; j <= n; j++) {
      const th = 2 * Math.PI * j / n, k = i + j * m;
      X.re[k] = rr[i] * Math.cos(th); Y.re[k] = rr[i] * Math.sin(th); Z.re[k] = m === 1 ? 0 : i / (m - 1);
    }
    if (nargout === 0) { ML.builtins.surf([X, Y, Z], 0, it); return null; }
    return [X, Y, Z];
  }, D('绘图', '[X,Y,Z] = cylinder(r,n)', '圆柱面坐标（r 可为半径剖面）'));
  def('ellipsoid', (a, nargout, it) => {
    const [xc, yc, zc, xr, yr, zr] = a.slice(0, 6).map((v) => H.num(v));
    const n = a.length > 6 ? H.int(a[6]) : 20;
    const [X, Y, Z] = ML.builtins.sphere([T.scalar(n)], 3, it);
    for (let k = 0; k < X.numel; k++) { X.re[k] = xc + xr * X.re[k]; Y.re[k] = yc + yr * Y.re[k]; Z.re[k] = zc + zr * Z.re[k]; }
    if (nargout === 0) { ML.builtins.surf([X, Y, Z], 0, it); ML.builtins.axis([T.str('equal')], 0, it); return null; }
    return [X, Y, Z];
  }, D('绘图', '[X,Y,Z] = ellipsoid(xc,yc,zc,xr,yr,zr)', '椭球面坐标'));
  def('polyarea', (a) => {
    const x = H.toArray(a[0]), y = H.toArray(a[1]);
    if (x.length !== y.length) err('polyarea: X 和 Y 的长度必须相同。');
    let s = 0; for (let i = 0; i < x.length; i++) { const j = (i + 1) % x.length; s += x[i] * y[j] - x[j] * y[i]; }
    return T.scalar(Math.abs(s) / 2);
  }, D('几何', 'A = polyarea(x,y)', '多边形面积（鞋带公式）'));
  def('inpolygon', (a, nargout) => {
    const xq = H.tensor(a[0]), yq = H.tensor(a[1]), xv = H.toArray(a[2]), yv = H.toArray(a[3]);
    const IN = new Tensor(xq.rows, xq.cols, null, null, 'logical'), ON = new Tensor(xq.rows, xq.cols, null, null, 'logical');
    const n = xv.length;
    for (let k = 0; k < xq.numel; k++) {
      const px = xq.re[k], py = yq.re[k];
      let inside = false, on = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = xv[i], yi = yv[i], xj = xv[j], yj = yv[j];
        const cross = (px - xi) * (yj - yi) - (py - yi) * (xj - xi);
        if (Math.abs(cross) < 1e-12 && px >= Math.min(xi, xj) - 1e-12 && px <= Math.max(xi, xj) + 1e-12 && py >= Math.min(yi, yj) - 1e-12 && py <= Math.max(yi, yj) + 1e-12) on = true;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
      }
      IN.re[k] = inside || on ? 1 : 0; ON.re[k] = on ? 1 : 0;
    }
    return [IN, ON];
  }, D('几何', '[in,on] = inpolygon(xq,yq,xv,yv)', '判断点是否在多边形内'));
  def('sinc', (a) => H.map(a[0], (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))), D('信号处理', 'sinc(x)', 'sinc 函数 sin(πx)/(πx)'));
  def('cart2pol', (a) => { const x = H.tensor(a[0]), y = H.tensor(a[1]); return [ML.ops.elementwise(x, y, (p, q) => Math.atan2(q, p), null, 'double'), ML.ops.elementwise(x, y, (p, q) => Math.hypot(p, q), null, 'double')]; }, D('几何', '[theta,rho] = cart2pol(x,y)', '笛卡尔坐标转极坐标'));
  def('pol2cart', (a) => { const t = H.tensor(a[0]), r = H.tensor(a[1]); return [ML.ops.elementwise(t, r, (p, q) => q * Math.cos(p), null, 'double'), ML.ops.elementwise(t, r, (p, q) => q * Math.sin(p), null, 'double')]; }, D('几何', '[x,y] = pol2cart(theta,rho)', '极坐标转笛卡尔坐标'));
  def('cart2sph', (a) => {
    const x = H.toArray(a[0]), y = H.toArray(a[1]), z = H.toArray(a[2]); const sh = H.tensor(a[0]);
    const mk = (f) => new Tensor(sh.rows, sh.cols, Float64Array.from(x.map((v, i) => f(v, y[i], z[i]))));
    return [mk((p, q) => Math.atan2(q, p)), mk((p, q, r) => Math.atan2(r, Math.hypot(p, q))), mk((p, q, r) => Math.hypot(p, q, r))];
  }, D('几何', '[az,el,r] = cart2sph(x,y,z)', '笛卡尔坐标转球坐标'));
  def('sph2cart', (a) => {
    const az = H.toArray(a[0]), el = H.toArray(a[1]), r = H.toArray(a[2]); const sh = H.tensor(a[0]);
    const mk = (f) => new Tensor(sh.rows, sh.cols, Float64Array.from(az.map((v, i) => f(v, el[i], r.length === 1 ? r[0] : r[i]))));
    return [mk((p, q, s) => s * Math.cos(q) * Math.cos(p)), mk((p, q, s) => s * Math.cos(q) * Math.sin(p)), mk((p, q, s) => s * Math.sin(q))];
  }, D('几何', '[x,y,z] = sph2cart(az,el,r)', '球坐标转笛卡尔坐标'));
  def('vecnorm', (a) => {
    const A = H.tensor(a[0]); const p = a.length > 1 ? H.num(a[1]) : 2; const dim = a.length > 2 ? H.int(a[2]) : (A.rows !== 1 ? 1 : 2);
    return H.reduce(A, dim, (arr) => (p === Infinity ? Math.max(...arr.map(Math.abs)) : Math.pow(arr.reduce((s, v) => s + Math.pow(Math.abs(v), p), 0), 1 / p)));
  }, D('线性代数', 'vecnorm(A,p,dim)', '向量范数（按列）'));
  def('wrapToPi', (a) => H.map(a[0], (x) => { let y = ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; if (y === -Math.PI && x > 0) y = Math.PI; return y; }), D('三角函数', 'wrapToPi(x)', '将角度折算到 [-π, π]'));
  def('wrapTo2Pi', (a) => H.map(a[0], (x) => { const y = ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return y === 0 && x > 0 ? 2 * Math.PI : y; }), D('三角函数', 'wrapTo2Pi(x)', '将角度折算到 [0, 2π]'));
  def('nextpow2', (a) => H.map(a[0], (x) => (x === 0 ? 0 : Math.ceil(Math.log2(Math.abs(x))))), D('初等数学', 'nextpow2(n)', '满足 2^p ≥ |n| 的最小 p'));
  const bit = (f) => (a) => ML.ops.elementwise(H.tensor(a[0]), H.tensor(a[1]), (x, y) => f(x, y), null, 'double');
  const big = (x) => BigInt(Math.round(x));
  def('bitand', bit((x, y) => Number(big(x) & big(y))), D('初等数学', 'bitand(a,b)', '按位与'));
  def('bitor', bit((x, y) => Number(big(x) | big(y))), D('初等数学', 'bitor(a,b)', '按位或'));
  def('bitxor', bit((x, y) => Number(big(x) ^ big(y))), D('初等数学', 'bitxor(a,b)', '按位异或'));
  def('bitshift', bit((x, k) => (k >= 0 ? x * Math.pow(2, k) : Math.floor(x / Math.pow(2, -k)))), D('初等数学', 'bitshift(a,k)', '按位移位'));
  def('fibonacci', (a) => {
    const n = H.tensor(a[0]);
    return H.map(n, (k) => { let p = 0, q = 1; for (let i = 0; i < k; i++) { const t = p + q; p = q; q = t; } return p; });
  }, D('数论', 'fibonacci(n)', '斐波那契数 F(n)'));
  def('legendre', (a) => {
    const n = H.int(a[0]); const X = H.toArray(a[1]);
    // 关联勒让德函数 P_n^m(x)，m = 0..n
    const out = new Tensor(n + 1, X.length);
    X.forEach((x, j) => {
      for (let m = 0; m <= n; m++) {
        let pmm = 1;
        const somx2 = Math.sqrt((1 - x) * (1 + x));
        let fact = 1;
        for (let i = 1; i <= m; i++) { pmm *= -fact * somx2; fact += 2; }
        let val;
        if (n === m) val = pmm;
        else {
          let pmmp1 = x * (2 * m + 1) * pmm;
          if (n === m + 1) val = pmmp1;
          else { let pll = 0; for (let ll = m + 2; ll <= n; ll++) { pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m); pmm = pmmp1; pmmp1 = pll; } val = pll; }
        }
        out.re[m + j * (n + 1)] = val;
      }
    });
    return out;
  }, D('特殊函数', 'P = legendre(n,x)', '关联勒让德函数'));
})(typeof self !== 'undefined' ? self : globalThis);
