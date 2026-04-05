import { prisma } from "../lib/prisma.js";
import { AppError, withPrismaErrors } from "../lib/errors.js";
import { GROUP_MAX_MEMBERS } from "@chalk/shared";
import { requireGroupMembership } from "./helpers.js";
import { invalidateDashboardCache } from "./dashboard.js";

export async function createGroup(userId: string, name: string) {
  const group = await withPrismaErrors(() =>
    prisma.$transaction(async (tx) => {
      const newGroup = await tx.groups.create({
        data: { name, created_by: userId },
      });

      await tx.group_members.create({
        data: { group_id: newGroup.id, user_id: userId },
      });

      return newGroup;
    }),
  );

  invalidateDashboardCache(userId);
  return group;
}

export async function listGroups(userId: string) {
  const memberships = await prisma.group_members.findMany({
    where: { user_id: userId },
    orderBy: { joined_at: "desc" },
    include: {
      groups: {
        select: {
          id: true,
          name: true,
          created_by: true,
          created_at: true,
        },
      },
    },
  });

  return memberships.map((row) => ({
    ...row.groups,
    joined_at: row.joined_at,
  }));
}

export async function getGroupDetail(groupId: string, userId: string) {
  const group = await prisma.groups.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");

  const memberships = await prisma.group_members.findMany({
    where: { group_id: groupId },
    select: {
      joined_at: true,
      users: { select: { id: true, name: true, upi_id: true } },
    },
  });

  if (!memberships.some((m) => m.users.id === userId)) {
    throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");
  }

  const members = memberships.map((m) => ({
    ...m.users,
    joined_at: m.joined_at,
  }));

  return { group, members };
}

export async function inviteMember(
  groupId: string,
  phone: string,
  userId: string,
) {
  await requireGroupMembership(groupId, userId);

  const targetUser = await prisma.users.findFirst({
    where: { phone, deleted_at: null },
    select: { id: true },
  });

  if (!targetUser) {
    throw new AppError(
      404,
      "No user found with that phone number",
      "USER_NOT_FOUND",
    );
  }

  const [memberCount, existingMember] = await Promise.all([
    prisma.group_members.count({ where: { group_id: groupId } }),
    prisma.group_members.findUnique({
      where: {
        group_id_user_id: { group_id: groupId, user_id: targetUser.id },
      },
      select: { user_id: true },
    }),
  ]);

  if (memberCount >= GROUP_MAX_MEMBERS) {
    throw new AppError(
      400,
      `Group cannot exceed ${GROUP_MAX_MEMBERS} members`,
      "GROUP_FULL",
    );
  }

  if (existingMember) {
    throw new AppError(409, "User is already a member", "ALREADY_MEMBER");
  }

  await withPrismaErrors(() =>
    prisma.group_members.create({
      data: { group_id: groupId, user_id: targetUser.id },
    }),
  );

  return { user_id: targetUser.id };
}

export async function leaveGroup(groupId: string, userId: string) {
  await withPrismaErrors(() =>
    prisma.group_members.delete({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    }),
  );

  invalidateDashboardCache(userId);
}

export async function deleteGroup(groupId: string, userId: string) {
  const group = await prisma.groups.findUnique({
    where: { id: groupId },
    select: { created_by: true },
  });

  if (!group) {
    throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");
  }

  if (group.created_by !== userId) {
    throw new AppError(
      403,
      "Only the group creator can delete the group",
      "DELETE_GROUP_FAILED",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.expense_splits.deleteMany({
      where: { expenses: { group_id: groupId } },
    });
    await tx.expenses.deleteMany({ where: { group_id: groupId } });
    await tx.group_members.deleteMany({ where: { group_id: groupId } });
    await tx.groups.delete({ where: { id: groupId } });
  });

  invalidateDashboardCache(userId);
}
