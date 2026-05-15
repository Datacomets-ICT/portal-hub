import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HubPage from './pages/HubPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RepairComingSoonPage from './pages/RepairComingSoonPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import DirectoryPage from './pages/DirectoryPage.jsx';
import BackfillPage from './pages/BackfillPage.jsx';
import AnnouncementMarquee from './components/AnnouncementMarquee.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Navigate to="/hub" replace />} />
        <Route
          path="/hub"
          element={
            <Protected>
              <HubPage />
            </Protected>
          }
        />
        <Route
          path="/repair"
          element={
            <Protected>
              <RepairComingSoonPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <AdminPage />
            </Protected>
          }
        />
        <Route
          path="/people"
          element={
            <Protected>
              <DirectoryPage />
            </Protected>
          }
        />
        <Route
          path="/it-backfill"
          element={
            <Protected>
              <BackfillPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/hub" replace />} />
      </Routes>
      {/* Marquee renders on every signed-in page (login/register skip via the
          condition below). It's outside <Routes> so it persists across nav. */}
      {user && <AnnouncementMarquee />}
    </>
  );
}
