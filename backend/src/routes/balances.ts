import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validateParams } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import { groupIdParamSchema } from "../schemas/groups.js";
import * as balancesService from "../services/balances.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/group/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const result = await balancesService.getGroupBalances(
      req.params.groupId as string,
      accessToken,
    );
    res.json(result);
  }),
);

export default router;
