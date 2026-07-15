/*
# Fix RLS recursion + add profile columns + report deadline + chat decoupling

## 1. Fix RLS Infinite Recursion (CRITICAL)

The `wm_select_member` policy on `workspace_members` queries `workspace_members` from within
its own RLS policy, causing infinite recursion. This breaks ALL workspace queries — loading
workspaces fails, which makes the app appear broken after login.

Fix: Rewrite `wm_select_member` to use `user_id = auth.uid()` directly (no self-reference).
Create `is_workspace_admin()` SECURITY DEFINER helper for owner/admin checks without recursion.

## 2. New Profile Columns
- `profiles.bio` (text, nullable) — short bio about the user
- `profiles.nationality` (text, nullable) — user's nationality

## 3. Progress Report Deadline
- `progress_reports.deadline` (date, nullable) — due date for the report

## 4. Chat Decoupling
- `direct_messages` policies already workspace-independent. No schema change needed.
*/

-- =========================================================
-- 1. CREATE is_workspace_admin helper FIRST (needed by policies below)
-- =========================================================
CREATE OR REPLACE FUNCTION is_workspace_admin(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = p_workspace_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION is_workspace_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION is_workspace_admin(uuid) FROM anon, public;

-- =========================================================
-- 2. FIX workspace_members SELECT (root cause of recursion)
-- =========================================================
DROP POLICY IF EXISTS "wm_select_member" ON workspace_members;
CREATE POLICY "wm_select_member" ON workspace_members FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- 3. FIX workspace_members INSERT
-- =========================================================
DROP POLICY IF EXISTS "wm_insert_owner_admin" ON workspace_members;
CREATE POLICY "wm_insert_owner_admin" ON workspace_members FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR workspace_members.user_id = auth.uid()
  );

-- =========================================================
-- 4. FIX workspace_members UPDATE
-- =========================================================
DROP POLICY IF EXISTS "wm_update_owner_admin" ON workspace_members;
CREATE POLICY "wm_update_owner_admin" ON workspace_members FOR UPDATE
  TO authenticated USING (
    workspace_members.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  ) WITH CHECK (
    workspace_members.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  );

-- =========================================================
-- 5. FIX workspace_members DELETE
-- =========================================================
DROP POLICY IF EXISTS "wm_delete_owner_admin" ON workspace_members;
CREATE POLICY "wm_delete_owner_admin" ON workspace_members FOR DELETE
  TO authenticated USING (
    workspace_members.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    OR is_workspace_admin(workspace_members.workspace_id)
  );

-- =========================================================
-- 6. FIX workspaces SELECT
-- =========================================================
DROP POLICY IF EXISTS "workspaces_select_member" ON workspaces;
CREATE POLICY "workspaces_select_member" ON workspaces FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspaces.id AND m.user_id = auth.uid())
  );

-- =========================================================
-- 7. ADD PROFILE COLUMNS
-- =========================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nationality text;

-- =========================================================
-- 8. ADD PROGRESS REPORT DEADLINE
-- =========================================================
ALTER TABLE progress_reports ADD COLUMN IF NOT EXISTS deadline date;
