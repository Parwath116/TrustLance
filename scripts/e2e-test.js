/**
 * TrustLance End-to-End (E2E) Integration Test Suite
 *
 * Validates the complete on-chain and off-chain lifecycle:
 * - Flow A: Job creation, acceptance, milestone submissions, approvals, dual ratings, and MongoDB sync
 * - Flow B: Milestone dispute with 3 arbitrator votes reaching quorum and auto-resolution
 * - Flow C: Milestone payout release after client review timeout (claimAfterTimeout)
 * - Flow D: Milestone escrow refund after missed deadline (reclaimMilestone)
 */

const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Models & Services
const Job = require("../backend/src/models/Job");
const ChainEvent = require("../backend/src/models/ChainEvent");
const Notification = require("../backend/src/models/Notification");
const SyncState = require("../backend/src/models/SyncState");
const indexer = require("../backend/src/services/indexer");

// Results tracker
const testResults = [];
function recordResult(stepNum, description, passed, detail = "") {
  testResults.push({
    step: String(stepNum).padStart(2, "0"),
    desc: description,
    status: passed ? "PASS" : "FAIL",
    detail,
  });
  if (passed) {
    console.log(`  [PASS] Step ${String(stepNum).padStart(2, "0")}: ${description}`);
  } else {
    console.error(`  [FAIL] Step ${String(stepNum).padStart(2, "0")}: ${description}${detail ? ` - Detail: ${detail}` : ""}`);
  }
}

async function fastForwardTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

async function main() {
  console.log("\n" + "=".repeat(75));
  console.log("  TrustLance Automated End-to-End Integration Test Suite (BCS786)");
  console.log("=".repeat(75) + "\n");

  const startTime = Date.now();
  let mongoServer = null;

  // 1. Load Deployment configuration
  const deploymentPath = path.resolve(__dirname, "../contracts/deployments/localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at: ${deploymentPath}. Run npm run deploy:local first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log(`* Connected Contract: ${deployment.address} (Chain ID: ${deployment.chainId})`);

  // 2. Setup RPC Provider & Wallets derived from standard Hardhat test mnemonic
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const mnemonic = "test test test test test test test test test test test junk";
  const getWallet = (index) => {
    const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
    return new ethers.Wallet(hd.privateKey, provider);
  };

  const deployer = getWallet(0);    // Account 0
  const client = getWallet(1);      // Account 1
  const freelancer = getWallet(2);  // Account 2
  const arb1 = getWallet(3);        // Account 3
  const arb2 = getWallet(4);        // Account 4
  const arb3 = getWallet(5);        // Account 5

  const contract = new ethers.Contract(deployment.address, deployment.abi, deployer);

  // Direct RPC queries bypass ethers v6 client-side caches
  const sendContractTx = async (wallet, method, args = [], value = 0n) => {
    const rawNonce = await provider.send("eth_getTransactionCount", [wallet.address, "latest"]);
    const nonce = parseInt(rawNonce, 16);
    const overrides = { nonce };
    if (value > 0n) {
      overrides.value = value;
    }
    const contractWithSigner = contract.connect(wallet);
    const tx = await contractWithSigner[method](...args, overrides);
    return await tx.wait(1);
  };

  const getRawBalance = async (address) => {
    const raw = await provider.send("eth_getBalance", [address, "latest"]);
    return BigInt(raw);
  };

  recordResult(1, "Connect Local Hardhat Node and Initialize Test Signers", true);

  // 3. Ensure 3 Arbitrators are Whitelisted
  const arbitrators = [arb1.address, arb2.address, arb3.address];
  for (const arb of arbitrators) {
    const isAlready = await contract.isArbitrator(arb);
    if (!isAlready) {
      await sendContractTx(deployer, "addArbitrator", [arb]);
    }
  }
  recordResult(2, "Whitelist 3 Independent Arbitrators (Accounts #3, #4, #5)", true);

  // 4. Connect to MongoDB & Initialize Indexer
  let mongoUri = process.env.MONGODB_URI;
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    console.log(`* Connected to MongoDB at: ${mongoUri}`);
  } catch {
    console.log("* Local MongoDB not running on port 27017. Spawning in-memory MongoDB server...");
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    console.log(`* Connected to In-Memory MongoDB at: ${mongoUri}`);
  }

  // Clear collections for clean E2E run
  await Job.deleteMany({});
  await ChainEvent.deleteMany({});
  await Notification.deleteMany({});
  await SyncState.deleteMany({});

  indexer.init(provider, contract);
  recordResult(3, "Connect MongoDB Database & Initialize Blockchain Indexer", true);

  // Real-time synchronization querying the actual on-chain block number
  const syncAndAssert = async () => {
    const rawBlock = await provider.send("eth_blockNumber", []);
    const latest = parseInt(rawBlock, 16);
    await indexer.syncOnce(latest);
  };

  // =========================================================================
  // FLOW A: Happy Path Lifecycle (Milestones Approval & Rating Exchange)
  // =========================================================================
  console.log("\n--- FLOW A: Happy Path Lifecycle & Dual Rating Exchange ---");

  // Step A1: Client creates Job #A with 2 milestones
  const m1Amount = ethers.parseEther("0.1");
  const m2Amount = ethers.parseEther("0.1");
  const totalAmountA = m1Amount + m2Amount;

  const currentBlockA = await provider.getBlock("latest");
  const deadline1 = currentBlockA.timestamp + 86400 * 3;
  const deadline2 = currentBlockA.timestamp + 86400 * 7;
  const reviewPeriodA = 86400 * 3; // 3 days

  const metaA = JSON.stringify({
    title: "E2E Full Stack dApp",
    description: "Build decentralized freelance escrow dApp",
    category: "Smart Contracts",
    skills: ["Solidity", "React"],
  });
  const metaHashA = ethers.keccak256(ethers.toUtf8Bytes(metaA));

  await sendContractTx(
    client,
    "createJob",
    [
      metaHashA,
      ["Milestone 1: Backend", "Milestone 2: Frontend"],
      [m1Amount, m2Amount],
      [deadline1, deadline2],
      reviewPeriodA,
    ],
    totalAmountA
  );

  const jobIdA = Number(await contract.jobCount());

  await syncAndAssert();
  const dbJobA1 = await Job.findOne({ onchainId: jobIdA });
  const jobACreatedOk = dbJobA1 && dbJobA1.status === "Open" && dbJobA1.milestones.length === 2;
  recordResult(4, `Flow A: Client Creates Job #${jobIdA} with 2 Milestones (0.2 ETH Escrow)`, jobACreatedOk, dbJobA1 ? `status=${dbJobA1.status}, milestones=${dbJobA1.milestones.length}` : "Not found in DB");

  // Step A2: Freelancer accepts Job #A
  await sendContractTx(freelancer, "acceptJob", [jobIdA]);

  await syncAndAssert();
  const dbJobA2 = await Job.findOne({ onchainId: jobIdA });
  const jobAAcceptedOk =
    dbJobA2 &&
    dbJobA2.status === "InProgress" &&
    dbJobA2.freelancer.toLowerCase() === freelancer.address.toLowerCase();
  recordResult(5, `Flow A: Freelancer Accepts Job #${jobIdA} -> Status InProgress`, jobAAcceptedOk, dbJobA2 ? `status=${dbJobA2.status}, freelancer=${dbJobA2.freelancer}` : "Not found in DB");

  // Step A3: Freelancer submits Milestone 0
  await sendContractTx(freelancer, "submitMilestone", [
    jobIdA,
    0,
    "https://github.com/trustlance/backend-m1",
  ]);

  await syncAndAssert();
  const dbJobA3 = await Job.findOne({ onchainId: jobIdA });
  const m0SubmittedOk = dbJobA3 && dbJobA3.milestones[0].status === "Submitted";
  recordResult(6, `Flow A: Freelancer Submits Milestone #1 Deliverable`, m0SubmittedOk, dbJobA3?.milestones[0]?.status);

  // Step A4: Client approves Milestone 0
  const fBalanceBeforeA = await getRawBalance(freelancer.address);
  await sendContractTx(client, "approveMilestone", [jobIdA, 0]);
  const fBalanceAfterA = await getRawBalance(freelancer.address);

  await syncAndAssert();
  const dbJobA4 = await Job.findOne({ onchainId: jobIdA });
  const m0PaidOk =
    dbJobA4 &&
    dbJobA4.milestones[0].status === "Paid" &&
    fBalanceAfterA - fBalanceBeforeA === m1Amount;
  recordResult(7, `Flow A: Client Approves Milestone #1 -> 0.1 ETH Released to Freelancer`, m0PaidOk, `PaidStatus: ${dbJobA4?.milestones[0]?.status}, Delta: ${fBalanceAfterA - fBalanceBeforeA}`);

  // Step A5: Freelancer submits Milestone 1
  await sendContractTx(freelancer, "submitMilestone", [
    jobIdA,
    1,
    "https://github.com/trustlance/frontend-m2",
  ]);

  await syncAndAssert();
  const dbJobA5 = await Job.findOne({ onchainId: jobIdA });
  const m1SubmittedOk = dbJobA5 && dbJobA5.milestones[1].status === "Submitted";
  recordResult(8, `Flow A: Freelancer Submits Milestone #2 Deliverable`, m1SubmittedOk, dbJobA5?.milestones[1]?.status);

  // Step A6: Client approves Milestone 1 -> Job Transitions to Completed
  await sendContractTx(client, "approveMilestone", [jobIdA, 1]);

  await syncAndAssert();
  const dbJobA6 = await Job.findOne({ onchainId: jobIdA });
  const onchainJobA = await contract.getJob(jobIdA);
  const jobACompletedOk =
    dbJobA6 &&
    dbJobA6.status === "Completed" &&
    Number(onchainJobA.status) === 2 &&
    dbJobA6.milestones[1].status === "Paid";
  recordResult(9, `Flow A: Client Approves Milestone #2 -> Job #${jobIdA} Automatically Completed`, jobACompletedOk, `DB: ${dbJobA6?.status}, Chain: ${onchainJobA?.status}`);

  // Step A7: Mutual Rating Exchange
  await sendContractTx(client, "rate", [jobIdA, 5]);
  await sendContractTx(freelancer, "rate", [jobIdA, 4]);

  const repFreelancer = await contract.getReputation(freelancer.address);
  const repClient = await contract.getReputation(client.address);

  await syncAndAssert();
  const ratingsOk =
    Number(repFreelancer.totalScore) >= 5 &&
    Number(repFreelancer.ratingCount) >= 1 &&
    Number(repClient.totalScore) >= 4 &&
    Number(repClient.ratingCount) >= 1;
  recordResult(10, `Flow A: Dual Ratings Recorded On-Chain (Freelancer: 5★, Client: 4★)`, ratingsOk);

  const notifsA = await Notification.find({ jobId: jobIdA });
  recordResult(11, `Flow A: MongoDB State & Real-Time Event Notifications Verified (${notifsA.length} events logged)`, notifsA.length >= 4, `Found: ${notifsA.length}`);

  // =========================================================================
  // FLOW B: Dispute Resolution with 3 Arbitrator Votes
  // =========================================================================
  console.log("\n--- FLOW B: Milestone Dispute & Quorum Resolution ---");

  const mB_Amount = ethers.parseEther("0.15");
  const currentBlockB = await provider.getBlock("latest");
  const deadlineB = currentBlockB.timestamp + 86400 * 5;
  const reviewPeriodB = 86400 * 3;

  const metaB = JSON.stringify({ title: "Dispute Flow Project", category: "Security Audit" });
  const metaHashB = ethers.keccak256(ethers.toUtf8Bytes(metaB));

  await sendContractTx(
    client,
    "createJob",
    [
      metaHashB,
      ["Milestone 1: Security Audit"],
      [mB_Amount],
      [deadlineB],
      reviewPeriodB,
    ],
    mB_Amount
  );

  const jobIdB = Number(await contract.jobCount());

  // Accept & Submit
  await sendContractTx(freelancer, "acceptJob", [jobIdB]);
  await sendContractTx(freelancer, "submitMilestone", [jobIdB, 0, "https://github.com/vtu/audit-report"]);

  await syncAndAssert();
  recordResult(12, `Flow B: Client Creates Job #${jobIdB} (0.15 ETH) & Freelancer Submits Deliverable`, true);

  // Client raises dispute
  await sendContractTx(client, "raiseDispute", [jobIdB, 0]);

  await syncAndAssert();
  const dbJobB1 = await Job.findOne({ onchainId: jobIdB });
  const onchainMilestoneB1 = await contract.getMilestone(jobIdB, 0);
  const disputeRaisedOk =
    Number(onchainMilestoneB1.status) === 4 &&
    dbJobB1 &&
    dbJobB1.milestones[0].status === "Disputed";
  recordResult(13, `Flow B: Client Raises Dispute -> Milestone #${jobIdB}/0 Status Disputed`, disputeRaisedOk, `Chain: ${onchainMilestoneB1?.status}, DB: ${dbJobB1?.milestones[0]?.status}`);

  // 3 Arbitrators cast binding votes
  // Arb 1 votes Freelancer
  await sendContractTx(arb1, "voteOnDispute", [jobIdB, 0, true]);

  // Arb 2 votes Freelancer
  await sendContractTx(arb2, "voteOnDispute", [jobIdB, 0, true]);

  // Arb 3 votes Client
  const fBalBeforeDispute = await getRawBalance(freelancer.address);
  await sendContractTx(arb3, "voteOnDispute", [jobIdB, 0, false]);
  const fBalAfterDispute = await getRawBalance(freelancer.address);

  await syncAndAssert();
  const dbJobB2 = await Job.findOne({ onchainId: jobIdB });
  const onchainJobB = await contract.getJob(jobIdB);
  const onchainMilestoneB2 = await contract.getMilestone(jobIdB, 0);

  const disputeAutoResolvedOk =
    Number(onchainMilestoneB2.status) === 2 && // Paid
    Number(onchainJobB.status) === 2 && // Completed
    dbJobB2 &&
    dbJobB2.status === "Completed" &&
    dbJobB2.milestones[0].status === "Paid" &&
    fBalAfterDispute - fBalBeforeDispute === mB_Amount;

  recordResult(14, `Flow B: 3 Arbitrators Cast Votes (2 Freelancer, 1 Client) Reaching Quorum`, true);
  recordResult(15, `Flow B: Quorum Auto-Resolves Escrow -> 0.15 ETH Payout to Freelancer`, disputeAutoResolvedOk, `MStatus: ${onchainMilestoneB2?.status}, JStatus: ${onchainJobB?.status}, DB: ${dbJobB2?.status}`);
  recordResult(16, `Flow B: MongoDB Synchronized State Matching On-Chain Settlement`, dbJobB2?.status === "Completed", dbJobB2?.status);

  // =========================================================================
  // FLOW C: Client Review Timeout Release (claimAfterTimeout)
  // =========================================================================
  console.log("\n--- FLOW C: Client Review Timeout Autonomous Payout ---");

  const mC_Amount = ethers.parseEther("0.12");
  const currentBlockC = await provider.getBlock("latest");
  const deadlineC = currentBlockC.timestamp + 86400 * 5;
  const reviewPeriodC = 3600; // 1 hour review period

  const metaC = JSON.stringify({ title: "Timeout Flow Project", category: "Frontend Development" });
  const metaHashC = ethers.keccak256(ethers.toUtf8Bytes(metaC));

  await sendContractTx(
    client,
    "createJob",
    [
      metaHashC,
      ["Milestone 1: UI Screens"],
      [mC_Amount],
      [deadlineC],
      reviewPeriodC,
    ],
    mC_Amount
  );

  const jobIdC = Number(await contract.jobCount());

  await sendContractTx(freelancer, "acceptJob", [jobIdC]);
  await sendContractTx(freelancer, "submitMilestone", [jobIdC, 0, "https://github.com/vtu/ui-screens"]);

  recordResult(17, `Flow C: Client Creates Job #${jobIdC} (Review Window: 1 hour) & Deliverable Submitted`, true);

  // Fast-forward EVM time past review period (3700 seconds)
  await fastForwardTime(provider, 3700);
  recordResult(18, `Flow C: EVM Time Fast-Forwarded +3700s (Exceeding 3600s Review Window)`, true);

  // Freelancer claims payment after timeout
  const fBalBeforeC = await getRawBalance(freelancer.address);
  const claimReceipt = await sendContractTx(freelancer, "claimAfterTimeout", [jobIdC, 0]);
  const fBalAfterC = await getRawBalance(freelancer.address);

  await syncAndAssert();
  const dbJobC = await Job.findOne({ onchainId: jobIdC });
  const onchainMilestoneC = await contract.getMilestone(jobIdC, 0);

  const timeoutOk =
    Number(onchainMilestoneC.status) === 2 && // Paid
    dbJobC &&
    dbJobC.status === "Completed" &&
    dbJobC.milestones[0].status === "Paid" &&
    fBalAfterC + claimReceipt.fee - fBalBeforeC === mC_Amount;

  recordResult(19, `Flow C: Freelancer Claims Escrow Payout (0.12 ETH) via Timeout`, timeoutOk, `Chain: ${onchainMilestoneC?.status}, DB: ${dbJobC?.status}`);
  recordResult(20, `Flow C: MongoDB State Synchronized -> Job #${jobIdC} Completed`, dbJobC?.status === "Completed", dbJobC?.status);

  // =========================================================================
  // FLOW D: Overdue Milestone Reclaim (reclaimMilestone)
  // =========================================================================
  console.log("\n--- FLOW D: Overdue Milestone Escrow Refund ---");

  const mD_Amount = ethers.parseEther("0.18");
  const currentBlockD = await provider.getBlock("latest");
  const deadlineD = currentBlockD.timestamp + 1800; // 30 minutes from now
  const reviewPeriodD = 86400 * 3;

  const metaD = JSON.stringify({ title: "Overdue Reclaim Project", category: "Other" });
  const metaHashD = ethers.keccak256(ethers.toUtf8Bytes(metaD));

  await sendContractTx(
    client,
    "createJob",
    [
      metaHashD,
      ["Milestone 1: Urgent Patch"],
      [mD_Amount],
      [deadlineD],
      reviewPeriodD,
    ],
    mD_Amount
  );

  const jobIdD = Number(await contract.jobCount());

  await sendContractTx(freelancer, "acceptJob", [jobIdD]);

  recordResult(21, `Flow D: Client Creates Job #${jobIdD} with Strict 30-Minute Deadline`, true);

  // Fast-forward EVM time past deadline (+2000 seconds) without freelancer submitting
  await fastForwardTime(provider, 2000);
  recordResult(22, `Flow D: EVM Time Fast-Forwarded +2000s (Exceeding 1800s Deadline Without Submission)`, true);

  // Client reclaims milestone
  const cBalBeforeD = await getRawBalance(client.address);
  const reclaimReceipt = await sendContractTx(client, "reclaimMilestone", [jobIdD, 0]);
  const cBalAfterD = await getRawBalance(client.address);

  await syncAndAssert();
  const dbJobD = await Job.findOne({ onchainId: jobIdD });
  const onchainMilestoneD = await contract.getMilestone(jobIdD, 0);

  const reclaimOk =
    Number(onchainMilestoneD.status) === 3 && // Refunded
    dbJobD &&
    dbJobD.status === "Completed" &&
    dbJobD.milestones[0].status === "Refunded" &&
    cBalAfterD + reclaimReceipt.fee - cBalBeforeD === mD_Amount;

  recordResult(23, `Flow D: Client Reclaims Escrow Refund (0.18 ETH) After Missed Deadline`, reclaimOk, `Chain: ${onchainMilestoneD?.status}, DB: ${dbJobD?.status}`);
  recordResult(24, `Flow D: MongoDB State Synchronized -> Milestone Refunded, Job Completed`, dbJobD?.status === "Completed", dbJobD?.status);

  // =========================================================================
  // Final Verification Summary Table
  // =========================================================================
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalSteps = testResults.length;
  const passedSteps = testResults.filter((r) => r.status === "PASS").length;
  const failedSteps = totalSteps - passedSteps;

  console.log("\n" + "=".repeat(85));
  console.log("                           E2E INTEGRATION TEST SUMMARY");
  console.log("=".repeat(85));
  console.log(`+------+------------------------------------------------------------------+----------+`);
  console.log(`| Step | Verification Check                                               | Status   |`);
  console.log(`+------+------------------------------------------------------------------+----------+`);

  for (const r of testResults) {
    const paddedDesc = r.desc.padEnd(64).substring(0, 64);
    const statusPadded = r.status.padEnd(8);
    console.log(`|  ${r.step}  | ${paddedDesc} | [${statusPadded.trim()}]   |`);
  }

  console.log(`+------+------------------------------------------------------------------+----------+`);
  console.log(`Total Checks: ${totalSteps} | Passed: ${passedSteps} | Failed: ${failedSteps} | Time: ${elapsedSec}s\n`);

  // Cleanup
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }

  if (failedSteps > 0) {
    console.error(`❌ Integration test failed with ${failedSteps} errors.`);
    process.exit(1);
  } else {
    console.log(`✅ All ${passedSteps}/${totalSteps} integration tests passed successfully.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("FATAL E2E ERROR:", err);
  process.exit(1);
});
