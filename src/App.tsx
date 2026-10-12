import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import {
  CheckEmailPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './auth/AuthPages';
import { DataProvider } from './lib/data';
import { EditorProvider } from './editor/Editor';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { WeekPage } from './pages/WeekPage';
import { MonthPage } from './pages/MonthPage';
import { TasksPage } from './pages/TasksPage';
import { RoutinePage } from './pages/RoutinePage';
import { SettingsPage } from './pages/SettingsPage';
import { isConfigured } from './lib/supabase';
import { Brand } from './components/Brand';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">Načítavam…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

/** A password-reset link signs the user in; send them to set the new password first. */
function RecoveryRedirect() {
  const { recovering } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (recovering && pathname !== '/reset-password') navigate('/reset-password', { replace: true });
  }, [recovering, pathname, navigate]);
  return null;
}

function NotConfigured() {
  return (
    <div className="auth">
      <main className="auth-card">
        <Brand />
        <h1>Chýba pripojenie k databáze</h1>
        <p>
          Vytvor súbor <code>.env</code> podľa <code>.env.example</code> a doplň <code>VITE_SUPABASE_URL</code> a{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> zo Supabase. Potom reštartuj <code>npm run dev</code>.
        </p>
      </main>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RecoveryRedirect />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/check-email" element={<CheckEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              element={
                <RequireAuth>
                  <DataProvider>
                    <EditorProvider>
                      <Layout />
                    </EditorProvider>
                  </DataProvider>
                </RequireAuth>
              }
            >
              <Route index element={<WeekPage />} />
              <Route path="month" element={<MonthPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="routine" element={<RoutinePage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
