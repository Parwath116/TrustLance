import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { TransactionModal } from "../components/TransactionModal";

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function ArbitratorPanel() {
  const { account, contract, signer } = useWeb3();

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [panelSize, setPanelSize] = useState(3);
  const [votingPeriodSec, setVotingPeriodSec] = useState(604800);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [txModal, setTxModal] = useState({ isOpen: false, status: "idle", txHash: "", error: "" });

  const loadArbitratorData = useCallback(async () => {
    if (!contract || !account) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Check arbitrator status
      const auth = await contract.isArbitrator(account);
      setIsAuthorized(auth);

      if (auth) {
        const pSize = await contract.panelSize();
        const vPeriod = await contract.votingPeriod();
        setPanelSize(Number(pSize));
        setVotingPeriodSec(Number(vPeriod));

        // Scan all jobs for disputed milestones
        const total = await contract.jobCount();
        const totalNum = Number(total);
        const activeDisputes = [];

        for (let i = 1; i <= totalNum; i++) {
          try {
            const j = await contract.getJob(i);
            const mCount = Number(j.milestoneCount);

            for (let mIdx = 0; mIdx < mCount; mIdx++) {
              const m = await contract.getMilestone(i, mIdx);
              if (Number(m.status) === 4) {
                // MilestoneStatus.Disputed
                const voted = await contract.hasVoted(i, mIdx, account);
                activeDisputes.push({
                  jobId: i,
                  milestoneIndex: mIdx,
                  client: j.client,
                  freelancer: j.freelancer,
                  title: m.title,
                  amount: m.amount.toString(),
                  deliverableURI: m.deliverableURI,
                  disputeStartedAt: Number(m.disputeStartedAt),
                  votesForFreelancer: Number(m.votesForFreelancer),
                  votesForClient: Number(m.votesForClient),
                  totalVotes: Number(m.totalVotes),
                  hasVoted: voted,
                });
              }
            }
          } catch {
            // ignore
          }
        }

        setDisputes(activeDisputes);
      }
    } catch (err) {
      console.error("[ArbitratorPanel] Error loading dispute data:", err);
    } finally {
      setLoading(false);
    }
  }, [contract, account]);

  useEffect(() => {
    loadArbitratorData();
  }, [loadArbitratorData]);

  const executeTx = async (txFunc) => {
    if (!signer || !contract) return;
    try {
      setTxModal({ isOpen: true, status: "awaiting_signature", txHash: "", error: "" });
      const contractWithSigner = contract.connect(signer);
      const tx = await txFunc(contractWithSigner);

      setTxModal({ isOpen: true, status: "pending", txHash: tx.hash, error: "" });
      const receipt = await tx.wait(1);

      setTxModal({ isOpen: true, status: "confirmed", txHash: receipt.hash, error: "" });
      await loadArbitratorData();
    } catch (err) {
      console.error("[ArbitratorPanel] Action failed:", err);
      const errorMsg = err.reason || err.shortMessage || err.message || "Failed to execute dispute action";
      setTxModal({ isOpen: true, status: "error", txHash: "", error: errorMsg });
    }
  };

  const handleVote = (jobId, milestoneIndex, favorFreelancer) => {
    executeTx((c) => c.voteOnDispute(jobId, milestoneIndex, favorFreelancer));
  };

  const handleResolveExpired = (jobId, milestoneIndex) => {
    executeTx((c) => c.resolveExpiredDispute(jobId, milestoneIndex));
  };

  if (!account) {
    return (
      <div className="container" style={{ padding: "5rem 0", textAlign: "center" }}>
        <h2>Arbitrator Portal</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
          Please connect your Web3 wallet to access the arbitration panel.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "4rem 0", textAlign: "center", color: "var(--text-muted)" }}>
        Checking arbitrator authorization...
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="container" style={{ padding: "4rem 0" }}>
        <div className="card" style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2>Access Restricted</h2>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
            The connected address is not registered in the decentralized arbitrator registry.
          </p>
          <div style={{ background: "#f1f5f9", padding: "0.75rem", borderRadius: "6px", fontSize: "0.85rem", wordBreak: "break-all", marginBottom: "1.5rem" }}>
            <strong>Your Address:</strong> {account}
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>
            Only platform governance-whitelisted addresses can cast votes on disputed milestones.
          </p>
        </div>
      </div>
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className="container" style={{ paddingBottom: "4rem" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚖️ Arbitrator Dispute Resolution Panel</h1>
          <p className="page-subtitle">
            Quorum: {panelSize} votes &bull; Voting Period: {(votingPeriodSec / 86400).toFixed(1)} days
          </p>
        </div>
      </div>

      {disputes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎉</div>
          <h3>No Active Disputes</h3>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
            All milestone escrows are currently operating normally or have already been settled.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {disputes.map((d, idx) => {
            const ethAmount = ethers.formatEther(d.amount);
            const isOwnJob =
              account.toLowerCase() === d.client.toLowerCase() ||
              account.toLowerCase() === d.freelancer.toLowerCase();
            const expiryTime = d.disputeStartedAt + votingPeriodSec;
            const isExpired = nowSec > expiryTime;
            const remainingHours = Math.max(0, Math.floor((expiryTime - nowSec) / 3600));

            return (
              <div key={idx} className="card" style={{ borderLeft: "4px solid var(--dispute)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <span className="status-badge badge-disputed">Disputed</span>
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        Job #{d.jobId} &mdash; Milestone #{d.milestoneIndex + 1}
                      </span>
                    </div>
                    <h3 style={{ fontSize: "1.25rem" }}>{d.title}</h3>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--primary)" }}>
                      {ethAmount} ETH
                    </div>
                    <div style={{ fontSize: "0.8rem", color: isExpired ? "var(--danger)" : "var(--text-muted)" }}>
                      {isExpired ? "Voting period expired" : `${remainingHours}h remaining`}
                    </div>
                  </div>
                </div>

                {/* Counterparty addresses & Deliverable */}
                <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", background: "#f8fafc", padding: "0.75rem", borderRadius: "6px", fontSize: "0.85rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Client (Refund): </span>
                    <Link to={`/profile/${d.client}`}>{shortenAddress(d.client)}</Link>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Freelancer (Payout): </span>
                    <Link to={`/profile/${d.freelancer}`}>{shortenAddress(d.freelancer)}</Link>
                  </div>
                </div>

                {d.deliverableURI && (
                  <div style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                    <strong>Deliverable Evidence: </strong>
                    <a href={d.deliverableURI} target="_blank" rel="noreferrer">
                      {d.deliverableURI}
                    </a>
                  </div>
                )}

                {/* Vote Tally */}
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--dispute-bg)", borderRadius: "6px", fontSize: "0.9rem" }}>
                  <strong>Vote Progress:</strong> {d.totalVotes} / {panelSize} Required Votes
                  <div style={{ display: "flex", gap: "2rem", marginTop: "0.25rem" }}>
                    <span style={{ color: "var(--success)" }}>Votes for Freelancer: {d.votesForFreelancer}</span>
                    <span style={{ color: "var(--danger)" }}>Votes for Client: {d.votesForClient}</span>
                  </div>
                </div>

                {/* Voting Actions */}
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  {isOwnJob ? (
                    <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                      ⚠️ You are a party to this contract and cannot arbitrate your own job.
                    </span>
                  ) : d.hasVoted ? (
                    <span style={{ color: "var(--success)", fontWeight: 600, fontSize: "0.9rem" }}>
                      ✓ Your vote has been recorded on-chain.
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleVote(d.jobId, d.milestoneIndex, true)}
                        className="btn btn-success btn-sm"
                      >
                        Vote Freelancer (Release {ethAmount} ETH)
                      </button>
                      <button
                        onClick={() => handleVote(d.jobId, d.milestoneIndex, false)}
                        className="btn btn-danger btn-sm"
                      >
                        Vote Client (Refund {ethAmount} ETH)
                      </button>
                    </>
                  )}

                  {isExpired && (
                    <button
                      onClick={() => handleResolveExpired(d.jobId, d.milestoneIndex)}
                      className="btn btn-warning btn-sm"
                    >
                      Resolve Expired Dispute (Execute Majority / Split)
                    </button>
                  )}

                  <Link to={`/jobs/${d.jobId}`} className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }}>
                    View Full Job &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
