export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  nationality: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  max_members: number;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  profile?: Profile | null;
}

export interface WorkspaceMessage {
  id: string;
  workspace_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profile?: Profile | null;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

export type ShiftStatus = 'pending' | 'active' | 'completed';

export interface ShiftTask {
  id: string;
  workspace_id: string;
  title: string;
  assigned_user_id: string | null;
  work_package: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  hourly_rate_eur: number;
  completed: boolean;
  status: ShiftStatus;
  created_at: string;
  total_eur: number;
  assignee?: Profile | null;
}

export type ReportStatus = 'draft' | 'complete';

export interface ProgressReport {
  id: string;
  workspace_id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: ReportStatus;
  completion_pct: number;
  deadline: string | null;
  pdf_url: string | null;
  created_by: string;
  created_at: string;
  created_by_profile?: Profile | null;
}

export interface ProgressReportTask {
  id: string;
  report_id: string;
  shift_task_id: string;
}

export interface ReportComment {
  id: string;
  report_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_profile?: Profile | null;
}

export interface NotificationLog {
  id: string;
  report_id: string | null;
  recipient_email: string;
  recipient_user_id: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Invoice {
  id: string;
  workspace_id: string;
  shift_task_id: string;
  report_id: string | null;
  client_name: string;
  client_email: string;
  client_address: string;
  invoice_number: string;
  amount_eur: number;
  status: InvoiceStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  shift_task?: ShiftTask | null;
}

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'inactive';

export interface WorkspaceSubscription {
  id: string;
  workspace_id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  first_month_price_cents: number;
  recurring_price_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}
