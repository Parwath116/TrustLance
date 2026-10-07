import { useConfig } from "../context/ConfigContext";

export function TransactionModal({ isOpen, status, txHash, error, onClose }) {
  const config = useConfig();
  if (!isOpen) return null;

  const isSepolia = config.chainId === 11155111;
  const explorerUrl = isSepolia && txHash
    ? `https://sepolia.etherscan.io/tx/${txHash}`
    : null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: "center" }}>
        {status === "awaiting_signature" && (
          <div>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✍️</div>
            <h3 style={{ marginBottom: "0.5rem" }}>Signature Required</h3>
            <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
              Please confirm the transaction in your Ethereum wallet (MetaMask).
            </p>
          </div>
        )}

        {status === "pending" && (
          <div>
            <div style={{ fontSize: "3rem", marginBottom: "1rem", animation: "spin 2s linear infinite" }}>🔄</div>
            <h3 style={{ marginBottom: "0.5rem" }}>Transaction Pending</h3>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
              Awaiting block confirmation on chain ID {config.chainId}...
            </p>
            {txHash && (
              <div style={{ background: "#f1f5f9", padding: "0.75rem", borderRadius: "6px", wordBreak: "break-all", fontSize: "0.85rem", marginBottom: "1rem" }}>
                <strong>Tx Hash:</strong> {txHash}
              </div>
            )}
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm"
                style={{ marginBottom: "1rem" }}
              >
                View on Etherscan ↗
              </a>
            )}
          </div>
        )}

        {status === "confirmed" && (
          <div>
            <div style={{ fontSize: "3rem", marginBottom: "1rem", color: "var(--success)" }}>✅</div>
            <h3 style={{ marginBottom: "0.5rem", color: "var(--success)" }}>Transaction Confirmed!</h3>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
              Your transaction was successfully executed and mined on-chain.
            </p>
            {txHash && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.75rem", borderRadius: "6px", wordBreak: "break-all", fontSize: "0.85rem", marginBottom: "1rem" }}>
                <strong>Tx Hash:</strong> {txHash}
              </div>
            )}
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm"
                style={{ marginBottom: "1rem", display: "inline-block" }}
              >
                View on Etherscan ↗
              </a>
            )}
            <div>
              <button onClick={onClose} className="btn btn-primary" style={{ minWidth: 120 }}>
                Close
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div>
            <div style={{ fontSize: "3rem", marginBottom: "1rem", color: "var(--danger)" }}>⚠️</div>
            <h3 style={{ marginBottom: "0.5rem", color: "var(--danger)" }}>Transaction Failed</h3>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "0.75rem", borderRadius: "6px", color: "#991b1b", fontSize: "0.85rem", marginBottom: "1.5rem", textAlign: "left", maxHeight: "150px", overflowY: "auto" }}>
              {error || "An unexpected error occurred during execution."}
            </div>
            <div>
              <button onClick={onClose} className="btn btn-secondary" style={{ minWidth: 120 }}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
