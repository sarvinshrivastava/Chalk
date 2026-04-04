# Chalk Backend Hardening — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Chalk backend scaffold into a production-ready Express API with Zod validation, service layer, proper error handling, and all Phase 1 features working correctly.

**Architecture:** Routes validate input with Zod schemas, then delegate to service functions. Services contain all business logic and Supabase calls. A global async error wrapper and custom `AppError` class handle all error responses consistently. The `@chalk/shared` package provides types, balance calculation, UPI link building, and constants.

**Tech Stack:** Express 5, TypeScript, Supabase (PostgreSQL + Auth + RLS), Zod, `@chalk/shared` workspace package.

---

## File Map

### New Files to Create
| File | Responsibility |
|------|---------------|
| `backend/src/lib/errors.ts` | `AppError` class, error codes enum, async route wrapper |
| `backend/src/lib/validate.ts` | Zod validation middleware factory |
| `backend/src/schemas/auth.ts` | Zod schemas for all auth endpoints |
| `backend/src/schemas/groups.ts` | Zod schemas for all group endpoints |
| `backend/src/schemas/expenses.ts` | Zod schemas for all expense endpoints |
| `backend/src/schemas/settlements.ts` | Zod schemas for all settlement endpoints |
| `backend/src/services/auth.ts` | Auth business logic (signup, signin, OAuth, profile) |
| `backend/src/services/groups.ts` | Group business logic (CRUD, invite, leave, delete) |
| `backend/src/services/expenses.ts` | Expense business logic (create, list, get, delete) + split calculators |
| `backend/src/services/balances.ts` | Balance fetching + debt simplification |
| `backend/src/services/settlements.ts` | Settlement business logic (create, confirm, reject, list) |

### Existing Files to Modify
| File | Changes |
|------|---------|
| `backend/src/index.ts` | Import updated error handler, add CORS, env validation on startup |
| `backend/src/middleware/auth.ts` | Add try/catch, better error messages |
| `backend/src/lib/supabase.ts` | Add env validation, no `!` assertions |
| `backend/src/routes/auth.ts` | Gut handlers → Zod + service calls |
| `backend/src/routes/groups.ts` | Gut handlers → Zod + service calls, add DELETE route |
| `backend/src/routes/expenses.ts` | Gut handlers → Zod + service calls, fix split validation |
| `backend/src/routes/balances.ts` | Gut handler → service call, fix settlement query bug |
| `backend/src/routes/settlements.ts` | Gut handlers → Zod + service calls, add reject endpoint |
| `backend/package.json` | Add `cors` dependency |

---

## Task 1: Error Handling Infrastructure

**Files:**
- Create: `backend/src/lib/errors.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create `AppError` class and async wrapper**

```ts
// backend/src/lib/errors.ts

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Wraps an async Express handler so thrown errors reach the global error handler.
 * Express 5 handles async errors natively, but this gives us consistent typing.
 */
export function asyncHandler(
  fn: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>
) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
```

- [ ] **Step 2: Update global error handler in `index.ts`**

Replace the existing error handler in `backend/src/index.ts`:

```ts
// Replace the existing global error handler block with:
import { AppError } from "./lib/errors.js";

// ... (keep existing route mounts) ...

// Global error handler — must be last middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
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
  }
);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/errors.ts backend/src/index.ts
git commit -m "feat(backend): add AppError class and async route wrapper"
```

---

## Task 2: Zod Validation Middleware + Schemas

**Files:**
- Create: `backend/src/lib/validate.ts`
- Create: `backend/src/schemas/auth.ts`
- Create: `backend/src/schemas/groups.ts`
- Create: `backend/src/schemas/expenses.ts`
- Create: `backend/src/schemas/settlements.ts`

- [ ] **Step 1: Create validation middleware factory**

```ts
// backend/src/lib/validate.ts
import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Returns middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (coerced/stripped) data.
 * On failure, responds 422 with structured field errors.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      res.status(422).json({ error: "Validation failed", fields: fieldErrors });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates req.params against a Zod schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({ error: "Invalid URL parameters" });
      return;
    }
    next();
  };
}
```

- [ ] **Step 2: Create auth schemas**

```ts
// backend/src/schemas/auth.ts
import { z } from "zod";

export const emailSignupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

export const emailSigninSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const oauthSigninSchema = z.object({
  access_token: z.string().min(1, "access_token is required"),
  provider: z.enum(["google", "apple"]),
  name: z.string().optional(),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, "refresh_token is required"),
});

export const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    upi_id: z.string().regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/, "Invalid UPI VPA format").optional().nullable(),
    phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number").optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
```

- [ ] **Step 3: Create groups schemas**

```ts
// backend/src/schemas/groups.ts
import { z } from "zod";
import { GROUP_NAME_MAX_LENGTH } from "@chalk/shared";

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Group name is required")
    .max(GROUP_NAME_MAX_LENGTH, `Group name must be ${GROUP_NAME_MAX_LENGTH} characters or less`)
    .transform((s) => s.trim()),
});

export const inviteMemberSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number"),
});

export const groupIdParamSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
});
```

- [ ] **Step 4: Create expenses schemas**

```ts
// backend/src/schemas/expenses.ts
import { z } from "zod";

const baseSplitWith = z.array(z.string().uuid()).min(1, "At least one person required for split");

export const createExpenseSchema = z.discriminatedUnion("split_type", [
  z.object({
    group_id: z.string().uuid("Invalid group ID"),
    total_amount: z.number().int("Amount must be an integer (paise)").positive("Amount must be positive"),
    description: z.string().max(200).default(""),
    split_type: z.literal("equal"),
    split_with: baseSplitWith,
  }),
  z.object({
    group_id: z.string().uuid("Invalid group ID"),
    total_amount: z.number().int("Amount must be an integer (paise)").positive("Amount must be positive"),
    description: z.string().max(200).default(""),
    split_type: z.literal("custom_percent"),
    percentages: z
      .record(z.string().uuid(), z.number().min(0).max(100))
      .refine(
        (p) => {
          const sum = Object.values(p).reduce((a, b) => a + b, 0);
          return Math.abs(sum - 100) < 0.01;
        },
        { message: "Percentages must sum to 100" }
      ),
  }),
  z.object({
    group_id: z.string().uuid("Invalid group ID"),
    total_amount: z.number().int("Amount must be an integer (paise)").positive("Amount must be positive"),
    description: z.string().max(200).default(""),
    split_type: z.literal("custom_amount"),
    amounts: z.record(z.string().uuid(), z.number().int().nonnegative()),
  }),
]);

// Additional refinement: custom_amount totals must match
export const createExpenseWithAmountCheck = createExpenseSchema.refine(
  (data) => {
    if (data.split_type === "custom_amount") {
      const sum = Object.values(data.amounts).reduce((a, b) => a + b, 0);
      return sum === data.total_amount;
    }
    return true;
  },
  { message: "Custom amounts must sum to the total amount" }
);

export const expenseIdParamSchema = z.object({
  expenseId: z.string().uuid("Invalid expense ID"),
});

export const groupExpensesParamSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
});
```

- [ ] **Step 5: Create settlements schemas**

```ts
// backend/src/schemas/settlements.ts
import { z } from "zod";

export const createSettlementSchema = z.object({
  to_user: z.string().uuid("Invalid user ID"),
  amount: z.number().int("Amount must be an integer (paise)").positive("Amount must be positive"),
});

export const txnRefSchema = z.object({
  upi_txn_id: z.string().min(1, "Transaction reference is required").max(100),
});

export const settlementIdParamSchema = z.object({
  settlementId: z.string().uuid("Invalid settlement ID"),
});
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/validate.ts backend/src/schemas/
git commit -m "feat(backend): add Zod validation schemas for all endpoints"
```

---

## Task 3: Supabase Client Hardening

**Files:**
- Modify: `backend/src/lib/supabase.ts`

- [ ] **Step 1: Add env validation, remove `!` assertions**

```ts
// backend/src/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/** Client scoped to the requesting user's JWT — use for RLS-protected queries */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Admin client — bypasses RLS. Use only in backend services (cron, webhooks). */
export const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/supabase.ts
git commit -m "fix(backend): add env validation to supabase client, remove unsafe assertions"
```

---

## Task 4: Auth Middleware Hardening

**Files:**
- Modify: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Add try/catch and descriptive error messages**

```ts
// backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { createUserClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";

export interface AuthRequest extends Request {
  userId: string;
  accessToken: string;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or invalid Authorization header", "AUTH_MISSING"));
  }

  const token = header.slice(7);

  try {
    const supabase = createUserClient(token);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return next(new AppError(401, "Invalid or expired token", "AUTH_INVALID"));
    }

    (req as AuthRequest).userId = data.user.id;
    (req as AuthRequest).accessToken = token;
    next();
  } catch {
    next(new AppError(401, "Authentication failed", "AUTH_FAILED"));
  }
}
```

Note: Removed `getUser(token)` — when the client is already initialized with the token, calling `getUser()` without args uses the session token. This fixes the redundant token verification.

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/auth.ts
git commit -m "fix(backend): harden auth middleware with AppError and remove redundant token pass"
```

---

## Task 5: Auth Service + Routes Rewrite

**Files:**
- Create: `backend/src/services/auth.ts`
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Create auth service**

```ts
// backend/src/services/auth.ts
import { adminClient, createUserClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";

export async function signUpWithEmail(email: string, password: string, name: string) {
  const { data, error } = await adminClient.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) throw new AppError(400, error.message, "SIGNUP_FAILED");
  if (!data.user) throw new AppError(500, "User creation failed", "SIGNUP_NO_USER");

  // Upsert public.users row (trigger may have created it already)
  await adminClient.from("users").upsert(
    { id: data.user.id, name, auth_provider: "email" },
    { onConflict: "id" }
  );

  return { user: data.user, session: data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await adminClient.auth.signInWithPassword({ email, password });
  if (error) throw new AppError(401, error.message, "SIGNIN_FAILED");
  return { user: data.user, session: data.session };
}

export async function signInWithOAuth(accessToken: string, provider: "google" | "apple", name?: string) {
  const supabase = createUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new AppError(401, "Invalid OAuth token", "OAUTH_INVALID");
  }

  const displayName = name || data.user.user_metadata?.full_name || "User";
  await adminClient.from("users").upsert(
    { id: data.user.id, name: displayName, auth_provider: provider },
    { onConflict: "id" }
  );

  return { user: data.user };
}

export async function refreshSession(refreshToken: string) {
  const { data, error } = await adminClient.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw new AppError(401, error.message, "REFRESH_FAILED");
  return { session: data.session };
}

export async function signOut(accessToken: string) {
  const supabase = createUserClient(accessToken);
  await supabase.auth.signOut();
}

export async function getProfile(userId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
  if (error || !data) throw new AppError(404, "User not found", "USER_NOT_FOUND");
  return data;
}

export async function updateProfile(
  userId: string,
  accessToken: string,
  updates: { name?: string; upi_id?: string | null; phone?: string | null }
) {
  const supabase = createUserClient(accessToken);
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "PROFILE_UPDATE_FAILED");
  return data;
}
```

- [ ] **Step 2: Rewrite auth routes**

```ts
// backend/src/routes/auth.ts
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import {
  emailSignupSchema,
  emailSigninSchema,
  oauthSigninSchema,
  refreshSchema,
  updateProfileSchema,
} from "../schemas/auth.js";
import * as authService from "../services/auth.js";

const router = Router();

router.post(
  "/signup/email",
  validate(emailSignupSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const result = await authService.signUpWithEmail(email, password, name);
    res.status(201).json(result);
  })
);

router.post(
  "/signin/email",
  validate(emailSigninSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.signInWithEmail(email, password);
    res.json(result);
  })
);

router.post(
  "/signin/oauth",
  validate(oauthSigninSchema),
  asyncHandler(async (req, res) => {
    const { access_token, provider, name } = req.body;
    const result = await authService.signInWithOAuth(access_token, provider, name);
    res.json(result);
  })
);

router.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refreshSession(req.body.refresh_token);
    res.json(result);
  })
);

router.post(
  "/signout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    await authService.signOut(accessToken);
    res.json({ ok: true });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    const user = await authService.getProfile(userId, accessToken);
    res.json({ user });
  })
);

router.patch(
  "/me",
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    const user = await authService.updateProfile(userId, accessToken, req.body);
    res.json({ user });
  })
);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/auth.ts backend/src/routes/auth.ts
git commit -m "refactor(backend): extract auth service layer, add Zod validation to all auth routes"
```

---

## Task 6: Groups Service + Routes Rewrite (+ Delete Group)

**Files:**
- Create: `backend/src/services/groups.ts`
- Modify: `backend/src/routes/groups.ts`

- [ ] **Step 1: Create groups service**

```ts
// backend/src/services/groups.ts
import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { GROUP_MAX_MEMBERS } from "@chalk/shared";

export async function createGroup(userId: string, accessToken: string, name: string) {
  const supabase = createUserClient(accessToken);

  // Use the RPC function for atomic group + member creation
  const { data: groupId, error } = await supabase.rpc("create_group_with_member", {
    group_name: name,
  });

  if (error) throw new AppError(400, error.message, "GROUP_CREATE_FAILED");

  // Fetch the created group to return it
  const { data: group } = await supabase.from("groups").select("*").eq("id", groupId).single();
  return group;
}

export async function listGroups(accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, joined_at, groups(id, name, created_by, created_at)")
    .order("joined_at", { ascending: false });

  if (error) throw new AppError(400, error.message, "GROUPS_FETCH_FAILED");

  return (data ?? []).map((row: any) => ({
    ...row.groups,
    joined_at: row.joined_at,
  }));
}

export async function getGroupDetail(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const [groupResult, membersResult] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase
      .from("group_members")
      .select("user_id, joined_at, users(id, name, upi_id)")
      .eq("group_id", groupId),
  ]);

  if (groupResult.error) throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");

  const members = (membersResult.data ?? []).map((m: any) => ({
    ...m.users,
    joined_at: m.joined_at,
  }));

  return { group: groupResult.data, members };
}

export async function inviteMember(groupId: string, phone: string, accessToken: string) {
  // Look up user by phone (admin — phone isn't exposed via RLS)
  const { data: targetUser } = await adminClient
    .from("users")
    .select("id")
    .eq("phone", phone)
    .is("deleted_at", null)
    .single();

  if (!targetUser) throw new AppError(404, "No user found with that phone number", "USER_NOT_FOUND");

  // Verify requester is a member
  const supabase = createUserClient(accessToken);
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .limit(1)
    .maybeSingle();

  if (!membership) throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");

  // Check max members
  const { count } = await adminClient
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId);

  if (count !== null && count >= GROUP_MAX_MEMBERS) {
    throw new AppError(400, `Group cannot exceed ${GROUP_MAX_MEMBERS} members`, "GROUP_FULL");
  }

  // Check if already a member
  const { data: existing } = await adminClient
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", targetUser.id)
    .maybeSingle();

  if (existing) throw new AppError(409, "User is already a member", "ALREADY_MEMBER");

  // Add member
  const { error } = await adminClient
    .from("group_members")
    .insert({ group_id: groupId, user_id: targetUser.id });

  if (error) throw new AppError(400, error.message, "INVITE_FAILED");

  return { user_id: targetUser.id };
}

export async function leaveGroup(groupId: string, userId: string) {
  const { error } = await adminClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw new AppError(400, error.message, "LEAVE_FAILED");
}

export async function deleteGroup(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { error } = await supabase.rpc("delete_group", { target_group_id: groupId });
  if (error) throw new AppError(403, error.message, "DELETE_GROUP_FAILED");
}
```

- [ ] **Step 2: Rewrite groups routes (add delete endpoint)**

```ts
// backend/src/routes/groups.ts
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import { createGroupSchema, inviteMemberSchema, groupIdParamSchema } from "../schemas/groups.js";
import * as groupsService from "../services/groups.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createGroupSchema),
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    const group = await groupsService.createGroup(userId, accessToken, req.body.name);
    res.status(201).json({ group });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const groups = await groupsService.listGroups(accessToken);
    res.json({ groups });
  })
);

router.get(
  "/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const result = await groupsService.getGroupDetail(req.params.groupId, accessToken);
    res.json(result);
  })
);

router.post(
  "/:groupId/invite",
  validateParams(groupIdParamSchema),
  validate(inviteMemberSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const result = await groupsService.inviteMember(req.params.groupId, req.body.phone, accessToken);
    res.status(201).json({ ok: true, ...result });
  })
);

router.delete(
  "/:groupId/leave",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await groupsService.leaveGroup(req.params.groupId, userId);
    res.json({ ok: true });
  })
);

router.delete(
  "/:groupId",
  validateParams(groupIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    await groupsService.deleteGroup(req.params.groupId, accessToken);
    res.json({ ok: true });
  })
);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/groups.ts backend/src/routes/groups.ts
git commit -m "refactor(backend): extract groups service, add delete group route, enforce max members"
```

---

## Task 7: Expenses Service + Routes Rewrite (Fix Split Validation)

**Files:**
- Create: `backend/src/services/expenses.ts`
- Modify: `backend/src/routes/expenses.ts`

- [ ] **Step 1: Create expenses service**

```ts
// backend/src/services/expenses.ts
import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";

interface SplitEntry {
  user_id: string;
  amount_owed: number;
}

interface CreateExpenseInput {
  group_id: string;
  total_amount: number;
  description: string;
  split_type: "equal" | "custom_percent" | "custom_amount";
  split_with?: string[];
  percentages?: Record<string, number>;
  amounts?: Record<string, number>;
}

export async function createExpense(userId: string, accessToken: string, input: CreateExpenseInput) {
  // Verify requester is in the group
  const supabase = createUserClient(accessToken);
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", input.group_id)
    .limit(1)
    .maybeSingle();

  if (!membership) throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");

  // Verify all split participants are group members
  const participantIds = getParticipantIds(input);
  const { data: members } = await adminClient
    .from("group_members")
    .select("user_id")
    .eq("group_id", input.group_id)
    .in("user_id", participantIds);

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const nonMembers = participantIds.filter((id) => !memberIds.has(id));
  if (nonMembers.length > 0) {
    throw new AppError(400, "Some split participants are not group members", "INVALID_PARTICIPANTS");
  }

  // Calculate splits
  const splits = calculateSplits(input);

  // Insert expense
  const { data: expense, error: expenseErr } = await adminClient
    .from("expenses")
    .insert({
      group_id: input.group_id,
      paid_by: userId,
      total_amount: input.total_amount,
      description: input.description,
      split_type: input.split_type,
    })
    .select()
    .single();

  if (expenseErr) throw new AppError(400, expenseErr.message, "EXPENSE_CREATE_FAILED");

  // Insert splits
  const splitRows = splits.map((s) => ({
    expense_id: expense!.id,
    user_id: s.user_id,
    amount_owed: s.amount_owed,
  }));

  const { error: splitErr } = await adminClient.from("expense_splits").insert(splitRows);
  if (splitErr) throw new AppError(400, splitErr.message, "SPLITS_CREATE_FAILED");

  return { expense, splits: splitRows };
}

export async function listGroupExpenses(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("expenses")
    .select("*, expense_splits(id, user_id, amount_owed), users!expenses_paid_by_fkey(name)")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(400, error.message, "EXPENSES_FETCH_FAILED");
  return data ?? [];
}

export async function getExpense(expenseId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("expenses")
    .select("*, expense_splits(id, user_id, amount_owed)")
    .eq("id", expenseId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  return data;
}

export async function deleteExpense(expenseId: string, userId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  // Only the payer can delete
  const { data: expense } = await supabase
    .from("expenses")
    .select("paid_by")
    .eq("id", expenseId)
    .is("deleted_at", null)
    .single();

  if (!expense) throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  if (expense.paid_by !== userId) throw new AppError(403, "Only the payer can delete this expense", "NOT_PAYER");

  const { error } = await adminClient
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId);

  if (error) throw new AppError(400, error.message, "DELETE_FAILED");
}

// ─── Split calculation helpers ──────────────────────────────

function getParticipantIds(input: CreateExpenseInput): string[] {
  switch (input.split_type) {
    case "equal":
      return input.split_with!;
    case "custom_percent":
      return Object.keys(input.percentages!);
    case "custom_amount":
      return Object.keys(input.amounts!);
  }
}

function calculateSplits(input: CreateExpenseInput): SplitEntry[] {
  switch (input.split_type) {
    case "equal":
      return equalSplit(input.total_amount, input.split_with!);
    case "custom_percent":
      return percentSplit(input.total_amount, input.percentages!);
    case "custom_amount":
      return amountSplit(input.amounts!);
  }
}

function equalSplit(totalPaise: number, userIds: string[]): SplitEntry[] {
  const count = userIds.length;
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count;

  return userIds.map((user_id, i) => ({
    user_id,
    amount_owed: base + (i < remainder ? 1 : 0),
  }));
}

function percentSplit(totalPaise: number, percentages: Record<string, number>): SplitEntry[] {
  const entries = Object.entries(percentages);
  const splits: SplitEntry[] = [];
  let allocated = 0;

  for (let i = 0; i < entries.length; i++) {
    const [user_id, pct] = entries[i];
    const isLast = i === entries.length - 1;
    const amount = isLast ? totalPaise - allocated : Math.round((totalPaise * pct) / 100);
    allocated += amount;
    splits.push({ user_id, amount_owed: amount });
  }

  return splits;
}

function amountSplit(amounts: Record<string, number>): SplitEntry[] {
  return Object.entries(amounts).map(([user_id, amount_owed]) => ({
    user_id,
    amount_owed,
  }));
}
```

- [ ] **Step 2: Rewrite expenses routes**

```ts
// backend/src/routes/expenses.ts
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import { createExpenseWithAmountCheck, expenseIdParamSchema, groupExpensesParamSchema } from "../schemas/expenses.js";
import * as expensesService from "../services/expenses.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createExpenseWithAmountCheck),
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    const result = await expensesService.createExpense(userId, accessToken, req.body);
    res.status(201).json(result);
  })
);

router.get(
  "/group/:groupId",
  validateParams(groupExpensesParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const expenses = await expensesService.listGroupExpenses(req.params.groupId, accessToken);
    res.json({ expenses });
  })
);

router.get(
  "/:expenseId",
  validateParams(expenseIdParamSchema),
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const expense = await expensesService.getExpense(req.params.expenseId, accessToken);
    res.json({ expense });
  })
);

router.delete(
  "/:expenseId",
  validateParams(expenseIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId, accessToken } = req as AuthRequest;
    await expensesService.deleteExpense(req.params.expenseId, userId, accessToken);
    res.json({ ok: true });
  })
);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/expenses.ts backend/src/routes/expenses.ts
git commit -m "refactor(backend): extract expenses service, fix split validation, verify group membership"
```

---

## Task 8: Balances Service + Routes Rewrite (Fix Settlement Query Bug)

**Files:**
- Create: `backend/src/services/balances.ts`
- Modify: `backend/src/routes/balances.ts`

- [ ] **Step 1: Create balances service**

```ts
// backend/src/services/balances.ts
import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { calculateNetBalances, simplifyDebts } from "@chalk/shared";

export async function getGroupBalances(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  // 1. Fetch members first — we need their IDs for the settlements query
  const { data: membersData, error: membersErr } = await supabase
    .from("group_members")
    .select("user_id, users(id, name, upi_id)")
    .eq("group_id", groupId);

  if (membersErr) throw new AppError(400, membersErr.message, "MEMBERS_FETCH_FAILED");

  const members = membersData ?? [];
  const memberIds = members.map((m) => m.user_id);

  if (memberIds.length === 0) {
    return { balances: {}, debts: [] };
  }

  // 2. Fetch expenses, splits, and settlements in parallel
  const [expensesRes, splitsRes, settlementsRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, paid_by, total_amount")
      .eq("group_id", groupId)
      .is("deleted_at", null),
    supabase
      .from("expense_splits")
      .select("user_id, amount_owed, expenses!inner(group_id, deleted_at)")
      .eq("expenses.group_id", groupId)
      .is("expenses.deleted_at", null),
    // FIX: Use adminClient with explicit member ID filters instead of malformed .or() subquery
    adminClient
      .from("settlements")
      .select("from_user, to_user, amount, status")
      .in("from_user", memberIds)
      .in("to_user", memberIds),
  ]);

  if (expensesRes.error) throw new AppError(400, "Failed to fetch expenses", "EXPENSES_FETCH_FAILED");
  if (splitsRes.error) throw new AppError(400, "Failed to fetch splits", "SPLITS_FETCH_FAILED");

  const expenses = expensesRes.data ?? [];
  const splits = (splitsRes.data ?? []).map((s) => ({
    user_id: s.user_id,
    amount_owed: s.amount_owed,
  }));
  const settlements = (settlementsRes.data ?? []).map((s) => ({
    from_user: s.from_user,
    to_user: s.to_user,
    amount: s.amount,
    status: s.status as string,
  }));

  // 3. Calculate balances using shared logic
  const netBalances = calculateNetBalances(expenses, splits, settlements);
  const debts = simplifyDebts(netBalances);

  // 4. Build name/UPI lookup
  const memberMap = new Map<string, { name: string; upi_id: string | null }>();
  for (const m of members) {
    const user = m.users as unknown as { id: string; name: string; upi_id: string | null };
    memberMap.set(user.id, { name: user.name, upi_id: user.upi_id });
  }

  const enrichedDebts = debts.map((d) => ({
    ...d,
    from_name: memberMap.get(d.from)?.name ?? "Unknown",
    to_name: memberMap.get(d.to)?.name ?? "Unknown",
    to_upi_id: memberMap.get(d.to)?.upi_id ?? null,
  }));

  return {
    balances: Object.fromEntries(netBalances),
    debts: enrichedDebts,
  };
}
```

- [ ] **Step 2: Rewrite balances route**

```ts
// backend/src/routes/balances.ts
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
    const result = await balancesService.getGroupBalances(req.params.groupId, accessToken);
    res.json(result);
  })
);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/balances.ts backend/src/routes/balances.ts
git commit -m "fix(backend): rewrite balances — fix settlement query bug, extract service layer"
```

---

## Task 9: Settlements Service + Routes Rewrite (Add Reject Endpoint)

**Files:**
- Create: `backend/src/services/settlements.ts`
- Modify: `backend/src/routes/settlements.ts`

- [ ] **Step 1: Create settlements service**

```ts
// backend/src/services/settlements.ts
import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { buildAppSpecificUpiLinks } from "@chalk/shared";

export async function createSettlement(userId: string, toUser: string, amount: number) {
  if (userId === toUser) throw new AppError(400, "Cannot settle with yourself", "SELF_SETTLEMENT");

  // Fetch payee UPI info
  const { data: payee } = await adminClient
    .from("users")
    .select("id, name, upi_id")
    .eq("id", toUser)
    .single();

  if (!payee) throw new AppError(404, "Payee not found", "PAYEE_NOT_FOUND");

  // Create settlement record
  const { data: settlement, error } = await adminClient
    .from("settlements")
    .insert({
      from_user: userId,
      to_user: toUser,
      amount,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "SETTLEMENT_CREATE_FAILED");

  // Build UPI deep links if payee has a VPA
  let upiLinks = null;
  if (payee.upi_id) {
    try {
      upiLinks = buildAppSpecificUpiLinks({
        payeeVpa: payee.upi_id,
        payeeName: payee.name,
        amount,
        note: "Chalk settlement",
      });
    } catch {
      // Invalid VPA — return settlement without links
    }
  }

  return { settlement, upi_links: upiLinks };
}

export async function confirmSettlement(settlementId: string, userId: string) {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("*")
    .eq("id", settlementId)
    .single();

  if (!settlement) throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  if (settlement.to_user !== userId) throw new AppError(403, "Only the payee can confirm", "NOT_PAYEE");
  if (settlement.status !== "pending") throw new AppError(409, `Settlement is already ${settlement.status}`, "INVALID_STATUS");

  const { data, error } = await adminClient
    .from("settlements")
    .update({ status: "confirmed", paid_at: new Date().toISOString() })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "CONFIRM_FAILED");
  return data;
}

export async function rejectSettlement(settlementId: string, userId: string) {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("*")
    .eq("id", settlementId)
    .single();

  if (!settlement) throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  if (settlement.to_user !== userId) throw new AppError(403, "Only the payee can reject", "NOT_PAYEE");
  if (settlement.status !== "pending") throw new AppError(409, `Settlement is already ${settlement.status}`, "INVALID_STATUS");

  const { data, error } = await adminClient
    .from("settlements")
    .update({ status: "rejected" })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "REJECT_FAILED");
  return data;
}

export async function addTxnRef(settlementId: string, userId: string, upiTxnId: string) {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("from_user")
    .eq("id", settlementId)
    .single();

  if (!settlement) throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  if (settlement.from_user !== userId) throw new AppError(403, "Only the payer can add a transaction reference", "NOT_PAYER");

  const { data, error } = await adminClient
    .from("settlements")
    .update({ upi_txn_id: upiTxnId })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "TXN_REF_FAILED");
  return data;
}

export async function listSettlements(accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(400, error.message, "SETTLEMENTS_FETCH_FAILED");
  return data ?? [];
}
```

- [ ] **Step 2: Rewrite settlements routes (add reject endpoint)**

```ts
// backend/src/routes/settlements.ts
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, validateParams } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import { createSettlementSchema, txnRefSchema, settlementIdParamSchema } from "../schemas/settlements.js";
import * as settlementsService from "../services/settlements.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createSettlementSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const { to_user, amount } = req.body;
    const result = await settlementsService.createSettlement(userId, to_user, amount);
    res.status(201).json(result);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { accessToken } = req as AuthRequest;
    const settlements = await settlementsService.listSettlements(accessToken);
    res.json({ settlements });
  })
);

router.patch(
  "/:settlementId/confirm",
  validateParams(settlementIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.confirmSettlement(req.params.settlementId, userId);
    res.json({ settlement });
  })
);

router.patch(
  "/:settlementId/reject",
  validateParams(settlementIdParamSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.rejectSettlement(req.params.settlementId, userId);
    res.json({ settlement });
  })
);

router.patch(
  "/:settlementId/txn-ref",
  validateParams(settlementIdParamSchema),
  validate(txnRefSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const settlement = await settlementsService.addTxnRef(req.params.settlementId, userId, req.body.upi_txn_id);
    res.json({ settlement });
  })
);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/settlements.ts backend/src/routes/settlements.ts
git commit -m "refactor(backend): extract settlements service, add reject endpoint, add Zod validation"
```

---

## Task 10: Server Entry Point + CORS + Final Wiring

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Install cors**

```bash
cd backend && bun add cors && bun add -D @types/cors
```

- [ ] **Step 2: Update `backend/src/index.ts`**

```ts
// backend/src/index.ts
import express from "express";
import cors from "cors";
import { AppError } from "./lib/errors.js";
import authRouter from "./routes/auth.js";
import groupsRouter from "./routes/groups.js";
import expensesRouter from "./routes/expenses.js";
import balancesRouter from "./routes/balances.js";
import settlementsRouter from "./routes/settlements.js";

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

// Global error handler — must be last middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
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
  }
);

app.listen(PORT, () => {
  console.log(`Chalk backend running on port ${PORT}`);
});

export default app;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts backend/package.json
git commit -m "feat(backend): add CORS, wire AppError into global handler, final entry point cleanup"
```

---

## Self-Review Checklist

### Spec coverage
- [x] Group CRUD (create, invite by phone, leave, delete) — Tasks 6
- [x] Manual expense entry (equal split) — Task 7
- [x] Custom % and Custom ₹ split types — Task 7 (schemas + service)
- [x] Balance calculation and display — Task 8
- [x] UPI deep link settlement — Task 9
- [x] Auth (email/password, Google OAuth, Apple OAuth, profile) — Task 5
- [x] by_item split type removed from accepted inputs (Phase 2 feature) — Task 4 schema only accepts equal/custom_percent/custom_amount
- [x] Zod validation on all endpoints — Tasks 2-9
- [x] Service layer extraction — Tasks 5-9
- [x] Settlement reject endpoint — Task 9
- [x] Delete group endpoint — Task 6
- [x] GROUP_MAX_MEMBERS enforced — Task 6
- [x] Split totals validated (percentages sum to 100, amounts sum to total) — Task 2 schemas

### Placeholder scan
- No TBD, TODO, or "implement later" found.
- All code blocks are complete.
- All file paths are exact.

### Type consistency
- `AppError` used consistently across all services.
- `AuthRequest` interface unchanged from middleware.
- `SplitEntry` interface consistent between schema and service.
- `asyncHandler` wraps all route handlers.
- `validate` / `validateParams` used consistently.

### Bugs fixed
- [x] `balances.ts` malformed `.or()` subquery → replaced with explicit `.in()` filters on `memberIds`
- [x] OAuth `getUser(access_token)` redundancy → `getUser()` without args
- [x] `supabase.ts` unsafe `!` assertions → `requireEnv()` helper
- [x] Missing delete group route → added `DELETE /:groupId`
- [x] `by_item` accepted but unimplemented → removed from Zod schema (Phase 2)
- [x] GROUP_MAX_MEMBERS not enforced → checked in invite service
- [x] Split validation missing → Zod schemas enforce sum=100 and sum=total
