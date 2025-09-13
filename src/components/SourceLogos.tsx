import React from 'react';

// Sourcify Logo
export const SourcifyLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#00D4AA"/>
    <path d="M8 12L11 15L16 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Blockscout Logo  
export const BlockscoutLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="4" fill="#4A90E2"/>
    <circle cx="12" cy="12" r="3" fill="white"/>
    <path d="M12 6V8M12 16V18M8 12H6M18 12H16" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Etherscan Logo
export const EtherscanLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#21325B"/>
    <circle cx="12" cy="12" r="2" fill="#5297FF"/>
    <path d="M12 7V9M12 15V17M7 12H9M15 12H17" stroke="#5297FF" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 8L16 16M16 8L8 16" stroke="#5297FF" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
  </svg>
);

// Manual ABI Logo
export const ManualLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="#6B7280"/>
    <path d="M8 12H16M8 8H16M8 16H12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);