# Chalk — Customizable Widget Dashboard + Mobile Navigation

**Date:** 2026-04-05
**Status:** Approved (post-review v2)
**Scope:** Full — widget system, bento grid layout, customization engine, persistence, mobile nav fix

---

## 1. Problem Statement

On viewports ≤ 1023px (tablet and mobile), the groups sidebar is hidden via `display: none` with no alternative navigation. Users on these devices are stuck on the dashboard with no way to access groups, add expenses, or settle debts.

Additionally, the current dashboard (`/`) is an empty "Select a group to get started" placeholder that provides no value to returning users.

## 2. Solution Overview

Replace the empty dashboard with a **customizable, widget-based home screen** that surfaces financial insights, visualizations, and navigation across all groups. The widget grid itself solves the mobile navigation problem by including a groups widget, and a hamburger drawer provides a fallback.

### Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Layout pattern | Bento Grid | Dense, information-rich, naturally responsive |
| Edit mechanism | Dedicated edit mode (pen icon) | Clean default experience, no accidental drags |
| Chart library | Recharts | React-native, declarative, good docs, ~45kb |
| Grid engine | **@dnd-kit/core + custom grid** | React 19 compatible; `react-grid-layout` uses deprecated `findDOMNode` removed in React 19 |
| Persistence | DB-first + localStorage cache | Syncs across devices, instant loads, user can opt-out of DB storage |

---

## 3. Widget Catalog

Each widget is a self-contained React component implementing a standard interface.

### 3.1 Widget Interface

```typescript
interface WidgetDefinition {
  type: string;                          // unique identifier e.g. "net-balance"
  name: string;                          // display name e.g. "Net Balance"
  description: string;                   // shown in widget picker
  defaultSize: { w: number; h: number }; // grid units
  allowedSizes: { w: number; h: number }[];  // resizable options
  configurable?: WidgetConfigField[];    // per-widget settings (chart type, time range, etc.)
}

interface WidgetConfigField {
  key: string;
  label: string;
  type: "select" | "toggle";
  options?: { value: string; label: string }[];
  default: string | boolean;
}

interface WidgetInstance {
  id: string;         // unique instance id (uuid)
  type: string;       // references WidgetDefinition.type
  position: { x: number; y: number; w: number; h: number }; // grid placement
  config: Record<string, string | boolean>;  // user-configured options
}
```

### 3.2 Available Widgets

| Widget | Type ID | Default Size | Allowed Sizes | Configurable Options |
|---|---|---|---|---|
| **Net Balance** | `net-balance` | 3×1 | 1×1, 2×1, 3×1 | — |
| **Spending by Group** | `spending-by-group` | 2×2 | 2×1, 2×2, 3×2 | Chart type: bar / horizontal bar |
| **Spending Breakdown** | `spending-pie` | 1×2 | 1×1, 1×2, 2×2 | Chart type: pie / donut (reuses `spendingByGroup` data) |
| **Top Debtor** | `top-debtor` | 1×1 | 1×1, 2×1 | — |
| **You Owe Most In** | `you-owe-most` | 1×1 | 1×1, 2×1 | — |
| **Recent Expenses** | `recent-expenses` | 2×2 | 1×2, 2×2, 3×2 | Count: 5 / 10 / 20 |
| **Pending Settlements** | `pending-settlements` | 2×1 | 1×1, 2×1 | — |
| **Groups List** | `groups-list` | 1×2 | 1×1, 1×2, 2×2 | — |
| **Monthly Trend** | `monthly-trend` | 2×1 | 2×1, 3×1, 3×2 | Period: 3mo / 6mo / 12mo; Chart type: line / area |

**Note:** The `spending-pie` widget renders the same `spendingByGroup` data as `spending-by-group`, but as a pie/donut chart instead of a bar chart. No separate data field is needed.

### 3.3 Default Layout (New Users)

New users get a pre-configured layout they can immediately customize:

```
┌─────────────────────────────────────┐  ← 3×1: Net Balance
│  Owed to you: ₹X  │ You owe: ₹Y   │
│              Net: ±₹Z               │
├───────────────────┬────┬────────────┤
│                   │    │ Top Debtor │  ← 1×1
│  Spending by      │    ├────────────┤
│  Group (bar)      │    │ You Owe    │  ← 1×1
│  2×2              │    │ Most In    │
├───────────────────┼────┴────────────┤
│ Recent Expenses   │  Groups List    │  ← each 1×2
│ 2×2               │  1×2            │
│                   │                 │
└───────────────────┴─────────────────┘
```

Grid: 3 columns on desktop (≥1024px), 2 on tablet (768–1023px), 1 on mobile (<768px).

**Zero-groups state:** If the user has no groups, show the existing "Select a group to get started" onboarding prompt instead of empty widgets. The widget grid only renders when the user has ≥1 group.

**All-widgets-removed state:** If user removes every widget in edit mode, show a centered prompt: "Your dashboard is empty. Click the pen icon to add widgets." with the edit-mode pen icon highlighted.

---

## 4. Grid Engine

### 4.1 Library: @dnd-kit

`react-grid-layout` is incompatible with React 19 (uses `findDOMNode`, removed in React 19). Instead, use **`@dnd-kit/core`** + **`@dnd-kit/sortable`** with a custom CSS Grid layout:

- `@dnd-kit` is the primary React 19-compatible drag/drop ecosystem — uses refs, not `findDOMNode`
- Custom `<BentoGrid>` component renders a CSS Grid (`grid-template-columns: repeat(N, 1fr)`) where N varies by breakpoint
- `@dnd-kit/sortable` handles reordering; resize is handled via custom drag handles on widget corners that update the `w`/`h` in state
- Snap-to-grid behavior via `@dnd-kit`'s `snapCenterToCursor` + custom grid modifiers
- Breakpoints detected via `window.matchMedia` or a `useBreakpoint()` hook:
  - `lg` (≥1024px): 3 columns
  - `md` (768–1023px): 2 columns
  - `sm` (<768px): 1 column
- Row height: 180px (adjustable per breakpoint)
- Widgets define `minW`, `minH`, `maxW`, `maxH` constraints

**Performance:** All widget components must be wrapped in `React.memo` to prevent re-renders during drag operations. Chart components (Recharts) are expensive to re-render — memoization is mandatory, not optional.

### 4.2 Edit Mode

**Trigger:** Pen/edit icon button in the topbar (only visible on the dashboard route `/`).

**Edit mode ON:**
- Topbar shows "Editing Dashboard" label + "Done" button (replaces pen icon)
- Each widget gets:
  - Drag handle (top bar of widget)
  - Resize handle (bottom-right corner)
  - Remove button (× in top-right)
  - Settings button (⚙️ in top-right, if widget has configurable options)
- "Add Widget" panel slides in from the right side as an overlay
  - Shows all available widgets not currently on the dashboard
  - Each entry shows widget name, description, and preview thumbnail
  - Clicking "Add" places the widget in the first available grid position
- Grid background shows subtle dotted grid lines to indicate snap points

**Edit mode OFF:**
- Widgets are static, no handles visible
- Clean, read-only dashboard experience

**Auto-save:** Layout changes are persisted on every drag/resize/add/remove action (debounced 500ms).

### 4.3 Widget Settings Modal

When user clicks ⚙️ on a configurable widget in edit mode:
- Small popover/modal appears anchored to the widget
- Shows the widget's `configurable` fields (dropdowns, toggles)
- Changes apply immediately (live preview)
- Closing the popover saves the config

---

## 5. Data Layer

### 5.1 New Backend Endpoint: `GET /dashboard/data`

A single aggregation endpoint that returns all data needed by all widgets, avoiding N+1 API calls from the frontend. All monetary values are returned as `number` (converted from Prisma's `BigInt` via `Number()` in the service layer).

**Response shape:**

```typescript
interface DashboardData {
  // Net Balance widget
  totalOwedToYou: number;    // in paise
  totalYouOwe: number;       // in paise
  netBalance: number;        // in paise (positive = net owed to you)

  // Spending by Group widget + Spending Pie widget (shared data source)
  spendingByGroup: {
    groupId: string;
    groupName: string;
    totalSpent: number;      // in paise
  }[];

  // Top Debtor widget
  topDebtor: {
    userId: string;
    name: string;
    amount: number;          // in paise
  } | null;

  // You Owe Most In widget
  youOweMostIn: {
    groupId: string;
    groupName: string;
    amount: number;          // in paise
  } | null;

  // Recent Expenses widget
  recentExpenses: {
    id: string;
    description: string;
    totalAmount: number;     // in paise
    paidByName: string;
    groupName: string;
    createdAt: string;
  }[];

  // Pending Settlements widget
  pendingSettlements: {
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;          // in paise
    groupId: string;
    groupName: string;
  }[];

  // Groups List widget
  groups: {
    id: string;
    name: string;
    memberCount: number;
    yourBalance: number;     // in paise (positive = owed to you)
  }[];

  // Monthly Trend widget
  monthlyTrend: {
    month: string;           // "2026-01", "2026-02", etc.
    totalSpent: number;      // in paise
  }[];
}
```

**BigInt handling:** All Prisma monetary fields are `BigInt`. The dashboard service must convert every monetary field to `number` via `Number(bigintValue)` before including in the response. JSON.stringify does not support BigInt natively — failing to convert will crash serialization.

**Implementation:** Single Prisma query pipeline:

1. `prisma.group_members.findMany({ where: { user_id } })` → get all group IDs
2. **Cross-group aggregation queries** (NOT per-group loops):
   - `prisma.expenses.groupBy({ by: ['group_id'], _sum: { total_amount: true }, where: { group_id: { in: groupIds } } })` → spending by group
   - `prisma.expenses.findMany({ where: { group_id: { in: groupIds } }, orderBy: { created_at: 'desc' }, take: 20 })` → recent expenses
   - `prisma.settlements.findMany({ where: { OR: [{ from_user: userId }, { to_user: userId }], status: 'pending' } })` → pending settlements with group context via new `group_id` column
   - Cross-group net balance: computed from expense_splits and settlements in a single raw SQL query or aggregated Prisma query — avoids the N+1 of calling `getGroupBalances()` per group
   - Monthly trend: `prisma.$queryRaw` with `DATE_TRUNC('month', created_at)` grouping
3. Derive top debtor + you-owe-most from the cross-group balance data
4. Convert all `BigInt` → `number` via `Number()`
5. Shape into `DashboardData` response

### 5.2 Caching & Invalidation

**In-memory cache:** `Map<userId, { data: DashboardData, timestamp: number }>` with **15-second TTL**.

**Cache invalidation:** The cache entry for a user is deleted when:
- The user creates/deletes an expense (in `expenses` service)
- The user creates/updates a settlement (in `settlements` service)
- The user creates/deletes a group (in `groups` service)

Implementation: add `dashboardCache.delete(userId)` calls at the end of these mutation services.

**Error handling:** If `GET /dashboard/data` fails, the frontend shows a centered error card with a "Retry" button that re-fetches. Individual widget failures are not possible (single data source), so it's all-or-nothing.

**Loading state:** On first load, show skeleton placeholders in each widget's grid position (grey shimmer rectangles matching the widget's `w×h` size).

### 5.3 Dashboard Layout Persistence

**New Prisma model:**

```prisma
model dashboard_layouts {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String   @unique @db.Uuid
  layout     Json     // Array of WidgetInstance
  updated_at DateTime @default(now()) @db.Timestamptz(6)
  created_at DateTime @default(now()) @db.Timestamptz(6)

  users users @relation(fields: [user_id], references: [id], onDelete: Cascade)
}
```

**Note:** The `users` model in `schema.prisma` must also gain a relation field: `dashboard_layouts dashboard_layouts?`

**Layout validation (Zod schema for PUT):**

```typescript
const widgetInstanceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "net-balance", "spending-by-group", "spending-pie", "top-debtor",
    "you-owe-most", "recent-expenses", "pending-settlements",
    "groups-list", "monthly-trend",
  ]),
  position: z.object({
    x: z.number().int().min(0).max(2),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(3),
    h: z.number().int().min(1).max(3),
  }),
  config: z.record(z.union([z.string(), z.boolean()])),
});

const dashboardLayoutSchema = z.object({
  layout: z.array(widgetInstanceSchema).max(20), // max 20 widgets
});
```

**New API endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/dashboard` | `requireAuth` | Returns user's saved layout (or default if none saved) |
| `PUT` | `/dashboard` | `requireAuth` | Saves/updates user's layout (validated by Zod) |
| `DELETE` | `/dashboard` | `requireAuth` | Resets to default layout |
| `GET` | `/dashboard/data` | `requireAuth` | Aggregated widget data |

**Frontend API client addition:** Add `put` to `web/src/lib/api.ts`:

```typescript
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
```

### 5.4 localStorage Cache Strategy

```
Key: chalk-dashboard-layout
Value: JSON string of WidgetInstance[]
```

- On page load: render from localStorage immediately (instant perceived load)
- In background: fetch from `GET /dashboard` and reconcile
  - If DB layout is newer (by `updated_at`), update localStorage and re-render
  - If no DB layout exists, push localStorage layout to DB
- On layout change: write to localStorage immediately + debounced PUT to DB
- Opt-out: a toggle in the widget settings popover (accessible via ⚙️ on any widget in edit mode, or a gear icon in the topbar edit-mode bar). When `sync_dashboard` is `false`, layout changes only write to localStorage. The toggle state itself is stored in localStorage under `chalk-dashboard-sync` (boolean). Default: `true` (sync enabled).

---

## 6. Schema Migration: Add `group_id` to settlements

The `settlements` table currently has no `group_id` column. The `pending-settlements` widget needs to show which group a settlement belongs to. Add:

```prisma
model settlements {
  // ... existing fields ...
  group_id  String?  @db.Uuid
  groups    groups?  @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
}
```

**Why nullable:** Existing settlements in the DB have no group context. New settlements created after migration will include `group_id`. The widget gracefully handles `null` group by omitting the group name.

**Migration:** Also add `settlements settlements[]` relation to the `groups` model.

**Settlement service update:** When creating a settlement, the frontend must pass the `group_id` from the settle page URL (`/group/:groupId/settle`). The backend settlement creation service must accept and store it.

---

## 7. Mobile Navigation Fix

Two complementary solutions:

### 7.1 Groups Widget on Dashboard

The `groups-list` widget is included in the default layout. On mobile (single column), it renders as a full-width scrollable list of groups with balance indicators. Tapping a group navigates to `/group/:id`. This is the primary mobile navigation path.

### 7.2 Hamburger Drawer (Belt + Suspenders)

For users who remove the groups widget, or for navigating from within group detail pages:

- **Topbar change (≤1023px):** Replace the logo with a hamburger icon (☰) on the left. Logo moves to center.
- **Drawer:** Clicking hamburger opens the existing `GroupsSidebar` component as a slide-in overlay from the left.
- **Backdrop:** Semi-transparent backdrop behind the drawer. Clicking backdrop or selecting a group closes the drawer.
- **Implementation:** CSS transform + transition on `.sidebar`. No new components needed — just conditional rendering and a state toggle in `Layout.tsx`.

### 7.3 Responsive Breakpoints Summary

| Breakpoint | Grid Cols | Sidebar | Hamburger | Widget Columns |
|---|---|---|---|---|
| ≥1024px (desktop) | 3 | Visible (static) | Hidden | 3 |
| 768–1023px (tablet) | 2 | Hidden | Visible | 2 |
| <768px (mobile) | 1 | Hidden | Visible | 1 |

---

## 8. Frontend Architecture

### 8.1 New Files

```
web/src/
├── pages/
│   └── Dashboard.tsx              ← rewrite (widget grid replaces placeholder)
│   └── Dashboard.css              ← rewrite
├── components/
│   ├── dashboard/
│   │   ├── BentoGrid.tsx          ← @dnd-kit powered CSS Grid wrapper
│   │   ├── BentoGrid.css
│   │   ├── WidgetCard.tsx         ← standard widget container (header, drag handle, settings)
│   │   ├── WidgetCard.css
│   │   ├── WidgetPicker.tsx       ← "Add Widget" slide-out panel
│   │   ├── WidgetPicker.css
│   │   ├── WidgetSettings.tsx     ← per-widget config popover
│   │   └── widgets/
│   │       ├── types.ts           ← WidgetDefinition, WidgetInstance, WidgetConfigField types
│   │       ├── NetBalance.tsx
│   │       ├── SpendingByGroup.tsx
│   │       ├── SpendingPie.tsx    ← renders spendingByGroup data as pie/donut chart
│   │       ├── TopDebtor.tsx
│   │       ├── YouOweMost.tsx
│   │       ├── RecentExpenses.tsx
│   │       ├── PendingSettlements.tsx
│   │       ├── GroupsList.tsx
│   │       ├── MonthlyTrend.tsx
│   │       └── index.ts           ← widget registry (maps type → component + definition)
│   └── Layout.tsx                 ← modify (add hamburger + drawer for mobile)
│   └── Layout.css                 ← modify (drawer styles, responsive hamburger)
├── hooks/
│   └── useDashboard.ts            ← layout CRUD + data fetching hook
├── lib/
│   ├── api.ts                     ← add `put` export
│   └── services/
│       └── dashboard.ts           ← API client for /dashboard endpoints
```

### 8.2 Widget Registry Pattern

```typescript
// web/src/components/dashboard/widgets/index.ts
import { type WidgetDefinition } from "./types";
import NetBalance from "./NetBalance";
import SpendingByGroup from "./SpendingByGroup";
// ... etc

export const WIDGET_REGISTRY: Record<string, {
  component: React.MemoExoticType<React.ComponentType<WidgetProps>>;
  definition: WidgetDefinition;
}> = {
  "net-balance": { component: React.memo(NetBalance), definition: { ... } },
  "spending-by-group": { component: React.memo(SpendingByGroup), definition: { ... } },
  // ...
};

interface WidgetProps {
  data: DashboardData;
  config: Record<string, string | boolean>;
}
```

All widget components are registered as `React.memo` wrapped to prevent drag-induced re-renders.

The `BentoGrid` iterates over the user's `WidgetInstance[]`, looks up each type in the registry, and renders the component with the relevant slice of `DashboardData`.

### 8.3 State Flow

```
Page Load
  ├── Read localStorage → render grid immediately (skeleton if empty)
  ├── GET /dashboard → reconcile layout
  └── GET /dashboard/data → populate all widgets with live data
      ├── Success → render widgets
      └── Failure → show error card with "Retry" button

Edit Mode Toggle (pen icon)
  ├── @dnd-kit context activates (DndContext wraps the grid)
  ├── Widget chrome changes (handles, buttons appear)
  └── Widget picker panel becomes accessible

Layout Change (drag/resize/add/remove)
  ├── Update React state (immediate re-render)
  ├── Write to localStorage (immediate)
  └── Debounced PUT /dashboard (500ms)
```

**Dashboard page lazy-loading:** The Dashboard page should be loaded via `React.lazy()` in `App.tsx` to keep the initial bundle small. Recharts + @dnd-kit add ~65kb gzipped — lazy-loading ensures this only loads when the user visits `/`.

---

## 9. Backend Changes

### 9.1 New Files

```
backend/src/
├── routes/
│   └── dashboard.ts       ← route definitions (all routes use requireAuth)
├── services/
│   └── dashboard.ts       ← data aggregation + layout CRUD + cache
├── schemas/
│   └── dashboard.ts       ← Zod validation for layout PUT
```

### 9.2 Prisma Migration

Two schema changes in a single migration:

**1. New `dashboard_layouts` table:**

```prisma
model dashboard_layouts {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String   @unique @db.Uuid
  layout     Json
  updated_at DateTime @default(now()) @db.Timestamptz(6)
  created_at DateTime @default(now()) @db.Timestamptz(6)

  users users @relation(fields: [user_id], references: [id], onDelete: Cascade)
}
```

**2. Add `group_id` to `settlements`:**

```prisma
model settlements {
  // ... existing fields ...
  group_id  String?  @db.Uuid
  groups    groups?  @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
}
```

**Relation additions to existing models:**
- `users` model: add `dashboard_layouts dashboard_layouts?`
- `groups` model: add `settlements settlements[]`

### 9.3 Data Aggregation Service

The `GET /dashboard/data` handler runs cross-group aggregation queries — never loops per-group:

1. `prisma.group_members.findMany({ where: { user_id } })` → get all group IDs
2. **Parallel** cross-group queries (using `Promise.all`):
   - Spending by group: `prisma.expenses.groupBy()` with `group_id` in groupIds
   - Recent expenses: `prisma.expenses.findMany()` ordered by `created_at` desc, limit 20
   - Pending settlements: `prisma.settlements.findMany()` where `status = 'pending'`
   - Cross-group balances: single raw SQL query that computes net balances across all groups (avoids N+1 per-group balance calls)
   - Monthly trend: raw SQL with `DATE_TRUNC('month', created_at)` grouping
   - Groups with member count: `prisma.groups.findMany()` with `_count: { group_members: true }`
3. Derive top debtor + you-owe-most from cross-group balance results
4. Convert all `BigInt` → `number` via `Number()`
5. Return `DashboardData`

### 9.4 Cache

```typescript
// In-memory per-user cache with 15s TTL
const cache = new Map<string, { data: DashboardData; ts: number }>();

function getCached(userId: string): DashboardData | null {
  const entry = cache.get(userId);
  if (!entry || Date.now() - entry.ts > 15_000) {
    cache.delete(userId);
    return null;
  }
  return entry.data;
}

// Invalidation: called from expense/settlement/group mutation services
export function invalidateDashboardCache(userId: string) {
  cache.delete(userId);
}
```

---

## 10. New Dependencies

| Package | Purpose | Added to |
|---|---|---|
| `recharts` | Chart rendering (bar, pie, line, area) | `web/package.json` |
| `@dnd-kit/core` | Drag/drop engine (React 19 compatible) | `web/package.json` |
| `@dnd-kit/sortable` | Sortable grid items | `web/package.json` |
| `@dnd-kit/utilities` | CSS transform utilities | `web/package.json` |

No new backend dependencies needed.

---

## 11. Testing Strategy

### 11.1 Playwright E2E Tests (new)

- Dashboard renders with default widgets for new user
- Dashboard shows zero-groups onboarding state when user has no groups
- Edit mode toggle shows/hides drag handles
- Add a widget from the picker
- Remove a widget
- Layout persists after page refresh (localStorage)
- Mobile: hamburger drawer opens and navigates to a group
- Mobile: groups widget navigates to group detail
- Error state: retry button re-fetches dashboard data

### 11.2 Backend Unit Tests (Vitest)

- `GET /dashboard/data` returns correct shape with all fields
- `GET /dashboard/data` converts BigInt to number correctly
- `GET /dashboard` returns default layout for new user
- `PUT /dashboard` validates layout (rejects invalid widget types, out-of-bounds positions, >20 widgets)
- `PUT /dashboard` saves and retrieves layout
- `DELETE /dashboard` resets to default
- Data aggregation correctness (net balance, top debtor, spending by group)
- Cache invalidation: data changes after expense creation

---

## 12. Out of Scope

- Real-time updates (WebSocket push when someone adds an expense)
- Widget sharing between users
- Custom/user-created widget types
- Data export from widgets
- Dark mode (separate feature)
- Duplicate widgets (each widget type can appear at most once)
