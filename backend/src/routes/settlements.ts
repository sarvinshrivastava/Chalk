import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams } from "../lib/validate.js";
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
    const { to_user, amount } = req.body;
    const result = await settlementsService.createSettlement(
      userId,
      to_user,
      amount,
    );
    res.status(201).json(result);
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const settlements = await settlementsService.listSettlements(accessToken);
    res.json({ settlements });
  }),
);

router.patch(
  "/:settlementId/confirm",
  validateParams(settlementIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.confirmSettlement(
      req.params.settlementId as string,
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
      req.params.settlementId as string,
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
      req.params.settlementId as string,
      userId,
      req.body.upi_txn_id,
    );
    res.json({ settlement });
  }),
);

export default router;
