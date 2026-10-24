/* MatWeb - 常用公式库：每条公式包含显示形式、说明和可运行的示例代码 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const fr = (a, b) => '<span class="frac"><span>' + a + '</span><span>' + b + '</span></span>';
  const sq = (a) => '√<span class="sqrt">' + a + '</span>';

  ML.FORMULAS = [
    {
      cat: '代数与方程', items: [
        { n: '一元二次方程求根公式', f: 'x = ' + fr('−b ± ' + sq('b² − 4ac'), '2a'), d: '求 ax² + bx + c = 0 的两个根（可能为复数）',
          c: "a = 1; b = -3; c = 2;\nD = b^2 - 4*a*c;          % 判别式\nx1 = (-b + sqrt(D)) / (2*a)\nx2 = (-b - sqrt(D)) / (2*a)\n% 也可以直接用 roots：\nr = roots([a b c])" },
        { n: '多项式求根', f: 'p(x) = a<sub>n</sub>x<sup>n</sup> + … + a<sub>1</sub>x + a<sub>0</sub> = 0', d: '用 roots 求任意次多项式的全部根',
          c: "p = [1 -6 11 -6];   % x^3 - 6x^2 + 11x - 6\nr = roots(p)\npolyval(p, r)       % 验证：应接近 0" },
        { n: '线性方程组 Ax = b', f: 'x = A<sup>−1</sup>b', d: '用左除运算符 \\ 求解（比 inv(A)*b 更稳定）',
          c: "A = [2 1 -1; -3 -1 2; -2 1 2];\nb = [8; -11; -3];\nx = A \\ b\nresidual = norm(A*x - b)" },
        { n: '克莱姆法则', f: 'x<sub>i</sub> = ' + fr('det(A<sub>i</sub>)', 'det(A)'), d: '用行列式逐个求解（演示用）',
          c: "A = [2 1; 1 3]; b = [3; 5];\nx = zeros(2,1);\nfor i = 1:2\n    Ai = A; Ai(:,i) = b;\n    x(i) = det(Ai) / det(A);\nend\nx" },
        { n: '非线性方程求根', f: 'f(x) = 0', d: 'fzero：给定初值或区间，求一元方程的根',
          c: "f = @(x) x.^3 - 2*x - 5;\nx0 = fzero(f, 2)\nf(x0)" },
        { n: '非线性方程组', f: '{ x² + y² = 4,  x·y = 1 }', d: 'fsolve：牛顿迭代求解方程组',
          c: "F = @(v) [v(1)^2 + v(2)^2 - 4; v(1)*v(2) - 1];\nsol = fsolve(F, [2; 0.5])" },
        { n: '等差数列求和', f: 'S<sub>n</sub> = ' + fr('n(a<sub>1</sub> + a<sub>n</sub>)', '2'), d: '首项 a1、公差 d、项数 n',
          c: "a1 = 1; d = 3; n = 20;\nan = a1 + (n-1)*d\nSn = n*(a1 + an)/2\nsum(a1:d:an)     % 验证" },
        { n: '等比数列求和', f: 'S<sub>n</sub> = ' + fr('a<sub>1</sub>(1 − q<sup>n</sup>)', '1 − q'), d: '首项 a1、公比 q（q ≠ 1）',
          c: "a1 = 2; q = 0.5; n = 10;\nSn = a1*(1 - q^n)/(1 - q)\nsum(a1 * q.^(0:n-1))   % 验证" },
        { n: '二项式系数', f: 'C(n,k) = ' + fr('n!', 'k!(n−k)!'), d: '组合数与杨辉三角',
          c: "nchoosek(10, 3)\n% 杨辉三角前 8 行\nfor n = 0:7\n    disp(arrayfun(@(k) nchoosek(n,k), 0:n))\nend" },
        { n: '最大公约数 / 最小公倍数', f: 'gcd(a,b) · lcm(a,b) = |a·b|', d: '辗转相除法',
          c: "a = 84; b = 36;\ng = gcd(a, b)\nl = lcm(a, b)\ng * l == a * b" },
        { n: '质因数分解', f: 'n = p<sub>1</sub><sup>k₁</sup> p<sub>2</sub><sup>k₂</sup> ⋯', d: 'factor / primes / isprime',
          c: "factor(360)\nprimes(50)\nisprime(97)" }
      ]
    },
    {
      cat: '三角与几何', items: [
        { n: '勾股定理', f: 'c = ' + sq('a² + b²'), d: '直角三角形斜边',
          c: "a = 3; b = 4;\nc = sqrt(a^2 + b^2)\nc2 = hypot(a, b)   % 数值更稳健" },
        { n: '余弦定理', f: 'c² = a² + b² − 2ab·cos C', d: '已知两边及夹角求第三边',
          c: "a = 5; b = 7; C = 60;      % C 为角度\nc = sqrt(a^2 + b^2 - 2*a*b*cosd(C))" },
        { n: '正弦定理', f: fr('a', 'sin A') + ' = ' + fr('b', 'sin B') + ' = ' + fr('c', 'sin C') + ' = 2R', d: '已知两角一边求其余边',
          c: "A = 40; B = 60; a = 10;\nC = 180 - A - B\nb = a * sind(B) / sind(A)\nc = a * sind(C) / sind(A)" },
        { n: '海伦公式', f: 'S = ' + sq('p(p−a)(p−b)(p−c)') + ',  p = ' + fr('a+b+c', '2'), d: '三边求三角形面积',
          c: "a = 3; b = 4; c = 5;\np = (a + b + c)/2;\nS = sqrt(p*(p-a)*(p-b)*(p-c))" },
        { n: '多边形面积（鞋带公式）', f: 'S = ½ |Σ (x<sub>i</sub>y<sub>i+1</sub> − x<sub>i+1</sub>y<sub>i</sub>)|', d: 'polyarea 计算任意简单多边形面积',
          c: "x = [0 4 4 2 0];\ny = [0 0 3 5 3];\nA = polyarea(x, y)\nfill(x, y, [0.3 0.6 0.9]); axis equal; title(sprintf('面积 = %.1f', A))" },
        { n: '两点距离', f: 'd = ' + sq('(x₂−x₁)² + (y₂−y₁)²'), d: '平面或空间中两点距离',
          c: "P = [1 2 3]; Q = [4 6 8];\nd = norm(Q - P)" },
        { n: '点到直线距离', f: 'd = ' + fr('|Ax₀ + By₀ + C|', sq('A² + B²')), d: '直线 Ax + By + C = 0',
          c: "A = 3; B = 4; C = -12;\nx0 = 1; y0 = 1;\nd = abs(A*x0 + B*y0 + C) / sqrt(A^2 + B^2)" },
        { n: '向量夹角', f: 'cos θ = ' + fr('a · b', '|a| |b|'), d: '点积求夹角',
          c: "a = [1 0 1]; b = [0 1 1];\ntheta = acosd(dot(a, b) / (norm(a)*norm(b)))\nn = cross(a, b)   % 法向量" },
        { n: '圆与球', f: 'S<sub>圆</sub> = πr²,  V<sub>球</sub> = ' + fr('4', '3') + 'πr³', d: '面积、周长、体积、表面积',
          c: "r = 2;\nareaCircle = pi*r^2\nperimeter = 2*pi*r\nvolSphere = 4/3*pi*r^3\nsurfSphere = 4*pi*r^2" },
        { n: '圆柱与圆锥', f: 'V<sub>柱</sub> = πr²h,  V<sub>锥</sub> = ' + fr('1', '3') + 'πr²h', d: '体积与侧面积',
          c: "r = 1.5; h = 4;\nVcyl = pi*r^2*h\nVcone = pi*r^2*h/3\nlateralCone = pi*r*sqrt(r^2 + h^2)" },
        { n: '弧度与角度换算', f: '1 rad = ' + fr('180°', 'π'), d: 'deg2rad / rad2deg',
          c: "deg2rad(180)\nrad2deg(pi/3)\nsind(30), sin(pi/6)" },
        { n: '和差角公式验证', f: 'sin(α+β) = sin α cos β + cos α sin β', d: '数值验证三角恒等式',
          c: "a = 0.7; b = 1.1;\nlhs = sin(a+b)\nrhs = sin(a)*cos(b) + cos(a)*sin(b)\nabs(lhs - rhs) < 1e-12" }
      ]
    },
    {
      cat: '微积分', items: [
        { n: '定积分', f: '∫<sub>a</sub><sup>b</sup> f(x) dx', d: 'integral：自适应高斯-克朗罗德求积，支持无穷区间',
          c: "f = @(x) exp(-x.^2);\nI = integral(f, -Inf, Inf)\nsqrt(pi)        % 理论值\nintegral(@(x) sin(x), 0, pi)" },
        { n: '二重积分', f: '∬<sub>D</sub> f(x,y) dx dy', d: 'integral2：y 的上下限可以是 x 的函数',
          c: "f = @(x,y) x.*y;\nI = integral2(f, 0, 1, 0, @(x) x)   % 区域 0<=y<=x<=1\n1/8                                 % 理论值" },
        { n: '数值导数', f: 'f′(x) ≈ ' + fr('f(x+h) − f(x−h)', '2h'), d: '中心差分；或用 diff / gradient',
          c: "f = @(x) sin(x).*exp(-x/3);\nh = 1e-5; x0 = 1;\nd = (f(x0+h) - f(x0-h)) / (2*h)\nx = linspace(0, 10, 500); y = f(x);\ndy = gradient(y, x(2)-x(1));\nplot(x, y, x, dy, '--'); legend('f(x)', 'f''(x)'); grid on" },
        { n: '梯形法积分', f: '∫ f dx ≈ Σ ' + fr('h', '2') + '(y<sub>i</sub> + y<sub>i+1</sub>)', d: 'trapz / cumtrapz 处理离散数据',
          c: "x = linspace(0, pi, 100);\ny = sin(x);\nI = trapz(x, y)\nF = cumtrapz(x, y);\nplot(x, y, x, F); legend('sin x', '∫sin x'); grid on" },
        { n: '泰勒展开', f: 'e<sup>x</sup> = Σ ' + fr('x<sup>n</sup>', 'n!'), d: '比较不同阶泰勒多项式的逼近效果',
          c: "x = linspace(-3, 3, 200);\nplot(x, exp(x), 'k', 'LineWidth', 2); hold on\nfor N = [1 2 4 6]\n    y = zeros(size(x));\n    for n = 0:N, y = y + x.^n / factorial(n); end\n    plot(x, y, '--')\nend\nhold off; ylim([-2 20]); grid on\nlegend('e^x', 'N=1', 'N=2', 'N=4', 'N=6', 'Location', 'northwest')" },
        { n: '函数极值', f: 'f′(x) = 0', d: 'fminbnd（一元，区间）/ fminsearch（多元）',
          c: "f = @(x) x.^3 - 3*x;\n[xmin, fmin] = fminbnd(f, 0, 3)\ng = @(v) (v(1)-1).^2 + 100*(v(2)-v(1).^2).^2;   % Rosenbrock\n[v, gv] = fminsearch(g, [-1 2])" },
        { n: '曲线弧长', f: 'L = ∫<sub>a</sub><sup>b</sup> ' + sq('1 + (y′)²') + ' dx', d: '计算 y = x² 在 [0,1] 上的弧长',
          c: "L = integral(@(x) sqrt(1 + (2*x).^2), 0, 1)" },
        { n: '极限（数值逼近）', f: 'lim<sub>x→0</sub> ' + fr('sin x', 'x') + ' = 1', d: '用越来越小的 x 观察极限',
          c: "x = 10.^-(1:8);\n[x' (sin(x)./x)']\n% 重要极限 (1+1/n)^n -> e\nn = 10.^(1:6); [n' ((1+1./n).^n)']" },
        { n: '级数求和', f: 'Σ<sub>n=1</sub><sup>∞</sup> ' + fr('1', 'n²') + ' = ' + fr('π²', '6'), d: '部分和收敛性',
          c: "n = 1:100000;\nS = sum(1 ./ n.^2)\npi^2/6" }
      ]
    },
    {
      cat: '线性代数', items: [
        { n: '行列式与逆矩阵', f: 'A<sup>−1</sup> = ' + fr('adj(A)', 'det(A)'), d: 'det / inv / rank',
          c: "A = [4 -2 1; 3 6 -4; 2 1 8];\nd = det(A)\nAi = inv(A)\nA * Ai\nr = rank(A)" },
        { n: '特征值分解', f: 'A v = λ v,  A = V D V<sup>−1</sup>', d: 'eig 返回特征值与特征向量',
          c: "A = [2 1; 1 3];\n[V, D] = eig(A)\nnorm(A*V - V*D)   % 验证" },
        { n: '奇异值分解 SVD', f: 'A = U Σ V<sup>T</sup>', d: 'svd 用于降秩逼近、伪逆、条件数',
          c: "A = magic(4);\n[U, S, V] = svd(A);\ndiag(S)'\nnorm(A - U*S*V')\ncond(A)" },
        { n: 'LU 分解', f: 'PA = LU', d: '高斯消元的矩阵形式',
          c: "A = [1 2 3; 4 5 6; 7 8 10];\n[L, U, P] = lu(A)\nnorm(P*A - L*U)" },
        { n: 'QR 分解', f: 'A = QR', d: 'Q 为正交矩阵，R 为上三角',
          c: "A = [12 -51 4; 6 167 -68; -4 24 -41];\n[Q, R] = qr(A)\nQ' * Q" },
        { n: '最小二乘解', f: 'x = (A<sup>T</sup>A)<sup>−1</sup>A<sup>T</sup>b', d: '超定方程组 A\\b 自动给出最小二乘解',
          c: "x = (0:5)'; y = [1.1 2.9 5.2 7.1 8.8 11.2]';\nA = [x ones(size(x))];\ncoef = A \\ y        % [斜率; 截距]\nplot(x, y, 'o', x, A*coef, '-'); grid on" },
        { n: '矩阵指数', f: 'e<sup>A</sup> = Σ ' + fr('A<sup>k</sup>', 'k!'), d: 'expm：线性常微分方程组 x′ = Ax 的解为 e<sup>At</sup>x₀',
          c: "A = [0 1; -1 0];\nexpm(A*pi/2)" },
        { n: '向量投影与正交化', f: 'proj<sub>b</sub>a = ' + fr('a·b', 'b·b') + ' b', d: '格拉姆-施密特正交化',
          c: "a = [3; 1]; b = [1; 1];\np = dot(a,b)/dot(b,b) * b\nQ = orth([1 1 0; 1 0 1; 0 1 1])" },
        { n: '简化行阶梯形', f: 'rref([A | b])', d: '高斯-若尔当消元',
          c: "A = [1 2 -1 -4; 2 3 -1 -11; -2 0 -3 22];\nR = rref(A)" }
      ]
    },
    {
      cat: '微分方程', items: [
        { n: '一阶线性 ODE', f: 'y′ = −ky,  y = y₀e<sup>−kt</sup>', d: 'ode45 数值解与解析解对比',
          c: "k = 0.8;\n[t, y] = ode45(@(t,y) -k*y, [0 5], 10);\nplot(t, y, 'o', t, 10*exp(-k*t), '-'); grid on\nlegend('ode45', '解析解'); xlabel('t'); ylabel('y')" },
        { n: '简谐振动 / 阻尼振动', f: 'x″ + 2ζωx′ + ω²x = 0', d: '二阶方程化为一阶方程组',
          c: "w = 2; zeta = 0.1;\nf = @(t, s) [s(2); -2*zeta*w*s(2) - w^2*s(1)];\n[t, s] = ode45(f, [0 20], [1; 0]);\nplot(t, s(:,1)); grid on; xlabel('t'); ylabel('x(t)'); title('阻尼振动')" },
        { n: '单摆（非线性）', f: 'θ″ + ' + fr('g', 'L') + ' sin θ = 0', d: '大角度单摆运动',
          c: "g = 9.81; L = 1;\nf = @(t, y) [y(2); -g/L*sin(y(1))];\n[t, y] = ode45(f, [0 10], [pi/2; 0]);\nplot(t, y(:,1)*180/pi); grid on; xlabel('t (s)'); ylabel('\\theta (°)'); title('单摆')" },
        { n: '洛伦兹吸引子', f: 'ẋ = σ(y−x),  ẏ = x(ρ−z) − y,  ż = xy − βz', d: '混沌系统，三维轨迹',
          c: "sigma = 10; rho = 28; beta = 8/3;\nf = @(t, v) [sigma*(v(2)-v(1)); v(1)*(rho-v(3)) - v(2); v(1)*v(2) - beta*v(3)];\n[t, v] = ode45(f, [0 40], [1 1 1]);\nplot3(v(:,1), v(:,2), v(:,3)); grid on\nxlabel('x'); ylabel('y'); zlabel('z'); title('Lorenz 吸引子')" },
        { n: '捕食者-猎物模型', f: 'ẋ = αx − βxy,  ẏ = δxy − γy', d: 'Lotka-Volterra 方程',
          c: "a = 1; b = 0.1; d = 0.075; c = 1.5;\nf = @(t, p) [a*p(1) - b*p(1)*p(2); d*p(1)*p(2) - c*p(2)];\n[t, p] = ode45(f, [0 30], [10; 5]);\nsubplot(1,2,1); plot(t, p); legend('猎物', '捕食者'); grid on\nsubplot(1,2,2); plot(p(:,1), p(:,2)); xlabel('猎物'); ylabel('捕食者'); grid on" },
        { n: 'Logistic 增长', f: 'P′ = rP(1 − P/K)', d: '人口/种群增长模型',
          c: "r = 0.5; K = 1000;\n[t, P] = ode45(@(t,P) r*P*(1-P/K), [0 25], 10);\nplot(t, P, 'LineWidth', 1.5); grid on; yline(K, '--', '环境容量 K')" }
      ]
    },
    {
      cat: '概率与统计', items: [
        { n: '均值、方差、标准差', f: 'x̄ = ' + fr('1', 'n') + 'Σx<sub>i</sub>,  s² = ' + fr('1', 'n−1') + 'Σ(x<sub>i</sub>−x̄)²', d: 'mean / var / std / median / mode',
          c: "x = [12 15 11 18 20 15 14 16];\nm = mean(x)\nv = var(x)\ns = std(x)\nmd = median(x)\nmo = mode(x)" },
        { n: '正态分布', f: 'f(x) = ' + fr('1', 'σ' + sq('2π')) + ' e<sup>−(x−μ)²/(2σ²)</sup>', d: 'normpdf / normcdf / norminv',
          c: "x = linspace(-4, 4, 300);\nplot(x, normpdf(x, 0, 1), x, normpdf(x, 0, 2), x, normpdf(x, 1, 0.5)); grid on\nlegend('\\mu=0,\\sigma=1', '\\mu=0,\\sigma=2', '\\mu=1,\\sigma=0.5')\nP = normcdf(1.96) - normcdf(-1.96)   % ≈ 0.95" },
        { n: '线性回归', f: 'y = β₀ + β₁x', d: 'polyfit 拟合直线并计算决定系数 R²',
          c: "x = 1:10;\ny = 2.5*x + 3 + randn(1,10);\np = polyfit(x, y, 1)\nyf = polyval(p, x);\nR2 = 1 - sum((y-yf).^2)/sum((y-mean(y)).^2)\nplot(x, y, 'o', x, yf, '-'); grid on" },
        { n: '相关系数', f: 'r = ' + fr('Σ(x−x̄)(y−ȳ)', sq('Σ(x−x̄)²Σ(y−ȳ)²')), d: 'corrcoef / cov',
          c: "x = randn(100,1);\ny = 0.8*x + 0.6*randn(100,1);\nR = corrcoef(x, y)\nscatter(x, y, 20, 'filled'); grid on; title(sprintf('r = %.3f', R(1,2)))" },
        { n: '直方图与分布', f: 'X ~ N(μ, σ²)', d: 'histogram 观察样本分布',
          c: "data = 50 + 10*randn(1, 2000);\nhistogram(data, 30, 'Normalization', 'pdf'); hold on\nx = linspace(10, 90, 200);\nplot(x, normpdf(x, 50, 10), 'r', 'LineWidth', 2); hold off\ntitle('正态样本直方图')" },
        { n: '二项分布', f: 'P(X=k) = C(n,k) p<sup>k</sup>(1−p)<sup>n−k</sup>', d: 'binopdf / binocdf',
          c: "n = 20; p = 0.3; k = 0:n;\nstem(k, binopdf(k, n, p), 'filled'); grid on\ntitle('二项分布 B(20, 0.3)'); xlabel('k'); ylabel('P')" },
        { n: '蒙特卡洛估算 π', f: 'π ≈ 4 · ' + fr('落入圆内的点数', '总点数'), d: '随机模拟',
          c: "N = 20000;\nx = rand(N,1); y = rand(N,1);\ninside = x.^2 + y.^2 <= 1;\npiEst = 4 * mean(inside)\nscatter(x(1:2000), y(1:2000), 6, inside(1:2000), 'filled'); axis equal; title(sprintf('\\pi \\approx %.4f', piEst))" },
        { n: '置信区间', f: 'x̄ ± t<sub>α/2</sub> · ' + fr('s', sq('n')), d: '均值的 95% 置信区间（大样本近似用 1.96）',
          c: "x = 100 + 15*randn(1, 50);\nn = numel(x); m = mean(x); s = std(x);\nci = m + [-1 1] * 1.96 * s / sqrt(n)" }
      ]
    },
    {
      cat: '物理公式', items: [
        { n: '自由落体', f: 'h = ½gt²,  v = gt', d: '下落高度和速度随时间变化',
          c: "g = 9.81; t = 0:0.1:3;\nh = 0.5*g*t.^2; v = g*t;\nplot(t, h, t, v); legend('h (m)', 'v (m/s)'); xlabel('t (s)'); grid on" },
        { n: '抛体运动', f: 'x = v₀cos θ·t,  y = v₀sin θ·t − ½gt²', d: '不同抛射角的轨迹（45° 射程最远）',
          c: "g = 9.81; v0 = 20; hold on\nfor th = [15 30 45 60 75]\n    T = 2*v0*sind(th)/g; t = linspace(0, T, 100);\n    plot(v0*cosd(th)*t, v0*sind(th)*t - 0.5*g*t.^2)\nend\nhold off; axis equal; grid on; xlabel('x (m)'); ylabel('y (m)')\nlegend('15°', '30°', '45°', '60°', '75°'); title('抛体运动')" },
        { n: '万有引力', f: 'F = G' + fr('m₁m₂', 'r²'), d: '地球对 1kg 物体的引力',
          c: "G = 6.674e-11; M = 5.972e24; m = 1; R = 6.371e6;\nF = G*M*m/R^2" },
        { n: '动能与势能', f: 'E<sub>k</sub> = ½mv²,  E<sub>p</sub> = mgh', d: '机械能守恒',
          c: "m = 2; v = 5; g = 9.81; h = 10;\nEk = 0.5*m*v^2\nEp = m*g*h\nvFinal = sqrt(v^2 + 2*g*h)   % 落地速度" },
        { n: '欧姆定律与电功率', f: 'U = IR,  P = UI = I²R', d: '串联与并联电阻',
          c: "R = [10 20 30];\nRs = sum(R)             % 串联\nRp = 1/sum(1./R)        % 并联\nU = 12; I = U/Rs\nP = I^2 * Rs" },
        { n: '单摆周期', f: 'T = 2π' + sq(fr('L', 'g')), d: '小角度近似',
          c: "g = 9.81; L = [0.25 0.5 1 2];\nT = 2*pi*sqrt(L/g)" },
        { n: '理想气体状态方程', f: 'pV = nRT', d: '已知其中三个量求第四个',
          c: "R = 8.314; n = 1; T = 273.15; p = 101325;\nV = n*R*T/p      % 标准状况下 1 mol 气体体积（m^3）" },
        { n: '简谐波', f: 'y = A sin(ωt − kx)', d: '行波动画',
          c: "x = linspace(0, 4*pi, 200); h = plot(x, sin(x), 'LineWidth', 1.5); ylim([-1.2 1.2]); grid on\nfor t = 0:0.15:6\n    set(h, 'YData', sin(x - 2*t));\n    title(sprintf('t = %.2f', t)); drawnow; pause(0.03)\nend" },
        { n: '多普勒效应', f: 'f′ = f · ' + fr('v + v<sub>o</sub>', 'v − v<sub>s</sub>'), d: '声源靠近观察者时频率升高',
          c: "f = 440; v = 343; vs = 30; vo = 0;\nfApproach = f*(v + vo)/(v - vs)\nfRecede = f*(v - vo)/(v + vs)" }
      ]
    },
    {
      cat: '金融计算', items: [
        { n: '复利终值', f: 'FV = PV(1 + r)<sup>n</sup>', d: '本金按年复利增长',
          c: "PV = 10000; r = 0.05; n = 0:30;\nFV = PV*(1+r).^n;\nbar(n, FV); xlabel('年'); ylabel('金额'); title('复利增长'); grid on\nFV(end)" },
        { n: '连续复利', f: 'FV = PV · e<sup>rt</sup>', d: '与按年复利比较',
          c: "PV = 1000; r = 0.06; t = 10;\nannual = PV*(1+r)^t\ncontinuous = PV*exp(r*t)" },
        { n: '等额本息月供', f: 'M = P' + fr('i(1+i)<sup>n</sup>', '(1+i)<sup>n</sup> − 1'), d: '贷款 P，月利率 i，期数 n',
          c: "P = 1e6; annualRate = 0.042; years = 30;\ni = annualRate/12; n = years*12;\nM = P*i*(1+i)^n/((1+i)^n - 1)\ntotalInterest = M*n - P" },
        { n: '净现值 NPV', f: 'NPV = Σ ' + fr('CF<sub>t</sub>', '(1+r)<sup>t</sup>'), d: '投资项目评价',
          c: "CF = [-1000 300 400 400 300];   % 第 0~4 年现金流\nr = 0.08;\nNPV = sum(CF ./ (1+r).^(0:4))" },
        { n: '内部收益率 IRR', f: 'Σ ' + fr('CF<sub>t</sub>', '(1+IRR)<sup>t</sup>') + ' = 0', d: '用 fzero 求解',
          c: "CF = [-1000 300 400 400 300];\nnpv = @(r) sum(CF ./ (1+r).^(0:4));\nIRR = fzero(npv, 0.1)" },
        { n: '72 法则', f: 'T ≈ ' + fr('72', 'r(%)'), d: '资产翻倍所需年数的估算',
          c: "r = 6;\napprox = 72/r\nexact = log(2)/log(1 + r/100)" }
      ]
    },
    {
      cat: '信号处理', items: [
        { n: '傅里叶变换频谱', f: 'X(k) = Σ x(n) e<sup>−j2πkn/N</sup>', d: 'fft 分析信号频率成分',
          c: "Fs = 1000; t = 0:1/Fs:1-1/Fs;\nx = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.3*randn(size(t));\nY = abs(fft(x))/numel(x);\nf = (0:numel(x)-1)*Fs/numel(x);\nplot(f(1:500), 2*Y(1:500)); grid on\nxlabel('频率 (Hz)'); ylabel('幅值'); title('单边幅值谱')" },
        { n: '方波的傅里叶级数', f: 'f(t) = ' + fr('4', 'π') + ' Σ ' + fr('sin((2k−1)t)', '2k−1'), d: '吉布斯现象',
          c: "t = linspace(-pi, 2*pi, 1000); hold on\nfor N = [1 3 10 50]\n    y = zeros(size(t));\n    for k = 1:N, y = y + 4/pi*sin((2*k-1)*t)/(2*k-1); end\n    plot(t, y)\nend\nhold off; grid on; legend('N=1', 'N=3', 'N=10', 'N=50'); title('方波傅里叶级数逼近')" },
        { n: '卷积', f: '(f * g)(n) = Σ f(k) g(n−k)', d: 'conv 也可用于多项式乘法',
          c: "u = [1 2 3]; v = [1 1];\nw = conv(u, v)\n% 多项式 (x^2+2x+3)(x+1)" },
        { n: '移动平均滤波', f: 'y(n) = ' + fr('1', 'M') + ' Σ x(n−k)', d: 'filter 实现 FIR 滤波',
          c: "t = linspace(0, 1, 400);\nx = sin(2*pi*3*t) + 0.4*randn(size(t));\nM = 15; y = filter(ones(1,M)/M, 1, x);\nplot(t, x, t, y, 'LineWidth', 1.2); legend('含噪信号', '滤波后'); grid on" }
      ]
    },
    {
      cat: '绘图示例', items: [
        { n: '函数曲线', f: 'y = sin x, cos x', d: 'plot、图例、网格、标签',
          c: "x = linspace(0, 2*pi, 200);\nplot(x, sin(x), 'b-', x, cos(x), 'r--', 'LineWidth', 1.5)\nlegend('sin x', 'cos x'); grid on\nxlabel('x'); ylabel('y'); title('三角函数')" },
        { n: '三维曲面', f: 'z = f(x, y)', d: 'meshgrid + surf + colorbar',
          c: "[X, Y] = meshgrid(-2:0.1:2);\nZ = X.*exp(-X.^2 - Y.^2);\nsurf(X, Y, Z); colorbar\nxlabel('x'); ylabel('y'); zlabel('z'); title('z = x e^{-x^2-y^2}')" },
        { n: '等高线图', f: 'f(x, y) = c', d: 'contour / contourf',
          c: "[X, Y, Z] = peaks(60);\ncontourf(X, Y, Z, 15); colorbar; title('peaks 等高线')" },
        { n: '极坐标玫瑰线', f: 'r = cos(kθ)', d: 'polarplot',
          c: "theta = linspace(0, 2*pi, 600);\npolarplot(theta, cos(4*theta), 'LineWidth', 1.5); title('四叶玫瑰线')" },
        { n: '心形线', f: 'r = a(1 − sin θ)', d: '参数方程绘图',
          c: "t = linspace(0, 2*pi, 400);\nx = 16*sin(t).^3;\ny = 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t);\nfill(x, y, [0.9 0.2 0.3]); axis equal; title('心形曲线')" },
        { n: '隐函数曲线', f: 'x² + y² − 1 = 0', d: 'fimplicit 绘制 f(x,y)=0',
          c: "fimplicit(@(x,y) x.^2 + y.^2 - 1, [-1.5 1.5]); hold on\nfimplicit(@(x,y) x.^2/4 + y.^2 - 1, [-2.5 2.5]); hold off\naxis equal; grid on" },
        { n: '向量场', f: 'F(x,y) = (−y, x)', d: 'quiver 箭头图',
          c: "[X, Y] = meshgrid(-2:0.4:2);\nquiver(X, Y, -Y, X); axis equal; grid on; title('旋转向量场')" },
        { n: '统计图表', f: '柱状图 / 饼图', d: 'bar、pie 与 subplot',
          c: "data = [23 45 12 30];\nsubplot(1,2,1); bar(data); title('柱状图'); grid on\nsubplot(1,2,2); pie(data, {'A','B','C','D'}); title('饼图')" }
      ]
    }
  ];
})(typeof self !== 'undefined' ? self : globalThis);
