import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { api } from "../services/api";

const STATUS_LABELS = {
  0: "Open",
  1: "InProgress",
  2: "Completed",
  3: "Cancelled",
};

const STATUS_BADGE_CLASSES = {
  0: "badge-open",
  1: "badge-inprogress",
  2: "badge-completed",
  3: "badge-cancelled",
};

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function BrowseJobs() {
  const { contract } = useWeb3();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      // Try fetching from off-chain MongoDB API first
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (searchQuery) params.search = searchQuery;

      try {
        const data = await api.getJobs(params);
        if (data && Array.isArray(data.jobs) && data.jobs.length > 0) {
          setJobs(data.jobs);
          return;
        }
      } catch (apiErr) {
        console.warn("[BrowseJobs] Off-chain API query failed, falling back to on-chain:", apiErr.message);
      }

      // Fallback: Read directly from smart contract
      if (contract) {
        const total = await contract.jobCount();
        const totalNum = Number(total);
        const onchainList = [];
        const MAX_SCAN = 50;
        let scanned = 0;

        for (let i = totalNum; i >= 1 && onchainList.length < 20 && scanned < MAX_SCAN; i--, scanned++) {
          try {
            const j = await contract.getJob(i);
            const statusStr = STATUS_LABELS[Number(j.status)] || "Open";

            if (statusFilter && statusStr !== statusFilter) continue;

            onchainList.push({
              onchainId: i,
              client: j.client,
              freelancer: j.freelancer,
              totalAmount: j.totalAmount.toString(),
              status: statusStr,
              milestoneCount: Number(j.milestoneCount),
              metadata: {
                title: `TrustLance Job #${i}`,
                category: "Smart Contracts",
                skills: ["Solidity", "Web3"],
              },
            });
          } catch {
            // Ignore error for missing job
          }
        }
        setJobs(onchainList);
      }
    } catch (err) {
      console.error("[BrowseJobs] Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  }, [contract, statusFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="container" style={{ paddingBottom: "3rem" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Explore Freelance Escrow Jobs</h1>
          <p className="page-subtitle">
            Secure, zero-fee milestones with autonomous on-chain escrow protection.
          </p>
        </div>
        <Link to="/jobs/new" className="btn btn-primary">
          + Post a New Job
        </Link>
      </div>

      {/* Filters and Search Bar */}
      <div className="card" style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "2 1 200px" }}>
            <input
              type="text"
              placeholder="Search by title or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
            />
          </div>

          <div style={{ flex: "1 1 150px" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="InProgress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div style={{ flex: "1 1 150px" }}>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All Categories</option>
              <option value="Smart Contracts">Smart Contracts</option>
              <option value="Frontend Development">Frontend Development</option>
              <option value="Backend Development">Backend Development</option>
              <option value="Security Audit">Security Audit</option>
              <option value="Design">Design</option>
            </select>
          </div>

          <button onClick={fetchJobs} className="btn btn-secondary">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Job Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)" }}>
          Loading available jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <h3>No jobs found matching your criteria.</h3>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
            Be the first to post a new milestone-funded project!
          </p>
          <Link to="/jobs/new" className="btn btn-primary">
            Create Job
          </Link>
        </div>
      ) : (
        <div className="grid-jobs">
          {jobs.map((job) => {
            const ethAmount = ethers.formatEther(job.totalAmount || "0");
            const statusClass =
              STATUS_BADGE_CLASSES[
                job.status === "Open"
                  ? 0
                  : job.status === "InProgress"
                  ? 1
                  : job.status === "Completed"
                  ? 2
                  : 3
              ] || "badge-open";

            return (
              <div key={job.onchainId} className="job-card">
                <div>
                  <div className="job-card-header">
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>
                      Job #{job.onchainId}
                    </span>
                    <span className={`status-badge ${statusClass}`}>{job.status}</span>
                  </div>

                  <h3 className="job-card-title">
                    {job.metadata?.title || `TrustLance Job #${job.onchainId}`}
                  </h3>

                  <div className="job-card-meta" style={{ marginTop: "0.5rem" }}>
                    <span>Client: {shortenAddress(job.client)}</span>
                    <span>&bull;</span>
                    <span>{job.milestoneCount || 1} Milestones</span>
                  </div>

                  {job.metadata?.skills && job.metadata.skills.length > 0 && (
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                      {job.metadata.skills.slice(0, 3).map((skill, sIdx) => (
                        <span key={sIdx} className="skill-tag">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: "0.85rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Escrow</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)" }}>
                      {ethAmount} ETH
                    </div>
                  </div>

                  <Link to={`/jobs/${job.onchainId}`} className="btn btn-primary btn-sm">
                    View Details &rarr;
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
