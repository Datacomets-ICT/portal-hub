// Back-to-portal pill — injected into each sub-app under /it, /driver, /meeting.
// Floats top-left, links to /hub. Single source so we update once for all apps.
(function () {
  if (window.top !== window) return; // skip if embedded in iframe
  if (document.getElementById('__portal-back')) return;

  var css = '\
.__portal-back{position:fixed;top:10px;left:10px;z-index:99999;display:inline-flex;align-items:center;gap:6px;padding:6px 13px 6px 10px;background:rgba(255,255,255,.94);color:#1e293b;border:1px solid rgba(15,23,42,.08);border-radius:999px;font:600 12px/1.2 \'IBM Plex Sans Thai\',\'Inter\',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;box-shadow:0 4px 12px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.04);backdrop-filter:saturate(180%) blur(12px);-webkit-backdrop-filter:saturate(180%) blur(12px);transition:transform .12s ease,background .15s,box-shadow .15s,color .15s}\
.__portal-back:hover{background:#fff;color:#0f172a;transform:translateX(-1px);box-shadow:0 8px 22px rgba(15,23,42,.14)}\
.__portal-back:active{transform:scale(.97)}\
.__portal-back svg{color:#4f46e5;flex-shrink:0;transition:transform .15s}\
.__portal-back:hover svg{transform:translateX(-2px)}\
@media (max-width:640px){.__portal-back{padding:7px 9px;top:8px;left:8px}.__portal-back .__lbl{display:none}}\
@media (prefers-color-scheme: dark){.__portal-back{background:rgba(30,41,59,.85);color:#e2e8f0;border-color:rgba(255,255,255,.06)}.__portal-back:hover{background:rgba(30,41,59,.98);color:#fff}.__portal-back svg{color:#818cf8}}\
';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var a = document.createElement('a');
  a.id = '__portal-back';
  a.className = '__portal-back';
  a.href = '/hub';
  a.title = 'กลับไปหน้า Portal';
  a.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
    '<span class="__lbl">Portal</span>';

  var mount = function () {
    if (document.body && !document.getElementById('__portal-back')) {
      document.body.appendChild(a);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
