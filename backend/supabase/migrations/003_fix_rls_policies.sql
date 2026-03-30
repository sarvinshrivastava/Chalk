-- Fix recursive RLS policy on group_members
-- The old policy checks group_members to authorize reading group_members (infinite recursion → 500)

DROP POLICY IF EXISTS group_members_select ON group_members;
DROP POLICY IF EXISTS group_members_insert ON group_members;

-- Users can see group_members rows for groups they belong to.
-- Using a direct user_id check avoids recursion.
CREATE POLICY group_members_select ON group_members FOR SELECT
  USING (
    group_id IN (
      SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()
    )
  );

-- Allow inserting members if the inserter is already a member of that group,
-- OR if they are inserting themselves (for the create_group_with_member function)
CREATE POLICY group_members_insert ON group_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow members to delete their own membership (leave group)
CREATE POLICY group_members_delete ON group_members FOR DELETE
  USING (user_id = auth.uid());

-- Fix expense_splits RLS to avoid the same issue
DROP POLICY IF EXISTS expense_splits_select ON expense_splits;
DROP POLICY IF EXISTS expense_splits_insert ON expense_splits;

CREATE POLICY expense_splits_select ON expense_splits FOR SELECT
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE e.group_id IN (
        SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY expense_splits_insert ON expense_splits FOR INSERT
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE e.group_id IN (
        SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()
      )
    )
  );
