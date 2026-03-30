import express from "express";
import authRouter from "./routes/auth.js";
import groupsRouter from "./routes/groups.js";
import expensesRouter from "./routes/expenses.js";
import balancesRouter from "./routes/balances.js";
import settlementsRouter from "./routes/settlements.js";

const app = express();
const PORT = process.env.PORT || 3000;

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

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(PORT, () => {
  console.log(`Chalk backend running on port ${PORT}`);
});

export default app;
