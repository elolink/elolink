/*
# Fix security issues: explicitly revoke execute from anon and authenticated roles

The previous migration revoked EXECUTE FROM PUBLIC, but Supabase's default grants
give anon and authenticated explicit EXECUTE privileges on all public functions.
PUBLIC revocation alone is not sufficient — must revoke from each role directly.

Functions locked down (internal only — called by triggers, never via RPC):
- calc_report_completion
- is_workspace_member
- user_workspace_role
- update_report_completion_trigger
- protect_admin_account

Function kept accessible to authenticated only (used by invite flow):
- get_user_id_by_email (already correct, but re-asserting)
*/

-- Revoke from both anon and authenticated explicitly
REVOKE EXECUTE ON FUNCTION calc_report_completion(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION is_workspace_member(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION user_workspace_role(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_report_completion_trigger() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION protect_admin_account() FROM anon, authenticated;

-- get_user_id_by_email: authenticated only (re-assert)
REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(text) TO authenticated;
