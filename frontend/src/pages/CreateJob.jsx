import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { api } from "../services/api";
import { TransactionModal } from "../components/TransactionModal";

export function CreateJob() {
  const navigate = useNavigate();
  const { account, signer, contract, refreshBalance } = useWeb3();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Smart Contracts");
  const [skills, setSkills] = useState("Solidity, Web3, React");
  const [description, setDescription] = useState("");
  const [reviewPeriodDays, setReviewPeriodDays] = useState(7);

  // Dynamic milestones
  const defaultDeadline = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 16);
  const [milestones, setMilestones] = useState([
    { title: "Milestone 1: Prototype Implementation", amount: "0.1", deadline: defaultDeadline },
  ]);

  const [txModal, setTxModal] = useState({ isOpen: false, status: "idle", txHash: "", error: "" });
  const [submitting, setSubmitting] = useState(false);

  // Milestone management
  const addMilestone = () => {
    if (milestones.length >= 10) {
      alert("Maximum 10 milestones allowed per job.");
      return;
    }
    const lastDeadlineMs = milestones.length > 0
      ? new Date(milestones[milestones.length - 1].deadline).getTime()
      : Date.now();
    const nextDeadline = new Date(lastDeadlineMs + 7 * 86400 * 1000).toISOString().slice(0, 16);

    setMilestones((prev) => [
      ...prev,
      {
        title: `Milestone ${prev.length + 1}: Final Deliverables`,
        amount: "0.1",
        deadline: nextDeadline,
      },
    ]);
  };

  const removeMilestone = (index) => {
    if (milestones.length <= 1) {
      alert("A job must have at least one milestone.");
      return;
    }
    setMilestones((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateMilestone = (index, field, value) => {
    setMilestones((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Calculate total budget in ETH
  const totalBudgetEth = milestones.reduce((sum, m) => {
    const amt = parseFloat(m.amount) || 0;
    return sum + amt;
  }, 0).toFixed(4);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!account || !signer || !contract) {
      alert("Please connect your wallet first.");
      return;
    }

    // Validation
    if (!title.trim()) {
      alert("Please enter a job title.");
      return;
    }
    if (!description.trim()) {
      alert("Please enter a project description.");
      return;
    }
    if (milestones.length === 0) {
      alert("At least one milestone is required.");
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const titles = [];
    const amountsWei = [];
    const deadlinesUnix = [];
    let lastDeadline = nowSec;

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m.title.trim()) {
        alert(`Milestone #${i + 1} must have a title.`);
        return;
      }
      if (m.title.length > 100) {
        alert(`Milestone #${i + 1} title is too long (max 100 chars).`);
        return;
      }

      const amtNum = parseFloat(m.amount);
      if (isNaN(amtNum) || amtNum <= 0) {
        alert(`Milestone #${i + 1} must have an amount greater than 0 ETH.`);
        return;
      }

      const deadlineSec = Math.floor(new Date(m.deadline).getTime() / 1000);
      if (deadlineSec <= lastDeadline) {
        alert(
          `Milestone #${i + 1} deadline must be strictly later than ${
            i === 0 ? "current time" : `Milestone #${i} deadline`
          }.`
        );
        return;
      }

      titles.push(m.title.trim());
      amountsWei.push(ethers.parseEther(m.amount.toString()));
      deadlinesUnix.push(deadlineSec);
      lastDeadline = deadlineSec;
    }

    const reviewPeriodSec = Math.max(86400, Math.floor(Number(reviewPeriodDays) * 86400));
    const totalWei = amountsWei.reduce((acc, v) => acc + v, 0n);

    // Prepare JSON metadata document
    const metadataObj = {
      title: title.trim(),
      description: description.trim(),
      category: category,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      milestones: milestones.map((m) => ({ title: m.title.trim(), amount: m.amount })),
    };
    const metadataRaw = JSON.stringify(metadataObj);
    const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(metadataRaw));

    try {
      setSubmitting(true);
      setTxModal({ isOpen: true, status: "awaiting_signature", txHash: "", error: "" });

      // Call smart contract createJob with escrow value
      const contractWithSigner = contract.connect(signer);
      const tx = await contractWithSigner.createJob(
        metadataHash,
        titles,
        amountsWei,
        deadlinesUnix,
        reviewPeriodSec,
        { value: totalWei }
      );

      setTxModal({ isOpen: true, status: "pending", txHash: tx.hash, error: "" });
      const receipt = await tx.wait(1);

      // Extract jobId from JobCreated event
      let createdJobId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === "JobCreated") {
            createdJobId = Number(parsed.args.jobId);
            break;
          }
        } catch {
          // not this event
        }
      }

      setTxModal({ isOpen: true, status: "confirmed", txHash: receipt.hash, error: "" });
      await refreshBalance();

      // Post metadata to backend if jobId was parsed (retry up to 5 times for indexer catch-up)
      if (createdJobId) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await api.uploadJobMetadata(createdJobId, metadataRaw);
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }

      // Navigate to job detail page
      setTimeout(() => {
        if (createdJobId) {
          navigate(`/jobs/${createdJobId}`);
        } else {
          navigate("/");
        }
      }, 1500);
    } catch (err) {
      console.error("[CreateJob] Failed to create job:", err);
      const errorMsg = err.reason || err.shortMessage || err.message || "Failed to create job";
      setTxModal({ isOpen: true, status: "error", txHash: "", error: errorMsg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 840, paddingBottom: "4rem" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Post a Milestone-Funded Job</h1>
          <p className="page-subtitle">
            Escrow your ETH safely. Funds are released strictly upon milestone verification.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card">
        {/* Basic Details */}
        <h3 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>1. Job Overview</h3>

        <div className="form-group">
          <label className="form-label">Job Title *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Build Decentralized Staking Protocol"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Smart Contracts">Smart Contracts</option>
              <option value="Frontend Development">Frontend Development</option>
              <option value="Backend Development">Backend Development</option>
              <option value="Security Audit">Security Audit</option>
              <option value="Design">Design</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Client Review Window (Days)</label>
            <input
              type="number"
              className="form-input"
              min="1"
              max="30"
              value={reviewPeriodDays}
              onChange={(e) => setReviewPeriodDays(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Required Skills (comma-separated)</label>
          <input
            type="text"
            className="form-input"
            placeholder="Solidity, React, Hardhat, ethers.js"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Detailed Project Scope & Requirements *</label>
          <textarea
            className="form-textarea"
            rows="5"
            placeholder="Describe deliverables, architecture requirements, repositories, and testing expectations..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        {/* Milestone Builder */}
        <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.2rem" }}>2. Milestones & Escrow Budget</h3>
            <button
              type="button"
              onClick={addMilestone}
              className="btn btn-secondary btn-sm"
              disabled={milestones.length >= 10}
            >
              + Add Milestone
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {milestones.map((m, idx) => (
              <div
                key={idx}
                style={{
                  background: "#f8fafc",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Milestone #{idx + 1}</span>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(idx)}
                      style={{ color: "var(--danger)", fontSize: "0.85rem", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Milestone Title (e.g. Smart contract test suite)"
                    value={m.title}
                    onChange={(e) => updateMilestone(idx, "title", e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>
                      Amount (ETH) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      className="form-input"
                      value={m.amount}
                      onChange={(e) => updateMilestone(idx, "amount", e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>
                      Target Deadline *
                    </label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={m.deadline}
                      onChange={(e) => updateMilestone(idx, "deadline", e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total Escrow Summary and Submit */}
        <div
          style={{
            marginTop: "2rem",
            padding: "1.25rem",
            background: "var(--primary-light)",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>Total Escrow Deposit</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary)" }}>
              {totalBudgetEth} ETH
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !account}
            className="btn btn-primary"
            style={{ padding: "0.75rem 2rem", fontSize: "1.05rem" }}
          >
            {submitting ? "Funding Escrow..." : "Deposit Escrow & Create Job"}
          </button>
        </div>
      </form>

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
