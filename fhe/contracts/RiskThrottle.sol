// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { FHE, euint8, ebool } from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import { HackTriage } from "./HackTriage.sol";

contract RiskThrottle {
    uint8 private constant STATUS_NORMAL     = 0;
    uint8 private constant STATUS_QUARANTINE = 1;
    uint8 private constant STATUS_ESCALATE   = 2;

    HackTriage public immutable triage;

    /// Encrypted throttle status, scoped per-caller. Each address gets its own encrypted
    /// status derived from its own HackTriage verdict.
    mapping(address => euint8) public status;

    event StatusRefreshed(address indexed caller, uint64 blockNumber);

    constructor(address _triage) {
        triage = HackTriage(_triage);
    }

    /// Reads the caller's latest severity from HackTriage, maps it through the FHE.select
    /// status ladder, stores the encrypted result in status[msg.sender], and grants the
    /// caller decrypt ACL on their own status ciphertext.
    /// Thresholds: severity >= 4 -> ESCALATE, >= 2 -> QUARANTINE, else NORMAL.
    function refresh() external {
        euint8 sev = _readSeverity(msg.sender);

        ebool gte4 = FHE.gte(sev, FHE.asEuint8(uint256(4)));
        ebool gte2 = FHE.gte(sev, FHE.asEuint8(uint256(2)));

        euint8 lvl2 = FHE.select(gte2, FHE.asEuint8(uint256(STATUS_QUARANTINE)), FHE.asEuint8(uint256(STATUS_NORMAL)));
        euint8 next = FHE.select(gte4, FHE.asEuint8(uint256(STATUS_ESCALATE)),   lvl2);

        status[msg.sender] = next;
        FHE.allowThis(next);
        FHE.allowSender(next);

        emit StatusRefreshed(msg.sender, uint64(block.number));
    }

    function _readSeverity(address p) internal view returns (euint8) {
        (, euint8 sev, ) = triage.latest(p);
        return sev;
    }
}
