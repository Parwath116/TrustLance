import { useState } from "react";
import { ethers } from "ethers";

const MILESTONE_STATUS_MAP = ["Pending", "Submitted", "Paid", "Refunded", "Disputed"];
const MILESTONE_BADGE_CLASS = [
  "badge-pending",
  "badge-submitted",
  "badge-paid",
  "badge-refunded",
  "badge-disputed",
];

export function MilestoneTracker({
  job,
  milestones,
  userRole,
  onAction,
}) {
  const [submittingIndex, setSubmittingIndex] = useState(null);
  const [deliverableInput, setDeliverableInput] = useState("");

  const now = Math.floor(Date.now() / 1000);
  const isJobInProgress = Number(job?.status) === 1;

  const handleSubmitDeliverable = (idx) => {
    if (!deliverableInput.trim()) return;
    onAction("submit", idx, { deliverableURI: deliverableInput.trim() });
    setSubmittingIndex(null);
    setDeliverableInput("");
  };

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h3 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Milestones ({milestones.length})</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {milestones.map((m, index) => {
          const statusNum = Number(m.status);
          const statusText = MILESTONE_STATUS_MAP[statusNum] || "Unknown";
          const badgeClass = MILESTONE_BADGE_CLASS[statusNum] || "badge-pending";

          const amountEth = ethers.formatEther(m.amount ? m.amount.toString() : "0");
          const deadlineDate = m.deadline
            ? new Date(Number(m.deadline) * 1000).toLocaleString()
            : "No deadline";

          const deadlinePassed = m.deadline && now > Number(m.deadline);
          const reviewPeriodPassed =
            m.submittedAt && job?.reviewPeriod
              ? now > Number(m.submittedAt) + Number(job.reviewPeriod)
              : false;

          return (
            <div
              key={index}
              className="card"
              style={{
                borderLeft: `4px solid ${
                  statusNum === 2
                    ? "var(--success)"
                    : statusNum === 4
                    ? "var(--dispute)"
                    : statusNum === 1
                    ? "var(--primary)"
                    : "var(--border)"
                }`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      #{index + 1}
                    </span>
                    <h4 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{m.title || `Milestone ${index + 1}`}</h4>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    <span>Deadline: {deadlineDate}</span>
                    {deadlinePassed && statusNum === 0 && (
                      <span style={{ color: "var(--danger)", marginLeft: "0.5rem", fontWeight: 600 }}>
                        (Overdue)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)" }}>
                    {amountEth} ETH
                  </div>
                  <span className={`status-badge ${badgeClass}`}>{statusText}</span>
                </div>
              </div>

              {/* Deliverable link / info */}
              {m.deliverableURI && (
                <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#f8fafc", borderRadius: "6px", fontSize: "0.85rem" }}>
                  <strong>Deliverable:</strong>{" "}
                  <a href={m.deliverableURI} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
                    {m.deliverableURI}
                  </a>
                </div>
              )}

              {/* Dispute info if active */}
              {statusNum === 4 && (
                <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--dispute-bg)", borderRadius: "6px", fontSize: "0.85rem", color: "#6b21a8" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>⚖️ Active Dispute</div>
                  <div>
                    Arbitrator Votes: {Number(m.totalVotes || 0)} cast (Freelancer: {Number(m.votesForFreelancer || 0)} vs Client: {Number(m.votesForClient || 0)})
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {isJobInProgress && (
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  {/* Freelancer actions */}
                  {userRole === "freelancer" && statusNum === 0 && submittingIndex !== index && (
                    <button
                      onClick={() => setSubmittingIndex(index)}
                      className="btn btn-primary btn-sm"
                    >
                      Submit Deliverable
                    </button>
                  )}

                  {/* Submission form */}
                  {submittingIndex === index && (
                    <div style={{ display: "flex", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
                      <input
                        type="url"
                        placeholder="https://github.com/... or IPFS / cloud URL"
                        value={deliverableInput}
                        onChange={(e) => setDeliverableInput(e.target.value)}
                        className="form-input"
                        style={{ flex: 1, padding: "0.4rem 0.6rem" }}
                      />
                      <button
                        onClick={() => handleSubmitDeliverable(index)}
                        className="btn btn-primary btn-sm"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => {
                          setSubmittingIndex(null);
                          setDeliverableInput("");
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Client actions */}
                  {userRole === "client" && statusNum === 1 && (
                    <button
                      onClick={() => onAction("approve", index)}
                      className="btn btn-success btn-sm"
                    >
                      Approve & Release {amountEth} ETH
                    </button>
                  )}

                  {userRole === "client" && statusNum === 1 && !reviewPeriodPassed && (
                    <button
                      onClick={() => onAction("dispute", index)}
                      className="btn btn-warning btn-sm"
                    >
                      Raise Dispute
                    </button>
                  )}

                  {userRole === "client" && statusNum === 0 && deadlinePassed && (
                    <button
                      onClick={() => onAction("reclaim", index)}
                      className="btn btn-danger btn-sm"
                      title="Reclaim funds after missed deadline"
                    >
                      Reclaim Escrow (Overdue)
                    </button>
                  )}

                  {/* Freelancer timeout claim */}
                  {userRole === "freelancer" && statusNum === 1 && reviewPeriodPassed && (
                    <button
                      onClick={() => onAction("claimTimeout", index)}
                      className="btn btn-success btn-sm"
                      title="Automatically release payment after client review timeout"
                    >
                      Claim Payment (Review Expired)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
