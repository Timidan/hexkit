import React, { useState } from 'react';
import { ChevronDown, Settings, Play } from 'lucide-react';

const SimpleGridUI: React.FC = () => {
  const [contractSource, setContractSource] = useState<'project' | 'address'>('project');
  const [functionMode, setFunctionMode] = useState<'function' | 'raw'>('function');
  const [usePendingBlock, setUsePendingBlock] = useState(true);

  const cardStyle = {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px'
  };

  const headerStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '8px'
  };

  const subHeaderStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#fff',
    marginBottom: '20px'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '30px',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    marginBottom: '8px'
  };

  const buttonStyle = {
    padding: '12px 20px',
    background: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  };

  const selectionCardStyle = (isSelected: boolean) => ({
    padding: '16px',
    background: isSelected ? '#1e40af20' : '#2a2a2a',
    border: `2px solid ${isSelected ? '#007bff' : '#555'}`,
    borderRadius: '10px',
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'all 0.2s ease'
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: '20px' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={headerStyle}>New Simulation</h1>
        <p style={{ color: '#888', fontSize: '16px' }}>Configure and simulate blockchain transactions</p>
      </div>

      {/* Main Grid */}
      <div style={gridStyle}>
        
        {/* LEFT COLUMN - Contract */}
        <div style={cardStyle}>
          <h2 style={subHeaderStyle}>🔧 Contract</h2>
          
          {/* Contract Source Selection */}
          <div style={{ marginBottom: '24px' }}>
            <div 
              style={selectionCardStyle(contractSource === 'project')}
              onClick={() => setContractSource('project')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  border: '2px solid #007bff',
                  background: contractSource === 'project' ? '#007bff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {contractSource === 'project' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>}
                </div>
                <div>
                  <div style={{ fontWeight: '500' }}>Select from Project</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>Choose from saved contracts</div>
                </div>
              </div>
            </div>

            <div 
              style={selectionCardStyle(contractSource === 'address')}
              onClick={() => setContractSource('address')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  border: '2px solid #007bff',
                  background: contractSource === 'address' ? '#007bff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {contractSource === 'address' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>}
                </div>
                <div>
                  <div style={{ fontWeight: '500' }}>Insert any address</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>Enter contract address manually</div>
                </div>
              </div>
            </div>
          </div>

          {/* Contract Input */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <select style={{ ...inputStyle, flex: 1 }}>
              <option>Diamond</option>
              <option>ERC20 Token</option>
              <option>NFT Contract</option>
            </select>
            <button style={buttonStyle}>Edit source</button>
          </div>

          {/* Function Mode Selection */}
          <div style={{ marginBottom: '24px' }}>
            <div 
              style={selectionCardStyle(functionMode === 'function')}
              onClick={() => setFunctionMode('function')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  border: '2px solid #9333ea',
                  background: functionMode === 'function' ? '#9333ea' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {functionMode === 'function' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>}
                </div>
                <div>
                  <div style={{ fontWeight: '500' }}>Choose function and parameters</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>Select from ABI functions</div>
                </div>
              </div>
            </div>

            <div 
              style={selectionCardStyle(functionMode === 'raw')}
              onClick={() => setFunctionMode('raw')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  border: '2px solid #9333ea',
                  background: functionMode === 'raw' ? '#9333ea' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {functionMode === 'raw' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>}
                </div>
                <div>
                  <div style={{ fontWeight: '500' }}>Enter raw input data</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>Provide calldata directly</div>
                </div>
              </div>
            </div>
          </div>

          {/* Function Selection */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <select style={{ ...inputStyle, flex: 1 }}>
              <option>Select function</option>
              <option>transfer(address,uint256)</option>
              <option>approve(address,uint256)</option>
              <option>balanceOf(address)</option>
            </select>
            <button style={{ ...buttonStyle, background: '#9333ea' }}>Edit ABI</button>
          </div>
        </div>

        {/* RIGHT COLUMN - Transaction Parameters */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={subHeaderStyle}>⚡ Transaction Parameters</h2>
            <Settings size={20} style={{ color: '#888', cursor: 'pointer' }} />
          </div>

          {/* Use Pending Block */}
          <div style={{ 
            padding: '16px', 
            background: '#2a2a2a', 
            borderRadius: '10px', 
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: '500', marginBottom: '4px' }}>Use Pending Block</div>
              <div style={{ fontSize: '12px', color: '#888' }}>Simulate against pending state</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={usePendingBlock}
                onChange={(e) => setUsePendingBlock(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <div style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: usePendingBlock ? '#22c55e' : '#6b7280',
                transition: '0.4s',
                borderRadius: '24px'
              }}>
                <div style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: usePendingBlock ? '23px' : '3px',
                  bottom: '3px',
                  backgroundColor: '#fff',
                  transition: '0.4s',
                  borderRadius: '50%'
                }}></div>
              </div>
            </label>
          </div>

          {/* Parameters Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Block Number</label>
              <input type="text" placeholder="Latest" style={inputStyle} />
              <div style={{ fontSize: '12px', color: '#888' }}>Current: 30930267</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Tx Index</label>
              <input type="text" placeholder="0" style={inputStyle} />
              <div style={{ fontSize: '12px', color: '#888' }}>Max: 14</div>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>From Address</label>
            <input 
              type="text" 
              defaultValue="0x0000000000000000000000000000000000000000" 
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Gas Limit</label>
              <input type="text" defaultValue="800000" style={inputStyle} />
              <button style={{ fontSize: '12px', color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer' }}>
                Use custom gas value
              </button>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Gas Price</label>
              <input type="text" defaultValue="0" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Value (ETH)</label>
            <input type="text" defaultValue="0" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Advanced Options */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
          
          <div style={cardStyle}>
            <h3 style={{ ...subHeaderStyle, fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              🔶 Block Header Overrides
              <ChevronDown size={16} style={{ color: '#888' }} />
            </h3>
            <div style={{ fontSize: '14px', color: '#888', textAlign: 'center', padding: '20px 0' }}>
              Click to configure
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ ...subHeaderStyle, fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              🗄️ State Overrides
              <ChevronDown size={16} style={{ color: '#888' }} />
            </h3>
            <div style={{ fontSize: '14px', color: '#888', textAlign: 'center', padding: '20px 0' }}>
              No state overrides configured
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ ...subHeaderStyle, fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              🛡️ Access Lists
              <ChevronDown size={16} style={{ color: '#888' }} />
            </h3>
            <div style={{ fontSize: '14px', color: '#888', textAlign: 'center', padding: '20px 0' }}>
              No access lists configured
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div style={{ textAlign: 'center' }}>
        <button style={{
          padding: '16px 48px',
          background: 'linear-gradient(135deg, #007bff 0%, #9333ea 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 20px rgba(0, 123, 255, 0.3)'
        }}>
          <Play size={20} />
          Simulate Transaction
        </button>
      </div>
    </div>
  );
};

export default SimpleGridUI;