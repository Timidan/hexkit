/**
 * Shared event and function ABI definitions for trace decoding.
 *
 * Single source of truth for common ERC-20/ERC-721/ERC-1155/DEX/governance
 * event signatures used across eventDecoding.ts and stackDecoding.ts.
 * Each lazy-initialized ethers.utils.Interface is created once and reused.
 */

import { ethers } from "ethers";

/** ERC-20 events */
export const ERC20_EVENTS_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

/** ERC-721 events */
export const ERC721_EVENTS_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
];

/** ERC-1155 + DEX + governance events */
export const OTHER_EVENTS_ABI = [
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event URI(string value, uint256 indexed id)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event Upgraded(address indexed implementation)",
  "event AdminChanged(address previousAdmin, address newAdmin)",
  "event BeaconUpgraded(address indexed beacon)",
];

/** Combined superset of all common events (ERC-20 + ERC-721 + other) */
export const COMMON_EVENTS_ABI = [
  ...ERC20_EVENTS_ABI,
  ...ERC721_EVENTS_ABI,
  ...OTHER_EVENTS_ABI,
];

export const ERC20_FUNCTIONS_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

export const ERC721_FUNCTIONS_ABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

let _commonEventsIface: ethers.utils.Interface | null = null;
let _erc20EventsIface: ethers.utils.Interface | null = null;
let _erc721EventsIface: ethers.utils.Interface | null = null;
let _otherEventsIface: ethers.utils.Interface | null = null;
let _erc20FunctionsIface: ethers.utils.Interface | null = null;
let _erc721FunctionsIface: ethers.utils.Interface | null = null;

/** Interface for the full COMMON_EVENTS_ABI superset */
export function getCommonEventsInterface(): ethers.utils.Interface {
  if (!_commonEventsIface) {
    _commonEventsIface = new ethers.utils.Interface(COMMON_EVENTS_ABI);
  }
  return _commonEventsIface;
}

export function getERC20EventsInterface(): ethers.utils.Interface {
  if (!_erc20EventsIface) {
    _erc20EventsIface = new ethers.utils.Interface(ERC20_EVENTS_ABI);
  }
  return _erc20EventsIface;
}

export function getERC721EventsInterface(): ethers.utils.Interface {
  if (!_erc721EventsIface) {
    _erc721EventsIface = new ethers.utils.Interface(ERC721_EVENTS_ABI);
  }
  return _erc721EventsIface;
}

export function getOtherEventsInterface(): ethers.utils.Interface {
  if (!_otherEventsIface) {
    _otherEventsIface = new ethers.utils.Interface(OTHER_EVENTS_ABI);
  }
  return _otherEventsIface;
}

export function getERC20FunctionsInterface(): ethers.utils.Interface {
  if (!_erc20FunctionsIface) {
    _erc20FunctionsIface = new ethers.utils.Interface(ERC20_FUNCTIONS_ABI);
  }
  return _erc20FunctionsIface;
}

export function getERC721FunctionsInterface(): ethers.utils.Interface {
  if (!_erc721FunctionsIface) {
    _erc721FunctionsIface = new ethers.utils.Interface(ERC721_FUNCTIONS_ABI);
  }
  return _erc721FunctionsIface;
}

/**
 * Returns the subset of event interfaces relevant for a given topic count.
 * Used by stack decoding to narrow the search space.
 */
export function getCommonEventInterfaces(topicCount: number): ethers.utils.Interface[] {
  const interfaces: ethers.utils.Interface[] = [];
  if (topicCount <= 3) interfaces.push(getERC20EventsInterface());
  if (topicCount <= 4) interfaces.push(getERC721EventsInterface());
  interfaces.push(getOtherEventsInterface());
  return interfaces;
}
