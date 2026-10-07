const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("FreelanceEscrow Contract Test Suite", function () {
  let escrow;
  let attacker;
  let owner, client, freelancer, arb1, arb2, arb3, randomUser;

  const DEFAULT_PANEL_SIZE = 3;
  const DEFAULT_VOTING_PERIOD = 3600; // 1 hour for test suite
  const DEFAULT_REVIEW_PERIOD = 86400; // 24 hours
  const DUMMY_HASH = ethers.keccak256(ethers.toUtf8Bytes('{"title":"Build DApp"}'));

  beforeEach(async function () {
    [owner, client, freelancer, arb1, arb2, arb3, randomUser] = await ethers.getSigners();

    const FreelanceEscrow = await ethers.getContractFactory("FreelanceEscrow");
    escrow = await FreelanceEscrow.deploy(DEFAULT_PANEL_SIZE, DEFAULT_VOTING_PERIOD);
    await escrow.waitForDeployment();

    const MaliciousAttacker = await ethers.getContractFactory("MaliciousAttacker");
    attacker = await MaliciousAttacker.deploy(await escrow.getAddress());
    await attacker.waitForDeployment();
  });

  // Helper to create a standard 1-milestone job
  async function createStandardJob(customClient = client, amount = ethers.parseEther("1.0"), deadlineOffset = 3600) {
    const currentBlockTime = await time.latest();
    const deadline = currentBlockTime + deadlineOffset;
    const tx = await escrow.connect(customClient).createJob(
      DUMMY_HASH,
      ["Milestone 1"],
      [amount],
      [deadline],
      DEFAULT_REVIEW_PERIOD,
      { value: amount }
    );
    const receipt = await tx.wait();
    return 1n; // first jobId is 1
  }

  // ===========================================================================
  // 1. Deployment & Constructor Validation
  // ===========================================================================
  describe("Deployment & Constructor", function () {
    it("1. Deploys successfully with odd panelSize >= 1 and sets configuration", async function () {
      expect(await escrow.panelSize()).to.equal(DEFAULT_PANEL_SIZE);
      expect(await escrow.votingPeriod()).to.equal(DEFAULT_VOTING_PERIOD);
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.jobCount()).to.equal(0n);
    });

    it("2. Reverts deployment if panelSize is 0", async function () {
      const Factory = await ethers.getContractFactory("FreelanceEscrow");
      await expect(Factory.deploy(0, DEFAULT_VOTING_PERIOD)).to.be.revertedWithCustomError(
        escrow,
        "InvalidPanelSize"
      );
    });

    it("3. Reverts deployment if panelSize is even", async function () {
      const Factory = await ethers.getContractFactory("FreelanceEscrow");
      await expect(Factory.deploy(4, DEFAULT_VOTING_PERIOD)).to.be.revertedWithCustomError(
        escrow,
        "InvalidPanelSize"
      );
    });

    it("4. Reverts deployment if votingPeriod is 0", async function () {
      const Factory = await ethers.getContractFactory("FreelanceEscrow");
      await expect(Factory.deploy(3, 0)).to.be.revertedWithCustomError(
        escrow,
        "InvalidVotingPeriod"
      );
    });

    it("5. Rejects direct plain ETH transfers on receive and fallback", async function () {
      const escrowAddr = await escrow.getAddress();
      await expect(
        client.sendTransaction({ to: escrowAddr, value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(escrow, "PlainEthTransferNotAllowed");

      await expect(
        client.sendTransaction({
          to: escrowAddr,
          value: ethers.parseEther("0.1"),
          data: "0x12345678",
        })
      ).to.be.revertedWithCustomError(escrow, "PlainEthTransferNotAllowed");
    });
  });

  // ===========================================================================
  // 2. Arbitrator Whitelisting
  // ===========================================================================
  describe("Arbitrator Management", function () {
    it("6. Owner can add an arbitrator and emit ArbitratorAdded", async function () {
      await expect(escrow.connect(owner).addArbitrator(arb1.address))
        .to.emit(escrow, "ArbitratorAdded")
        .withArgs(arb1.address);
      expect(await escrow.isArbitrator(arb1.address)).to.be.true;
    });

    it("7. Reverts if adding zero address", async function () {
      await expect(
        escrow.connect(owner).addArbitrator(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("8. Reverts if adding already whitelisted arbitrator", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await expect(
        escrow.connect(owner).addArbitrator(arb1.address)
      ).to.be.revertedWithCustomError(escrow, "ArbitratorAlreadyExists");
    });

    it("9. Non-owner cannot add arbitrator", async function () {
      await expect(
        escrow.connect(randomUser).addArbitrator(arb1.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("10. Owner can remove an arbitrator and emit ArbitratorRemoved", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await expect(escrow.connect(owner).removeArbitrator(arb1.address))
        .to.emit(escrow, "ArbitratorRemoved")
        .withArgs(arb1.address);
      expect(await escrow.isArbitrator(arb1.address)).to.be.false;
    });

    it("11. Reverts if removing non-existent arbitrator", async function () {
      await expect(
        escrow.connect(owner).removeArbitrator(arb1.address)
      ).to.be.revertedWithCustomError(escrow, "ArbitratorDoesNotExist");
    });

    it("12. Non-owner cannot remove arbitrator", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await expect(
        escrow.connect(randomUser).removeArbitrator(arb1.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });

  // ===========================================================================
  // 3. Job Creation
  // ===========================================================================
  describe("Job Creation", function () {
    it("13. Creates a single-milestone job and emits JobCreated", async function () {
      const amount = ethers.parseEther("1.0");
      const current = await time.latest();
      const deadline = current + 3600;

      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["Phase 1 Architecture"],
          [amount],
          [deadline],
          DEFAULT_REVIEW_PERIOD,
          { value: amount }
        )
      )
        .to.emit(escrow, "JobCreated")
        .withArgs(1n, client.address, amount, DUMMY_HASH, 1n, DEFAULT_REVIEW_PERIOD);

      const job = await escrow.getJob(1n);
      expect(job.client).to.equal(client.address);
      expect(job.freelancer).to.equal(ethers.ZeroAddress);
      expect(job.totalAmount).to.equal(amount);
      expect(job.reviewPeriod).to.equal(DEFAULT_REVIEW_PERIOD);
      expect(job.status).to.equal(0n); // Open
      expect(job.milestoneCount).to.equal(1n);
      expect(job.metadataHash).to.equal(DUMMY_HASH);
    });

    it("14. Creates a multi-milestone job (up to 10 milestones) with strictly increasing deadlines", async function () {
      const current = await time.latest();
      const titles = ["M1", "M2", "M3"];
      const amounts = [ethers.parseEther("0.5"), ethers.parseEther("1.0"), ethers.parseEther("1.5")];
      const deadlines = [current + 1000, current + 2000, current + 3000];
      const total = ethers.parseEther("3.0");

      await escrow.connect(client).createJob(
        DUMMY_HASH,
        titles,
        amounts,
        deadlines,
        DEFAULT_REVIEW_PERIOD,
        { value: total }
      );

      const milestones = await escrow.getMilestones(1n);
      expect(milestones.length).to.equal(3);
      expect(milestones[0].title).to.equal("M1");
      expect(milestones[1].title).to.equal("M2");
      expect(milestones[2].title).to.equal("M3");
      expect(milestones[0].amount).to.equal(amounts[0]);
      expect(milestones[1].amount).to.equal(amounts[1]);
      expect(milestones[2].amount).to.equal(amounts[2]);
    });

    it("15. Reverts if metadataHash is zero bytes", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          ethers.ZeroHash,
          ["M1"],
          [ethers.parseEther("1")],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidMetadataHash");
    });

    it("16. Reverts if milestone list is empty", async function () {
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          [],
          [],
          [],
          DEFAULT_REVIEW_PERIOD,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneCount");
    });

    it("17. Reverts if milestone count exceeds 10", async function () {
      const current = await time.latest();
      const count = 11;
      const titles = Array(count).fill("M");
      const amounts = Array(count).fill(ethers.parseEther("0.1"));
      const deadlines = Array(count).fill(0).map((_, i) => current + (i + 1) * 100);

      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          titles,
          amounts,
          deadlines,
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1.1") }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneCount");
    });

    it("18. Reverts if input array lengths do not match", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1", "M2"],
          [ethers.parseEther("1")],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWithCustomError(escrow, "ArrayLengthMismatch");
    });

    it("19. Reverts if any milestone amount is 0", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1"],
          [0],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });

    it("20. Reverts if msg.value does not match sum of milestone amounts", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1"],
          [ethers.parseEther("1.0")],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("0.5") }
        )
      ).to.be.revertedWithCustomError(escrow, "AmountMismatch");
    });

    it("21. Reverts if milestone deadline is in the past or not strictly increasing", async function () {
      const current = await time.latest();
      // Deadline in past
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1"],
          [ethers.parseEther("1.0")],
          [current - 10],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");

      // Non-increasing deadlines
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1", "M2"],
          [ethers.parseEther("0.5"), ethers.parseEther("0.5")],
          [current + 2000, current + 1500],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    });

    it("22. Reverts if milestone title is empty or exceeds 100 chars", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          [""],
          [ethers.parseEther("1.0")],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWithCustomError(escrow, "StringTooLong");

      const longTitle = "a".repeat(101);
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          [longTitle],
          [ethers.parseEther("1.0")],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWithCustomError(escrow, "StringTooLong");
    });

    it("23. Reverts if reviewPeriod is 0", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1"],
          [ethers.parseEther("1.0")],
          [current + 1000],
          0,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidVotingPeriod");
    });
  });

  // ===========================================================================
  // 4. Job Cancellation
  // ===========================================================================
  describe("Job Cancellation", function () {
    it("24. Client can cancel Open job; full escrowed ETH is refunded; emits JobCancelled", async function () {
      const amount = ethers.parseEther("2.0");
      await createStandardJob(client, amount);

      const balBefore = await ethers.provider.getBalance(client.address);
      const tx = await escrow.connect(client).cancelJob(1n);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(client.address);
      expect(balAfter).to.equal(balBefore + amount - gasUsed);

      const job = await escrow.getJob(1n);
      expect(job.status).to.equal(3n); // Cancelled
    });

    it("25. Non-client cannot cancel job", async function () {
      await createStandardJob();
      await expect(escrow.connect(randomUser).cancelJob(1n)).to.be.revertedWithCustomError(
        escrow,
        "OnlyClient"
      );
    });

    it("26. Reverts if cancelling non-existent job", async function () {
      await expect(escrow.connect(client).cancelJob(999n)).to.be.revertedWithCustomError(
        escrow,
        "JobNotFound"
      );
    });

    it("27. Reverts if cancelling job that is not Open (e.g. InProgress or already Cancelled)", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);

      await expect(escrow.connect(client).cancelJob(1n)).to.be.revertedWithCustomError(
        escrow,
        "InvalidJobStatus"
      );

      // Create another and cancel it, then try cancelling again
      await createStandardJob();
      await escrow.connect(client).cancelJob(2n);
      await expect(escrow.connect(client).cancelJob(2n)).to.be.revertedWithCustomError(
        escrow,
        "InvalidJobStatus"
      );
    });
  });

  // ===========================================================================
  // 5. Job Acceptance
  // ===========================================================================
  describe("Job Acceptance", function () {
    it("28. Freelancer can accept Open job; status transitions to InProgress; emits JobAccepted", async function () {
      await createStandardJob();
      await expect(escrow.connect(freelancer).acceptJob(1n))
        .to.emit(escrow, "JobAccepted")
        .withArgs(1n, freelancer.address);

      const job = await escrow.getJob(1n);
      expect(job.freelancer).to.equal(freelancer.address);
      expect(job.status).to.equal(1n); // InProgress
    });

    it("29. Client cannot accept their own job", async function () {
      await createStandardJob();
      await expect(escrow.connect(client).acceptJob(1n)).to.be.revertedWithCustomError(
        escrow,
        "ClientCannotAccept"
      );
    });

    it("30. Reverts if accepting non-existent job", async function () {
      await expect(escrow.connect(freelancer).acceptJob(404n)).to.be.revertedWithCustomError(
        escrow,
        "JobNotFound"
      );
    });

    it("31. Reverts if accepting job that is not Open", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);

      // Second user tries to accept
      await expect(escrow.connect(randomUser).acceptJob(1n)).to.be.revertedWithCustomError(
        escrow,
        "InvalidJobStatus"
      );
    });
  });

  // ===========================================================================
  // 6. Milestone Submission
  // ===========================================================================
  describe("Milestone Submission", function () {
    beforeEach(async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
    });

    it("32. Freelancer can submit milestone deliverable URI; emits MilestoneSubmitted", async function () {
      const uri = "ipfs://QmDeliverableProof123";
      const tx = await escrow.connect(freelancer).submitMilestone(1n, 0n, uri);
      const receipt = await tx.wait();
      const blockTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

      await expect(tx)
        .to.emit(escrow, "MilestoneSubmitted")
        .withArgs(1n, 0n, uri, blockTime);

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(1n); // Submitted
      expect(m.deliverableURI).to.equal(uri);
      expect(m.submittedAt).to.equal(blockTime);
    });

    it("33. Non-freelancer cannot submit milestone", async function () {
      await expect(
        escrow.connect(randomUser).submitMilestone(1n, 0n, "ipfs://uri")
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("34. Reverts if deliverable URI is empty or exceeds 200 characters", async function () {
      await expect(
        escrow.connect(freelancer).submitMilestone(1n, 0n, "")
      ).to.be.revertedWithCustomError(escrow, "EmptyDeliverableURI");

      const longUri = "https://example.com/" + "a".repeat(190);
      expect(longUri.length).to.be.greaterThan(200);
      await expect(
        escrow.connect(freelancer).submitMilestone(1n, 0n, longUri)
      ).to.be.revertedWithCustomError(escrow, "StringTooLong");
    });

    it("35. Reverts if milestone status is not Pending", async function () {
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");
      // Try submitting again
      await expect(
        escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof2")
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    });

    it("36. Reverts if milestoneId is out of bounds", async function () {
      await expect(
        escrow.connect(freelancer).submitMilestone(1n, 5n, "ipfs://proof")
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");
    });
  });

  // ===========================================================================
  // 7. Milestone Approval & Completion Flow
  // ===========================================================================
  describe("Milestone Approval & Completion", function () {
    beforeEach(async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");
    });

    it("37. Client can approve submitted milestone; ETH paid to freelancer; emits MilestoneApproved", async function () {
      const amount = ethers.parseEther("1.0");
      const balBefore = await ethers.provider.getBalance(freelancer.address);

      await expect(escrow.connect(client).approveMilestone(1n, 0n))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(1n, 0n, amount, freelancer.address)
        .and.to.emit(escrow, "JobCompleted")
        .withArgs(1n);

      const balAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balAfter - balBefore).to.equal(amount);

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(2n); // Paid

      const job = await escrow.getJob(1n);
      expect(job.status).to.equal(2n); // Completed
    });

    it("38. Non-client cannot approve milestone", async function () {
      await expect(
        escrow.connect(randomUser).approveMilestone(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });

    it("39. Reverts if milestone is not in Submitted status", async function () {
      // Approve once
      await escrow.connect(client).approveMilestone(1n, 0n);

      // Try approving already Paid milestone
      await expect(
        escrow.connect(client).approveMilestone(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobStatus"); // Job became Completed
    });

    it("40. Multi-milestone completion: transitions to Completed only when all settled", async function () {
      const current = await time.latest();
      const amounts = [ethers.parseEther("1.0"), ethers.parseEther("2.0")];
      await escrow.connect(client).createJob(
        DUMMY_HASH,
        ["M1", "M2"],
        amounts,
        [current + 2000, current + 4000],
        DEFAULT_REVIEW_PERIOD,
        { value: ethers.parseEther("3.0") }
      );
      const jobId = 2n;
      await escrow.connect(freelancer).acceptJob(jobId);

      // Submit and approve milestone 0
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "ipfs://proof1");
      await escrow.connect(client).approveMilestone(jobId, 0n);

      let job = await escrow.getJob(jobId);
      expect(job.status).to.equal(1n); // Still InProgress

      // Submit and approve milestone 1
      await escrow.connect(freelancer).submitMilestone(jobId, 1n, "ipfs://proof2");
      await expect(escrow.connect(client).approveMilestone(jobId, 1n))
        .to.emit(escrow, "JobCompleted")
        .withArgs(jobId);

      job = await escrow.getJob(jobId);
      expect(job.status).to.equal(2n); // Completed
    });
  });

  // ===========================================================================
  // 8. Time-Based Paths (Timeout Release & Reclaim)
  // ===========================================================================
  describe("Time-Based Paths", function () {
    it("41. claimAfterTimeout releases funds to freelancer after reviewPeriod passes", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");

      // Advance time past reviewPeriod
      await time.increase(DEFAULT_REVIEW_PERIOD + 10);

      const balBefore = await ethers.provider.getBalance(freelancer.address);
      await expect(escrow.connect(randomUser).claimAfterTimeout(1n, 0n))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(1n, 0n, ethers.parseEther("1.0"), freelancer.address);

      const balAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1.0"));

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(2n); // Paid
    });

    it("42. claimAfterTimeout reverts if reviewPeriod has not elapsed", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");

      // Advance time only halfway through reviewPeriod
      await time.increase(DEFAULT_REVIEW_PERIOD / 2);

      await expect(
        escrow.connect(randomUser).claimAfterTimeout(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "ReviewPeriodNotExceeded");
    });

    it("43. reclaimMilestone refunds client if freelancer missed deadline without submission", async function () {
      await createStandardJob(client, ethers.parseEther("1.0"), 1000); // 1000s deadline
      await escrow.connect(freelancer).acceptJob(1n);

      // Advance past deadline without submission
      await time.increase(1500);

      const balBefore = await ethers.provider.getBalance(client.address);
      const tx = await escrow.connect(client).reclaimMilestone(1n, 0n);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(client.address);
      expect(balAfter).to.equal(balBefore + ethers.parseEther("1.0") - gasCost);

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(3n); // Refunded

      const job = await escrow.getJob(1n);
      expect(job.status).to.equal(2n); // Completed since all milestones settled
    });

    it("44. reclaimMilestone reverts if deadline has not passed", async function () {
      await createStandardJob(client, ethers.parseEther("1.0"), 5000);
      await escrow.connect(freelancer).acceptJob(1n);

      await expect(
        escrow.connect(client).reclaimMilestone(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "DeadlineNotPassed");
    });

    it("45. reclaimMilestone reverts if called by non-client", async function () {
      await createStandardJob(client, ethers.parseEther("1.0"), 1000);
      await escrow.connect(freelancer).acceptJob(1n);
      await time.increase(1500);

      await expect(
        escrow.connect(freelancer).reclaimMilestone(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });
  });

  // ===========================================================================
  // 9. Dispute Resolution & 3-Arbitrator Majority
  // ===========================================================================
  describe("Dispute Resolution & Arbitrator Voting", function () {
    beforeEach(async function () {
      // Setup 3 arbitrators
      await escrow.connect(owner).addArbitrator(arb1.address);
      await escrow.connect(owner).addArbitrator(arb2.address);
      await escrow.connect(owner).addArbitrator(arb3.address);

      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");
    });

    it("46. Client can raise dispute within reviewPeriod; emits DisputeRaised", async function () {
      const tx = await escrow.connect(client).raiseDispute(1n, 0n);
      const receipt = await tx.wait();
      const blockTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

      await expect(tx)
        .to.emit(escrow, "DisputeRaised")
        .withArgs(1n, 0n, client.address, blockTime);

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(4n); // Disputed
      expect(m.disputeStartedAt).to.equal(blockTime);
    });

    it("47. Dispute cannot be raised after reviewPeriod has passed", async function () {
      await time.increase(DEFAULT_REVIEW_PERIOD + 10);
      await expect(
        escrow.connect(client).raiseDispute(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "ReviewPeriodExceeded");
    });

    it("48. Non-client cannot raise dispute", async function () {
      await expect(
        escrow.connect(randomUser).raiseDispute(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });

    it("49. Whitelisted arbitrator casts vote; emits DisputeVoted", async function () {
      await escrow.connect(client).raiseDispute(1n, 0n);

      await expect(escrow.connect(arb1).voteOnDispute(1n, 0n, true))
        .to.emit(escrow, "DisputeVoted")
        .withArgs(1n, 0n, arb1.address, true);

      const votes = await escrow.getDisputeVotes(1n, 0n);
      expect(votes.votesForFreelancer).to.equal(1);
      expect(votes.votesForClient).to.equal(0);
      expect(votes.totalVotes).to.equal(1);
      expect(await escrow.hasVoted(1n, 0n, arb1.address)).to.be.true;
    });

    it("50. Non-arbitrator cannot vote on dispute", async function () {
      await escrow.connect(client).raiseDispute(1n, 0n);
      await expect(
        escrow.connect(randomUser).voteOnDispute(1n, 0n, true)
      ).to.be.revertedWithCustomError(escrow, "NotArbitrator");
    });

    it("51. Client or freelancer cannot vote on their own job even if whitelisted as arbitrator", async function () {
      await escrow.connect(owner).addArbitrator(client.address);
      await escrow.connect(owner).addArbitrator(freelancer.address);
      await escrow.connect(client).raiseDispute(1n, 0n);

      await expect(
        escrow.connect(client).voteOnDispute(1n, 0n, false)
      ).to.be.revertedWithCustomError(escrow, "CannotArbitrateOwnJob");

      await expect(
        escrow.connect(freelancer).voteOnDispute(1n, 0n, true)
      ).to.be.revertedWithCustomError(escrow, "CannotArbitrateOwnJob");
    });

    it("52. Arbitrator cannot vote twice on the same dispute", async function () {
      await escrow.connect(client).raiseDispute(1n, 0n);
      await escrow.connect(arb1).voteOnDispute(1n, 0n, true);

      await expect(
        escrow.connect(arb1).voteOnDispute(1n, 0n, true)
      ).to.be.revertedWithCustomError(escrow, "AlreadyVoted");
    });

    it("53. 3-Arbitrator majority for Freelancer (2-1): automatically resolves, pays freelancer", async function () {
      await escrow.connect(client).raiseDispute(1n, 0n);

      await escrow.connect(arb1).voteOnDispute(1n, 0n, true);  // vote for freelancer
      await escrow.connect(arb2).voteOnDispute(1n, 0n, false); // vote for client

      const balBefore = await ethers.provider.getBalance(freelancer.address);

      // Third vote reaches panelSize (3), triggering automatic resolution
      await expect(escrow.connect(arb3).voteOnDispute(1n, 0n, true)) // 2 for freelancer, 1 for client
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1n, 0n, freelancer.address, ethers.parseEther("1.0"), 0n)
        .and.to.emit(escrow, "JobCompleted")
        .withArgs(1n);

      const balAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1.0"));

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(2n); // Paid
    });

    it("54. 3-Arbitrator majority for Client (1-2): automatically resolves, refunds client", async function () {
      await escrow.connect(client).raiseDispute(1n, 0n);

      await escrow.connect(arb1).voteOnDispute(1n, 0n, false); // vote for client
      await escrow.connect(arb2).voteOnDispute(1n, 0n, true);  // vote for freelancer

      const balBefore = await ethers.provider.getBalance(client.address);

      // Third vote resolves in favor of client
      await expect(escrow.connect(arb3).voteOnDispute(1n, 0n, false))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1n, 0n, client.address, 0n, ethers.parseEther("1.0"))
        .and.to.emit(escrow, "JobCompleted")
        .withArgs(1n);

      const balAfter = await ethers.provider.getBalance(client.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1.0"));

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(3n); // Refunded
    });
  });

  // ===========================================================================
  // 10. Expired Dispute Resolution & Tie / Zero-Vote Split
  // ===========================================================================
  describe("Expired Dispute Resolution & Ties", function () {
    beforeEach(async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await escrow.connect(owner).addArbitrator(arb2.address);
      await escrow.connect(owner).addArbitrator(arb3.address);

      await createStandardJob(client, ethers.parseEther("1.01")); // test odd wei split
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");
      await escrow.connect(client).raiseDispute(1n, 0n);
    });

    it("55. resolveExpiredDispute reverts if votingPeriod has not elapsed", async function () {
      await expect(
        escrow.connect(randomUser).resolveExpiredDispute(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "VotingPeriodNotExceeded");
    });

    it("56. resolveExpiredDispute with zero votes splits funds 50/50 with odd wei to freelancer", async function () {
      await time.increase(DEFAULT_VOTING_PERIOD + 10);

      const totalAmount = ethers.parseEther("1.01"); // 1010000000000000000 wei
      const freelancerExpected = (totalAmount / 2n) + (totalAmount % 2n);
      const clientExpected = totalAmount - freelancerExpected;

      const freeBefore = await ethers.provider.getBalance(freelancer.address);
      const clientBefore = await ethers.provider.getBalance(client.address);

      await expect(escrow.connect(randomUser).resolveExpiredDispute(1n, 0n))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1n, 0n, ethers.ZeroAddress, freelancerExpected, clientExpected)
        .and.to.emit(escrow, "JobCompleted")
        .withArgs(1n);

      const freeAfter = await ethers.provider.getBalance(freelancer.address);
      const clientAfter = await ethers.provider.getBalance(client.address);

      expect(freeAfter - freeBefore).to.equal(freelancerExpected);
      expect(clientAfter - clientBefore).to.equal(clientExpected);

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.status).to.equal(2n); // Paid (Settled)
    });

    it("57. resolveExpiredDispute with 1-0 vote favoring Freelancer resolves for Freelancer", async function () {
      await escrow.connect(arb1).voteOnDispute(1n, 0n, true); // 1 vote freelancer
      await time.increase(DEFAULT_VOTING_PERIOD + 10);

      const balBefore = await ethers.provider.getBalance(freelancer.address);

      await expect(escrow.connect(randomUser).resolveExpiredDispute(1n, 0n))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1n, 0n, freelancer.address, ethers.parseEther("1.01"), 0n);

      const balAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1.01"));
    });

    it("58. resolveExpiredDispute with 0-1 vote favoring Client resolves for Client", async function () {
      await escrow.connect(arb1).voteOnDispute(1n, 0n, false); // 1 vote client
      await time.increase(DEFAULT_VOTING_PERIOD + 10);

      const balBefore = await ethers.provider.getBalance(client.address);

      await expect(escrow.connect(randomUser).resolveExpiredDispute(1n, 0n))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1n, 0n, client.address, 0n, ethers.parseEther("1.01"));

      const balAfter = await ethers.provider.getBalance(client.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1.01"));
    });
  });

  // ===========================================================================
  // 11. Reputation & Star Rating System
  // ===========================================================================
  describe("Reputation & Star Ratings", function () {
    beforeEach(async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");
      await escrow.connect(client).approveMilestone(1n, 0n); // Job Completed
    });

    it("59. Client and freelancer can rate each other (1-5); tracks cumulative score and count", async function () {
      // Client rates Freelancer 5 stars
      await expect(escrow.connect(client).rate(1n, 5))
        .to.emit(escrow, "Rated")
        .withArgs(1n, client.address, freelancer.address, 5);

      const freeRep = await escrow.getReputation(freelancer.address);
      expect(freeRep.totalScore).to.equal(5n);
      expect(freeRep.ratingCount).to.equal(1n);

      // Freelancer rates Client 4 stars
      await expect(escrow.connect(freelancer).rate(1n, 4))
        .to.emit(escrow, "Rated")
        .withArgs(1n, freelancer.address, client.address, 4);

      const clientRep = await escrow.getReputation(client.address);
      expect(clientRep.totalScore).to.equal(4n);
      expect(clientRep.ratingCount).to.equal(1n);
    });

    it("60. Rating reverts if job is not in Completed status", async function () {
      // Create a new uncompleted job
      await createStandardJob();
      await expect(escrow.connect(client).rate(2n, 5)).to.be.revertedWithCustomError(
        escrow,
        "JobNotCompleted"
      );
    });

    it("61. Rating reverts if caller is neither client nor freelancer", async function () {
      await expect(escrow.connect(randomUser).rate(1n, 5)).to.be.revertedWithCustomError(
        escrow,
        "OnlyClientOrFreelancer"
      );
    });

    it("62. Rating reverts if score is outside 1..5", async function () {
      await expect(escrow.connect(client).rate(1n, 0)).to.be.revertedWithCustomError(
        escrow,
        "InvalidScore"
      );

      await expect(escrow.connect(client).rate(1n, 6)).to.be.revertedWithCustomError(
        escrow,
        "InvalidScore"
      );
    });

    it("63. Rating reverts if user attempts to rate twice on the same job", async function () {
      await escrow.connect(client).rate(1n, 5);
      await expect(escrow.connect(client).rate(1n, 4)).to.be.revertedWithCustomError(
        escrow,
        "AlreadyRated"
      );
    });
  });

  // ===========================================================================
  // 12. Exact ETH Accounting
  // ===========================================================================
  describe("Exact ETH Accounting", function () {
    it("64. Contract balance is exactly 0 wei after multiple jobs settle across all paths", async function () {
      const escrowAddr = await escrow.getAddress();
      await escrow.connect(owner).addArbitrator(arb1.address);
      await escrow.connect(owner).addArbitrator(arb2.address);
      await escrow.connect(owner).addArbitrator(arb3.address);

      // Job 1: Cancelled
      await createStandardJob(client, ethers.parseEther("1.0"));
      await escrow.connect(client).cancelJob(1n);

      // Job 2: Approved
      await createStandardJob(client, ethers.parseEther("2.5"));
      await escrow.connect(freelancer).acceptJob(2n);
      await escrow.connect(freelancer).submitMilestone(2n, 0n, "uri");
      await escrow.connect(client).approveMilestone(2n, 0n);

      // Job 3: Dispute resolved for Freelancer
      await createStandardJob(client, ethers.parseEther("3.0"));
      await escrow.connect(freelancer).acceptJob(3n);
      await escrow.connect(freelancer).submitMilestone(3n, 0n, "uri");
      await escrow.connect(client).raiseDispute(3n, 0n);
      await escrow.connect(arb1).voteOnDispute(3n, 0n, true);
      await escrow.connect(arb2).voteOnDispute(3n, 0n, true);
      await escrow.connect(arb3).voteOnDispute(3n, 0n, false);

      // Job 4: Reclaimed after deadline
      await createStandardJob(client, ethers.parseEther("1.5"), 1000);
      await escrow.connect(freelancer).acceptJob(4n);
      await time.increase(1500);
      await escrow.connect(client).reclaimMilestone(4n, 0n);

      // Final contract balance must be strictly 0
      const finalBal = await ethers.provider.getBalance(escrowAddr);
      expect(finalBal).to.equal(0n);
    });
  });

  // ===========================================================================
  // 13. Reentrancy Protection
  // ===========================================================================
  describe("Reentrancy Attack Prevention", function () {
    it("65. Malicious contract attempting reentrancy on payout fails", async function () {
      const attackerAddr = await attacker.getAddress();

      // Create a job where the freelancer is the attacker contract
      const amount = ethers.parseEther("1.0");
      const current = await time.latest();
      await escrow.connect(client).createJob(
        DUMMY_HASH,
        ["Exploit M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;

      // Attacker accepts job and submits deliverable
      await attacker.acceptJob(jobId);
      await attacker.submitMilestone(jobId, 0n, "ipfs://malicious-deliverable");

      // Configure attacker to attempt re-entering approveMilestone when receiving ETH
      await attacker.setAttack(1, jobId, 0n); // 1 = AttackType.Approve

      // Client approves milestone: transfer executes, attacker's receive triggers reentrancy
      await escrow.connect(client).approveMilestone(jobId, 0n);

      // Check that reentrancy attack failed
      expect(await attacker.attackTriggered()).to.be.true;
      expect(await attacker.attackSucceeded()).to.be.false;

      // Escrow contract state was cleanly updated
      const m = await escrow.getMilestone(jobId, 0n);
      expect(m.status).to.equal(2n); // Paid
    });
  });

  // ===========================================================================
  // 14. Views & State Read Integrity
  // ===========================================================================
  describe("Views & State Integrity", function () {
    it("66. Correctly returns job, milestone, votes, and arbitrator status", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      expect(await escrow.isArbitrator(arb1.address)).to.be.true;
      expect(await escrow.isArbitrator(randomUser.address)).to.be.false;

      await createStandardJob();
      const job = await escrow.getJob(1n);
      expect(job.client).to.equal(client.address);

      const m = await escrow.getMilestone(1n, 0n);
      expect(m.title).to.equal("Milestone 1");

      const ms = await escrow.getMilestones(1n);
      expect(ms.length).to.equal(1);

      const votes = await escrow.getDisputeVotes(1n, 0n);
      expect(votes.totalVotes).to.equal(0);
    });
  });

  // ===========================================================================
  // 15. Exhaustive Branch & Edge Case Coverage
  // ===========================================================================
  describe("Exhaustive Branch & Error Paths", function () {
    let rejectingContract;

    beforeEach(async function () {
      const RejectingFactory = await ethers.getContractFactory("RejectingReceiver");
      rejectingContract = await RejectingFactory.deploy(await escrow.getAddress());
      await rejectingContract.waitForDeployment();
    });

    it("67. createJob reverts when deadlines array length does not match", async function () {
      const current = await time.latest();
      await expect(
        escrow.connect(client).createJob(
          DUMMY_HASH,
          ["M1", "M2"],
          [ethers.parseEther("0.5"), ethers.parseEther("0.5")],
          [current + 1000],
          DEFAULT_REVIEW_PERIOD,
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.revertedWithCustomError(escrow, "ArrayLengthMismatch");
    });

    it("68. claimAfterTimeout reverts on invalid milestoneId or non-submitted status", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);

      // Milestone is still Pending
      await expect(
        escrow.connect(randomUser).claimAfterTimeout(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");

      // Milestone ID out of bounds
      await expect(
        escrow.connect(randomUser).claimAfterTimeout(1n, 99n)
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");
    });

    it("69. reclaimMilestone reverts on invalid milestoneId or non-pending status", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");

      // Milestone is Submitted, not Pending
      await expect(
        escrow.connect(client).reclaimMilestone(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");

      // Milestone ID out of bounds
      await expect(
        escrow.connect(client).reclaimMilestone(1n, 99n)
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");
    });

    it("70. raiseDispute reverts on invalid milestoneId or non-submitted status", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);

      // Milestone is Pending, not Submitted
      await expect(
        escrow.connect(client).raiseDispute(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");

      // Milestone ID out of bounds
      await expect(
        escrow.connect(client).raiseDispute(1n, 99n)
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");
    });

    it("71. voteOnDispute reverts on invalid milestoneId or non-disputed status", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");

      // Milestone is Submitted, not Disputed
      await expect(
        escrow.connect(arb1).voteOnDispute(1n, 0n, true)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");

      // Raise dispute
      await escrow.connect(client).raiseDispute(1n, 0n);

      // Milestone ID out of bounds
      await expect(
        escrow.connect(arb1).voteOnDispute(1n, 99n, true)
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");
    });

    it("72. resolveExpiredDispute reverts on invalid milestoneId or non-disputed status", async function () {
      await createStandardJob();
      await escrow.connect(freelancer).acceptJob(1n);
      await escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof");

      // Not Disputed
      await expect(
        escrow.connect(randomUser).resolveExpiredDispute(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");

      // Raise dispute
      await escrow.connect(client).raiseDispute(1n, 0n);

      // Out of bounds
      await expect(
        escrow.connect(randomUser).resolveExpiredDispute(1n, 99n)
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");
    });

    it("73. resolveExpiredDispute with 1 wei handles clientShare == 0 branch", async function () {
      const current = await time.latest();
      await escrow.connect(client).createJob(
        DUMMY_HASH,
        ["Tiny M1"],
        [1n],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: 1n }
      );
      const jobId = 1n;
      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "ipfs://proof");
      await escrow.connect(client).raiseDispute(jobId, 0n);

      // Advance time past voting period
      await time.increase(DEFAULT_VOTING_PERIOD + 10);

      // 1 wei split: freelancerShare = 1 / 2 + 1 % 2 = 1, clientShare = 0
      const freeBefore = await ethers.provider.getBalance(freelancer.address);
      await escrow.connect(randomUser).resolveExpiredDispute(jobId, 0n);
      const freeAfter = await ethers.provider.getBalance(freelancer.address);
      expect(freeAfter - freeBefore).to.equal(1n);
    });

    it("74. cancelJob reverts with TransferFailed when client rejects incoming ETH", async function () {
      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      // Rejecting contract creates a job
      const tx = await rejectingContract.createJob(
        DUMMY_HASH,
        ["Reject M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      await tx.wait();

      // Rejecting contract tries to cancel, ETH refund fails
      await expect(
        rejectingContract.cancelJob(1n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });

    it("75. MaliciousAttacker tests cancel and reclaim attack paths", async function () {
      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      // Test Cancel attack type
      await attacker.setAttack(0, 1n, 0n); // AttackType.Cancel
      // Call with value to trigger receive branch
      await client.sendTransaction({
        to: await attacker.getAddress(),
        value: ethers.parseEther("0.01"),
      });
      expect(await attacker.attackTriggered()).to.be.true;
      expect(await attacker.attackSucceeded()).to.be.false;

      // Test Reclaim attack type
      await attacker.setAttack(2, 1n, 0n); // AttackType.Reclaim
      await client.sendTransaction({
        to: await attacker.getAddress(),
        value: ethers.parseEther("0.01"),
      });
      expect(await attacker.attackTriggered()).to.be.true;
      expect(await attacker.attackSucceeded()).to.be.false;
    });

    it("76. submitMilestone, claimAfterTimeout, reclaimMilestone, raiseDispute revert if job is not InProgress", async function () {
      await createStandardJob(); // Job is Open (not InProgress)

      await expect(
        escrow.connect(freelancer).submitMilestone(1n, 0n, "ipfs://proof")
      ).to.be.revertedWithCustomError(escrow, "InvalidJobStatus");

      await expect(
        escrow.connect(randomUser).claimAfterTimeout(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobStatus");

      await expect(
        escrow.connect(client).reclaimMilestone(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobStatus");

      await expect(
        escrow.connect(client).raiseDispute(1n, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobStatus");
    });

    it("77. approveMilestone and claimAfterTimeout revert with TransferFailed if freelancer rejects ETH", async function () {
      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      // Client creates job
      await escrow.connect(client).createJob(
        DUMMY_HASH,
        ["M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;

      // Rejecting contract accepts and submits
      await rejectingContract.acceptJob(jobId);
      await rejectingContract.submitMilestone(jobId, 0n, "ipfs://proof");

      // Client approving will fail because rejectingContract reverts on receive
      await expect(
        escrow.connect(client).approveMilestone(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");

      // claimAfterTimeout also fails on transfer
      await time.increase(DEFAULT_REVIEW_PERIOD + 10);
      await expect(
        escrow.connect(randomUser).claimAfterTimeout(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });

    it("78. reclaimMilestone reverts with TransferFailed if client rejects ETH", async function () {
      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      // Rejecting contract creates job with short deadline
      await rejectingContract.createJob(
        DUMMY_HASH,
        ["M1"],
        [amount],
        [current + 100],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;

      // Freelancer accepts
      await escrow.connect(freelancer).acceptJob(jobId);

      // Time advances past deadline
      await time.increase(200);

      // Rejecting contract tries to reclaim, client transfer fails
      await expect(
        rejectingContract.reclaimMilestone(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });

    it("79. voteOnDispute and resolveExpiredDispute revert with TransferFailed when recipient rejects ETH", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await escrow.connect(owner).addArbitrator(arb2.address);
      await escrow.connect(owner).addArbitrator(arb3.address);

      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      // Case A: Freelancer is rejectingContract, dispute resolved for freelancer
      await escrow.connect(client).createJob(
        DUMMY_HASH,
        ["M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;
      await rejectingContract.acceptJob(jobId);
      await rejectingContract.submitMilestone(jobId, 0n, "ipfs://proof");
      await escrow.connect(client).raiseDispute(jobId, 0n);

      await escrow.connect(arb1).voteOnDispute(jobId, 0n, true);
      await escrow.connect(arb2).voteOnDispute(jobId, 0n, true);
      // Third vote triggers payout to rejectingContract freelancer -> TransferFailed
      await expect(
        escrow.connect(arb3).voteOnDispute(jobId, 0n, true)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");

      // resolveExpiredDispute also reverts with TransferFailed
      await time.increase(DEFAULT_VOTING_PERIOD + 10);
      await expect(
        escrow.connect(randomUser).resolveExpiredDispute(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });

    it("80. approveMilestone reverts on milestoneId out of bounds or pending status during InProgress", async function () {
      const current = await time.latest();
      await escrow.connect(client).createJob(
        DUMMY_HASH,
        ["M1", "M2"],
        [ethers.parseEther("1.0"), ethers.parseEther("1.0")],
        [current + 2000, current + 4000],
        DEFAULT_REVIEW_PERIOD,
        { value: ethers.parseEther("2.0") }
      );
      const jobId = 1n;
      await escrow.connect(freelancer).acceptJob(jobId);

      // Milestone ID out of bounds
      await expect(
        escrow.connect(client).approveMilestone(jobId, 99n)
      ).to.be.revertedWithCustomError(escrow, "MilestoneNotFound");

      // Milestone 0 is Pending, not Submitted
      await expect(
        escrow.connect(client).approveMilestone(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    });

    it("81. voteOnDispute reverts with TransferFailed when client rejects ETH and client wins", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);
      await escrow.connect(owner).addArbitrator(arb2.address);
      await escrow.connect(owner).addArbitrator(arb3.address);

      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      // Rejecting contract creates job as client
      await rejectingContract.createJob(
        DUMMY_HASH,
        ["M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;
      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "ipfs://proof");
      await rejectingContract.raiseDispute(jobId, 0n);

      await escrow.connect(arb1).voteOnDispute(jobId, 0n, false);
      await escrow.connect(arb2).voteOnDispute(jobId, 0n, false);
      // Third vote favoring client triggers refund to rejectingContract -> TransferFailed
      await expect(
        escrow.connect(arb3).voteOnDispute(jobId, 0n, false)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });

    it("82. resolveExpiredDispute reverts with TransferFailed when client rejects ETH and client wins", async function () {
      await escrow.connect(owner).addArbitrator(arb1.address);

      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      await rejectingContract.createJob(
        DUMMY_HASH,
        ["M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;
      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "ipfs://proof");
      await rejectingContract.raiseDispute(jobId, 0n);

      // 1 vote for client
      await escrow.connect(arb1).voteOnDispute(jobId, 0n, false);

      await time.increase(DEFAULT_VOTING_PERIOD + 10);
      await expect(
        escrow.connect(randomUser).resolveExpiredDispute(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });

    it("83. resolveExpiredDispute reverts with TransferFailed on 50/50 tie when client rejects ETH", async function () {
      const current = await time.latest();
      const amount = ethers.parseEther("1.0");

      await rejectingContract.createJob(
        DUMMY_HASH,
        ["M1"],
        [amount],
        [current + 3600],
        DEFAULT_REVIEW_PERIOD,
        { value: amount }
      );
      const jobId = 1n;
      await escrow.connect(freelancer).acceptJob(jobId);
      await escrow.connect(freelancer).submitMilestone(jobId, 0n, "ipfs://proof");
      await rejectingContract.raiseDispute(jobId, 0n);

      // No votes cast -> tie/zero-vote split
      await time.increase(DEFAULT_VOTING_PERIOD + 10);

      // Freelancer share succeeds, but clientShare to rejectingContract fails
      await expect(
        escrow.connect(randomUser).resolveExpiredDispute(jobId, 0n)
      ).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });
  });
});


