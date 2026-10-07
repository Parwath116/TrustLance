require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

const isValidPrivateKey = (key) => {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  // Must be 64 hex chars (or 66 with 0x prefix) and not all zeros
  const hexPattern = /^(0x)?[0-9a-fA-F]{64}$/;
  if (!hexPattern.test(trimmed)) return false;
  const raw = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^0+$/.test(raw)) return false; // Reject all-zero dummy keys
  return true;
};

const hasValidSepoliaConfig = () => {
  const rpc = process.env.SEPOLIA_RPC_URL ? process.env.SEPOLIA_RPC_URL.trim() : "";
  const key = process.env.DEPLOYER_PRIVATE_KEY ? process.env.DEPLOYER_PRIVATE_KEY.trim() : "";
  if (!rpc || rpc.includes("your_infura") || rpc.includes("YOUR_")) return false;
  return isValidPrivateKey(key);
};

const networks = {
  hardhat: {
    chainId: 31337,
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
};

// Only attach Sepolia network if valid RPC URL and private key are present
if (hasValidSepoliaConfig()) {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY.trim();
  const formattedKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL.trim(),
    accounts: [formattedKey],
    chainId: 11155111,
  };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
  gasReporter: {
    enabled: true,
    currency: "USD",
    noColors: false,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: false,
  },
};
