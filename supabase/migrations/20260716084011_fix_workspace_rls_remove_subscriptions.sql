/*
# Fix workspace RLS, remove subscription system, remove member limit

## Problem
The workspace system has accumulated partial fixes that introduced inconsistencies:
1. `workspace_members` SELECT policy was changed to `user_id = auth.uid()` to fix RLS recursion,
   but this means users can only see their OWN membership row. The dashboard shows 1 member.
2. `is_workspace_member()` and `user_workspace_role()` were revoked from authenticated, so RLS
   policies can't use them to avoid recursion.
3. `wm_insert_owner_admin` was overwritten so admins can't add members, and users can self-join.
4. `wm_update_owner_admin` allows self-role escalation (any member can set role='owner').
5. `workspace_subscriptions` table and `enforce_member_limit` trigger are remnants of the
   removed paywall/subscription system.

## Changes

### 1. Re-grant helper functions to authenticated
- `is_workspace_member(uuid)` — re-grant EXECUTE to authenticated so RLS policies can call it
  without causing recursion (it's SECURITY DEFINER, so it bypasses RLS on workspace_members).
- `user_workspace_role(uuid)` — re-grant EXECUTE to authenticated.
- `is_workspace_admin(uuid)` — already granted, re-assert.

### 2. Rewrite ALL workspace_members RLS policies using helper functions
- SELECT: any authenticated user who is a member of the workspace (via is_workspace_member).
- INSERT: workspace owner or existing admin (via is_workspace_admin or owner_id check).
- UPDATE: workspace owner or existing admin only (NOT self-update by regular members).
- DELETE: workspace owner or existing admin, or self-removal.

### 3. Rewrite workspaces RLS policies
- SELECT: owner or member (via is_workspace_member).
- INSERT: owner_id = auth.uid() (unchanged).
- UPDATE: owner only.
- DELETE: owner only.

### 4. Drop subscription system
- Drop `workspace_subscriptions` table (no data loss risk — it's unused).
- Drop `enforce_member_limit` trigger and function.
- Drop `max_members` column from workspaces (was only used by the limit trigger).

### 5. Rewrite all workspace-scoped table policies to use is_workspace_member
- shift_tasks, progress_reports, progress_report_tasks, report_comments, invoices,
  workspace_messages — all use is_workspace_member() / is_workspace_admin() in policies.
*/

-- =========================================================
-- 1. RE-GRANT HELPER FUNCTIONS
-- =========================================================
REVOKE EXECUTE ON FUNCTION is_workspace_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION is_workspace_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION user_workspace_role(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION user_workspace_role(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION is_workspace_admin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION is_workspace_admin(uuid) TO authenticated;

-- =========================================================
-- 2. WORKSPACE_MEMBERS RLS POLICIES (rewrite all)
-- =========================================================

-- SELECT: any member of the workspace can see all members
DROP POLICY IF EXISTS "wm_select_member" ON workspace_members;
CREATE POLICY "wm_select_member" ON workspace_members FOR SELECT
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

-- INSERT: workspace owner or existing admin can add members
DROP POLICY IF EXISTS "wm_insert_owner_admin" ON workspace_members;
CREATE POLICY "wm_insert_owner_admin" ON workspace_members FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  );

-- UPDATE: workspace owner or existing admin can update member roles
-- (NOT self-update by regular members — prevents role escalation)
DROP POLICY IF EXISTS "wm_update_owner_admin" ON workspace_members;
CREATE POLICY "wm_update_owner_admin" ON workspace_members FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  );

-- DELETE: workspace owner or admin can remove members; users can remove themselves
DROP POLICY IF EXISTS "wm_delete_owner_admin" ON workspace_members;
CREATE POLICY "wm_delete_owner_admin" ON workspace_members FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  );

-- =========================================================
-- 3. WORKSPACES RLS POLICIES (rewrite)
-- =========================================================

DROP POLICY IF EXISTS "workspaces_select_member" ON workspaces;
CREATE POLICY "workspaces_select_member" ON workspaces FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR is_workspace_member(id)
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
-- 4. DROP SUBSCRIPTION SYSTEM
-- =========================================================

-- Drop the member limit trigger
DROP TRIGGER IF EXISTS trg_enforce_member_limit ON workspace_members;
DROP FUNCTION IF EXISTS enforce_member_limit();

-- Drop the workspace_subscriptions table
DROP TABLE IF EXISTS workspace_subscriptions;

-- Drop max_members column from workspaces
ALTER TABLE workspaces DROP COLUMN IF EXISTS max_members;

-- =========================================================
-- 5. REWRITE WORKSPACE-SCORED TABLE POLICIES
-- Using is_workspace_member() / is_workspace_admin() to avoid recursion
-- =========================================================

-- --- WORKSPACE MESSAGES ---
DROP POLICY IF EXISTS "wm_msg_select_member" ON workspace_messages;
CREATE POLICY "wm_msg_select_member" ON workspace_messages FOR SELECT
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "wm_msg_insert_member" ON workspace_messages;
CREATE POLICY "wm_msg_insert_member" ON workspace_messages FOR INSERT
  TO authenticated WITH CHECK (
    is_workspace_member(workspace_id)
    AND sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "wm_msg_delete_own" ON workspace_messages;
CREATE POLICY "wm_msg_delete_own" ON workspace_messages FOR DELETE
  TO authenticated USING (sender_id = auth.uid());

-- --- SHIFT TASKS ---
DROP POLICY IF EXISTS "st_select_member" ON shift_tasks;
CREATE POLICY "st_select_member" ON shift_tasks FOR SELECT
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "st_insert_member" ON shift_tasks;
CREATE POLICY "st_insert_member" ON shift_tasks FOR INSERT
  TO authenticated WITH CHECK (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "st_update_member" ON shift_tasks;
CREATE POLICY "st_update_member" ON shift_tasks FOR UPDATE
  TO authenticated USING (
    is_workspace_member(workspace_id)
  ) WITH CHECK (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "st_delete_member" ON shift_tasks;
CREATE POLICY "st_delete_member" ON shift_tasks FOR DELETE
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

-- --- PROGRESS REPORTS ---
DROP POLICY IF EXISTS "pr_select_member" ON progress_reports;
CREATE POLICY "pr_select_member" ON progress_reports FOR SELECT
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "pr_insert_member" ON progress_reports;
CREATE POLICY "pr_insert_member" ON progress_reports FOR INSERT
  TO authenticated WITH CHECK (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "pr_update_member" ON progress_reports;
CREATE POLICY "pr_update_member" ON progress_reports FOR UPDATE
  TO authenticated USING (
    is_workspace_member(workspace_id)
  ) WITH CHECK (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "pr_delete_member" ON progress_reports;
CREATE POLICY "pr_delete_member" ON progress_reports FOR DELETE
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

-- --- PROGRESS REPORT TASKS ---
DROP POLICY IF EXISTS "prt_select_member" ON progress_report_tasks;
CREATE POLICY "prt_select_member" ON progress_report_tasks FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = progress_report_tasks.report_id
      AND is_workspace_member(r.workspace_id)
    )
  );

DROP POLICY IF EXISTS "prt_insert_member" ON progress_report_tasks;
CREATE POLICY "prt_insert_member" ON progress_report_tasks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = progress_report_tasks.report_id
      AND is_workspace_member(r.workspace_id)
    )
  );

DROP POLICY IF EXISTS "prt_delete_member" ON progress_report_tasks;
CREATE POLICY "prt_delete_member" ON progress_report_tasks FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = progress_report_tasks.report_id
      AND is_workspace_member(r.workspace_id)
    )
  );

-- --- REPORT COMMENTS ---
DROP POLICY IF EXISTS "rc_select_member" ON report_comments;
CREATE POLICY "rc_select_member" ON report_comments FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = report_comments.report_id
      AND is_workspace_member(r.workspace_id)
    )
  );

DROP POLICY IF EXISTS "rc_insert_member" ON report_comments;
CREATE POLICY "rc_insert_member" ON report_comments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = report_comments.report_id
      AND is_workspace_member(r.workspace_id)
    )
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS "rc_delete_own" ON report_comments;
CREATE POLICY "rc_delete_own" ON report_comments FOR DELETE
  TO authenticated USING (author_id = auth.uid());

-- --- INVOICES ---
DROP POLICY IF EXISTS "inv_select_member" ON invoices;
CREATE POLICY "inv_select_member" ON invoices FOR SELECT
  TO authenticated USING (
    is_workspace_member(workspace_id)
  );

DROP POLICY IF EXISTS "inv_insert_owner_admin" ON invoices;
CREATE POLICY "inv_insert_owner_admin" ON invoices FOR INSERT
  TO authenticated WITH CHECK (
    is_workspace_admin(workspace_id)
  );

DROP POLICY IF EXISTS "inv_update_owner_admin" ON invoices;
CREATE POLICY "inv_update_owner_admin" ON invoices FOR UPDATE
  TO authenticated USING (
    is_workspace_admin(workspace_id)
  ) WITH CHECK (
    is_workspace_admin(workspace_id)
  );

DROP POLICY IF EXISTS "inv_delete_owner_admin" ON invoices;
CREATE POLICY "inv_delete_owner_admin" ON invoices FOR DELETE
  TO authenticated USING (
    is_workspace_admin(workspace_id)
  );

-- --- NOTIFICATION LOG ---
DROP POLICY IF EXISTS "nl_select_member" ON notification_log;
CREATE POLICY "nl_select_member" ON notification_log FOR SELECT
  TO authenticated USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = notification_log.report_id
      AND is_workspace_member(r.workspace_id)
    )
  );

DROP POLICY IF EXISTS "nl_insert_member" ON notification_log;
CREATE POLICY "nl_insert_member" ON notification_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM progress_reports r
      WHERE r.id = notification_log.report_id
      AND is_workspace_member(r.workspace_id)
    )
  );
