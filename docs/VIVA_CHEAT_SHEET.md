# TrustLance Technical Viva Voce Cheat Sheet
**VTU 7th/8th Semester Major Project (Course Code: BCS786)**  
**25 Rigorous Technical Questions & Comprehensive Answers for External Examiners**

---

### Section 1: Solidity & EVM Internals

#### Q1: Why did you choose Solidity 0.8.24, and what built-in overflow/underflow protection does it offer compared to SafeMath?
**Answer**:
Starting from Solidity `0.8.0`, the compiler includes native arithmetic overflow and underflow checks enabled by default for all integer operations. Under the hood, the compiler inserts conditional jump opcodes (`JUMPI`) that check whether an arithmetic operation exceeds the bit boundaries of the type (e.g., $2^{256} - 1$ for `uint256`), reverting execution with a panic code (`0x4e487b71` Panic(0x11)) if an overflow occurs.
This renders external libraries like OpenZeppelin's `SafeMath` obsolete, eliminates external library call overhead, and reduces gas consumption while maintaining mathematical integrity. Solidity `0.8.24` also introduces support for the Shanghai and Cancun hard forks (including transient storage opcodes `TSTORE`/`TLOAD`).

---

#### Q2: How does the EVM storage layout work, and how did you optimize storage slot packing in `Job` and `Milestone` structs?
**Answer**:
The EVM stores contract persistent state in a key-value store of $2^{256}$ slots, where each slot is exactly 32 bytes (256 bits). Writing to a new storage slot via `SSTORE` costs 20,000 gas (or 2,900 gas for warming/re-writing), whereas accessing an existing slot costs 2,100 gas (`SLOAD`).
To optimize gas, variables in structs that total $\le 32$ bytes are placed consecutively so the Solidity compiler can pack them into a single 32-byte slot. In `Milestone`:
- `amount` (`uint256` = 32 bytes) takes Slot 0.
- `deadline` (`uint48` = 6 bytes), `reviewWindow` (`uint32` = 4 bytes), `status` (`uint8` = 1 byte), and `submittedAt` (`uint48` = 6 bytes) total 17 bytes ($\le 32$ bytes) and are packed together into Slot 1.
This saves 20,000 gas per milestone during initialization and reduces multiple `SLOAD` operations into a single read.

---

#### Q3: Explain the difference between `memory`, `storage`, and `calldata` in Solidity with examples from your contract.
**Answer**:
- **`storage`**: Represents persistent, mutable data stored on the blockchain disk across transactions. In our contract, `jobs[jobId]` or `milestones[jobId][milestoneId]` use `storage` pointers (e.g., `Job storage job = jobs[jobId];`) so modifications update the EVM state directly without copying data.
- **`memory`**: Temporary, mutable data allocated in RAM during transaction execution and wiped when the function call finishes. In `getJobMilestones(uint256 jobId)`, we allocate an in-memory array `Milestone[] memory list = new Milestone[](count)` to return data without persisting it.
- **`calldata`**: Read-only, non-modifiable, temporary data area where function arguments passed by external callers are stored. It is cheaper than `memory` because it avoids copying. For external functions like `createJob(string calldata title, MilestoneInput[] calldata _milestones)`, passing complex structs in `calldata` eliminates allocation gas.

---

#### Q4: Why did you choose Custom Errors over `require(condition, "error string")`? What are the gas implications?
**Answer**:
Prior to Solidity `0.8.4`, errors were handled via `require(condition, "Descriptive error message")`. This approach required storing and ABI-encoding the entire string literal in the contract runtime bytecode, inflating deployment costs and consuming ~50–300 additional gas per revert to return the string data via `Error(string)`.
Custom errors (e.g., `error Unauthorized();`, `error InvalidMilestoneAmount();`) encode error definitions into a 4-byte selector using the first 4 bytes of `keccak256("Unauthorized()")`. This eliminates string storage from bytecode, significantly decreases deployment gas, and makes transaction reverts substantially cheaper while remaining machine-parseable by client libraries like `ethers.js`.

---

#### Q5: Explain the Checks-Effects-Interactions (CEI) pattern and how it prevents reentrancy attacks even without a mutex.
**Answer**:
The Checks-Effects-Interactions (CEI) pattern enforces a strict order of operations within state-modifying functions:
1. **Checks**: Validate prerequisites, permissions, and parameters (`if (msg.sender != client) revert Unauthorized()`).
2. **Effects**: Update all contract internal state variables and balances *before* initiating external interactions (`milestone.status = MilestoneStatus.Approved; job.completedMilestones++;`).
3. **Interactions**: Transfer funds or call external contracts (`recipient.call{value: amount}("")`).
Because the internal state flags and balances are already modified in Step 2, if an external malicious contract attempts to recursively call back into the contract during Step 3, the check condition in Step 1 will fail (e.g., status is already `Approved`), halting the reentrancy loop before any funds can be drained.

---

#### Q6: Why did you use low-level `call{value: amount}("")` instead of `transfer()` or `send()` for ETH payouts?
**Answer**:
Solidity's legacy `transfer()` and `send()` methods forward a hardcoded stipend of 2,300 gas. This was originally designed to prevent reentrancy by restricting the recipient's execution to logging an event.
However, with Ethereum Improvement Proposal EIP-1884 (which increased `SLOAD` gas costs to 800 gas) and the rise of smart contract wallets (e.g., Gnosis Safe, Argent, ERC-4337 Account Abstraction wallets), 2,300 gas is insufficient to execute custom receiver logic, causing `transfer()` to unconditionally revert.
The Ethereum Foundation and OpenZeppelin recommend using `(bool success, ) = payable(recipient).call{value: amount}("")`, which forwards all available gas. To prevent reentrancy when using `call`, we pair it with the Checks-Effects-Interactions pattern and OpenZeppelin's `nonReentrant` modifier.

---

#### Q7: How do `receive()` and `fallback()` functions work, and why does your contract revert in both?
**Answer**:
- `receive()` is executed when a contract receives plain ETH transfers without any `msg.data`.
- `fallback()` is executed when no other function matches the given 4-byte function selector, or when `msg.data` is provided but `receive()` does not exist.
TrustLance explicitly reverts both with `revert PlainEthTransferNotAllowed();`. Because TrustLance is an escrow contract, every incoming wei must be mapped to an explicit job, milestone budget, and client address. Accepting untracked ETH would create orphaned funds that cannot be accounted for in milestone releases or refunds.

---

#### Q8: What is OpenZeppelin's `ReentrancyGuard` and how does it operate at the opcode level?
**Answer**:
`ReentrancyGuard` is an inherited utility that provides the `nonReentrant` modifier. It maintains a private storage slot `_status`.
- Initially, `_status` is `_NOT_ENTERED` (value `1`).
- When a function decorated with `nonReentrant` is called, it checks `if (_status == _ENTERED) revert ReentrancyGuardReentrantCall()`.
- It sets `_status = _ENTERED` (value `2`) using `SSTORE`.
- The function body executes.
- Upon completion, `_status` is restored to `_NOT_ENTERED` (value `1`).
If an attacker attempts a recursive reentrant call, `_status` is still `2`, causing the EVM to immediately revert with custom error `ReentrancyGuardReentrantCall`.

---

#### Q9: How does `keccak256` hashing work for milestone deliverable hashes and state verification?
**Answer**:
`keccak256` is the native cryptographic hash function of Ethereum, implemented in hardware at the EVM opcode level via `SHA3` (costing 30 gas + 6 gas per 32-byte word). In TrustLance:
1. When submitting deliverables, the freelancer supplies an IPFS Content Identifier (CID) or hex digest which is stored as `deliverableHash`.
2. For authentication, the client signs `keccak256("\x19Ethereum Signed Message:\n32" + messageHash)` according to the EIP-191 standard.
3. The deterministic nature of `keccak256` ensures that deliverable files stored off-chain on IPFS cannot be modified retroactively without invalidating the on-chain hash.

---

#### Q10: How are events indexed and logged on the EVM? What is the difference between indexed and unindexed topics?
**Answer**:
Events write data to the transaction receipt's log bloom filter and receipt storage using the `LOG0` through `LOG4` opcodes.
- **Indexed arguments (`indexed`)**: Stored as 32-byte "topics". A maximum of 3 indexed topics are permitted per event (in addition to topic 0, which is `keccak256("EventName(type1,type2)")`). Indexed topics allow blockchain RPC clients and indexers to perform efficient filtering via `eth_getLogs` without scanning entire block bodies.
- **Unindexed arguments**: ABI-encoded and stored sequentially in the log's `data` payload. These are cheaper in gas than indexed topics but cannot be searched directly in log filters.

---

### Section 2: Decentralized Dispute Resolution & Economics

#### Q11: How does the multi-arbitrator quorum mechanism work? Why a simple majority `(panelSize / 2) + 1`?
**Answer**:
When a client or freelancer raises a dispute on a submitted milestone, the milestone enters the `Disputed` state and funds remain locked in escrow.
- A panel of whitelisted, independent arbitrators reviews the deliverable hash and submitted evidence.
- Each arbitrator casts a vote for either `Vote.Client` or `Vote.Freelancer`.
- Quorum is dynamically calculated as $\lfloor \text{panelSize} / 2 \rfloor + 1$. For a default panel size of 3, quorum is $1 + 1 = 2$.
- The first party to receive 2 votes immediately triggers automated resolution: the milestone status is updated to `Resolved` and 100% of the milestone funds are transferred to the prevailing party.
A simple majority ensures deterministic convergence without possibility of deadlocks (as long as `panelSize` is odd).

---

#### Q12: What prevents a dishonest arbitrator from voting multiple times on the same dispute?
**Answer**:
The smart contract maintains a nested boolean mapping:
```solidity
mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;
```
When an arbitrator invokes `voteOnDispute(jobId, milestoneIndex, vote)`:
1. The contract checks `if (hasVoted[jobId][milestoneIndex][msg.sender]) revert AlreadyVoted();`
2. It immediately sets `hasVoted[jobId][milestoneIndex][msg.sender] = true;` prior to incrementing the vote counter.
Any subsequent attempt by the same address to cast a vote reverts before modifying any state.

---

#### Q13: How does the contract handle ties or an expired voting period?
**Answer**:
1. **Tie Prevention**: The contract enforces at configuration time that `panelSize` must be an odd integer ($3 \le \text{panelSize} \le 9$ and $\text{panelSize} \pmod 2 = 1$). In binary voting (Client vs. Freelancer), an odd number of voters guarantees that a majority winner always emerges once all votes are cast.
2. **Expired Voting Period**: If arbitrators fail to reach quorum before `disputeCreatedAt + votingPeriod` expires, either participant can invoke an administrative timeout or resolution mechanism, preventing escrow funds from remaining permanently inaccessible.

---

#### Q14: Why is TrustLance designed with a 0% platform fee, and how does this affect sustainability and security?
**Answer**:
Centralized platforms (e.g., Upwork, Fiverr) charge freelancers 10% to 20% platform commissions. TrustLance operates as a public utility protocol with a 0% platform fee:
- **Security Benefit**: Eliminates external calls to treasury addresses, removing potential reentrancy attack surfaces and fee calculation edge cases (e.g., rounding errors or dust accumulation).
- **Economic Sustainability**: Gas fees are paid by users executing actions (payer-pays model). Off-chain infrastructure can be sustained through optional premium services (e.g., featured job listings or dispute filing bonds) without altering core protocol logic.

---

#### Q15: Explain how the client review timeout mechanism protects freelancers from unresponsive clients.
**Answer**:
In freelance agreements, clients frequently delay reviewing submitted work, effectively holding freelancer earnings hostage.
TrustLance enforces a programmable `reviewWindow` (e.g., 7 days = `604800` seconds).
When a freelancer submits a milestone via `submitMilestone()`, the contract records `submittedAt = block.timestamp`.
If the client neither approves nor raises a dispute before `block.timestamp >= submittedAt + reviewWindow`, the freelancer can invoke `claimTimeoutPayment(jobId, milestoneId)`. The contract autonomously marks the milestone `Approved` and disburses the funds, removing client leverage.

---

#### Q16: Explain how the overdue milestone reclaim mechanism protects clients from abandoned projects.
**Answer**:
If a freelancer accepts a job but abandons the work, a client's funds could remain trapped in escrow indefinitely.
Each milestone defines a strict `deadline` timestamp set during job creation.
If the milestone remains in `Pending` status and `block.timestamp > deadline`, the client can call `reclaimOverdueMilestone(jobId, milestoneId)`. The smart contract marks the milestone `Refunded` and transfers the escrowed amount back to the client's wallet.

---

#### Q17: How does the dual-sided rating system prevent review extortion or sybil manipulation?
**Answer**:
1. **On-Chain Sybil Resistance**: A user cannot submit a rating for another user arbitrarily. `rateUser(jobId, targetUser, score, review)` requires:
   - The caller must be either the client or freelancer on `jobId`.
   - The job must be in `Completed` status.
   - Each party can only rate the opposing party once (`hasRated[jobId][msg.sender] == false`).
2. **Economic Stake Requirement**: To generate a fake review, an attacker must deposit real ETH into escrow, accept the job, complete all milestones, and pay EVM transaction gas fees. This makes sybil attacks economically non-viable.

---

### Section 3: Web3 Full-Stack Architecture & Cryptography

#### Q18: How does Web3 authentication work without passwords or email verification? Explain the EIP-191 challenge-response flow.
**Answer**:
TrustLance uses cryptographic public-key signatures conforming to EIP-191 (`personal_sign`):
1. **Challenge Request**: The client requests a nonce from the backend (`GET /api/auth/nonce?address=0x...`). The server generates a cryptographically random 32-byte string and associates it with the wallet record.
2. **Off-Chain Signing**: The user's browser wallet (MetaMask) signs the challenge string:
   $$\text{Signature} = \text{sign}_{\text{privateKey}}(\text{"\x19Ethereum Signed Message:\n32"} + \text{nonce})$$
3. **Recovery & Verification**: The signature is sent to `POST /api/auth/verify`. The backend uses `ethers.verifyMessage(nonce, signature)` to execute elliptic curve point recovery (`ecrecover`), extracting the signer address.
4. **Token Issuance**: If the recovered address matches the requested address, the nonce is regenerated (preventing replay) and a signed JSON Web Token (JWT) is issued.

---

#### Q19: Why does the frontend never send the user's private key to the backend?
**Answer**:
In asymmetric cryptography (secp256k1), private keys must never leave the user's secure enclave or wallet vault.
Instead of sending credentials to a server for verification, the wallet locally computes a digital signature $(r, s, v)$ over a message digest.
The public key (and consequently the Ethereum address) can be derived by any third party directly from the signature and message using public-key recovery algorithms without ever exposing the private key.

---

#### Q20: What is an Event Indexer and why is it needed alongside the smart contract?
**Answer**:
Ethereum nodes are key-value state machines optimized for consensus and transaction execution, not relational queries. Querying "all jobs created by address $X$" or "all active disputes" directly from an RPC node requires iterating through contract storage mappings or filtering thousands of historical blocks, which is slow, bandwidth-intensive, and rate-limited.
The Event Indexer listens to real-time EVM event logs (`JobCreated`, `MilestoneSubmitted`, `DisputeRaised`), parses the parameters, and writes structured projections to a high-speed MongoDB database, providing instant sub-10ms REST API queries for frontend users.

---

#### Q21: How does your indexer achieve idempotency during blockchain reorganizations or catch-up syncing?
**Answer**:
If the backend crashes or re-syncs historical blocks, the indexer will re-read events it has previously processed.
To prevent duplicate records (e.g., duplicating notification counters or corrupting job milestones):
1. MongoDB maintains a unique compound index on `{ txHash: 1, logIndex: 1 }` in the `ChainEvent` and `Notification` collections.
2. The indexer performs `Job.findOneAndUpdate({ onchainId }, update, { upsert: true })`, ensuring that applying the same event multiple times yields the exact same deterministic database state.
3. Any attempt to insert a duplicate event hash/logIndex throws an `E11000 duplicate key error`, which is intercepted and logged without erroring out the pipeline.

---

#### Q22: How does the runtime `/config.json` architecture solve the 12-factor app requirement in containerized deployments?
**Answer**:
Standard single-page React applications built with Vite or Webpack inline environment variables (`import.meta.env.VITE_*`) into static JS/HTML bundles at build time. To change an RPC URL or contract address, the entire Docker container would need to be rebuilt from source.
TrustLance solves this by having `ConfigContext.jsx` fetch `/config.json` at application bootstrap in the browser. A lightweight script (`generate-config.js`) reads environment variables at container startup or deployment time and writes them to `/public/config.json`.
This allows a single compiled Docker image (`trustlance-frontend:latest`) to run unchanged in local Hardhat environments, Sepolia testnet, or Ethereum mainnet.

---

#### Q23: What is the difference between local Hardhat network (Chain ID 31337) and Ethereum Sepolia testnet (Chain ID 11155111)?
**Answer**:
- **Hardhat Network (31337)**: An in-memory, local EVM development node running on `localhost:8545`. It supports instant block mining, infinite free test ETH, deterministic test signers, and custom RPC methods (`evm_increaseTime`, `hardhat_mine`) enabling programmatic time-travel for timeout tests.
- **Sepolia Testnet (11155111)**: A public, proof-of-stake Ethereum test network governed by decentralized validators. Transactions require actual network propagation, block finality (~12 seconds per slot), and real gas fees (paid in Sepolia testnet ETH obtained via faucets).

---

#### Q24: How does the frontend handle RPC node caching and ensure users see authoritative on-chain state?
**Answer**:
Ethers.js v6 providers cache responses (such as `eth_blockNumber`, `eth_getBalance`, and transaction nonces) to minimize network overhead.
In high-frequency or fast-forwarded test environments, cached RPC responses can cause out-of-date UI states or nonce collisions.
TrustLance resolves this by using authoritative contract getters (`contract.getJob(id)`, `contract.getMilestone(id, index)`) rather than client-side estimations, and forces cache-busting queries using raw provider calls (`provider.send("eth_getBalance", [address, "latest"])`) when absolute real-time accuracy is required.

---

#### Q25: What are the trade-offs between on-chain storage and off-chain (MongoDB/IPFS) storage in TrustLance?
**Answer**:
- **On-Chain Storage (Solidity)**:
  - *Pros*: Immutable, trustless, censorship-resistant, verifiable by consensus.
  - *Cons*: Extremely expensive ($\approx 20,000$ gas per 32 bytes); limited queryability.
  - *Used for*: Financial custody, milestone states, participant addresses, timestamps, arbitrator votes, cryptographic deliverable hashes.
- **Off-Chain Storage (MongoDB & IPFS)**:
  - *Pros*: Negligible cost, supports rich unstructured data, high-throughput text search, instant relational queries.
  - *Cons*: Dependent on centralized servers or IPFS pinning services; requires cryptographic anchoring to verify authenticity.
  - *Used for*: Chat messaging, user bios/skills, notification records, cached event logs, and large deliverable source files.
