# TrustLance Live Demonstration & Viva Presentation Script
**VTU 7th/8th Semester Major Project (Course Code: BCS786)**  
**Step-by-Step Manual Demonstration Script for Sepolia Testnet & Localhost**

---

## 1. Account Roles & Setup

For a live demonstration in front of external examiners, prepare 5 accounts in your browser wallet (MetaMask).

| Account Role | Local Hardhat Address / Index | Sepolia Setup | Notes |
|---|---|---|---|
| **Deployer / Owner** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Account #0) | Sepolia Wallet #0 | Deploys contract, sets panel size, whitelists arbitrators. |
| **Client** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Account #1) | Sepolia Wallet #1 | Creates job, deposits escrow ETH, reviews deliverables, approves/disputes. |
| **Freelancer** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (Account #2) | Sepolia Wallet #2 | Accepts job, submits milestone deliverables, receives escrow payouts. |
| **Arbitrator 1** | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` (Account #3) | Sepolia Wallet #3 | Whitelisted arbitrator, votes on disputed milestones. |
| **Arbitrator 2** | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` (Account #4) | Sepolia Wallet #4 | Whitelisted arbitrator, provides majority quorum. |
| **Arbitrator 3** | `0x9965507D1a55bcC63804C4438f4425382856D498` (Account #5) | Sepolia Wallet #5 | Whitelisted arbitrator (reserve/third vote). |

---

## 2. Click-by-Click Demonstration Steps

### Scene 1: Cryptographic Authentication (Zero Passwords)
1. Open the TrustLance frontend at `http://localhost:5173` (or production URL).
2. Open MetaMask and switch to **Account #1 (Client)**.
3. Click **"Connect Wallet"** in the navigation bar.
4. MetaMask prompts for an **EIP-191 Personal Sign** request displaying a human-readable message and cryptographic nonce:
   ```
   Sign to authenticate with TrustLance:
   Nonce: 3f9a7b2c...
   ```
5. Click **"Sign"**. The navigation bar immediately reflects the authenticated address `0x7099...79C8`.

> 🗣️ **What to say to the Viva Panel**:
> *"Notice examiners, TrustLance requires no email, password, or third-party OAuth provider. Authentication is achieved through asymmetric cryptography (EIP-191). The user signs a server challenge nonce locally in their secure enclave. The server recovers the signer address using elliptic curve point recovery, completely eliminating password theft and database credential leaks."*

---

### Scene 2: Job Creation with Milestone-Based Escrow Deposit
1. Click **"Create Job"** in the navigation bar.
2. Fill out the job creation form:
   - **Title**: `Full-Stack dApp Development for Decentralized Escrow`
   - **Category**: `Development`
   - **Description**: `Deliver smart contract integration and responsive React frontend.`
3. Add Two Milestones:
   - **Milestone 1**:
     - *Title*: `Smart Contract Integration & Unit Tests`
     - *Amount*: `0.05 ETH`
     - *Deadline*: Pick a future date (or default 7 days)
     - *Review Window*: `7 days`
   - **Milestone 2**:
     - *Title*: `Frontend UI & Deployment`
     - *Amount*: `0.05 ETH`
     - *Deadline*: Pick a subsequent future date (e.g. +14 days)
     - *Review Window*: `7 days`
4. Notice the **Total Escrow Budget** calculates automatically to `0.10 ETH`.
5. Click **"Deploy Job & Deposit Escrow (0.10 ETH)"**.
6. MetaMask pops up showing a payable transaction calling `createJob` with `value: 0.1 ETH`. Click **"Confirm"**.
7. Wait 2 seconds. The transaction receipt is mined, and the modal shows: `Transaction Confirmed! Job #1 Created`.
8. The page automatically redirects to the new job's detail view.

> 🗣️ **What to say to the Viva Panel**:
> *"When the client creates the job, 100% of the funds (0.10 ETH) are transferred into the smart contract's custody. The client cannot unilaterally withdraw these funds once accepted, nor can the platform admin seize them. The funds are mathematically locked by code, eliminating payment uncertainty for the freelancer."*

---

### Scene 3: Freelancer Job Acceptance
1. Open MetaMask and switch to **Account #2 (Freelancer)**.
2. The UI detects the account change and prompts to sign the EIP-191 nonce for Account #2. Click **"Sign"**.
3. Navigate to **"Browse Jobs"** (`/jobs`).
4. Click on the newly created job: `Full-Stack dApp Development for Decentralized Escrow`.
5. The button displays **"Accept Job"**. Click it.
6. MetaMask prompts a call to `acceptJob(jobId)`. Click **"Confirm"**.
7. Once mined, the job status instantly flips from `Created (0)` to `InProgress (1)`. The Freelancer workspace is now active.

> 🗣️ **What to say to the Viva Panel**:
> *"The status transition to InProgress is enforced on-chain. As soon as this state is reached, the client's unilateral cancellation privilege is revoked, protecting the freelancer from front-running cancellations after committing time."*

---

### Scene 4: Milestone 1 Submission & Client Approval (Happy Path Payout)
1. **As Freelancer (Account #2)**:
   - Scroll to Milestone #1: `Smart Contract Integration & Unit Tests`.
   - In the submission field, enter an IPFS CID or repository link:  
     `ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco`
   - Click **"Submit Deliverable"**.
   - Confirm the transaction in MetaMask calling `submitMilestone(jobId, 0, uri)`.
   - Milestone status turns to `Submitted`. The review countdown timer starts.
2. **Switch MetaMask to Account #1 (Client)**:
   - Sign authentication nonce. Refresh or view Job Detail.
   - Milestone #1 now displays the submitted deliverable link along with two buttons: **"Approve Milestone"** and **"Raise Dispute"**.
   - Click **"Approve Milestone"**.
   - MetaMask prompts transaction calling `approveMilestone(jobId, 0)`.
   - **Show Examiners**: Check Account #2 (Freelancer)'s balance before and after. Click **"Confirm"**.
   - Once mined, Milestone #1 status turns to `Approved`, and exactly `0.05 ETH` is transferred directly to the Freelancer wallet.

> 🗣️ **What to say to the Viva Panel**:
> *"Notice the zero platform fee: the freelancer received exactly 0.05 ETH without a 20% deduction as seen on platforms like Upwork. Furthermore, the Checks-Effects-Interactions pattern executed inside approveMilestone guarantees that state changes are finalized before external calls, precluding reentrancy attacks."*

---

### Scene 5: Milestone 2 Dispute & Decentralized Arbitrator Quorum
Now demonstrate dispute handling on Milestone #2.

1. **Submit Milestone 2 as Freelancer (Account #2)**:
   - Switch to Freelancer in MetaMask.
   - Under Milestone #2, enter: `https://github.com/example/trustlance/pull/42`
   - Click **"Submit Deliverable"** and confirm in MetaMask.
   - Milestone #2 status turns to `Submitted`.
2. **Raise Dispute as Client (Account #1)**:
   - Switch to Client in MetaMask.
   - On Milestone #2, click **"Raise Dispute"**.
   - A modal opens requesting dispute details:
     - Reason: `Deliverable fails security requirements; missing test coverage.`
   - Click **"Confirm Dispute"**.
   - Confirm transaction in MetaMask calling `raiseDispute(jobId, 1, reason)`.
   - Milestone #2 status immediately transitions to `Disputed`. Funds (0.05 ETH) remain securely frozen in contract custody.
3. **Arbitrator #1 Casts Vote**:
   - Switch MetaMask to **Account #3 (Arbitrator 1)**.
   - Navigate to **"Dispute Panel"** (`/arbitrator`).
   - The dispute appears: `Job #1 - Milestone #2: Disputed`.
   - The panel displays the client's reason, the freelancer's deliverable link, and voting buttons: **"Vote Freelancer"** and **"Vote Client"**.
   - Click **"Vote Freelancer"**.
   - Confirm transaction calling `voteOnDispute(jobId, 1, Vote.Freelancer)`.
   - The on-chain vote tally updates: `Freelancer: 1 | Client: 0 (Quorum needed: 2)`.
4. **Arbitrator #2 Casts Decisive Vote (Quorum Settlement)**:
   - Switch MetaMask to **Account #4 (Arbitrator 2)**.
   - Navigate to `/arbitrator`.
   - Click **"Vote Freelancer"**.
   - Confirm transaction in MetaMask.
   - **Crucial Moment**: As soon as this second vote is mined, the smart contract detects that Freelancer votes have reached $\lfloor 3 / 2 \rfloor + 1 = 2$.
   - The contract automatically transitions Milestone #2 to `Resolved` and transfers the remaining `0.05 ETH` escrow balance to the Freelancer!
   - Because all milestones are now settled, the entire Job automatically transitions to `Completed (2)`.

> 🗣️ **What to say to the Viva Panel**:
> *"Notice the power of decentralized governance: no single admin or platform employee had unilateral power to confiscate funds. Resolution required a mathematical majority quorum across independent arbitrators. The second the threshold was reached, the smart contract itself executed the payout atomically in the same transaction."*

---

### Scene 6: Dual On-Chain Reputation Exchange
1. Both Client and Freelancer now see the **"Rate Experience"** prompt on the completed job.
2. **Client rates Freelancer**:
   - Score: `5 Stars`
   - Review: `Excellent work despite the dispute discussion; code verified.`
   - Confirms transaction calling `rateUser(jobId, freelancer, 5, review)`.
3. **Freelancer rates Client**:
   - Score: `4 Stars`
   - Review: `Prompt communication during arbitration.`
   - Confirms transaction calling `rateUser(jobId, client, 4, review)`.
4. Navigate to user **Profile** (`/profile`). The cumulative rating score, review count, and on-chain verified badge are displayed.

> 🗣️ **What to say to the Viva Panel**:
> *"These ratings are stored immutably on the Ethereum blockchain. Unlike centralized platforms where clients can threaten negative reviews for unpaid work, ratings on TrustLance can only be submitted after all escrow milestones have settled, preventing review blackmail and sybil manipulation."*

---

## 3. Quick Reference for Viva Questions During Demo

- **Q: Can the client take back their money after the freelancer begins work?**  
  *A: No. `cancelJob` is only callable when `status == Created`. Once the freelancer accepts, status is `InProgress`, locking the cancel function.*
- **Q: What if the client simply disappears and never approves?**  
  *A: The freelancer invokes `claimTimeoutPayment` once the `reviewWindow` expires, autonomously withdrawing the milestone escrow.*
- **Q: What if the freelancer disappears without submitting work?**  
  *A: The client invokes `reclaimOverdueMilestone` once the `deadline` expires, autonomously reclaiming their deposit.*
- **Q: How does the backend know what happened on the blockchain?**  
  *A: The backend runs an asynchronous Event Indexer listening to EVM log topics. It stores idempotent event records in MongoDB for sub-10ms UI performance.*
