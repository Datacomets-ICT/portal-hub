import { useEffect, useRef, useState } from 'react';

// "📱 ติดตั้ง App" button — only renders when the browser fires the
// beforeinstallprompt event (Chrome / Edge / Android Chrome / Samsung
// Internet). On iOS Safari that event doesn't exist, so we show an
// alternative "ดูวิธีติดตั้ง" button that opens an instructions modal.
//
// Once installed (or in standalone mode already) the button hides
// itself — no point reminding the user.

const DISMISSED_KEY = 'workspace_install_banner_dismissed';

// Bigger CTA banner for mobile users. Shows on the hub page when the
// app isn't installed yet, until the user dismisses or installs it.
// Falls back to instructions modal on iOS where there's no native
// install prompt.
export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; }
    catch { return false; }
  });
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handler(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
  }

  async function handleInstall() {
    if (!deferredPrompt) {
      setShowHelp(true);
      return;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }

  return (
    <>
      <div className="install-banner">
        <div className="install-banner-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </div>
        <div className="install-banner-text">
          <div className="install-banner-title">📱 ติดตั้ง Workspace เป็น App</div>
          <div className="install-banner-sub">
            ใช้งานสะดวก เปิดเร็วกว่า เห็นไอคอนบน home screen
          </div>
        </div>
        <button type="button" className="install-banner-cta" onClick={handleInstall}>
          ติดตั้งเลย
        </button>
        <button type="button" className="install-banner-close" onClick={dismiss} aria-label="ปิด">✕</button>
      </div>
      {showHelp && <InstallHelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handler(e) {
      e.preventDefault(); // stop the auto-prompt
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleInstall() {
    if (!deferredPrompt) {
      // No native prompt available (iOS Safari, in-app browsers, etc.)
      // → fall back to the manual instructions modal.
      setShowHelp(true);
      return;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  }

  // Only render on phones (where install matters most). Desktop users
  // can still install via the address bar's install icon.
  const isPhoneSize = typeof window !== 'undefined' && window.innerWidth <= 900;
  if (!deferredPrompt && !isPhoneSize) return null;

  return (
    <>
      <button type="button" className="install-app-btn" onClick={handleInstall}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M12 18h.01" />
        </svg>
        ติดตั้ง App
      </button>

      {showHelp && <InstallHelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  // iOS Safari uses navigator.standalone, others use the matchMedia query
  return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator?.standalone === true;
}

function InstallHelpModal({ onClose }) {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isiOS = /iPad|iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  return (
    <div className="install-help-backdrop" onClick={onClose}>
      <div className="install-help-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="install-help-close" onClick={onClose} aria-label="ปิด">✕</button>
        <h3 className="install-help-title">📱 วิธีติดตั้ง Workspace App</h3>

        {isiOS && (
          <div className="install-help-section">
            <div className="install-help-platform">🍎 iPhone / iPad (Safari)</div>
            <ol className="install-help-steps">
              <li>กดไอคอน <b>Share</b> ⬆️ ที่แถบล่าง (กล่องลูกศรขึ้น)</li>
              <li>เลื่อนลง → กด <b>"Add to Home Screen"</b> (เพิ่มที่หน้าจอโฮม)</li>
              <li>ตั้งชื่อ → กด <b>Add</b></li>
              <li>ไอคอน Workspace จะปรากฏบน home screen</li>
            </ol>
          </div>
        )}

        {isAndroid && (
          <div className="install-help-section">
            <div className="install-help-platform">🤖 Android (Chrome)</div>
            <ol className="install-help-steps">
              <li>กดเมนู <b>⋮</b> ที่มุมขวาบน</li>
              <li>กด <b>"Install app"</b> หรือ <b>"Add to Home screen"</b></li>
              <li>กด <b>Install</b> ยืนยัน</li>
              <li>ไอคอนจะถูกเพิ่มในหน้า apps</li>
            </ol>
          </div>
        )}

        {!isiOS && !isAndroid && (
          <>
            <div className="install-help-section">
              <div className="install-help-platform">🍎 iPhone / iPad (Safari)</div>
              <ol className="install-help-steps">
                <li>กดไอคอน <b>Share</b> ⬆️ ที่แถบล่าง</li>
                <li>เลื่อนลง → <b>"Add to Home Screen"</b></li>
                <li>กด <b>Add</b></li>
              </ol>
            </div>
            <div className="install-help-section">
              <div className="install-help-platform">🤖 Android (Chrome)</div>
              <ol className="install-help-steps">
                <li>กดเมนู <b>⋮</b> มุมขวาบน</li>
                <li>กด <b>"Install app"</b></li>
                <li>กด <b>Install</b></li>
              </ol>
            </div>
            <div className="install-help-section">
              <div className="install-help-platform">💻 Desktop (Chrome/Edge)</div>
              <ol className="install-help-steps">
                <li>หาไอคอน <b>⊞ Install</b> ที่ address bar (ขวาสุด)</li>
                <li>กด → ยืนยัน <b>Install</b></li>
                <li>เปิดเป็น window แยก ใช้เหมือน app ปกติ</li>
              </ol>
            </div>
          </>
        )}

        <div className="install-help-foot">
          ✨ เมื่อ install แล้ว เปิดได้จาก home screen เหมือน app ทั่วไป
        </div>
      </div>
    </div>
  );
}
