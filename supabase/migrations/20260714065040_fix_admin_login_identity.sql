/*
# Fix admin login: add missing auth.identities row

The admin user was created via direct INSERT into auth.users, but GoTrue (Supabase Auth)
also requires a corresponding row in auth.identities for password authentication to work.
Without it, signInWithPassword returns "Invalid login credentials" regardless of correct
password. This migration inserts the missing identity row.

Note: `email` column in auth.identities is a GENERATED column (from identity_data->>'email'),
so we don't insert it directly.
*/

INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  '0d20685b-f102-406e-8270-feb57eb86d62',
  '0d20685b-f102-406e-8270-feb57eb86d62',
  jsonb_build_object(
    'sub', '0d20685b-f102-406e-8270-feb57eb86d62',
    'email', 'tzanao.lucas@gmail.com',
    'email_verified', true
  ),
  'email',
  now(),
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities WHERE user_id = '0d20685b-f102-406e-8270-feb57eb86d62'
);
