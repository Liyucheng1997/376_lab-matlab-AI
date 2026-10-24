/* MatWeb - 线性代数：LU、QR、Cholesky、特征值、SVD、求解、矩阵函数 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const T = ML.types;
  const { Tensor } = T;
  const err = ML.err;
  const EPS = Math.pow(2, -52);

  const warn = (msg) => { if (ML.warn) ML.warn(msg); };

  function rm(t) { return T.toRows(t); }
  function fromRM(a, rows, cols) {
    if (rows === undefined) { rows = a.length; cols = rows ? a[0].length : 0; }
    const t = new Tensor(rows, cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t.re[r + c * rows] = a[r][c];
    return t;
  }
  function identity(n) { const a = []; for (let i = 0; i < n; i++) { const r = new Array(n).fill(0); r[i] = 1; a.push(r); } return a; }
  function zerosRM(m, n) { const a = []; for (let i = 0; i < m; i++) a.push(new Array(n).fill(0)); return a; }
  function requireReal(A, fname) { if (A.im) err(fname + ' 暂不支持复数矩阵。'); }
  function requireSquare(A, fname) { if (A.rows !== A.cols) err(fname + ' 的输入必须为方阵。'); }
  function checkFinite(A, fname) {
    for (let k = 0; k < A.re.length; k++) if (!Number.isFinite(A.re[k])) err(fname + ' 的输入不能包含 Inf 或 NaN。');
  }

  // ---------- LU 分解（部分主元）----------
  function luRM(a) {
    const m = a.length, n = m ? a[0].length : 0;
    const piv = []; for (let i = 0; i < m; i++) piv.push(i);
    let sign = 1, singular = false;
    const kmax = Math.min(m, n);
    for (let k = 0; k < kmax; k++) {
      let p = k, maxv = Math.abs(a[k][k]);
      for (let i = k + 1; i < m; i++) { const v = Math.abs(a[i][k]); if (v > maxv) { maxv = v; p = i; } }
      if (p !== k) { const t = a[p]; a[p] = a[k]; a[k] = t; const tp = piv[p]; piv[p] = piv[k]; piv[k] = tp; sign = -sign; }
      const akk = a[k][k];
      if (akk === 0) { singular = true; continue; }
      for (let i = k + 1; i < m; i++) {
        const f = a[i][k] / akk;
        a[i][k] = f;
        if (f !== 0) { const ai = a[i], ak = a[k]; for (let j = k + 1; j < n; j++) ai[j] -= f * ak[j]; }
      }
    }
    return { LU: a, piv, sign, singular };
  }

  function lu(A) {
    requireReal(A, 'lu');
    const m = A.rows, n = A.cols;
    const { LU, piv } = luRM(rm(A));
    const k = Math.min(m, n);
    const L = zerosRM(m, k), U = zerosRM(k, n), P = zerosRM(m, m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < k; j++) L[i][j] = i === j ? 1 : (i > j ? LU[i][j] : 0);
      P[i][piv[i]] = 1;
    }
    for (let i = 0; i < k; i++) for (let j = i; j < n; j++) U[i][j] = LU[i][j];
    return { L: fromRM(L, m, k), U: fromRM(U, k, n), P: fromRM(P, m, m), piv };
  }

  function det(A) {
    requireSquare(A, 'det');
    const n = A.rows;
    if (n === 0) return [1, 0];
    if (A.im) {
      const { re, im } = cplxRM(A);
      const r = cluRM(re, im);
      let dr = r.sign, di = 0;
      for (let i = 0; i < n; i++) { const xr = r.re[i][i], xi = r.im[i][i]; const t = dr * xr - di * xi; di = dr * xi + di * xr; dr = t; }
      return [dr, di];
    }
    const { LU, sign } = luRM(rm(A));
    let d = sign;
    for (let i = 0; i < n; i++) d *= LU[i][i];
    return [d, 0];
  }

  // ---------- 复数高斯消元 ----------
  function cplxRM(A) { return { re: T.toRows(A), im: T.toRowsIm(A) }; }
  function cluRM(re, im) {
    const n = re.length;
    const piv = []; for (let i = 0; i < n; i++) piv.push(i);
    let sign = 1, singular = false;
    for (let k = 0; k < n; k++) {
      let p = k, maxv = Math.hypot(re[k][k], im[k][k]);
      for (let i = k + 1; i < n; i++) { const v = Math.hypot(re[i][k], im[i][k]); if (v > maxv) { maxv = v; p = i; } }
      if (p !== k) {
        let t = re[p]; re[p] = re[k]; re[k] = t; t = im[p]; im[p] = im[k]; im[k] = t;
        const tp = piv[p]; piv[p] = piv[k]; piv[k] = tp; sign = -sign;
      }
      const pr = re[k][k], pi = im[k][k];
      const d = pr * pr + pi * pi;
      if (d === 0) { singular = true; continue; }
      for (let i = k + 1; i < n; i++) {
        const xr = re[i][k], xi = im[i][k];
        const fr = (xr * pr + xi * pi) / d, fi = (xi * pr - xr * pi) / d;
        re[i][k] = fr; im[i][k] = fi;
        for (let j = k + 1; j < n; j++) {
          const ur = re[k][j], ui = im[k][j];
          re[i][j] -= fr * ur - fi * ui; im[i][j] -= fr * ui + fi * ur;
        }
      }
    }
    return { re, im, piv, sign, singular };
  }
  // 求解复数方程组，B: 多个右端项（行优先 re/im）
  function csolveSquare(Are, Aim, Bre, Bim) {
    const n = Are.length, nr = Bre[0].length;
    const f = cluRM(Are, Aim);
    const Xr = zerosRM(n, nr), Xi = zerosRM(n, nr);
    for (let c = 0; c < nr; c++) {
      const yr = new Array(n), yi = new Array(n);
      for (let i = 0; i < n; i++) {
        let sr = Bre[f.piv[i]][c], si = Bim[f.piv[i]][c];
        for (let j = 0; j < i; j++) { const lr = f.re[i][j], li = f.im[i][j]; sr -= lr * yr[j] - li * yi[j]; si -= lr * yi[j] + li * yr[j]; }
        yr[i] = sr; yi[i] = si;
      }
      for (let i = n - 1; i >= 0; i--) {
        let sr = yr[i], si = yi[i];
        for (let j = i + 1; j < n; j++) { const ur = f.re[i][j], ui = f.im[i][j]; sr -= ur * Xr[j][c] - ui * Xi[j][c]; si -= ur * Xi[j][c] + ui * Xr[j][c]; }
        const pr = f.re[i][i], pi = f.im[i][i], d = pr * pr + pi * pi;
        Xr[i][c] = (sr * pr + si * pi) / d; Xi[i][c] = (si * pr - sr * pi) / d;
      }
    }
    return { Xr, Xi, singular: f.singular, f };
  }

  // ---------- 求解线性方程组 A\B ----------
  function solve(A, B) {
    const m = A.rows, n = A.cols;
    if (A.im || B.im) {
      if (m !== n) {
        // 复数最小二乘：正规方程
        const AH = ML.ops.ctranspose(A);
        return solve(ML.ops.mtimes(AH, A), ML.ops.mtimes(AH, B));
      }
      const a = cplxRM(A), b = cplxRM(B);
      const r = csolveSquare(a.re, a.im, b.re, b.im);
      if (r.singular) warn('矩阵为奇异工作精度。');
      const X = fromRM(r.Xr, n, B.cols); X.im = fromRM(r.Xi, n, B.cols).re;
      return X.trim();
    }
    if (m === n) {
      const f = luRM(rm(A));
      const nr = B.cols;
      const b = rm(B);
      const X = zerosRM(n, nr);
      let minP = Infinity, maxP = 0;
      for (let i = 0; i < n; i++) { const v = Math.abs(f.LU[i][i]); if (v < minP) minP = v; if (v > maxP) maxP = v; }
      if (f.singular || minP === 0) warn('矩阵为奇异工作精度。');
      else if (minP / maxP < EPS * 10) warn('矩阵接近奇异值，或者缩放不良。结果可能不准确。RCOND = ' + (minP / maxP).toExponential(6) + '。');
      for (let c = 0; c < nr; c++) {
        const y = new Array(n);
        for (let i = 0; i < n; i++) {
          let s = b[f.piv[i]][c];
          const Li = f.LU[i];
          for (let j = 0; j < i; j++) s -= Li[j] * y[j];
          y[i] = s;
        }
        for (let i = n - 1; i >= 0; i--) {
          let s = y[i];
          const Ui = f.LU[i];
          for (let j = i + 1; j < n; j++) s -= Ui[j] * X[j][c];
          X[i][c] = s / Ui[i];
        }
      }
      return fromRM(X, n, nr);
    }
    if (m > n) {
      // 超定：Householder QR 最小二乘
      const { Q, R } = qrRM(rm(A));
      let rank = 0; const tol = Math.max(m, n) * EPS * Math.abs(R[0] ? R[0][0] : 0);
      for (let i = 0; i < n; i++) if (Math.abs(R[i][i]) > tol) rank++;
      if (rank < n) {
        warn('秩亏，秩 = ' + rank + '，容差 = ' + tol.toExponential(4) + '。');
        return ML.ops.mtimes(pinv(A), B);
      }
      const b = rm(B), nr = B.cols;
      const X = zerosRM(n, nr);
      for (let c = 0; c < nr; c++) {
        const qtb = new Array(n).fill(0);
        for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < m; k++) s += Q[k][i] * b[k][c]; qtb[i] = s; }
        for (let i = n - 1; i >= 0; i--) {
          let s = qtb[i];
          for (let j = i + 1; j < n; j++) s -= R[i][j] * X[j][c];
          X[i][c] = s / R[i][i];
        }
      }
      return fromRM(X, n, nr);
    }
    // 欠定：最小范数解
    return ML.ops.mtimes(pinv(A), B);
  }

  function inv(A) {
    requireSquare(A, 'inv');
    const n = A.rows;
    const I = fromRM(identity(n), n, n);
    return solve(A, I);
  }

  // ---------- QR（Householder）----------
  function qrRM(A) {
    const m = A.length, n = m ? A[0].length : 0;
    const R = A.map((r) => r.slice());
    const Q = identity(m);
    const kmax = Math.min(m - 1, n);
    for (let k = 0; k < kmax; k++) {
      let norm = 0;
      for (let i = k; i < m; i++) norm += R[i][k] * R[i][k];
      norm = Math.sqrt(norm);
      if (norm === 0) continue;
      const alpha = R[k][k] > 0 ? -norm : norm;
      const v = new Array(m - k);
      for (let i = k; i < m; i++) v[i - k] = R[i][k];
      v[0] -= alpha;
      let vn = 0; for (let i = 0; i < v.length; i++) vn += v[i] * v[i];
      vn = Math.sqrt(vn);
      if (vn === 0) continue;
      for (let i = 0; i < v.length; i++) v[i] /= vn;
      for (let j = k; j < n; j++) {
        let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * R[k + i][j];
        s *= 2; for (let i = 0; i < v.length; i++) R[k + i][j] -= v[i] * s;
      }
      for (let i = 0; i < m; i++) {
        let s = 0; for (let j = 0; j < v.length; j++) s += Q[i][k + j] * v[j];
        s *= 2; for (let j = 0; j < v.length; j++) Q[i][k + j] -= s * v[j];
      }
      R[k][k] = alpha;
      for (let i = k + 1; i < m; i++) R[i][k] = 0;
    }
    return { Q, R };
  }
  function qr(A, econ) {
    requireReal(A, 'qr');
    const m = A.rows, n = A.cols;
    const { Q, R } = qrRM(rm(A));
    if (econ && m > n) {
      return { Q: fromRM(Q.map((r) => r.slice(0, n)), m, n), R: fromRM(R.slice(0, n), n, n) };
    }
    return { Q: fromRM(Q, m, m), R: fromRM(R, m, n) };
  }

  // ---------- Cholesky ----------
  function chol(A) {
    requireReal(A, 'chol'); requireSquare(A, 'chol');
    const n = A.rows, a = rm(A);
    const R = zerosRM(n, n);
    for (let j = 0; j < n; j++) {
      let s = a[j][j];
      for (let k = 0; k < j; k++) s -= R[k][j] * R[k][j];
      if (s <= 0) return { R: null, p: j + 1 };
      R[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) {
        let t = a[j][i];
        for (let k = 0; k < j; k++) t -= R[k][j] * R[k][i];
        R[j][i] = t / R[j][j];
      }
    }
    return { R: fromRM(R, n, n), p: 0 };
  }

  // ---------- 对称矩阵：Jacobi 特征值 ----------
  function isSymmetric(A, tol) {
    if (A.rows !== A.cols) return false;
    const n = A.rows; let scale = 0;
    for (let k = 0; k < A.re.length; k++) scale = Math.max(scale, Math.abs(A.re[k]));
    tol = tol === undefined ? 1e-13 * Math.max(scale, 1e-300) : tol;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(A.re[i + j * n] - A.re[j + i * n]) > tol) return false;
      if (A.im && Math.abs(A.im[i + j * n] + A.im[j + i * n]) > tol) return false;
    }
    if (A.im) for (let i = 0; i < n; i++) if (Math.abs(A.im[i + i * n]) > tol) return false;
    return true;
  }
  function jacobiEig(Ain) {
    const n = Ain.length;
    const a = Ain.map((r) => r.slice());
    const V = identity(n);
    let fro = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) fro += a[i][j] * a[i][j];
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off <= 1e-30 * fro || off === 0) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const vals = []; for (let i = 0; i < n; i++) vals.push(a[i][i]);
    const order = vals.map((v, i) => i).sort((x, y) => vals[x] - vals[y]);
    const sv = order.map((i) => vals[i]);
    const SV = zerosRM(n, n);
    for (let c = 0; c < n; c++) {
      // 统一符号：使每列第一个非零分量... 保持 MATLAB 风格（最后一个分量为正不强制）
      for (let r = 0; r < n; r++) SV[r][c] = V[r][order[c]];
    }
    return { values: sv, vectors: SV };
  }

  // ---------- 一般矩阵：平衡 + Hessenberg + QR (hqr) ----------
  function balance(a, n) { // 1 基索引
    const RADIX = 2, sqrdx = 4;
    let last = 0, guard = 0;
    while (last === 0 && guard++ < 200) {
      last = 1;
      for (let i = 1; i <= n; i++) {
        let r = 0, c = 0;
        for (let j = 1; j <= n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
        if (c && r) {
          let g = r / RADIX, f = 1; const s = c + r;
          while (c < g) { f *= RADIX; c *= sqrdx; }
          g = r * RADIX;
          while (c > g) { f /= RADIX; c /= sqrdx; }
          if ((c + r) / f < 0.95 * s) {
            last = 0; g = 1 / f;
            for (let j = 1; j <= n; j++) a[i][j] *= g;
            for (let j = 1; j <= n; j++) a[j][i] *= f;
          }
        }
      }
    }
  }
  function elmhes(a, n) {
    for (let m = 2; m < n; m++) {
      let x = 0, i = m;
      for (let j = m; j <= n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
      if (i !== m) {
        for (let j = m - 1; j <= n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
        for (let j = 1; j <= n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
      }
      if (x) {
        for (i = m + 1; i <= n; i++) {
          let y = a[i][m - 1];
          if (y !== 0) {
            y /= x; a[i][m - 1] = y;
            for (let j = m; j <= n; j++) a[i][j] -= y * a[m][j];
            for (let j = 1; j <= n; j++) a[j][m] += y * a[j][i];
          }
        }
      }
    }
    for (let i = 1; i <= n; i++) for (let j = 1; j < i - 1; j++) a[i][j] = 0;
  }
  const SIGN = (a, b) => (b >= 0 ? Math.abs(a) : -Math.abs(a));
  function hqr(a, n, wr, wi) {
    let nn, m, l, k, j, its, i, mmin;
    let z = 0, y, x, w, v, u, t, s, r = 0, q = 0, p = 0, anorm = 0;
    for (i = 1; i <= n; i++) for (j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
    nn = n; t = 0;
    while (nn >= 1) {
      its = 0;
      do {
        for (l = nn; l >= 2; l--) {
          s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
          if (s === 0) s = anorm;
          if (Math.abs(a[l][l - 1]) <= EPS * s) { a[l][l - 1] = 0; break; }
        }
        x = a[nn][nn];
        if (l === nn) {
          wr[nn] = x + t; wi[nn--] = 0;
        } else {
          y = a[nn - 1][nn - 1];
          w = a[nn][nn - 1] * a[nn - 1][nn];
          if (l === nn - 1) {
            p = 0.5 * (y - x);
            q = p * p + w;
            z = Math.sqrt(Math.abs(q));
            x += t;
            if (q >= 0) {
              z = p + SIGN(z, p);
              wr[nn - 1] = wr[nn] = x + z;
              if (z) wr[nn] = x - w / z;
              wi[nn - 1] = wi[nn] = 0;
            } else {
              wr[nn - 1] = wr[nn] = x + p;
              wi[nn - 1] = -(wi[nn] = z);
            }
            nn -= 2;
          } else {
            if (its === 60) err('eig: 特征值迭代未收敛。');
            if (its === 10 || its === 20 || its === 40) {
              t += x;
              for (i = 1; i <= nn; i++) a[i][i] -= x;
              s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
              y = x = 0.75 * s;
              w = -0.4375 * s * s;
            }
            ++its;
            for (m = nn - 2; m >= l; m--) {
              z = a[m][m];
              r = x - z;
              s = y - z;
              p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
              q = a[m + 1][m + 1] - z - r - s;
              r = a[m + 2][m + 1];
              s = Math.abs(p) + Math.abs(q) + Math.abs(r);
              p /= s; q /= s; r /= s;
              if (m === l) break;
              u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
              v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
              if (u <= EPS * v) break;
            }
            for (i = m + 2; i <= nn; i++) {
              a[i][i - 2] = 0;
              if (i !== m + 2) a[i][i - 3] = 0;
            }
            for (k = m; k <= nn - 1; k++) {
              if (k !== m) {
                p = a[k][k - 1];
                q = a[k + 1][k - 1];
                r = 0;
                if (k !== nn - 1) r = a[k + 2][k - 1];
                if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
              }
              if ((s = SIGN(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
                if (k === m) {
                  if (l !== m) a[k][k - 1] = -a[k][k - 1];
                } else a[k][k - 1] = -s * x;
                p += s;
                x = p / s; y = q / s; z = r / s; q /= p; r /= p;
                for (j = k; j <= nn; j++) {
                  p = a[k][j] + q * a[k + 1][j];
                  if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; }
                  a[k + 1][j] -= p * y;
                  a[k][j] -= p * x;
                }
                mmin = nn < k + 3 ? nn : k + 3;
                for (i = l; i <= mmin; i++) {
                  p = x * a[i][k] + y * a[i][k + 1];
                  if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; }
                  a[i][k + 1] -= p * q;
                  a[i][k] -= p;
                }
              }
            }
          }
        }
      } while (l < nn - 1);
    }
  }
  function eigvalsGeneral(A) {
    const n = A.rows;
    const a = [new Array(n + 1).fill(0)];
    for (let i = 0; i < n; i++) { const r = [0]; for (let j = 0; j < n; j++) r.push(A.re[i + j * n]); a.push(r); }
    balance(a, n);
    elmhes(a, n);
    const wr = new Array(n + 1).fill(0), wi = new Array(n + 1).fill(0);
    hqr(a, n, wr, wi);
    const vals = [];
    for (let i = 1; i <= n; i++) vals.push([wr[i], wi[i]]);
    return vals;
  }
  // 逆迭代求特征向量
  function inverseIteration(A, lr, li, seed) {
    const n = A.rows;
    let anorm = 0; for (let k = 0; k < A.re.length; k++) anorm = Math.max(anorm, Math.abs(A.re[k]));
    const pert = Math.max(anorm, 1) * 1e-10;
    const Mr = rm(A), Mi = zerosRM(n, n);
    for (let i = 0; i < n; i++) { Mr[i][i] -= lr + pert; Mi[i][i] -= li; }
    const f = cluRM(Mr, Mi);
    for (let i = 0; i < n; i++) if (f.re[i][i] === 0 && f.im[i][i] === 0) f.re[i][i] = EPS * Math.max(anorm, 1);
    let xr = new Array(n), xi = new Array(n).fill(0);
    for (let i = 0; i < n; i++) xr[i] = 1 + 0.37 * Math.sin(1.3 * (i + 1) * (seed + 1)) ;
    for (let it = 0; it < 4; it++) {
      // 解 (LU) y = P x
      const yr = new Array(n), yi = new Array(n);
      for (let i = 0; i < n; i++) {
        let sr = xr[f.piv[i]], si = xi[f.piv[i]];
        for (let j = 0; j < i; j++) { const a = f.re[i][j], b = f.im[i][j]; sr -= a * yr[j] - b * yi[j]; si -= a * yi[j] + b * yr[j]; }
        yr[i] = sr; yi[i] = si;
      }
      const zr = new Array(n), zi = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        let sr = yr[i], si = yi[i];
        for (let j = i + 1; j < n; j++) { const a = f.re[i][j], b = f.im[i][j]; sr -= a * zr[j] - b * zi[j]; si -= a * zi[j] + b * zr[j]; }
        const pr = f.re[i][i], pi = f.im[i][i], d = pr * pr + pi * pi;
        zr[i] = (sr * pr + si * pi) / d; zi[i] = (si * pr - sr * pi) / d;
      }
      let nrm = 0; for (let i = 0; i < n; i++) nrm += zr[i] * zr[i] + zi[i] * zi[i];
      nrm = Math.sqrt(nrm);
      if (!(nrm > 0) || !Number.isFinite(nrm)) break;
      for (let i = 0; i < n; i++) { xr[i] = zr[i] / nrm; xi[i] = zi[i] / nrm; }
    }
    // 归一化相位：使模最大的分量为正实数（实特征值时得到实向量）
    let bi = 0, bm = -1;
    for (let i = 0; i < n; i++) { const m = Math.hypot(xr[i], xi[i]); if (m > bm + 1e-12) { bm = m; bi = i; } }
    const pr = xr[bi] / bm, pi = -xi[bi] / bm;
    for (let i = 0; i < n; i++) { const a = xr[i], b = xi[i]; xr[i] = a * pr - b * pi; xi[i] = a * pi + b * pr; }
    if (li === 0) xi.fill(0);
    return { xr, xi };
  }

  // eig：返回 {D: [[re,im]...], V: Tensor|null}
  function eig(A, wantVectors) {
    requireSquare(A, 'eig');
    checkFinite(A, 'eig');
    const n = A.rows;
    if (n === 0) return { values: [], V: T.empty() };
    if (A.im) {
      if (!isSymmetric(A)) err('eig 暂不支持非 Hermitian 复数矩阵。');
      // Hermitian: 嵌入为 2n 实对称矩阵
      const M = zerosRM(2 * n, 2 * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const re = A.re[i + j * n], im = A.im[i + j * n];
        M[i][j] = re; M[i + n][j + n] = re; M[i][j + n] = -im; M[i + n][j] = im;
      }
      const r = jacobiEig(M);
      const vals = [], V = new Tensor(n, n); V.im = new Float64Array(n * n);
      for (let k = 0; k < n; k++) {
        const c = 2 * k; vals.push([r.values[c], 0]);
        for (let i = 0; i < n; i++) { V.re[i + k * n] = r.vectors[i][c]; V.im[i + k * n] = r.vectors[i + n][c]; }
      }
      return { values: vals, V: V.trim(), symmetric: true };
    }
    if (isSymmetric(A)) {
      const r = jacobiEig(rm(A));
      return { values: r.values.map((v) => [v, 0]), V: wantVectors ? fromRM(r.vectors, n, n) : null, symmetric: true };
    }
    let vals = eigvalsGeneral(A);
    // 排序：按实部升序，共轭对中虚部为正的在前
    vals.sort((x, y) => (Math.abs(x[0] - y[0]) > 1e-12 * Math.max(1, Math.abs(x[0])) ? x[0] - y[0] : y[1] - x[1]));
    // 清理极小虚部
    vals = vals.map((v) => [v[0], Math.abs(v[1]) < 1e-14 * Math.max(1, Math.abs(v[0])) ? 0 : v[1]]);
    if (!wantVectors) return { values: vals, V: null };
    const V = new Tensor(n, n); V.im = new Float64Array(n * n);
    for (let k = 0; k < n; k++) {
      let vec;
      if (k > 0 && vals[k][1] !== 0 && vals[k - 1][1] === -vals[k][1] && vals[k - 1][0] === vals[k][0]) {
        const prev = { xr: [], xi: [] };
        for (let i = 0; i < n; i++) { prev.xr.push(V.re[i + (k - 1) * n]); prev.xi.push(-V.im[i + (k - 1) * n]); }
        vec = prev;
      } else vec = inverseIteration(A, vals[k][0], vals[k][1], k);
      for (let i = 0; i < n; i++) { V.re[i + k * n] = vec.xr[i]; V.im[i + k * n] = vec.xi[i]; }
    }
    return { values: vals, V: V.trim() };
  }

  // ---------- SVD（单边 Jacobi）----------
  function svdRM(A) {
    let m = A.length, n = m ? A[0].length : 0;
    let transposed = false;
    if (m < n) {
      const At = zerosRM(n, m);
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) At[j][i] = A[i][j];
      A = At; const t = m; m = n; n = t; transposed = true;
    }
    const U = A.map((r) => r.slice());
    const V = identity(n);
    for (let sweep = 0; sweep < 80; sweep++) {
      let rotated = false;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; alpha += up * up; beta += uq * uq; gamma += up * uq; }
        if (gamma === 0 || Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; U[i][p] = c * up - s * uq; U[i][q] = s * up + c * uq; }
        for (let i = 0; i < n; i++) { const vp = V[i][p], vq = V[i][q]; V[i][p] = c * vp - s * vq; V[i][q] = s * vp + c * vq; }
      }
      if (!rotated) break;
    }
    const sv = new Array(n);
    for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += U[i][j] * U[i][j]; sv[j] = Math.sqrt(s); }
    const order = sv.map((v, i) => i).sort((a, b) => sv[b] - sv[a]);
    const S = order.map((i) => sv[i]);
    const Uo = zerosRM(m, n), Vo = zerosRM(n, n);
    for (let c = 0; c < n; c++) {
      const j = order[c];
      for (let i = 0; i < m; i++) Uo[i][c] = S[c] > 1e-300 ? U[i][j] / S[c] : 0;
      for (let i = 0; i < n; i++) Vo[i][c] = V[i][j];
    }
    // 补全 U 为 m×m 正交阵（Gram-Schmidt）
    const Uf = zerosRM(m, m);
    const cols = [];
    const tolS = Math.max(m, n) * EPS * (S[0] || 0);
    for (let c = 0; c < n; c++) {
      if (S[c] > tolS) cols.push(Uo.map((r) => r[c]));
      else cols.push(null);
    }
    const basis = cols.filter((v) => v);
    let e = 0;
    function nextVec() {
      while (e < m) {
        const v = new Array(m).fill(0); v[e++] = 1;
        for (const b of basis) { let d = 0; for (let i = 0; i < m; i++) d += b[i] * v[i]; for (let i = 0; i < m; i++) v[i] -= d * b[i]; }
        for (const b of basis) { let d = 0; for (let i = 0; i < m; i++) d += b[i] * v[i]; for (let i = 0; i < m; i++) v[i] -= d * b[i]; }
        let nv = 0; for (let i = 0; i < m; i++) nv += v[i] * v[i]; nv = Math.sqrt(nv);
        if (nv > 1e-8) { for (let i = 0; i < m; i++) v[i] /= nv; basis.push(v); return v; }
      }
      return new Array(m).fill(0);
    }
    for (let c = 0; c < n; c++) if (!cols[c]) cols[c] = nextVec();
    for (let c = n; c < m; c++) cols.push(nextVec());
    for (let c = 0; c < m; c++) for (let i = 0; i < m; i++) Uf[i][c] = cols[c][i];
    if (transposed) return { U: Vo, S, V: Uf, m: n, n: m };
    return { U: Uf, S, V: Vo, m, n };
  }
  function svd(A) {
    requireReal(A, 'svd'); checkFinite(A, 'svd');
    return svdRM(rm(A));
  }
  function singularValues(A) {
    if (A.numel === 0) return [];
    if (A.im) {
      // 复数：通过 A^H A 的特征值
      const AH = ML.ops.ctranspose(A);
      const M = A.rows >= A.cols ? ML.ops.mtimes(AH, A) : ML.ops.mtimes(A, AH);
      return eig(M, false).values.map((v) => Math.sqrt(Math.max(v[0], 0))).sort((a, b) => b - a);
    }
    return svd(A).S;
  }

  function pinv(A, tol) {
    requireReal(A, 'pinv');
    const m = A.rows, n = A.cols;
    if (m === 0 || n === 0) return new Tensor(n, m);
    const r = svd(A);
    const k = Math.min(m, n);
    if (tol === undefined) tol = Math.max(m, n) * (r.S[0] || 0) * EPS;
    const X = zerosRM(n, m);
    for (let c = 0; c < k; c++) {
      if (r.S[c] <= tol) continue;
      const inv = 1 / r.S[c];
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) X[i][j] += r.V[i][c] * inv * r.U[j][c];
    }
    return fromRM(X, n, m);
  }
  function rank(A, tol) {
    const S = singularValues(A);
    if (tol === undefined) tol = Math.max(A.rows, A.cols) * (S[0] || 0) * EPS;
    return S.filter((s) => s > tol).length;
  }

  // ---------- 矩阵函数 ----------
  function expm(A) {
    requireSquare(A, 'expm');
    const ops = ML.ops;
    const n = A.rows;
    let nrm = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += Math.hypot(A.re[i + j * n], A.im ? A.im[i + j * n] : 0);
      nrm = Math.max(nrm, s);
    }
    const s = Math.max(0, Math.ceil(Math.log2(nrm || 1)) + 1);
    let X = ops.rdivide(A, T.scalar(Math.pow(2, s)));
    const As = X;
    let c = 0.5;
    const I = ops.eye(n);
    let N = ops.plus(I, ops.times(T.scalar(c), As));
    let D = ops.minus(I, ops.times(T.scalar(c), As));
    const q = 6; let p = true;
    X = As;
    for (let k = 2; k <= q; k++) {
      c = c * (q - k + 1) / (k * (2 * q - k + 1));
      X = ops.mtimes(As, X);
      const cX = ops.times(T.scalar(c), X);
      N = ops.plus(N, cX);
      D = p ? ops.plus(D, cX) : ops.minus(D, cX);
      p = !p;
    }
    let E = solve(D, N);
    for (let k = 0; k < s; k++) E = ops.mtimes(E, E);
    return E;
  }
  // 通过特征分解计算矩阵函数 f(A)
  function funm(A, f) {
    requireSquare(A, 'funm');
    const n = A.rows;
    const r = eig(A, true);
    const V = r.V;
    const D = new Tensor(n, n); D.im = new Float64Array(n * n);
    const o = [0, 0];
    for (let k = 0; k < n; k++) { f(r.values[k][0], r.values[k][1], o); D.re[k + k * n] = o[0]; D.im[k + k * n] = o[1]; }
    const ops = ML.ops;
    let res;
    if (r.symmetric) res = ops.mtimes(ops.mtimes(V, D.trim()), ops.ctranspose(V));
    else res = ops.mrdivide(ops.mtimes(V, D.trim()), V);
    // 清理微小虚部
    if (res.im) {
      let mx = 0, mi = 0;
      for (let k = 0; k < res.re.length; k++) { mx = Math.max(mx, Math.abs(res.re[k])); mi = Math.max(mi, Math.abs(res.im[k])); }
      if (mi < 1e-12 * Math.max(mx, 1)) res.im = null;
    }
    return res;
  }

  function norm(A, p) {
    const ops = ML.ops;
    if (A.numel === 0) return 0;
    const isVec = A.rows === 1 || A.cols === 1;
    const absv = ops.abs(A).re;
    if (isVec) {
      if (p === undefined || p === 2) { let s = 0, sc = 0; for (const v of absv) sc = Math.max(sc, v); if (sc === 0) return 0; if (!Number.isFinite(sc)) return sc; for (const v of absv) s += (v / sc) * (v / sc); return sc * Math.sqrt(s); }
      if (p === Infinity) return Math.max(...absv);
      if (p === -Infinity) return Math.min(...absv);
      if (p === 'fro') return norm(A, 2);
      if (p === 1) return absv.reduce((a, b) => a + b, 0);
      if (p === 0) return absv.filter((v) => v !== 0).length;
      let s = 0; for (const v of absv) s += Math.pow(v, p); return Math.pow(s, 1 / p);
    }
    const m = A.rows, n = A.cols;
    if (p === undefined || p === 2) return singularValues(A)[0];
    if (p === 1) { let mx = 0; for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += absv[i + j * m]; mx = Math.max(mx, s); } return mx; }
    if (p === Infinity) { let mx = 0; for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < n; j++) s += absv[i + j * m]; mx = Math.max(mx, s); } return mx; }
    if (p === 'fro') { let s = 0; for (const v of absv) s += v * v; return Math.sqrt(s); }
    err('norm: 不支持的范数类型。');
  }

  ML.linalg = {
    EPS, luRM, lu, det, solve, inv, qr, qrRM, chol, eig, isSymmetric, jacobiEig, svd, svdRM, singularValues,
    pinv, rank, expm, funm, norm, fromRM, identity, zerosRM, csolveSquare
  };
})(typeof self !== 'undefined' ? self : globalThis);
