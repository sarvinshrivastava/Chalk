import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatPaise } from "../lib/format";
import "./GroupDetail.css";

interface Member {
  id: string;
  name: string;
  upi_id: string | null;
}

interface Expense {
  id: string;
  paid_by: string;
  total_amount: number;
  description: string;
  split_type: string;
  created_at: string;
  expense_splits: { user_id: string; amount_owed: number }[];
}

interface DebtEdge {
  from: string;
  to: string;
  amount: number;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debts, setDebts] = useState<DebtEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitePhone, setInvitePhone] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  const fetchAll = async () => {
    if (!groupId) return;

    const [groupRes, membersRes, expensesRes] = await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).single(),
      supabase
        .from("group_members")
        .select("user_id, users(id, name, upi_id)")
        .eq("group_id", groupId),
      supabase
        .from("expenses")
        .select("*, expense_splits(user_id, amount_owed)")
        .eq("group_id", groupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    if (groupRes.data) setGroupName(groupRes.data.name);

    const memberList = (membersRes.data ?? []).map(
      (m: any) => m.users as Member
    );
    setMembers(memberList);
    setExpenses(expensesRes.data ?? []);

    // Calculate simplified debts client-side
    const balances = new Map<string, number>();
    const add = (id: string, amt: number) =>
      balances.set(id, (balances.get(id) ?? 0) + amt);

    for (const exp of expensesRes.data ?? []) {
      add(exp.paid_by, exp.total_amount);
      for (const split of exp.expense_splits) {
        add(split.user_id, -split.amount_owed);
      }
    }

    // Fetch confirmed settlements for this group's members
    const memberIds = memberList.map((m: Member) => m.id);
    if (memberIds.length > 0) {
      const { data: settlements } = await supabase
        .from("settlements")
        .select("from_user, to_user, amount, status")
        .in("from_user", memberIds)
        .in("to_user", memberIds)
        .eq("status", "confirmed");

      for (const s of settlements ?? []) {
        add(s.from_user, s.amount);
        add(s.to_user, -s.amount);
      }
    }

    // Simplify
    const debtors: { id: string; amount: number }[] = [];
    const creditors: { id: string; amount: number }[] = [];
    for (const [id, bal] of balances) {
      if (bal < 0) debtors.push({ id, amount: -bal });
      else if (bal > 0) creditors.push({ id, amount: bal });
    }
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const edges: DebtEdge[] = [];
    let i = 0,
      j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(debtors[i].amount, creditors[j].amount);
      if (amt > 0) edges.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
      debtors[i].amount -= amt;
      creditors[j].amount -= amt;
      if (debtors[i].amount === 0) i++;
      if (creditors[j].amount === 0) j++;
    }
    setDebts(edges);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [groupId]);

  const getName = (id: string) =>
    id === user?.id ? "You" : members.find((m) => m.id === id)?.name ?? "Unknown";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg("");

    // Look up user by phone
    const { data: targetUser } = await supabase
      .from("users")
      .select("id")
      .eq("phone", invitePhone)
      .single();

    if (!targetUser) {
      setInviteMsg("No user found with that phone number.");
      return;
    }

    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId!, user_id: targetUser.id });

    if (error) {
      setInviteMsg(error.message.includes("duplicate") ? "Already a member!" : error.message);
    } else {
      setInviteMsg("Invited!");
      setInvitePhone("");
      setShowInvite(false);
      fetchAll();
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <Link to="/" className="back-link">&larr; Groups</Link>
        <h2>{groupName}</h2>
        <span className="member-count">{members.length} members</span>
      </div>

      {/* Balance strip */}
      {debts.length > 0 && (
        <div className="balance-strip card">
          <h3>Balances</h3>
          {debts.map((d, i) => (
            <div key={i} className="debt-row">
              <span className="debt-from">{getName(d.from)}</span>
              <span className="debt-arrow"> owes </span>
              <span className="debt-to">{getName(d.to)}</span>
              <span className="amount amount--negative">{formatPaise(d.amount)}</span>
            </div>
          ))}
          <Link
            to={`/group/${groupId}/settle`}
            className="btn btn-primary"
            style={{ marginTop: 12, fontSize: "0.9rem" }}
          >
            Settle up
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="group-actions">
        <Link
          to={`/group/${groupId}/add-expense`}
          className="btn btn-primary"
        >
          + Add expense
        </Link>
        <button
          className="btn btn-outline"
          onClick={() => setShowInvite(!showInvite)}
        >
          Invite member
        </button>
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="card invite-form">
          <div className="form-group">
            <label>Phone number</label>
            <input
              type="tel"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              placeholder="+91XXXXXXXXXX"
              required
            />
          </div>
          {inviteMsg && <p className="invite-msg">{inviteMsg}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ fontSize: "0.9rem" }}
          >
            Send invite
          </button>
        </form>
      )}

      {/* Activity feed */}
      <div className="activity-feed">
        <h3>Activity</h3>
        {expenses.length === 0 ? (
          <p className="empty-state">No expenses yet. Add one!</p>
        ) : (
          expenses.map((exp) => (
            <div key={exp.id} className="expense-card card">
              <div className="expense-card-top">
                <div>
                  <div className="expense-desc">
                    {exp.description || "Expense"}
                  </div>
                  <div className="expense-meta">
                    {getName(exp.paid_by)} paid &middot;{" "}
                    {new Date(exp.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
                <div className="amount">{formatPaise(exp.total_amount)}</div>
              </div>
              {exp.expense_splits.length > 0 && (
                <div className="expense-splits">
                  {exp.expense_splits.map((s, i) => (
                    <div key={i} className="split-row">
                      <span>{getName(s.user_id)}</span>
                      <span className="amount amount--negative">
                        {formatPaise(s.amount_owed)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
