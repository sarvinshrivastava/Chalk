import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatPaise, getErrorMessage } from "../lib/format";
import {
  fetchGroupBalances,
  createSettlement,
  listSettlements,
  confirmSettlement,
} from "../lib/services";
import type { DebtEdge } from "../lib/services";
import "./Settle.css";

export default function Settle() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [debts, setDebts] = useState<DebtEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadBalances = useCallback(async () => {
    try {
      const { debts } = await fetchGroupBalances(groupId!);
      setDebts(debts);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const handleSettle = async (debt: DebtEdge) => {
    setSettling(`${debt.from}-${debt.to}`);
    setError("");

    try {
      const { upi_links } = await createSettlement(
        debt.to,
        debt.amount,
        groupId,
      );
      if (upi_links) {
        window.open(upi_links.generic, "_blank");
      }
      await loadBalances();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSettling(null);
    }
  };

  const handleConfirm = async (debt: DebtEdge) => {
    setError("");
    try {
      // Find the pending settlement for this debt pair
      const settlements = await listSettlements();
      const pending = settlements.find(
        (s) =>
          s.from_user === debt.from &&
          s.to_user === debt.to &&
          s.status === "pending",
      );

      if (!pending) {
        setError("No pending settlement found for this debt.");
        return;
      }

      await confirmSettlement(pending.id);
      await loadBalances();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  if (loading) return <p>Loading...</p>;

  const myDebts = debts.filter((d) => d.from === user?.id);
  const owedToMe = debts.filter((d) => d.to === user?.id);
  const otherDebts = debts.filter(
    (d) => d.from !== user?.id && d.to !== user?.id,
  );

  return (
    <div className="settle-page">
      <Link to={`/group/${groupId}`} className="back-link">
        &larr; Back
      </Link>
      <h2>Settle Up</h2>

      {error && <p className="error-text">{error}</p>}

      {debts.length === 0 ? (
        <div className="empty-state">All settled! No outstanding balances.</div>
      ) : (
        <>
          {myDebts.length > 0 && (
            <section className="settle-section">
              <h3>You owe</h3>
              <div className="settle-cards">
                {myDebts.map((d, i) => (
                  <div key={i} className="settle-card card">
                    <div className="settle-card-info">
                      <span className="settle-name">{d.to_name}</span>
                      <span className="amount amount--negative">
                        {formatPaise(d.amount)}
                      </span>
                    </div>
                    {d.to_upi_id ? (
                      <button
                        className="btn btn-primary"
                        disabled={settling === `${d.from}-${d.to}`}
                        onClick={() => handleSettle(d)}
                      >
                        Pay via UPI
                      </button>
                    ) : (
                      <p className="no-upi">No UPI ID set</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {owedToMe.length > 0 && (
            <section className="settle-section">
              <h3>Owed to you</h3>
              <div className="settle-cards">
                {owedToMe.map((d, i) => (
                  <div key={i} className="settle-card card">
                    <div className="settle-card-info">
                      <span className="settle-name">{d.from_name}</span>
                      <span className="amount amount--positive">
                        {formatPaise(d.amount)}
                      </span>
                    </div>
                    <button
                      className="btn btn-outline"
                      onClick={() => handleConfirm(d)}
                    >
                      Mark as received
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {otherDebts.length > 0 && (
            <section className="settle-section">
              <h3>Other balances</h3>
              <div className="settle-cards">
                {otherDebts.map((d, i) => (
                  <div key={i} className="settle-card card">
                    <div className="settle-card-info">
                      <span>
                        {d.from_name} owes {d.to_name}
                      </span>
                      <span className="amount">{formatPaise(d.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
