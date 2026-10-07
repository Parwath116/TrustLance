import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { useConfig } from "./ConfigContext";

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const config = useConfig();
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [signer, setSigner] = useState(null);
  const [balance, setBalance] = useState("0");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Initialize a read provider (fallback or window.ethereum)
  const readProvider = useMemo(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
    }
    return new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  }, []);

  const isCorrectNetwork = useMemo(() => {
    if (!chainId || !config.chainId) return false;
    return Number(chainId) === Number(config.chainId);
  }, [chainId, config.chainId]);

  // Create contract instance (connected to signer if available, else readProvider)
  const contract = useMemo(() => {
    if (!config.contractAddress || !config.abi) return null;
    const activeRunner = signer || readProvider;
    try {
      return new ethers.Contract(config.contractAddress, config.abi, activeRunner);
    } catch (err) {
      console.error("[Web3Context] Failed to instantiate contract:", err);
      return null;
    }
  }, [config.contractAddress, config.abi, signer, readProvider]);

  // Fetch account balance
  const refreshBalance = useCallback(async (addr, prov) => {
    if (!addr || !prov) return;
    try {
      const bal = await prov.getBalance(addr);
      setBalance(ethers.formatEther(bal));
    } catch (err) {
      console.warn("[Web3Context] Failed to get balance:", err);
    }
  }, []);

  // Update account and signer
  const updateSignerAndAccount = useCallback(async (prov) => {
    try {
      const activeSigner = await prov.getSigner();
      const addr = await activeSigner.getAddress();
      const network = await prov.getNetwork();

      setSigner(activeSigner);
      setAccount(addr.toLowerCase());
      setChainId(Number(network.chainId));
      await refreshBalance(addr, prov);
    } catch {
      setSigner(null);
      setAccount(null);
    }
  }, [refreshBalance]);

  // Connect wallet
  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask or Ethereum wallet not found. Please install MetaMask.");
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      await updateSignerAndAccount(browserProvider);
    } catch (err) {
      console.error("[Web3Context] Error connecting wallet:", err);
      setError(err.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }, [updateSignerAndAccount]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setAccount(null);
    setSigner(null);
    setBalance("0");
    localStorage.removeItem("trustlance_token");
  }, []);

  // Switch network
  const switchNetwork = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const targetChainIdHex = ethers.toQuantity(config.chainId);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (switchError) {
      // 4902 means the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        if (config.chainId === 31337) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: targetChainIdHex,
                  chainName: "Hardhat Localhost",
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["http://127.0.0.1:8545"],
                },
              ],
            });
          } catch (addError) {
            console.error("[Web3Context] Failed to add local network:", addError);
          }
        } else if (config.chainId === 11155111) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: targetChainIdHex,
                  chainName: "Sepolia Testnet",
                  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.sepolia.org"],
                  blockExplorerUrls: ["https://sepolia.etherscan.io"],
                },
              ],
            });
          } catch (addError) {
            console.error("[Web3Context] Failed to add Sepolia network:", addError);
          }
        } else {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: targetChainIdHex,
                  chainName: `Custom Network (${config.chainId})`,
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: [config.rpcUrl || "http://127.0.0.1:8545"],
                },
              ],
            });
          } catch (addError) {
            console.error("[Web3Context] Failed to add network:", addError);
          }
        }
      } else {
        console.error("[Web3Context] Failed to switch network:", switchError);
      }
    }
  }, [config.chainId, config.rpcUrl]);

  // Auto-connect if already authorized
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const browserProvider = new ethers.BrowserProvider(window.ethereum);

    browserProvider.getNetwork().then((net) => {
      setChainId(Number(net.chainId));
    }).catch(() => {});

    window.ethereum.request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts && accounts.length > 0) {
          updateSignerAndAccount(browserProvider);
        }
      })
      .catch((err) => console.warn("[Web3Context] Check accounts error:", err));

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        updateSignerAndAccount(new ethers.BrowserProvider(window.ethereum));
      }
    };

    const handleChainChanged = (newChainId) => {
      setChainId(parseInt(newChainId, 16));
      updateSignerAndAccount(new ethers.BrowserProvider(window.ethereum));
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [updateSignerAndAccount, disconnect]);

  const value = {
    account,
    chainId,
    signer,
    provider: signer ? signer.provider : readProvider,
    contract,
    balance,
    isCorrectNetwork,
    isConnecting,
    error,
    connect,
    disconnect,
    switchNetwork,
    refreshBalance: () => refreshBalance(account, signer ? signer.provider : readProvider),
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return ctx;
}
