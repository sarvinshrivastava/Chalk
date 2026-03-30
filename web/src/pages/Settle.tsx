import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { formatPaise } from "../lib/format";
import "./Settle.css";

interface Member {
  id: string;
  name: string;
  upi_id: string | null;
}

interface DebtEdge {
  from: string;
  to: string;
  amount: number;
}

export default function Settle() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [debts, setDebts] = useState<DebtEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const [membersRes, expensesRes] = await Promise.all([
        supabase
          .from("group_members")
          .select("user_id, users(id, name, upi_id)")
          .eq("group_id", groupId!),
        supabase
          .from("expenses")
          .select("paid_by, total_amount, expense_splits(user_id, amount_owed)")
          .eq("group_id", groupId!)
          .is("deleted_at", null),
      ]);

      const memberList = (membersRes.data ?? []).map((m: any) => m.users as Member);
      setMembers(memberList);

      // Calculate balances
      const balances = new Map<string, number>();
      const add = (id: string, amt: number) =>
        balances.set(id, (balances.get(id) ?? 0) + amt);

      for (const exp of expensesRes.data ?? []) {
        add(exp.paid_by, exp.total_amount);
        for (const s of exp.expense_splits) {
          add(s.user_id, -s.amount_owed);
        }
      }

      // Settlements
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

      // Simplify debts
      const debtors: { id: string; amount: number }[] = [];
      const creditors: { id: string; amount: number }[] = [];
      for (const [id, bal] of balances) {
        if (bal < 0) debtors.push({ id, amount: -bal });
        else if (bal > 0) creditors.push({ id, amount: bal });
      }
      debtors.sort((a, b) => b.amount - a.amount);
      creditors.sort((a, b) => b.amount - a.amount);

      const edges: DebtEdge[] = [];
      let i = 0, j = 0;
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
    fetch();
  }, [groupId]);

  const getName = (id: string) =>
    id === user?.id ? "You" : members.find((m) => m.id === id)?.name ?? "Unknown";

  const getMember = (id: string) => members.find((m) => m.id === id);

  const buildUpiLink = (payeeVpa: string, payeeName: string, paise: number) => {
    const rupees = (paise / 100).toFixed(2);
    const params = new URLSearchParams({
      pa: payeeVpa,
      pn: payeeName,
      am: rupees,
      cu: "INR",
      tn: "Chalk settlement",
    });
    return `upi://pay?${params.toString()}`;
  };

  const handleSettle = async (debt: DebtEdge) => {
    setSettling(`${debt.from}-${debt.to}`);

    // Create settlement record
    await supabase.from("settlements").insert({
      from_user: debt.from,
      to_user: debt.to,
      amount: debt.amount,
      status: "pending",
    });

    // Open UPI link
    const payee = getMember(debt.to);
    if (payee?.upi_id) {
      const link = buildUpiLink(payee.upi_id, payee.name, debt.amount);
      window.open(link, "_blank");
    }

    setSettling(null);
  };

  if (loading) return <p>Loading...</p>;

  const myDebts = debts.filter((d) => d.from === user?.id);
  const owedToMe = debts.filter((d) => d.to === user?.id);
  const otherDebts = debts.filter((d) => d.from !== user?.id && d.to !== user?.id);

  return (
    <div className="settle-page">
      <Link to={`/group/${groupId}`} className="back-link">&larr; Back</Link>
      <h2>Settle Up</h2>

      {debts.length === 0 ? (
        <div className="empty-state">All settled! No outstanding balances.</div>
      ) : (
        <>
          {myDebts.length > 0 && (
            <section className="settle-section">
              <h3>You owe</h3>
              {myDebts.map((d, i) => {
                const payee = getMember(d.to);
                return (
                  <div key={i} className="settle-card card">
                    <div className="settle-card-info">
                      <span className="settle-name">{getName(d.to)}</span>
                      <span className="amount amount--negative">
                        {formatPaise(d.amount)}
                      </span>
                    </div>
                    {payee?.upi_id ? (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: "0.9rem" }}
                        disabled={settling === `${d.from}-${d.to}`}
                        onClick={() => handleSettle(d)}
                      >
                        Pay via UPI
                      </button>
                    ) : (
                      <p className="no-upi">No UPI ID set</p>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {owedToMe.length > 0 && (
            <section className="settle-section">
              <h3>Owed to you</h3>
              {owedToMe.map((d, i) => (
                <div key={i} className="settle-card card">
                  <div className="settle-card-info">
                    <span className="settle-name">{getName(d.from)}</span>
                    <span className="amount amount--positive">
                      {formatPaise(d.amount)}
                    </span>
                  </div>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: "0.85rem" }}
                    onClick={async () => {
                      // Find pending settlement and confirm it
                      const { data } = await supabase
                        .from("settlements")
                        .select("id")
                        .eq("from_user", d.from)
                        .eq("to_user", d.to)
                        .eq("status", "pending")
                        .limit(1)
                        .single();

                      if (data) {
                        await supabase
                          .from("settlements")
                          .update({ status: "confirmed", paid_at: new Date().toISOString() })
                          .eq("id", data.id);
                        window.location.reload();
                      }
                    }}
                  >
                    Mark as received
                  </button>
                </div>
              ))}
            </section>
          )}

          {otherDebts.length > 0 && (
            <section className="settle-section">
              <h3>Other balances</h3>
              {otherDebts.map((d, i) => (
                <div key={i} className="settle-card card">
                  <div className="settle-card-info">
                    <span>{getName(d.from)} owes {getName(d.to)}</span>
                    <span className="amount">{formatPaise(d.amount)}</span>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
