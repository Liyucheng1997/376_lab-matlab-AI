/* MatWeb - 示例程序 */
(function (G) {
  'use strict';
  const ML = G.ML;
  ML.EXAMPLES = [
    {
      name: 'ex_basics.m', title: '基础：变量、矩阵与运算',
      code: `%% 基础运算
% 按 F5 运行整个脚本，或把光标放在某一节内按 Ctrl+Enter 只运行该节
a = 3;
b = 4;
c = sqrt(a^2 + b^2)

%% 矩阵与向量
A = [1 2 3; 4 5 6; 7 8 10]
v = 1:5              % 行向量
w = linspace(0, 1, 5)'  % 列向量
A'                   % 转置
A * A                % 矩阵乘法
A .* A               % 按元素相乘

%% 索引
A(2, 3)              % 第 2 行第 3 列
A(:, 1)              % 第 1 列
A(end, :)            % 最后一行
v(v > 2)             % 逻辑索引

%% 常用函数
sum(A)               % 每列求和
mean(v)
max(A(:))
size(A)
numel(A)

%% 复数
z = 3 + 4i
abs(z)
angle(z)
conj(z)
sqrt(-9)
`
    },
    {
      name: 'ex_linear_algebra.m', title: '线性代数：方程组与分解',
      code: `%% 解线性方程组  Ax = b
A = [4 -2 1; -2 4 -2; 1 -2 4];
b = [11; -16; 17];
x = A \\ b

%% 行列式、逆、秩、迹
d = det(A)
Ai = inv(A)
r = rank(A)
t = trace(A)

%% 特征值与特征向量
[V, D] = eig(A)

%% 奇异值分解
s = svd(magic(4))'

%% LU 与 Cholesky 分解
[L, U, P] = lu(A)
R = chol(A)
`
    },
    {
      name: 'ex_plot2d.m', title: '绘图：二维曲线与子图',
      code: `%% 二维绘图
x = linspace(0, 4*pi, 400);
figure(1); clf
subplot(2, 2, 1)
plot(x, sin(x), 'LineWidth', 1.5); grid on
title('sin(x)')

subplot(2, 2, 2)
plot(x, exp(-x/5).*cos(2*x), 'r'); grid on
title('衰减振荡 e^{-x/5}cos 2x')

subplot(2, 2, 3)
t = 0:0.5:10;
stem(t, t.^2 / 10, 'filled'); grid on
title('火柴杆图')

subplot(2, 2, 4)
y = randn(1, 1000);
histogram(y, 25)
title('正态随机数直方图')
sgtitle('二维绘图示例')
`
    },
    {
      name: 'ex_plot3d.m', title: '绘图：三维曲面与等高线',
      code: `%% 三维曲面
figure(2); clf
[X, Y] = meshgrid(-8:0.4:8);
R = sqrt(X.^2 + Y.^2) + eps;
Z = sin(R) ./ R;
subplot(1, 2, 1)
surf(X, Y, Z)
colormap(jet); colorbar
title('sinc 曲面'); xlabel('x'); ylabel('y'); zlabel('z')

subplot(1, 2, 2)
contourf(X, Y, Z, 12)
title('等高线图'); axis equal

%% 三维曲线：螺旋线
figure(3); clf
t = linspace(0, 10*pi, 1000);
plot3(cos(t), sin(t), t/10, 'LineWidth', 1.5)
grid on; title('螺旋线（可用鼠标拖动旋转）')
`
    },
    {
      name: 'ex_ode.m', title: '微分方程：ode45',
      code: `%% 范德波尔振荡器  y'' - mu (1 - y^2) y' + y = 0
mu = 1;
f = @(t, y) [y(2); mu*(1 - y(1)^2)*y(2) - y(1)];
[t, y] = ode45(f, [0 20], [2; 0]);

figure;
subplot(1, 2, 1)
plot(t, y(:, 1), t, y(:, 2), '--')
legend('y', 'dy/dt'); grid on; xlabel('t')
title('时间响应')

subplot(1, 2, 2)
plot(y(:, 1), y(:, 2))
grid on; xlabel('y'); ylabel('dy/dt'); title('相平面')
`
    },
    {
      name: 'ex_fitting.m', title: '数据拟合与插值',
      code: `%% 多项式拟合
x = 0:0.5:5;
y = 2*x.^2 - 3*x + 1 + randn(size(x));
p = polyfit(x, y, 2)
xf = linspace(0, 5, 200);
figure;
plot(x, y, 'ko', xf, polyval(p, xf), 'b-', 'LineWidth', 1.5); hold on

%% 插值
xi = linspace(0, 5, 200);
plot(xi, interp1(x, y, xi, 'spline'), 'r--')
hold off; grid on
legend('数据', '二次拟合', '样条插值', 'Location', 'northwest')
title(sprintf('拟合结果: y = %.2fx^2 %+.2fx %+.2f', p))
`
    },
    {
      name: 'ex_functions.m', title: '脚本中的局部函数',
      code: `%% 在脚本末尾定义局部函数
r = solveQuadratic(1, -3, 2)
f = fib(10)
fprintf('前 10 个斐波那契数: %s\\n', mat2str(arrayfun(@fib, 1:10)));

%% 结构体与元胞数组
student.name = '张三';
student.scores = [90 85 77];
student.avg = mean(student.scores);
disp(student)
c = {'苹果', 3, [1 2 3]};
for k = 1:numel(c)
    fprintf('第 %d 个元素的类型: %s\\n', k, class(c{k}));
end

function r = solveQuadratic(a, b, c)
    % 一元二次方程求根
    D = b^2 - 4*a*c;
    r = [(-b + sqrt(D)) / (2*a), (-b - sqrt(D)) / (2*a)];
end

function f = fib(n)
    % 迭代计算斐波那契数
    a = 0; b = 1;
    for k = 1:n
        [a, b] = deal(b, a + b);
    end
    f = a;
end
`
    },
    {
      name: 'ex_animation.m', title: '动画：drawnow 与 pause',
      code: `%% 简单动画（在后台引擎模式下可实时刷新）
figure;
x = linspace(0, 2*pi, 200);
h = plot(x, sin(x), 'LineWidth', 2);
axis([0 2*pi -1.2 1.2]); grid on
for k = 1:60
    set(h, 'YData', sin(x + k/6) .* cos(k/20));
    title(sprintf('帧 %d', k));
    drawnow
    pause(0.03)
end

%% 动画线条
figure;
an = animatedline('Color', 'r', 'LineWidth', 1.5);
axis([0 10 -1 1]); grid on
for t = linspace(0, 10, 300)
    addpoints(an, t, sin(2*t) * exp(-t/8));
    drawnow
end
`
    },
    {
      name: 'ex_signal.m', title: '信号处理：FFT',
      code: `%% 频谱分析
Fs = 500;                 % 采样频率
t = 0:1/Fs:2-1/Fs;
x = 0.7*sin(2*pi*30*t) + sin(2*pi*80*t) + 0.5*randn(size(t));
N = numel(x);
Y = fft(x);
P2 = abs(Y/N);
P1 = P2(1:N/2+1);
P1(2:end-1) = 2*P1(2:end-1);
f = Fs*(0:(N/2))/N;

figure;
subplot(2,1,1); plot(t(1:200), x(1:200)); grid on; title('时域信号'); xlabel('t (s)')
subplot(2,1,2); plot(f, P1); grid on; title('单边幅值谱'); xlabel('f (Hz)')
`
    }
  ];

  // 首次使用时写入“当前文件夹”的文件
  ML.DEFAULT_FILES = {
    'quadratic.m': `function [x1, x2] = quadratic(a, b, c)
% QUADRATIC 求解一元二次方程 a*x^2 + b*x + c = 0
%   [x1, x2] = quadratic(a, b, c) 返回两个根（可能为复数）
%   示例: [r1, r2] = quadratic(1, -3, 2)
D = b^2 - 4*a*c;
x1 = (-b + sqrt(D)) / (2*a);
x2 = (-b - sqrt(D)) / (2*a);
end
`,
    'welcome.m': `%% 欢迎使用 MatWeb —— 浏览器中的类 MATLAB 数值计算环境
% 按 F5 运行本脚本；也可以在下方命令行窗口直接输入命令。
disp('你好，MatWeb！')
A = magic(4)
fprintf('A 的行列式为 %g，秩为 %d\\n', det(A), rank(A));

% 调用当前文件夹中的函数 quadratic.m
[r1, r2] = quadratic(1, -3, 2)

% 画一张图
x = linspace(-2*pi, 2*pi, 300);
plot(x, sin(x)./x, 'LineWidth', 1.5); grid on
title('sinc 函数 sin(x)/x'); xlabel('x'); ylabel('y')
`,
    'data.csv': '1,2.1\n2,3.9\n3,6.2\n4,7.8\n5,10.1\n'
  };
})(typeof self !== 'undefined' ? self : globalThis);
