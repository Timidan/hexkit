import React, { useState, useCallback, createContext, useContext } from 'react';
import InPageNotification, { type NotificationProps } from './InPageNotification';

interface NotificationContextType {
  showNotification: (notification: Omit<NotificationProps, 'id'>) => void;
  showSuccess: (title: string, message: string, duration?: number) => void;
  showError: (title: string, message: string, duration?: number) => void;
  showWarning: (title: string, message: string, duration?: number) => void;
  showInfo: (title: string, message: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationProps[]>([]);

  const showNotification = useCallback((notification: Omit<NotificationProps, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: NotificationProps = {
      ...notification,
      id,
      duration: notification.duration ?? 5000 // Default 5 seconds
    };

    setNotifications(prev => [...prev, newNotification]);
  }, []);

  const showSuccess = useCallback((title: string, message: string, duration = 5000) => {
    showNotification({ type: 'success', title, message, duration });
  }, [showNotification]);

  const showError = useCallback((title: string, message: string, duration = 8000) => {
    showNotification({ type: 'error', title, message, duration });
  }, [showNotification]);

  const showWarning = useCallback((title: string, message: string, duration = 6000) => {
    showNotification({ type: 'warning', title, message, duration });
  }, [showNotification]);

  const showInfo = useCallback((title: string, message: string, duration = 5000) => {
    showNotification({ type: 'info', title, message, duration });
  }, [showNotification]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const value: NotificationContextType = {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      
      {/* Render notifications */}
      <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 10000 }}>
        {notifications.map((notification, index) => (
          <div
            key={notification.id}
            style={{
              marginBottom: '12px',
              transform: `translateY(${index * 80}px)`
            }}
          >
            <InPageNotification
              notification={notification}
              onDismiss={dismissNotification}
            />
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;