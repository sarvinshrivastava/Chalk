import { z } from "zod";
import { GROUP_NAME_MAX_LENGTH } from "@chalk/shared";

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Group name is required")
    .max(
      GROUP_NAME_MAX_LENGTH,
      `Group name must be ${GROUP_NAME_MAX_LENGTH} characters or less`,
    )
    .transform((s) => s.trim()),
});

export const inviteMemberSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number"),
});

export const groupIdParamSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
});
