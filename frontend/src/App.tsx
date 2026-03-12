// SPDX-License-Identifier: GPL-3.0-or-later
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { DeviceListPage, DeviceDetailPage } from './pages/Devices';
import Sites from './pages/Sites';
import Alerts from './pages/Alerts';
import Discovery from './pages/Discovery';
import Settings from './pages/Settings';
import ChangePasswordModal from './components/Layout/ChangePasswordModal';
import { useAuthStore } from './store/authStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, loadUser } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.must_change_password) {
    return <ChangePasswordModal forced onClose={() => loadUser()} />;
  }
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loadUser } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) loadUser();
  }, [isAuthenticated, loadUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="devices" element={<DeviceListPage />} />
          <Route path="devices/:id" element={<DeviceDetailPage />} />
          <Route path="sites" element={<Sites />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="discovery" element={<Discovery />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
