import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { createUserClient } from "../lib/supabase.js";
import { adminClient } from "../lib/supabase.js";
import { buildUpiDeepLink, buildAppSpecificUpiLinks } from "@chalk/shared";

const router = Router();
router.use(requireAuth);

// ─── Create settlement (initiate payment) ───────────────────
router.post("/", async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { to_user, amount } = req.body;

  if (!to_user || !amount) {
    res.status(400).json({ error: "to_user and amount are required" });
    return;
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive integer (paise)" });
    return;
  }

  // Fetch payee UPI info
  const { data: payee } = await adminClient
    .from("users")
    .select("id, name, upi_id")
    .eq("id", to_user)
    .single();

  if (!payee) {
    res.status(404).json({ error: "Payee not found" });
    return;
  }

  // Create settlement record
  const { data: settlement, error } = await adminClient
    .from("settlements")
    .insert({
      from_user: userId,
      to_user,
      amount,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Build UPI deep links if payee has a VPA
  let upiLinks = null;
  if (payee.upi_id) {
    try {
      upiLinks = buildAppSpecificUpiLinks({
        payeeVpa: payee.upi_id,
        payeeName: payee.name,
        amount,
        note: `Chalk settlement`,
      });
    } catch {
      // Invalid VPA — return settlement without links
    }
  }

  res.status(201).json({ settlement, upi_links: upiLinks });
});

// ─── Confirm settlement (payee confirms receipt) ────────────
router.patch("/:settlementId/confirm", async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { settlementId } = req.params;

  // Only the payee (to_user) can confirm
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("*")
    .eq("id", settlementId)
    .single();

  if (!settlement) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }

  if (settlement.to_user !== userId) {
    res.status(403).json({ error: "Only the payee can confirm a settlement" });
    return;
  }

  if (settlement.status === "confirmed") {
    res.status(409).json({ error: "Settlement already confirmed" });
    return;
  }

  const { data, error } = await adminClient
    .from("settlements")
    .update({
      status: "confirmed",
      paid_at: new Date().toISOString(),
    })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ settlement: data });
});

// ─── Add UPI transaction reference ──────────────────────────
router.patch("/:settlementId/txn-ref", async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { settlementId } = req.params;
  const { upi_txn_id } = req.body;

  if (!upi_txn_id) {
    res.status(400).json({ error: "upi_txn_id is required" });
    return;
  }

  const { data: settlement } = await adminClient
    .from("settlements")
    .select("from_user")
    .eq("id", settlementId)
    .single();

  if (!settlement || settlement.from_user !== userId) {
    res.status(403).json({ error: "Only the payer can add a transaction reference" });
    return;
  }

  const { data, error } = await adminClient
    .from("settlements")
    .update({ upi_txn_id })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ settlement: data });
});

// ─── List my settlements ────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ settlements: data });
});

export default router;
