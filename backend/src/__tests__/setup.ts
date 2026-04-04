import { vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────────
// Mock chain factory
// ────────────────────────────────────────────────────────────────

export interface ChainMock {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  then?: (resolve: (v: unknown) => unknown) => unknown;
  auth: {
    signUp: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
}

/**
 * Build a Supabase-like chainable mock.
 * Every method returns the chain itself so `.from().select().eq()` works.
 * Terminal methods (`single`, `maybeSingle`) resolve with `resolveValue`.
 * The chain itself is thenable so bare `.from().select()` also resolves.
 */
export function createChainMock(
  resolveValue: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  },
): ChainMock {
  const chain = {} as ChainMock;

  const chainMethods = [
    "from",
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "in",
    "is",
    "or",
    "order",
    "limit",
    "rpc",
  ] as const;

  for (const method of chainMethods) {
    (chain as Record<string, unknown>)[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods resolve the value
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);

  // Make the chain thenable for queries without terminal methods
  chain.then = (resolve: (v: unknown) => unknown) => resolve(resolveValue);

  // Auth sub-object
  chain.auth = {
    signUp: vi
      .fn()
      .mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signInWithPassword: vi
      .fn()
      .mockResolvedValue({ data: { user: null, session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    refreshSession: vi
      .fn()
      .mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  return chain;
}

// ────────────────────────────────────────────────────────────────
// Shared mock instances
// ────────────────────────────────────────────────────────────────

export let mockUserClient: ChainMock;
export let mockAdminClient: ChainMock;

/**
 * Replace the default resolve value for all chain/terminal methods
 * on a mock. Useful for per-test overrides.
 */
export function setChainResolve(
  mock: ChainMock,
  value: { data: unknown; error: unknown },
) {
  mock.single.mockResolvedValue(value);
  mock.maybeSingle.mockResolvedValue(value);
  mock.then = (resolve: (v: unknown) => unknown) => resolve(value);
}

// ────────────────────────────────────────────────────────────────
// Mock Supabase module (must be before any app import)
// ────────────────────────────────────────────────────────────────

vi.mock("../lib/supabase.js", () => {
  return {
    createUserClient: vi.fn(),
    adminClient: {},
  };
});

// Set env vars so the module doesn't throw
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

// ────────────────────────────────────────────────────────────────
// Wire up fresh mocks before each test
// ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();

  mockUserClient = createChainMock();
  mockAdminClient = createChainMock();

  const supabaseMod = await import("../lib/supabase.js");
  (supabaseMod.createUserClient as ReturnType<typeof vi.fn>).mockReturnValue(
    mockUserClient as unknown as SupabaseClient,
  );
  // Replace the adminClient export (it's an object, we replace its properties)
  Object.assign(supabaseMod.adminClient, mockAdminClient);
});

// ────────────────────────────────────────────────────────────────
// Test constants
// ────────────────────────────────────────────────────────────────

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
export const TEST_USER_ID_2 = "00000000-0000-0000-0000-000000000002";
export const TEST_GROUP_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_EXPENSE_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_SETTLEMENT_ID = "33333333-3333-3333-3333-333333333333";
export const AUTH_HEADER = "Bearer test-valid-token";

/**
 * Configure the user client's auth.getUser to return a valid user,
 * so the requireAuth middleware passes. Call in beforeEach for
 * any route that requires authentication.
 */
export function authenticateAs(userId: string = TEST_USER_ID) {
  mockUserClient.auth.getUser.mockResolvedValue({
    data: { user: { id: userId, email: "test@example.com" } },
    error: null,
  });
}
