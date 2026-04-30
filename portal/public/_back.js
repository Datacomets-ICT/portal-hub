// Back-to-Workspace pill — injected into sub-apps that don't already
// have their own native button (Driver, Meeting Rooms). IT-Ticket has
// its own .hub-back-btn in the navbar, so it does NOT load this file.
//
// Style + position match IT's native button: top-left, blue pill,
// "← Workspace" label.
(function () {
  if (window.top !== window) return;                       // skip if iframe
  if (document.getElementById('__portal-back')) return;

  var css = '\
.__portal-back{position:fixed;top:14px;left:14px;z-index:99999;display:inline-flex;align-items:center;gap:8px;padding:8px 14px 8px 12px;background:#2563eb;color:#fff;border:0;border-radius:10px;font:600 13px/1.2 \'IBM Plex Sans Thai\',\'Inter\',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;box-shadow:0 4px 10px rgba(37,99,235,.25);transition:background .15s,transform .08s,box-shadow .15s;white-space:nowrap}\
.__portal-back:hover{background:#1d4ed8;transform:translateY(-1px);box-shadow:0 6px 14px rgba(37,99,235,.35)}\
.__portal-back:active{transform:translateY(0) scale(.97)}\
.__portal-back svg{flex-shrink:0;transition:transform .15s}\
.__portal-back:hover svg{transform:translateX(-2px)}\
@media (max-width:520px){.__portal-back{padding:8px 10px}.__portal-back .__lbl{display:none}}\
';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var a = document.createElement('a');
  a.id = '__portal-back';
  a.className = '__portal-back';
  a.href = '/hub';
  a.title = 'กลับหน้า Workspace';
  a.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
    '<span class="__lbl">Workspace</span>';

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
