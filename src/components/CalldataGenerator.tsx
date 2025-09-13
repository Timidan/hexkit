import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Sparkles, Lightbulb, FileText, Zap, TrendingUp, Settings, Copy, Rocket, CheckCircle, Building2, Code2, Hash, Search } from 'lucide-react';
import ABIFetcher from './ABIFetcher';
import EnhancedStructInput from './EnhancedStructInput';
import AdvancedJsonEditor from './AdvancedJsonEditor';
import EnhancedError from './EnhancedError';
import AnimatedInput from './ui/AnimatedInput';
import AnimatedButton from './ui/AnimatedButton';
import { useToolkit } from '../contexts/ToolkitContext';
import '../styles/EnhancedStructInput.css';
import '../styles/AdvancedJsonEditor.css';
import '../styles/AnimatedInput.css';
import '../styles/AnimatedButton.css';

const CalldataGenerator: React.FC = () => {
  const toolkit = useToolkit();
  
  // Component state
  const [abi, setAbi] = useState('');
  const [selectedFunction, setSelectedFunction] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [structuredInputs, setStructuredInputs] = useState<any[]>([]);
  const [inputMethod, setInputMethod] = useState<'enhanced' | 'json' | 'simple'>('json');
  const [calldata, setCalldata] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [showTransferOptions, setShowTransferOptions] = useState(false);
  const [selectedContract, setSelectedContract] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);

  const generateCalldata = () => {
    try {
      const iface = new ethers.utils.Interface(abi);
      
      let args: any[];
      
      if ((inputMethod === 'enhanced' || inputMethod === 'json') && structuredInputs.length > 0) {
        // Use the structured inputs from EnhancedStructInput or AdvancedJsonEditor
        args = structuredInputs;
      } else {
        // Fallback to legacy input parsing
        const func = JSON.parse(abi).find(
          (f: any) => f.name === selectedFunction
        );

        args = func.inputs.map((input: any) => {
          const value = inputs[input.name] || '';
          if (input.type.includes('uint')) return value || '0';
          if (input.type === 'bool') return value === 'true';
          return value;
        });
      }

      const encoded = iface.encodeFunctionData(selectedFunction, args);
      setCalldata(encoded);
      setError(null);

      // Share generated data with toolkit context
      if (contractAddress) {
        toolkit.setGeneratedCalldata({
          contractAddress,
          functionName: selectedFunction,
          calldata: encoded,
          abi: JSON.parse(abi),
          parameters: inputs,
        });
        setShowTransferOptions(true);
        
        // Add to recent addresses
        if (!recentAddresses.includes(contractAddress)) {
          setRecentAddresses([contractAddress, ...recentAddresses.slice(0, 4)]);
        }
      }
    } catch (e: any) {
      setError(e.message);
      setCalldata('');
      setShowTransferOptions(false);
    }
  };

  const handleTransferToBuilder = () => {
    if (toolkit.lastGeneratedCalldata) {
      toolkit.transferToTransactionBuilder(toolkit.lastGeneratedCalldata);
      setShowTransferOptions(false);
    }
  };

  const handleTestInDecoder = () => {
    // Navigate to decoder - we could enhance this to pre-populate calldata
    toolkit.navigateToDecoder();
    setShowTransferOptions(false);
  };

  const handleContractSelect = (contractKey: string) => {
    if (contractKey === '') {
      // Clear selection
      setSelectedContract('');
      return;
    }

    const contract = toolkit.recentContractData.find((_, index) => 
      `${_.address}_${index}` === contractKey
    );

    if (contract) {
      setSelectedContract(contractKey);
      setContractAddress(contract.address);
      setAbi(JSON.stringify(contract.abi, null, 2));
      // Reset function selection when contract changes
      setSelectedFunction('');
      setInputs({});
      setCalldata('');
      setShowTransferOptions(false);
    }
  };

  return (
    <div className="calldata-generator">
      <h2 style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '24px',
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: '24px'
      }}>
        <Code2 size={28} />
        Generate Calldata
      </h2>

      {/* Contract Selector Section */}
      <div className="form-section">
        <h3 style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '16px',
          fontWeight: '600',
          color: '#374151',
          marginBottom: '16px'
        }}>
          <Building2 size={18} />
          Contract Selection
        </h3>
        {toolkit.recentContractData.length > 0 ? (
          <div className="input-group vertical">
            <label>Select from Recent Contracts</label>
            <select
              value={selectedContract}
              onChange={(e) => handleContractSelect(e.target.value)}
              style={{
                background: 'rgba(76, 175, 80, 0.1)',
                border: '1px solid rgba(76, 175, 80, 0.3)',
                borderRadius: '6px',
              }}
            >
              <option value="">Choose from imported contracts...</option>
              {toolkit.recentContractData.map((contract, index) => {
                const contractKey = `${contract.address}_${index}`;
                const shortAddress = `${contract.address.slice(0, 6)}...${contract.address.slice(-4)}`;
                const functionCount = contract.functions ? contract.functions.length : 
                  contract.abi.filter((item: any) => item.type === 'function').length;
                
                return (
                  <option key={contractKey} value={contractKey}>
                    {contract.name || 'Unnamed Contract'} - {shortAddress} ({functionCount} functions)
                  </option>
                );
              })}
            </select>
            <small><Sparkles size={14} className="inline mr-1" />Contracts from Signature Database uploads</small>
          </div>
        ) : (
          <div className="card" style={{ 
            background: 'rgba(33, 150, 243, 0.1)', 
            border: '1px solid rgba(33, 150, 243, 0.3)'
          }}>
            <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)' }}>
              <Lightbulb size={16} className="inline mr-2" /><strong>Tip:</strong> Upload contract artifacts in{' '}
              <button 
                onClick={() => window.location.href = '/database'}
                className="control-btn"
              >
                Signature Database
              </button>
              {' '}to quickly select contracts here
            </p>
          </div>
        )}
      </div>

      {/* Manual Contract Setup Section */}
      <div className="form-section">
        <h3 style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '16px',
          fontWeight: '600',
          color: '#374151',
          marginBottom: '16px'
        }}>
          <Settings size={18} />
          Manual Contract Setup
        </h3>
        
        {toolkit.recentContractData.length > 0 && (
          <div className="action-bar">
            <span className="title">Alternative Setup</span>
            <div className="actions">
              <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.5)' }}>OR use manual setup below</span>
            </div>
          </div>
        )}

        <ABIFetcher onABIFetched={(fetchedAbi) => {
          setAbi(fetchedAbi);
          // Clear selected contract when ABI is fetched from external source
          if (selectedContract) {
            setSelectedContract('');
          }
        }} />

        <div className="input-group vertical">
          <AnimatedInput
            label="Contract Address"
            value={contractAddress}
            onChange={setContractAddress}
            type="text"
            placeholder="0x1234567890abcdef1234567890abcdef12345678"
            icon={<Building2 size={20} />}
            className={selectedContract ? 'contract-selected' : ''}
          />
          {selectedContract && (
            <div className="input-helper success">
              ✅ Populated from selected contract
            </div>
          )}
          {!selectedContract && contractAddress && (
            <div className="input-helper info">
              <Lightbulb size={16} className="inline mr-2" />This address will be used for Transaction Builder integration
            </div>
          )}

          <AnimatedInput
            label="Contract ABI"
            value={abi}
            onChange={(value) => {
              setAbi(value);
              if (selectedContract) {
                setSelectedContract('');
              }
            }}
            type="textarea"
            placeholder='[{"inputs":[],"name":"myFunction","outputs":[],"type":"function"}]'
            rows={8}
            icon={<Code2 size={20} />}
            className={selectedContract ? 'contract-selected' : ''}
          />
          {selectedContract && (
            <div className="input-helper success">
              ✅ ABI loaded from selected contract
            </div>
          )}
        </div>
      </div>

      {/* Function Selection and Input Method */}
      {abi && (
        <div className="form-section">
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '16px'
          }}>
            <Zap size={18} />
            Function Configuration
          </h3>
          
          <div className="input-group vertical">
            <label>Select Function</label>
            <select
              value={selectedFunction}
              onChange={(e) => {
                setSelectedFunction(e.target.value);
                const func = JSON.parse(abi).find(
                  (f: any) => f.name === e.target.value
                );
                if (func) {
                  const newInputs: Record<string, string> = {};
                  func.inputs.forEach((input: any) => {
                    newInputs[input.name] = '';
                  });
                  setInputs(newInputs);
                }
              }}
            >
              <option value="">Choose function...</option>
              {abi &&
                JSON.parse(abi)
                  .filter((item: any) => item.type === 'function')
                  .map((func: any) => (
                    <option key={func.name} value={func.name}>
                      {func.name}
                    </option>
                  ))}
            </select>
          </div>

          {selectedFunction && (
            <div className="action-bar">
              <span className="title">Input Method</span>
              <div className="actions button-group">
                <button
                  className={inputMethod === 'json' ? 'active' : ''}
                  onClick={() => setInputMethod('json')}
                >
                  <FileText size={16} className="inline mr-2" />JSON Editor
                </button>
                <button
                  className={inputMethod === 'enhanced' ? 'active' : ''}
                  onClick={() => setInputMethod('enhanced')}
                >
                  <Building2 size={16} className="inline mr-2" />Structured Input
                </button>
                <button
                  className={inputMethod === 'simple' ? 'active' : ''}
                  onClick={() => setInputMethod('simple')}
                >
                  <Zap size={16} className="inline mr-2" />Simple Input
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedFunction && inputMethod === 'json' && (
        <AdvancedJsonEditor
          data={structuredInputs}
          onChange={setStructuredInputs}
          functionInputs={abi ? JSON.parse(abi).find((f: any) => f.name === selectedFunction)?.inputs || [] : []}
          title="Function Parameters"
          className="calldata-json-editor"
        />
      )}

      {selectedFunction && inputMethod === 'enhanced' && (
        <EnhancedStructInput
          abi={abi ? JSON.parse(abi) : []}
          functionName={selectedFunction}
          onDataChange={setStructuredInputs}
          initialData={structuredInputs}
        />
      )}

      {/* Parameter Input Section */}
      {selectedFunction && (
        <div className="form-section">
          <h3>📝 Function Parameters</h3>
          
          {inputMethod === 'simple' && (
            <div className="grid-container grid-auto">
              {Object.keys(inputs).map((name) => {
                const func = JSON.parse(abi).find((f: any) => f.name === selectedFunction);
                const input = func?.inputs?.find((i: any) => i.name === name);
                const inputType = input?.type || 'string';
                
                return (
                  <AnimatedInput
                    key={name}
                    label={`${name} (${inputType})`}
                    value={inputs[name]}
                    onChange={(value) => setInputs({ ...inputs, [name]: value })}
                    type="text"
                    placeholder={inputType.includes('uint') ? '0' : inputType === 'bool' ? 'true/false' : `Enter ${inputType} value`}
                    icon={<Hash size={20} />}
                  />
                );
              })}
            </div>
          )}

          <div className="button-group center">
            <AnimatedButton
              onClick={generateCalldata}
              disabled={!abi || !selectedFunction}
              variant="primary"
              size="lg"
              icon={<Rocket size={20} />}
              fullWidth
            >
              Generate Calldata
            </AnimatedButton>
          </div>
        </div>
      )}

      {/* Enhanced Error Display */}
      {error && (
        <EnhancedError
          error={error}
          title="Calldata Generation Failed"
          canRetry={true}
          onRetry={() => {
            setError(null);
            generateCalldata();
          }}
          suggestions={[
            {
              action: 'Check your ABI format',
              description: 'Make sure the ABI is valid JSON with proper function definitions',
              onClick: () => setError(null)
            },
            {
              action: 'Verify function parameters',
              description: 'Ensure all required parameters are filled with valid values',
            }
          ]}
        />
      )}

      {calldata && (
        <div className="result enhanced">
          <div className="result-header">
            <h3 style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '8px'
            }}>
              <CheckCircle size={18} style={{ color: '#22c55e' }} />
              Generated Calldata
            </h3>
            <div className="result-stats">
              <span className="stat"><TrendingUp size={16} className="inline mr-2" />{(calldata.length - 2) / 2} bytes</span>
              <span className="stat"><Settings size={16} className="inline mr-2" />{selectedFunction}</span>
            </div>
          </div>
          
          <div className="result-content">
            <div className="calldata-display">
              <code className="calldata-value">{calldata}</code>
              <button 
                onClick={() => navigator.clipboard.writeText(calldata)}
                className="copy-result-btn"
                title="Copy calldata"
              >
                <Copy size={16} />
              </button>
            </div>
            
            <div className="result-breakdown">
              <div className="breakdown-item">
                <span className="breakdown-label">Function Selector:</span>
                <code className="breakdown-value">{calldata.slice(0, 10)}</code>
              </div>
              {calldata.length > 10 && (
                <div className="breakdown-item">
                  <span className="breakdown-label">Parameters:</span>
                  <code className="breakdown-value">{calldata.slice(10)}</code>
                </div>
              )}
            </div>
          </div>
          
          {/* Enhanced Transfer Options */}
          {showTransferOptions && (
            <div className="form-section">
              <h3 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '16px'
              }}>
                <Rocket size={18} />
                Next Steps
              </h3>
              <div className="card-grid">
                <button 
                  onClick={handleTransferToBuilder}
                  className="card transfer-card primary"
                >
                  <div className="transfer-icon">
                    <Building2 size={20} />
                  </div>
                  <div className="transfer-content">
                    <div className="transfer-title">Build Transaction</div>
                    <div className="transfer-desc">Execute this function call on-chain</div>
                  </div>
                </button>
                <button 
                  onClick={handleTestInDecoder}
                  className="card transfer-card secondary"
                >
                  <div className="transfer-icon">
                    <Search size={20} />
                  </div>
                  <div className="transfer-content">
                    <div className="transfer-title">Verify in Decoder</div>
                    <div className="transfer-desc">Double-check the generated calldata</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalldataGenerator;