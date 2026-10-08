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

      // Step 1: Request cryptographic challenge from backend
      const nonceRes = await api.getNonce(account);
      const message =
        nonceRes.message ||
        `Sign this message to authenticate with TrustLance:\nNonce: ${nonceRes.nonce}`;

      // Step 2: Request EIP-191 personal sign from wallet
      const signature = await signer.signMessage(message);

      // Step 3: Verify signature with backend
      const res = await api.verifySignature(account, signature);

      if (res && res.token) {
        localStorage.setItem("trustlance_token", res.token);
        localStorage.setItem("trustlance_account", account.toLowerCase());
        setToken(res.token);
      } else {
        throw new Error("No token returned by authentication server");
      }
    } catch (err) {
      console.error("[AuthContext] Sign-in error:", err);
      const isUserRejected =
        err.code === 4001 ||
        err.code === "ACTION_REJECTED" ||
        err.message?.includes("User rejected");
      const errorMsg = isUserRejected
        ? "Signature request was rejected in MetaMask."
        : err.message || "Failed to sign in with Ethereum";
      setAuthError(errorMsg);
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
    } else {
      const storedAccount = localStorage.getItem("trustlance_account");
      if (storedAccount && storedAccount.toLowerCase() !== account.toLowerCase()) {
        signOut();
      }
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
