import React from 'react';

interface DiamondFacetLoadingModalProps {
  isOpen: boolean;
  progress: {
    current: number;
    total: number;
    currentFacet: string;
    status: 'fetching' | 'completed' | 'error';
  };
  onClose: () => void;
}

export const DiamondFacetLoadingModal: React.FC<DiamondFacetLoadingModalProps> = ({
  isOpen,
  progress,
  onClose
}) => {
  if (!isOpen) return null;

  const progressPercentage = (progress.current / progress.total) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          padding: '32px',
          minWidth: '400px',
          maxWidth: '500px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#ffffff',
              marginBottom: '8px',
            }}
          >
            �� Fetching Diamond Facets
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#9ca3af',
            }}
          >
            Loading facet information from multiple sources...
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: '#ffffff',
                fontWeight: '500',
              }}
            >
              Progress
            </span>
            <span
              style={{
                fontSize: '14px',
                color: '#9ca3af',
              }}
            >
              {progress.current} / {progress.total}
            </span>
          </div>
          
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercentage}%`,
                height: '100%',
                backgroundColor: '#8b5cf6',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Current Facet */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '4px',
            }}
          >
            Current Facet:
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#ffffff',
              fontFamily: 'monospace',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {progress.currentFacet}
          </div>
        </div>

        {/* Status */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '4px',
            }}
          >
            Status:
          </div>
          <div
            style={{
              fontSize: '14px',
              color: progress.status === 'error' ? '#ef4444' : '#10b981',
              fontWeight: '500',
            }}
          >
            {progress.status === 'fetching' && '🔄 Fetching ABI...'}
            {progress.status === 'completed' && '✅ Completed'}
            {progress.status === 'error' && '❌ Error occurred'}
          </div>
        </div>

        {/* Close Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
