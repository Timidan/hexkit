import React from 'react';

import '../../styles/SharedComponents.css';

type ClickEvent = React.MouseEvent<HTMLButtonElement, MouseEvent>;

export interface InlineActionButtonProps {
  icon: React.ReactNode;
  ariaLabel: string;
  tooltip?: string;
  title?: string;
  size?: number;
  className?: string;
  disabled?: boolean;
  isActive?: boolean;
  stopPropagation?: boolean;
  onClick?: (event: ClickEvent) => void;
  style?: React.CSSProperties;
}

const InlineActionButton: React.FC<InlineActionButtonProps> = ({
  icon,
  ariaLabel,
  tooltip,
  title,
  size = 36,
  className = '',
  disabled = false,
  isActive = false,
  stopPropagation = false,
  onClick,
  style,
}) => {
  const handleClick = (event: ClickEvent) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (stopPropagation) {
      event.stopPropagation();
    }
    onClick?.(event);
  };

  const resolvedTitle = title ?? tooltip ?? ariaLabel;

  return (
    <button
      type="button"
      className={`inline-copy-icon inline-action-icon${isActive ? ' is-active' : ''} ${className}`.trim()}
      aria-label={ariaLabel}
      title={resolvedTitle}
      onClick={handleClick}
      disabled={disabled}
      style={{ '--inline-copy-size': `${size}px`, ...style } as React.CSSProperties}
    >
      {icon}
    </button>
  );
};

export default InlineActionButton;
