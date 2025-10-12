import React from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { formatAddress } from '../utils/walletDetection'
import { SUPPORTED_CHAINS } from '../utils/chains'
import Web3ModalButton from './Web3ModalButton'
import InlineActionButton from './ui/InlineActionButton'
import { XCloseIcon } from './icons/IconLibrary'

interface WalletConnectionNewProps {
  onWalletConnect?: (walletInfo: any) => void
  onWalletDisconnect?: () => void
}

const WalletConnectionNew: React.FC<WalletConnectionNewProps> = ({
  onWalletConnect,
  onWalletDisconnect,
}) => {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { open } = useWeb3Modal()

  // Notify parent component of wallet connection changes
  React.useEffect(() => {
    if (isConnected && address && connector) {
      const walletInfo = {
        name: connector.name,
        isInstalled: true,
        isConnected: true,
        accounts: [address],
        chainId: `0x${chainId.toString(16)}`,
        provider: null, // Web3Modal handles provider internally
      }
      onWalletConnect?.(walletInfo)
    } else if (!isConnected) {
      onWalletDisconnect?.()
    }
  }, [isConnected, address, connector, chainId, onWalletConnect, onWalletDisconnect])

  const getChainName = (id: number): string => {
    const chainNames: { [key: number]: string } = {
      1: 'Ethereum Mainnet',
      137: 'Polygon',
      56: 'BSC',
      42161: 'Arbitrum One',
      10: 'Optimism',
      8453: 'Base',
    }
    return chainNames[id] || `Chain ${id}`
  }

  const isWrongChain = (): boolean => {
    return !SUPPORTED_CHAINS.some(chain => chain.id === chainId)
  }

  const handleDisconnect = () => {
    disconnect()
    onWalletDisconnect?.()
  }

  const handleSwitchChain = (targetChainId: number) => {
    switchChain({ chainId: targetChainId as any })
  }

  const openWeb3Modal = () => {
    open()
  }

  if (isConnected && address) {
    return (
      <div className="wallet-connection connected">
        <div className="wallet-info">
          <div className="wallet-header">
            <div className="wallet-details">
              <div className="wallet-name">{connector?.name || 'Connected Wallet'}</div>
              <div className="wallet-address">
                {formatAddress(address)}
              </div>
            </div>
            <InlineActionButton
              ariaLabel="Disconnect wallet"
              tooltip="Disconnect wallet"
              icon={<XCloseIcon width={14} height={14} />}
              onClick={handleDisconnect}
              size={28}
            />
          </div>

          <div className="chain-info">
            <span className="chain-label">Network:</span>
            <span className={`chain-name ${isWrongChain() ? 'wrong-chain' : ''}`}>
              {getChainName(chainId)}
            </span>
          </div>

          {isWrongChain() && (
            <div className="wrong-chain-warning">
              <p>Unsupported network. Please switch to a supported chain:</p>
              <div className="chain-switcher">
                {SUPPORTED_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => handleSwitchChain(chain.id)}
                    className="chain-switch-btn"
                  >
                    {chain.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="connection-error">
            <p style={{ color: '#ff6b6b' }}>{error.message}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="wallet-connection disconnected">
      <h3>Connect Wallet</h3>
      <p>Connect your wallet to build and simulate transactions</p>

      <div className="wallet-list">
        {/* Web3Modal Button */}
        <Web3ModalButton 
          className="wallet-option web3modal-btn"
          style={{ marginBottom: '16px', justifyContent: 'center' }}
        />

        {/* Fallback individual connectors */}
        <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '12px' }}>
          Or connect directly:
        </div>
        
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="wallet-option"
          >
            <span className="wallet-icon">{getWalletIcon(connector.name)}</span>
            <span className="wallet-name">{connector.name}</span>
            {isPending && (
              <span className="connecting">Connecting...</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="connection-error">
          <p style={{ color: '#ff6b6b' }}>{error.message}</p>
        </div>
      )}
    </div>
  )
}

export default WalletConnectionNew
