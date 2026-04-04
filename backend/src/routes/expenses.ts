import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams, param } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import {
  createExpenseWithAmountCheck,
  expenseIdParamSchema,
  groupExpensesParamSchema,
} from "../schemas/expenses.js";
import * as expensesService from "../services/expenses.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createExpenseWithAmountCheck),
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    const result = await expensesService.createExpense(
      userId,
      accessToken,
      req.body,
    );
    res.status(201).json(result);
  }),
);

router.get(
  "/group/:groupId",
  validateParams(groupExpensesParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const expenses = await expensesService.listGroupExpenses(
      param(req, "groupId"),
      accessToken,
    );
    res.json({ expenses });
  }),
);

router.get(
  "/:expenseId",
  validateParams(expenseIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const expense = await expensesService.getExpense(
      param(req, "expenseId"),
      accessToken,
    );
    res.json({ expense });
  }),
);

router.delete(
  "/:expenseId",
  validateParams(expenseIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    await expensesService.deleteExpense(
      param(req, "expenseId"),
      userId,
      accessToken,
    );
    res.json({ ok: true });
  }),
);

export default router;
