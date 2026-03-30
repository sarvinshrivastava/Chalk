import { Router, type Request, type Response } from "express";
import { adminClient } from "../lib/supabase.js";
import { createUserClient } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// ─── Email signup ───────────────────────────────────────────
router.post("/signup/email", async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password, and name are required" });
    return;
  }

  const { data, error } = await adminClient.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Create user row in public.users table
  if (data.user) {
    await adminClient.from("users").insert({
      id: data.user.id,
      name,
      auth_provider: "email",
    });
  }

  res.json({ user: data.user, session: data.session });
});

// ─── Email signin ───────────────────────────────────────────
router.post("/signin/email", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const { data, error } = await adminClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({ user: data.user, session: data.session });
});

// ─── OAuth (Google / Apple) ─────────────────────────────────
// The actual OAuth flow happens client-side via Supabase SDK.
// This endpoint exchanges the OAuth access token for a user record
// and ensures the public.users row exists.
router.post("/signin/oauth", async (req: Request, res: Response) => {
  const { access_token, provider, name } = req.body;

  if (!access_token || !provider) {
    res.status(400).json({ error: "access_token and provider are required" });
    return;
  }

  if (!["google", "apple"].includes(provider)) {
    res.status(400).json({ error: "provider must be google or apple" });
    return;
  }

  // Verify the token by fetching the user
  const supabase = createUserClient(access_token);
  const { data, error } = await supabase.auth.getUser(access_token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid OAuth token" });
    return;
  }

  // Upsert public.users row (idempotent for repeat logins)
  const displayName = name || data.user.user_metadata?.full_name || "User";
  await adminClient.from("users").upsert(
    {
      id: data.user.id,
      name: displayName,
      auth_provider: provider,
    },
    { onConflict: "id" }
  );

  res.json({ user: data.user });
});

// ─── Refresh session ────────────────────────────────────────
router.post("/refresh", async (req: Request, res: Response) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({ error: "refresh_token is required" });
    return;
  }

  const { data, error } = await adminClient.auth.refreshSession({
    refresh_token,
  });

  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({ session: data.session });
});

// ─── Sign out ───────────────────────────────────────────────
router.post("/signout", requireAuth, async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const supabase = createUserClient(accessToken);
  await supabase.auth.signOut();
  res.json({ ok: true });
});

// ─── Get current user profile ───────────────────────────────
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const { userId, accessToken } = req as AuthRequest;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ user: data });
});

// ─── Update profile (name, upi_id, phone) ──────────────────
router.patch("/me", requireAuth, async (req: Request, res: Response) => {
  const { userId, accessToken } = req as AuthRequest;
  const { name, upi_id, phone } = req.body;
  const supabase = createUserClient(accessToken);

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (upi_id !== undefined) updates.upi_id = upi_id;
  if (phone !== undefined) updates.phone = phone;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ user: data });
});

export default router;
