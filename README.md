# MatWeb —— 网页版类 MATLAB 数值计算环境

在浏览器中运行的 MATLAB 风格计算平台：自带 MATLAB 语言解释器、600 多个内置函数、绘图引擎和常用公式库，**纯前端、零依赖、无需安装**。

**在线使用：<https://liyucheng1997.github.io/MatWeb/>**

## 快速开始

本地运行：

```bash
node server.js
```

然后在浏览器打开 <http://localhost:8000>。

> 也可以直接双击 `index.html` 打开（主线程模式）。此时单次运行限时 60 秒，`pause`/`drawnow` 动画会在运行结束后一次显示，`input` 改用浏览器弹窗。通过 `server.js` 启动时计算在后台 Web Worker 中进行，支持随时中断、实时动画和命令行交互输入。

## 功能概览

| 模块 | 内容 |
| --- | --- |
| 语言 | 矩阵字面量、`:` 范围、`end`、逻辑索引、自动扩展与删除、`if/for/while/switch/try`、函数文件与脚本内局部函数、匿名函数与闭包、`varargin/varargout`、`nargin/nargout`、`global/persistent`、命令语法（`hold on`、`format long`）、复数、整数类型、元胞数组、结构体（数组）、`containers.Map` |
| 线性代数 | `det inv pinv rank trace eig svd lu qr chol null orth rref expm sqrtm logm norm cond kron`，`\` 与 `/` 自动选择 LU 或最小二乘 |
| 数值方法 | `roots polyfit polyval conv deconv polyder polyint interp1 interp2 spline pchip fzero fsolve fminsearch fminbnd lsqcurvefit linprog integral integral2 integral3 trapz cumtrapz gradient ode45 ode23 fft ifft fft2 filter conv2` |
| 数据分析 | `sum prod cumsum mean median mode std var max min sort unique histcounts cov corrcoef prctile quantile movmean zscore`，常用概率分布 `normpdf normcdf norminv binopdf poisspdf tcdf chi2cdf …` |
| 字符串 | `sprintf fprintf num2str mat2str str2double strsplit strjoin strrep strtrim regexp regexprep contains upper lower dec2bin …` |
| 绘图 | `plot plot3 scatter scatter3 bar barh histogram pie stem stairs area fill errorbar surf mesh pcolor contour contourf contour3 quiver imagesc fplot fimplicit fsurf polarplot semilogx/y loglog`，`subplot hold legend title xlabel colorbar colormap view axis grid text xline yline animatedline`，支持 TeX 标注（`\alpha`、`x^2`、`x_1`） |
| 文件 | 浏览器本地虚拟文件夹：`save load csvread csvwrite readmatrix writematrix fopen fprintf fgetl fclose`，可导入/下载本地文件 |
| 界面 | 编辑器（语法高亮、自动缩进、`%%` 分节运行）、命令行窗口（历史、Tab 补全）、工作区、当前文件夹、多图窗（三维拖动旋转、导出 PNG）、函数参考、**公式库**（代数、几何、微积分、线性代数、微分方程、统计、物理、金融、信号处理等 80 余条可运行公式）、深色主题 |

## AI 助手（Claude）

右侧“AI 助手”面板接入了 Anthropic 的 Claude。点击设置按钮填写你自己的 [Anthropic API Key](https://console.anthropic.com/settings/keys) 后，就可以用自然语言让 AI 完成 MATLAB 任务：求解方程、画图、写脚本和函数、调试报错、解释代码。

- **AI 会直接操作 MatWeb**：在你的工作区运行代码并读取输出、查看变量、读取编辑器和文件、把脚本或函数写入当前文件夹并在编辑器中打开、截取图窗检查图像、检索本环境支持的函数。
- **命令行出错时**会出现“让 AI 助手解释并修复这个错误”的入口。
- **可选模型**：Claude Opus 5.5（默认）、Sonnet 5.5、Haiku 5.5、Fable 5.1；思考强度可选低/中/高。
- **安全与费用**：API Key 只保存在你的浏览器中（可选择关闭页面后清除），请求从浏览器直接发送到 Anthropic，不经过任何其它服务器；调用费用由你的 Anthropic 账户承担。设置中可关闭“允许 AI 直接运行代码”，改为每次运行前确认。
- 无法直接访问 `api.anthropic.com` 时，可在设置中填写兼容 Anthropic API 的地址。
- 使用官方地址时开启了服务端回退（`fallbacks: "default"`）：如果所选模型因安全策略拒绝请求，会自动改由 Anthropic 推荐的模型继续回答。

实现上使用官方 SDK `@anthropic-ai/sdk`（首次使用时从 jsDelivr 按需加载，固定版本 0.133.0），流式输出、自适应思考、提示缓存与工具调用循环都在浏览器内完成，见 `js/ui/ai.js`。

## 快捷键

| 位置 | 按键 | 作用 |
| --- | --- | --- |
| 编辑器 | `F5` | 运行当前文件 |
| 编辑器 | `Ctrl+Enter` | 运行当前节（`%%` 分隔） |
| 编辑器 | `Ctrl+S` / `Ctrl+/` | 保存 / 注释切换 |
| 命令行 | `↑` `↓` / `Tab` | 历史命令 / 自动补全 |
| 命令行 | `Ctrl+C` / `Ctrl+L` | 停止运行 / 清屏 |

## 目录结构

```
index.html            页面入口
server.js             零依赖本地服务器（启用 COOP/COEP，支持 SharedArrayBuffer）
css/style.css         界面样式（浅色/深色主题）
js/manifest.js        引擎脚本加载顺序
js/worker.js          后台计算线程
js/core/              解释器核心：数据类型、词法/语法分析、运算符、索引、线性代数、输出格式、颜色图
js/lib/               内置函数库（elmat/elfun/datafun/matfun/numeric/strfun/datatypes/system/graphics/extras）
js/ui/                界面：渲染器、编辑器、语法高亮、公式库、示例、主程序
test/                 Node 回归测试
```

## 测试

```bash
node test/run_tests.js          # 约 200 条引擎回归测试
node test/harness.js "A = magic(4), eig(A)"   # 在终端里直接执行 MATLAB 代码
```

## 与 MATLAB 的差异

- 仅支持二维数组（不支持三维及以上数组）。
- 不支持符号计算（`syms`）、Simulink、`classdef` 类定义及各工具箱的专有函数。
- 双引号字符串按字符向量处理。
- 文件保存在浏览器本地存储中（清除浏览器数据会丢失，请及时下载备份）。
