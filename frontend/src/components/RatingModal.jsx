import { useState } from "react";

export function RatingModal({ isOpen, jobId, targetRole, onConfirm, onClose }) {
  const [score, setScore] = useState(5);
  const [hoverScore, setHoverScore] = useState(0);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>
          ⭐ Rate {targetRole === "client" ? "Client" : "Freelancer"}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          Leave on-chain reputation feedback for Job #{jobId}. Scores range from 1 (poor) to 5 (excellent).
        </p>

        {/* Star selector */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.5rem", fontSize: "2rem" }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setScore(star)}
              onMouseEnter={() => setHoverScore(star)}
              onMouseLeave={() => setHoverScore(0)}
              style={{
                color: (hoverScore || score) >= star ? "#eab308" : "#cbd5e1",
                cursor: "pointer",
                transition: "transform 0.1s",
              }}
            >
              ★
            </button>
          ))}
        </div>

        <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1.5rem", color: "var(--text-main)" }}>
          {score} / 5 Stars
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(score)}
            className="btn btn-primary"
          >
            Submit On-Chain Rating
          </button>
        </div>
      </div>
    </div>
  );
}
