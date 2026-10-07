// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IFreelanceEscrow {
    function cancelJob(uint256 jobId) external;
    function approveMilestone(uint256 jobId, uint256 milestoneId) external;
    function claimAfterTimeout(uint256 jobId, uint256 milestoneId) external;
    function reclaimMilestone(uint256 jobId, uint256 milestoneId) external;
    function createJob(
        bytes32 metadataHash,
        string[] calldata titles,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        uint64 reviewPeriod
    ) external payable returns (uint256);
    function acceptJob(uint256 jobId) external;
    function submitMilestone(uint256 jobId, uint256 milestoneId, string calldata deliverableURI) external;
}

/**
 * @title MaliciousAttacker
 * @notice Malicious contract designed to test ReentrancyGuard defenses on FreelanceEscrow
 */
contract MaliciousAttacker {
    IFreelanceEscrow public immutable escrow;
    uint256 public targetJobId;
    uint256 public targetMilestoneId;
    enum AttackType { Cancel, Approve, Reclaim }
    AttackType public currentAttack;
    bool public attackTriggered;
    bool public attackSucceeded;

    constructor(address _escrow) {
        escrow = IFreelanceEscrow(_escrow);
    }

    function setAttack(AttackType _attack, uint256 _jobId, uint256 _milestoneId) external {
        currentAttack = _attack;
        targetJobId = _jobId;
        targetMilestoneId = _milestoneId;
        attackTriggered = false;
        attackSucceeded = false;
    }

    function acceptJob(uint256 jobId) external {
        escrow.acceptJob(jobId);
    }

    function submitMilestone(uint256 jobId, uint256 milestoneId, string calldata uri) external {
        escrow.submitMilestone(jobId, milestoneId, uri);
    }

    receive() external payable {
        if (!attackTriggered) {
            attackTriggered = true;
            if (currentAttack == AttackType.Cancel) {
                try escrow.cancelJob(targetJobId) {
                    attackSucceeded = true;
                } catch {
                    // Expected to revert due to nonReentrant
                }
            } else if (currentAttack == AttackType.Approve) {
                try escrow.approveMilestone(targetJobId, targetMilestoneId) {
                    attackSucceeded = true;
                } catch {
                    // Expected to revert due to nonReentrant
                }
            } else if (currentAttack == AttackType.Reclaim) {
                try escrow.reclaimMilestone(targetJobId, targetMilestoneId) {
                    attackSucceeded = true;
                } catch {
                    // Expected to revert due to nonReentrant
                }
            }
        }
    }
}
