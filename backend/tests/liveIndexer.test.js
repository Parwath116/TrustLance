const { ethers } = require("ethers");
const indexer = require("../src/services/indexer");
const Job = require("../src/models/Job");
const SyncState = require("../src/models/SyncState");
const config = require("../src/config");

describe("Live Indexer against Local Hardhat Node", () => {
  let provider;
  let signer;
  let contract;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    // Check if local Hardhat node is reachable
    try {
      await provider.getBlockNumber();
      [signer] = await provider.listAccounts();
    } catch (err) {
      console.warn("Local Hardhat node is not running on 127.0.0.1:8545, skipping live test.");
      return;
    }

    if (config.deployment.address && config.deployment.address !== ethers.ZeroAddress) {
      const realSigner = await provider.getSigner(signer.address);
      contract = new ethers.Contract(config.deployment.address, config.deployment.abi, realSigner);
      indexer.init(provider, contract);
    }
  });

  it("Indexes on-chain events produced by real transactions on local node", async () => {
    if (!contract) {
      console.log("No deployed contract on local node, skipping live test.");
      return;
    }

    // 1. Create a job on-chain on the local Hardhat node
    const testTitle = "Live Node Indexing Test Job";
    const dummyHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ title: testTitle })));
    const block = await provider.getBlock("latest");
    const currentTimestamp = Math.max(Number(block.timestamp), Math.floor(Date.now() / 1000));
    const deadline = currentTimestamp + 86400;

    const tx = await contract.createJob(
      dummyHash,
      ["Milestone 1"],
      [ethers.parseEther("0.1")],
      [deadline],
      86400,
      { value: ethers.parseEther("0.1") }
    );
    const receipt = await tx.wait();
    expect(receipt.status).toBe(1);

    const onchainJobCount = await contract.jobCount();
    const createdJobId = Number(onchainJobCount);

    // 2. Trigger indexer sync pass
    await indexer.syncOnce(receipt.blockNumber);

    // 3. Assert MongoDB now has this job
    const indexedJob = await Job.findOne({ onchainId: createdJobId });
    expect(indexedJob).not.toBeNull();
    expect(indexedJob.totalAmountWei).toBe(ethers.parseEther("0.1").toString());
    expect(indexedJob.status).toBe("Open");
    expect(indexedJob.metadataHash).toBe(dummyHash);
    expect(indexedJob.milestones.length).toBe(1);
    expect(indexedJob.milestones[0].title).toBe("Milestone 1");

    // 4. Check that SyncState was updated
    const syncState = await SyncState.findOne({ key: "primary_escrow_sync" });
    expect(syncState.lastBlock).toBeGreaterThanOrEqual(receipt.blockNumber);
  });
});
