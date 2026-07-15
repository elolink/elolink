import { useEffect, useState, useCallback } from 'react';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Avatar } from '../components/Avatar';
import { eur, formatDate, hoursBetween, todayISO, dateOffset, cn } from '../lib/utils';
import type { ProgressReport, ShiftTask, ReportComment, WorkspaceMember, Profile } from '../lib/types';
import {
  Plus,
  FileText,
  CheckCircle2,
  Circle,
  ArrowLeft,
  Download,
  Send,
  Trash2,
  Loader2,
  MessageSquare,
  Calendar,
  Clock,
} from 'lucide-react';

export function ReportsPage() {
  const { activeWorkspace, members } = useWorkspace();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ProgressReport | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [startDate, setStartDate] = useState(dateOffset(-7));
  const [endDate, setEndDate] = useState(todayISO());
  const [deadline, setDeadline] = useState('');

  const loadReports = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('progress_reports')
      .select('*, created_by_profile:profiles!progress_reports_created_by_fkey(*)')
      .eq('workspace_id', activeWorkspace.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load reports:', error.message);
    } else {
      setReports((data ?? []) as ProgressReport[]);
    }
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Realtime
  useEffect(() => {
    if (!activeWorkspace) return;
    const channel = supabase
      .channel(`progress_reports:${activeWorkspace.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'progress_reports', filter: `workspace_id=eq.${activeWorkspace.id}` },
        () => { loadReports(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeWorkspace, loadReports]);

  async function createReport(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !user) return;
    const { data, error } = await supabase
      .from('progress_reports')
      .insert({
        workspace_id: activeWorkspace.id,
        title: newTitle.trim() || `Report ${formatDate(startDate)} – ${formatDate(endDate)}`,
        start_date: startDate,
        end_date: endDate,
        deadline: deadline || null,
        created_by: user.id,
      })
      .select('*, created_by_profile:profiles!progress_reports_created_by_fkey(*)')
      .maybeSingle();
    if (error) {
      console.error('Failed to create report:', error.message);
      toast('Failed to create report.', 'error');
      return;
    }
    if (data) {
      // Link tasks within the date range
      const { data: tasksInRange } = await supabase
        .from('shift_tasks')
        .select('id')
        .eq('workspace_id', activeWorkspace.id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
      if (tasksInRange && tasksInRange.length > 0) {
        const reportId = (data as ProgressReport).id;
        await supabase.from('progress_report_tasks').insert(
          tasksInRange.map((t) => ({ report_id: reportId, shift_task_id: t.id }))
        );
      }
      setShowCreate(false);
      setNewTitle('');
      setDeadline('');
      await loadReports();
      setSelectedReport(data as ProgressReport);
      toast('Progress report created successfully!');
    }
  }

  async function markComplete(report: ProgressReport) {
    const { error } = await supabase
      .from('progress_reports')
      .update({ status: 'complete' })
      .eq('id', report.id);
    if (error) {
      console.error('Failed to mark complete:', error.message);
      toast('Failed to submit report.', 'error');
      return;
    }
    // Trigger email notification via edge function
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-notification`;
      await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ report_id: report.id }),
      });
    } catch (err) {
      console.error('Notification trigger failed:', err);
    }
    await loadReports();
    toast('Report submitted and notifications sent!');
  }

  async function deleteReport(id: string) {
    const { error } = await supabase.from('progress_reports').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete report:', error.message);
      return;
    }
    setSelectedReport(null);
    loadReports();
  }

  if (selectedReport) {
    return (
      <ReportDetail
        report={selectedReport}
        onBack={() => { setSelectedReport(null); loadReports(); }}
        onComplete={() => markComplete(selectedReport)}
        onDelete={() => deleteReport(selectedReport.id)}
        members={members}
        currentUserId={user?.id ?? ''}
        currentProfile={profile}
      />
    );
  }

  if (!activeWorkspace) {
    return <div className="p-8 text-center text-slate-500">No workspace selected.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Progress Reports</h1>
          <p className="text-sm text-slate-500">Generate reports from your shift tasks</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" /> New Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createReport} className="mb-6 card animate-slide-up p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Create Progress Report</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="label">Report Title</label>
              <input
                className="input"
                placeholder={`Report ${formatDate(startDate)} – ${formatDate(endDate)}`}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Deadline (optional)</label>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn-primary flex-1">Generate</button>
              <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Tasks created within the date range will be automatically linked to this report.
          </p>
        </form>
      )}

      {/* Reports list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="card py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-400">No reports yet. Click "New Report" to generate one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="card cursor-pointer p-5 transition-all hover:shadow-md"
              onClick={() => setSelectedReport(report)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{report.title}</h3>
                    {report.status === 'complete' && (
                      <span className="shrink-0 rounded-full bg-brand-green-50 px-2 py-0.5 text-xs font-medium text-brand-green-700">
                        Complete
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(report.start_date)} – {formatDate(report.end_date)}
                    </span>
                    {report.deadline && (
                      <span className={cn('flex items-center gap-1', new Date(report.deadline) < new Date() && report.status !== 'complete' ? 'text-red-500' : '')}>
                        <Clock className="h-3 w-3" />
                        Due {formatDate(report.deadline)}
                      </span>
                    )}
                    <span>by {report.created_by_profile?.display_name ?? 'Unknown'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{report.completion_pct}%</p>
                  <p className="text-xs text-slate-400">complete</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-yellow-400 to-brand-yellow-500 transition-all duration-500"
                  style={{ width: `${report.completion_pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// REPORT DETAIL VIEW
// =========================================================

interface ReportDetailProps {
  report: ProgressReport;
  onBack: () => void;
  onComplete: () => void;
  onDelete: () => void;
  members: WorkspaceMember[];
  currentUserId: string;
  currentProfile: Profile | null;
}

function ReportDetail({ report, onBack, onComplete, onDelete, currentUserId }: ReportDetailProps) {
  const [tasks, setTasks] = useState<ShiftTask[]>([]);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from('progress_report_tasks')
      .select('shift_task_id')
      .eq('report_id', report.id);
    if (!data || data.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const taskIds = data.map((d) => d.shift_task_id);
    const { data: taskData } = await supabase
      .from('shift_tasks')
      .select('*, assignee:profiles!shift_tasks_assigned_user_id_fkey(*)')
      .in('id', taskIds)
      .order('work_package', { ascending: true });
    setTasks((taskData ?? []) as ShiftTask[]);
    setLoading(false);
  }, [report.id]);

  const loadComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('report_comments')
      .select('*, author_profile:profiles!report_comments_author_id_fkey(*)')
      .eq('report_id', report.id)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to load comments:', error.message);
      return;
    }
    setComments((data ?? []) as any);
  }, [report.id]);

  useEffect(() => {
    loadTasks();
    loadComments();
  }, [loadTasks, loadComments]);

  // Realtime for task completion updates
  useEffect(() => {
    const channel = supabase
      .channel(`report_detail:${report.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shift_tasks' },
        () => { loadTasks(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'report_comments', filter: `report_id=eq.${report.id}` },
        () => { loadComments(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [report.id, loadTasks, loadComments]);

  async function toggleTaskComplete(taskId: string, completed: boolean) {
    const { error } = await supabase.from('shift_tasks').update({ completed, status: completed ? 'completed' : 'pending' }).eq('id', taskId);
    if (error) console.error('Failed to update task:', error.message);
    loadTasks();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setCommentLoading(true);
    const { error } = await supabase.from('report_comments').insert({
      report_id: report.id,
      author_id: currentUserId,
      content: newComment.trim(),
    });
    if (error) {
      console.error('Failed to add comment:', error.message);
    } else {
      setNewComment('');
      loadComments();
    }
    setCommentLoading(false);
  }

  async function deleteComment(commentId: string) {
    const { error } = await supabase.from('report_comments').delete().eq('id', commentId);
    if (error) {
      console.error('Failed to delete comment:', error.message);
      return;
    }
    loadComments();
  }

  function exportPDF() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const completedTasks = tasks.filter((t) => t.completed).length;
    const totalHours = tasks.reduce((s, t) => s + hoursBetween(t.clock_in_at, t.clock_out_at), 0);
    const totalEarnings = tasks.reduce((s, t) => s + (t.total_eur ?? 0), 0);

    // Group by package
    const packages = [...new Set(tasks.map((t) => t.work_package))].sort();
    const groupedRows = packages.map((pkg) => {
      const pkgTasks = tasks.filter((t) => t.work_package === pkg);
      const pkgRows = pkgTasks.map((t) => `
        <tr>
          <td style="text-align:center">${t.completed ? '✓' : '○'}</td>
          <td>${t.title}</td>
          <td>${t.assignee?.display_name ?? 'Unassigned'}</td>
          <td style="text-align:right">${hoursBetween(t.clock_in_at, t.clock_out_at).toFixed(1)}h</td>
          <td style="text-align:right">€${(t.hourly_rate_eur ?? 0).toFixed(2)}</td>
          <td style="text-align:right">€${(t.total_eur ?? 0).toFixed(2)}</td>
        </tr>
      `).join('');
      const pkgHours = pkgTasks.reduce((s, t) => s + hoursBetween(t.clock_in_at, t.clock_out_at), 0);
      const pkgEarnings = pkgTasks.reduce((s, t) => s + (t.total_eur ?? 0), 0);
      return `
        <tbody>
          <tr class="pkg-header">
            <td colspan="6">${pkg} — ${pkgTasks.length} task(s), ${pkgHours.toFixed(1)}h, €${pkgEarnings.toFixed(2)}</td>
          </tr>
          ${pkgRows}
        </tbody>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${report.title} — EloLink</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; padding: 48px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #059669; padding-bottom: 20px; margin-bottom: 32px; }
          .logo { font-size: 24px; font-weight: 800; }
          .logo span { color: #059669; }
          .meta { text-align: right; font-size: 12px; color: #64748b; }
          h1 { font-size: 22px; margin-bottom: 8px; }
          .date-range { font-size: 14px; color: #64748b; margin-bottom: 24px; }
          .progress-section { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; padding: 20px; background: #fef3c7; border-radius: 12px; }
          .progress-circle { width: 80px; height: 80px; border-radius: 50%; background: conic-gradient(#f59e0b ${report.completion_pct}%, #f3f4f6 0); display: flex; align-items: center; justify-content: center; }
          .progress-circle span { font-size: 20px; font-weight: 700; }
          .progress-info p { font-size: 14px; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
          thead th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
          td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
          .pkg-header td { background: #eff6ff; font-weight: 600; color: #1e40af; padding: 8px 12px; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
          .summary-card { padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; }
          .summary-card .value { font-size: 24px; font-weight: 700; }
          .summary-card .label { font-size: 12px; color: #64748b; margin-top: 4px; }
          .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
          @media print { body { padding: 24px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Elo<span>Link</span></div>
          <div class="meta">
            Generated ${new Date().toLocaleDateString('en-GB')}<br/>
            ${report.created_by_profile?.display_name ?? ''}
          </div>
        </div>
        <h1>${report.title}</h1>
        <div class="date-range">${formatDate(report.start_date)} — ${formatDate(report.end_date)}</div>

        <div class="progress-section">
          <div class="progress-circle"><span>${report.completion_pct}%</span></div>
          <div class="progress-info">
            <p><strong>${completedTasks} of ${tasks.length} tasks completed</strong></p>
            <p>Status: ${report.status === 'complete' ? 'Complete' : 'Draft'}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px">Done</th>
              <th>Task</th>
              <th>Assigned</th>
              <th style="text-align:right">Hours</th>
              <th style="text-align:right">Rate/hr</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          ${groupedRows}
        </table>

        <div class="summary">
          <div class="summary-card">
            <div class="value">${totalHours.toFixed(1)}h</div>
            <div class="label">Total Hours</div>
          </div>
          <div class="summary-card">
            <div class="value">€${totalEarnings.toFixed(2)}</div>
            <div class="label">Total Earnings</div>
          </div>
          <div class="summary-card">
            <div class="value">${report.completion_pct}%</div>
            <div class="label">Completion</div>
          </div>
        </div>

        <div class="footer">Generated by EloLink — Progress Reporting & Shift Tracking</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalHours = tasks.reduce((s, t) => s + hoursBetween(t.clock_in_at, t.clock_out_at), 0);
  const totalEarnings = tasks.reduce((s, t) => s + (t.total_eur ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      {/* Back button */}
      <button className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to reports
      </button>

      {/* Report header */}
      <div className="card mb-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{report.title}</h1>
              {report.status === 'complete' ? (
                <span className="rounded-full bg-brand-green-50 px-2.5 py-0.5 text-xs font-medium text-brand-green-700">Complete</span>
              ) : (
                <span className="rounded-full bg-brand-yellow-50 px-2.5 py-0.5 text-xs font-medium text-brand-yellow-700">Draft</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(report.start_date)} — {formatDate(report.end_date)}
            </p>
            {report.deadline && (
              <p className={cn('mt-0.5 flex items-center gap-1 text-xs', new Date(report.deadline) < new Date() && report.status !== 'complete' ? 'text-red-500' : 'text-slate-400')}>
                <Clock className="h-3 w-3" />
                Deadline: {formatDate(report.deadline)}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Created by {report.created_by_profile?.display_name ?? 'Unknown'} on {formatDate(report.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={exportPDF}>
              <Download className="h-4 w-4" /> Export PDF
            </button>
            {report.status !== 'complete' && (
              <button className="btn-primary" onClick={onComplete}>
                <CheckCircle2 className="h-4 w-4" /> Mark Complete
              </button>
            )}
            <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Completion</span>
            <span className="text-sm font-bold text-brand-yellow-600">{report.completion_pct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-yellow-400 to-brand-yellow-500 transition-all duration-500"
              style={{ width: `${report.completion_pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {completedTasks} of {tasks.length} tasks completed
          </p>
        </div>

        {/* Summary */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-brand-blue-50 px-4 py-3 text-center">
            <p className="text-lg font-bold text-brand-blue-700">{totalHours.toFixed(1)}h</p>
            <p className="text-xs text-brand-blue-600">Total Hours</p>
          </div>
          <div className="rounded-lg bg-brand-green-50 px-4 py-3 text-center">
            <p className="text-lg font-bold text-brand-green-700">{eur(totalEarnings)}</p>
            <p className="text-xs text-brand-green-600">Total Earnings</p>
          </div>
          <div className="rounded-lg bg-brand-yellow-50 px-4 py-3 text-center">
            <p className="text-lg font-bold text-brand-yellow-700">{report.completion_pct}%</p>
            <p className="text-xs text-brand-yellow-600">Completion</p>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="card mb-6">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Linked Tasks</h2>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No tasks linked to this report. Create tasks in the Shift Manager within the report's date range.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                <button
                  onClick={() => toggleTaskComplete(task.id, !task.completed)}
                  className={cn('transition-colors', task.completed ? 'text-brand-green-600' : 'text-slate-300 hover:text-slate-400')}
                >
                  {task.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', task.completed ? 'text-slate-400 line-through' : 'text-slate-900')}>
                    {task.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {task.work_package} · {task.assignee?.display_name ?? 'Unassigned'} · {hoursBetween(task.clock_in_at, task.clock_out_at).toFixed(1)}h
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{eur(task.total_eur ?? 0)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-slate-400" /> Comments
          </h2>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {comments.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No comments yet. Start the discussion.</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3 px-5 py-3">
                <Avatar profile={c.author_profile} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{c.author_profile?.display_name ?? 'Unknown'}</p>
                    <span className="text-xs text-slate-400">{formatDate(c.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{c.content}</p>
                </div>
                {c.author_id === currentUserId && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <form onSubmit={addComment} className="border-t border-slate-100 p-4">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button type="submit" className="btn-blue" disabled={commentLoading || !newComment.trim()}>
              {commentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
