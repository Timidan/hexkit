import React, { useState, useEffect } from 'react';
import { XCloseIcon, CheckIcon, ExclamationIcon, InfoIcon } from './icons/IconLibrary';

export interface NotificationProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number; // Auto-dismiss after ms (0 = no auto-dismiss)
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface InPageNotificationProps {
  notification: NotificationProps;
  onDismiss: (id: string) => void;
}

const InPageNotification: React.FC<InPageNotificationProps> = ({
  notification,
  onDismiss
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Fade in animation
    setTimeout(() => setIsVisible(true), 50);

    // Auto-dismiss
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300);
  };

  const getTypeStyles = () => {
    switch (notification.type) {
      case 'success':
        return {
          border: '1px solid #22c55e',
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
          iconColor: '#22c55e'
        };
      case 'error':
        return {
          border: '1px solid #ef4444',
          background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
          iconColor: '#ef4444'
        };
      case 'warning':
        return {
          border: '1px solid #f59e0b',
          background: 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
          iconColor: '#f59e0b'
        };
      case 'info':
        return {
          border: '1px solid #3b82f6',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
          iconColor: '#3b82f6'
        };
      default:
        return {
          border: '1px solid #333',
          background: 'linear-gradient(135deg, #111 0%, #1a1a1a 100%)',
          iconColor: '#9ca3af'
        };
    }
  };

  const getTypeIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckIcon width={20} height={20} />;
      case 'error':
        return <XCloseIcon width={20} height={20} />;
      case 'warning':
        return <ExclamationIcon width={20} height={20} />;
      case 'info':
        return <InfoIcon width={20} height={20} />;
      default:
        return <InfoIcon width={20} height={20} />;
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        minWidth: '320px',
        maxWidth: '420px',
        width: 'fit-content',
        ...typeStyles,
        borderRadius: '8px',
        padding: '16px',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        zIndex: 10000,
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 6px 20px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
        transform: `translateX(${isVisible && !isExiting ? '0' : '100%'}) scale(${isVisible && !isExiting ? '1' : '0.95'})`,
        opacity: isVisible && !isExiting ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <div style={{ color: typeStyles.iconColor, flexShrink: 0, marginTop: '2px' }}>
          {getTypeIcon()}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '15px',
            fontWeight: 600,
            marginBottom: '4px',
            color: '#fff'
          }}>
            {notification.title}
          </div>
          
          <div style={{
            fontSize: '13px',
            lineHeight: '1.4',
            color: '#e5e7eb',
            marginBottom: notification.action ? '12px' : '0',
            wordWrap: 'break-word',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            maxWidth: '100%',
            whiteSpace: 'pre-wrap'
          }}>
            {notification.message}
          </div>
          
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                padding: '6px 12px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {notification.action.label}
            </button>
          )}
        </div>
        
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9ca3af';
            e.currentTarget.style.background = 'none';
          }}
        >
          <XCloseIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
};

export default InPageNotification;