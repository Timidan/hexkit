// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { FHE, InEuint16, euint16, euint8, ebool } from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract HackTriage {
    // Feature bits (mirrors FEATURE_BITS in TS).
    uint16 private constant HAS_FLASH_SEL          = 1 << 0;
    uint16 private constant HAS_TRANSFER_FROM_EXT  = 1 << 1;
    uint16 private constant HAS_DELEGATECALL       = 1 << 2;
    uint16 private constant HAS_SLOT0_WRITE        = 1 << 3;
    uint16 private constant TARGET_UNVERIFIED      = 1 << 4;
    uint16 private constant TARGET_IS_SAFE         = 1 << 5;
    uint16 private constant ATTACKER_PROFIT_IN     = 1 << 6;
    uint16 private constant ATTACKER_PROFIT_LARGE  = 1 << 7;
    uint16 private constant REPEATED_WRITES_MAX3   = 1 << 8;
    uint16 private constant PRIVILEGED_WRITE_LABEL = 1 << 9;

    uint16 private constant MASK_FLASH_PRICE    = HAS_FLASH_SEL | REPEATED_WRITES_MAX3 | ATTACKER_PROFIT_LARGE;
    uint16 private constant MASK_DELEGATE_USER  = HAS_DELEGATECALL | HAS_SLOT0_WRITE | TARGET_UNVERIFIED;
    uint16 private constant MASK_APPROVAL_DRAIN = HAS_TRANSFER_FROM_EXT | ATTACKER_PROFIT_IN;
    uint16 private constant MASK_SIGNER_COMP    = HAS_DELEGATECALL | HAS_SLOT0_WRITE | TARGET_IS_SAFE;
    uint16 private constant MASK_ACCESS_CTRL    = PRIVILEGED_WRITE_LABEL | ATTACKER_PROFIT_IN;

    uint16 private constant CLASS_FLASH    = 1 << 0;
    uint16 private constant CLASS_DELEGATE = 1 << 1;
    uint16 private constant CLASS_APPROVAL = 1 << 2;
    uint16 private constant CLASS_SIGNER   = 1 << 3;
    uint16 private constant CLASS_ACCESS   = 1 << 4;

    struct Verdict { euint16 classBits; euint8 severity; uint64 blockNumber; }
    mapping(address => Verdict) public latest;

    event TriageSubmitted(address indexed caller, uint64 blockNumber);

    function triage(InEuint16 calldata encFeatures) external returns (euint16 classBits, euint8 severity) {
        euint16 features = FHE.asEuint16(encFeatures);

        classBits = _ruleFire(features, MASK_FLASH_PRICE,    CLASS_FLASH);
        classBits = FHE.or(classBits, _ruleFire(features, MASK_DELEGATE_USER,  CLASS_DELEGATE));
        classBits = FHE.or(classBits, _ruleFire(features, MASK_APPROVAL_DRAIN, CLASS_APPROVAL));
        classBits = FHE.or(classBits, _ruleFire(features, MASK_SIGNER_COMP,    CLASS_SIGNER));
        classBits = FHE.or(classBits, _ruleFire(features, MASK_ACCESS_CTRL,    CLASS_ACCESS));

        euint8 sev = FHE.asEuint8(uint256(0));
        sev = FHE.add(sev, _weight(features, MASK_FLASH_PRICE,    2));
        sev = FHE.add(sev, _weight(features, MASK_DELEGATE_USER,  2));
        sev = FHE.add(sev, _weight(features, MASK_APPROVAL_DRAIN, 2));
        sev = FHE.add(sev, _weight(features, MASK_SIGNER_COMP,    2));
        sev = FHE.add(sev, _weight(features, MASK_ACCESS_CTRL,    1));
        severity = sev;

        latest[msg.sender] = Verdict({ classBits: classBits, severity: severity, blockNumber: uint64(block.number) });

        FHE.allowThis(classBits);
        FHE.allowThis(severity);
        FHE.allowSender(classBits);
        FHE.allowSender(severity);

        emit TriageSubmitted(msg.sender, uint64(block.number));
    }

    /// Grants ACL permission for `consumer` to read and operate on the caller's latest
    /// verdict ciphertexts. Must be called by the same address that submitted the triage()
    /// (so `latest[msg.sender]` refers to their verdict).
    function allowConsumer(address consumer) external {
        Verdict storage v = latest[msg.sender];
        FHE.allow(v.classBits, consumer);
        FHE.allow(v.severity, consumer);
    }

    function _ruleFire(euint16 features, uint16 mask, uint16 classBit) internal returns (euint16) {
        ebool fired = FHE.eq(FHE.and(features, FHE.asEuint16(uint256(mask))), FHE.asEuint16(uint256(mask)));
        return FHE.select(fired, FHE.asEuint16(uint256(classBit)), FHE.asEuint16(uint256(0)));
    }

    function _weight(euint16 features, uint16 mask, uint8 w) internal returns (euint8) {
        ebool fired = FHE.eq(FHE.and(features, FHE.asEuint16(uint256(mask))), FHE.asEuint16(uint256(mask)));
        return FHE.select(fired, FHE.asEuint8(uint256(w)), FHE.asEuint8(uint256(0)));
    }
}
