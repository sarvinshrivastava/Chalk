import "dotenv/config";
import express from "express";
import cors from "cors";
import { AppError } from "./lib/errors.js";
import authRouter from "./routes/auth.js";
import groupsRouter from "./routes/groups.js";
import expensesRouter from "./routes/expenses.js";
import balancesRouter from "./routes/balances.js";
import settlementsRouter from "./routes/settlements.js";
import dashboardRouter from "./routes/dashboard.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "chalk-backend" });
});

// Routes
app.use("/auth", authRouter);
app.use("/groups", groupsRouter);
app.use("/expenses", expensesRouter);
app.use("/balances", balancesRouter);
app.use("/settlements", settlementsRouter);
app.use("/dashboard", dashboardRouter);

// Global error handler — must be last middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.message,
        ...(err.code && { code: err.code }),
      });
      return;
    }

    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`Chalk backend running on port ${PORT}`);
});

export default app;
