/*
# Create protected admin account (fixed version)
*/
-- Step 1: Create the admin user in auth.users
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'tzanao.lucas@gmail.com',
  crypt('6142Green', gen_salt('bf', 10)),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, false,
  '', '', '', '', '', '', '', ''
)
ON CONFLICT DO NOTHING;
-- Step 1b: identities row
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT id, id,
  jsonb_build_object('sub', id, 'email', 'tzanao.lucas@gmail.com', 'email_verified', true),
  'email', now(), now(), now()
FROM auth.users
WHERE email = 'tzanao.lucas@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = auth.users.id);
-- Step 2: profile
INSERT INTO profiles (id, display_name, username)
SELECT id, 'Lucas Tzanao', 'lucas_tzanao'
FROM auth.users WHERE email = 'tzanao.lucas@gmail.com'
ON CONFLICT (id) DO NOTHING;
-- Step 3: workspace
INSERT INTO workspaces (id, name, description, owner_id)
SELECT gen_random_uuid(), 'Super Admin', 'Primary admin workspace', id
FROM auth.users WHERE email = 'tzanao.lucas@gmail.com'
ON CONFLICT DO NOTHING;
-- Step 4: workspace member
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, u.id, 'owner'
FROM auth.users u CROSS JOIN workspaces w
WHERE u.email = 'tzanao.lucas@gmail.com' AND w.name = 'Super Admin'
  AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id);
-- Step 5: protect from deletion
CREATE OR REPLACE FUNCTION protect_admin_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public
AS $$
BEGIN
  IF OLD.email = 'tzanao.lucas@gmail.com' THEN
    RAISE EXCEPTION 'Cannot delete protected admin account';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_admin ON auth.users;
CREATE TRIGGER trg_protect_admin
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION protect_admin_account();
