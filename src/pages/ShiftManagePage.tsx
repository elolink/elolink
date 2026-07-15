import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Avatar } from '../components/Avatar';
import { eur, hoursBetween, formatTime, cn } from '../lib/utils';
import type { ShiftTask, Profile } from '../lib/types';
import {
  Plus,
  Play,
  Square,
  CheckCircle2,
  Circle,
  Trash2,
  ChevronUp,
  ChevronDown,
  Search,
  Clock,
} from 'lucide-react';

type SortField = 'title' | 'work_package' | 'assignee' | 'rate' | 'total' | 'status';
type SortDir = 'asc' | 'desc';

export function ShiftManagePage() {
  const { activeWorkspace, members } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ShiftTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | 'created'>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterPackage, setFilterPackage] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [collapsedPackages, setCollapsedPackages] = useState<Set<string>>(new Set());
  const editingRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const loadTasks = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('shift_tasks')
      .select('*, assignee:profiles!shift_tasks_assigned_user_id_fkey(*)')
      .eq('workspace_id', activeWorkspace.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load tasks:', error.message);
    } else {
      setTasks((data ?? []) as ShiftTask[]);
    }
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!activeWorkspace) return;
    const channel = supabase
      .channel(`shift_tasks:${activeWorkspace.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shift_tasks', filter: `workspace_id=eq.${activeWorkspace.id}` },
        () => { loadTasks(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeWorkspace, loadTasks]);

  async function addTask() {
    if (!activeWorkspace || !user) return;
    const { data, error } = await supabase
      .from('shift_tasks')
      .insert({
        workspace_id: activeWorkspace.id,
        title: 'New task',
        assigned_user_id: user.id,
        work_package: 'General',
        hourly_rate_eur: 25,
      })
      .select('*, assignee:profiles!shift_tasks_assigned_user_id_fkey(*)')
      .maybeSingle();
    if (data) {
      setTasks((prev) => [data as ShiftTask, ...prev]);
      setEditingId(data.id);
      setEditingField('title');
      toast('New shift created.');
    } else if (error) {
      console.error('Failed to add task:', error.message);
      toast('Failed to create shift.', 'error');
    }
  }

  async function updateTask(id: string, updates: Partial<ShiftTask>) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));

    const dbUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      dbUpdates[key] = value;
    }

    const { error } = await supabase.from('shift_tasks').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('Failed to update task:', error.message);
      loadTasks(); // Revert
    }
  }

  async function toggleClock(id: string, task: ShiftTask) {
    if (task.status === 'active') {
      // Clock out
      await updateTask(id, {
        clock_out_at: new Date().toISOString(),
        status: 'pending',
      });
    } else {
      // Clock in
      await updateTask(id, {
        clock_in_at: new Date().toISOString(),
        clock_out_at: null,
        status: 'active',
      });
    }
  }

  async function toggleComplete(id: string, completed: boolean) {
    await updateTask(id, {
      completed,
      status: completed ? 'completed' : 'pending',
    });
    if (completed) toast('Shift marked as completed.');
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('shift_tasks').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete task:', error.message);
      loadTasks();
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function togglePackage(pkg: string) {
    setCollapsedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }

  // Filter and sort
  const filtered = tasks.filter((t) => {
    if (filterPackage !== 'all' && t.work_package !== filterPackage) return false;
    if (filterAssignee !== 'all' && t.assigned_user_id !== filterAssignee) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.work_package.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'title': cmp = a.title.localeCompare(b.title); break;
      case 'work_package': cmp = a.work_package.localeCompare(b.work_package); break;
      case 'assignee': cmp = (a.assignee?.display_name ?? '').localeCompare(b.assignee?.display_name ?? ''); break;
      case 'rate': cmp = a.hourly_rate_eur - b.hourly_rate_eur; break;
      case 'total': cmp = (a.total_eur ?? 0) - (b.total_eur ?? 0); break;
      case 'status': cmp = a.status.localeCompare(b.status); break;
      default: cmp = 0;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Group by work package
  const packages = [...new Set(sorted.map((t) => t.work_package))].sort();
  const grouped = packages.map((pkg) => ({
    pkg,
    tasks: sorted.filter((t) => t.work_package === pkg),
  }));

  // Totals
  const totalEarnings = filtered.reduce((s, t) => s + (t.total_eur ?? 0), 0);
  const totalHours = filtered.reduce((s, t) => s + hoursBetween(t.clock_in_at, t.clock_out_at), 0);
  const totalCompleted = filtered.filter((t) => t.completed).length;

  // Per-worker totals
  const workerTotals = new Map<string, { hours: number; earnings: number; name: string; avatar: Profile | null }>();
  for (const t of filtered) {
    const key = t.assigned_user_id ?? 'unassigned';
    const name = t.assignee?.display_name ?? 'Unassigned';
    const existing = workerTotals.get(key) ?? { hours: 0, earnings: 0, name, avatar: t.assignee ?? null };
    existing.hours += hoursBetween(t.clock_in_at, t.clock_out_at);
    existing.earnings += t.total_eur ?? 0;
    workerTotals.set(key, existing);
  }

  // Per-package totals
  const packageTotals = new Map<string, { hours: number; earnings: number }>();
  for (const t of filtered) {
    const existing = packageTotals.get(t.work_package) ?? { hours: 0, earnings: 0 };
    existing.hours += hoursBetween(t.clock_in_at, t.clock_out_at);
    existing.earnings += t.total_eur ?? 0;
    packageTotals.set(t.work_package, existing);
  }

  if (!activeWorkspace) {
    return <div className="p-8 text-center text-slate-500">No workspace selected.</div>;
  }

  function startEdit(id: string, field: string) {
    setEditingId(id);
    setEditingField(field);
    setTimeout(() => editingRef.current?.focus(), 0);
  }

  function commitEdit() {
    setEditingId(null);
    setEditingField(null);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shift Manage</h1>
          <p className="text-sm text-slate-500">Track tasks, clock in/out, and calculate earnings</p>
        </div>
        <button className="btn-primary" onClick={addTask}>
          <Plus className="h-4 w-4" /> Add Task
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={filterPackage}
          onChange={(e) => setFilterPackage(e.target.value)}
        >
          <option value="all">All packages</option>
          {packages.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          className="input w-auto"
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
        >
          <option value="all">All workers</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? 'Unknown'}</option>
          ))}
        </select>
      </div>

      {/* Summary bar */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Tasks</p>
          <p className="text-lg font-bold text-slate-900">{filtered.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Completed</p>
          <p className="text-lg font-bold text-brand-green-600">{totalCompleted} / {filtered.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Total Hours</p>
          <p className="text-lg font-bold text-brand-blue-600">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Total Earnings</p>
          <p className="text-lg font-bold text-brand-green-600">{eur(totalEarnings)}</p>
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading tasks...</div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Clock className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-400">No tasks found. Click "Add Task" to create your first shift.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Header */}
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort('title')}>
                    <div className="flex items-center gap-1">Task {sortField === 'title' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                  </th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort('work_package')}>
                    <div className="flex items-center gap-1">Package {sortField === 'work_package' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                  </th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort('assignee')}>
                    <div className="flex items-center gap-1">Assigned {sortField === 'assignee' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                  </th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort('rate')}>
                    <div className="flex items-center gap-1">Rate/hr {sortField === 'rate' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                  </th>
                  <th className="px-3 py-3">Clock In</th>
                  <th className="px-3 py-3">Clock Out</th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort('total')}>
                    <div className="flex items-center gap-1">Total {sortField === 'total' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                  </th>
                  <th className="px-3 py-3">Clock</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ pkg, tasks: pkgTasks }) => {
                  const isCollapsed = collapsedPackages.has(pkg);
                  const pkgTotal = packageTotals.get(pkg);
                  return (
                    <Fragment key={`pkg-${pkg}`}>
                      {/* Package group header */}
                      <tr
                        key={`pkg-${pkg}`}
                        className="cursor-pointer border-b border-slate-200 bg-brand-blue-50/50 hover:bg-brand-blue-50"
                        onClick={() => togglePackage(pkg)}
                      >
                        <td className="px-3 py-2.5">
                          {isCollapsed ? <ChevronDown className="h-4 w-4 text-brand-blue-600" /> : <ChevronUp className="h-4 w-4 text-brand-blue-600" />}
                        </td>
                        <td colSpan={3} className="px-3 py-2.5">
                          <span className="font-semibold text-brand-blue-800">{pkg}</span>
                          <span className="ml-2 text-xs text-brand-blue-500">({pkgTasks.length} task{pkgTasks.length !== 1 ? 's' : ''})</span>
                        </td>
                        <td colSpan={2} className="px-3 py-2.5 text-right text-xs text-brand-blue-600">
                          {pkgTotal?.hours.toFixed(1)}h
                        </td>
                        <td colSpan={2} className="px-3 py-2.5 text-right text-xs font-semibold text-brand-blue-700">
                          {eur(pkgTotal?.earnings ?? 0)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                      {!isCollapsed && pkgTasks.map((task) => (
                        <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          {/* Complete checkbox */}
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => toggleComplete(task.id, !task.completed)}
                              className={cn('transition-colors', task.completed ? 'text-brand-green-600' : 'text-slate-300 hover:text-slate-400')}
                            >
                              {task.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                            </button>
                          </td>
                          {/* Title */}
                          <td className="px-3 py-2.5" onClick={() => startEdit(task.id, 'title')}>
                            {editingId === task.id && editingField === 'title' ? (
                              <input
                                ref={editingRef as React.RefObject<HTMLInputElement>}
                                className="input py-1"
                                defaultValue={task.title}
                                onBlur={(e) => { updateTask(task.id, { title: e.target.value }); commitEdit(); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              />
                            ) : (
                              <span className={cn('font-medium', task.completed ? 'text-slate-400 line-through' : 'text-slate-900')}>
                                {task.title}
                              </span>
                            )}
                          </td>
                          {/* Work package */}
                          <td className="px-3 py-2.5" onClick={() => startEdit(task.id, 'work_package')}>
                            {editingId === task.id && editingField === 'work_package' ? (
                              <input
                                ref={editingRef as React.RefObject<HTMLInputElement>}
                                className="input py-1"
                                defaultValue={task.work_package}
                                onBlur={(e) => { updateTask(task.id, { work_package: e.target.value }); commitEdit(); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              />
                            ) : (
                              <span className="rounded-md bg-brand-blue-50 px-2 py-0.5 text-xs font-medium text-brand-blue-700">
                                {task.work_package}
                              </span>
                            )}
                          </td>
                          {/* Assigned */}
                          <td className="px-3 py-2.5" onClick={() => startEdit(task.id, 'assigned_user_id')}>
                            {editingId === task.id && editingField === 'assigned_user_id' ? (
                              <select
                                ref={editingRef as React.RefObject<HTMLSelectElement>}
                                className="input py-1"
                                defaultValue={task.assigned_user_id ?? ''}
                                onBlur={(e) => { updateTask(task.id, { assigned_user_id: e.target.value || null }); commitEdit(); }}
                                onChange={(e) => { updateTask(task.id, { assigned_user_id: e.target.value || null }); commitEdit(); }}
                              >
                                <option value="">Unassigned</option>
                                {members.map((m) => (
                                  <option key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? 'Unknown'}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Avatar profile={task.assignee} size="xs" />
                                <span className="text-slate-700">{task.assignee?.display_name ?? 'Unassigned'}</span>
                              </div>
                            )}
                          </td>
                          {/* Rate */}
                          <td className="px-3 py-2.5" onClick={() => startEdit(task.id, 'hourly_rate_eur')}>
                            {editingId === task.id && editingField === 'hourly_rate_eur' ? (
                              <input
                                ref={editingRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                step="0.50"
                                className="input w-20 py-1"
                                defaultValue={task.hourly_rate_eur}
                                onBlur={(e) => { updateTask(task.id, { hourly_rate_eur: parseFloat(e.target.value) || 0 }); commitEdit(); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              />
                            ) : (
                              <span className="text-slate-700">{eur(task.hourly_rate_eur)}</span>
                            )}
                          </td>
                          {/* Clock in */}
                          <td className="px-3 py-2.5 text-slate-500">
                            {task.clock_in_at ? formatTime(task.clock_in_at) : '—'}
                          </td>
                          {/* Clock out */}
                          <td className="px-3 py-2.5 text-slate-500">
                            {task.clock_out_at ? formatTime(task.clock_out_at) : '—'}
                          </td>
                          {/* Total */}
                          <td className="px-3 py-2.5 font-semibold text-slate-900">
                            {eur(task.total_eur ?? 0)}
                          </td>
                          {/* Clock button */}
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => toggleClock(task.id, task)}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                task.status === 'active'
                                  ? 'bg-brand-yellow-100 text-brand-yellow-700 hover:bg-brand-yellow-200'
                                  : 'bg-brand-green-50 text-brand-green-700 hover:bg-brand-green-100',
                              )}
                            >
                              {task.status === 'active' ? (
                                <><Square className="h-3 w-3" /> Out</>
                              ) : (
                                <><Play className="h-3 w-3" /> In</>
                              )}
                            </button>
                          </td>
                          {/* Delete */}
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-worker totals */}
      {workerTotals.size > 0 && (
        <div className="mt-6 card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Per-Worker Totals</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {[...workerTotals.entries()].sort((a, b) => b[1].earnings - a[1].earnings).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3 px-5 py-3">
                <Avatar profile={val.avatar} size="sm" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{val.name}</p>
                  <p className="text-xs text-slate-500">{val.hours.toFixed(1)} hours</p>
                </div>
                <p className="text-sm font-semibold text-brand-green-600">{eur(val.earnings)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
