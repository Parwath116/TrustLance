import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function Profile() {
  const { address } = useParams();
  const targetAddress = address ? address.toLowerCase() : "";
  const { account, contract } = useWeb3();
  const { isAuthenticated, signIn, isSigningIn } = useAuth();

  const isMe = account && account.toLowerCase() === targetAddress;

  const [reputation, setReputation] = useState({ totalScore: 0, ratingCount: 0 });
  const [profile, setProfile] = useState(null);
  const [userJobs, setUserJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [editRole, setEditRole] = useState("both");
  const [saving, setSaving] = useState(false);

  const loadProfileData = useCallback(async () => {
    if (!targetAddress) return;

    try {
      setLoading(true);

      // 1. Fetch on-chain reputation
      if (contract) {
        try {
          const rep = await contract.getReputation(targetAddress);
          setReputation({
            totalScore: Number(rep.totalScore),
            ratingCount: Number(rep.ratingCount),
          });
        } catch (repErr) {
          console.warn("[Profile] Failed to fetch reputation:", repErr.message);
        }
      }

      // 2. Fetch off-chain profile from MongoDB
      try {
        const uRes = await api.getUserProfile(targetAddress);
        if (uRes?.user) {
          setProfile(uRes.user);
          setEditName(uRes.user.name || "");
          setEditBio(uRes.user.bio || "");
          setEditSkills((uRes.user.skills || []).join(", "));
          setEditRole(uRes.user.role || "both");
        }
      } catch {
        // Fallback default
        setProfile({ address: targetAddress, name: "", bio: "", skills: [], role: "both" });
      }

      // 3. Fetch user's jobs
      try {
        const cJobs = await api.getJobs({ client: targetAddress });
        const fJobs = await api.getJobs({ freelancer: targetAddress });
        const combined = [...(cJobs.jobs || []), ...(fJobs.jobs || [])];
        // Unique by onchainId
        const seen = new Set();
        const deduped = [];
        for (const j of combined) {
          if (!seen.has(j.onchainId)) {
            seen.add(j.onchainId);
            deduped.push(j);
          }
        }
        setUserJobs(deduped);
      } catch {
        // ignore
      }
    } catch (err) {
      console.error("[Profile] Error loading profile:", err);
    } finally {
      setLoading(false);
    }
  }, [targetAddress, contract]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      alert("Please sign in with Ethereum first to update your profile.");
      return;
    }

    try {
      setSaving(true);
      const updated = await api.updateUserProfile(targetAddress, {
        name: editName.trim(),
        bio: editBio.trim(),
        skills: editSkills.split(",").map((s) => s.trim()).filter(Boolean),
        role: editRole,
      });

      if (updated?.user) {
        setProfile(updated.user);
        setIsEditing(false);
      }
    } catch (err) {
      alert(`Failed to save profile: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const avgRating =
    reputation.ratingCount > 0
      ? (reputation.totalScore / reputation.ratingCount).toFixed(1)
      : null;

  return (
    <div className="container" style={{ maxWidth: 840, paddingBottom: "4rem" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Profile</h1>
          <p className="page-subtitle">On-chain reputation and verified contract history.</p>
        </div>

        {isMe && !isEditing && (
          <button
            onClick={() => {
              if (!isAuthenticated) {
                signIn();
              } else {
                setIsEditing(true);
              }
            }}
            className="btn btn-outline"
          >
            {isAuthenticated ? "✏️ Edit Profile" : "Sign In to Edit"}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)" }}>
          Loading profile data...
        </div>
      ) : (
        <>
          {/* Main Profile Info Card */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {profile?.name || (isMe ? "Anonymous User" : shortenAddress(targetAddress))}
                </h2>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem", wordBreak: "break-all" }}>
                  {targetAddress}
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <span className="skill-tag" style={{ textTransform: "capitalize" }}>
                    Role: {profile?.role || "Member"}
                  </span>
                </div>
              </div>

              {/* Reputation Metric Box */}
              <div
                style={{
                  background: "#fefce8",
                  border: "1px solid #fef08a",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "#854d0e", fontWeight: 600 }}>On-Chain Reputation</div>
                <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#ca8a04", marginTop: "0.1rem" }}>
                  {avgRating ? `${avgRating} ★` : "New (No Reviews)"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {reputation.ratingCount} Verified Reviews
                </div>
              </div>
            </div>

            {/* Bio */}
            {profile?.bio && (
              <p style={{ marginTop: "1rem", color: "#334155", lineHeight: 1.6 }}>{profile.bio}</p>
            )}

            {/* Skills */}
            {profile?.skills && profile.skills.length > 0 && (
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "1rem" }}>
                {profile.skills.map((s, idx) => (
                  <span key={idx} className="skill-tag">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Edit Form Modal/Section */}
          {isEditing && (
            <form onSubmit={handleSaveProfile} className="card" style={{ marginBottom: "1.5rem", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Edit Public Profile</h3>

              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Alice Chen"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Primary Role</label>
                <select
                  className="form-select"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="both">Both Client & Freelancer</option>
                  <option value="client">Client (Hire Talent)</option>
                  <option value="freelancer">Freelancer (Work on Contracts)</option>
                  <option value="arbitrator">Arbitrator</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Skills (comma-separated)</label>
                <input
                  type="text"
                  className="form-input"
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value)}
                  placeholder="Solidity, React, Node.js, Cryptography"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Bio / Background</label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell clients and collaborators about your expertise and portfolio..."
                  maxLength={1000}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || isSigningIn}
                  className="btn btn-primary btn-sm"
                >
                  {saving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          )}

          {/* Job History */}
          <div className="card">
            <h3 style={{ fontSize: "1.15rem", marginBottom: "1rem" }}>Contract & Project History</h3>

            {userJobs.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No past contracts recorded for this address.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {userJobs.map((j) => (
                  <div
                    key={j.onchainId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {j.metadata?.title || `Contract #${j.onchainId}`}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Status: {j.status} &bull; Escrow: {ethers.formatEther(j.totalAmount || "0")} ETH
                      </div>
                    </div>

                    <Link to={`/jobs/${j.onchainId}`} className="btn btn-outline btn-sm">
                      View &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
