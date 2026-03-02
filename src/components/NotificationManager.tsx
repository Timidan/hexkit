import React, { useCallback, createContext, useContext } from 'react';
import { toast } from 'sonner';
import { Toaster } from './ui/sonner';

interface NotificationOptions {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextType {
  showNotification: (notification: NotificationOptions) => void;
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

// Re-export toast for direct usage (e.g. toast.promise, toast.loading)
export { toast };

const toastByType = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
} as const;

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const showNotification = useCallback((notification: NotificationOptions) => {
    const fn = toastByType[notification.type] ?? toast;
    fn(notification.title, {
      description: notification.message,
      duration: notification.duration,
      action: notification.action
        ? { label: notification.action.label, onClick: notification.action.onClick }
        : undefined,
    });
  }, []);

  const showSuccess = useCallback((title: string, message: string, duration = 5000) => {
    toast.success(title, { description: message, duration });
  }, []);

  const showError = useCallback((title: string, message: string, duration = 8000) => {
    toast.error(title, { description: message, duration });
  }, []);

  const showWarning = useCallback((title: string, message: string, duration = 6000) => {
    toast.warning(title, { description: message, duration });
  }, []);

  const showInfo = useCallback((title: string, message: string, duration = 5000) => {
    toast.info(title, { description: message, duration });
  }, []);

  const value: NotificationContextType = {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toaster />
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
