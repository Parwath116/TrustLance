import { createContext, useContext, useEffect, useState } from "react";

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadConfig() {
      try {
        setLoading(true);
        // Fetch runtime config with cache-busting query parameter
        const res = await fetch(`/config.json?t=${Date.now()}`);
        if (!res.ok) {
          throw new Error(`Failed to load config.json (HTTP ${res.status})`);
        }
        const data = await res.json();

        if (!data.contractAddress || !data.abi || !Array.isArray(data.abi)) {
          throw new Error(
            "Invalid configuration: contractAddress or abi missing in config.json"
          );
        }

        if (isMounted) {
          setConfig(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error("[ConfigContext] Error loading runtime config:", err);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <h2>Loading TrustLance...</h2>
          <p style={{ color: "#64748b" }}>Loading smart contract and network configuration</p>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "sans-serif", padding: "1rem" }}>
        <div style={{ maxWidth: 500, padding: "2rem", border: "1px solid #fecaca", borderRadius: 8, background: "#fef2f2", color: "#991b1b" }}>
          <h2 style={{ marginBottom: "1rem" }}>Configuration Error</h2>
          <p style={{ marginBottom: "1rem" }}>
            Configuration not loaded. Run <code>npm run generate-config</code> or deploy contracts first.
          </p>
          <p style={{ fontSize: "0.875rem", color: "#b91c1c", background: "#fee2e2", padding: "0.5rem", borderRadius: 4 }}>
            Details: {error || "Unknown error"}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#b91c1c", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return ctx;
}
