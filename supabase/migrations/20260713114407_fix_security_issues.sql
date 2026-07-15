/*
# Fix security issues: restrict avatars listing and lock down SECURITY DEFINER functions

1. Avatars bucket listing restriction
   - The previous `avatars_public_read` policy allowed any client to LIST all files in the avatars bucket.
   - Public bucket URLs (https://.../storage/v1/object/public/avatars/...) bypass RLS entirely,
     so individual avatar access is not affected by removing the broad SELECT policy.
   - New policy: authenticated users can only list objects within their own user-id folder
     (needed for the profile page to clean up old avatars before uploading a new one).

2. SECURITY DEFINER function permissions
   The following functions are internal (trigger functions or helpers used only inside
   triggers/RLS) and should NEVER be callable via the PostgREST RPC endpoint:
   - `calc_report_completion` — called only by the completion trigger
   - `update_report_completion_trigger` — trigger function itself
   - `protect_admin_account` — trigger function itself
   - `is_workspace_member` — helper, not used in any RLS policy or frontend call
   - `user_workspace_role` — helper, not used in any RLS policy or frontend call
   All five: REVOKE EXECUTE FROM PUBLIC (covers anon + authenticated + all future roles).
   They remain callable internally by the database owner / trigger context.

   `get_user_id_by_email` is intentionally callable by authenticated users (used by the
   workspace invite flow). We REVOKE FROM PUBLIC and GRANT only TO authenticated so anon
   cannot call it, and no future role inherits it automatically.
*/

-- =========================================================
-- 1. FIX AVATARS BUCKET LISTING
-- =========================================================

-- Drop the broad public-read policy that allowed listing all files
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

-- Replace with a policy that only allows authenticated users to list their own folder
DROP POLICY IF EXISTS "avatars_select_own_folder" ON storage.objects;
CREATE POLICY "avatars_select_own_folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================
-- 2. REVOKE EXECUTE ON INTERNAL SECURITY DEFINER FUNCTIONS
-- =========================================================

-- These are only called by triggers / internally — never via RPC
REVOKE EXECUTE ON FUNCTION calc_report_completion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_workspace_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION user_workspace_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_report_completion_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION protect_admin_account() FROM PUBLIC;

-- get_user_id_by_email: intentional authenticated-only access for the invite flow
-- (anon was already revoked in the original migration; also revoke from PUBLIC
--  and grant explicitly to authenticated so no other role inherits it)
REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(text) TO authenticated;
