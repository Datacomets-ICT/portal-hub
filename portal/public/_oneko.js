// Oneko — pixel cat that follows the mouse cursor on every sub-app.
// Port of adryd325/oneko.js (MIT). Sprite is the classic Neko (1989,
// public domain) served from jsdelivr's GitHub mirror so we don't vendor
// a binary. Self-installs on DOMContentLoaded.
//
// Loaded by every app (Workspace, IT-Ticket, Driver, Meeting Rooms) via
// <script src="/_oneko.js" defer> so the same cat follows the user across
// apps. Skipped for prefers-reduced-motion users and inside iframes.
(function () {
  if (window.top !== window) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('__oneko')) return;

  // 32px is the sprite's native size — render at 1:1 for the classic
  // tiny-Neko look. (Was 64px; user prefers small.)
  var DISPLAY = 32;
  var HALF = DISPLAY / 2;
  var SCALE = DISPLAY / 32;
  var SPRITE_URL = 'https://cdn.jsdelivr.net/gh/adryd325/oneko.js@14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif';

  var SPRITE_SETS = {
    idle:         [[-3, -3]],
    alert:        [[-7, -3]],
    scratchSelf:  [[-5,  0], [-6,  0], [-7,  0]],
    scratchWallN: [[ 0,  0], [ 0, -1]],
    scratchWallS: [[-7, -1], [-6, -2]],
    scratchWallE: [[-2, -2], [-2, -3]],
    scratchWallW: [[-4,  0], [-4, -1]],
    tired:        [[-3, -2]],
    sleeping:     [[-2,  0], [-2, -1]],
    N:            [[-1, -2], [-1, -3]],
    NE:           [[ 0, -2], [ 0, -3]],
    E:            [[-3,  0], [-3, -1]],
    SE:           [[-5, -1], [-5, -2]],
    S:            [[-6, -3], [-7, -2]],
    SW:           [[-5, -3], [-6, -1]],
    W:            [[-4, -2], [-4, -3]],
    NW:           [[-1,  0], [-1, -1]],
  };

  function init() {
    if (document.getElementById('__oneko')) return;
    var nekoEl = document.createElement('div');
    nekoEl.id = '__oneko';
    nekoEl.setAttribute('aria-hidden', 'true');
    nekoEl.style.cssText =
      'position:fixed;width:' + DISPLAY + 'px;height:' + DISPLAY + 'px;' +
      'pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;' +
      'background-image:url("' + SPRITE_URL + '");' +
      'background-size:' + (DISPLAY * 8) + 'px ' + (DISPLAY * 4) + 'px;' +
      'filter:drop-shadow(0 4px 6px rgba(15,23,42,.25));' +
      'z-index:2147483647;';

    var nekoPosX = 32, nekoPosY = window.innerHeight - 64;
    var mousePosX = window.innerWidth / 2, mousePosY = window.innerHeight / 2;
    var frameCount = 0, idleTime = 0, idleAnimation = null, idleAnimationFrame = 0;
    var NEKO_SPEED = 12;

    nekoEl.style.left = (nekoPosX - HALF) + 'px';
    nekoEl.style.top  = (nekoPosY - HALF) + 'px';
    document.body.appendChild(nekoEl);

    document.addEventListener('mousemove', function (e) {
      mousePosX = e.clientX;
      mousePosY = e.clientY;
    });

    function setSprite(name, frame) {
      var set = SPRITE_SETS[name] || SPRITE_SETS.idle;
      var s = set[frame % set.length];
      nekoEl.style.backgroundPosition = (s[0] * DISPLAY) + 'px ' + (s[1] * DISPLAY) + 'px';
    }
    function resetIdle() { idleAnimation = null; idleAnimationFrame = 0; }
    function idle() {
      idleTime += 1;
      if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && !idleAnimation) {
        var choices = ['sleeping', 'scratchSelf'];
        if (nekoPosX < 32) choices.push('scratchWallW');
        if (nekoPosY < 32) choices.push('scratchWallN');
        if (nekoPosX > window.innerWidth - 32) choices.push('scratchWallE');
        if (nekoPosY > window.innerHeight - 32) choices.push('scratchWallS');
        idleAnimation = choices[Math.floor(Math.random() * choices.length)];
      }
      switch (idleAnimation) {
        case 'sleeping':
          if (idleAnimationFrame < 8) { setSprite('tired', 0); break; }
          setSprite('sleeping', Math.floor(idleAnimationFrame / 4));
          if (idleAnimationFrame > 192) resetIdle();
          break;
        case 'scratchWallN':
        case 'scratchWallS':
        case 'scratchWallE':
        case 'scratchWallW':
        case 'scratchSelf':
          setSprite(idleAnimation, idleAnimationFrame);
          if (idleAnimationFrame > 9) resetIdle();
          break;
        default:
          setSprite('idle', 0);
          return;
      }
      idleAnimationFrame += 1;
    }
    function tick() {
      frameCount += 1;
      var diffX = nekoPosX - mousePosX;
      var diffY = nekoPosY - mousePosY;
      var distance = Math.sqrt(diffX * diffX + diffY * diffY);
      if (distance < NEKO_SPEED || distance < 48) { idle(); return; }
      idleAnimation = null; idleAnimationFrame = 0;
      if (idleTime > 1) {
        setSprite('alert', 0);
        idleTime = Math.min(idleTime, 7) - 1;
        return;
      }
      var dir = '';
      dir += diffY / distance >  0.5 ? 'N' : '';
      dir += diffY / distance < -0.5 ? 'S' : '';
      dir += diffX / distance >  0.5 ? 'W' : '';
      dir += diffX / distance < -0.5 ? 'E' : '';
      setSprite(dir || 'idle', frameCount);
      nekoPosX -= (diffX / distance) * NEKO_SPEED;
      nekoPosY -= (diffY / distance) * NEKO_SPEED;
      nekoPosX = Math.min(Math.max(HALF, nekoPosX), window.innerWidth  - HALF);
      nekoPosY = Math.min(Math.max(HALF, nekoPosY), window.innerHeight - HALF);
      nekoEl.style.left = (nekoPosX - HALF) + 'px';
      nekoEl.style.top  = (nekoPosY - HALF) + 'px';
    }

    var last = 0;
    function loop(ts) {
      if (!nekoEl.isConnected) return;
      if (!last) last = ts;
      if (ts - last > 100) { last = ts; tick(); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
