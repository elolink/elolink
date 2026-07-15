/*
# Create protected admin account

1. Creates an admin user in auth.users with email/password.
   - Email: tzanao.lucas@gmail.com
   - Password: 6142Green
   - Email confirmation is bypassed (email_confirmed_at set).
2. Creates a profile row for the admin user with display_name and username.
3. Creates a 'Super Admin' workspace owned by the admin.
4. Adds the admin as owner of that workspace.
5. Creates a BEFORE DELETE trigger on auth.users that prevents deletion
   of this specific user account — it raises an exception so the DELETE
   is rejected. This ensures the account can never be deleted.

Security notes:
- The trigger uses SECURITY DEFINER so it can run on auth.users.
- Only this specific user ID is protected; all other users can be deleted normally.
*/

-- Step 1: Create the admin user in auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'tzanao.lucas@gmail.com',
  crypt('6142Green', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  false
)
ON CONFLICT DO NOTHING;

-- Step 1b: Create the corresponding auth.identities row (required by GoTrue for password auth)
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
  id,
  id,
  jsonb_build_object(
    'sub', id,
    'email', 'tzanao.lucas@gmail.com',
    'email_verified', true
  ),
  'email',
  now(),
  now(),
  now()
FROM auth.users
WHERE email = 'tzanao.lucas@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = auth.users.id
  );

-- Step 2: Create the profile row
INSERT INTO profiles (id, display_name, username)
SELECT id, 'Lucas Tzanao', 'lucas_tzanao'
FROM auth.users
WHERE email = 'tzanao.lucas@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create the admin's workspace
INSERT INTO workspaces (id, name, description, owner_id)
SELECT gen_random_uuid(), 'Super Admin', 'Primary admin workspace', id
FROM auth.users
WHERE email = 'tzanao.lucas@gmail.com'
ON CONFLICT DO NOTHING;

-- Step 4: Add admin as owner member of the workspace
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, u.id, 'owner'
FROM auth.users u
CROSS JOIN workspaces w
WHERE u.email = 'tzanao.lucas@gmail.com' AND w.name = 'Super Admin'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
  );

-- Step 5: Create a BEFORE DELETE trigger on auth.users to protect the admin account
CREATE OR REPLACE FUNCTION protect_admin_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF OLD.email = 'tzanao.lucas@gmail.com' THEN
    RAISE EXCEPTION 'Cannot delete protected admin account (tzanao.lucas@gmail.com)';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin ON auth.users;
CREATE TRIGGER trg_protect_admin
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION protect_admin_account();
