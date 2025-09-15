import React from 'react';

interface FacetLoadingModalProps {
  isOpen: boolean;
  progress: {
    current: number;
    total: number;
    currentFacet: string;
    status: 'fetching' | 'success' | 'error';
  };
  onClose: () => void;
}

export const FacetLoadingModal: React.FC<FacetLoadingModalProps> = ({
  isOpen,
  progress,
  onClose
}) => {
  if (!isOpen) return null;

    // Add safety checks for progress data
  const safeProgress = {
    current: Math.max(0, progress?.current || 0),
    total: Math.max(1, progress?.total || 1),
    currentFacet: progress?.currentFacet || "Loading...",
    status: progress?.status || "fetching"
  };

  const progressPercentage = safeProgress.total > 0 ? (safeProgress.current / safeProgress.total) * 100 : 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        padding: '32px',
        minWidth: '400px',
        maxWidth: '500px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
            wordBreak: 'break-all'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          <h3 style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: '600',
            margin: 0
          }}>
            Loading Diamond Facets
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* Progress Info */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{ color: '#888', fontSize: '14px' }}>
              Progress
            </span>
            <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: '500' }}>
              {safeProgress.current} / {safeProgress.total}
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, progressPercentage))}%`,
              height: '100%',
              backgroundColor: '#6366f1',
              borderRadius: '4px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Current Facet */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            color: '#888',
            fontSize: '14px',
            marginBottom: '8px'
          }}>
            Current Facet
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: '14px',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            wordBreak: 'break-all'
          }}>
            {safeProgress.currentFacet}
          </div>
        </div>

        {/* Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: safeProgress.status === 'success' ? '#10b981' : 
                           safeProgress.status === 'error' ? '#ef4444' : '#6366f1',
            animation: safeProgress.status === 'fetching' ? 'pulse 1.5s ease-in-out infinite' : 'none'
          }} />
          <span style={{
            color: safeProgress.status === 'success' ? '#10b981' : 
                   safeProgress.status === 'error' ? '#ef4444' : '#6366f1',
            fontSize: '14px',
            fontWeight: '500',
            textTransform: 'capitalize'
          }}>
            {safeProgress.status}
          </span>
        </div>

        {/* Loading Animation */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    </div>
  );
};
