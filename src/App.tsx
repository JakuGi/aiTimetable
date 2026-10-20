import { useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
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
import { FreelancePage } from './pages/FreelancePage';
import { isConfigured } from './lib/supabase';
import { Brand } from './components/Brand';
import { t, useLang } from './lib/i18n';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">{t('Načítavam…')}</div>;
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
        <h1>{t('Chýba pripojenie k databáze')}</h1>
        <p>
          <code>.env</code> (<code>.env.example</code>): <code>VITE_SUPABASE_URL</code>,{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, <code>npm run dev</code>.
        </p>
      </main>
    </div>
  );
}

function Shell() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RecoveryRedirect />
        <Outlet />
      </AuthProvider>
    </ToastProvider>
  );
}

function SignedIn() {
  return (
    <RequireAuth>
      <DataProvider>
        <EditorProvider>
          <Layout />
        </EditorProvider>
      </DataProvider>
    </RequireAuth>
  );
}

// a data router, so a page can hold the user back when leaving with unsaved changes (useBlocker)
const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/check-email', element: <CheckEmailPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <SignedIn />,
        children: [
          { index: true, element: <WeekPage /> },
          { path: 'month', element: <MonthPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'routine', element: <RoutinePage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'freelance', element: <FreelancePage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  // a new language redraws every page (texts are looked up while rendering)
  const lang = useLang();
  if (!isConfigured) return <NotConfigured />;
  return <RouterProvider key={lang} router={router} />;
}
