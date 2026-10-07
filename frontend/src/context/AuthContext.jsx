import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useWeb3 } from "./Web3Context";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { account, signer } = useWeb3();
  const [token, setToken] = useState(() => localStorage.getItem("trustlance_token"));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState(null);

  const signOut = useCallback(() => {
    localStorage.removeItem("trustlance_token");
    setToken(null);
    setAuthError(null);
  }, []);

  const signIn = useCallback(async () => {
    if (!account || !signer) {
      setAuthError("Please connect your wallet first.");
      return;
    }

    try {
      setIsSigningIn(true);
      setAuthError(null);

      // Step 1: Request cryptographic nonce
      const { nonce } = await api.getNonce(account);

      // Step 2: Request EIP-191 personal sign
      const message = `TrustLance Authentication: ${nonce}`;
      const signature = await signer.signMessage(message);

      // Step 3: Verify signature with backend
      const res = await api.verifySignature(account, signature);

      if (res && res.token) {
        localStorage.setItem("trustlance_token", res.token);
        setToken(res.token);
      } else {
        throw new Error("No token returned by authentication server");
      }
    } catch (err) {
      console.error("[AuthContext] Sign-in error:", err);
      setAuthError(err.message || "Failed to sign in with Ethereum");
    } finally {
      setIsSigningIn(false);
    }
  }, [account, signer]);

  // Handle unauthorized event from API client
  useEffect(() => {
    const handleUnauthorized = () => {
      signOut();
    };

    window.addEventListener("trustlance_unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("trustlance_unauthorized", handleUnauthorized);
    };
  }, [signOut]);

  // Disconnect on wallet account switch or clear
  useEffect(() => {
    if (!account) {
      signOut();
    }
  }, [account, signOut]);

  const value = {
    token,
    isAuthenticated: !!token && !!account,
    isSigningIn,
    authError,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
