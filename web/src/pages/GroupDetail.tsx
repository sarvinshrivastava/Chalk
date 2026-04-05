import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatPaise, getErrorMessage } from "../lib/format";
import {
  fetchGroupDetail,
  fetchGroupExpenses,
  fetchGroupBalances,
  inviteMember,
  deleteExpense,
} from "../lib/services";
import type {
  GroupMemberDetail,
  ExpenseWithDetails,
  DebtEdge,
} from "../lib/services";
import TrashIcon from "../components/icons/TrashIcon";
import "./GroupDetail.css";

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<GroupMemberDetail[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [debts, setDebts] = useState<DebtEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitePhone, setInvitePhone] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    if (!groupId) return;

    try {
      const [groupData, expensesData, balancesData] = await Promise.all([
        fetchGroupDetail(groupId),
        fetchGroupExpenses(groupId),
        fetchGroupBalances(groupId),
      ]);

      setGroupName(groupData.group.name);
      setMembers(groupData.members);
      setExpenses(expensesData);
      setDebts(balancesData.debts);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const nameMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );
  const getName = (id: string) =>
    id === user?.id ? "You" : (nameMap.get(id) ?? "Unknown");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg("");

    try {
      await inviteMember(groupId!, invitePhone);
      setInviteMsg("Invited!");
      setInvitePhone("");
      setShowInvite(false);
      fetchAll();
    } catch (err: unknown) {
      setInviteMsg(getErrorMessage(err));
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteExpense(expenseId);
      fetchAll();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="group-detail">
      {/* Header — spans full width */}
      <div className="group-detail-header">
        <div className="group-detail-title">
          <Link to="/" className="back-btn" aria-label="Back to dashboard">
            ←
          </Link>
          <h2>{groupName}</h2>
          <span className="member-count">{members.length} members</span>
        </div>
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
      </div>

      {error && <p className="error-text">{error}</p>}

      {/* Left column — Activity feed */}
      <div className="group-detail-main">
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
                      {exp.users?.name ?? getName(exp.paid_by)} paid &middot;{" "}
                      {new Date(exp.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </div>
                  <div className="expense-card-right">
                    <div className="amount">
                      {formatPaise(exp.total_amount)}
                    </div>
                    {exp.paid_by === user?.id && (
                      <button
                        className="expense-delete-btn"
                        title="Delete expense"
                        onClick={() => handleDeleteExpense(exp.id)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {exp.expense_splits.length > 0 && (
                  <div className="expense-splits">
                    {exp.expense_splits.map((s) => (
                      <div key={s.id || s.user_id} className="split-row">
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

      {/* Right column — Balances + Members */}
      <div className="group-detail-side">
        {/* Balances card */}
        <div className="balance-strip card">
          <h3>Balances</h3>
          {debts.length === 0 ? (
            <p className="settled-msg">All settled up!</p>
          ) : (
            <>
              {debts.map((d, i) => (
                <div key={i} className="debt-row">
                  <span className="debt-from">
                    {d.from === user?.id ? "You" : d.from_name}
                  </span>
                  <span className="debt-arrow"> owes </span>
                  <span className="debt-to">
                    {d.to === user?.id ? "You" : d.to_name}
                  </span>
                  <span className="amount amount--negative">
                    {formatPaise(d.amount)}
                  </span>
                </div>
              ))}
              <Link
                to={`/group/${groupId}/settle`}
                className="btn btn-primary settle-btn"
              >
                Settle up
              </Link>
            </>
          )}
        </div>

        {/* Members card */}
        <div className="members-card card">
          <h3>Members</h3>
          <div className="members-list">
            {members.map((m) => (
              <div key={m.id} className="member-row">
                <span className="member-name">
                  {m.id === user?.id ? "You" : m.name}
                </span>
                {m.upi_id && <span className="member-upi">{m.upi_id}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Invite form */}
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
            <button type="submit" className="btn btn-primary">
              Send invite
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
