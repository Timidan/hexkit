import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet } from '@phosphor-icons/react';
import { Button } from './ui/button';

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

        const hiddenState = ready
          ? {}
          : {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              } as React.CSSProperties,
            };

        const content = (() => {
          if (!connected) {
            return (
              <Button
                type="button"
                variant="icon-borderless"
                size="icon-inline"
                className="rainbowkit-connect-btn wallet-icon-inline wallet-icon-inline--disconnected"
                onClick={openConnectModal}
                aria-label="Connect wallet"
                title="Connect wallet"
              >
                <Wallet size={18} />
              </Button>
            );
          }

          const displayLabel = account.displayName;
          const truncatedAddress = account.address
            ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
            : displayLabel;
          const currentChainName = chain?.name ?? 'Unknown network';
          const balanceLabel = account.displayBalance
            ? ` · ${account.displayBalance}`
            : '';

          if (chain.unsupported) {
            return (
              <Button
                type="button"
                variant="icon-borderless"
                size="icon-inline"
                className="wallet-icon-inline wallet-icon-inline--unsupported"
                onClick={openChainModal}
                aria-label="Switch network"
                title={`Unsupported network · ${currentChainName}. Click to switch.`}
              >
                <Wallet size={18} />
              </Button>
            );
          }

          return (
            <>
              <div className="wallet-inline-info">
                <span className="wallet-inline-address">{truncatedAddress}</span>
                <span className="wallet-inline-network">{currentChainName}</span>
              </div>
              <Button
                type="button"
                variant="icon-borderless"
                size="icon-inline"
                className="wallet-icon-inline wallet-icon-inline--connected"
                onClick={openAccountModal}
                aria-label={`Wallet connected · ${displayLabel}`}
                title={`Wallet connected · ${displayLabel}${balanceLabel}`}
              >
                <Wallet size={18} />
              </Button>
            </>
          );
        })();

        return (
          <div className={`${className} wallet-inline-wrapper`.trim()} {...hiddenState}>
            {content}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default RainbowKitWallet;
