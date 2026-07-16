import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Avatar } from '../components/Avatar';
import { eur, formatDate, hoursBetween, cn } from '../lib/utils';
import type { ShiftTask, ProgressReport } from '../lib/types';
import {
  Clock,
  CheckCircle2,
  TrendingUp,
  Plus,
  UserPlus,
  X,
  Mail,
  Shield,
  Trash2,
  Play,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: 'dashboard' | 'shifts' | 'reports' | 'invoices' | 'chat' | 'profile') => void;
}

export function DashboardPage({ onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const { activeWorkspace, activeRole, members, addMemberByEmail, updateMemberRole, removeMember } = useWorkspace();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<ShiftTask[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    if (!activeWorkspace) return;
    const wsId = activeWorkspace.id;
    supabase
      .from('shift_tasks')
      .select('*, assignee:profiles!shift_tasks_assigned_user_id_fkey(*)')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setTasks((data ?? []) as ShiftTask[]));
    supabase
      .from('progress_reports')
      .select('*, created_by_profile:profiles!progress_reports_created_by_fkey(*)')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setReports((data ?? []) as ProgressReport[]));
  }, [activeWorkspace]);

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-slate-500">No workspace selected. Create one to get started.</p>
        </div>
      </div>
    );
  }

  const completedTasks = tasks.filter((t) => t.completed).length;
  const activeTasks = tasks.filter((t) => t.status === 'active').length;
  const totalEarnings = tasks.reduce((sum, t) => sum + (t.total_eur ?? 0), 0);
  const totalHours = tasks.reduce((sum, t) => sum + hoursBetween(t.clock_in_at, t.clock_out_at), 0);
  const isAdmin = activeRole === 'owner' || activeRole === 'admin';

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace) return;
    setInviteError(null);
    setInviteLoading(true);
    const { error } = await addMemberByEmail(activeWorkspace.id, inviteEmail);
    if (error) {
      setInviteError(error);
    } else {
      toast('Member invited successfully!');
      setInviteEmail('');
      setShowInvite(false);
    }
    setInviteLoading(false);
  }

  const stats = [
    {
      label: 'Total Tasks',
      value: tasks.length.toString(),
      icon: Clock,
      color: 'text-brand-blue-600 bg-brand-blue-50',
    },
    {
      label: 'Completed',
      value: `${completedTasks} / ${tasks.length}`,
      icon: CheckCircle2,
      color: 'text-brand-green-600 bg-brand-green-50',
    },
    {
      label: 'Active Shifts',
      value: activeTasks.toString(),
      icon: Play,
      color: 'text-brand-yellow-600 bg-brand-yellow-50',
    },
    {
      label: 'Total Earnings',
      value: eur(totalEarnings),
      icon: TrendingUp,
      color: 'text-brand-green-600 bg-brand-green-50',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{activeWorkspace.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeWorkspace.description || 'Workspace dashboard'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => onNavigate('shifts')}>
            <Clock className="h-4 w-4" /> Manage Shifts
          </button>
          <button className="btn-primary" onClick={() => onNavigate('reports')}>
            <Plus className="h-4 w-4" /> New Report
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('invoices')}>
            Invoices
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className={cn('mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg', s.color)}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Recent tasks */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent Tasks</h2>
            <button className="text-sm font-medium text-brand-blue-600 hover:text-brand-blue-700" onClick={() => onNavigate('shifts')}>
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {tasks.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">
                No tasks yet. Create your first shift task to get started.
              </div>
            ) : (
              tasks.slice(0, 6).map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', task.completed ? 'bg-brand-green-50' : task.status === 'active' ? 'bg-brand-yellow-50' : 'bg-slate-100')}>
                    {task.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-brand-green-600" />
                    ) : task.status === 'active' ? (
                      <Play className="h-4 w-4 text-brand-yellow-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">{task.work_package} · {task.assignee?.display_name || 'Unassigned'}</p>
                  </div>
                  <div className="text-right">
                    {task.total_eur > 0 && <p className="text-sm font-semibold text-slate-900">{eur(task.total_eur)}</p>}
                    <p className="text-xs text-slate-400">{hoursBetween(task.clock_in_at, task.clock_out_at).toFixed(1)}h</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent reports */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent Reports</h2>
            <button className="text-sm font-medium text-brand-blue-600 hover:text-brand-blue-700" onClick={() => onNavigate('reports')}>
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">
                No reports yet.
              </div>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                    {r.status === 'complete' && (
                      <span className="ml-2 shrink-0 rounded-full bg-brand-green-50 px-2 py-0.5 text-xs font-medium text-brand-green-700">
                        Complete
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-yellow-400 transition-all"
                        style={{ width: `${r.completion_pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-600">{r.completion_pct}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Members section */}
      <div className="mt-6 card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Members</h2>
          {isAdmin && (
            <button className="btn-ghost text-sm" onClick={() => setShowInvite(!showInvite)}>
              <UserPlus className="h-4 w-4" /> Invite
            </button>
          )}
        </div>

        {showInvite && isAdmin && (
          <form onSubmit={handleInvite} className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  className="input pl-9"
                  placeholder="member@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={inviteLoading}>
                {inviteLoading ? 'Sending...' : 'Invite'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setShowInvite(false); setInviteError(null); }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}
          </form>
        )}

        <div className="divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar profile={m.profile} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {m.profile?.display_name || 'Unknown'}
                  {m.user_id === user?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.profile?.username ? `@${m.profile.username}` : ''}</p>
              </div>
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => updateMemberRole(m.id, e.target.value as 'owner' | 'admin' | 'member')}
                    disabled={m.role === 'owner'}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-blue-500 focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  {m.role !== 'owner' && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  m.role === 'owner' ? 'bg-brand-green-50 text-brand-green-700' : m.role === 'admin' ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-600',
                )}>
                  {m.role === 'owner' && <Shield className="h-3 w-3" />}
                  {m.role}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary footer */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Total Hours Logged</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Workspace Created</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatDate(activeWorkspace.created_at)}</p>
        </div>
      </div>
    </div>
  );
}
