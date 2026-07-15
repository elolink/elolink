/*
# Add invoicing, subscription, and workspace member limit features

1. New Tables
- `invoices` — invoices generated from completed shift tasks, sent to a client.
  - id, workspace_id, shift_task_id (links to the completed shift), report_id (optional link to progress report)
  - client_name, client_email, client_address
  - invoice_number (auto-generated, unique per workspace)
  - amount_eur (copied from shift_task.total_eur at generation time)
  - status: draft | sent | paid
  - created_by, created_at, sent_at, paid_at
- `workspace_subscriptions` — tracks Stripe subscription state per workspace.
  - id, workspace_id (unique), user_id (the owner who subscribed)
  - stripe_customer_id, stripe_subscription_id
  - status: active | canceled | past_due | trialing | inactive
  - first_month_price_cents (100 = $1.00), recurring_price_cents (2000 = $20.00)
  - current_period_start, current_period_end
  - created_at, updated_at

2. Modified Tables
- `workspaces` — add `max_members` column defaulting to 10 (workspace member limit).

3. Security
- RLS enabled on both new tables.
- `invoices`: workspace members can SELECT, only owner/admin can INSERT/UPDATE/DELETE.
- `workspace_subscriptions`: only the workspace owner can SELECT/UPDATE their subscription.
- Workspace member limit: a trigger `enforce_member_limit` prevents inserting more than
  `workspaces.max_members` members into a workspace.

4. Helper Functions
- `generate_invoice_number(p_workspace_id uuid)` — generates the next invoice number
  in the format INV-0001, INV-0002, etc. per workspace.
- `enforce_member_limit()` — BEFORE INSERT trigger on workspace_members that raises
  an exception if the workspace already has max_members members.
*/

-- =========================================================
-- 1. ADD max_members COLUMN TO workspaces
-- =========================================================
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS max_members integer NOT NULL DEFAULT 10;

-- =========================================================
-- 2. CREATE invoices TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shift_task_id uuid NOT NULL REFERENCES shift_tasks(id) ON DELETE CASCADE,
  report_id uuid REFERENCES progress_reports(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  client_email text NOT NULL DEFAULT '',
  client_address text NOT NULL DEFAULT '',
  invoice_number text NOT NULL,
  amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_select_member" ON invoices;
CREATE POLICY "inv_select_member" ON invoices FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = invoices.workspace_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "inv_insert_owner_admin" ON invoices;
CREATE POLICY "inv_insert_owner_admin" ON invoices FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = invoices.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "inv_update_owner_admin" ON invoices;
CREATE POLICY "inv_update_owner_admin" ON invoices FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = invoices.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = invoices.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "inv_delete_owner_admin" ON invoices;
CREATE POLICY "inv_delete_owner_admin" ON invoices FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = invoices.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

-- =========================================================
-- 3. CREATE workspace_subscriptions TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','canceled','past_due','trialing','inactive')),
  first_month_price_cents integer NOT NULL DEFAULT 100,
  recurring_price_cents integer NOT NULL DEFAULT 2000,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws_sub_select_owner" ON workspace_subscriptions;
CREATE POLICY "ws_sub_select_owner" ON workspace_subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_subscriptions.workspace_id AND w.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "ws_sub_insert_owner" ON workspace_subscriptions;
CREATE POLICY "ws_sub_insert_owner" ON workspace_subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_subscriptions.workspace_id AND w.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "ws_sub_update_owner" ON workspace_subscriptions;
CREATE POLICY "ws_sub_update_owner" ON workspace_subscriptions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_subscriptions.workspace_id AND w.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_subscriptions.workspace_id AND w.owner_id = auth.uid())
  );

-- =========================================================
-- 4. HELPER FUNCTIONS
-- =========================================================

CREATE OR REPLACE FUNCTION generate_invoice_number(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_number text;
BEGIN
  SELECT COUNT(*) INTO v_count FROM invoices WHERE workspace_id = p_workspace_id;
  v_number := 'INV-' || lpad((v_count + 1)::text, 4, '0');
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_members integer;
  v_current_count integer;
BEGIN
  SELECT max_members INTO v_max_members FROM workspaces WHERE id = NEW.workspace_id;
  SELECT COUNT(*) INTO v_current_count FROM workspace_members WHERE workspace_id = NEW.workspace_id;
  
  IF v_current_count >= v_max_members THEN
    RAISE EXCEPTION 'Workspace has reached its maximum of % members.', v_max_members;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_member_limit ON workspace_members;
CREATE TRIGGER trg_enforce_member_limit
  BEFORE INSERT ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION enforce_member_limit();

-- =========================================================
-- 5. INDEXES & REALTIME
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_inv_workspace ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inv_shift_task ON invoices(shift_task_id);
CREATE INDEX IF NOT EXISTS idx_wss_workspace ON workspace_subscriptions(workspace_id);

ALTER PUBLICATION supabase_realtime ADD TABLE invoices;

-- =========================================================
-- 6. REVOKE/GRANT EXECUTE
-- =========================================================
REVOKE EXECUTE ON FUNCTION generate_invoice_number(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_invoice_number(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION enforce_member_limit() FROM anon, authenticated;
