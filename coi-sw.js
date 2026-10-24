/* MatWeb - 跨源隔离 Service Worker
 * GitHub Pages 等静态托管无法设置 COOP/COEP 响应头；本 Service Worker 为同源响应补上这些头，
 * 使页面获得 crossOriginIsolated，从而启用 SharedArrayBuffer（中断运行、实时动画、input 交互）。
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.status === 0) return res;
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
