// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IFreelanceEscrowReceiver {
    function cancelJob(uint256 jobId) external;
    function createJob(
        bytes32 metadataHash,
        string[] calldata titles,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        uint64 reviewPeriod
    ) external payable returns (uint256);
    function acceptJob(uint256 jobId) external;
    function submitMilestone(uint256 jobId, uint256 milestoneId, string calldata deliverableURI) external;
    function approveMilestone(uint256 jobId, uint256 milestoneId) external;
    function reclaimMilestone(uint256 jobId, uint256 milestoneId) external;
    function raiseDispute(uint256 jobId, uint256 milestoneId) external;
}

/**
 * @title RejectingReceiver
 * @notice Helper contract that rejects incoming ETH to test TransferFailed custom error branches
 */
contract RejectingReceiver {
    IFreelanceEscrowReceiver public immutable escrow;

    constructor(address _escrow) {
        escrow = IFreelanceEscrowReceiver(_escrow);
    }

    function createJob(
        bytes32 metadataHash,
        string[] calldata titles,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        uint64 reviewPeriod
    ) external payable returns (uint256) {
        return escrow.createJob{value: msg.value}(metadataHash, titles, amounts, deadlines, reviewPeriod);
    }

    function cancelJob(uint256 jobId) external {
        escrow.cancelJob(jobId);
    }

    function acceptJob(uint256 jobId) external {
        escrow.acceptJob(jobId);
    }

    function submitMilestone(uint256 jobId, uint256 milestoneId, string calldata deliverableURI) external {
        escrow.submitMilestone(jobId, milestoneId, deliverableURI);
    }

    function approveMilestone(uint256 jobId, uint256 milestoneId) external {
        escrow.approveMilestone(jobId, milestoneId);
    }

    function reclaimMilestone(uint256 jobId, uint256 milestoneId) external {
        escrow.reclaimMilestone(jobId, milestoneId);
    }

    function raiseDispute(uint256 jobId, uint256 milestoneId) external {
        escrow.raiseDispute(jobId, milestoneId);
    }

    // Always revert on receiving ETH
    receive() external payable {
        revert("Rejecting ETH");
    }
}
