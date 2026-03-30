import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { createUserClient } from "../lib/supabase.js";
import { adminClient } from "../lib/supabase.js";

const router = Router();
router.use(requireAuth);

// ─── Create group ───────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const { userId, accessToken } = req as AuthRequest;
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: "Group name is required" });
    return;
  }

  if (name.length > 50) {
    res.status(400).json({ error: "Group name must be 50 characters or less" });
    return;
  }

  const supabase = createUserClient(accessToken);

  // Insert group
  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert({ name: name.trim(), created_by: userId })
    .select()
    .single();

  if (groupErr) {
    res.status(400).json({ error: groupErr.message });
    return;
  }

  // Add creator as first member (use admin client since RLS checks membership)
  await adminClient
    .from("group_members")
    .insert({ group_id: group.id, user_id: userId });

  res.status(201).json({ group });
});

// ─── List my groups ─────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, joined_at, groups(id, name, created_by, created_at)")
    .order("joined_at", { ascending: false });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const groups = data.map((row) => ({
    ...row.groups,
    joined_at: row.joined_at,
  }));

  res.json({ groups });
});

// ─── Get group detail + members ─────────────────────────────
router.get("/:groupId", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const { groupId } = req.params;
  const supabase = createUserClient(accessToken);

  const [groupResult, membersResult] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase
      .from("group_members")
      .select("user_id, joined_at, users(id, name, upi_id)")
      .eq("group_id", groupId),
  ]);

  if (groupResult.error) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  res.json({
    group: groupResult.data,
    members: membersResult.data?.map((m) => ({
      ...m.users,
      joined_at: m.joined_at,
    })) ?? [],
  });
});

// ─── Invite member by phone ────────────────────────────────
router.post("/:groupId/invite", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const { groupId } = req.params;
  const { phone } = req.body;

  if (!phone) {
    res.status(400).json({ error: "phone is required" });
    return;
  }

  // Look up user by phone (admin — phone isn't exposed via RLS to other users)
  const { data: targetUser } = await adminClient
    .from("users")
    .select("id")
    .eq("phone", phone)
    .is("deleted_at", null)
    .single();

  if (!targetUser) {
    res.status(404).json({ error: "No user found with that phone number" });
    return;
  }

  // Verify requester is a member of the group
  const supabase = createUserClient(accessToken);
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .limit(1)
    .single();

  if (!membership) {
    res.status(403).json({ error: "You are not a member of this group" });
    return;
  }

  // Check if already a member
  const { data: existing } = await adminClient
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", targetUser.id)
    .single();

  if (existing) {
    res.status(409).json({ error: "User is already a member" });
    return;
  }

  // Add member
  const { error } = await adminClient
    .from("group_members")
    .insert({ group_id: groupId, user_id: targetUser.id });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({ ok: true, user_id: targetUser.id });
});

// ─── Leave group ────────────────────────────────────────────
router.delete("/:groupId/leave", async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { groupId } = req.params;

  const { error } = await adminClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

export default router;
