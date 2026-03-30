import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import "./AddExpense.css";

interface Member {
  id: string;
  name: string;
}

export default function AddExpense() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState<Member[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, users(id, name)")
        .eq("group_id", groupId!);

      const list = (data ?? []).map((m: any) => m.users as Member);
      setMembers(list);
      // Select all members by default
      setSelectedMembers(new Set(list.map((m: Member) => m.id)));
    };
    fetchMembers();
  }, [groupId]);

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const rupees = parseFloat(amount);
    if (isNaN(rupees) || rupees <= 0) {
      setError("Enter a valid amount");
      return;
    }

    if (selectedMembers.size === 0) {
      setError("Select at least one person to split with");
      return;
    }

    setLoading(true);
    const paise = Math.round(rupees * 100);
    const splitWith = Array.from(selectedMembers);

    // Equal split calculation (handle remainder)
    const base = Math.floor(paise / splitWith.length);
    const remainder = paise - base * splitWith.length;

    // Create expense
    const { data: expense, error: expErr } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId!,
        paid_by: user!.id,
        total_amount: paise,
        description,
        split_type: "equal",
      })
      .select()
      .single();

    if (expErr || !expense) {
      setError(expErr?.message ?? "Failed to create expense");
      setLoading(false);
      return;
    }

    // Create splits
    const splits = splitWith.map((userId, i) => ({
      expense_id: expense.id,
      user_id: userId,
      amount_owed: base + (i < remainder ? 1 : 0),
    }));

    const { error: splitErr } = await supabase
      .from("expense_splits")
      .insert(splits);

    if (splitErr) {
      setError(splitErr.message);
      setLoading(false);
      return;
    }

    navigate(`/group/${groupId}`);
  };

  return (
    <div className="add-expense">
      <h2>Add Expense</h2>
      <form onSubmit={handleSubmit} className="expense-form">
        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dinner at Meghana Foods"
            required
          />
        </div>

        <div className="form-group">
          <label>Amount (₹)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            required
          />
        </div>

        <div className="split-section">
          <label>Split equally with</label>
          <div className="member-chips">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`member-chip ${selectedMembers.has(m.id) ? "selected" : ""}`}
                onClick={() => toggleMember(m.id)}
              >
                {m.id === user?.id ? "You" : m.name}
              </button>
            ))}
          </div>
          {selectedMembers.size > 0 && amount && (
            <p className="split-preview">
              {formatSplitPreview(parseFloat(amount), selectedMembers.size)}
            </p>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="expense-form-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(`/group/${groupId}`)}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Adding..." : "Add expense"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatSplitPreview(rupees: number, count: number): string {
  if (count === 0 || isNaN(rupees)) return "";
  const perPerson = (rupees / count).toFixed(2);
  return `₹${perPerson} per person`;
}
