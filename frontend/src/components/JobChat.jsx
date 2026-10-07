import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { api } from "../services/api";

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function JobChat({ onchainId, clientAddress, freelancerAddress }) {
  const { isAuthenticated, signIn, isSigningIn } = useAuth();
  const { account } = useWeb3();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);
  const messagesEndRef = useRef(null);

  const isClient = account && clientAddress && account.toLowerCase() === clientAddress.toLowerCase();
  const isFreelancer = account && freelancerAddress && account.toLowerCase() === freelancerAddress.toLowerCase();
  const isParticipant = isClient || isFreelancer;

  // Poll messages
  useEffect(() => {
    if (!isAuthenticated || !onchainId || !isParticipant) return;

    let isMounted = true;

    async function fetchMessages() {
      try {
        const data = await api.getMessages(onchainId);
        if (isMounted && data && Array.isArray(data.messages)) {
          setMessages(data.messages);
          setChatError(null);
        }
      } catch (err) {
        if (isMounted) {
          // If error status is 403, participant restricted
          if (err.status === 403) {
            setChatError("Messaging is restricted to the client and assigned freelancer.");
          } else {
            console.warn("[JobChat] Fetch messages error:", err.message);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    setLoading(true);
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, onchainId, isParticipant]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      const res = await api.sendMessage(onchainId, newMessage.trim());
      if (res && res.message) {
        setMessages((prev) => [...prev, res.message]);
        setNewMessage("");
      }
    } catch (err) {
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  if (!isParticipant) {
    return (
      <div className="card" style={{ marginTop: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
        <h4>Job Discussion</h4>
        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
          Private job messaging is restricted to the client and assigned freelancer.
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="card" style={{ marginTop: "2rem", textAlign: "center" }}>
        <h4>Job Discussion</h4>
        <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Sign in with your Ethereum wallet to participate in the secure project discussion thread.
        </p>
        <button
          onClick={signIn}
          disabled={isSigningIn}
          className="btn btn-primary btn-sm"
          style={{ marginTop: "1rem" }}
        >
          {isSigningIn ? "Signing..." : "Sign In to Access Chat"}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1.2rem" }}>💬 Job Discussion Thread</h3>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Updates every 5s</span>
      </div>

      {chatError && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem" }}>
          {chatError}
        </div>
      )}

      {/* Message stream */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          height: "300px",
          overflowY: "auto",
          padding: "1rem",
          background: "#fafafa",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {loading && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", margin: "auto" }}>
            Loading messages...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", margin: "auto", fontSize: "0.9rem" }}>
            No messages yet. Start the conversation regarding requirements and deliverables!
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = account && msg.sender && account.toLowerCase() === msg.sender.toLowerCase();
          const senderIsClient = clientAddress && msg.sender && clientAddress.toLowerCase() === msg.sender.toLowerCase();

          return (
            <div
              key={msg._id || idx}
              style={{
                alignSelf: isMe ? "flex-end" : "flex-start",
                maxWidth: "75%",
                background: isMe ? "var(--primary)" : "#ffffff",
                color: isMe ? "#ffffff" : "var(--text-main)",
                padding: "0.6rem 0.9rem",
                borderRadius: "12px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                border: isMe ? "none" : "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  marginBottom: "0.2rem",
                  color: isMe ? "rgba(255,255,255,0.8)" : "var(--text-muted)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <span>
                  {senderIsClient ? "Client" : "Freelancer"} ({shortenAddress(msg.sender)})
                </span>
                <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div style={{ fontSize: "0.95rem", wordBreak: "break-word" }}>{msg.text}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <input
          type="text"
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="form-input"
          style={{ flex: 1 }}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim()}
          className="btn btn-primary"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
