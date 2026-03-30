-- Fix infinite recursion in RLS policies.
-- The root cause: group_members SELECT policy references group_members itself.
-- Solution: SECURITY DEFINER function bypasses RLS for the membership check.

-- 1. Helper function (bypasses RLS)
CREATE OR REPLACE FUNCTION is_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id AND user_id = check_user_id
  );
$$;

-- 2. Fix group_members policies
DROP POLICY IF EXISTS group_members_select ON group_members;
DROP POLICY IF EXISTS group_members_insert ON group_members;
DROP POLICY IF EXISTS group_members_delete ON group_members;

CREATE POLICY group_members_select ON group_members FOR SELECT
  USING (is_group_member(group_id, auth.uid()));

CREATE POLICY group_members_insert ON group_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY group_members_delete ON group_members FOR DELETE
  USING (user_id = auth.uid());

-- 3. Fix groups policies (also referenced group_members)
DROP POLICY IF EXISTS groups_select ON groups;

CREATE POLICY groups_select ON groups FOR SELECT
  USING (is_group_member(id, auth.uid()));

-- 4. Fix expenses policies
DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;

CREATE POLICY expenses_select ON expenses FOR SELECT
  USING (is_group_member(group_id, auth.uid()));

CREATE POLICY expenses_insert ON expenses FOR INSERT
  WITH CHECK (
    paid_by = auth.uid()
    AND is_group_member(group_id, auth.uid())
  );

-- 5. Fix expense_splits policies
DROP POLICY IF EXISTS expense_splits_select ON expense_splits;
DROP POLICY IF EXISTS expense_splits_insert ON expense_splits;

CREATE POLICY expense_splits_select ON expense_splits FOR SELECT
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE is_group_member(e.group_id, auth.uid())
    )
  );

CREATE POLICY expense_splits_insert ON expense_splits FOR INSERT
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE is_group_member(e.group_id, auth.uid())
    )
  );
