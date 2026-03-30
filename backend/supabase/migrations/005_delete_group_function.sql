-- Delete a group and all associated data. Only the creator can delete.
CREATE OR REPLACE FUNCTION delete_group(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the caller is the creator
  IF NOT EXISTS (
    SELECT 1 FROM groups WHERE id = target_group_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the group creator can delete this group';
  END IF;

  -- Delete in order: splits → expenses → members → group
  DELETE FROM expense_splits WHERE expense_id IN (
    SELECT id FROM expenses WHERE group_id = target_group_id
  );
  DELETE FROM expenses WHERE group_id = target_group_id;
  DELETE FROM group_members WHERE group_id = target_group_id;
  DELETE FROM groups WHERE id = target_group_id;

  RETURN TRUE;
END;
$$;
