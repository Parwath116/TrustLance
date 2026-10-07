import { useState, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { useConfig } from "../context/ConfigContext";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function Navbar() {
  const config = useConfig();
  const {
    account,
    chainId,
    balance,
    isCorrectNetwork,
    connect,
    disconnect,
    switchNetwork,
    isConnecting,
  } = useWeb3();

  const { isAuthenticated, signIn, isSigningIn, signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread notifications if authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }

    let isMounted = true;
    async function fetchUnread() {
      try {
        const data = await api.getNotifications();
        if (isMounted && data && Array.isArray(data.notifications)) {
          const unread = data.notifications.filter((n) => !n.read).length;
          setUnreadCount(unread);
        }
      } catch {
        // Silently catch in polling
      }
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const networkName =
    Number(config.chainId) === 11155111
      ? "Sepolia"
      : Number(config.chainId) === 31337
      ? "Hardhat"
      : `Chain ${config.chainId}`;

  return (
    <nav className="navbar">
      <div className="container nav-content">
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <Link to="/" className="brand">
            <span style={{ fontSize: "1.4rem" }}>🛡️</span>
            <span>TrustLance</span>
            <span className="brand-badge">BCS786</span>
          </Link>

          <ul className="nav-links">
            <li>
              <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
                Browse Jobs
              </NavLink>
            </li>
            <li>
              <NavLink to="/jobs/new" className={({ isActive }) => (isActive ? "active" : "")}>
                Post a Job
              </NavLink>
            </li>
            <li>
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/disputes" className={({ isActive }) => (isActive ? "active" : "")}>
                Disputes
              </NavLink>
            </li>
            {account && (
              <li>
                <NavLink to="/notifications" className={({ isActive }) => (isActive ? "active" : "")}>
                  Notifications
                  {unreadCount > 0 && (
                    <span
                      style={{
                        marginLeft: "0.35rem",
                        background: "var(--danger)",
                        color: "white",
                        borderRadius: "9999px",
                        padding: "0.1rem 0.45rem",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </NavLink>
              </li>
            )}
          </ul>
        </div>

        <div className="nav-actions">
          {/* Network Indicator */}
          {account && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {isCorrectNetwork ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.85rem",
                    padding: "0.25rem 0.6rem",
                    background: "var(--success-bg)",
                    color: "var(--success)",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 600,
                  }}
                >
                  <span style={{ height: 8, width: 8, borderRadius: "50%", background: "var(--success)" }} />
                  {networkName}
                </div>
              ) : (
                <button
                  onClick={switchNetwork}
                  className="btn btn-warning btn-sm"
                  title={`Switch from chain ${chainId} to ${config.chainId}`}
                >
                  ⚠️ Switch to {networkName}
                </button>
              )}
            </div>
          )}

          {/* Wallet and Auth state */}
          {!account ? (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="btn btn-primary"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {/* Profile Link with Address and Balance */}
              <Link
                to={`/profile/${account}`}
                className="btn btn-outline btn-sm"
                title="View your profile"
              >
                <span style={{ fontWeight: 600 }}>{shortenAddress(account)}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.25rem" }}>
                  ({parseFloat(balance).toFixed(3)} ETH)
                </span>
              </Link>

              {/* Sign In / Signed In Status */}
              {!isAuthenticated ? (
                <button
                  onClick={signIn}
                  disabled={isSigningIn}
                  className="btn btn-primary btn-sm"
                  title="Sign in with Ethereum signature to access chat & notifications"
                >
                  {isSigningIn ? "Signing..." : "Sign In"}
                </button>
              ) : (
                <button
                  onClick={signOut}
                  className="btn btn-secondary btn-sm"
                  title="Sign out of off-chain session"
                >
                  Sign Out
                </button>
              )}

              {/* Disconnect */}
              <button
                onClick={disconnect}
                className="btn btn-secondary btn-sm"
                title="Disconnect wallet"
                style={{ padding: "0.35rem 0.5rem" }}
              >
                ⏏
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
