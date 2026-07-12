import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/format";
import { fetchGroupDetail, createExpense } from "../lib/services";
import type { GroupMemberDetail } from "../lib/services";
import "./AddExpense.css";

export default function AddExpense() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState<GroupMemberDetail[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const { members } = await fetchGroupDetail(groupId!);
        setMembers(members);
        setSelectedMembers(new Set(members.map((m) => m.id)));
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      }
    };
    loadMembers();
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

    try {
      await createExpense({
        group_id: groupId!,
        total_amount: paise,
        description,
        split_type: "equal",
        split_with: Array.from(selectedMembers),
      });
      navigate(`/group/${groupId}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
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
          <label>Amount ({"\u20B9"})</label>
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
  return `\u20B9${perPerson} per person`;
}
