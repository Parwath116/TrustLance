import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { api } from "../services/api";

const STATUS_MAP = ["Open", "InProgress", "Completed", "Cancelled"];
const STATUS_BADGE_CLASSES = ["badge-open", "badge-inprogress", "badge-completed", "badge-cancelled"];

export function Dashboard() {
  const { account, contract, connect, isConnecting } = useWeb3();

  const [activeTab, setActiveTab] = useState("client"); // "client" | "freelancer"
  const [clientJobs, setClientJobs] = useState([]);
  const [freelancerJobs, setFreelancerJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    if (!account || !contract) return;

    try {
      setLoading(true);

      // Try fetching from backend API first
      let cJobs = [];
      let fJobs = [];

      try {
        const cRes = await api.getJobs({ client: account });
        const fRes = await api.getJobs({ freelancer: account });
        cJobs = cRes.jobs || [];
        fJobs = fRes.jobs || [];
      } catch (err) {
        console.warn("[Dashboard] Off-chain fetch failed, falling back to on-chain scan:", err.message);
      }

      // Fallback: Read on-chain jobs
      if (cJobs.length === 0 && fJobs.length === 0) {
        const total = await contract.jobCount();
        const totalNum = Number(total);

        for (let i = 1; i <= totalNum; i++) {
          try {
            const j = await contract.getJob(i);
            const isClient = j.client.toLowerCase() === account.toLowerCase();
            const isFreelancer = j.freelancer.toLowerCase() === account.toLowerCase();

            if (isClient || isFreelancer) {
              const jobItem = {
                onchainId: i,
                client: j.client,
                freelancer: j.freelancer,
                totalAmount: j.totalAmount.toString(),
                status: STATUS_MAP[Number(j.status)] || "Open",
                milestoneCount: Number(j.milestoneCount),
                metadata: { title: `TrustLance Job #${i}` },
              };
              if (isClient) cJobs.push(jobItem);
              if (isFreelancer) fJobs.push(jobItem);
            }
          } catch {
            // ignore
          }
        }
      }

      setClientJobs(cJobs);
      setFreelancerJobs(fJobs);
    } catch (err) {
      console.error("[Dashboard] Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [account, contract]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (!account) {
    return (
      <div className="container" style={{ padding: "5rem 0", textAlign: "center" }}>
        <h2>Connect Your Wallet</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
          Please connect your Web3 wallet to access your project dashboard, escrow transactions, and milestone tracking.
        </p>
        <button onClick={connect} disabled={isConnecting} className="btn btn-primary">
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>
    );
  }

  // Compute metrics
  const totalSpentWei = clientJobs
    .filter((j) => j.status === "Completed" || j.status === "InProgress")
    .reduce((acc, j) => acc + BigInt(j.totalAmount || 0), 0n);

  const totalEarnedWei = freelancerJobs
    .filter((j) => j.status === "Completed")
    .reduce((acc, j) => acc + BigInt(j.totalAmount || 0), 0n);

  const activeJobsCount = [...clientJobs, ...freelancerJobs].filter(
    (j) => j.status === "InProgress" || j.status === "Open"
  ).length;

  const completedJobsCount = [...clientJobs, ...freelancerJobs].filter(
    (j) => j.status === "Completed"
  ).length;

  const currentList = activeTab === "client" ? clientJobs : freelancerJobs;

  return (
    <div className="container" style={{ paddingBottom: "4rem" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Personal Escrow Dashboard</h1>
          <p className="page-subtitle">
            Manage your contracts, oversee milestone approvals, and track funds.
          </p>
        </div>
        <Link to="/jobs/new" className="btn btn-primary">
          + Post a New Job
        </Link>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div className="card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Total Escrow Funded</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--primary)", marginTop: "0.25rem" }}>
            {ethers.formatEther(totalSpentWei)} ETH
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Total Freelance Earnings</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--success)", marginTop: "0.25rem" }}>
            {ethers.formatEther(totalEarnedWei)} ETH
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Active Contracts</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--warning)", marginTop: "0.25rem" }}>
            {activeJobsCount}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Completed Contracts</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-main)", marginTop: "0.25rem" }}>
            {completedJobsCount}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setActiveTab("client")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            fontSize: "1rem",
            color: activeTab === "client" ? "var(--primary)" : "var(--secondary)",
            borderBottom: activeTab === "client" ? "2px solid var(--primary)" : "none",
          }}
        >
          Jobs I Created ({clientJobs.length})
        </button>

        <button
          onClick={() => setActiveTab("freelancer")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            fontSize: "1rem",
            color: activeTab === "freelancer" ? "var(--primary)" : "var(--secondary)",
            borderBottom: activeTab === "freelancer" ? "2px solid var(--primary)" : "none",
          }}
        >
          Jobs I am Working On ({freelancerJobs.length})
        </button>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)" }}>
          Loading your dashboard contracts...
        </div>
      ) : currentList.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <h4>No {activeTab === "client" ? "client contracts" : "freelancer jobs"} found.</h4>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1rem" }}>
            {activeTab === "client"
              ? "You haven't posted any jobs yet. Post a job to hire talent with escrow protection!"
              : "You haven't accepted any jobs yet. Browse open jobs to find projects!"}
          </p>
          <Link to={activeTab === "client" ? "/jobs/new" : "/"} className="btn btn-primary btn-sm">
            {activeTab === "client" ? "Post a Job" : "Browse Jobs"}
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {currentList.map((job) => {
            const ethAmount = ethers.formatEther(job.totalAmount || "0");
            const statusIdx =
              job.status === "Open"
                ? 0
                : job.status === "InProgress"
                ? 1
                : job.status === "Completed"
                ? 2
                : 3;
            const statusBadge = STATUS_BADGE_CLASSES[statusIdx] || "badge-open";

            return (
              <div key={job.onchainId} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Job #{job.onchainId}
                    </span>
                    <span className={`status-badge ${statusBadge}`}>{job.status}</span>
                  </div>
                  <h3 style={{ fontSize: "1.15rem" }}>
                    {job.metadata?.title || `Escrow Contract #${job.onchainId}`}
                  </h3>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {job.milestoneCount || 1} Milestones &bull; Escrow: {ethAmount} ETH
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <Link to={`/jobs/${job.onchainId}`} className="btn btn-outline btn-sm">
                    Manage Milestones &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
