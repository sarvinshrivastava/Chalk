import { z } from "zod";

const baseSplitWith = z
  .array(z.string().uuid())
  .min(1, "At least one person required for split");

export const createExpenseSchema = z.discriminatedUnion("split_type", [
  z.object({
    group_id: z.string().uuid("Invalid group ID"),
    total_amount: z
      .number()
      .int("Amount must be an integer (paise)")
      .positive("Amount must be positive"),
    description: z.string().max(200).default(""),
    split_type: z.literal("equal"),
    split_with: baseSplitWith,
  }),
  z.object({
    group_id: z.string().uuid("Invalid group ID"),
    total_amount: z
      .number()
      .int("Amount must be an integer (paise)")
      .positive("Amount must be positive"),
    description: z.string().max(200).default(""),
    split_type: z.literal("custom_percent"),
    percentages: z.record(z.string().uuid(), z.number().min(0).max(100)).refine(
      (p) => {
        const sum = Object.values(p).reduce((a, b) => a + b, 0);
        return Math.abs(sum - 100) < 0.01;
      },
      { message: "Percentages must sum to 100" },
    ),
  }),
  z.object({
    group_id: z.string().uuid("Invalid group ID"),
    total_amount: z
      .number()
      .int("Amount must be an integer (paise)")
      .positive("Amount must be positive"),
    description: z.string().max(200).default(""),
    split_type: z.literal("custom_amount"),
    amounts: z.record(z.string().uuid(), z.number().int().nonnegative()),
  }),
]);

export const createExpenseWithAmountCheck = createExpenseSchema.refine(
  (data) => {
    if (data.split_type === "custom_amount") {
      const sum = Object.values(data.amounts).reduce((a, b) => a + b, 0);
      return sum === data.total_amount;
    }
    return true;
  },
  { message: "Custom amounts must sum to the total amount" },
);

export const expenseIdParamSchema = z.object({
  expenseId: z.string().uuid("Invalid expense ID"),
});

export const groupExpensesParamSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
});
