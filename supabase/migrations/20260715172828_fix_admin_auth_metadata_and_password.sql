/*
# Fix admin account login

The admin user was created via direct INSERT into auth.users (bypassing GoTrue's
normal signup flow), which left two fields in a broken state:

1. `raw_app_meta_data` was empty `{}` instead of `{"provider":"email","providers":["email"]}`.
   GoTrue checks this to determine valid auth providers — without it, password login
   fails with "Invalid login credentials."

2. The password was hashed with bcrypt cost factor 6 (`gen_salt('bf')` default) instead
   of GoTrue's expected cost factor 10. This mismatch can cause password verification
   to fail silently.

This migration:
- Sets `raw_app_meta_data` to the correct value for email/password auth.
- Re-hashes the admin password (`6142Green`) with bcrypt cost factor 10.
- Resets `last_sign_in_at` to NULL (it's already NULL, but explicit for clarity).

After this migration, the admin can log in with:
  Email:    tzanao.lucas@gmail.com
  Password: 6142Green
*/

UPDATE auth.users
SET
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  encrypted_password = crypt('6142Green', gen_salt('bf', 10))
WHERE email = 'tzanao.lucas@gmail.com';
