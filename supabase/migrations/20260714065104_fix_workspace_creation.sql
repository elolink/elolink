/*
# Fix workspace creation persistence

Bug: When creating a workspace, the owner inserts the workspace row, then tries to insert
a workspace_members row for themselves with role='owner'. The RLS policy `wm_insert_owner_admin`
requires the caller to ALREADY be a member (owner/admin) of that workspace — but they just
created it and aren't a member yet. The member insert silently fails (RLS blocks it, no error),
so the workspace has no members and never appears in queries (which filter by membership).

Fix: Update the `wm_insert_owner_admin` policy to ALSO allow the workspace owner to insert
their own membership row. This breaks the chicken-and-egg problem: the workspace owner can
add themselves as owner, and existing owners/admins can add other members.

Additionally, add a trigger that auto-creates the owner membership row when a workspace is
inserted, so the client doesn't even need to do a second insert. This is more robust.
*/

-- Fix the insert policy: allow workspace owner to insert members (including themselves)
DROP POLICY IF EXISTS "wm_insert_owner_admin" ON workspace_members;
CREATE POLICY "wm_insert_owner_admin" ON workspace_members FOR INSERT
  TO authenticated WITH CHECK (
    -- Workspace owner can add members to their workspace
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid())
    -- OR an existing owner/admin can add members
    OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

-- Create a trigger that auto-inserts owner membership when a workspace is created
CREATE OR REPLACE FUNCTION auto_add_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_workspace_owner ON workspaces;
CREATE TRIGGER trg_auto_workspace_owner
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION auto_add_workspace_owner();

-- Backfill any orphaned workspaces that don't have an owner membership row
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
)
ON CONFLICT (workspace_id, user_id) DO NOTHING;
