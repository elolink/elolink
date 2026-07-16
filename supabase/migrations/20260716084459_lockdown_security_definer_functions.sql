/*
# Lock down SECURITY DEFINER function execute permissions

## Problem
Several SECURITY DEFINER functions are callable via the PostgREST RPC endpoint
by anon and/or authenticated roles. These functions should either:
- Be internal-only (called by triggers or RLS policies, never via RPC) → REVOKE from all roles
- Be callable by authenticated users for specific frontend flows → GRANT only to authenticated,
  REVOKE from anon

## Changes

### Internal-only functions (REVOKE from all external roles)
These are called only by triggers or RLS policies, never via RPC:
- `auto_add_workspace_owner()` — trigger function, auto-inserts owner membership on workspace creation
- `is_workspace_member(uuid)` — used inside RLS policies
- `is_workspace_admin(uuid)` — used inside RLS policies
- `user_workspace_role(uuid)` — used inside RLS policies
- `calc_report_completion(uuid)` — used inside completion trigger
- `update_report_completion_trigger()` — trigger function
- `protect_admin_account()` — trigger function

### Authenticated-only functions (GRANT to authenticated, REVOKE from anon)
- `get_user_id_by_email(text)` — used by frontend invite flow, needs authenticated access
- `generate_invoice_number(uuid)` — used by frontend invoice creation, needs authenticated access
*/

-- =========================================================
-- INTERNAL-ONLY: REVOKE from anon AND authenticated
-- =========================================================
REVOKE EXECUTE ON FUNCTION auto_add_workspace_owner() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION is_workspace_member(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION is_workspace_admin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION user_workspace_role(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION calc_report_completion(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION update_report_completion_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION protect_admin_account() FROM anon, authenticated, public;

-- =========================================================
-- AUTHENTICATED-ONLY: REVOKE from anon, GRANT to authenticated
-- =========================================================
REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION generate_invoice_number(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION generate_invoice_number(uuid) TO authenticated;
