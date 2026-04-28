// UI prefs shared with IT-Ticket app (same localStorage key so settings carry over)
const UI_KEY = 'uiPrefs';

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  } catch {
    return {};
  }
}

export function savePref(key, value) {
  const cur = loadPrefs();
  cur[key] = value;
  localStorage.setItem(UI_KEY, JSON.stringify(cur));
}

export function clearPrefs() {
  localStorage.removeItem(UI_KEY);
}

export function applyTheme(mode, silent) {
  let effective = mode;
  if (mode === 'auto') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', effective);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = effective === 'dark' ? '#0b1120' : '#3b6cff';
  if (!silent) savePref('theme', mode);
}

export function applyAccent(color, silent) {
  document.documentElement.setAttribute('data-accent', color);
  if (!silent) savePref('accent', color);
}

export function applyFontSize(size, silent) {
  document.documentElement.setAttribute('data-fontsize', size);
  if (!silent) savePref('fontsize', size);
}

export function bootPrefs() {
  const p = loadPrefs();
  applyTheme(p.theme || 'light', true);
  applyAccent(p.accent || 'indigo', true);
  applyFontSize(p.fontsize || 'm', true);

  // React to system theme change when in auto mode
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const cur = loadPrefs();
      if ((cur.theme || 'light') === 'auto') applyTheme('auto', true);
    });
  } catch {
    // older browsers — no-op
  }
}

export function getNotifPref(key, defaultVal) {
  const p = loadPrefs();
  const v = p['notif_' + key];
  return v === undefined || v === null ? defaultVal : v;
}

export function setNotifPref(key, value) {
  savePref('notif_' + key, value);
}
