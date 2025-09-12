import React from 'react'
import { useWeb3Modal } from '@web3modal/wagmi/react'

interface Web3ModalButtonProps {
  className?: string
  style?: React.CSSProperties
}

const Web3ModalButton: React.FC<Web3ModalButtonProps> = ({ className, style }) => {
  const { open } = useWeb3Modal()

  return (
    <button
      onClick={() => open()}
      className={className}
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '12px 20px',
        fontSize: '16px',
        fontWeight: '600',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'transform 0.2s',
        ...style,
      }}
    >
      <span style={{ fontSize: '20px' }}>🚀</span>
      <span>Connect with Web3Modal</span>
    </button>
  )
}

export default Web3ModalButton