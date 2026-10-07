import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const deploymentsDir = path.resolve(__dirname, "../../contracts/deployments");
let deploymentFilePath = process.env.DEPLOYMENT_FILE
  ? path.resolve(__dirname, "../../", process.env.DEPLOYMENT_FILE)
  : path.join(deploymentsDir, "localhost.json");

if (!fs.existsSync(deploymentFilePath)) {
  const fallback = path.join(deploymentsDir, "localhost.json");
  if (fs.existsSync(fallback)) {
    deploymentFilePath = fallback;
  }
}

let deployment = {
  address: "",
  abi: [],
  chainId: parseInt(process.env.CHAIN_ID, 10) || 31337,
};

if (fs.existsSync(deploymentFilePath)) {
  try {
    const raw = fs.readFileSync(deploymentFilePath, "utf8");
    const parsed = JSON.parse(raw);
    deployment.address = parsed.address || "";
    deployment.abi = parsed.abi || [];
    deployment.chainId = parsed.chainId || deployment.chainId;
    console.log(`[ConfigGenerator] Loaded deployment from: ${deploymentFilePath}`);
    console.log(`[ConfigGenerator] Contract Address: ${deployment.address} (Chain ID: ${deployment.chainId})`);
  } catch (err) {
    console.warn(`[ConfigGenerator] Warning: Could not parse deployment file: ${err.message}`);
  }
} else {
  console.warn(`[ConfigGenerator] Warning: Deployment file not found at ${deploymentFilePath}. Using placeholder config.`);
}

const apiUrl = process.env.VITE_API_URL || "http://localhost:5000/api";

const runtimeConfig = {
  contractAddress: deployment.address,
  abi: deployment.abi,
  chainId: deployment.chainId,
  apiUrl: apiUrl,
};

const publicDir = path.resolve(__dirname, "../public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const outputPath = path.join(publicDir, "config.json");
fs.writeFileSync(outputPath, JSON.stringify(runtimeConfig, null, 2), "utf8");

console.log(`[ConfigGenerator] Generated runtime config at: ${outputPath}`);
