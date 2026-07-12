import { vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────────
// Test constants
// ────────────────────────────────────────────────────────────────

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
export const TEST_USER_ID_2 = "00000000-0000-0000-0000-000000000002";
export const TEST_GROUP_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_EXPENSE_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_SETTLEMENT_ID = "33333333-3333-3333-3333-333333333333";
export const AUTH_HEADER = "Bearer test-valid-token";

// ────────────────────────────────────────────────────────────────
// Mock Prisma client
// ────────────────────────────────────────────────────────────────

/** Deep-mockable Prisma model. Each method is a vi.fn(). */
function createModelMock() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
  };
}

export const mockPrisma = {
  users: createModelMock(),
  groups: createModelMock(),
  group_members: createModelMock(),
  expenses: createModelMock(),
  expense_splits: createModelMock(),
  settlements: createModelMock(),
  personal_tally: createModelMock(),
  $transaction: vi.fn(),
};

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma,
}));

// ────────────────────────────────────────────────────────────────
// Mock Supabase (still needed for auth middleware + auth service)
// ────────────────────────────────────────────────────────────────

export interface AuthMock {
  signUp: ReturnType<typeof vi.fn>;
  signInWithPassword: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  refreshSession: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
}

export let mockUserClientAuth: AuthMock;
export let mockAdminClientAuth: AuthMock;

function createAuthMock(): AuthMock {
  return {
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
}

vi.mock("../lib/supabase.js", () => {
  return {
    createUserClient: vi.fn(),
    adminClient: { auth: {} },
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

  // Reset all Prisma model mocks
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === "object" && model !== null) {
      for (const fn of Object.values(model)) {
        if (typeof fn === "function" && "mockReset" in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }

  // Reset $transaction to execute the callback by default
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    },
  );

  // Fresh auth mocks
  mockUserClientAuth = createAuthMock();
  mockAdminClientAuth = createAuthMock();

  const supabaseMod = await import("../lib/supabase.js");
  (supabaseMod.createUserClient as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: mockUserClientAuth,
  });
  Object.assign(supabaseMod.adminClient, { auth: mockAdminClientAuth });
});

// ────────────────────────────────────────────────────────────────
// Auth helper
// ────────────────────────────────────────────────────────────────

/**
 * Configure the user client's auth.getUser to return a valid user,
 * so the requireAuth middleware passes.
 */
export function authenticateAs(userId: string = TEST_USER_ID) {
  mockUserClientAuth.getUser.mockResolvedValue({
    data: { user: { id: userId, email: "test@example.com" } },
    error: null,
  });
}
