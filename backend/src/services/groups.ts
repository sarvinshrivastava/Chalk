import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { GROUP_MAX_MEMBERS } from "@chalk/shared";
import { requireGroupMembership } from "./helpers.js";

export async function createGroup(
  _userId: string,
  accessToken: string,
  name: string,
) {
  const supabase = createUserClient(accessToken);

  const { data: groupId, error } = await supabase.rpc(
    "create_group_with_member",
    {
      group_name: name,
    },
  );

  if (error) throw new AppError(400, error.message, "GROUP_CREATE_FAILED");

  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .single();
  return group;
}

export async function listGroups(accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, joined_at, groups(id, name, created_by, created_at)")
    .order("joined_at", { ascending: false });

  if (error) throw new AppError(400, error.message, "GROUPS_FETCH_FAILED");

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...(row.groups as Record<string, unknown>),
    joined_at: row.joined_at,
  }));
}

export async function getGroupDetail(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const [groupResult, membersResult] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase
      .from("group_members")
      .select("user_id, joined_at, users(id, name, upi_id)")
      .eq("group_id", groupId),
  ]);

  if (groupResult.error)
    throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");

  const members = (membersResult.data ?? []).map(
    (m: Record<string, unknown>) => ({
      ...(m.users as Record<string, unknown>),
      joined_at: m.joined_at,
    }),
  );

  return { group: groupResult.data, members };
}

export async function inviteMember(
  groupId: string,
  phone: string,
  accessToken: string,
) {
  const { data: targetUser } = await adminClient
    .from("users")
    .select("id")
    .eq("phone", phone)
    .is("deleted_at", null)
    .single();

  if (!targetUser)
    throw new AppError(
      404,
      "No user found with that phone number",
      "USER_NOT_FOUND",
    );

  const supabase = createUserClient(accessToken);

  const [, countResult, existingResult] = await Promise.all([
    requireGroupMembership(supabase, groupId),
    adminClient
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId),
    adminClient
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", targetUser.id)
      .maybeSingle(),
  ]);

  if (countResult.count !== null && countResult.count >= GROUP_MAX_MEMBERS) {
    throw new AppError(
      400,
      `Group cannot exceed ${GROUP_MAX_MEMBERS} members`,
      "GROUP_FULL",
    );
  }

  if (existingResult.data)
    throw new AppError(409, "User is already a member", "ALREADY_MEMBER");

  const { error } = await adminClient
    .from("group_members")
    .insert({ group_id: groupId, user_id: targetUser.id });

  if (error) throw new AppError(400, error.message, "INVITE_FAILED");

  return { user_id: targetUser.id };
}

export async function leaveGroup(groupId: string, userId: string) {
  const { error } = await adminClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw new AppError(400, error.message, "LEAVE_FAILED");
}

export async function deleteGroup(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { error } = await supabase.rpc("delete_group", {
    target_group_id: groupId,
  });
  if (error) throw new AppError(403, error.message, "DELETE_GROUP_FAILED");
}
