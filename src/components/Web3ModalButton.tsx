import React from 'react'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import GlassButton from './ui/GlassButton'

interface Web3ModalButtonProps {
  className?: string
  style?: React.CSSProperties
}

const Web3ModalButton: React.FC<Web3ModalButtonProps> = ({ className, style }) => {
  const { open } = useWeb3Modal()

  return (
    <GlassButton
      onClick={() => open()}
      variant="primary"
      size="lg"
      className={className}
      style={style}
      icon={<span style={{ fontSize: '20px' }}>🚀</span>}
    >
      Connect with Web3Modal
    </GlassButton>
  )
}

export default Web3ModalButton