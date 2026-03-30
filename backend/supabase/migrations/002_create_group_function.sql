-- Function to create a group and add the creator as first member atomically.
-- This bypasses the RLS chicken-and-egg problem on group_members.
CREATE OR REPLACE FUNCTION create_group_with_member(group_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_group_id UUID;
BEGIN
  INSERT INTO groups (name, created_by)
  VALUES (group_name, auth.uid())
  RETURNING id INTO new_group_id;

  INSERT INTO group_members (group_id, user_id)
  VALUES (new_group_id, auth.uid());

  RETURN new_group_id;
END;
$$;

-- Also ensure users can insert their own row (for signup)
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Auto-create a public.users row when a new auth user signs up (Google, email, etc.)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, name, auth_provider)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(
      CASE
        WHEN NEW.raw_app_meta_data->>'provider' = 'google' THEN 'google'
        WHEN NEW.raw_app_meta_data->>'provider' = 'apple' THEN 'apple'
        ELSE 'email'
      END,
      'email'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
