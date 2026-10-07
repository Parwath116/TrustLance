Multiple frameworks detected: solc, Solc-json. Using solc (highest priority). Use --compile-force-framework to override.
'solc --version' running
'solc @openzeppelin=./node_modules/@openzeppelin ./contracts/contracts/FreelanceEscrow.sol --combined-json abi,ast,bin,bin-runtime,srcmap,srcmap-runtime,userdoc,devdoc,hashes --allow-paths .,C:\Users\91805\Downloads\Blockchain project\contracts\contracts' running
**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [timestamp](#timestamp) (6 results) (Low)
 - [assembly](#assembly) (9 results) (Informational)
 - [pragma](#pragma) (1 results) (Informational)
 - [dead-code](#dead-code) (2 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (6 results) (Informational)
## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-0
[FreelanceEscrow.raiseDispute(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L460-L474) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp > m.submittedAt + job.reviewPeriod](contracts/contracts/FreelanceEscrow.sol#L468)

contracts/contracts/FreelanceEscrow.sol#L460-L474


 - [ ] ID-1
[FreelanceEscrow.reclaimMilestone(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L430-L449) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= m.deadline](contracts/contracts/FreelanceEscrow.sol#L438)

contracts/contracts/FreelanceEscrow.sol#L430-L449


 - [ ] ID-2
[FreelanceEscrow.createJob(bytes32,string[],uint256[],uint64[],uint64)](contracts/contracts/FreelanceEscrow.sol#L253-L310) uses timestamp for comparisons
	Dangerous comparisons:
	- [deadlines[i] <= lastDeadline](contracts/contracts/FreelanceEscrow.sol#L272)

contracts/contracts/FreelanceEscrow.sol#L253-L310


 - [ ] ID-3
[FreelanceEscrow.claimAfterTimeout(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L405-L423) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= m.submittedAt + job.reviewPeriod](contracts/contracts/FreelanceEscrow.sol#L412)

contracts/contracts/FreelanceEscrow.sol#L405-L423


 - [ ] ID-4
[FreelanceEscrow.resolveExpiredDispute(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L537-L581) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= m.disputeStartedAt + votingPeriod](contracts/contracts/FreelanceEscrow.sol#L543)

contracts/contracts/FreelanceEscrow.sol#L537-L581


 - [ ] ID-5
[FreelanceEscrow._checkAndSetJobCompleted(uint256)](contracts/contracts/FreelanceEscrow.sol#L707-L721) uses timestamp for comparisons
	Dangerous comparisons:
	- [s != MilestoneStatus.Paid && s != MilestoneStatus.Refunded](contracts/contracts/FreelanceEscrow.sol#L713)

contracts/contracts/FreelanceEscrow.sol#L707-L721


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-6
[StorageSlot.getAddressSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L66-L70) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L67-L69)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L66-L70


 - [ ] ID-7
[StorageSlot.getUint256Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L93-L97) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L94-L96)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L93-L97


 - [ ] ID-8
[StorageSlot.getBooleanSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L75-L79) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L76-L78)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L75-L79


 - [ ] ID-9
[StorageSlot.getBytes32Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L84-L88) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L85-L87)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L84-L88


 - [ ] ID-10
[StorageSlot.getInt256Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L102-L106) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L103-L105)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L102-L106


 - [ ] ID-11
[StorageSlot.getBytesSlot(bytes)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L138-L142) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L139-L141)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L138-L142


 - [ ] ID-12
[StorageSlot.getStringSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L111-L115) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L112-L114)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L111-L115


 - [ ] ID-13
[StorageSlot.getStringSlot(string)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L120-L124) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L121-L123)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L120-L124


 - [ ] ID-14
[StorageSlot.getBytesSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L129-L133) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L130-L132)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L129-L133


## pragma
Impact: Informational
Confidence: High
 - [ ] ID-15
2 different versions of Solidity are used:
	- Version constraint ^0.8.20 is used by:
		-[^0.8.20](node_modules/@openzeppelin/contracts/access/Ownable.sol#L4)
		-[^0.8.20](node_modules/@openzeppelin/contracts/utils/Context.sol#L4)
		-[^0.8.20](node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol#L4)
		-[^0.8.20](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L5)
	- Version constraint 0.8.24 is used by:
		-[0.8.24](contracts/contracts/FreelanceEscrow.sol#L2)

node_modules/@openzeppelin/contracts/access/Ownable.sol#L4


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-16
[Context._contextSuffixLength()](node_modules/@openzeppelin/contracts/utils/Context.sol#L25-L27) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/Context.sol#L25-L27


 - [ ] ID-17
[Context._msgData()](node_modules/@openzeppelin/contracts/utils/Context.sol#L21-L23) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/Context.sol#L21-L23


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-18
Version constraint ^0.8.20 contains known severe issues (https://solidity.readthedocs.io/en/latest/bugs.html)
	- VerbatimInvalidDeduplication
	- FullInlinerNonExpressionSplitArgumentEvaluationOrder
	- MissingSideEffectsOnSelectorAccess.
It is used by:
	- [^0.8.20](node_modules/@openzeppelin/contracts/access/Ownable.sol#L4)
	- [^0.8.20](node_modules/@openzeppelin/contracts/utils/Context.sol#L4)
	- [^0.8.20](node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol#L4)
	- [^0.8.20](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L5)

node_modules/@openzeppelin/contracts/access/Ownable.sol#L4


## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-19
Low level call in [FreelanceEscrow.cancelJob(uint256)](contracts/contracts/FreelanceEscrow.sol#L316-L329):
	- [(sent,None) = job.client.call{value: refundAmount}()](contracts/contracts/FreelanceEscrow.sol#L327)

contracts/contracts/FreelanceEscrow.sol#L316-L329


 - [ ] ID-20
Low level call in [FreelanceEscrow.approveMilestone(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L380-L398):
	- [(sent,None) = job.freelancer.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L396)

contracts/contracts/FreelanceEscrow.sol#L380-L398


 - [ ] ID-21
Low level call in [FreelanceEscrow.resolveExpiredDispute(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L537-L581):
	- [(sent,None) = job.freelancer.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L553)
	- [(sent_scope_0,None) = job.client.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L561)
	- [(sentFreelancer,None) = job.freelancer.call{value: freelancerShare}()](contracts/contracts/FreelanceEscrow.sol#L573)
	- [(sentClient,None) = job.client.call{value: clientShare}()](contracts/contracts/FreelanceEscrow.sol#L577)

contracts/contracts/FreelanceEscrow.sol#L537-L581


 - [ ] ID-22
Low level call in [FreelanceEscrow.reclaimMilestone(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L430-L449):
	- [(sent,None) = job.client.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L447)

contracts/contracts/FreelanceEscrow.sol#L430-L449


 - [ ] ID-23
Low level call in [FreelanceEscrow.voteOnDispute(uint256,uint256,bool)](contracts/contracts/FreelanceEscrow.sol#L483-L529):
	- [(sent,None) = job.freelancer.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L517)
	- [(sent_scope_0,None) = job.client.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L525)

contracts/contracts/FreelanceEscrow.sol#L483-L529


 - [ ] ID-24
Low level call in [FreelanceEscrow.claimAfterTimeout(uint256,uint256)](contracts/contracts/FreelanceEscrow.sol#L405-L423):
	- [(sent,None) = job.freelancer.call{value: amount}()](contracts/contracts/FreelanceEscrow.sol#L421)

contracts/contracts/FreelanceEscrow.sol#L405-L423


