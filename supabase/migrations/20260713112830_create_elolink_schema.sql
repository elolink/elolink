/*
# EloLink Core Schema

1. Overview
EloLink is a workspace-based progress reporting and shift/task tracking tool for freelance and contract work.
This migration creates the full data model: user profiles, workspaces, memberships, workspace chat messages,
shift tasks, progress reports, report comments, and notification log. All tables use RLS scoped to workspace
membership, with role-based access (owner / admin / member).

2. New Tables
- `profiles` — extends auth.users with display_name, username, avatar_url. id = auth.users.id.
- `workspaces` — a workspace (name, owner_id, created_at).
- `workspace_members` — membership join table (workspace_id, user_id, role: owner|admin|member, joined_at).
- `workspace_messages` — realtime chat messages per workspace (workspace_id, sender_id, content, created_at).
- `direct_messages` — one-to-one messages (sender_id, recipient_id, content, created_at).
- `shift_tasks` — a shift/task row (workspace_id, title, assigned_user_id, work_package, clock_in_at, clock_out_at,
  hourly_rate_eur, completed, status, created_at). total_eur is computed via generated column (hours * rate).
- `progress_reports` — a report (workspace_id, title, start_date, end_date, status, pdf_url, created_at, created_by).
  completion_pct is auto-calculated via a trigger from linked shift_tasks.
- `progress_report_tasks` — join table linking a progress_report to shift_tasks (report_id, shift_task_id).
- `report_comments` — comment thread on a report (report_id, author_id, content, created_at).
- `notification_log` — log of email notifications sent (report_id, recipient_email, sent_at).

3. Security
- RLS enabled on every table.
- Profiles: users can read all profiles (needed for chat/assignments) but only update their own.
- All workspace-scoped tables: access gated by workspace membership via the workspace_members join.
- Owner/admin can manage members and delete workspaces; members can read and create tasks/reports/messages.

4. Helper Functions
- `is_workspace_member(p_workspace_id uuid)` returns true if current user is a member of the workspace.
- `user_workspace_role(p_workspace_id uuid)` returns the role of the current user in the workspace.
- `calc_report_completion(p_report_id uuid)` returns completion percentage for a report based on linked tasks.
- Trigger auto-updates progress_reports.completion_pct when linked tasks change.
*/

-- =========================================================
-- CREATE ALL TABLES FIRST (no policies yet, to avoid cross-table reference issues)
-- =========================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  username text UNIQUE,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  work_package text NOT NULL DEFAULT 'General',
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  hourly_rate_eur numeric(10,2) NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  total_eur numeric(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN clock_in_at IS NOT NULL AND clock_out_at IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM (clock_out_at - clock_in_at)) / 3600 * hourly_rate_eur, 2)
      ELSE 0
    END
  ) STORED
);

CREATE TABLE IF NOT EXISTS progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Progress Report',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','complete')),
  completion_pct numeric(5,2) NOT NULL DEFAULT 0,
  pdf_url text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress_report_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES progress_reports(id) ON DELETE CASCADE,
  shift_task_id uuid NOT NULL REFERENCES shift_tasks(id) ON DELETE CASCADE,
  UNIQUE (report_id, shift_task_id)
);

CREATE TABLE IF NOT EXISTS report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES progress_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES progress_reports(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text,
  body text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- ENABLE RLS ON ALL TABLES
-- =========================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PROFILES POLICIES
-- =========================================================
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- =========================================================
-- WORKSPACES POLICIES
-- =========================================================
DROP POLICY IF EXISTS "workspaces_select_member" ON workspaces;
CREATE POLICY "workspaces_select_member" ON workspaces FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspaces.id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "workspaces_insert_own" ON workspaces;
CREATE POLICY "workspaces_insert_own" ON workspaces FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "workspaces_update_owner" ON workspaces;
CREATE POLICY "workspaces_update_owner" ON workspaces FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "workspaces_delete_owner" ON workspaces;
CREATE POLICY "workspaces_delete_owner" ON workspaces FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- =========================================================
-- WORKSPACE MEMBERS POLICIES
-- =========================================================
DROP POLICY IF EXISTS "wm_select_member" ON workspace_members;
CREATE POLICY "wm_select_member" ON workspace_members FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wm_insert_owner_admin" ON workspace_members;
CREATE POLICY "wm_insert_owner_admin" ON workspace_members FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "wm_update_owner_admin" ON workspace_members;
CREATE POLICY "wm_update_owner_admin" ON workspace_members FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "wm_delete_owner_admin" ON workspace_members;
CREATE POLICY "wm_delete_owner_admin" ON workspace_members FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

-- =========================================================
-- WORKSPACE MESSAGES POLICIES
-- =========================================================
DROP POLICY IF EXISTS "wm_msg_select_member" ON workspace_messages;
CREATE POLICY "wm_msg_select_member" ON workspace_messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_messages.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wm_msg_insert_member" ON workspace_messages;
CREATE POLICY "wm_msg_insert_member" ON workspace_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_messages.workspace_id AND m.user_id = auth.uid())
    AND sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "wm_msg_delete_own" ON workspace_messages;
CREATE POLICY "wm_msg_delete_own" ON workspace_messages FOR DELETE
  TO authenticated USING (sender_id = auth.uid());

-- =========================================================
-- DIRECT MESSAGES POLICIES
-- =========================================================
DROP POLICY IF EXISTS "dm_select_participant" ON direct_messages;
CREATE POLICY "dm_select_participant" ON direct_messages FOR SELECT
  TO authenticated USING (sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "dm_insert_sender" ON direct_messages;
CREATE POLICY "dm_insert_sender" ON direct_messages FOR INSERT
  TO authenticated WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "dm_delete_own" ON direct_messages;
CREATE POLICY "dm_delete_own" ON direct_messages FOR DELETE
  TO authenticated USING (sender_id = auth.uid());

-- =========================================================
-- SHIFT TASKS POLICIES
-- =========================================================
DROP POLICY IF EXISTS "st_select_member" ON shift_tasks;
CREATE POLICY "st_select_member" ON shift_tasks FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = shift_tasks.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "st_insert_member" ON shift_tasks;
CREATE POLICY "st_insert_member" ON shift_tasks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = shift_tasks.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "st_update_member" ON shift_tasks;
CREATE POLICY "st_update_member" ON shift_tasks FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = shift_tasks.workspace_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = shift_tasks.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "st_delete_member" ON shift_tasks;
CREATE POLICY "st_delete_member" ON shift_tasks FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = shift_tasks.workspace_id AND m.user_id = auth.uid())
  );

-- =========================================================
-- PROGRESS REPORTS POLICIES
-- =========================================================
DROP POLICY IF EXISTS "pr_select_member" ON progress_reports;
CREATE POLICY "pr_select_member" ON progress_reports FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = progress_reports.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pr_insert_member" ON progress_reports;
CREATE POLICY "pr_insert_member" ON progress_reports FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = progress_reports.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pr_update_member" ON progress_reports;
CREATE POLICY "pr_update_member" ON progress_reports FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = progress_reports.workspace_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = progress_reports.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pr_delete_member" ON progress_reports;
CREATE POLICY "pr_delete_member" ON progress_reports FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = progress_reports.workspace_id AND m.user_id = auth.uid())
  );

-- =========================================================
-- PROGRESS REPORT TASKS POLICIES
-- =========================================================
DROP POLICY IF EXISTS "prt_select_member" ON progress_report_tasks;
CREATE POLICY "prt_select_member" ON progress_report_tasks FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = progress_report_tasks.report_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "prt_insert_member" ON progress_report_tasks;
CREATE POLICY "prt_insert_member" ON progress_report_tasks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = progress_report_tasks.report_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "prt_delete_member" ON progress_report_tasks;
CREATE POLICY "prt_delete_member" ON progress_report_tasks FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = progress_report_tasks.report_id AND m.user_id = auth.uid()
    )
  );

-- =========================================================
-- REPORT COMMENTS POLICIES
-- =========================================================
DROP POLICY IF EXISTS "rc_select_member" ON report_comments;
CREATE POLICY "rc_select_member" ON report_comments FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = report_comments.report_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "rc_insert_member" ON report_comments;
CREATE POLICY "rc_insert_member" ON report_comments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = report_comments.report_id AND m.user_id = auth.uid()
    )
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS "rc_delete_own" ON report_comments;
CREATE POLICY "rc_delete_own" ON report_comments FOR DELETE
  TO authenticated USING (author_id = auth.uid());

-- =========================================================
-- NOTIFICATION LOG POLICIES
-- =========================================================
DROP POLICY IF EXISTS "nl_select_member" ON notification_log;
CREATE POLICY "nl_select_member" ON notification_log FOR SELECT
  TO authenticated USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = notification_log.report_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "nl_insert_member" ON notification_log;
CREATE POLICY "nl_insert_member" ON notification_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_reports r
      JOIN workspace_members m ON m.workspace_id = r.workspace_id
      WHERE r.id = notification_log.report_id AND m.user_id = auth.uid()
    )
  );

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = p_workspace_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION user_workspace_role(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role FROM workspace_members m
  WHERE m.workspace_id = p_workspace_id AND m.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION calc_report_completion(p_report_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(COUNT(*) FILTER (WHERE t.completed) * 100.0 / COUNT(*), 2)
    END
  FROM progress_report_tasks prt
  JOIN shift_tasks t ON t.id = prt.shift_task_id
  WHERE prt.report_id = p_report_id;
$$;

-- =========================================================
-- TRIGGER: auto-update completion_pct on report
-- =========================================================
CREATE OR REPLACE FUNCTION update_report_completion_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'progress_report_tasks' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE progress_reports SET completion_pct = calc_report_completion(OLD.report_id)
      WHERE id = OLD.report_id;
    ELSE
      UPDATE progress_reports SET completion_pct = calc_report_completion(NEW.report_id)
      WHERE id = NEW.report_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'shift_tasks' THEN
    UPDATE progress_reports SET completion_pct = calc_report_completion(prt.report_id)
    FROM progress_report_tasks prt
    WHERE prt.report_id = progress_reports.id AND prt.shift_task_id = NEW.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prt_completion ON progress_report_tasks;
CREATE TRIGGER trg_prt_completion
  AFTER INSERT OR DELETE ON progress_report_tasks
  FOR EACH ROW EXECUTE FUNCTION update_report_completion_trigger();

DROP TRIGGER IF EXISTS trg_st_completion ON shift_tasks;
CREATE TRIGGER trg_st_completion
  AFTER UPDATE OF completed ON shift_tasks
  FOR EACH ROW WHEN (OLD.completed IS DISTINCT FROM NEW.completed)
  EXECUTE FUNCTION update_report_completion_trigger();

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wm_workspace_id ON workspace_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_st_workspace ON shift_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_st_assigned ON shift_tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_pr_workspace ON progress_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_prt_report ON progress_report_tasks(report_id);
CREATE INDEX IF NOT EXISTS idx_rc_report ON report_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id);

-- =========================================================
-- REALTIME PUBLICATION
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE progress_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE report_comments;
