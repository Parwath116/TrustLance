const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  console.log(`\n==================================================`);
  console.log(`Seeding Arbitrators on network: ${network.name}`);
  console.log(`==================================================`);

  // Locate deployment file
  let deploymentFilePath = process.env.DEPLOYMENT_FILE
    ? path.resolve(__dirname, "../../", process.env.DEPLOYMENT_FILE)
    : null;

  const fallbackPath = path.resolve(
    __dirname,
    "../deployments",
    network.name === "hardhat" ? "localhost.json" : `${network.name}.json`
  );

  if (!deploymentFilePath || !fs.existsSync(deploymentFilePath)) {
    deploymentFilePath = fallbackPath;
  }

  if (!fs.existsSync(deploymentFilePath)) {
    throw new Error(
      `Deployment file not found at: ${deploymentFilePath}. Please run deploy script first.`
    );
  }

  console.log(`Reading deployment from: ${deploymentFilePath}`);
  const deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, "utf8"));

  const [deployer] = await ethers.getSigners();
  console.log(`Executing from owner account: ${deployer.address}`);

  const escrow = await ethers.getContractAt("FreelanceEscrow", deploymentData.address, deployer);

  // Parse ARBITRATOR_ADDRESSES from env with default Hardhat test accounts
  const defaultArbs = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const rawAddresses = process.env.ARBITRATOR_ADDRESSES || defaultArbs;
  const arbitrators = rawAddresses
    .split(",")
    .map((a) => a.trim())
    .filter((a) => ethers.isAddress(a));

  if (arbitrators.length === 0) {
    console.warn(`WARNING: No valid arbitrator addresses found in ARBITRATOR_ADDRESSES environment variable.`);
    return;
  }

  console.log(`Found ${arbitrators.length} arbitrator address(es) to whitelist:`);

  for (const addr of arbitrators) {
    const isAlready = await escrow.isArbitrator(addr);
    if (isAlready) {
      console.log(`- ${addr} is ALREADY an arbitrator. Skipping.`);
    } else {
      process.stdout.write(`- Adding ${addr}... `);
      const tx = await escrow.addArbitrator(addr);
      const receipt = await tx.wait();
      console.log(`CONFIRMED in block ${receipt.blockNumber} (tx: ${receipt.hash})`);
    }
  }

  console.log(`\nArbitrator seeding complete!`);
  console.log(`==================================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Arbitrator seeding failed:", error);
    process.exit(1);
  });
