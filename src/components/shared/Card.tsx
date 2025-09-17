import React from 'react';
import '../../styles/SharedComponents.css';

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  variant?: 'default' | 'elevated' | 'glass' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  className = '',
  variant = 'default',
  padding = 'md',
  hoverable = false,
  onClick,
  style
}) => {
  const classes = [
    'shared-card',
    `shared-card-${variant}`,
    `shared-card-padding-${padding}`,
    (onClick || hoverable) ? 'shared-card-hoverable' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={classes}
      onClick={onClick}
      style={style}
    >
      {(title || subtitle) && (
        <div className="shared-card-header">
          {title && (
            <h3 className="shared-card-title">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="shared-card-subtitle">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;