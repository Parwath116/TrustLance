# TrustLance 🌐⚖️
**Decentralized Freelance Marketplace & Milestone Escrow Protocol**  
*VTU 7th/8th Semester Major Project (Course Code: BCS786 / 18CSP85)*

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x%20LTS-339933?logo=node.js)](https://nodejs.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.x-FFF100?logo=ethereum)](https://hardhat.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite)](https://vitejs.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Tests](https://img.shields.io/badge/Tests-83%20Passing-success)](#testing--verification)
[![E2E](https://img.shields.io/badge/E2E-24%2F24%20PASS-brightgreen)](#automated-end-to-end-integration-suite)
[![Platform Fee](https://img.shields.io/badge/Platform%20Fee-0%25%20Pass--Through-blue)](#key-features)

---

## 📖 Overview

TrustLance is a production-grade Web3 freelance marketplace eliminating intermediaries, platform commissions, payment delays, and arbitrary account freezes common to centralized platforms like Upwork and Fiverr. 

By leveraging self-executing Ethereum smart contracts, cryptographic wallet authentication, and decentralized multi-arbitrator quorum voting, TrustLance provides a transparent, zero-commission escrow platform where 100% of earned funds flow directly to freelancers.

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

---

## ✨ Key Features

1. **Granular Multi-Milestone Escrow**:
   - Clients fund projects by depositing ETH locked in the smart contract.
   - Payouts are released on a per-milestone basis upon client review and approval.
2. **0% Platform Fee Guarantee**:
   - 100% of escrow funds pass through to the freelancer. Zero platform rent extraction.
3. **Decentralized Dispute Resolution (Majority Quorum)**:
   - Disputed deliverables are arbitrated by independent whitelisted arbitrators.
   - Resolution executes automatically when a majority quorum ($\lfloor \text{panelSize} / 2 \rfloor + 1$) agrees.
4. **Client Review Timeout Protection (Freelancer Safeguard)**:
   - If a client fails to review submitted work within the designated `reviewWindow`, the freelancer can autonomously trigger the payout.
5. **Overdue Milestone Reclaim (Client Safeguard)**:
   - If a freelancer fails to deliver before the milestone deadline, the client can reclaim the unspent escrow funds.
6. **Zero-Password EIP-191 Cryptographic Authentication**:
   - Users authenticate by signing a cryptographically random nonce with MetaMask (`personal_sign`). No passwords or private keys are ever stored or transmitted.
7. **Idempotent Blockchain Indexer**:
   - Synchronizes on-chain events (`JobCreated`, `MilestoneApproved`, etc.) into MongoDB with deduplication across network reorgs and catch-up queries.
8. **12-Factor Runtime Configuration**:
   - Frontend reads dynamic parameters at runtime from `/config.json`, enabling a single static build to deploy across Local, Sepolia, or Mainnet environments without rebuilding source code.

---

## 📁 Repository Structure

TrustLance is organized as an npm workspaces monorepo:

```
├── contracts/                  # Hardhat EVM development suite
│   ├── contracts/              # Solidity contracts (FreelanceEscrow.sol)
│   │   └── test/               # Defensive test contracts (MaliciousAttacker, RejectingReceiver)
│   ├── scripts/                # Deployment (deploy.js) & Seeding (seedArbitrators.js)
│   ├── test/                   # 83 Unit and integration tests (Mocha/Chai)
│   └── deployments/            # Generated deployment manifests (localhost.json, sepolia.json)
├── backend/                    # Express REST API & Blockchain Indexer
│   ├── src/
│   │   ├── config/             # Environment, DB, & Contract connections
│   │   ├── middleware/         # EIP-191 JWT auth, Zod validation, Error handlers
│   │   ├── models/             # Mongoose schemas (Job, Milestone, User, Notification, etc.)
│   │   ├── routes/             # REST endpoints (/auth, /jobs, /messages, /notifications)
│   │   ├── services/           # Event Indexer service & background sync loop
│   │   └── server.js           # Express app bootstrap
│   └── tests/                  # Backend Jest test suite
├── frontend/                   # React 18 + Vite Web3 dApp
│   ├── public/                 # Static assets & runtime config.json
│   ├── src/
│   │   ├── components/         # Reusable UI widgets (Navbar, MilestoneTracker, Modals)
│   │   ├── context/            # Web3Context, AuthContext, ConfigContext
│   │   ├── pages/              # BrowseJobs, CreateJob, JobDetail, Dashboard, ArbitratorPanel
│   │   └── services/           # Axios REST client (api.js)
│   └── scripts/                # Runtime config generator (generate-config.js)
├── scripts/                    # Root test and orchestration scripts
│   └── e2e-test.js             # Automated 24-step End-to-End integration test suite
├── docs/                       # Academic & Technical Documentation
│   ├── ARCHITECTURE.md         # Layered architecture, state machines, sequence diagrams
│   ├── SECURITY.md             # Threat modeling, CEI pattern, Slither analysis
│   ├── VIVA_CHEAT_SHEET.md     # 25 deep technical viva questions for VTU examiners
│   └── REPORT_OUTLINE.md       # Complete VTU 8th-semester project report template
├── .env.example                # Canonical environment variable specification
└── package.json                # Monorepo workspaces definition & root scripts
```

---

## 🚀 Quickstart Guide (Local Development)

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x` LTS ([Download](https://nodejs.org/))
- **MongoDB**: Local MongoDB instance running on port 27017 (or optional Docker container: `docker run -d --name trustlance-mongo -p 27017:27017 mongo:7`)
- **Browser Wallet**: MetaMask extension installed in Chrome, Brave, or Firefox

### 2. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/your-username/trustlance.git
cd trustlance
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```
*(The defaults in `.env.example` are pre-configured for instant zero-config local development).*

### 4. Start Local Blockchain & Persistent Database
Open two separate terminal windows or run in background:

**Terminal 1 — Local Hardhat EVM Node:**
```bash
npm run node:local
```
*(Runs on `http://127.0.0.1:8545` with Chain ID `31337` and 20 pre-funded test accounts).*

**Terminal 2 — Persistent MongoDB 7.0 Container:**
```bash
docker run -d --name trustlance-mongo -p 27017:27017 mongo:7
```

### 5. Deploy Smart Contract & Seed Arbitrators
In your main terminal, execute:
```bash
# Deploy FreelanceEscrow.sol to the local Hardhat node
npm run deploy:local

# Whitelist initial 3 test arbitrators (Accounts #3, #4, #5)
npm run seed:arbitrators

# Generate frontend runtime configuration (/frontend/public/config.json)
npm --workspace=frontend run generate-config
```

### 6. Launch Backend & Frontend Services

**Terminal 3 — Express API & Event Indexer:**
```bash
npm run dev:backend
```
*(Listening on `http://localhost:5000` with active blockchain event listener).*

**Terminal 4 — React 18 / Vite Frontend:**
```bash
npm run dev:frontend
```
*(Open your browser at `http://localhost:5173`).*

---

## 🧪 Testing & Verification

TrustLance features multi-layered automated verification across smart contracts, API endpoints, and end-to-end user workflows.

### 1. Smart Contract Unit Tests
```bash
npm test
```
- **83 tests passing (100%)** across `FreelanceEscrow.test.js`, `MaliciousAttacker.test.js`, and `RejectingReceiver.test.js`.

### 2. Code Coverage
```bash
npm run coverage
```
- **100% Statements, 100% Functions, 100% Lines**, 96.55% Branches (defensive nonReentrant branch mathematically unreachable).

### 3. Static Analysis
```bash
npm run slither
```
- **0 High, 0 Medium, 0 Low** vulnerabilities reported by Slither.

### 4. Automated End-to-End Integration Suite
Executes all 4 core business lifecycles against the live local node and MongoDB:
```bash
npm run e2e:local
```
```
+------+------------------------------------------------------------------+----------+
| Step | Verification Check                                               | Status   |
+------+------------------------------------------------------------------+----------+
|  01  | Connect Local Hardhat Node and Initialize Test Signers           | [PASS]   |
|  02  | Whitelist 3 Independent Arbitrators (Accounts #3, #4, #5)        | [PASS]   |
|  03  | Connect MongoDB Database & Initialize Blockchain Indexer         | [PASS]   |
|  04  | Flow A: Client Creates Job #25 with 2 Milestones (0.2 ETH Escrow | [PASS]   |
|  05  | Flow A: Freelancer Accepts Job #25 -> Status InProgress          | [PASS]   |
|  06  | Flow A: Freelancer Submits Milestone #1 Deliverable              | [PASS]   |
|  07  | Flow A: Client Approves Milestone #1 -> 0.1 ETH Released to Free | [PASS]   |
|  08  | Flow A: Freelancer Submits Milestone #2 Deliverable              | [PASS]   |
|  09  | Flow A: Client Approves Milestone #2 -> Job #25 Automatically Co | [PASS]   |
|  10  | Flow A: Dual Ratings Recorded On-Chain (Freelancer: 5★, Client:  | [PASS]   |
|  11  | Flow A: MongoDB State & Real-Time Event Notifications Verified ( | [PASS]   |
|  12  | Flow B: Client Creates Job #26 (0.15 ETH) & Freelancer Submits D | [PASS]   |
|  13  | Flow B: Client Raises Dispute -> Milestone #26/0 Status Disputed | [PASS]   |
|  14  | Flow B: 3 Arbitrators Cast Votes (2 Freelancer, 1 Client) Reachi | [PASS]   |
|  15  | Flow B: Quorum Auto-Resolves Escrow -> 0.15 ETH Payout to Freela | [PASS]   |
|  16  | Flow B: MongoDB Synchronized State Matching On-Chain Settlement  | [PASS]   |
|  17  | Flow C: Client Creates Job #27 (Review Window: 1 hour) & Deliver | [PASS]   |
|  18  | Flow C: EVM Time Fast-Forwarded +3700s (Exceeding 3600s Review W | [PASS]   |
|  19  | Flow C: Freelancer Claims Escrow Payout (0.12 ETH) via Timeout   | [PASS]   |
|  20  | Flow C: MongoDB State Synchronized -> Job #27 Completed          | [PASS]   |
|  21  | Flow D: Client Creates Job #28 with Strict 30-Minute Deadline    | [PASS]   |
|  22  | Flow D: EVM Time Fast-Forwarded +2000s (Exceeding 1800s Deadline | [PASS]   |
|  23  | Flow D: Client Reclaims Escrow Refund (0.18 ETH) After Missed De | [PASS]   |
|  24  | Flow D: MongoDB State Synchronized -> Milestone Refunded, Job Co | [PASS]   |
+------+------------------------------------------------------------------+----------+
Total Checks: 24 | Passed: 24 | Failed: 0 | Time: 8.20s
```

---

## 🌐 Sepolia Testnet Deployment Guide

To deploy TrustLance to the public Ethereum Sepolia testnet:

1. Obtain Sepolia ETH from a faucet (e.g., [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/)).
2. Configure `.env` with your provider RPC URL, deployer private key, and Etherscan API key:
   ```ini
   SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
   DEPLOYER_PRIVATE_KEY="0xYOUR_VALID_32_BYTE_HEX_PRIVATE_KEY"
   ETHERSCAN_API_KEY="YOUR_ETHERSCAN_API_KEY"
   ```
3. Deploy to Sepolia:
   ```bash
   npx hardhat run contracts/scripts/deploy.js --network sepolia
   ```
4. Verify the contract on Etherscan:
   ```bash
   npx hardhat verify --network sepolia <DEPLOYED_CONTRACT_ADDRESS> 3 604800
   ```
5. Update `DEPLOYMENT_FILE=./contracts/deployments/sepolia.json` and `CHAIN_ID=11155111` in `.env`, then regenerate frontend config:
   ```bash
   npm --workspace=frontend run generate-config
   ```

---

## 📚 Academic & Documentation References

Comprehensive technical documentation is maintained in the [`docs/`](file:///c:/Users/91805/Downloads/Blockchain%20project/docs) directory:
- [**System Architecture & Sequence Flows (`docs/ARCHITECTURE.md`)**](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/ARCHITECTURE.md): Layered architecture, coupled state machine transitions, sequence diagrams, and MongoDB ER model.
- [**Security & Threat Modeling (`docs/SECURITY.md`)**](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/SECURITY.md): Threat vectors, Checks-Effects-Interactions, reentrancy defense, Slither audit findings, and coverage metrics.
- [**Technical Viva Cheat Sheet (`docs/VIVA_CHEAT_SHEET.md`)**](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/VIVA_CHEAT_SHEET.md): 25 rigorous questions and detailed answers prepared for VTU external examiners.
- [**Academic Project Report Outline (`docs/REPORT_OUTLINE.md`)**](file:///c:/Users/91805/Downloads/Blockchain%20project/docs/REPORT_OUTLINE.md): VTU 8th-semester major project report format covering Chapters 1 through 8.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE). Built for academic and research purposes under Visvesvaraya Technological University (VTU) Bachelor of Engineering regulations.
