const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  console.log(`\n==================================================`);
  console.log(`Deploying FreelanceEscrow to network: ${network.name}`);
  console.log(`==================================================`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);

  // Read config from env with pinned defaults
  const panelSize = process.env.PANEL_SIZE ? parseInt(process.env.PANEL_SIZE, 10) : 3;
  const votingPeriod = process.env.VOTING_PERIOD ? parseInt(process.env.VOTING_PERIOD, 10) : 604800; // 7 days

  console.log(`Panel Size: ${panelSize}`);
  console.log(`Voting Period: ${votingPeriod} seconds`);

  // Deploy FreelanceEscrow
  const FreelanceEscrow = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = await FreelanceEscrow.deploy(panelSize, votingPeriod);
  await escrow.waitForDeployment();

  const contractAddress = await escrow.getAddress();
  const deployTx = escrow.deploymentTransaction();
  const receipt = await deployTx.wait();

  const deploymentBlock = receipt.blockNumber;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`\nFreelanceEscrow deployed successfully!`);
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Transaction Hash: ${receipt.hash}`);
  console.log(`Deployment Block: ${deploymentBlock}`);
  console.log(`Chain ID: ${chainId}`);

  // Prepare deployment artifact object
  const artifact = await hre.artifacts.readArtifact("FreelanceEscrow");
  const deploymentData = {
    contractName: "FreelanceEscrow",
    address: contractAddress,
    deployer: deployer.address,
    abi: artifact.abi,
    deploymentBlock: deploymentBlock,
    chainId: chainId,
    panelSize: panelSize,
    votingPeriod: votingPeriod,
    deployedAt: new Date().toISOString(),
    network: network.name,
  };

  // Determine output path: contracts/deployments/<network>.json
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // If localhost/127.0.0.1 or hardhat, save as localhost.json
  const networkFilename = network.name === "hardhat" ? "localhost.json" : `${network.name}.json`;
  const deploymentFilePath = path.join(deploymentsDir, networkFilename);

  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentData, null, 2), "utf8");
  console.log(`\nDeployment artifact saved to: ${deploymentFilePath}`);
  console.log(`==================================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
