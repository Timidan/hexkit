import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet, Zap } from 'lucide-react';
import GlassButton from './ui/GlassButton';

interface RainbowKitWalletProps {
  className?: string;
}

const RainbowKitWallet: React.FC<RainbowKitWalletProps> = ({ className = '' }) => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === 'authenticated');

        return (
          <div
            className={className}
            {...(!ready && {
              'aria-hidden': true,
              'style': {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <GlassButton
                    onClick={openConnectModal}
                    variant="primary"
                    size="md"
                    icon={<Wallet size={18} />}
                    style={{ minWidth: '160px' }}
                  >
                    Connect Wallet
                  </GlassButton>
                );
              }

              if (chain.unsupported) {
                return (
                  <GlassButton
                    onClick={openChainModal}
                    variant="danger"
                    size="md"
                    icon={<Zap size={18} />}
                    style={{ minWidth: '160px' }}
                  >
                    Wrong network
                  </GlassButton>
                );
              }

              return (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Network Indicator */}
                  <button
                    onClick={openChainModal}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backdropFilter: 'blur(10px)',
                    }}
                    type="button"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 18, height: 18 }}
                          />
                        )}
                      </div>
                    )}
                    {chain.name}
                  </button>

                  {/* Wallet Address - Prominent like Uniswap */}
                  <button 
                    onClick={openAccountModal} 
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
                      border: '1px solid rgba(102, 126, 234, 0.3)',
                      borderRadius: '12px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backdropFilter: 'blur(10px)',
                      minWidth: '160px',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Connection Status Indicator */}
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#22c55e',
                          boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
                        }}
                      />
                      
                      {/* Wallet Icon */}
                      <Wallet size={16} />
                      
                      {/* Address */}
                      <span style={{ 
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                        color: '#e2e8f0'
                      }}>
                        {account.displayName}
                      </span>
                    </div>
                    
                    {/* Balance */}
                    {account.displayBalance && (
                      <span style={{
                        fontSize: '12px',
                        color: '#94a3b8',
                        fontWeight: '500',
                        fontFamily: 'monospace',
                      }}>
                        {account.displayBalance}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default RainbowKitWallet;