# TrustLance Academic Project Report Outline
**Visvesvaraya Technological University (VTU), Belagavi - 590018**  
**7th/8th Semester Major Project Report Template (Course Code: BCS786 / 18CSP85)**

---

## Front Matter Template

- **Title Page**:  
  *TrustLance: A Decentralized Freelance Marketplace with Milestone Escrow and On-Chain Dispute Resolution*  
  Submitted in partial fulfillment of the requirements for the award of the degree of **Bachelor of Engineering in Computer Science & Engineering**.
- **Certificate Page**: Official departmental signature sheet (Principal, HOD, Project Guides).
- **Declaration Page**: Candidate declaration of original work.
- **Acknowledgement**: Recognition of department, guide, institutions, and open-source ecosystems.
- **Abstract**:  
  A concise 250-word synthesis of the problem, decentralized methodology, smart contract architecture, results (100% test coverage, 0-fee pass-through, automated timeout/reclaim logic), and performance characteristics.
- **Table of Contents, List of Figures, List of Tables**: Formatted with standard dot leaders and page numbering.

---

## Chapter 1: Introduction

### 1.1 Background & Context
- Rise of the global gig economy and independent knowledge work.
- Growth of digital labor platforms (Upwork, Fiverr, Freelancer.com).
- Shift toward decentralized finance (DeFi) and programmable settlement rails.

### 1.2 Problem Statement
- **High Intermediation Rents**: Legacy platforms charge 10%–20% service fees to freelancers and additional payment processing fees to clients.
- **Arbitrary Account Suspensions & Fund Freezes**: Centralized entities maintain unilateral authority to freeze earnings without judicial recourse.
- **Payment Delay & Scope Creep**: Lack of cryptographic enforcement allows clients to delay approvals or demand unpaid revisions.
- **Biased / Opaque Dispute Resolution**: Customer support agents lack technical context and resolve disputes subjectively.

### 1.3 Proposed System: TrustLance
- Decentralized, milestone-driven escrow protocol on Ethereum.
- Programmatic time-locks guaranteeing payment release upon client review timeout.
- Cryptographic deliverable hashing (IPFS / keccak256).
- Multi-arbitrator majority quorum voting for neutral dispute resolution.
- Zero platform fee model ensuring 100% pass-through of earned funds.

### 1.4 Project Objectives
1. Design, verify, and deploy a gas-optimized Ethereum smart contract (`FreelanceEscrow.sol`) handling multi-milestone escrow.
2. Implement cryptographic wallet-based authentication conforming to EIP-191.
3. Build a reactive event-driven indexing service using Node.js and MongoDB.
4. Develop a responsive, Web3-connected single-page application using React 18 and Ethers.js v6.
5. Achieve 100% branch and statement test coverage, static analysis validation via Slither, and 24/24 automated E2E integration test pass.

---

## Chapter 2: Literature Survey

### 2.1 Review of Centralized Gig Economy Systems
- Analysis of centralized business models, fee extraction mechanisms, and escrow custody risks.
- Limitations of payment processors (PayPal, Stripe) regarding chargebacks and cross-border settlement latency.

### 2.2 Existing Decentralized Freelance Protocols
- Survey of first-generation Web3 freelancing attempts (Ethlance, CanWork, Bounties Network).
- Critical analysis of why previous projects struggled: gas inefficiency, high friction UX, and lack of milestone granularity.

### 2.3 Comparative Analysis Table

| Feature / Metric | Traditional Platforms (Upwork/Fiverr) | First-Gen Web3 (Ethlance) | TrustLance (Proposed System) |
|---|---|---|---|
| **Platform Commission** | 10% – 20% + FX Fees | 0% – 5% | **0% Platform Fee** |
| **Escrow Mechanism** | Centralized bank custody | Single lump-sum escrow | **Granular Multi-Milestone Escrow** |
| **Dispute Resolution** | Centralized customer support | Single owner arbitrator | **Multi-Arbitrator Majority Quorum** |
| **Inactivity Protection** | Subjective ticket appeal | None (funds locked) | **Automated Review Timeout Payout** |
| **Overdue Protection** | Manual cancellation request | None | **Automated Milestone Escrow Reclaim** |
| **Authentication** | Email / Password + KYC | Raw private key / Basic Web3 | **EIP-191 Nonce Challenge (Zero Passwords)** |
| **User Interface** | Server-rendered Web2 | Static Web3 dApp | **Real-Time SaaS UI with Dynamic Config** |

---

## Chapter 3: System Requirements & Specification

### 3.1 Functional Requirements
- **FR1 (User Onboarding)**: Connect browser wallet and authenticate via EIP-191 signature without passwords.
- **FR2 (Job Creation)**: Client defines job title, description, and $N$ milestones with individual ETH amounts, deadlines, and review windows.
- **FR3 (Fund Custody)**: Contract locks `msg.value == sum(milestoneAmounts)` in escrow upon job creation.
- **FR4 (Milestone Execution)**: Freelancers submit deliverable hashes; clients approve deliverables triggering instantaneous ETH payouts.
- **FR5 (Timeout Release)**: Freelancers can unilaterally claim escrow if the client fails to review within `reviewWindow`.
- **FR6 (Overdue Refund)**: Clients can reclaim escrow if the freelancer misses the milestone deadline without submission.
- **FR7 (Dispute Arbitration)**: Whitelisted arbitrators vote on disputed deliverables; reaching quorum ($\lfloor \text{panelSize}/2 \rfloor + 1$) triggers automated payout.
- **FR8 (Dual Reputation)**: Mutual 1–5 star rating submissions recorded immutably on-chain upon job completion.

### 3.2 Non-Functional Requirements
- **Security**: Zero reentrancy vulnerabilities, strict CEI pattern enforcement, rejection of untracked ETH transfers.
- **Gas Efficiency**: Struct packing within 32-byte storage slots, custom errors instead of string reverts.
- **Idempotency**: Blockchain event indexer handles re-orgs and duplicate log ingestion without state corruption.
- **Availability & Portability**: 12-Factor App design supporting runtime environment configuration without Docker rebuilds.

### 3.3 Hardware & Software Specification
- **Hardware**: Developer Workstation (8+ Core CPU, 16 GB RAM, 256 GB SSD).
- **Software Stack**:
  - Operating System: Windows 11 / Linux (Ubuntu 22.04 LTS).
  - Node.js Runtime: v20.x / v22.x LTS.
  - Smart Contract Toolchain: Hardhat 2.22.x, Solidity 0.8.24, OpenZeppelin Contracts v5.
  - Backend API: Express 4, Mongoose 8, Zod, JWT.
  - Database: MongoDB 7.0 Community Edition.
  - Frontend: React 18, Vite, Ethers.js v6.
  - Containerization: Docker 28.x & Docker Compose v2.

---

## Chapter 4: System Design & Architecture

### 4.1 High-Level Architectural Model
*(Reference [`docs/ARCHITECTURE.md`](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/ARCHITECTURE.md#L1-L40))*
- Client Presentation Tier, Smart Contract Execution Tier, Application & Indexing Tier, Persistent Database Tier.

### 4.2 Smart Contract State Machine Design
*(Reference [`docs/ARCHITECTURE.md`](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/ARCHITECTURE.md#L42-L85))*
- Coupled lifecycle between `JobStatus` (5 states) and `MilestoneStatus` (6 states).
- Mathematical quorum state transitions.

### 4.3 UML Behavioral & Interaction Diagrams
- **Use Case Diagram**: Client, Freelancer, Arbitrator, and System interactions.
- **Sequence Diagrams**:
  - Happy Path Execution & Escrow Release.
  - Milestone Dispute Arbitration.
  - Autonomous Review Timeout Claim.
  - Overdue Milestone Refund.

### 4.4 Data Modeling
*(Reference [`docs/ARCHITECTURE.md`](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/ARCHITECTURE.md#L180-L245))*
- Relational projection on MongoDB document schemas (`User`, `Job`, `Milestone`, `Message`, `Notification`, `ChainEvent`, `SyncState`).

---

## Chapter 5: Implementation Details

### 5.1 Smart Contract Layer (`FreelanceEscrow.sol`)
- Algorithm for multi-milestone validation:
  $$\sum_{i=0}^{n-1} \text{milestoneAmounts}[i] == \text{msg.value}$$
- Low-level ETH transfer implementation:
  ```solidity
  (bool sent, ) = payable(recipient).call{value: amount}("");
  if (!sent) revert TransferFailed();
  ```
- Storage packing layout (`uint48` timestamps, `uint8` enums).

### 5.2 Cryptographic Wallet Authentication
- EIP-191 Personal Sign implementation.
- Elliptic curve recovery (`ecrecover`) in `ethers.verifyMessage`.
- Nonce invalidation logic on the authentication endpoint.

### 5.3 Reactive Event Indexer Service
- Catch-up block scanning with persistent cursor storage in `SyncState`.
- Idempotent upsert handlers using MongoDB compound indexes `{ txHash: 1, logIndex: 1 }`.

### 5.4 Frontend Single-Page Application
- Dynamic runtime configuration injection via `/public/config.json`.
- EIP-1193 MetaMask wallet provider integration and network switching logic.
- Bounded on-chain scanning fallback (`MAX_SCAN = 50`) for resilient job browsing.

---

## Chapter 6: Testing & Results

### 6.1 Smart Contract Unit Testing
- 83 Hardhat unit tests executed with Mocha/Chai.
- Test scenarios: Job creation, milestone approvals, dispute quorum, edge-case invalid transitions, non-reentrancy verification.
- **Coverage**: 100% Statements, 100% Functions, 100% Lines, 96.55% Branches.

### 6.2 Static Analysis & Security Verification
- Slither static analysis run results: 0 High, 0 Medium, 0 Low vulnerabilities.
- Verification of test-only contracts: `MaliciousAttacker.sol` and `RejectingReceiver.sol`.

### 6.3 End-to-End (E2E) Integration Testing
- 24 automated integration test steps executed via `npm run e2e:local` against persistent MongoDB.
- Validation of:
  - Flow A: Happy Path (0.2 ETH deposit, 2 milestones approved, dual 5★/4★ ratings).
  - Flow B: Dispute Quorum (0.15 ETH disputed, 2 Freelancer vs 1 Client votes, auto-payout to freelancer).
  - Flow C: Client Review Timeout (+3700s EVM fast-forward, 0.12 ETH timeout release).
  - Flow D: Overdue Milestone Reclaim (+2000s EVM fast-forward, 0.18 ETH client refund).

### 6.4 Gas Consumption Analysis

| Transaction Function | Average Gas Used (units) | Estimated Cost @ 20 Gwei (ETH) |
|---|---|---|
| Contract Deployment | ~1,850,000 | 0.0370 ETH |
| `createJob` (2 Milestones) | ~185,000 | 0.0037 ETH |
| `acceptJob` | ~45,000 | 0.0009 ETH |
| `submitMilestone` | ~68,000 | 0.0013 ETH |
| `approveMilestone` (Payout) | ~52,000 | 0.0010 ETH |
| `raiseDispute` | ~42,000 | 0.0008 ETH |
| `voteOnDispute` (Quorum Trigger) | ~78,000 | 0.0015 ETH |
| `rateUser` | ~48,000 | 0.0009 ETH |

---

## Chapter 7: Conclusion & Future Work

### 7.1 Conclusion
TrustLance demonstrates that decentralized milestone escrow and multi-party arbitration protocols can eliminate high platform commissions, mitigate payment delays, and provide transparent dispute resolution without sacrificing user convenience.

### 7.2 Future Enhancements
1. **Layer 2 (L2) Rollup Integration**: Deployment to Arbitrum or Optimism to reduce transaction costs by 95%+.
2. **Zero-Knowledge (ZK) Identity & Reputation**: Integration of Semaphore / ZK-SNARKs allowing freelancers to prove high ratings without revealing client identities.
3. **ERC-20 Stablecoin Support**: Adding support for USDC and DAI escrow deposits to insulate freelancers from ETH price volatility.
4. **Decentralized Storage (IPFS / Arweave)**: Native browser file uploads pinned to IPFS via Web3.Storage.

---

## Chapter 8: References

1. Nakamoto, S. (2008). *Bitcoin: A Peer-to-Peer Electronic Cash System*.
2. Buterin, V. (2014). *A Next-Generation Smart Contract and Decentralized Application Platform*. Ethereum White Paper.
3. OpenZeppelin. (2024). *OpenZeppelin Contracts v5.0 Documentation*. OpenZeppelin.
4. Ethereum Improvement Proposals. (2016). *EIP-191: Signed Data Standard*.
5. Hardhat Development Team. (2024). *Hardhat: Ethereum Development Environment for Professionals*. Nomic Foundation.
6. Visvesvaraya Technological University. (2024). *Guidelines for Preparation of B.E. Project Reports*. VTU Regulations.
