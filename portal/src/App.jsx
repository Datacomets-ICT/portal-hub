import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HubPage from './pages/HubPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
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
      <Route path="*" element={<Navigate to="/hub" replace />} />
    </Routes>
  );
}
