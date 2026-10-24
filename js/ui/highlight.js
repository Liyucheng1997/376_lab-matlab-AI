/* MatWeb - MATLAB 语法高亮 */
(function (G) {
  'use strict';
  const ML = G.ML;
  const KW = new Set(['if', 'elseif', 'else', 'end', 'for', 'parfor', 'while', 'switch', 'case', 'otherwise', 'try', 'catch', 'function', 'return', 'break', 'continue', 'global', 'persistent', 'do', 'until']);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 返回每行的 HTML
  function highlight(src) {
    const lines = src.split('\n');
    const out = [];
    let inBlock = 0;
    const fns = ML.builtins || {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '%{') { inBlock++; out.push('<span class="hl-com">' + esc(line) + '</span>'); continue; }
      if (inBlock) { if (trimmed === '%}') inBlock--; out.push('<span class="hl-com">' + esc(line) + '</span>'); continue; }
      if (/^\s*%%/.test(line)) { out.push('<span class="hl-com hl-sec hl-secline">' + esc(line) + '</span>'); continue; }
      let html = '', i = 0, prevValue = false;
      // 命令语法（如 hold on）
      const cmd = /^(\s*)([A-Za-z]\w*)(\s+)([A-Za-z][^=(]*)$/.exec(line);
      if (cmd && !KW.has(cmd[2]) && /^(hold|grid|axis|format|close|clear|clc|box|shading|colormap|view|disp|help|doc|warning|more|figure|legend|colorbar|type|edit|run|load|save|clearvars|who|whos|rng|cd|ls|dir|lookfor|which|drawnow|syms)$/.test(cmd[2]) && !/%/.test(cmd[4])) {
        out.push(esc(cmd[1]) + '<span class="hl-fn">' + esc(cmd[2]) + '</span>' + esc(cmd[3]) + '<span class="hl-str">' + esc(cmd[4]) + '</span>');
        continue;
      }
      while (i < line.length) {
        const c = line[i];
        if (c === '%' || (c === '.' && line.startsWith('...', i))) {
          html += '<span class="hl-com">' + esc(line.slice(i)) + '</span>'; i = line.length; break;
        }
        if (c === "'" && !prevValue) {
          let j = i + 1;
          while (j < line.length) { if (line[j] === "'") { if (line[j + 1] === "'") { j += 2; continue; } break; } j++; }
          html += '<span class="hl-str">' + esc(line.slice(i, j + 1)) + '</span>'; i = j + 1; prevValue = true; continue;
        }
        if (c === '"') {
          let j = i + 1;
          while (j < line.length) { if (line[j] === '"') { if (line[j + 1] === '"') { j += 2; continue; } break; } j++; }
          html += '<span class="hl-str">' + esc(line.slice(i, j + 1)) + '</span>'; i = j + 1; prevValue = true; continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(line[i + 1] || ''))) {
          const m = /^(\d+\.?\d*(?:[eEdD][+-]?\d+)?|\.\d+(?:[eEdD][+-]?\d+)?)[ij]?/.exec(line.slice(i));
          html += '<span class="hl-num">' + esc(m[0]) + '</span>'; i += m[0].length; prevValue = true; continue;
        }
        if (/[A-Za-z_]/.test(c)) {
          const m = /^[A-Za-z_]\w*/.exec(line.slice(i));
          const w = m[0];
          const isField = i > 0 && line[i - 1] === '.';
          if (KW.has(w) && !isField) html += '<span class="hl-kw">' + w + '</span>';
          else if (!isField && fns[w] && /^\s*\(/.test(line.slice(i + w.length))) html += '<span class="hl-fn">' + w + '</span>';
          else html += esc(w);
          i += w.length; prevValue = true; continue;
        }
        if (c === ' ' || c === '\t') { html += c; i++; continue; }
        prevValue = c === ')' || c === ']' || c === '}' || (c === "'" && prevValue);
        html += esc(c); i++;
      }
      out.push(html);
    }
    return out;
  }
  ML.highlight = highlight;
})(typeof self !== 'undefined' ? self : globalThis);
