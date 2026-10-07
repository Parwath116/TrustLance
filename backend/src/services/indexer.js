const { ethers } = require("ethers");
const config = require("../config");
const Job = require("../models/Job");
const ChainEvent = require("../models/ChainEvent");
const SyncState = require("../models/SyncState");
const Notification = require("../models/Notification");

class IndexerService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.pollingTimer = null;
    this.isSyncing = false;
    this.isRunning = false;
    this.syncKey = "primary_escrow_sync";
  }

  init(customProvider = null, customContract = null) {
    if (customProvider && customContract) {
      this.provider = customProvider;
      this.contract = customContract;
      return;
    }

    if (!config.deployment.address || config.deployment.address === ethers.ZeroAddress) {
      console.warn("Indexer: No valid contract address deployed. Indexer will stay idle until contract is deployed.");
      return;
    }

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.contract = new ethers.Contract(
      config.deployment.address,
      config.deployment.abi,
      this.provider
    );
  }

  async getStartingBlock() {
    let sync = await SyncState.findOne({ key: this.syncKey });
    if (!sync) {
      const startBlock = config.deployment.deploymentBlock || 0;
      sync = await SyncState.create({
        key: this.syncKey,
        lastBlock: startBlock > 0 ? startBlock - 1 : 0,
      });
    }
    return sync.lastBlock;
  }

  async setLastBlock(blockNumber) {
    await SyncState.findOneAndUpdate(
      { key: this.syncKey },
      { $set: { lastBlock: blockNumber } },
      { upsert: true }
    );
  }

  async processEvent(event) {
    const txHash = event.transactionHash;
    const logIndex = event.index !== undefined ? event.index : event.logIndex;
    const eventName = event.fragment ? event.fragment.name : event.eventName;
    const blockNumber = event.blockNumber;

    // 1. Idempotency Check: deduplicate via ChainEvent lookup and unique compound index
    const existing = await ChainEvent.findOne({ txHash, logIndex });
    if (existing) {
      // Event already indexed. Skip safely.
      return;
    }

    try {
      await ChainEvent.create({
        txHash,
        logIndex,
        name: eventName,
        blockNumber,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Event already indexed. Skip safely.
        return;
      }
      throw err;
    }

    // 2. Dispatch event handling
    try {
      const args = event.args;
      switch (eventName) {
        case "JobCreated":
          await this.handleJobCreated(args, txHash);
          break;
        case "JobAccepted":
          await this.handleJobAccepted(args);
          break;
        case "JobCancelled":
          await this.handleJobCancelled(args);
          break;
        case "MilestoneSubmitted":
          await this.handleMilestoneSubmitted(args);
          break;
        case "MilestoneApproved":
          await this.handleMilestoneApproved(args);
          break;
        case "MilestoneRefunded":
          await this.handleMilestoneRefunded(args);
          break;
        case "DisputeRaised":
          await this.handleDisputeRaised(args);
          break;
        case "DisputeVoted":
          await this.handleDisputeVoted(args);
          break;
        case "DisputeResolved":
          await this.handleDisputeResolved(args);
          break;
        case "JobCompleted":
          await this.handleJobCompleted(args);
          break;
        case "Rated":
          await this.handleRated(args);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`Indexer error processing event ${eventName} in tx ${txHash} log ${logIndex}:`, err);
      // Do not crash indexer on single bad event
    }
  }

  async handleJobCreated(args, txHash) {
    const onchainId = Number(args.jobId);
    const client = args.client.toLowerCase();
    const totalAmountWei = args.totalAmount.toString();
    const metadataHash = args.metadataHash;
    const milestoneCount = Number(args.milestoneCount);
    const reviewPeriod = Number(args.reviewPeriod);

    let job = await Job.findOne({ onchainId });

    // Fetch initial milestones from contract if contract interface is available
    const initialMilestones = [];
    if (this.contract) {
      try {
        const onchainMilestones = await this.contract.getMilestones(onchainId);
        for (let i = 0; i < onchainMilestones.length; i++) {
          initialMilestones.push({
            milestoneId: i,
            title: onchainMilestones[i].title || `Milestone #${i + 1}`,
            amountWei: onchainMilestones[i].amount.toString(),
            deadline: Number(onchainMilestones[i].deadline),
            status: "Pending",
            deliverableURI: "",
            submittedAt: 0,
          });
        }
      } catch (err) {
        // Fallback default stubs
        for (let i = 0; i < milestoneCount; i++) {
          initialMilestones.push({
            milestoneId: i,
            title: `Milestone #${i + 1}`,
            amountWei: "0",
            deadline: 0,
            status: "Pending",
            deliverableURI: "",
            submittedAt: 0,
          });
        }
      }
    }

    if (!job) {
      job = await Job.create({
        onchainId,
        txHash,
        metadataHash,
        client,
        freelancer: null,
        status: "Open",
        totalAmountWei,
        reviewPeriod,
        milestones: initialMilestones,
        metadata: {
          title: `Job #${onchainId}`,
          description: "",
          category: "General",
          skills: [],
        },
      });
    } else {
      job.txHash = txHash;
      job.client = client;
      job.totalAmountWei = totalAmountWei;
      job.metadataHash = metadataHash;
      job.reviewPeriod = reviewPeriod;
      if (job.milestones.length === 0) {
        job.milestones = initialMilestones;
      }
      await job.save();
    }

    await Notification.create({
      address: client,
      type: "job_created",
      jobId: onchainId,
      message: `Job #${onchainId} confirmed on blockchain with ${ethers.formatEther(totalAmountWei)} ETH in escrow.`,
    });
  }

  async handleJobAccepted(args) {
    const onchainId = Number(args.jobId);
    const freelancer = args.freelancer.toLowerCase();

    const job = await Job.findOneAndUpdate(
      { onchainId },
      { $set: { freelancer, status: "InProgress" } },
      { new: true }
    );

    if (job) {
      await Notification.create({
        address: job.client,
        type: "job_accepted",
        jobId: onchainId,
        message: `Freelancer ${freelancer.slice(0, 6)}...${freelancer.slice(-4)} accepted Job #${onchainId}.`,
      });

      await Notification.create({
        address: freelancer,
        type: "job_accepted",
        jobId: onchainId,
        message: `You successfully accepted Job #${onchainId}. Work is now InProgress.`,
      });
    }
  }

  async handleJobCancelled(args) {
    const onchainId = Number(args.jobId);
    const client = args.client.toLowerCase();
    const refundAmount = args.refundAmount.toString();

    await Job.findOneAndUpdate(
      { onchainId },
      { $set: { status: "Cancelled" } }
    );

    await Notification.create({
      address: client,
      type: "job_cancelled",
      jobId: onchainId,
      message: `Job #${onchainId} has been cancelled. ${ethers.formatEther(refundAmount)} ETH refunded to your wallet.`,
    });
  }

  async handleMilestoneSubmitted(args) {
    const onchainId = Number(args.jobId);
    const milestoneId = Number(args.milestoneId);
    const deliverableURI = args.deliverableURI;
    const submittedAt = Number(args.submittedAt);

    const job = await Job.findOne({ onchainId });
    if (job && job.milestones) {
      const m = job.milestones.find((item) => item.milestoneId === milestoneId);
      if (m) {
        m.status = "Submitted";
        m.deliverableURI = deliverableURI;
        m.submittedAt = submittedAt;
        await job.save();

        await Notification.create({
          address: job.client,
          type: "milestone_submitted",
          jobId: onchainId,
          message: `Deliverable submitted for Milestone #${milestoneId + 1} on Job #${onchainId}. Review period active.`,
        });
      }
    }
  }

  async handleMilestoneApproved(args) {
    const onchainId = Number(args.jobId);
    const milestoneId = Number(args.milestoneId);
    const amount = args.amount.toString();
    const recipient = args.recipient.toLowerCase();

    const job = await Job.findOne({ onchainId });
    if (job && job.milestones) {
      const m = job.milestones.find((item) => item.milestoneId === milestoneId);
      if (m) {
        m.status = "Paid";
        await job.save();

        await Notification.create({
          address: recipient,
          type: "milestone_approved",
          jobId: onchainId,
          message: `Milestone #${milestoneId + 1} approved on Job #${onchainId}! ${ethers.formatEther(amount)} ETH released to your wallet.`,
        });
      }
    }
  }

  async handleMilestoneRefunded(args) {
    const onchainId = Number(args.jobId);
    const milestoneId = Number(args.milestoneId);
    const amount = args.amount.toString();
    const recipient = args.recipient.toLowerCase();

    const job = await Job.findOne({ onchainId });
    if (job && job.milestones) {
      const m = job.milestones.find((item) => item.milestoneId === milestoneId);
      if (m) {
        m.status = "Refunded";
        await job.save();

        await Notification.create({
          address: recipient,
          type: "milestone_refunded",
          jobId: onchainId,
          message: `Milestone #${milestoneId + 1} on Job #${onchainId} was refunded (${ethers.formatEther(amount)} ETH returned).`,
        });
      }
    }
  }

  async handleDisputeRaised(args) {
    const onchainId = Number(args.jobId);
    const milestoneId = Number(args.milestoneId);
    const raisedBy = args.raisedBy.toLowerCase();

    const job = await Job.findOne({ onchainId });
    if (job && job.milestones) {
      const m = job.milestones.find((item) => item.milestoneId === milestoneId);
      if (m) {
        m.status = "Disputed";
        await job.save();

        if (job.freelancer) {
          await Notification.create({
            address: job.freelancer,
            type: "dispute_raised",
            jobId: onchainId,
            message: `A dispute was raised by the client on Milestone #${milestoneId + 1} of Job #${onchainId}. Whitelisted arbitrators will review.`,
          });
        }
      }
    }
  }

  async handleDisputeVoted(args) {
    const onchainId = Number(args.jobId);
    const milestoneId = Number(args.milestoneId);
    const arbitrator = args.arbitrator.toLowerCase();
    const favorFreelancer = args.favorFreelancer;

    const job = await Job.findOne({ onchainId });
    if (job) {
      const target = favorFreelancer ? "Freelancer" : "Client";
      if (job.client) {
        await Notification.create({
          address: job.client,
          type: "dispute_voted",
          jobId: onchainId,
          message: `Arbitrator ${arbitrator.slice(0, 6)}... cast a vote on Milestone #${milestoneId + 1} (in favor of ${target}).`,
        });
      }
      if (job.freelancer) {
        await Notification.create({
          address: job.freelancer,
          type: "dispute_voted",
          jobId: onchainId,
          message: `Arbitrator ${arbitrator.slice(0, 6)}... cast a vote on Milestone #${milestoneId + 1} (in favor of ${target}).`,
        });
      }
    }
  }

  async handleDisputeResolved(args) {
    const onchainId = Number(args.jobId);
    const milestoneId = Number(args.milestoneId);
    const winner = args.winner ? args.winner.toLowerCase() : ethers.ZeroAddress;
    const freelancerAmount = args.freelancerAmount.toString();
    const clientAmount = args.clientAmount.toString();

    const job = await Job.findOne({ onchainId });
    if (job && job.milestones) {
      const m = job.milestones.find((item) => item.milestoneId === milestoneId);
      if (m) {
        if (freelancerAmount !== "0" && clientAmount === "0") {
          m.status = "Paid";
        } else if (clientAmount !== "0" && freelancerAmount === "0") {
          m.status = "Refunded";
        } else {
          m.status = "Paid"; // Split settlement
        }
        await job.save();

        const summary =
          winner !== ethers.ZeroAddress
            ? `Winner: ${winner.slice(0, 6)}...`
            : `50/50 Split (${ethers.formatEther(freelancerAmount)} ETH to Freelancer, ${ethers.formatEther(clientAmount)} ETH to Client)`;

        if (job.client) {
          await Notification.create({
            address: job.client,
            type: "dispute_resolved",
            jobId: onchainId,
            message: `Dispute on Milestone #${milestoneId + 1} of Job #${onchainId} resolved. ${summary}`,
          });
        }
        if (job.freelancer) {
          await Notification.create({
            address: job.freelancer,
            type: "dispute_resolved",
            jobId: onchainId,
            message: `Dispute on Milestone #${milestoneId + 1} of Job #${onchainId} resolved. ${summary}`,
          });
        }
      }
    }
  }

  async handleJobCompleted(args) {
    const onchainId = Number(args.jobId);
    const job = await Job.findOneAndUpdate(
      { onchainId },
      { $set: { status: "Completed" } },
      { new: true }
    );

    if (job) {
      if (job.client) {
        await Notification.create({
          address: job.client,
          type: "job_completed",
          jobId: onchainId,
          message: `Job #${onchainId} is Completed! All milestones settled. You can now leave a star rating.`,
        });
      }
      if (job.freelancer) {
        await Notification.create({
          address: job.freelancer,
          type: "job_completed",
          jobId: onchainId,
          message: `Job #${onchainId} is Completed! You can now leave a star rating for the client.`,
        });
      }
    }
  }

  async handleRated(args) {
    const onchainId = Number(args.jobId);
    const rater = args.rater.toLowerCase();
    const target = args.target.toLowerCase();
    const score = Number(args.score);

    await Notification.create({
      address: target,
      type: "rating_received",
      jobId: onchainId,
      message: `You received a ${score}-star rating for Job #${onchainId} from ${rater.slice(0, 6)}...${rater.slice(-4)}.`,
    });
  }

  async syncOnce(targetToBlock = null) {
    if (!this.contract || !this.provider) {
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      let latestBlock = targetToBlock;
      if (latestBlock === null) {
        try {
          const raw = await this.provider.send("eth_blockNumber", []);
          latestBlock = parseInt(raw, 16);
        } catch {
          latestBlock = await this.provider.getBlockNumber();
        }
      }
      const lastBlock = await this.getStartingBlock();

      if (lastBlock >= latestBlock) {
        this.isSyncing = false;
        return;
      }

      const batchSize = config.indexerBatchSize;
      let currentFrom = lastBlock + 1;

      while (currentFrom <= latestBlock) {
        const currentTo = Math.min(currentFrom + batchSize - 1, latestBlock);

        // Fetch logs for all contract events within this block range
        const events = await this.contract.queryFilter("*", currentFrom, currentTo);

        // Process sequentially to preserve order
        for (const evt of events) {
          await this.processEvent(evt);
        }

        // Commit sync progress
        await this.setLastBlock(currentTo);
        currentFrom = currentTo + 1;
      }
    } catch (err) {
      console.error("Indexer sync error:", err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  async start() {
    this.init();
    if (!this.contract) {
      console.warn("Indexer: Contract not configured, polling skipped.");
      return;
    }

    this.isRunning = true;
    console.log(`Indexer: Started. Catching up events with batch size ${config.indexerBatchSize}...`);

    // Initial sync
    await this.syncOnce();

    // Recurring polling loop
    this.pollingTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.syncOnce();
      }
    }, config.indexerPollIntervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    console.log("Indexer: Stopped successfully.");
  }
}

const indexerInstance = new IndexerService();
module.exports = indexerInstance;
