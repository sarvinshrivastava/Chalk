import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

const basePrisma = new PrismaClient({ adapter });

/**
 * Extended Prisma client that auto-converts BigInt monetary fields to Number.
 *
 * The DB stores monetary values as bigint (paise), but the rest of the app
 * and the shared package expect plain numbers. This extension avoids
 * manual Number() casts everywhere.
 */
export const prisma = basePrisma.$extends({
  result: {
    expenses: {
      total_amount: {
        needs: { total_amount: true },
        compute(expense) {
          return Number(expense.total_amount);
        },
      },
    },
    expense_splits: {
      amount_owed: {
        needs: { amount_owed: true },
        compute(split) {
          return Number(split.amount_owed);
        },
      },
    },
    settlements: {
      amount: {
        needs: { amount: true },
        compute(settlement) {
          return Number(settlement.amount);
        },
      },
    },
    personal_tally: {
      amount: {
        needs: { amount: true },
        compute(tally) {
          return Number(tally.amount);
        },
      },
    },
  },
});

export type ExtendedPrismaClient = typeof prisma;
