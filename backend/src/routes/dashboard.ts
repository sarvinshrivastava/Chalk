import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import { dashboardLayoutSchema } from "../schemas/dashboard.js";
import * as dashboardService from "../services/dashboard.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const layout = await dashboardService.getLayout(userId);
    res.json({ layout });
  }),
);

router.put(
  "/",
  validate(dashboardLayoutSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await dashboardService.saveLayout(userId, req.body.layout);
    res.json({ ok: true });
  }),
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await dashboardService.resetLayout(userId);
    res.json({ ok: true });
  }),
);

router.get(
  "/data",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const data = await dashboardService.getDashboardData(userId);
    res.json(data);
  }),
);

export default router;
