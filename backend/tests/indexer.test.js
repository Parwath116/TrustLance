const { ethers } = require("ethers");
const indexer = require("../src/services/indexer");
const Job = require("../src/models/Job");
const ChainEvent = require("../src/models/ChainEvent");
const Notification = require("../src/models/Notification");

describe("Blockchain Indexer & Event Idempotency Tests", () => {
  const dummyTxHash = "0x" + "1".repeat(64);
  const clientAddr = "0x2222222222222222222222222222222222222222";
  const freelancerAddr = "0x3333333333333333333333333333333333333333";
  const dummyMetadataHash = ethers.keccak256(ethers.toUtf8Bytes("Test Metadata"));

  it("1. Idempotently indexes JobCreated event and creates stub Job and Notification", async () => {
    const jobCreatedEvent = {
      transactionHash: dummyTxHash,
      logIndex: 0,
      eventName: "JobCreated",
      blockNumber: 10,
      args: {
        jobId: 1n,
        client: clientAddr,
        totalAmount: ethers.parseEther("2.0"),
        metadataHash: dummyMetadataHash,
        milestoneCount: 2n,
        reviewPeriod: 86400n,
      },
    };

    // First indexing pass
    await indexer.processEvent(jobCreatedEvent);

    let job = await Job.findOne({ onchainId: 1 });
    expect(job).not.toBeNull();
    expect(job.client).toBe(clientAddr.toLowerCase());
    expect(job.status).toBe("Open");
    expect(job.totalAmountWei).toBe(ethers.parseEther("2.0").toString());

    let notif = await Notification.findOne({ address: clientAddr.toLowerCase(), jobId: 1 });
    expect(notif).not.toBeNull();

    // Check ChainEvent recorded
    const eventRecord = await ChainEvent.findOne({ txHash: dummyTxHash, logIndex: 0 });
    expect(eventRecord).not.toBeNull();
    expect(eventRecord.name).toBe("JobCreated");

    // Second indexing pass (Replay of exact same event)
    await indexer.processEvent(jobCreatedEvent);

    // Assert that job was not duplicated and count remains 1
    const jobCount = await Job.countDocuments({ onchainId: 1 });
    expect(jobCount).toBe(1);

    // Assert that notification was not duplicated and count remains 1
    const notifCount = await Notification.countDocuments({ address: clientAddr.toLowerCase(), jobId: 1 });
    expect(notifCount).toBe(1);

    // Assert that ChainEvent record remains 1
    const eventCount = await ChainEvent.countDocuments({ txHash: dummyTxHash, logIndex: 0 });
    expect(eventCount).toBe(1);
  });

  it("2. Processes JobAccepted and transitions status to InProgress", async () => {
    // Setup existing Job
    await Job.create({
      onchainId: 2,
      txHash: dummyTxHash,
      metadataHash: dummyMetadataHash,
      client: clientAddr.toLowerCase(),
      status: "Open",
      totalAmountWei: ethers.parseEther("1.0").toString(),
      reviewPeriod: 86400,
      milestones: [],
    });

    const jobAcceptedEvent = {
      transactionHash: dummyTxHash,
      logIndex: 1,
      eventName: "JobAccepted",
      blockNumber: 11,
      args: {
        jobId: 2n,
        freelancer: freelancerAddr,
      },
    };

    await indexer.processEvent(jobAcceptedEvent);

    const updatedJob = await Job.findOne({ onchainId: 2 });
    expect(updatedJob.status).toBe("InProgress");
    expect(updatedJob.freelancer).toBe(freelancerAddr.toLowerCase());

    // Both parties received notifications
    const clientNotif = await Notification.findOne({ address: clientAddr.toLowerCase(), jobId: 2 });
    const freeNotif = await Notification.findOne({ address: freelancerAddr.toLowerCase(), jobId: 2 });
    expect(clientNotif).not.toBeNull();
    expect(freeNotif).not.toBeNull();
  });

  it("3. Processes MilestoneSubmitted and MilestoneApproved lifecycle updates", async () => {
    // Setup Job with a milestone
    await Job.create({
      onchainId: 3,
      txHash: dummyTxHash,
      metadataHash: dummyMetadataHash,
      client: clientAddr.toLowerCase(),
      freelancer: freelancerAddr.toLowerCase(),
      status: "InProgress",
      totalAmountWei: ethers.parseEther("1.0").toString(),
      reviewPeriod: 86400,
      milestones: [
        { milestoneId: 0, title: "Milestone 1", amountWei: ethers.parseEther("1.0").toString(), deadline: 1800000000, status: "Pending" },
      ],
    });

    // MilestoneSubmitted event
    const submitEvent = {
      transactionHash: dummyTxHash,
      logIndex: 2,
      eventName: "MilestoneSubmitted",
      blockNumber: 12,
      args: {
        jobId: 3n,
        milestoneId: 0n,
        deliverableURI: "ipfs://QmDeliverable123",
        submittedAt: 1700000000n,
      },
    };

    await indexer.processEvent(submitEvent);

    let job = await Job.findOne({ onchainId: 3 });
    expect(job.milestones[0].status).toBe("Submitted");
    expect(job.milestones[0].deliverableURI).toBe("ipfs://QmDeliverable123");

    // MilestoneApproved event
    const approveEvent = {
      transactionHash: dummyTxHash,
      logIndex: 3,
      eventName: "MilestoneApproved",
      blockNumber: 13,
      args: {
        jobId: 3n,
        milestoneId: 0n,
        amount: ethers.parseEther("1.0"),
        recipient: freelancerAddr,
      },
    };

    await indexer.processEvent(approveEvent);

    job = await Job.findOne({ onchainId: 3 });
    expect(job.milestones[0].status).toBe("Paid");
  });

  it("4. Processes DisputeRaised and DisputeResolved events", async () => {
    await Job.create({
      onchainId: 4,
      txHash: dummyTxHash,
      metadataHash: dummyMetadataHash,
      client: clientAddr.toLowerCase(),
      freelancer: freelancerAddr.toLowerCase(),
      status: "InProgress",
      totalAmountWei: ethers.parseEther("1.0").toString(),
      reviewPeriod: 86400,
      milestones: [
        { milestoneId: 0, title: "Milestone 1", amountWei: ethers.parseEther("1.0").toString(), deadline: 1800000000, status: "Submitted" },
      ],
    });

    // DisputeRaised
    await indexer.processEvent({
      transactionHash: dummyTxHash,
      logIndex: 4,
      eventName: "DisputeRaised",
      blockNumber: 14,
      args: {
        jobId: 4n,
        milestoneId: 0n,
        raisedBy: clientAddr,
        disputeStartedAt: 1700000500n,
      },
    });

    let job = await Job.findOne({ onchainId: 4 });
    expect(job.milestones[0].status).toBe("Disputed");

    // DisputeResolved (Freelancer wins)
    await indexer.processEvent({
      transactionHash: dummyTxHash,
      logIndex: 5,
      eventName: "DisputeResolved",
      blockNumber: 15,
      args: {
        jobId: 4n,
        milestoneId: 0n,
        winner: freelancerAddr,
        freelancerAmount: ethers.parseEther("1.0"),
        clientAmount: 0n,
      },
    });

    job = await Job.findOne({ onchainId: 4 });
    expect(job.milestones[0].status).toBe("Paid");
  });

  it("5. Does not crash on corrupted or unexpected event payloads", async () => {
    const badEvent = {
      transactionHash: dummyTxHash,
      logIndex: 99,
      eventName: "JobCreated",
      blockNumber: 20,
      args: null, // Corrupted args
    };

    // Should gracefully catch and not throw
    await expect(indexer.processEvent(badEvent)).resolves.not.toThrow();
  });
});
