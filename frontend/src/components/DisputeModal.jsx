import { useState } from "react";

export function DisputeModal({
  isOpen,
  jobId,
  milestoneIndex,
  milestone,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(milestoneIndex, reason);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 style={{ fontSize: "1.3rem", color: "var(--dispute)", marginBottom: "0.5rem" }}>
          ⚖️ Raise Dispute on Milestone #{milestoneIndex + 1}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
          Job #{jobId} &mdash; <strong>{milestone?.title || `Milestone ${milestoneIndex + 1}`}</strong>
        </p>

        <div style={{ background: "var(--dispute-bg)", border: "1px solid #e9d5ff", padding: "1rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.85rem", color: "#6b21a8" }}>
          <strong>How Disputes Work:</strong>
          <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem", lineHeight: "1.4" }}>
            <li>Escrow funds for this milestone will remain locked on-chain.</li>
            <li>Authorized platform arbitrators will cast binding votes.</li>
            <li>If a majority rules in your favor, escrow is settled immediately.</li>
          </ul>
        </div>

        <div className="form-group">
          <label className="form-label">Reason / Context (Optional description for the chat log)</label>
          <textarea
            className="form-textarea"
            rows="3"
            placeholder="Explain why the deliverable does not satisfy agreed milestone criteria..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-warning"
            style={{ background: "var(--dispute)", color: "white" }}
          >
            Confirm & Raise On-Chain Dispute
          </button>
        </div>
      </div>
    </div>
  );
}
