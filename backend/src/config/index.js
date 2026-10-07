const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

// Validate JWT Secret
const PLACEHOLDER_SECRETS = [
  "replace_this_with_a_secure_random_string_min_32_chars_long",
  "super_secret_jwt_key_change_in_production_min_32_chars",
  "your_jwt_secret_key_here",
  "default_secret_key",
];

let rawSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : "";
if (process.env.NODE_ENV === "test" && !rawSecret) {
  rawSecret = "test_environment_jwt_secret_minimum_32_characters_long";
}

if (!rawSecret) {
  console.error("FATAL ERROR: JWT_SECRET environment variable is missing.");
  process.exit(1);
}
if (rawSecret.length < 32) {
  console.error(`FATAL ERROR: JWT_SECRET must be at least 32 characters long (current length: ${rawSecret.length}).`);
  process.exit(1);
}
if (PLACEHOLDER_SECRETS.includes(rawSecret.toLowerCase())) {
  console.error("FATAL ERROR: JWT_SECRET is still set to an insecure default placeholder value. Please set a secure random string.");
  process.exit(1);
}

// Locate and load shared deployment configuration
let deploymentFilePath = process.env.DEPLOYMENT_FILE
  ? path.resolve(__dirname, "../../../", process.env.DEPLOYMENT_FILE)
  : path.resolve(__dirname, "../../../contracts/deployments/localhost.json");

if (!fs.existsSync(deploymentFilePath)) {
  const fallback = path.resolve(__dirname, "../../../contracts/deployments/localhost.json");
  if (fs.existsSync(fallback)) {
    deploymentFilePath = fallback;
  }
}

let deployment = {
  address: ethers.ZeroAddress,
  abi: [],
  deploymentBlock: 0,
  chainId: 31337,
};

if (fs.existsSync(deploymentFilePath)) {
  try {
    const raw = fs.readFileSync(deploymentFilePath, "utf8");
    deployment = JSON.parse(raw);
  } catch (err) {
    console.warn(`WARNING: Failed to parse deployment file at ${deploymentFilePath}: ${err.message}`);
  }
} else {
  console.warn(`WARNING: Shared deployment file not found at: ${deploymentFilePath}`);
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/trustlance",
  jwtSecret: rawSecret,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:8095",
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId: parseInt(process.env.CHAIN_ID, 10) || deployment.chainId || 31337,
  indexerBatchSize: parseInt(process.env.INDEXER_BATCH_SIZE, 10) || 500,
  indexerPollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS, 10) || 6000,
  deployment: {
    address: deployment.address,
    abi: deployment.abi,
    deploymentBlock: deployment.deploymentBlock || 0,
    chainId: deployment.chainId || 31337,
  },
};

module.exports = config;
