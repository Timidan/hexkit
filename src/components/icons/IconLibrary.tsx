// Icon Library - Professional JSX Icons
// Centralized imports for consistent icon usage across the Web3 toolkit

import React from 'react';

// Component Props Interface
interface IconProps {
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

export const XCloseIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

// Search & Navigation  
export const SearchIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Actions & Operations
export const PlayIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <polygon points="5,3 19,12 5,21" fill="currentColor" />
  </svg>
);

/** Animated play icon — the triangle draws itself then fills in on hover. */
export const AnimatedPlayIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-play-icon ${className}`} style={style}>
    <polygon
      points="6,3 20,12 6,21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="currentColor"
      className="animated-play-triangle"
    />
  </svg>
);

/** Animated zap (lightning) icon — bolt draws itself on hover. */
export const AnimatedZapIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-zap-icon ${className}`} style={style}>
    <polygon
      points="13,2 3,14 12,14 11,22 21,10 12,10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="currentColor"
      className="animated-zap-bolt"
    />
  </svg>
);

/** Animated hash icon — each stroke draws itself on hover with stagger. */
export const AnimatedHashIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-hash-icon ${className}`} style={style}>
    <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-hash-h" />
    <line x1="4" y1="15" x2="20" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-hash-h" />
    <line x1="10" y1="3" x2="8" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-hash-v" />
    <line x1="16" y1="3" x2="14" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-hash-v" />
  </svg>
);

/** Animated file-text icon — outline draws, then inner lines stagger in. */
export const AnimatedFileTextIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-filetext-icon ${className}`} style={style}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-ft-outline" />
    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-ft-fold" />
    <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-ft-line" />
    <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-ft-line" />
    <line x1="8" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-ft-line" />
  </svg>
);

/** Animated open-book icon — covers draw on, then a page flips from right to left. */
export const AnimatedBookFlipIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-book-icon ${className}`} style={style}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-book-cover" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-book-cover" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animated-book-page" />
  </svg>
);

/** Animated pen-writing icon — pen draws on, wobbles as if writing, trail line appears. */
export const AnimatedPenWriteIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-penwrite-icon ${className}`} style={style}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-pw-pen" />
    <path d="M15 5l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-pw-cross" />
    <line x1="2" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-pw-trail" />
  </svg>
);

/** Animated link icon — two arcs draw on hover with stagger. */
export const AnimatedLinkIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-link-icon ${className}`} style={style}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-link-arc1" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animated-link-arc2" />
  </svg>
);

/** Animated clock icon — circle draws on, then hour + minute hands sweep around the clock. */
export const AnimatedClockIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animated-clock-icon ${className}`} style={style}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="animated-clock-face" />
    <line x1="12" y1="12" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-clock-hour" />
    <line x1="12" y1="12" x2="15" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animated-clock-minute" />
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

export const AlertTriangleIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Loader2Icon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={`animate-spin ${className}`} style={style}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

export const BookOpenIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DatabaseIcon: React.FC<IconProps> = ({ width = 24, height = 24, color = 'currentColor', className = '', style = {} }) => (
  <svg viewBox="0 0 24 24" fill="none" width={width} height={height} color={color} className={className} style={style}>
    <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="2" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" stroke="currentColor" strokeWidth="2" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" stroke="currentColor" strokeWidth="2" />
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
