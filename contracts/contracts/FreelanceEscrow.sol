// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FreelanceEscrow
 * @author TrustLance Project Team (VTU BCS786)
 * @notice Decentralized freelance marketplace with milestone-based escrow and on-chain dispute resolution.
 * @dev Platform fee is set to 0% as an explicit architectural design choice to maximize transparency,
 *      eliminate intermediary fee extraction, and preserve full value transfer between clients and freelancers.
 */
contract FreelanceEscrow is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    /// @notice Operational status of a freelance job
    enum JobStatus {
        Open,
        InProgress,
        Completed,
        Cancelled
    }

    /// @notice Lifecycle status of an individual milestone within a job
    enum MilestoneStatus {
        Pending,
        Submitted,
        Paid,
        Refunded,
        Disputed
    }

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /// @notice Core metadata and state of a freelance job
    struct Job {
        address client;
        address freelancer;
        uint256 totalAmount;
        uint64 reviewPeriod;
        JobStatus status;
        uint256 milestoneCount;
        bytes32 metadataHash;
    }

    /// @notice Milestone definition, execution state, and dispute tracking
    struct Milestone {
        string title;
        uint256 amount;
        uint64 deadline;
        MilestoneStatus status;
        string deliverableURI;
        uint64 submittedAt;
        uint64 disputeStartedAt;
        uint8 votesForFreelancer;
        uint8 votesForClient;
        uint8 totalVotes;
    }

    /// @notice User rating and reputation metrics
    struct Reputation {
        uint256 totalScore;
        uint256 ratingCount;
    }

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    /// @notice Total number of jobs created on the platform
    uint256 public jobCount;

    /// @notice Number of arbitrator votes required to resolve a dispute (must be odd and >= 1)
    uint8 public immutable panelSize;

    /// @notice Time window in seconds allocated for arbitrators to cast votes before expiry resolution
    uint64 public immutable votingPeriod;

    /// @notice Primary storage for jobs indexed by unique numeric ID
    mapping(uint256 => Job) private jobs;

    /// @notice Storage for milestones indexed by jobId and milestoneId
    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;

    /// @notice Registry of whitelisted dispute arbitrators
    mapping(address => bool) public isArbitrator;

    /// @notice Tracks whether an arbitrator has cast a vote for a given milestone dispute
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    /// @notice Tracks whether an actor (client or freelancer) has rated the counterparty for a completed job
    mapping(uint256 => mapping(address => bool)) public hasRated;

    /// @notice Counterparty reputation statistics
    mapping(address => Reputation) public reputation;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        uint256 totalAmount,
        bytes32 metadataHash,
        uint256 milestoneCount,
        uint64 reviewPeriod
    );

    event JobCancelled(
        uint256 indexed jobId,
        address indexed client,
        uint256 refundAmount
    );

    event JobAccepted(
        uint256 indexed jobId,
        address indexed freelancer
    );

    event MilestoneSubmitted(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        string deliverableURI,
        uint64 submittedAt
    );

    event MilestoneApproved(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        uint256 amount,
        address recipient
    );

    event MilestoneRefunded(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        uint256 amount,
        address recipient
    );

    event DisputeRaised(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        address indexed raisedBy,
        uint64 disputeStartedAt
    );

    event DisputeVoted(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        address indexed arbitrator,
        bool favorFreelancer
    );

    event DisputeResolved(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        address winner,
        uint256 freelancerAmount,
        uint256 clientAmount
    );

    event JobCompleted(uint256 indexed jobId);

    event ArbitratorAdded(address indexed arbitrator);

    event ArbitratorRemoved(address indexed arbitrator);

    event Rated(
        uint256 indexed jobId,
        address indexed rater,
        address indexed target,
        uint8 score
    );

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error InvalidPanelSize();
    error InvalidVotingPeriod();
    error ZeroAddress();
    error ArbitratorAlreadyExists();
    error ArbitratorDoesNotExist();
    error NotArbitrator();
    error CannotArbitrateOwnJob();
    error AlreadyVoted();
    error InvalidMilestoneCount();
    error ArrayLengthMismatch();
    error AmountMismatch();
    error ZeroAmount();
    error InvalidDeadline();
    error StringTooLong();
    error InvalidMetadataHash();
    error JobNotFound();
    error MilestoneNotFound();
    error OnlyClient();
    error OnlyFreelancer();
    error OnlyClientOrFreelancer();
    error ClientCannotAccept();
    error InvalidJobStatus();
    error InvalidMilestoneStatus();
    error ReviewPeriodNotExceeded();
    error ReviewPeriodExceeded();
    error DeadlineNotPassed();
    error VotingPeriodNotExceeded();
    error TransferFailed();
    error EmptyDeliverableURI();
    error JobNotCompleted();
    error AlreadyRated();
    error InvalidScore();
    error PlainEthTransferNotAllowed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Initializes the TrustLance freelance escrow contract
     * @param _panelSize Required number of arbitrator votes to reach verdict (must be odd and >= 1)
     * @param _votingPeriod Duration in seconds for arbitrators to vote before expiry resolution
     */
    constructor(uint8 _panelSize, uint64 _votingPeriod) Ownable(msg.sender) {
        if (_panelSize == 0 || _panelSize % 2 == 0) {
            revert InvalidPanelSize();
        }
        if (_votingPeriod == 0) {
            revert InvalidVotingPeriod();
        }
        panelSize = _panelSize;
        votingPeriod = _votingPeriod;
    }

    // -------------------------------------------------------------------------
    // External Functions - Job Lifecycle
    // -------------------------------------------------------------------------

    /**
     * @notice Creates a new freelance job with escrowed milestone funding
     * @param metadataHash Keccak256 hash of off-chain JSON metadata document
     * @param titles Array of milestone titles (max 100 characters each)
     * @param amounts Array of milestone payment amounts in wei
     * @param deadlines Array of absolute unix timestamps for milestones (must be strictly increasing)
     * @param reviewPeriod Duration in seconds for the client to review deliverables
     * @return jobId Unique identifier of the created job
     */
    function createJob(
        bytes32 metadataHash,
        string[] calldata titles,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        uint64 reviewPeriod
    ) external payable returns (uint256 jobId) {
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();
        uint256 mCount = titles.length;
        if (mCount == 0 || mCount > 10) revert InvalidMilestoneCount();
        if (amounts.length != mCount || deadlines.length != mCount) revert ArrayLengthMismatch();
        if (reviewPeriod == 0) revert InvalidVotingPeriod();

        uint256 sumAmounts = 0;
        uint64 lastDeadline = uint64(block.timestamp);

        for (uint256 i = 0; i < mCount; ) {
            if (amounts[i] == 0) revert ZeroAmount();
            if (bytes(titles[i]).length == 0 || bytes(titles[i]).length > 100) revert StringTooLong();
            if (deadlines[i] <= lastDeadline) revert InvalidDeadline();

            lastDeadline = deadlines[i];
            sumAmounts += amounts[i];
            unchecked { ++i; }
        }

        if (msg.value != sumAmounts) revert AmountMismatch();

        jobId = ++jobCount;

        jobs[jobId] = Job({
            client: msg.sender,
            freelancer: address(0),
            totalAmount: msg.value,
            reviewPeriod: reviewPeriod,
            status: JobStatus.Open,
            milestoneCount: mCount,
            metadataHash: metadataHash
        });

        for (uint256 i = 0; i < mCount; ) {
            milestones[jobId][i] = Milestone({
                title: titles[i],
                amount: amounts[i],
                deadline: deadlines[i],
                status: MilestoneStatus.Pending,
                deliverableURI: "",
                submittedAt: 0,
                disputeStartedAt: 0,
                votesForFreelancer: 0,
                votesForClient: 0,
                totalVotes: 0
            });
            unchecked { ++i; }
        }

        emit JobCreated(jobId, msg.sender, msg.value, metadataHash, mCount, reviewPeriod);
    }

    /**
     * @notice Cancels an open job and refunds all escrowed funds to the client
     * @param jobId Unique identifier of the job
     */
    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.client == address(0)) revert JobNotFound();
        if (msg.sender != job.client) revert OnlyClient();
        if (job.status != JobStatus.Open) revert InvalidJobStatus();

        job.status = JobStatus.Cancelled;
        uint256 refundAmount = job.totalAmount;

        emit JobCancelled(jobId, msg.sender, refundAmount);

        (bool sent, ) = job.client.call{value: refundAmount}("");
        if (!sent) revert TransferFailed();
    }

    /**
     * @notice Accepts an open freelance job and sets the caller as the assigned freelancer
     * @param jobId Unique identifier of the job
     */
    function acceptJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.client == address(0)) revert JobNotFound();
        if (job.status != JobStatus.Open) revert InvalidJobStatus();
        if (msg.sender == job.client) revert ClientCannotAccept();

        job.freelancer = msg.sender;
        job.status = JobStatus.InProgress;

        emit JobAccepted(jobId, msg.sender);
    }

    /**
     * @notice Submits deliverable proof URI for a pending milestone
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     * @param deliverableURI Link to deliverable artifacts (max 200 chars)
     */
    function submitMilestone(
        uint256 jobId,
        uint256 milestoneId,
        string calldata deliverableURI
    ) external {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.InProgress) revert InvalidJobStatus();
        if (msg.sender != job.freelancer) revert OnlyFreelancer();
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Pending) revert InvalidMilestoneStatus();
        if (bytes(deliverableURI).length == 0) revert EmptyDeliverableURI();
        if (bytes(deliverableURI).length > 200) revert StringTooLong();

        m.status = MilestoneStatus.Submitted;
        m.deliverableURI = deliverableURI;
        m.submittedAt = uint64(block.timestamp);

        emit MilestoneSubmitted(jobId, milestoneId, deliverableURI, m.submittedAt);
    }

    /**
     * @notice Approves a submitted milestone and releases escrow funds to the freelancer
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     */
    function approveMilestone(uint256 jobId, uint256 milestoneId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.InProgress) revert InvalidJobStatus();
        if (msg.sender != job.client) revert OnlyClient();
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();

        m.status = MilestoneStatus.Paid;
        uint256 amount = m.amount;

        _checkAndSetJobCompleted(jobId);

        emit MilestoneApproved(jobId, milestoneId, amount, job.freelancer);

        (bool sent, ) = job.freelancer.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    /**
     * @notice Automatically releases payment to freelancer if client fails to review within reviewPeriod
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     */
    function claimAfterTimeout(uint256 jobId, uint256 milestoneId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.InProgress) revert InvalidJobStatus();
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();
        if (block.timestamp <= m.submittedAt + job.reviewPeriod) revert ReviewPeriodNotExceeded();

        m.status = MilestoneStatus.Paid;
        uint256 amount = m.amount;

        _checkAndSetJobCompleted(jobId);

        emit MilestoneApproved(jobId, milestoneId, amount, job.freelancer);

        (bool sent, ) = job.freelancer.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    /**
     * @notice Reclaims funds for a milestone if freelancer missed the deadline without submission
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     */
    function reclaimMilestone(uint256 jobId, uint256 milestoneId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.InProgress) revert InvalidJobStatus();
        if (msg.sender != job.client) revert OnlyClient();
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Pending) revert InvalidMilestoneStatus();
        if (block.timestamp <= m.deadline) revert DeadlineNotPassed();

        m.status = MilestoneStatus.Refunded;
        uint256 amount = m.amount;

        _checkAndSetJobCompleted(jobId);

        emit MilestoneRefunded(jobId, milestoneId, amount, job.client);

        (bool sent, ) = job.client.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // External Functions - Dispute Resolution
    // -------------------------------------------------------------------------

    /**
     * @notice Raises a dispute on a submitted milestone within the review period
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     */
    function raiseDispute(uint256 jobId, uint256 milestoneId) external {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.InProgress) revert InvalidJobStatus();
        if (msg.sender != job.client) revert OnlyClient();
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();
        if (block.timestamp > m.submittedAt + job.reviewPeriod) revert ReviewPeriodExceeded();

        m.status = MilestoneStatus.Disputed;
        m.disputeStartedAt = uint64(block.timestamp);

        emit DisputeRaised(jobId, milestoneId, msg.sender, m.disputeStartedAt);
    }

    /**
     * @notice Casts an arbitrator vote on an active milestone dispute
     * @dev Resolves automatically once totalVotes reaches panelSize
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     * @param favorFreelancer True to vote for freelancer payout, false for client refund
     */
    function voteOnDispute(
        uint256 jobId,
        uint256 milestoneId,
        bool favorFreelancer
    ) external nonReentrant {
        if (!isArbitrator[msg.sender]) revert NotArbitrator();

        Job storage job = jobs[jobId];
        if (msg.sender == job.client || msg.sender == job.freelancer) revert CannotArbitrateOwnJob();
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (hasVoted[jobId][milestoneId][msg.sender]) revert AlreadyVoted();

        hasVoted[jobId][milestoneId][msg.sender] = true;
        m.totalVotes += 1;

        if (favorFreelancer) {
            m.votesForFreelancer += 1;
        } else {
            m.votesForClient += 1;
        }

        emit DisputeVoted(jobId, milestoneId, msg.sender, favorFreelancer);

        if (m.totalVotes >= panelSize) {
            uint256 amount = m.amount;
            if (m.votesForFreelancer > m.votesForClient) {
                m.status = MilestoneStatus.Paid;
                _checkAndSetJobCompleted(jobId);

                emit DisputeResolved(jobId, milestoneId, job.freelancer, amount, 0);

                (bool sent, ) = job.freelancer.call{value: amount}("");
                if (!sent) revert TransferFailed();
            } else {
                m.status = MilestoneStatus.Refunded;
                _checkAndSetJobCompleted(jobId);

                emit DisputeResolved(jobId, milestoneId, job.client, 0, amount);

                (bool sent, ) = job.client.call{value: amount}("");
                if (!sent) revert TransferFailed();
            }
        }
    }

    /**
     * @notice Resolves an unresolved dispute whose votingPeriod has expired based on votes cast
     * @dev Resolves by majority of votes cast; on tie or zero votes splits funds 50/50 with odd wei to freelancer
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     */
    function resolveExpiredDispute(uint256 jobId, uint256 milestoneId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (milestoneId >= job.milestoneCount) revert MilestoneNotFound();

        Milestone storage m = milestones[jobId][milestoneId];
        if (m.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (block.timestamp <= m.disputeStartedAt + votingPeriod) revert VotingPeriodNotExceeded();

        uint256 amount = m.amount;

        if (m.votesForFreelancer > m.votesForClient) {
            m.status = MilestoneStatus.Paid;
            _checkAndSetJobCompleted(jobId);

            emit DisputeResolved(jobId, milestoneId, job.freelancer, amount, 0);

            (bool sent, ) = job.freelancer.call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else if (m.votesForClient > m.votesForFreelancer) {
            m.status = MilestoneStatus.Refunded;
            _checkAndSetJobCompleted(jobId);

            emit DisputeResolved(jobId, milestoneId, job.client, 0, amount);

            (bool sent, ) = job.client.call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            // Tie or zero votes cast: 50/50 split, odd wei given to freelancer
            uint256 freelancerShare = (amount / 2) + (amount % 2);
            uint256 clientShare = amount - freelancerShare;

            m.status = MilestoneStatus.Paid;
            _checkAndSetJobCompleted(jobId);

            emit DisputeResolved(jobId, milestoneId, address(0), freelancerShare, clientShare);

            (bool sentFreelancer, ) = job.freelancer.call{value: freelancerShare}("");
            if (!sentFreelancer) revert TransferFailed();

            if (clientShare > 0) {
                (bool sentClient, ) = job.client.call{value: clientShare}("");
                if (!sentClient) revert TransferFailed();
            }
        }
    }

    // -------------------------------------------------------------------------
    // External Functions - Administration & Arbitrators
    // -------------------------------------------------------------------------

    /**
     * @notice Adds an arbitrator address to the authorized whitelist
     * @param arbitrator Address of the arbitrator to register
     */
    function addArbitrator(address arbitrator) external onlyOwner {
        if (arbitrator == address(0)) revert ZeroAddress();
        if (isArbitrator[arbitrator]) revert ArbitratorAlreadyExists();

        isArbitrator[arbitrator] = true;
        emit ArbitratorAdded(arbitrator);
    }

    /**
     * @notice Removes an arbitrator address from the authorized whitelist
     * @param arbitrator Address of the arbitrator to de-register
     */
    function removeArbitrator(address arbitrator) external onlyOwner {
        if (!isArbitrator[arbitrator]) revert ArbitratorDoesNotExist();

        isArbitrator[arbitrator] = false;
        emit ArbitratorRemoved(arbitrator);
    }

    // -------------------------------------------------------------------------
    // External Functions - Reputation & Ratings
    // -------------------------------------------------------------------------

    /**
     * @notice Submits a rating (1..5) for the counterparty after a job is completed
     * @param jobId Unique identifier of the completed job
     * @param score Rating value from 1 to 5
     */
    function rate(uint256 jobId, uint8 score) external {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.Completed) revert JobNotCompleted();
        if (msg.sender != job.client && msg.sender != job.freelancer) revert OnlyClientOrFreelancer();
        if (hasRated[jobId][msg.sender]) revert AlreadyRated();
        if (score < 1 || score > 5) revert InvalidScore();

        hasRated[jobId][msg.sender] = true;
        address target = (msg.sender == job.client) ? job.freelancer : job.client;

        reputation[target].totalScore += score;
        reputation[target].ratingCount += 1;

        emit Rated(jobId, msg.sender, target, score);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Retrieves aggregated reputation metrics for a user address
     * @param user Target address
     * @return totalScore Cumulative rating points received
     * @return ratingCount Total number of reviews received
     */
    function getReputation(address user) external view returns (uint256 totalScore, uint256 ratingCount) {
        Reputation memory rep = reputation[user];
        return (rep.totalScore, rep.ratingCount);
    }

    /**
     * @notice Retrieves the full job struct by job ID
     * @param jobId Unique identifier of the job
     * @return Job struct contents
     */
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    /**
     * @notice Retrieves a specific milestone struct by job ID and milestone ID
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     * @return Milestone struct contents
     */
    function getMilestone(uint256 jobId, uint256 milestoneId) external view returns (Milestone memory) {
        return milestones[jobId][milestoneId];
    }

    /**
     * @notice Retrieves all milestones for a given job ID
     * @param jobId Unique identifier of the job
     * @return allMilestones Array containing all milestone structs for the job
     */
    function getMilestones(uint256 jobId) external view returns (Milestone[] memory allMilestones) {
        uint256 count = jobs[jobId].milestoneCount;
        allMilestones = new Milestone[](count);
        for (uint256 i = 0; i < count; ) {
            allMilestones[i] = milestones[jobId][i];
            unchecked { ++i; }
        }
    }

    /**
     * @notice Retrieves dispute voting tally for a milestone
     * @param jobId Unique identifier of the job
     * @param milestoneId Index of the milestone (0-indexed)
     * @return votesForFreelancer Number of votes favoring freelancer
     * @return votesForClient Number of votes favoring client
     * @return totalVotes Total votes recorded
     */
    function getDisputeVotes(
        uint256 jobId,
        uint256 milestoneId
    ) external view returns (uint8 votesForFreelancer, uint8 votesForClient, uint8 totalVotes) {
        Milestone storage m = milestones[jobId][milestoneId];
        return (m.votesForFreelancer, m.votesForClient, m.totalVotes);
    }

    // -------------------------------------------------------------------------
    // Internal Functions
    // -------------------------------------------------------------------------

    /**
     * @dev Checks if all milestones of a job are settled (Paid or Refunded); if so, transitions job to Completed
     * @param jobId Unique identifier of the job
     */
    function _checkAndSetJobCompleted(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        uint256 count = job.milestoneCount;

        for (uint256 i = 0; i < count; ) {
            MilestoneStatus s = milestones[jobId][i].status;
            if (s != MilestoneStatus.Paid && s != MilestoneStatus.Refunded) {
                return;
            }
            unchecked { ++i; }
        }

        job.status = JobStatus.Completed;
        emit JobCompleted(jobId);
    }

    // -------------------------------------------------------------------------
    // Fallback & Receive
    // -------------------------------------------------------------------------

    /**
     * @dev Rejects direct ether payments to prevent unintended deposits outside createJob
     */
    receive() external payable {
        revert PlainEthTransferNotAllowed();
    }

    /**
     * @dev Rejects undefined function calls
     */
    fallback() external payable {
        revert PlainEthTransferNotAllowed();
    }
}
