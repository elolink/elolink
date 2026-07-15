import { useEffect, useState, useCallback } from 'react';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { eur, formatDate, cn } from '../lib/utils';
import type { Invoice, ShiftTask, ProgressReport, InvoiceStatus } from '../lib/types';
import {
  Plus,
  Receipt,
  Send,
  FileText,
  X,
  CheckCircle2,
  Download,
} from 'lucide-react';

export function InvoicesPage() {
  const { activeWorkspace, activeRole } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [completedTasks, setCompletedTasks] = useState<ShiftTask[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Create form state
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!activeWorkspace) return;
    const { data, error } = await supabase
      .from('invoices')
      .select('*, shift_task:shift_tasks(*)')
      .eq('workspace_id', activeWorkspace.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load invoices:', error.message);
      return;
    }
    setInvoices((data ?? []) as Invoice[]);
  }, [activeWorkspace]);

  const loadCompletedTasks = useCallback(async () => {
    if (!activeWorkspace) return;
    const { data, error } = await supabase
      .from('shift_tasks')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('completed', true)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load completed tasks:', error.message);
      return;
    }
    setCompletedTasks((data ?? []) as ShiftTask[]);
  }, [activeWorkspace]);

  const loadReports = useCallback(async () => {
    if (!activeWorkspace) return;
    const { data, error } = await supabase
      .from('progress_reports')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('status', 'complete')
      .order('created_at', { ascending: false });
    if (error) return;
    setReports((data ?? []) as ProgressReport[]);
  }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace) return;
    setLoading(true);
    Promise.all([loadInvoices(), loadCompletedTasks(), loadReports()]).finally(() => setLoading(false));
  }, [activeWorkspace, loadInvoices, loadCompletedTasks, loadReports]);

  // Realtime
  useEffect(() => {
    if (!activeWorkspace) return;
    const channel = supabase
      .channel(`invoices:${activeWorkspace.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `workspace_id=eq.${activeWorkspace.id}` },
        () => loadInvoices()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeWorkspace, loadInvoices]);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !user || !selectedTaskId) return;
    setCreating(true);

    const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number', {
      p_workspace_id: activeWorkspace.id,
    });
    if (!invoiceNumber) {
      toast('Failed to generate invoice number.', 'error');
      setCreating(false);
      return;
    }

    const selectedTask = completedTasks.find((t) => t.id === selectedTaskId);
    if (!selectedTask) {
      toast('Please select a completed shift.', 'error');
      setCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        workspace_id: activeWorkspace.id,
        shift_task_id: selectedTaskId,
        report_id: selectedReportId || null,
        client_name: clientName.trim(),
        client_email: clientEmail.trim(),
        client_address: clientAddress.trim(),
        invoice_number: invoiceNumber,
        amount_eur: selectedTask.total_eur,
        notes: notes.trim() || null,
        created_by: user.id,
      })
      .select('*')
      .maybeSingle();

    if (error || !data) {
      toast('Failed to create invoice.', 'error');
      setCreating(false);
      return;
    }

    toast('Invoice created successfully!');
    setShowCreate(false);
    setSelectedTaskId('');
    setSelectedReportId('');
    setClientName('');
    setClientEmail('');
    setClientAddress('');
    setNotes('');
    setCreating(false);
    await loadInvoices();
  }

  async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
    const updates: Record<string, unknown> = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (status === 'paid') updates.paid_at = new Date().toISOString();

    const { error } = await supabase.from('invoices').update(updates).eq('id', id);
    if (error) {
      toast('Failed to update invoice.', 'error');
      return;
    }
    toast(`Invoice marked as ${status}.`);
    await loadInvoices();
  }

  function downloadInvoicePDF(invoice: Invoice) {
    const task = invoice.shift_task;
    const ws = activeWorkspace;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${invoice.invoice_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; padding: 40px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .logo { font-size: 24px; font-weight: bold; color: #059669; }
  .invoice-meta { text-align: right; }
  .invoice-meta h1 { font-size: 32px; color: #1e293b; }
  .invoice-meta p { color: #64748b; font-size: 14px; margin-top: 4px; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 8px; }
  .section p { font-size: 16px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th { text-align: left; padding: 12px 16px; background: #f1f5f9; font-size: 12px; text-transform: uppercase; color: #64748b; }
  td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .total-row { font-weight: bold; font-size: 18px; background: #f0fdf4; }
  .total-row td { border-top: 2px solid #059669; }
  .notes { margin-top: 32px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 14px; color: #64748b; }
  .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #94a3b8; }
</style></head><body>
  <div class="header">
    <div class="logo">EloLink</div>
    <div class="invoice-meta">
      <h1>INVOICE</h1>
      <p>${invoice.invoice_number}</p>
      <p>${formatDate(invoice.created_at)}</p>
    </div>
  </div>
  <div class="section">
    <h2>From</h2>
    <p>${ws?.name ?? 'Unknown'}<br/>${ws?.name ?? ''}</p>
  </div>
  <div class="section">
    <h2>Bill To</h2>
    <p>${invoice.client_name || 'Client'}<br/>${invoice.client_email || ''}<br/>${invoice.client_address || ''}</p>
  </div>
  <table>
    <thead><tr><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>
      <tr>
        <td>${task?.title || 'Completed shift'}</td>
        <td>${task?.clock_in_at && task?.clock_out_at ? (Number(new Date(task.clock_out_at).getTime() - new Date(task.clock_in_at).getTime()) / 3600000).toFixed(2) : '-'}</td>
        <td>${eur(task?.hourly_rate_eur ?? 0)}/hr</td>
        <td>${eur(invoice.amount_eur)}</td>
      </tr>
      <tr class="total-row"><td colspan="3" style="text-align: right;">Total</td><td>${eur(invoice.amount_eur)}</td></tr>
    </tbody>
  </table>
  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
  <div class="footer">Generated by EloLink - ${formatDate(new Date())}</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        win.print();
      };
    }
  }

  if (!activeWorkspace) {
    return <div className="p-8 text-center text-slate-500">No workspace selected.</div>;
  }

  const canManage = activeRole === 'owner' || activeRole === 'admin';

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Loading invoices...</div>;
  }

  const statusColors: Record<InvoiceStatus, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-brand-blue-50 text-brand-blue-700',
    paid: 'bg-brand-green-50 text-brand-green-700',
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">Generate and send invoices for completed shifts</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setShowCreate(true)} disabled={completedTasks.length === 0}>
            <Plus className="h-4 w-4" /> New Invoice
          </button>
        )}
      </div>

      {completedTasks.length === 0 && canManage && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <Receipt className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">
            No completed shifts available. Complete a shift first to generate an invoice.
          </p>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <Receipt className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="text-slate-500">No invoices yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-green-50">
                    <Receipt className="h-5 w-5 text-brand-green-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{inv.invoice_number}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusColors[inv.status])}>
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {inv.client_name || 'No client name'} - {formatDate(inv.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-lg font-bold text-slate-900">{eur(inv.amount_eur)}</p>
                  <button
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setSelectedInvoice(inv)}
                    title="View details"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create invoice modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New Invoice</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createInvoice} className="space-y-4">
              <div>
                <label className="label">Completed Shift *</label>
                <select
                  className="input"
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  required
                >
                  <option value="">Select a completed shift...</option>
                  {completedTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title || 'Untitled'} - {eur(t.total_eur)} ({t.work_package})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Linked Report (optional)</label>
                <select
                  className="input"
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                >
                  <option value="">None</option>
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Client Name</label>
                  <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Corp" />
                </div>
                <div>
                  <label className="label">Client Email</label>
                  <input className="input" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="billing@acme.com" />
                </div>
              </div>
              <div>
                <label className="label">Client Address</label>
                <textarea className="input min-h-[60px]" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="123 Main St, Berlin, Germany" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment due within 30 days..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Invoice'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice detail modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSelectedInvoice(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selectedInvoice.invoice_number}</h2>
                <p className="text-sm text-slate-500">{formatDate(selectedInvoice.created_at)}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Status</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusColors[selectedInvoice.status])}>
                  {selectedInvoice.status}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Client</span>
                <span className="font-medium text-slate-900">{selectedInvoice.client_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Client Email</span>
                <span className="font-medium text-slate-900">{selectedInvoice.client_email || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Shift</span>
                <span className="font-medium text-slate-900">{selectedInvoice.shift_task?.title || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Amount</span>
                <span className="text-lg font-bold text-slate-900">{eur(selectedInvoice.amount_eur)}</span>
              </div>
              {selectedInvoice.notes && (
                <div className="border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Notes</span>
                  <p className="mt-1 text-slate-700">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn-secondary text-sm" onClick={() => downloadInvoicePDF(selectedInvoice)}>
                <Download className="h-4 w-4" /> Download PDF
              </button>
              {canManage && selectedInvoice.status === 'draft' && (
                <button className="btn-blue text-sm" onClick={() => updateInvoiceStatus(selectedInvoice.id, 'sent')}>
                  <Send className="h-4 w-4" /> Mark as Sent
                </button>
              )}
              {canManage && selectedInvoice.status !== 'paid' && (
                <button className="btn-primary text-sm" onClick={() => updateInvoiceStatus(selectedInvoice.id, 'paid')}>
                  <CheckCircle2 className="h-4 w-4" /> Mark as Paid
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
