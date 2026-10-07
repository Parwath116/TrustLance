import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { api } from "../services/api";

export function NotificationsPage() {
  const { account, connect } = useWeb3();
  const { isAuthenticated, signIn, isSigningIn } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await api.getNotifications();
      if (res && Array.isArray(res.notifications)) {
        setNotifications(res.notifications);
      }
    } catch (err) {
      console.error("[Notifications] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("[Notifications] Mark read error:", err);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      try {
        await api.markNotificationRead(n._id);
      } catch {
        // ignore
      }
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (!account) {
    return (
      <div className="container" style={{ padding: "5rem 0", textAlign: "center" }}>
        <h2>Wallet Not Connected</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
          Connect your Ethereum wallet to view activity notifications and contract alerts.
        </p>
        <button onClick={connect} className="btn btn-primary">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: "5rem 0", textAlign: "center" }}>
        <h2>Sign In Required</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
          Sign the cryptographic authentication challenge to view your secure off-chain alerts.
        </p>
        <button onClick={signIn} disabled={isSigningIn} className="btn btn-primary">
          {isSigningIn ? "Signing..." : "Sign In with Ethereum"}
        </button>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="container" style={{ maxWidth: 760, paddingBottom: "4rem" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Real-time alerts for milestone submissions, approvals, and dispute updates.</p>
        </div>

        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="btn btn-outline btn-sm">
            Mark All as Read
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)" }}>
          Loading your notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🔔</div>
          <h3>No Notifications Yet</h3>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
            You will receive updates here whenever there is activity on your contracts.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {notifications.map((n) => (
            <div
              key={n._id}
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1rem",
                background: n.read ? "#ffffff" : "#f0f7ff",
                borderLeft: n.read ? "1px solid var(--border)" : "4px solid var(--primary)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.45rem",
                      background: "#e2e8f0",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                    }}
                  >
                    {n.type || "Event"}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: "0.95rem", color: "var(--text-main)", marginTop: "0.25rem" }}>
                  {n.message}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {n.onchainId && (
                  <Link to={`/jobs/${n.onchainId}`} className="btn btn-outline btn-sm">
                    View Job #{n.onchainId}
                  </Link>
                )}
                {!n.read && (
                  <button
                    onClick={() => handleMarkAsRead(n._id)}
                    className="btn btn-secondary btn-sm"
                    title="Mark as read"
                  >
                    ✓
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
