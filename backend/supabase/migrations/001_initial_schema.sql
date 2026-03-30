-- Chalk: Initial Schema
-- All monetary values stored in paise (integer). Never floats.

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  upi_id TEXT,
  phone TEXT UNIQUE,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'apple', 'email')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  paid_by UUID NOT NULL REFERENCES users(id),
  total_amount BIGINT NOT NULL CHECK (total_amount > 0),
  description TEXT NOT NULL DEFAULT '',
  bill_image_url TEXT,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'by_item', 'custom_percent', 'custom_amount')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_owed BIGINT NOT NULL CHECK (amount_owed >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user UUID NOT NULL REFERENCES users(id),
  to_user UUID NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  upi_txn_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE personal_tally (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  month TEXT NOT NULL, -- YYYY-MM format
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, month)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX idx_settlements_from ON settlements(from_user);
CREATE INDEX idx_settlements_to ON settlements(to_user);
CREATE INDEX idx_personal_tally_user_month ON personal_tally(user_id, month);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_tally ENABLE ROW LEVEL SECURITY;

-- Users: can read/update own profile
CREATE POLICY users_select ON users FOR SELECT
  USING (id = auth.uid());
CREATE POLICY users_update ON users FOR UPDATE
  USING (id = auth.uid());

-- Groups: visible to members only
CREATE POLICY groups_select ON groups FOR SELECT
  USING (id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY groups_insert ON groups FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Group members: visible to fellow members
CREATE POLICY group_members_select ON group_members FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY group_members_insert ON group_members FOR INSERT
  WITH CHECK (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- Expenses: visible to group members
CREATE POLICY expenses_select ON expenses FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY expenses_insert ON expenses FOR INSERT
  WITH CHECK (
    paid_by = auth.uid()
    AND group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- Expense splits: visible to group members of the expense's group
CREATE POLICY expense_splits_select ON expense_splits FOR SELECT
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      JOIN group_members gm ON gm.group_id = e.group_id
      WHERE gm.user_id = auth.uid()
    )
  );
CREATE POLICY expense_splits_insert ON expense_splits FOR INSERT
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE e.paid_by = auth.uid()
    )
  );

-- Settlements: visible to sender or receiver
CREATE POLICY settlements_select ON settlements FOR SELECT
  USING (from_user = auth.uid() OR to_user = auth.uid());
CREATE POLICY settlements_insert ON settlements FOR INSERT
  WITH CHECK (from_user = auth.uid());
CREATE POLICY settlements_update ON settlements FOR UPDATE
  USING (from_user = auth.uid() OR to_user = auth.uid());

-- Personal tally: own data only
CREATE POLICY personal_tally_select ON personal_tally FOR SELECT
  USING (user_id = auth.uid());
