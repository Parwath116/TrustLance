import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, useConfig } from "./context/ConfigContext";
import { Web3Provider, useWeb3 } from "./context/Web3Context";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { BrowseJobs } from "./pages/BrowseJobs";
import { JobDetail } from "./pages/JobDetail";
import { CreateJob } from "./pages/CreateJob";
import { Dashboard } from "./pages/Dashboard";
import { ArbitratorPanel } from "./pages/ArbitratorPanel";
import { Profile } from "./pages/Profile";
import { NotificationsPage } from "./pages/NotificationsPage";

function NetworkBanner() {
  const config = useConfig();
  const { account, chainId, isCorrectNetwork, switchNetwork } = useWeb3();

  if (!account || isCorrectNetwork) return null;

  const targetName =
    Number(config.chainId) === 11155111
      ? "Sepolia Testnet"
      : Number(config.chainId) === 31337
      ? "Hardhat Localhost"
      : `Chain ${config.chainId}`;

  return (
    <div
      style={{
        background: "#fef3c7",
        borderBottom: "1px solid #fde68a",
        color: "#92400e",
        padding: "0.6rem 1rem",
        textAlign: "center",
        fontSize: "0.9rem",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <span>
        ⚠️ Connected to Chain ID {chainId}. TrustLance requires <strong>{targetName}</strong> (Chain ID: {config.chainId}).
      </span>
      <button
        onClick={switchNetwork}
        style={{
          background: "#d97706",
          color: "white",
          border: "none",
          padding: "0.25rem 0.65rem",
          borderRadius: "4px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Switch Network
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: "auto",
        borderTop: "1px solid var(--border)",
        background: "#ffffff",
        padding: "1.5rem 0",
        textAlign: "center",
        fontSize: "0.85rem",
        color: "var(--text-muted)",
      }}
    >
      <div className="container">
        <p>
          <strong>TrustLance</strong> &mdash; Decentralized Freelance Marketplace with Milestone Escrow & On-Chain Arbitration
        </p>
        <p style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
          Solidity 0.8.24 &bull; OpenZeppelin v5 &bull; Zero-Fee Architecture
        </p>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <ConfigProvider>
      <Web3Provider>
        <AuthProvider>
          <BrowserRouter>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
              <Navbar />
              <NetworkBanner />
              <main style={{ flex: 1 }}>
                <Routes>
                  <Route path="/" element={<BrowseJobs />} />
                  <Route path="/jobs" element={<Navigate to="/" replace />} />
                  <Route path="/jobs/new" element={<CreateJob />} />
                  <Route path="/jobs/:id" element={<JobDetail />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/disputes" element={<ArbitratorPanel />} />
                  <Route path="/profile/:address" element={<Profile />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </AuthProvider>
      </Web3Provider>
    </ConfigProvider>
  );
}

export default App;
