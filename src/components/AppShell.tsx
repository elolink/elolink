import { useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { useWorkspace, useIsAdmin } from '../lib/workspace';
import { useToast } from '../lib/toast';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { cn } from '../lib/utils';
import {
  LayoutDashboard,
  Clock,
  FileText,
  MessageSquare,
  User,
  LogOut,
  ChevronDown,
  Plus,
  Menu,
  X,
  CheckCircle2,
  Receipt,
  CreditCard,
} from 'lucide-react';

export type PageId = 'dashboard' | 'shifts' | 'reports' | 'invoices' | 'chat' | 'profile';

interface AppShellProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}

const navItems: { id: PageId; label: string; icon: typeof Clock }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'shifts', label: 'Shift Manage', icon: Clock },
  { id: 'reports', label: 'Progress Reports', icon: FileText },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'profile', label: 'Profile', icon: User },
];

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const { profile, user, signOut } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspaceId, createWorkspace, members } = useWorkspace();
  const { toast } = useToast();
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isAdminUser = useIsAdmin();
  const [showPaywall, setShowPaywall] = useState(false);

  const [creatingWs, setCreatingWs] = useState(false);

  function handleNewWorkspaceClick() {
    if (isAdminUser) {
      setShowCreateWs(true);
    } else {
      setShowPaywall(true);
    }
  }

  async function handleCreateWs(e: React.FormEvent) {
    e.preventDefault();
    if (newWsName.trim()) {
      setCreatingWs(true);
      const ws = await createWorkspace(newWsName.trim());
      setCreatingWs(false);
      if (ws) {
        toast('Workspace created successfully!');
      } else {
        toast('Failed to create workspace.', 'error');
      }
      setNewWsName('');
      setShowCreateWs(false);
      setWsMenuOpen(false);
    }
  }

  const activeMembers = members.length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Logo size="sm" />
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:flex lg:translate-x-0',
          mobileNavOpen ? 'flex translate-x-0' : 'flex -translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center px-5">
          <Logo size="sm" />
        </div>

        {/* Workspace switcher */}
        <div className="relative px-3 py-2">
          <button
            onClick={() => setWsMenuOpen(!wsMenuOpen)}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">Workspace</p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {activeWorkspace?.name ?? 'No workspace'}
              </p>
            </div>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', wsMenuOpen && 'rotate-180')} />
          </button>

          {wsMenuOpen && (
            <div className="absolute left-3 right-3 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => { setActiveWorkspaceId(ws.id); setWsMenuOpen(false); }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-50',
                    ws.id === activeWorkspace?.id && 'bg-brand-green-50',
                  )}
                >
                  <span className="truncate font-medium text-slate-700">{ws.name}</span>
                  {ws.id === activeWorkspace?.id && <CheckCircle2 className="h-4 w-4 text-brand-green-600" />}
                </button>
              ))}
              <div className="mt-1 border-t border-slate-100 pt-1">
                {showCreateWs ? (
                  <form onSubmit={handleCreateWs} className="px-3 py-2">
                    <input
                      autoFocus
                      className="input mb-2"
                      placeholder="Workspace name"
                      value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary flex-1 text-xs" disabled={creatingWs}>
                        {creatingWs ? 'Creating...' : 'Create'}
                      </button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => setShowCreateWs(false)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={handleNewWorkspaceClick}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-brand-green-600 hover:bg-brand-green-50"
                  >
                    <Plus className="h-4 w-4" /> New workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setMobileNavOpen(false); }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                page === item.id
                  ? 'bg-brand-blue-50 text-brand-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <item.icon className={cn('h-5 w-5', page === item.id ? 'text-brand-blue-600' : 'text-slate-400')} />
              {item.label}
              {item.id === 'chat' && <span className="ml-auto h-2 w-2 rounded-full bg-brand-yellow-400" />}
            </button>
          ))}
        </nav>

        {/* Active workspace info */}
        {activeWorkspace && (
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">{activeMembers} / {activeWorkspace.max_members} member{activeMembers !== 1 ? 's' : ''}</p>
          </div>
        )}

        {/* User section */}
        <div className="relative border-t border-slate-200 p-3">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50"
          >
            <Avatar profile={profile} size="sm" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{profile?.display_name || 'User'}</p>
              <p className="truncate text-xs text-slate-500">{profile?.username ? `@${profile.username}` : user?.email}</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 z-50 mb-1 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                onClick={() => { onNavigate('profile'); setUserMenuOpen(false); setMobileNavOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <User className="h-4 w-4" /> Profile settings
              </button>
              <button
                onClick={() => signOut()}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-64">
        <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
          {children}
        </main>
      </div>

      {/* Subscription paywall modal */}
      {showPaywall && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowPaywall(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-green-50">
                <CreditCard className="h-5 w-5 text-brand-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Subscription Required</h2>
                <p className="text-sm text-slate-500">To create a workspace</p>
              </div>
            </div>
            <div className="space-y-3 rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">First month</span>
                <span className="text-lg font-bold text-brand-green-600">$1.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Every month after</span>
                <span className="text-lg font-bold text-slate-900">$20.00/mo</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Creating a workspace requires an active subscription. Once Stripe is connected, you'll be able to
              subscribe and create your workspace here.
            </p>
            <a href="https://bolt.new/setup/stripe" className="mt-3 inline-block text-sm font-medium text-brand-green-600 hover:text-brand-green-700">
              Set up Stripe payments
            </a>
            <div className="mt-5 flex gap-3">
              <button className="btn-primary flex-1 opacity-60 cursor-not-allowed" disabled>
                Subscribe & Create
              </button>
              <button className="btn-ghost" onClick={() => setShowPaywall(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


