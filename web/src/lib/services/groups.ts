import { get, post, del } from "../api";

export interface GroupListItem {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  joined_at: string;
}

export interface GroupMemberDetail {
  id: string;
  name: string;
  upi_id: string | null;
  joined_at: string;
}

interface GroupDetailResponse {
  group: { id: string; name: string; created_by: string; created_at: string };
  members: GroupMemberDetail[];
}

export async function fetchGroups() {
  const { groups } = await get<{ groups: GroupListItem[] }>("/groups");
  return groups;
}

export async function fetchGroupDetail(groupId: string) {
  return get<GroupDetailResponse>(`/groups/${groupId}`);
}

export async function createGroup(name: string) {
  const { group } = await post<{ group: GroupListItem }>("/groups", { name });
  return group;
}

export async function deleteGroup(groupId: string) {
  return del<{ ok: true }>(`/groups/${groupId}`);
}

export async function leaveGroup(groupId: string) {
  return del<{ ok: true }>(`/groups/${groupId}/leave`);
}

export async function inviteMember(groupId: string, phone: string) {
  return post<{ ok: true; user_id: string }>(`/groups/${groupId}/invite`, {
    phone,
  });
}
