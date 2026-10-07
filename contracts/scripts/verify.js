const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  console.log(`\n==================================================`);
  console.log(`Verifying FreelanceEscrow on Sepolia / Etherscan`);
  console.log(`==================================================`);

  let deploymentFilePath = process.env.DEPLOYMENT_FILE
    ? path.resolve(__dirname, "../../", process.env.DEPLOYMENT_FILE)
    : path.resolve(__dirname, "../deployments/sepolia.json");

  if (!fs.existsSync(deploymentFilePath)) {
    throw new Error(
      `Deployment file not found at: ${deploymentFilePath}. Please deploy to Sepolia first.`
    );
  }

  const deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, "utf8"));
  console.log(`Contract Address: ${deploymentData.address}`);
  console.log(`Panel Size: ${deploymentData.panelSize}`);
  console.log(`Voting Period: ${deploymentData.votingPeriod}`);

  try {
    await hre.run("verify:verify", {
      address: deploymentData.address,
      constructorArguments: [deploymentData.panelSize, deploymentData.votingPeriod],
    });
    console.log(`\nSuccessfully verified contract on Etherscan!`);
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log(`\nContract is already verified on Etherscan.`);
    } else {
      console.error(`\nVerification failed:`, error.message);
      throw error;
    }
  }

  console.log(`==================================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification script error:", error);
    process.exit(1);
  });
