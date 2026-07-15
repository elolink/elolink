/*
# Create get_user_id_by_email function

1. New Functions
- `get_user_id_by_email(p_email text)` — SECURITY DEFINER function that looks up a user's UUID
  from auth.users by email. This allows workspace owners/admins to invite members by email
  without direct access to the auth.users table (which is not readable by anon/authenticated).

2. Security
- SECURITY DEFINER so it can read auth.users.
- Returns only the UUID, not any sensitive data.
- Callable by authenticated users only.
*/

CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(text) TO authenticated;
