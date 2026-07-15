import { AuthProvider, useAuth } from './lib/auth';
import { WorkspaceProvider } from './lib/workspace';
import { ToastProvider } from './lib/toast';
import { AuthPage } from './pages/AuthPage';
import { AppShell, type PageId } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ShiftManagePage } from './pages/ShiftManagePage';
import { ReportsPage } from './pages/ReportsPage';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { InvoicesPage } from './pages/InvoicesPage';
import { Logo } from './components/Logo';
import { useState } from 'react';

function AppContent() {
  const { session, loading } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Logo size="lg" />
          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-green-500" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <WorkspaceProvider>
      <AppShell page={page} onNavigate={setPage}>
        {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
        {page === 'shifts' && <ShiftManagePage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'invoices' && <InvoicesPage />}
        {page === 'chat' && <ChatPage />}
        {page === 'profile' && <ProfilePage />}
      </AppShell>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
