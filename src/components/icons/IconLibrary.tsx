// Icon Library - Professional JSX Icons
// Centralized imports for consistent icon usage across the Web3 toolkit

import React from 'react';

// Component Props Interface
export interface IconProps {
  size?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
}

// Core UI Actions
export const PlusIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const MinusIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CollapseAllIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg
    viewBox="0 0 24 24"
    width={width}
    height={height}
    color={color}
    className={className}
    style={style}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 8h12" />
    <path d="M6 16h12" />
    <path d="m9 11 3-3 3 3" />
  </svg>
);

export const ExpandAllIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg
    viewBox="0 0 24 24"
    width={width}
    height={height}
    color={color}
    className={className}
    style={style}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 8h12" />
    <path d="M6 16h12" />
    <path d="m9 13 3 3 3-3" />
  </svg>
);

export const XCloseIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ClipboardIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <rect x="6" y="4" width="12" height="16" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
    <path d="M9 2h6v4H9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const InfoIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="m12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ExclamationIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const EditIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SaveIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 3v4a1 1 0 0 0 1 1h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ExternalLinkIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 3h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Search & Navigation  
export const SearchIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SearchMdIcon: React.FC<IconProps> = ({ width = 20, height = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SearchSmIcon: React.FC<IconProps> = ({ width = 16, height = 16, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FilterIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronUpIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m18 15-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Settings & Configuration
export const SettingsIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// Actions & Operations
export const PlayIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <polygon points="5,3 19,12 5,21" fill="currentColor" />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 16H3v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShuffleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Status & Feedback
export const XCircleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="m15 9-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CheckCircleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const AlertCircleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const AlertTriangleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const InfoCircleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Loader2Icon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animate-spin ${className}`} style={style}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Security & Vision
export const EyeIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const EyeOffIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m2 2 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Web3 Specific Icons
export const HashIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ZapIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" fill="currentColor" />
  </svg>
);

export const ToolIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const GemIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M6 3h12l4 6-10 13L2 9l4-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 3 8 9l4 13 4-13-3-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 9h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Diamond Inspection Icons - Different Options
export const DiamondExplodeIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    {/* Central diamond piece */}
    <path d="M9 8h6l2 3-5 6-5-6 2-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 8 9 11l3 6 3-6-2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Floating pieces around */}
    <path d="M3 4l2 1-1 2-2-1 1-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 3l2 1-1 2-2-1 1-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 18l2 1-1 2-2-1 1-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 19l2 1-1 2-2-1 1-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Motion lines */}
    <path d="M6 5l1 1m10-3l1 1m-13 9l1 1m11 2l1 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

export const DiamondLayersIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    {/* Top layer */}
    <path d="M8 2h8l3 4-7 8-7-8 3-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    {/* Middle layer */}
    <path d="M7 6h10l3 4-8 9-8-9 3-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    {/* Bottom layer */}
    <path d="M6 10h12l3 4-9 8-9-8 3-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Separation lines */}
    <path d="M12 2v20" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2,2" opacity="0.5" />
  </svg>
);

export const DiamondCutIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    {/* Left half of diamond */}
    <path d="M6 3h6l2 6-6 13L2 9l4-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 3 8 9l4 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Right half separated */}
    <path d="M16 5h4l2 4-4 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 5l-1 4 2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 9h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Cut line */}
    <path d="M12 1v22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="3,2" opacity="0.6" />
  </svg>
);

export const DiamondAnalyzeIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    {/* Main diamond */}
    <path d="M8 5h8l3 4-7 8-7-8 3-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 5 9 9l3 8 3-8-2-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 9h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Analysis grid overlay */}
    <path d="M8 5l4 4m0 0l4-4m-4 4v8m-3-8l6 0m-6 4l6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    
    {/* Magnifying glass */}
    <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="2" />
    <path d="M21 21l-1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const DiamondFacetsIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    {/* Diamond outline */}
    <path d="M8 4h8l3 4-7 9-7-9 3-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Visible facet lines */}
    <path d="M11 4 9 8l3 9 3-9-2-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 4l4 4m0 0l4-4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8l-3 5m6 0l-3-5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Floating info points */}
    <circle cx="4" cy="12" r="1" fill="currentColor" opacity="0.7" />
    <circle cx="20" cy="12" r="1" fill="currentColor" opacity="0.7" />
    <circle cx="12" cy="2" r="1" fill="currentColor" opacity="0.7" />
    <circle cx="12" cy="20" r="1" fill="currentColor" opacity="0.7" />
  </svg>
);

export const BookOpenIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BlockIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
    <path d="M9 9h6v6H9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DatabaseIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="2" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" stroke="currentColor" strokeWidth="2" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const FolderIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LinkIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LightbulbIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M9 21h6M12 3a6 6 0 0 1 6 6c0 2.22-1.21 4.16-3 5.2V17a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-2.8C7.21 13.16 6 11.22 6 9a6 6 0 0 1 6-6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FolderOpenIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M2 11v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6H2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 11V6c0-1.1.9-2 2-2h5l2 3h9c1.1 0 2 .9 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PenToolIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m2 2 7.586 7.586" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const HashtagIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FileTextIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Icon Component Wrapper for consistent sizing and styling
export const Icon: React.FC<{
  icon: React.ComponentType<any>;
  size?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ icon: IconComponent, size = 20, color = 'currentColor', className = '', style = {} }) => {
  return (
    <IconComponent
      width={size}
      height={size}
      style={{ color, ...style }}
      className={className}
    />
  );
};

// Utility function to get icon by name (for dynamic usage)
export const getIcon = (iconName: string): React.ComponentType<any> | null => {
  const iconMap: { [key: string]: React.ComponentType<any> } = {
    plus: PlusIcon,
    minus: MinusIcon,
    'x-close': XCloseIcon,
    check: CheckIcon,
    edit: EditIcon,
    trash: TrashIcon,
    copy: CopyIcon,
    save: SaveIcon,
    search: SearchIcon,
    filter: FilterIcon,
    'chevron-down': ChevronDownIcon,
    'chevron-up': ChevronUpIcon,
    settings: SettingsIcon,
    play: PlayIcon,
    // Add more mappings as needed
  };
  
  return iconMap[iconName] || null;
};
export const PendingIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const ActiveIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CompletedIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ErrorIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.73 18 12 3 2.27 18a2 2 0 0 0 1.73 3h16a2 2 0 0 0 1.73-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
