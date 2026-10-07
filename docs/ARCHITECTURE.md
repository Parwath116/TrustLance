# TrustLance Architecture Specification
**VTU 7th/8th Semester Major Project (Course Code: BCS786)**  
**System Architecture, State Machines, Sequence Flows, and Data Models**

---

## 1. Executive Summary & System Architecture

TrustLance is a decentralized, milestone-based freelance marketplace and escrow protocol built on the Ethereum Virtual Machine (EVM). It eliminates intermediaries, payment delays, platform commission fees, and opaque dispute resolutions common to centralized platforms (e.g., Upwork, Fiverr) through self-executing smart contracts, cryptographic wallet authentication, and multi-arbitrator decentralized quorum resolution.

```
+---------------------------------------------------------------------------------------+
|                                    PRESENTATION TIER                                  |
|  React 18 + Vite SPA | Tailwind SaaS UI | Ethers.js v6 | Runtime /config.json Injection|
|  [Client Workspace]     [Freelancer Workspace]     [Dispute Panel]     [Public Jobs]  |
+-------------------------------------------+-------------------------------------------+
                                            |
                         +------------------+------------------+
                         |                                     |
                         v RPC (EIP-1193)                      v REST (HTTP + JWT)
+-------------------------------------------------+  +----------------------------------+
|                BLOCKCHAIN TIER                  |  |         APPLICATION TIER         |
|                                                 |  |                                  |
|  FreelanceEscrow.sol (Solidity 0.8.24)          |  |  Node.js 20 + Express 4          |
|  - Escrow Fund Custody                          |  |  - EIP-191 Nonce Challenge Auth  |
|  - Milestone State Transitions                  |  |  - Zod Input Validation          |
|  - Timeout & Overdue Automations                |  |  - Off-Chain Messaging & Ratings |
|  - Multi-Arbitrator Majority Voting             |  |  - User Metadata & Profiles      |
|  - 0% Platform Fee Pass-Through                 |  |                                  |
|                                                 |  +-----------------+----------------+
|  [Hardhat Local Node (31337) / Sepolia (11155111)]                   |
+------------------------+------------------------+                    |
                         | EVM Logs / Receipts                         |
                         v                                             v
+-------------------------------------------------+  +----------------------------------+
|              BLOCKCHAIN INDEXER                 |  |         DATA STORE TIER          |
|                                                 |  |                                  |
|  Event Ingestion Service (Ethers v6)            |  |  MongoDB 7.0 Persistent Store    |
|  - Polling Event Filter & Catch-Up Sync         |  |  - Jobs & Milestone Cache        |
|  - Idempotent logIndex Deduplication            |==>  - Transaction Event History     |
|  - Real-Time MongoDB State Projection           |  |  - User Profiles & Chat Messages |
|  - Notification Dispatcher                      |  |  - SyncState Block Cursor        |
+-------------------------------------------------+  +----------------------------------+
```

### 1.1 Layer Separation of Concerns

1. **Presentation Tier (Frontend)**:
   - Built with React 18, Vite, and modern SaaS CSS.
   - Interacts with the blockchain through `ethers.js v6` via browser wallets (MetaMask / EIP-1193 provider).
   - Reads runtime settings from [`/config.json`](file:///c:/Users/91805/Downloads/Blockchain%20project/frontend/public/config.json), completely decoupling compilation from deployment environments (12-Factor App methodology).
   - Real-time optimistic UI synchronized with on-chain states and off-chain indexed metadata.

2. **Blockchain Tier (Smart Contracts)**:
   - Solidity `0.8.24` contract [`FreelanceEscrow.sol`](file:///c:/Users/91805/Downloads/Blockchain%20project/contracts/contracts/FreelanceEscrow.sol).
   - Inherits OpenZeppelin v5 [`Ownable`](file:///c:/Users/91805/Downloads/Blockchain%20project/contracts/node_modules/@openzeppelin/contracts/access/Ownable.sol) and [`ReentrancyGuard`](file:///c:/Users/91805/Downloads/Blockchain%20project/contracts/node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol).
   - Serves as the immutable single source of truth for funds custody, milestone completion, and dispute arbitration.
   - Enforces a 0% platform fee, routing 100% of escrow funds directly to service providers or back to clients.

3. **Application & Indexing Tier (Backend & Indexer)**:
   - Express 4 server providing REST endpoints for user authentication, off-chain communication, and notifications.
   - Authenticates users using cryptographic signatures (EIP-191 personal sign) on one-time server nonces.
   - Asynchronous blockchain indexer listening to smart contract logs with automatic replay recovery and persistent block cursor tracking (`SyncState`).
   - Idempotent upserts ensuring consistent state even during blockchain re-organizations.

4. **Data Tier (Persistence)**:
   - MongoDB 7.0 document database for structured fast query access, chat logs, user profiles, and event audit trails.
   - Hardhat local node (`http://127.0.0.1:8545`, Chain ID `31337`) for zero-cost rapid deterministic execution and Ethereum Sepolia (`Chain ID 11155111`) for public testnet deployment.

---

## 2. Smart Contract State Machine

The smart contract manages two coupled state machines: **Job Status** and **Milestone Status**.

### 2.1 State Definitions

#### Job Status (`enum JobStatus`)
- **`Open (0)`**: Job created by client; total milestone escrow funds deposited and locked in the contract.
- **`InProgress (1)`**: Freelancer accepted the job. Milestone deliverables can now be submitted.
- **`Completed (2)`**: All milestones settled (either `Paid` or `Refunded`). Escrow account balance is zero.
- **`Cancelled (3)`**: Client cancelled the job before acceptance by freelancer. 100% of deposited escrow refunded.

#### Milestone Status (`enum MilestoneStatus`)
- **`Pending (0)`**: Milestone awaiting work submission by freelancer.
- **`Submitted (1)`**: Freelancer submitted deliverable with IPFS/URI proof. Review timer initiated.
- **`Paid (2)`**: Approved by client, claimed via review timeout, or resolved in favor of freelancer by arbitrators. Escrow funds transferred to freelancer.
- **`Refunded (3)`**: Reclaimed by client after overdue deadline, or resolved in favor of client by arbitrators. Escrow funds returned to client.
- **`Disputed (4)`**: Client raised a dispute within the review period. Funds frozen pending arbitration.

### 2.2 State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> JobOpen: client creates Job (deposits ETH)
    
    JobOpen --> JobCancelled: client cancels before acceptance (100% refund)
    JobOpen --> JobInProgress: freelancer accepts Job
    
    state JobInProgress {
        [*] --> MilestonePending
        
        MilestonePending --> MilestoneSubmitted: freelancer submits deliverable (deliverableURI)
        MilestonePending --> MilestoneRefunded: client reclaims overdue milestone (deadline passed)
        
        MilestoneSubmitted --> MilestonePaid: client approves deliverable (ETH paid to freelancer)
        MilestoneSubmitted --> MilestonePaid: freelancer claims timeout payment (review period expired)
        MilestoneSubmitted --> MilestoneDisputed: client raises dispute within review period
        
        MilestoneDisputed --> MilestonePaid: arbitrators reach majority quorum for Freelancer (ETH paid to freelancer)
        MilestoneDisputed --> MilestoneRefunded: arbitrators reach majority quorum for Client (ETH refunded to client)
    }
    
    JobInProgress --> JobCompleted: all milestones Paid or Refunded
    JobCancelled --> [*]
    JobCompleted --> [*]
```

---

## 3. End-to-End Sequence Diagrams

### 3.1 Flow A: Happy Path Lifecycle & Dual-Sided Rating

```mermaid
sequenceDiagram
    autonumber
    actor Client
    actor Freelancer
    participant Frontend
    participant SmartContract as FreelanceEscrow.sol
    participant Indexer as Blockchain Indexer
    participant DB as MongoDB

    Client->>Frontend: Fill Job Form (Title, Budget, Milestones)
    Frontend->>SmartContract: createJob(title, desc, milestones) [value: 0.2 ETH]
    SmartContract->>SmartContract: Store Job & Milestones, Lock ETH
    SmartContract-->>Indexer: emit JobCreated(jobId, client, amount)
    Indexer->>DB: Upsert Job (Status: Created)
    
    Freelancer->>Frontend: View Job & Click "Accept Job"
    Frontend->>SmartContract: acceptJob(jobId)
    SmartContract->>SmartContract: Set status = InProgress, freelancer = msg.sender
    SmartContract-->>Indexer: emit JobAccepted(jobId, freelancer)
    Indexer->>DB: Update Job (Status: InProgress, freelancer address)
    
    Freelancer->>Frontend: Submit Milestone Deliverable (IPFS hash)
    Frontend->>SmartContract: submitMilestone(jobId, milestoneId, ipfsHash)
    SmartContract->>SmartContract: Set milestone status = Submitted, submissionTime = now
    SmartContract-->>Indexer: emit MilestoneSubmitted(jobId, milestoneId)
    Indexer->>DB: Update Milestone (Status: Submitted)
    
    Client->>Frontend: Review Work & Click "Approve"
    Frontend->>SmartContract: approveMilestone(jobId, milestoneId)
    SmartContract->>SmartContract: Set status = Approved
    SmartContract->>Freelancer: Transfer 0.1 ETH via call{value}()
    SmartContract-->>Indexer: emit MilestoneApproved(jobId, milestoneId)
    Indexer->>DB: Update Milestone (Status: Approved)
    
    Note over SmartContract: Upon approving final milestone, Job auto-transitions to Completed
    SmartContract-->>Indexer: emit JobCompleted(jobId)
    Indexer->>DB: Update Job (Status: Completed)
    
    Client->>Frontend: Rate Freelancer (5 Stars, "Excellent Work")
    Frontend->>SmartContract: rateUser(jobId, freelancer, 5, "Excellent Work")
    SmartContract->>SmartContract: Update freelancer on-chain reputation profile
    SmartContract-->>Indexer: emit RatingSubmitted(jobId, client, freelancer, 5)
    Indexer->>DB: Record Rating & Update User aggregate score
```

---

### 3.2 Flow B: Milestone Dispute & Quorum Resolution

```mermaid
sequenceDiagram
    autonumber
    actor Client
    actor Freelancer
    actor Arbitrator1
    actor Arbitrator2
    participant SmartContract as FreelanceEscrow.sol
    participant Indexer as Blockchain Indexer
    participant DB as MongoDB

    Note over Client,Freelancer: Milestone is in Submitted state
    Client->>SmartContract: raiseDispute(jobId, milestoneId, "Deliverable does not meet spec")
    SmartContract->>SmartContract: Set milestone status = Disputed
    SmartContract-->>Indexer: emit DisputeRaised(jobId, milestoneId, client)
    Indexer->>DB: Update Milestone (Status: Disputed) & Dispatch Notifications
    
    Arbitrator1->>SmartContract: voteOnDispute(jobId, milestoneId, Vote.Freelancer)
    SmartContract->>SmartContract: Record vote (Freelancer: 1, Client: 0)
    SmartContract-->>Indexer: emit DisputeVoteCast(jobId, milestoneId, arb1, Vote.Freelancer)
    
    Arbitrator2->>SmartContract: voteOnDispute(jobId, milestoneId, Vote.Freelancer)
    SmartContract->>SmartContract: Record vote (Freelancer: 2, Client: 0)
    Note over SmartContract: Quorum reached: votes >= (panelSize / 2) + 1 (2 >= 2)
    SmartContract->>SmartContract: Set status = Resolved, winner = Freelancer
    SmartContract->>Freelancer: Transfer 0.15 ETH via call{value}()
    SmartContract-->>Indexer: emit DisputeResolved(jobId, milestoneId, Freelancer, 0.15 ETH)
    Indexer->>DB: Update Milestone (Status: Resolved, winner: Freelancer)
```

---

### 3.3 Flow C: Client Review Timeout Autonomous Payout

```mermaid
sequenceDiagram
    autonumber
    actor Freelancer
    actor Client
    participant SmartContract as FreelanceEscrow.sol
    participant Indexer as Blockchain Indexer

    Freelancer->>SmartContract: submitMilestone(jobId, milestoneIndex, ipfsHash)
    SmartContract->>SmartContract: Set submissionTime = block.timestamp
    Note over Client: Client is unresponsive for > reviewWindow (e.g. 7 days / test 3600s)
    
    Freelancer->>SmartContract: claimTimeoutPayment(jobId, milestoneIndex)
    SmartContract->>SmartContract: Assert block.timestamp >= submissionTime + reviewWindow
    SmartContract->>SmartContract: Set status = Approved
    SmartContract->>Freelancer: Transfer milestone funds (0.12 ETH)
    SmartContract-->>Indexer: emit MilestoneApproved(jobId, milestoneIndex)
    SmartContract-->>Indexer: emit TimeoutPaymentClaimed(jobId, milestoneIndex, freelancer)
```

---

### 3.4 Flow D: Overdue Milestone Escrow Refund

```mermaid
sequenceDiagram
    autonumber
    actor Client
    actor Freelancer
    participant SmartContract as FreelanceEscrow.sol
    participant Indexer as Blockchain Indexer

    Note over Client,Freelancer: Milestone is Pending. Deadline passes without submission.
    Note over SmartContract: block.timestamp > milestone.deadline && status == Pending
    
    Client->>SmartContract: reclaimOverdueMilestone(jobId, milestoneIndex)
    SmartContract->>SmartContract: Assert block.timestamp > deadline && status == Pending
    SmartContract->>SmartContract: Set status = Refunded
    SmartContract->>Client: Refund milestone funds (0.18 ETH)
    SmartContract-->>Indexer: emit MilestoneRefunded(jobId, milestoneIndex)
```

---

## 4. Database Schema & Entity-Relationship Model

```mermaid
erDiagram
    User ||--o{ Job : creates_as_client
    User ||--o{ Job : performs_as_freelancer
    User ||--o{ Message : sends_or_receives
    User ||--o{ Notification : receives
    Job ||--|{ Milestone : embeds_array
    Job ||--o{ Message : has_chat_history
    Job ||--o{ ChainEvent : relates_to
    
    User {
        string address PK "lowercase unique ethereum address"
        string nonce "random crypto challenge string"
        string role "client | freelancer | both | arbitrator"
        string name "User display name"
        string bio "User biography"
        string_array skills "Array of skill tags"
        date createdAt "Timestamp"
        date updatedAt "Timestamp"
    }
    
    Job {
        number onchainId PK "On-chain job ID from contract"
        string txHash "Creation transaction hash"
        string metadataHash "keccak256 hash matching on-chain bytes32"
        string metadataRaw "Raw unparsed JSON metadata string"
        string metadata_title "Nested: metadata.title"
        string metadata_description "Nested: metadata.description"
        string metadata_category "Nested: metadata.category"
        string_array metadata_skills "Nested: metadata.skills array"
        string client FK "Client wallet address"
        string freelancer FK "Freelancer wallet address (nullable)"
        string status "Open | InProgress | Completed | Cancelled"
        string totalAmountWei "Total escrow budget in wei"
        number reviewPeriod "Client review window in seconds"
        date createdAt "Timestamp"
        date updatedAt "Timestamp"
    }
    
    Milestone {
        number milestoneId PK "Embedded milestone index (0, 1, ...)"
        string title "Milestone title"
        string amountWei "Milestone escrow amount in wei"
        number deadline "Unix timestamp deadline"
        string status "Pending | Submitted | Paid | Refunded | Disputed"
        string deliverableURI "IPFS CID or deliverable URL"
        number submittedAt "Unix timestamp of submission"
    }

    Message {
        objectId _id PK "MongoDB ObjectID"
        number jobId FK "Context job onchainId"
        string from FK "Sender wallet address"
        string to FK "Recipient wallet address"
        string text "Message content string"
        date createdAt "Timestamp"
    }

    Notification {
        objectId _id PK "MongoDB ObjectID"
        string address FK "Recipient wallet address"
        string type "Event type classification"
        string message "Human readable notification copy"
        number jobId FK "Associated job onchainId"
        boolean read "Read status flag (default: false)"
        date createdAt "Timestamp"
    }

    ChainEvent {
        objectId _id PK "MongoDB ObjectID"
        string name "Event name (e.g. JobCreated, MilestonePaid)"
        number blockNumber "Block height"
        string txHash "Transaction hash (compound index part 1)"
        number logIndex "Log index (compound index part 2, dedup)"
        date createdAt "Timestamp"
    }

    SyncState {
        string key PK "sync_state_singleton"
        number lastBlock "Highest processed block number"
        date updatedAt "Timestamp"
    }
```

---

## 5. Key Architectural & Gas Optimization Decisions

1. **Storage Layout & Variable Packing**:
   - Timestamps stored as `uint48` (sufficient for 8.9 million years) and enums as `uint8`, allowing multiple variables to pack within single 32-byte EVM storage slots, reducing `SSTORE` (20,000 gas) and `SLOAD` (2,100 gas) operations.

2. **Custom Errors vs. String Reverts**:
   - Replaced all `require(cond, "Long string error message")` with Solidity 0.8 custom errors (e.g., `error InvalidMilestoneAmount()`).
   - Cuts contract deployment bytecode significantly and saves ~50–300 gas on every reverted transaction by returning only a 4-byte selector rather than ABI-encoded strings.

3. **Zero Platform Fee Direct Payouts**:
   - 0% platform fee eliminates fee-splitting math, secondary treasury accounting, and reentrancy vectors associated with external fee transfers. 100% of escrowed funds flow directly to the recipient via `call{value: amount}("")`.

4. **Checks-Effects-Interactions (CEI) & Mutex**:
   - All state mutations (`milestone.status = Approved`, `job.completedMilestones++`) execute before external ETH transfers.
   - Guarded with OpenZeppelin's `nonReentrant` modifier, providing multi-layered defense-in-depth against reentrancy.

5. **Runtime `/config.json` Configuration**:
   - Standard Vite projects bake environment variables (`VITE_*`) into static bundles at build time. TrustLance uses dynamic runtime fetching of `/config.json` generated at application startup or deployment (`generate-config.js`), allowing the exact same compiled frontend bundle to serve across local Hardhat, Sepolia testnet, or Ethereum mainnet without rebuilds.
