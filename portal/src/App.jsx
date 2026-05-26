import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HubPage from './pages/HubPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RepairMenuPage from './pages/RepairMenuPage.jsx';
import RepairHubPage from './pages/RepairHubPage.jsx';
import RepairNewPage from './pages/RepairNewPage.jsx';
import RepairDetailPage from './pages/RepairDetailPage.jsx';
import RepairInspectionsPage from './pages/RepairInspectionsPage.jsx';
import RepairInspectionNewPage from './pages/RepairInspectionNewPage.jsx';
import RepairEquipmentPage from './pages/RepairEquipmentPage.jsx';
import RepairHandoversPage from './pages/RepairHandoversPage.jsx';
import RepairHandoverNewPage from './pages/RepairHandoverNewPage.jsx';
import RepairHandoverDetailPage from './pages/RepairHandoverDetailPage.jsx';
import RepairFactoryPage from './pages/RepairFactoryPage.jsx';
import RepairFactoryNewPage from './pages/RepairFactoryNewPage.jsx';
import RepairFactoryDetailPage from './pages/RepairFactoryDetailPage.jsx';
import RepairPdfPage from './pages/RepairPdfPage.jsx';
import RepairPdfNewPage from './pages/RepairPdfNewPage.jsx';
import RepairEquipmentNewPage from './pages/RepairEquipmentNewPage.jsx';
import RepairEquipmentDetailPage from './pages/RepairEquipmentDetailPage.jsx';
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
        <Route path="/repair"                    element={<Protected><RepairMenuPage /></Protected>} />
        <Route path="/repair/new"                element={<Protected><RepairNewPage /></Protected>} />
        <Route path="/repair/jobs"               element={<Protected><RepairHubPage /></Protected>} />
        <Route path="/repair/jobs/:jobId"        element={<Protected><RepairDetailPage /></Protected>} />
        <Route path="/repair/inspections"        element={<Protected><RepairInspectionsPage /></Protected>} />
        <Route path="/repair/inspections/new"    element={<Protected><RepairInspectionNewPage /></Protected>} />
        <Route path="/repair/equipment"          element={<Protected><RepairEquipmentPage /></Protected>} />
        <Route path="/repair/equipment/new"      element={<Protected><RepairEquipmentNewPage /></Protected>} />
        <Route path="/repair/equipment/:stockId" element={<Protected><RepairEquipmentDetailPage /></Protected>} />
        <Route path="/repair/handovers"          element={<Protected><RepairHandoversPage /></Protected>} />
        <Route path="/repair/handovers/new"      element={<Protected><RepairHandoverNewPage /></Protected>} />
        <Route path="/repair/handovers/:docNo"   element={<Protected><RepairHandoverDetailPage /></Protected>} />
        <Route path="/repair/factory-requests"          element={<Protected><RepairFactoryPage /></Protected>} />
        <Route path="/repair/factory-requests/new"      element={<Protected><RepairFactoryNewPage /></Protected>} />
        <Route path="/repair/factory-requests/:docNo"   element={<Protected><RepairFactoryDetailPage /></Protected>} />
        <Route path="/repair/pdf"                element={<Protected><RepairPdfPage /></Protected>} />
        <Route path="/repair/pdf/new"            element={<Protected><RepairPdfNewPage /></Protected>} />
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
