import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { api } from "../services/api";
import { MilestoneTracker } from "../components/MilestoneTracker";
import { DisputeModal } from "../components/DisputeModal";
import { RatingModal } from "../components/RatingModal";
import { TransactionModal } from "../components/TransactionModal";
import { JobChat } from "../components/JobChat";

const STATUS_MAP = ["Open", "InProgress", "Completed", "Cancelled"];
const STATUS_BADGE_CLASSES = ["badge-open", "badge-inprogress", "badge-completed", "badge-cancelled"];

function shortenAddress(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "None";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function JobDetail() {
  const { id } = useParams();
  const jobId = parseInt(id, 10);
  const { account, contract, signer, refreshBalance } = useWeb3();

  const [job, setJob] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [hasRatedUser, setHasRatedUser] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [txModal, setTxModal] = useState({ isOpen: false, status: "idle", txHash: "", error: "" });
  const [disputeModal, setDisputeModal] = useState({ isOpen: false, milestoneIndex: 0, milestone: null });
  const [ratingModal, setRatingModal] = useState(false);

  // Fetch all authoritative on-chain data and off-chain metadata
  const loadJobData = useCallback(async () => {
    if (!contract || isNaN(jobId)) return;

    try {
      setLoading(true);

      // 1. Fetch on-chain Job struct
      const onchainJob = await contract.getJob(jobId);
      if (!onchainJob || onchainJob.client === ethers.ZeroAddress) {
        setJob(null);
        return;
      }

      // 2. Fetch on-chain Milestones
      const onchainMilestones = await contract.getMilestones(jobId);

      // 3. Fetch on-chain Rating status
      let rated = false;
      if (account) {
        try {
          rated = await contract.hasRated(jobId, account);
        } catch {
          // ignore
        }
      }

      setJob(onchainJob);
      setMilestones(onchainMilestones);
      setHasRatedUser(rated);

      // 4. Fetch off-chain metadata from MongoDB API
      try {
        const offchainData = await api.getJob(jobId);
        if (offchainData?.job?.metadata) {
          setMetadata(offchainData.job.metadata);
        }
      } catch {
        // Fallback gracefully if MongoDB is unreachable
      }
    } catch (err) {
      console.error("[JobDetail] Error fetching job data:", err);
    } finally {
      setLoading(false);
    }
  }, [contract, jobId, account]);

  useEffect(() => {
    loadJobData();
  }, [loadJobData]);

  const userRole = !account || !job
    ? "viewer"
    : account.toLowerCase() === job.client.toLowerCase()
    ? "client"
    : account.toLowerCase() === job.freelancer.toLowerCase()
    ? "freelancer"
    : "viewer";

  // Generic contract transaction executor with modal tracking
  const executeTx = async (txFunc) => {
    if (!signer) {
      alert("Please connect your wallet first");
      return;
    }

    try {
      setTxModal({ isOpen: true, status: "awaiting_signature", txHash: "", error: "" });
      const contractWithSigner = contract.connect(signer);
      const tx = await txFunc(contractWithSigner);

      setTxModal({ isOpen: true, status: "pending", txHash: tx.hash, error: "" });
      const receipt = await tx.wait(1);

      setTxModal({ isOpen: true, status: "confirmed", txHash: receipt.hash, error: "" });
      await loadJobData();
      await refreshBalance();
    } catch (err) {
      console.error("[JobDetail] Transaction failed:", err);
      const errorMsg = err.reason || err.shortMessage || err.message || "Execution reverted";
      setTxModal({ isOpen: true, status: "error", txHash: "", error: errorMsg });
    }
  };

  // Actions
  const handleCancelJob = () => {
    executeTx((c) => c.cancelJob(jobId));
  };

  const handleAcceptJob = () => {
    executeTx((c) => c.acceptJob(jobId));
  };

  const handleMilestoneAction = (action, milestoneIdx, data) => {
    if (action === "submit") {
      executeTx((c) => c.submitMilestone(jobId, milestoneIdx, data.deliverableURI));
    } else if (action === "approve") {
      executeTx((c) => c.approveMilestone(jobId, milestoneIdx));
    } else if (action === "dispute") {
      setDisputeModal({
        isOpen: true,
        milestoneIndex: milestoneIdx,
        milestone: milestones[milestoneIdx],
      });
    } else if (action === "claimTimeout") {
      executeTx((c) => c.claimAfterTimeout(jobId, milestoneIdx));
    } else if (action === "reclaim") {
      executeTx((c) => c.reclaimMilestone(jobId, milestoneIdx));
    }
  };

  const handleConfirmDispute = (milestoneIdx) => {
    setDisputeModal({ isOpen: false, milestoneIndex: 0, milestone: null });
    executeTx((c) => c.raiseDispute(jobId, milestoneIdx));
  };

  const handleConfirmRating = (score) => {
    setRatingModal(false);
    executeTx((c) => c.rate(jobId, score));
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "4rem 0", textAlign: "center", color: "var(--text-muted)" }}>
        Loading Job #{jobId} on-chain details...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container" style={{ padding: "4rem 0", textAlign: "center" }}>
        <h2>Job #{jobId} Not Found</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
          This job may not exist on the connected blockchain.
        </p>
        <Link to="/" className="btn btn-primary">
          Back to Browse Jobs
        </Link>
      </div>
    );
  }

  const statusNum = Number(job.status);
  const statusStr = STATUS_MAP[statusNum] || "Unknown";
  const statusBadge = STATUS_BADGE_CLASSES[statusNum] || "badge-open";
  const totalEth = ethers.formatEther(job.totalAmount.toString());
  const reviewPeriodDays = (Number(job.reviewPeriod) / 86400).toFixed(1);

  return (
    <div className="container" style={{ paddingBottom: "4rem" }}>
      <div style={{ marginTop: "1.5rem", marginBottom: "1rem" }}>
        <Link to="/" style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
          &larr; Back to Browse Jobs
        </Link>
      </div>

      {/* Main Header Card */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)" }}>
                Job #{jobId}
              </span>
              <span className={`status-badge ${statusBadge}`}>{statusStr}</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>
              {metadata?.title || `Escrow Contract #${jobId}`}
            </h1>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Escrow Balance</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--primary)" }}>
              {totalEth} ETH
            </div>
          </div>
        </div>

        {/* Description & Metadata */}
        {metadata?.description && (
          <p style={{ marginTop: "1rem", color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {metadata.description}
          </p>
        )}

        {metadata?.skills && metadata.skills.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            {metadata.skills.map((s, idx) => (
              <span key={idx} className="skill-tag">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Roles and Escrow Details Bar */}
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: "8px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Client</div>
            <Link to={`/profile/${job.client}`} style={{ fontWeight: 600 }}>
              {shortenAddress(job.client)}
            </Link>
          </div>

          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Assigned Freelancer</div>
            {job.freelancer !== ethers.ZeroAddress ? (
              <Link to={`/profile/${job.freelancer}`} style={{ fontWeight: 600 }}>
                {shortenAddress(job.freelancer)}
              </Link>
            ) : (
              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Unassigned</span>
            )}
          </div>

          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Client Review Window</div>
            <div style={{ fontWeight: 600 }}>{reviewPeriodDays} days</div>
          </div>

          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Contract Protocol Fee</div>
            <div style={{ fontWeight: 600, color: "var(--success)" }}>0% (Zero Fee Escrow)</div>
          </div>
        </div>

        {/* Top-level Lifecycle Actions */}
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {statusNum === 0 && userRole === "client" && (
            <button onClick={handleCancelJob} className="btn btn-danger">
              Cancel Job & Refund Escrow
            </button>
          )}

          {statusNum === 0 && userRole !== "client" && (
            <button onClick={handleAcceptJob} className="btn btn-primary">
              Accept Job & Start Milestones
            </button>
          )}

          {statusNum === 2 && (userRole === "client" || userRole === "freelancer") && !hasRatedUser && (
            <button onClick={() => setRatingModal(true)} className="btn btn-primary">
              ⭐ Rate Counterparty
            </button>
          )}
        </div>
      </div>

      {/* Milestones Section */}
      <MilestoneTracker
        jobId={jobId}
        job={job}
        milestones={milestones}
        userRole={userRole}
        onAction={handleMilestoneAction}
      />

      {/* Embedded Job Chat */}
      <JobChat
        onchainId={jobId}
        clientAddress={job.client}
        freelancerAddress={job.freelancer}
      />

      {/* Modals */}
      <DisputeModal
        isOpen={disputeModal.isOpen}
        jobId={jobId}
        milestoneIndex={disputeModal.milestoneIndex}
        milestone={disputeModal.milestone}
        onConfirm={handleConfirmDispute}
        onClose={() => setDisputeModal({ isOpen: false, milestoneIndex: 0, milestone: null })}
      />

      <RatingModal
        isOpen={ratingModal}
        jobId={jobId}
        targetRole={userRole === "client" ? "freelancer" : "client"}
        onConfirm={handleConfirmRating}
        onClose={() => setRatingModal(false)}
      />

      <TransactionModal
        isOpen={txModal.isOpen}
        status={txModal.status}
        txHash={txModal.txHash}
        error={txModal.error}
        onClose={() => setTxModal({ isOpen: false, status: "idle", txHash: "", error: "" })}
      />
    </div>
  );
}
