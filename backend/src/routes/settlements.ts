import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams, param } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import {
  createSettlementSchema,
  txnRefSchema,
  settlementIdParamSchema,
} from "../schemas/settlements.js";
import * as settlementsService from "../services/settlements.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createSettlementSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const { to_user, amount, group_id } = req.body;
    const result = await settlementsService.createSettlement(
      userId,
      to_user,
      amount,
      group_id,
    );
    res.status(201).json(result);
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlements = await settlementsService.listSettlements(userId);
    res.json({ settlements });
  }),
);

router.patch(
  "/:settlementId/confirm",
  validateParams(settlementIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.confirmSettlement(
      param(req, "settlementId"),
      userId,
    );
    res.json({ settlement });
  }),
);

router.patch(
  "/:settlementId/reject",
  validateParams(settlementIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.rejectSettlement(
      param(req, "settlementId"),
      userId,
    );
    res.json({ settlement });
  }),
);

router.patch(
  "/:settlementId/txn-ref",
  validateParams(settlementIdParamSchema),
  validate(txnRefSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.addTxnRef(
      param(req, "settlementId"),
      userId,
      req.body.upi_txn_id,
    );
    res.json({ settlement });
  }),
);

export default router;
