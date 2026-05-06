// _peek-cat.js — ONE cute cat that pops up from a random card every few
// seconds, hides, then peeks out somewhere else. Single instance moves
// between elements with class "peek-host" via appendChild.
//
// Subtle blink + tail-wag animations stay running while visible. Skips
// iframes + prefers-reduced-motion. Loaded via <script defer>.
(function () {
  if (window.top !== window) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.__peekCatInstalled) return;
  window.__peekCatInstalled = true;

  var SVG_MARKUP = '' +
    '<svg viewBox="0 0 64 36" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      '<g class="pc-tail">' +
        '<path d="M8 32 Q-2 24 4 14 Q9 8 16 12" stroke="#fb923c" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      '<g>' +
        '<polygon points="20,12 25,3 30,12" fill="#fb923c"/>' +
        '<polygon points="38,12 43,3 48,12" fill="#fb923c"/>' +
        '<polygon points="22,11 25,6 28,11" fill="#fda4af"/>' +
        '<polygon points="40,11 43,6 46,11" fill="#fda4af"/>' +
        '<rect x="18" y="10" width="32" height="24" rx="14" fill="#fb923c"/>' +
        '<circle cx="22" cy="24" r="2" fill="#fdba74"/>' +
        '<circle cx="46" cy="24" r="2" fill="#fdba74"/>' +
        '<line x1="22" y1="22" x2="14" y2="20" stroke="#9a3412" stroke-width="0.7"/>' +
        '<line x1="22" y1="24" x2="13" y2="25" stroke="#9a3412" stroke-width="0.7"/>' +
        '<line x1="46" y1="22" x2="54" y2="20" stroke="#9a3412" stroke-width="0.7"/>' +
        '<line x1="46" y1="24" x2="55" y2="25" stroke="#9a3412" stroke-width="0.7"/>' +
        '<g class="pc-eyes">' +
          '<ellipse cx="27" cy="19" rx="2" ry="3" fill="#0f172a"/>' +
          '<ellipse cx="41" cy="19" rx="2" ry="3" fill="#0f172a"/>' +
          '<circle cx="27.6" cy="18" r="0.7" fill="#ffffff"/>' +
          '<circle cx="41.6" cy="18" r="0.7" fill="#ffffff"/>' +
        '</g>' +
        '<polygon points="32.5,22.5 35.5,22.5 34,24.5" fill="#fda4af"/>' +
        '<path d="M34 24.5 Q32 27 30 26" stroke="#9a3412" stroke-width="0.7" fill="none" stroke-linecap="round"/>' +
        '<path d="M34 24.5 Q36 27 38 26" stroke="#9a3412" stroke-width="0.7" fill="none" stroke-linecap="round"/>' +
        '<rect x="20" y="32" width="6" height="4" rx="2" fill="#fb923c"/>' +
        '<rect x="42" y="32" width="6" height="4" rx="2" fill="#fb923c"/>' +
      '</g>' +
    '</svg>';

  var CSS = '' +
    '.peek-cat {' +
      'position: absolute;' +
      'top: -22px; right: 28px;' +
      'width: 56px; height: 32px;' +
      'pointer-events: none;' +
      'z-index: 2;' +
      'opacity: 0;' +
      'transform: translateY(10px);' +
      'transition: opacity .35s ease, transform .45s cubic-bezier(.34,1.56,.64,1);' +
      'filter: drop-shadow(0 2px 3px rgba(15,23,42,.18));' +
    '}' +
    '.peek-cat.is-visible {' +
      'opacity: 1;' +
      'transform: translateY(0);' +
    '}' +
    '.peek-cat svg { width: 100%; height: 100%; display: block; overflow: visible; }' +
    '.peek-cat .pc-eyes {' +
      'transform-origin: center 19px;' +
      'animation: pc-blink 5.5s infinite;' +
    '}' +
    '.peek-cat .pc-tail {' +
      'transform-origin: 8px 32px;' +
      'animation: pc-tail 1.6s ease-in-out infinite alternate;' +
    '}' +
    '@keyframes pc-blink {' +
      '0%, 92%, 100% { transform: scaleY(1); }' +
      '94%, 96%      { transform: scaleY(0.05); }' +
    '}' +
    '@keyframes pc-tail {' +
      'from { transform: rotate(-18deg); }' +
      'to   { transform: rotate(12deg); }' +
    '}';

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var cat = document.createElement('span');
  cat.className = 'peek-cat';
  cat.setAttribute('aria-hidden', 'true');
  cat.innerHTML = SVG_MARKUP;

  var currentHost = null;
  var hideTimer = null;
  var nextTimer = null;

  function pickHost() {
    var hosts = document.querySelectorAll('.peek-host');
    if (hosts.length === 0) return null;
    if (hosts.length === 1) return hosts[0];
    var next;
    var tries = 0;
    do {
      next = hosts[Math.floor(Math.random() * hosts.length)];
      tries++;
    } while (next === currentHost && tries < 8);
    return next;
  }

  function appear() {
    var host = pickHost();
    if (!host) {
      // No hosts on this page yet — try again shortly (DOM still loading
      // or no peek-host class anywhere → cat just stays hidden).
      nextTimer = setTimeout(appear, 4000);
      return;
    }
    currentHost = host;
    // Make sure the host can position the cat
    var cs = window.getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    host.appendChild(cat);
    // Force reflow so the .is-visible transition fires
    void cat.offsetWidth;
    cat.classList.add('is-visible');
    // Visible for 3.5–6s
    hideTimer = setTimeout(disappear, 3500 + Math.random() * 2500);
  }

  function disappear() {
    cat.classList.remove('is-visible');
    // Hidden for 6–14s before next pop
    nextTimer = setTimeout(appear, 6000 + Math.random() * 8000);
  }

  function start() {
    // Small initial delay so the page settles first
    nextTimer = setTimeout(appear, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
