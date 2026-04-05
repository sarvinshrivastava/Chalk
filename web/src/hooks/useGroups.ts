import { useEffect, useState, useCallback } from "react";
import { getErrorMessage } from "../lib/format";
import {
  fetchGroups,
  createGroup as createGroupApi,
  deleteGroup as deleteGroupApi,
  type GroupListItem,
} from "../lib/services";

export function useGroups() {
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchGroups();
      setGroups(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createGroup = async (name: string) => {
    const group = await createGroupApi(name);
    await refetch();
    return group;
  };

  const deleteGroup = async (groupId: string) => {
    await deleteGroupApi(groupId);
    await refetch();
  };

  return { groups, loading, error, createGroup, deleteGroup, refetch };
}
