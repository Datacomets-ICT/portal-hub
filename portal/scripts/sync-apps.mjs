/**
 * Bundles the three existing apps into portal/public/ so they deploy on
 * the same origin as the portal (required for SSO — the apps read their
 * auth state from Storage, which only travels cross-page within one origin).
 *
 * - IT_Ticket (static HTML)  → copied verbatim to public/it/
 * - meeting-rooms (Vite app) → built with base=/meeting/ then copied to public/meeting/
 * - Driver (static HTML + CDN React) → copied verbatim to public/driver/
 *
 * None of the source folders are modified. Re-run whenever an app changes.
 */
import { cp, mkdir, rm, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const portalRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(portalRoot, '..');
const publicDir = path.resolve(portalRoot, 'public');

const onlyArg = process.argv[2]; // optional: it | meeting | driver

function step(title) {
  console.log('\n\x1b[36m▶ ' + title + '\x1b[0m');
}

function run(cmd, args, cwd, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...envOverrides },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    child.on('error', reject);
  });
}

// Parse a .env file → { KEY: value } (minimal, no quote/escape handling beyond trim).
async function readDotenv(filePath) {
  if (!existsSync(filePath)) return {};
  const text = await readFile(filePath, 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function syncIt() {
  const src = path.join(repoRoot, 'IT_Ticket');
  const dest = path.join(publicDir, 'it');
  if (!existsSync(src)) {
    console.warn('  skip IT — source folder not found: ' + src);
    return;
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  const files = [
    'index.html',
    'manifest.json',
    'sw.js',
    'icon-192.png',
    'icon-512.png',
    'workFlow.png',
  ];
  const dirs = ['manual_images'];

  for (const f of files) {
    const from = path.join(src, f);
    if (!existsSync(from)) continue;
    await cp(from, path.join(dest, f));
    console.log('  copied: ' + f);
  }
  for (const d of dirs) {
    const from = path.join(src, d);
    if (!existsSync(from)) continue;
    await cp(from, path.join(dest, d), { recursive: true });
    console.log('  copied: ' + d + '/');
  }
  console.log('✓ IT synced → public/it/');
}

async function syncMeeting() {
  const src = path.join(repoRoot, 'meeting-rooms');
  const dist = path.join(src, 'dist');
  const dest = path.join(publicDir, 'meeting');
  if (!existsSync(src)) {
    console.warn('  skip Meeting — source folder not found: ' + src);
    return;
  }

  // meeting-rooms uses its OWN Supabase project (different from IT/portal).
  // Priority for the meeting build env:
  //   1. explicit VITE_MEETING_SUPABASE_URL / ..._ANON_KEY on Vercel
  //   2. meeting-rooms/.env.local (local dev only — not committed)
  // Without this, the portal's VITE_SUPABASE_URL (IT's project) would leak
  // into the meeting build and queries hit the wrong schema.
  const localEnv = await readDotenv(path.join(src, '.env.local'));
  const meetingUrl = process.env.VITE_MEETING_SUPABASE_URL || localEnv.VITE_SUPABASE_URL;
  const meetingKey = process.env.VITE_MEETING_SUPABASE_ANON_KEY || localEnv.VITE_SUPABASE_ANON_KEY;
  // Optional — JWT-format anon key for resumable (TUS) uploads of large
  // audio files in the meeting summary feature. Falls back to "" if not
  // set, in which case files > 50 MB error with a friendly message.
  const meetingLegacyJwt =
    process.env.VITE_MEETING_SUPABASE_LEGACY_JWT
    || process.env.VITE_SUPABASE_LEGACY_JWT
    || localEnv.VITE_SUPABASE_LEGACY_JWT
    || '';
  if (!meetingUrl || !meetingKey) {
    throw new Error(
      'Missing meeting-rooms Supabase env. Set VITE_MEETING_SUPABASE_URL + VITE_MEETING_SUPABASE_ANON_KEY on Vercel, or keep meeting-rooms/.env.local for local dev.'
    );
  }

  console.log('  building meeting-rooms with base=/meeting/ and its own Supabase creds…');
  await run(
    'npm',
    ['run', 'build', '--', '--base=/meeting/'],
    src,
    {
      VITE_SUPABASE_URL: meetingUrl,
      VITE_SUPABASE_ANON_KEY: meetingKey,
      VITE_SUPABASE_LEGACY_JWT: meetingLegacyJwt,
    }
  );

  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const entries = await readdir(dist);
  for (const name of entries) {
    await cp(path.join(dist, name), path.join(dest, name), { recursive: true });
  }
  console.log('✓ Meeting synced → public/meeting/');
}

async function syncDriver() {
  const src = path.join(repoRoot, 'Driver');
  const dest = path.join(publicDir, 'driver');
  if (!existsSync(src)) {
    console.warn('  skip Driver — source folder not found: ' + src);
    return;
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  // Driver is an HTML file + src/ directory (CDN React + Babel standalone).
  // Only carry what the browser actually needs — skip xlsx, drawio, uploads.
  const allow = new Set(['Driver Booking.html', 'src']);
  const entries = await readdir(src);
  for (const name of entries) {
    if (!allow.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name === 'Driver Booking.html' ? 'index.html' : name);
    await cp(from, to, { recursive: true });
  }
  console.log('✓ Driver synced → public/driver/');
}

async function main() {
  step('Syncing existing apps into portal/public/');

  if (!onlyArg || onlyArg === 'it') await syncIt();
  if (!onlyArg || onlyArg === 'meeting') await syncMeeting();
  if (!onlyArg || onlyArg === 'driver') await syncDriver();

  console.log('\n\x1b[32m✓ Done.\x1b[0m  Run `npm run dev` to test locally.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
