import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase.js';

const AuthContext = createContext(null);

// Storage keys the existing apps read on boot:
//   IT_Ticket (sessionStorage): 'ticketUser' + 'ticketPwd'
//   meeting-rooms (localStorage): 'mr_user'
// By writing all three on portal login, both apps auto-enter when opened
// on the same origin (subpath deploy required — see README).
const IT_USER_KEY = 'ticketUser';
const IT_PWD_KEY = 'ticketPwd';
const MEETING_USER_KEY = 'mr_user';

function readSession() {
  try {
    const raw = sessionStorage.getItem(IT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Build a user object that matches meeting-rooms' expected shape.
// meeting-rooms LoginScreen stores rows from its `employees` table:
//   { code, name, nickname, dept, position, created_at }
// IT's login() RPC returns a different shape; map it:
function toMeetingUser(itUser) {
  if (!itUser) return null;
  const fullName = [itUser.firstName, itUser.lastName].filter(Boolean).join(' ') || itUser.nickname || itUser.employeeId;
  return {
    code: itUser.employeeId,
    name: fullName,
    nickname: itUser.nickname || '',
    dept: itUser.department || '',
    position: itUser.position || '',
    // Propagate the Workspace-chosen avatar so meeting-rooms shows the
    // same pill as Workspace + Driver instead of falling back to a flat letter.
    avatarUrl: itUser.avatarUrl || '',
  };
}

function writeSessions(itUser, password) {
  sessionStorage.setItem(IT_USER_KEY, JSON.stringify(itUser));
  sessionStorage.setItem(IT_PWD_KEY, password);
  localStorage.setItem(MEETING_USER_KEY, JSON.stringify(toMeetingUser(itUser)));
}

function clearSessions() {
  sessionStorage.removeItem(IT_USER_KEY);
  sessionStorage.removeItem(IT_PWD_KEY);
  localStorage.removeItem(MEETING_USER_KEY);
}

function readPassword() {
  try {
    return sessionStorage.getItem(IT_PWD_KEY) || '';
  } catch {
    return '';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSession());
  const [apps, setApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const loadApps = useCallback(async (empId) => {
    if (!empId) {
      setApps([]);
      return;
    }
    setLoadingApps(true);
    try {
      // Optional RPC for role-based app access. If it doesn't exist yet,
      // we silently fall back to showing all apps (see HubPage).
      const { data, error } = await supabase.rpc('get_user_apps', { p_emp_id: empId });
      if (error) throw error;
      setApps(data || []);
    } catch (err) {
      console.warn('get_user_apps not available — showing all apps', err?.message || err);
      setApps([]);
    } finally {
      setLoadingApps(false);
    }
  }, []);

  useEffect(() => {
    if (user?.employeeId) loadApps(user.employeeId);
    else setApps([]);
  }, [user?.employeeId, loadApps]);

  // Keep meeting-rooms' localStorage key aligned with portal's session.
  // Without this, a cleared localStorage + persisted sessionStorage means
  // clicking the Meeting tile drops the user into meeting's own login form.
  useEffect(() => {
    if (!user) return;
    const mrUser = toMeetingUser(user);
    const current = localStorage.getItem(MEETING_USER_KEY);
    const next = JSON.stringify(mrUser);
    if (current !== next) localStorage.setItem(MEETING_USER_KEY, next);
  }, [user]);

  const login = useCallback(async (empId, password) => {
    const { data, error } = await supabase.rpc('login', { p_emp_id: empId, p_password: password });
    if (error) throw error;
    if (!data || !data.success) throw new Error(data?.message || 'เข้าสู่ระบบไม่สำเร็จ');
    writeSessions(data.user, password);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearSessions();
    setUser(null);
    setApps([]);
  }, []);

  // Patch user object after profile/avatar update — persists everywhere the
  // sub-apps look (sessionStorage for IT, localStorage for meeting-rooms).
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      sessionStorage.setItem(IT_USER_KEY, JSON.stringify(next));
      localStorage.setItem(MEETING_USER_KEY, JSON.stringify(toMeetingUser(next)));
      return next;
    });
  }, []);

  // Update the cached password used for IT admin re-auth.
  const updatePassword = useCallback((pwd) => {
    sessionStorage.setItem(IT_PWD_KEY, pwd);
  }, []);

  const getPassword = useCallback(() => readPassword(), []);

  return (
    <AuthContext.Provider
      value={{ user, apps, loadingApps, login, logout, updateUser, updatePassword, getPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
