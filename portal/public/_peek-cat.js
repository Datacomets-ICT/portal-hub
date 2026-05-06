// _peek-cat.js — small SVG cat peeking over the top edge of selected cards.
// Looks for elements with class "peek-host" and injects a peeking cat
// SVG decoration. Subtle blink (every ~5s) + tail-wag (1.6s) animations.
//
// Idempotent + watches for late-rendered cards (React/Vite re-renders).
// Loaded via <script src="/_peek-cat.js" defer> in every app.
(function () {
  if (window.top !== window) return;
  if (window.__peekCatInstalled) return;
  window.__peekCatInstalled = true;

  // Cute peeking cat — head + two paws gripping the top edge, tail sticking
  // out to the side. Two animated groups: .pc-eyes (blink), .pc-tail (wag).
  var SVG_MARKUP = '' +
    '<svg viewBox="0 0 64 36" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      // Tail (behind body)
      '<g class="pc-tail">' +
        '<path d="M8 32 Q-2 24 4 14 Q9 8 16 12" stroke="#fb923c" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      // Body/head
      '<g>' +
        // Outer ears (triangles)
        '<polygon points="20,12 25,3 30,12" fill="#fb923c"/>' +
        '<polygon points="38,12 43,3 48,12" fill="#fb923c"/>' +
        // Inner ears (pink)
        '<polygon points="22,11 25,6 28,11" fill="#fda4af"/>' +
        '<polygon points="40,11 43,6 46,11" fill="#fda4af"/>' +
        // Head (rounded)
        '<rect x="18" y="10" width="32" height="24" rx="14" fill="#fb923c"/>' +
        // Cheek dots (left)
        '<circle cx="22" cy="24" r="2" fill="#fdba74"/>' +
        // Cheek dots (right)
        '<circle cx="46" cy="24" r="2" fill="#fdba74"/>' +
        // Whiskers (left)
        '<line x1="22" y1="22" x2="14" y2="20" stroke="#9a3412" stroke-width="0.7"/>' +
        '<line x1="22" y1="24" x2="13" y2="25" stroke="#9a3412" stroke-width="0.7"/>' +
        // Whiskers (right)
        '<line x1="46" y1="22" x2="54" y2="20" stroke="#9a3412" stroke-width="0.7"/>' +
        '<line x1="46" y1="24" x2="55" y2="25" stroke="#9a3412" stroke-width="0.7"/>' +
        // Eyes (group blinks together)
        '<g class="pc-eyes">' +
          '<ellipse cx="27" cy="19" rx="2" ry="3" fill="#0f172a"/>' +
          '<ellipse cx="41" cy="19" rx="2" ry="3" fill="#0f172a"/>' +
          '<circle cx="27.6" cy="18" r="0.7" fill="#ffffff"/>' +
          '<circle cx="41.6" cy="18" r="0.7" fill="#ffffff"/>' +
        '</g>' +
        // Nose
        '<polygon points="32.5,22.5 35.5,22.5 34,24.5" fill="#fda4af"/>' +
        // Mouth
        '<path d="M34 24.5 Q32 27 30 26" stroke="#9a3412" stroke-width="0.7" fill="none" stroke-linecap="round"/>' +
        '<path d="M34 24.5 Q36 27 38 26" stroke="#9a3412" stroke-width="0.7" fill="none" stroke-linecap="round"/>' +
        // Paws (gripping the top edge of the card)
        '<rect x="20" y="32" width="6" height="4" rx="2" fill="#fb923c"/>' +
        '<rect x="42" y="32" width="6" height="4" rx="2" fill="#fb923c"/>' +
      '</g>' +
    '</svg>';

  var CSS = '' +
    '.peek-host { position: relative; }' +
    '.peek-cat {' +
      'position: absolute;' +
      'top: -22px; right: 28px;' +
      'width: 56px; height: 32px;' +
      'pointer-events: none;' +
      'z-index: 2;' +
      'filter: drop-shadow(0 2px 3px rgba(15,23,42,.18));' +
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
    '}' +
    '@media (prefers-reduced-motion: reduce) {' +
      '.peek-cat .pc-eyes, .peek-cat .pc-tail { animation: none !important; }' +
    '}';

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  function inject(host) {
    // dup guard — only one cat per host
    for (var i = 0; i < host.children.length; i++) {
      if (host.children[i].classList && host.children[i].classList.contains('peek-cat')) return;
    }
    var cat = document.createElement('span');
    cat.className = 'peek-cat';
    cat.setAttribute('aria-hidden', 'true');
    cat.innerHTML = SVG_MARKUP;
    host.appendChild(cat);
  }
  function scan() {
    var hosts = document.querySelectorAll('.peek-host');
    for (var i = 0; i < hosts.length; i++) inject(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Watch for cards rendered later (React, Vite hydration, list updates)
  try {
    var obs = new MutationObserver(function () { scan(); });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) { /* old browsers — no-op */ }
})();
